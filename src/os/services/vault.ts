"use client";

/* ============================================================
   Bóveda de contraseñas de axcsOS — cifrada con AES-256-GCM
   ------------------------------------------------------------
   * Guarda credenciales por dominio: { domain, username,
     encryptedPassword } — la contraseña NUNCA en texto plano:
     se cifra con AES-256-GCM (Web Crypto) antes de tocar
     localStorage.
   * La clave se deriva por dispositivo con PBKDF2-SHA256
     (deviceId + sal aleatoria propia de la bóveda) y vive solo
     en memoria (clave no extraíble, jamás en localStorage).
   * Honesto: es cifrado ligado al dispositivo — protege el
     fichero copiado a otra máquina o leído por ojo casual; un
     atacante con control TOTAL de este navegador podría derivar
     la clave (para eso haría falta una contraseña maestra).
   * Consumido por el motor de autocompletado (autofill.ts),
     Safari y Ajustes → Cuenta.
   ============================================================ */

import { useSyncExternalStore } from "react";
import { getDeviceId } from "./auth";

export interface VaultEntry {
  domain: string; // p. ej. "github.com"
  username: string; // correo o usuario
  cipher: string; // contraseña cifrada (b64: iv+texto)
  createdAt: number;
  updatedAt: number;
}

const LS_VAULT = "axcsos.vault.v1";
const LS_VAULT_SALT = "axcsos.vault.salt";
const LS_NEVER = "axcsos.vault.never"; // dominios con "nunca guardar"
const PBKDF2_ITER = 150_000;

/* ---------- persistencia ---------- */

const listeners = new Set<() => void>();
let cache: VaultEntry[] | null = null;

function loadEntries(): VaultEntry[] {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return (cache = []);
  try {
    const raw = localStorage.getItem(LS_VAULT);
    const list = raw ? (JSON.parse(raw) as VaultEntry[]) : [];
    cache = Array.isArray(list) ? list.filter((e) => e && e.domain && e.username && e.cipher) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(LS_VAULT, JSON.stringify(loadEntries()));
  } catch {
    /* cuota llena: vive en memoria esta sesión */
  }
  listeners.forEach((cb) => cb());
}

/* ---------- clave del dispositivo (AES-256-GCM) ---------- */

let keyPromise: Promise<CryptoKey> | null = null;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getVaultKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      let saltHex = "";
      try {
        saltHex = localStorage.getItem(LS_VAULT_SALT) ?? "";
        if (!saltHex) {
          const b = new Uint8Array(16);
          crypto.getRandomValues(b);
          saltHex = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
          localStorage.setItem(LS_VAULT_SALT, saltHex);
        }
      } catch {
        saltHex = "axcsos-default-salt"; // sin almacenamiento: bóveda efímera
      }
      const material = new TextEncoder().encode(`${getDeviceId()}|${saltHex}|axcsos-vault-v1`);
      const base = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(saltHex), iterations: PBKDF2_ITER },
        base,
        { name: "AES-GCM", length: 256 },
        false, // no extraíble: la clave jamás sale de la memoria
        ["encrypt", "decrypt"],
      );
    })().catch((e) => {
      keyPromise = null; // reintento en el próximo uso
      throw e;
    });
  }
  return keyPromise;
}

async function encryptPassword(plain: string): Promise<string> {
  const key = await getVaultKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(plain)));
  // iv (12B) + ciphertext en un solo b64
  const both = new Uint8Array(iv.length + data.length);
  both.set(iv, 0);
  both.set(data, iv.length);
  return b64(both);
}

async function decryptPassword(cipher: string): Promise<string> {
  const key = await getVaultKey();
  const both = unb64(cipher);
  const iv = both.slice(0, 12);
  const data = both.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, data as unknown as BufferSource);
  return new TextDecoder().decode(plain);
}

/* ---------- API de la bóveda ---------- */

export function listVault(): VaultEntry[] {
  return loadEntries();
}

export function subscribeVault(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook React: entradas de la bóveda, siempre frescas (sin contraseñas). */
export function useVault(): VaultEntry[] {
  return useSyncExternalStore(subscribeVault, listVault, () => []);
}

export function findVaultEntry(domain: string): VaultEntry | undefined {
  const d = domain.trim().toLowerCase();
  return loadEntries().find((e) => e.domain === d);
}

export interface DecryptedCredential {
  domain: string;
  username: string;
  password: string;
  updatedAt: number;
}

/** Descifra la credencial guardada de un dominio (null si no existe). */
export async function getCredential(domain: string): Promise<DecryptedCredential | null> {
  const entry = findVaultEntry(domain);
  if (!entry) return null;
  try {
    const password = await decryptPassword(entry.cipher);
    return { domain: entry.domain, username: entry.username, password, updatedAt: entry.updatedAt };
  } catch {
    return null; // cifra corrupta o clave de otro dispositivo: entrada inutilizable
  }
}

export function hasCredential(domain: string): boolean {
  return !!findVaultEntry(domain);
}

/** Guarda (o actualiza) la credencial de un dominio, cifrando la contraseña. */
export async function saveCredential(domain: string, username: string, password: string): Promise<boolean> {
  const d = domain.trim().toLowerCase();
  const u = username.trim();
  if (!d || !u || !password) return false;
  const cipher = await encryptPassword(password);
  const now = Date.now();
  const list = loadEntries();
  const i = list.findIndex((e) => e.domain === d);
  const entry: VaultEntry = { domain: d, username: u, cipher, createdAt: i >= 0 ? list[i].createdAt : now, updatedAt: now };
  cache = i >= 0 ? list.map((e, k) => (k === i ? entry : e)) : [entry, ...list];
  persist();
  return true;
}

export function deleteCredential(domain: string): void {
  const d = domain.trim().toLowerCase();
  cache = loadEntries().filter((e) => e.domain !== d);
  persist();
}

/* ---------- "nunca guardar" por dominio ---------- */

function readNever(): string[] {
  try {
    const raw = localStorage.getItem(LS_NEVER);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function neverSaveAgain(domain: string): void {
  const d = domain.trim().toLowerCase();
  if (!d) return;
  const list = readNever();
  if (!list.includes(d)) localStorage.setItem(LS_NEVER, JSON.stringify([...list, d]));
}

export function isNeverSave(domain: string): boolean {
  return readNever().includes(domain.trim().toLowerCase());
}

export function allowSaveAgain(domain: string): void {
  localStorage.setItem(LS_NEVER, JSON.stringify(readNever().filter((d) => d !== domain.trim().toLowerCase())));
}

/** Normaliza una URL a dominio registrable simple (github.com). */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
