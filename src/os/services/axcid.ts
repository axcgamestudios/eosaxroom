"use client";

/* ============================================================
   AXC ID — identidad con correo de axcsOS
   ------------------------------------------------------------
   Sistema OPCIONAL por cuenta:
   - Añade tu correo a la cuenta y recibe un código real por
     email (envío con FormSubmit, sin servidores propios).
   - Al verificar el correo, la sesión se mantiene con una
     COOKIE: al abrir o recargar el OS ENTRA DIRECTO, sin
     pasar por la pantalla de inicio de sesión.
   - También permite entrar con «correo + código» en lugar de
     la contraseña.

   Decisiones honestas:
   - El correo verificado vive EN EL DISPOSITIVO (arquitectura
     1-dispositivo-por-cuenta: la cuenta solo se usa aquí).
   - La cookie lleva firma anti-manipulación casual; en un sitio
     estático la verificación es de cliente (limitación conocida).
   - El código se guarda SOLO hasheado (SHA-256) en sessionStorage.
   ============================================================ */

import { getDeviceId } from "./auth";

/* ---------- cookies ---------- */

export function setCookie(name: string, value: string, days: number): void {
  try {
    const maxAge = Math.round(days * 86400);
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } catch {
    /* sin cookies: no hay sesión persistente (honesto) */
  }
}

