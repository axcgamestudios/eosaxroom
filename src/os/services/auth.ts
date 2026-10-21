"use client";

/* ============================================================
   Servicio de cuentas y seguridad de axcsOS
   ------------------------------------------------------------
   - Cuentas reales con contraseñas verificables: PBKDF2-SHA256
     (100.000 iteraciones, sal aleatoria por cuenta). Nunca se
     guarda ni viaja una contraseña en texto plano.
   - Fuente de verdad: data/accounts.json en el repositorio de
     GitHub (main = código fuente, gh-pages = sitio en vivo).
   - Panel de administrador: crea/restablece/elimina cuentas y
     SIEMPRE guarda los cambios en GitHub (Contents API).
   - 1 dispositivo por cuenta: guardián de sesión sobre MQTT
     (los mismos brokers wss públicos del chat). Al iniciar
     sesión se publica la sesión activa (retenida); cualquier
     otro dispositivo con la misma cuenta recibe la orden de
     cerrar sesión. El último inicio de sesión gana.
   ============================================================ */

import { appBase } from "../engine/scramjet";

export const ITERATIONS = 100_000;

export interface AccountRecord {
  id: string;
  username: string;
  salt: string; // b64
  hash: string; // b64 — PBKDF2-SHA256
  created: string;
}

export interface AccountsFile {
  _note?: string;
  version?: number;
  accounts: AccountRecord[];
}

/* ---------- PBKDF2 (Web Crypto) ---------- */

function b64FromBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function derive(password: string, salt: Uint8Array, iterations = ITERATIONS): Promise<Uint8Array> {
  const enc = new TextEncoder();
  return crypto.subtle
    .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
    .then((key) => crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations }, key, 256))
    .then((bits) => new Uint8Array(bits));
}

/** Genera {salt, hash} en b64 para guardar una contraseña nueva. */
export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return { salt: b64FromBytes(salt), hash: b64FromBytes(hash) };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifica una contraseña contra el registro de una cuenta. */
export async function verifyPassword(password: string, acc: AccountRecord): Promise<boolean> {
  try {
    const bits = await derive(password, bytesFromB64(acc.salt));
    return safeEqual(b64FromBytes(bits), acc.hash);
  } catch {
    return false;
  }
}

/* ---------- administrador (panel J+K+L) ---------- */
/* Contraseña del panel verificada localmente con PBKDF2 (sal fija).
   Igual que las cuentas: nunca en texto plano en el código. */
const ADMIN_SALT_B64 = "YXhjc29zLWFkbWluLXYxIQ==";
const ADMIN_HASH_B64 = "ZM8l5v9PcZdVTlh+jSUlTdnoxGgQWidpsM7B7031c3c=";

export async function verifyAdminPassword(password: string): Promise<boolean> {
  try {
    const bits = await derive(password, bytesFromB64(ADMIN_SALT_B64));
    return safeEqual(b64FromBytes(bits), ADMIN_HASH_B64);
  } catch {
    return false;
  }
}

/* ---------- cuentas (fuente de verdad: GitHub) ---------- */

export function accountsUrl(): string {
  return `${appBase()}/data/accounts.json`;
}