export function getCookie(name: string): string | null {
  try {
    const hit = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${name}=`));
    if (!hit) return null;
    return decodeURIComponent(hit.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function delCookie(name: string): void {
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/* ---------- registro de correos verificados (por dispositivo) ---------- */

export interface AxcidEntry {
  email: string;
  verified: boolean;
  ts: number;
}

const LS_AXCID = "axcsos.axcid";

function readRegistry(): Record<string, AxcidEntry> {
  try {
    const raw = localStorage.getItem(LS_AXCID);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, AxcidEntry>;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeRegistry(reg: Record<string, AxcidEntry>): void {
  try {
    localStorage.setItem(LS_AXCID, JSON.stringify(reg));
  } catch {
    /* ignore */
  }
}

export function getAxcid(accountId: string): AxcidEntry | null {
  return readRegistry()[accountId] ?? null;
}

/** Guarda el correo verificado de la cuenta EN ESTE dispositivo. */
export function markEmailVerified(accountId: string, email: string): void {
  const reg = readRegistry();
  reg[accountId] = { email: email.trim().toLowerCase(), verified: true, ts: Date.now() };
  writeRegistry(reg);
}

export function isEmailVerified(accountId: string): boolean {
  return getAxcid(accountId)?.verified === true;
}

/** Cuentas de este dispositivo cuyo correo verificado coincide. */
export function findVerifiedAccountIds(email: string): string[] {
  const e = email.trim().toLowerCase();
  const reg = readRegistry();
  return Object.entries(reg)
    .filter(([, v]) => v.verified && v.email === e)
    .map(([k]) => k);
}

/* ---------- códigos por correo ---------- */

const SS_CODE = "axcsos.axcid.code";
const CODE_TTL = 10 * 60 * 1000; // 10 minutos
const CODE_MAX_TRIES = 5;

interface PendingCode {
  email: string;
  h: string; // SHA-256 b64 del código
  exp: number;
  tries: number;
}

async function sha256B64(text: string): Promise<string> {
  const bits = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let s = "";
  const b = new Uint8Array(bits);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export interface SendResult {
  ok: boolean; // el correo salió del servicio
  sent: boolean; // el código quedó generado y pendiente (correo válido)
  detail: string;
}

/**
 * Genera un código de 6 dígitas, lo registra (solo su hash) y lo envía
 * de verdad al correo con FormSubmit (https://formsubmit.co — gratuito,
 * sin cuenta; la PRIMERA vez pide activar un enlace desde el propio correo).
 */
export async function sendEmailCode(email: string): Promise<SendResult> {
  const to = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return { ok: false, sent: false, detail: "Escribe un correo válido (nombre@dominio.com)." };
  }
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const pending: PendingCode = {
    email: to,
    h: await sha256B64(code),
    exp: Date.now() + CODE_TTL,
    tries: 0,
  };
  try {
    sessionStorage.setItem(SS_CODE, JSON.stringify(pending));
  } catch {
    return { ok: false, sent: false, detail: "Este navegador no permite guardar el código pendiente." };
  }
  // costura de pruebas: el código solo es visible en desarrollo (nunca en producción)
  if (process.env.NODE_ENV === "development") {
    (window as unknown as { __axcDebug?: { lastCode: string } }).__axcDebug = { lastCode: code };
  }
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: "Tu código de AXC ID · axcsOS",
        _template: "table",
        _captcha: "false",
        Sistema: "axcsOS · AXC ID",
        Cuenta: "verificación de correo",
        Codigo: code,
        Mensaje: `Tu código es ${code}. Caduca en 10 minutos. Si no lo has pedido, ignora este correo.`,
      }),
    });
    const data = (await res.json().catch(() => null)) as { success?: string; message?: string } | null;
    if (!res.ok || !data || String(data.success) !== "true") {
      const why = data?.message || `FormSubmit respondió ${res.status}`;
      const activation = /activat/i.test(why);
      return {
        ok: false,
        sent: true,
        detail: activation
          ? "Primera vez con este correo: abre el enlace de activación que te llegó y pide el código de nuevo."
          : `El envío falló esta vez: ${why}. Si te llegó un código anterior, puedes probarlo ahora.`,
      };
    }
    const activation = /activat/i.test(data.message ?? "");
    return {
      ok: true,
      sent: true,
      detail: activation
        ? "Revisa tu correo: la primera vez FormSubmit pide activar su enlace; luego pide el código de nuevo."
        : `Código enviado a ${to}. Revisa también el correo no deseado.`,
    };
  } catch {
    return { ok: false, sent: true, detail: "Sin conexión con el servicio de envío (FormSubmit). Vuelve a intentarlo; si te llegó un código anterior, puedes probarlo." };
  }
}

/** Comprueba el código introducido contra el pendiente (hash + intentos + caducidad). */
export async function checkEmailCode(code: string): Promise<{ ok: boolean; email?: string; detail?: string }> {
  let pending: PendingCode | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(SS_CODE) ?? "null") as PendingCode | null;
  } catch {
    pending = null;
  }
  if (!pending) return { ok: false, detail: "Pide primero un código." };
  if (Date.now() > pending.exp) return { ok: false, detail: "El código caducó. Pide uno nuevo." };
  if (pending.tries >= CODE_MAX_TRIES) return { ok: false, detail: "Demasiados intentos. Pide un código nuevo." };
  const h = await sha256B64(code.trim());
  if (h !== pending.h) {
    pending.tries += 1;
    try {
      sessionStorage.setItem(SS_CODE, JSON.stringify(pending));
    } catch {
      /* ignore */
    }
    return { ok: false, detail: "Código incorrecto." };
  }
  try {
    sessionStorage.removeItem(SS_CODE);
  } catch {
    /* ignore */
  }
  return { ok: true, email: pending.email };
}

/* ---------- sesión persistente con cookie ---------- */

export interface StaySession {
  a: string; // accountId
  u: string; // username
  t: string; // token de sesión (el mismo del guardián MQTT)
  e: number; // caducidad (epoch ms)
  s: string; // firma anti-manipulación casual
}

const COOKIE_STAY = "axcs_stay";
const STAY_DAYS = 30;
// constante de firma: evita que alguien "invente" una cookie a mano sin mirar el código
const STAY_SIG_KEY = "axcsos!stay!v1";

async function staySig(a: string, u: string, t: string, e: number): Promise<string> {
  return sha256B64([a, u, t, e, getDeviceId(), STAY_SIG_KEY].join("|"));
}

/** Guarda la sesión persistente en una cookie de 30 días (llamada al entrar con «Recordarme»). */
export async function setStaySession(accountId: string, username: string, token: string): Promise<void> {
  const e = Date.now() + STAY_DAYS * 86400 * 1000;
  const stay: StaySession = { a: accountId, u: username, t: token, e, s: await staySig(accountId, username, token, e) };
  setCookie(COOKIE_STAY, JSON.stringify(stay), STAY_DAYS);
}

/** Lee y valida la cookie de sesión persistente. null si no existe, caducó o está manipulada. */
export async function readStaySession(): Promise<StaySession | null> {
  const raw = getCookie(COOKIE_STAY);
  if (!raw) return null;
  try {
    const stay = JSON.parse(raw) as StaySession;
    if (!stay?.a || !stay?.u || !stay?.t || !stay?.e) return null;
    if (Date.now() > stay.e) return null;
    if (stay.s !== (await staySig(stay.a, stay.u, stay.t, stay.e))) return null;
    return stay;
  } catch {
    return null;
  }
}

export function clearStaySession(): void {
  delCookie(COOKIE_STAY);
}