/** Descarga la lista de cuentas (con anti-caché). Lanza si no se puede. */
export async function fetchAccounts(): Promise<AccountRecord[]> {
  const res = await fetch(`${accountsUrl()}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) return []; // aún sin cuentas creadas
    throw new Error(`GitHub respondió ${res.status}`);
  }
  const data = (await res.json()) as AccountsFile;
  if (!data || !Array.isArray(data.accounts)) throw new Error("Formato de cuentas no válido");
  return data.accounts;
}

export function findAccount(accounts: AccountRecord[], username: string): AccountRecord | undefined {
  const u = username.trim().toLowerCase();
  return accounts.find((a) => a.username.trim().toLowerCase() === u);
}

/* ---------- dispositivo y sesión ---------- */

const LS_DEVICE = "axcsos.device";
const LS_SESSION = "axcsos.session";

export interface StoredSession {
  accountId: string;
  username: string;
  token: string;
  ts: number;
}

/** Identidad estable del navegador/dispositivo (persistente). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(LS_DEVICE);
    if (!id) {
      id = Array.from(randomBytes(12))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(LS_DEVICE, id);
    }
    return id;
  } catch {
    return "dev-desconocido";
  }
}

/** Registra la sesión de este dispositivo para la cuenta (login con contraseña). */
export function createSession(account: AccountRecord): StoredSession {
  const s: StoredSession = {
    accountId: account.id,
    username: account.username,
    token: Array.from(randomBytes(24))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    ts: Date.now(),
  };
  try {
    localStorage.setItem(LS_SESSION, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: la sesión vive solo en memoria */
  }
  return s;
}

/** Sesión guardada en este dispositivo (para Touch ID / re-entrada rápida). */
export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s || !s.accountId || !s.token) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(LS_SESSION);
  } catch {
    /* ignore */
  }
}

/* ---------- guardián de sesión: 1 dispositivo por cuenta ----------
   Al iniciar sesión se publica (RETENIDO) la sesión activa de la cuenta
   en axcsos/auth/s/{accountId}. Regla: EL ÚLTIMO INICIO DE SESIÓN GANA.
   - Mensaje EN VIVO (no retenido) de otro dispositivo → esa sesión acaba
     de entrar: esta se expulsa al instante.
   - Mensaje RETENIDO de otro dispositivo con marca de tiempo MÁS NUEVA que
     el arranque de esta sesión → la cuenta se movió mientras no miraba:
     esta se expulsa.
   - Mensaje retenido MÁS VIEJO que esta sesión (resto de un dispositivo
     muerto o de un inicio anterior) → se ignora: esta sesión es la última
     y su publicación reemplaza el retenido.
   Así, limpiar el navegador o cambiar de dispositivo no deja a la cuenta
   bloqueada por mensajes viejos, y el mismo dispositivo en varias pestañas
   sigue permitido. */
const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://broker.mosquitto.org:8081/mqtt"];

export type GuardState = "off" | "connecting" | "online";

let guardClient: import("mqtt").MqttClient | null = null;
let guardTimer: ReturnType<typeof setTimeout> | null = null;
let guardActiveFlag = false;
let guardState: GuardState = "off";
const guardListeners = new Set<(s: GuardState) => void>();

export function onGuardState(cb: (s: GuardState) => void): () => void {
  guardListeners.add(cb);
  cb(guardState);
  return () => guardListeners.delete(cb);
}
function setGuardState(s: GuardState) {
  guardState = s;
  guardListeners.forEach((cb) => cb(s));
}

export function isGuardActive(): boolean {
  return guardClient !== null;
}

export function stopSessionGuard(): void {
  guardActiveFlag = false; // invalida TODOS los reintentos en vuelo de este guardián
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = null;
  const c = guardClient;
  guardClient = null;
  if (c) {
    try {
      c.removeAllListeners();
      c.end(true);
    } catch {
      /* ignore */
    }
  }
  setGuardState("off");
}

/**
 * Arranca el guardián para la cuenta autenticada en este dispositivo.
 * onKicked se llama exactamente una vez si otra sesión desplaza a esta.
 */
export async function startSessionGuard(
  accountId: string,
  token: string,
  onKicked: (detail: string) => void,
): Promise<void> {
  const deviceId = getDeviceId();
  const topic = `axcsos/auth/s/${accountId}`;
  const myPayload = JSON.stringify({ token, deviceId, ts: Date.now() });
  const mySessionStart = Date.now();
  let kicked = false;
  let brokerIdx = 0;

  stopSessionGuard();
  guardActiveFlag = true; // este guardián está vivo hasta stopSessionGuard()
  setGuardState("connecting");

  const attempt = async () => {
    if (!guardActiveFlag || kicked) return; // parado o expulsado: no seguir
    let mqttLib: typeof import("mqtt");
    try {
      mqttLib = await import("mqtt");
    } catch {
      setGuardState("off");
      return; // sin módulo no hay guardián (best-effort honesto)
    }
    const mqtt = (mqttLib as unknown as { default?: typeof import("mqtt") }).default ?? mqttLib;
    const url = BROKERS[brokerIdx % BROKERS.length];
    let client: import("mqtt").MqttClient;
    try {
      client = mqtt.connect(url, {
        clientId: `aosauth-${deviceId.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`,
        keepalive: 45,
        clean: true,
        connectTimeout: 9000,
        reconnectPeriod: 0, // failover manual
      });
    } catch {
      scheduleRetry();
      return;
    }
    guardClient = client;

    client.on("connect", () => {
      if (kicked || guardClient !== client) return;
      setGuardState("online");
      client.subscribe(topic, { qos: 1 }, (err) => {
        if (err || kicked || guardClient !== client) return;
        // publicar MI sesión (retenida): los demás dispositivos la verán
        client.publish(topic, myPayload, { qos: 1, retain: true });
      });
    });

    client.on("message", (t, msg, packet) => {
      if (kicked || t !== topic || guardClient !== client) return;
      try {
        const m = JSON.parse(msg.toString()) as { token?: string; deviceId?: string; ts?: number };
        if (!m || typeof m.token !== "string") return;
        if (m.token === token) return; // eco de mi propia sesión
        if (m.deviceId === deviceId) return; // otra pestaña del MISMO dispositivo: permitido
        const isRetained = !!(packet && (packet as { retain?: boolean }).retain);
        // retenido más viejo que esta sesión: resto de un inicio anterior → yo soy el último inicio
        if (isRetained && (!m.ts || m.ts <= mySessionStart)) return;
        // sesión desde otro dispositivo (en vivo, o retenida más nueva): la cuenta ya vive allí
        kicked = true;
        stopSessionGuard();
        onKicked("La cuenta se ha iniciado en otro dispositivo.");
      } catch {
        /* mensaje corrupto: ignorar */
      }
    });

    client.on("error", () => {
      if (guardClient === client) scheduleRetry();
    });
    client.on("close", () => {
      if (guardClient === client) scheduleRetry();
    });
  };

  const scheduleRetry = () => {
    if (kicked || !guardActiveFlag) return;
    setGuardState("connecting");
    brokerIdx += 1;
    if (guardTimer) clearTimeout(guardTimer);
    // ciclo de brokers rápido; si la red entera falla, se reintenta cada 30 s
    const wait = brokerIdx % BROKERS.length === 0 ? 30000 : 1500;
    guardTimer = setTimeout(() => {
      if (guardActiveFlag && !kicked) void attempt();
    }, wait);
  };

  await attempt();
}

/* ---------- guardar cuentas en GitHub (panel de administrador) ----------
   El token de GitHub NUNCA viaja en el código (el repositorio es público):
   lo pega el administrador una vez y vive solo en SU navegador. Cada cambio
   se commitea SIEMPRE a main (fuente) y gh-pages (sitio en vivo). */

const LS_ADMIN_TOKEN = "axcsos.admtok";
const GH_REPO = "axcgamestudios/aos";

export function getAdminToken(): string {
  try {
    return localStorage.getItem(LS_ADMIN_TOKEN) ?? "";
  } catch {
    return "";
  }
}
export function setAdminToken(token: string): void {
  localStorage.setItem(LS_ADMIN_TOKEN, token.trim());
}
export function clearAdminToken(): void {
  localStorage.removeItem(LS_ADMIN_TOKEN);
}

export interface BranchResult {
  branch: string;
  ok: boolean;
  sha?: string;
  error?: string;
}
export interface SaveResult {
  main: BranchResult;
  pages: BranchResult;
}

async function ghJson(path: string, token: string, init?: RequestInit): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* cuerpo vacío */
  }
  return { status: res.status, data };
}

/** Comprueba que el token funciona y puede escribir en el repo. */
export async function validateAdminToken(token: string): Promise<{ ok: boolean; detail: string }> {
  if (!token.trim()) return { ok: false, detail: "Pega un token de acceso de GitHub" };
  try {
    const { status, data } = await ghJson("/user", token);
    if (status === 401) return { ok: false, detail: "El token no es válido (GitHub lo rechaza)" };
    if (status === 403) return { ok: false, detail: "El token no tiene permisos suficientes" };
    const login = (data as { login?: string })?.login ?? "?";
    const repo = await ghJson(`/repos/${GH_REPO}`, token);
    if (repo.status === 404 || repo.status === 403) return { ok: false, detail: `El token de @${login} no ve el repositorio ${GH_REPO}` };
    const perms = (repo.data as { permissions?: { push?: boolean } })?.permissions;
    if (!perms?.push) return { ok: false, detail: `El token de @${login} no tiene permiso de escritura en ${GH_REPO}` };
    return { ok: true, detail: `Token de @${login} con escritura en ${GH_REPO}` };
  } catch {
    return { ok: false, detail: "No se pudo conectar con la API de GitHub" };
  }
}

function b64Utf8(text: string): string {
  return b64FromBytes(new TextEncoder().encode(text));
}

async function putFileOnBranch(
  token: string,
  branch: "main" | "gh-pages",
  path: string,
  content: string,
  message: string,
): Promise<BranchResult> {
  try {
    // sha del fichero actual (si existe) para sobrescribirlo
    const cur = await ghJson(`/repos/${GH_REPO}/contents/${encodeURI(path)}?ref=${branch}&t=${Date.now()}`, token);
    const sha = cur.status === 200 ? ((cur.data as { sha?: string })?.sha ?? undefined) : undefined;
    const put = await ghJson(`/repos/${GH_REPO}/contents/${encodeURI(path)}`, token, {
      method: "PUT",
      body: JSON.stringify({ message, content: b64Utf8(content), sha, branch }),
    });
    if (put.status === 200 || put.status === 201) {
      return { branch, ok: true, sha: (put.data as { content?: { sha?: string } })?.content?.sha };
    }
    const errMsg =
      put.status === 401
        ? "token rechazado"
        : put.status === 403
          ? "el token no tiene permiso de escritura"
          : put.status === 409
            ? "conflicto (el fichero cambió en GitHub): recarga el panel"
            : `GitHub respondió ${put.status}`;
    return { branch, ok: false, error: errMsg };
  } catch (e) {
    return { branch, ok: false, error: `sin conexión con GitHub (${String((e as Error)?.message ?? e)})` };
  }
}

/** Guarda SIEMPRE las cuentas en GitHub: main (fuente) y gh-pages (sitio vivo). */
export async function saveAccountsToGithub(accounts: AccountRecord[], message: string): Promise<SaveResult> {
  const token = getAdminToken();
  if (!token) {
    const err = { ok: false as const, error: "falta el token de GitHub (configúralo en el panel)" };
    return { main: { branch: "main", ...err }, pages: { branch: "gh-pages", ...err } };
  }
  const file: AccountsFile = {
    _note: "Cuentas de axcsOS gestionadas por el panel de administrador. Las contraseñas se guardan como PBKDF2-SHA256 (100000 iteraciones, sal aleatoria por cuenta) y nunca en texto plano.",
    version: 1,
    accounts,
  };
  const content = JSON.stringify(file, null, 2) + "\n";
  const main = await putFileOnBranch(token, "main", "public/data/accounts.json", content, message);
  const pages = await putFileOnBranch(token, "gh-pages", "data/accounts.json", content, message);
  return { main, pages };
}

export function accountUid(): string {
  return `acc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
