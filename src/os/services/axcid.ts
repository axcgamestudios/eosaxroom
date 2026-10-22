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

/* ---------- códigos por correo (API del servidor + respaldo) ----------
   Flujo nuevo: /api/auth/send-otp y /api/auth/verify-otp (App Router).
   El código se genera en el servidor, se guarda SOLO hasheado
   (PBKDF2-SHA256) y se envía con Resend (si el servidor tiene
   RESEND_API_KEY) o FormSubmit. Si el despliegue no puede servir
   el API (GitHub Pages es estático), se usa el respaldo clásico:
   envío directo desde el navegador del usuario con FormSubmit y
   comprobación local del hash. Nunca se finge un envío. */

import { appBase } from "../engine/scramjet";

const SS_CODE = "axcsos.axcid.code";
const SS_PENDING_EMAIL = "axcsos.axcid.pending";
const SS_VIA = "axcsos.axcid.via"; // "api" | "local": por dónde se envió el último código
const CODE_TTL = 10 * 60 * 1000; // 10 minutos
const CODE_MAX_TRIES = 5;

interface PendingCode {
  email: string;
  h: string; // SHA-256 b64 del código (solo para el respaldo local)
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

function otpEndpoint(path: string): string {
  // despliegue propio con API (dev/servidor) o URL absoluta configurada
  const base = process.env.NEXT_PUBLIC_OTP_API || `${appBase()}/api`;
  return `${base}${path}`;
}

/** ¿el API de verificación está servida aquí? (Pages estático: no) */
export async function otpApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(otpEndpoint("/auth/send-otp"), { method: "GET", cache: "no-store" });
    return res.status === 405; // el route responde 405 al GET cuando existe
  } catch {
    return false;
  }
}

export interface SendResult {
  ok: boolean; // el correo salió del servicio
  sent: boolean; // el código quedó generado y pendiente (correo válido)
  detail: string;
  /** por dónde se gestionó el código */
  via: "api" | "local";
}

/** Envío del código: primero el API del servidor; si no existe o no pudo entregar, respaldo local (FormSubmit desde este navegador). */
export async function sendEmailCode(email: string): Promise<SendResult> {
  const to = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return { ok: false, sent: false, detail: "Escribe un correo válido (nombre@dominio.com).", via: "local" };
  }
  try {
    sessionStorage.setItem(SS_PENDING_EMAIL, to);
  } catch {
    /* el respaldo local lo necesita; el API no */
  }

  // 1) API del servidor (hash PBKDF2 en base de datos + Resend/FormSubmit)
  try {
    const res = await fetch(otpEndpoint("/auth/send-otp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: to }),
    });
    if (res.status === 404) {
      // despliegue sin API (p. ej. GitHub Pages): respaldo local
    } else {
      const data = (await res.json().catch(() => null)) as { ok?: boolean; sent?: boolean; detail?: string } | null;
      if (res.ok && data?.ok) {
        try {
          sessionStorage.setItem(SS_VIA, "api");
        } catch {
          /* ignore */
        }
        return { ok: true, sent: true, via: "api", detail: data?.detail ?? `Código enviado a ${to}.` };
      }
      if (res.status === 502) {
        // el API existe pero el proveedor rechazó el envío desde el servidor:
        // el código del servidor queda NO verificable → se intenta desde el
        // navegador del usuario (IP residencial, FormSubmit la acepta)
        const local = await sendEmailCodeLocal(to);
        return local.ok || local.sent
          ? local
          : { ok: false, sent: false, via: "api", detail: `${data?.detail ?? "El servidor no pudo enviar el correo."} (tampoco el envío desde tu navegador: ${local.detail})` };
      }
      // validación / rate-limit / error del servidor: respuesta honesta del API
      return { ok: false, sent: !!data?.sent, via: "api", detail: data?.detail ?? `El servidor respondió ${res.status}.` };
    }
  } catch {
    /* sin conexión al API: respaldo local */
  }

  // 2) Respaldo local clásico (FormSubmit desde el navegador del usuario)
  return sendEmailCodeLocal(to);
}

async function sendEmailCodeLocal(to: string): Promise<SendResult> {
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const pending: PendingCode = {
    email: to,
    h: await sha256B64(code),
    exp: Date.now() + CODE_TTL,
    tries: 0,
  };
  try {
    sessionStorage.setItem(SS_CODE, JSON.stringify(pending));
    sessionStorage.setItem(SS_VIA, "local");
  } catch {
    return { ok: false, sent: false, detail: "Este navegador no permite guardar el código pendiente.", via: "local" };
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
        via: "local",
        detail: activation
          ? "Primera vez con este correo: abre el enlace de activación que te llegó y pide el código de nuevo."
          : `El envío falló esta vez: ${why}. Si te llegó un código anterior, puedes probarlo ahora.`,
      };
    }
    const activation = /activat/i.test(data.message ?? "");
    return {
      ok: true,
      sent: true,
      via: "local",
      detail: activation
        ? "Revisa tu correo: la primera vez FormSubmit pide activar su enlace; luego pide el código de nuevo."
        : `Código enviado a ${to}. Revisa también el correo no deseado.`,
    };
  } catch {
    return { ok: false, sent: true, via: "local", detail: "Sin conexión con el servicio de envío (FormSubmit). Vuelve a intentarlo; si te llegó un código anterior, puedes probarlo." };
  }
}

/** Comprueba el código contra la vía por la que se envió (API o local). */
export async function checkEmailCode(code: string): Promise<{ ok: boolean; email?: string; detail?: string }> {
  let pendingEmail = "";
  let via = "";
  try {
    pendingEmail = sessionStorage.getItem(SS_PENDING_EMAIL) ?? "";
    via = sessionStorage.getItem(SS_VIA) ?? "";
  } catch {
    pendingEmail = "";
  }

  // 1) el código lo gestiona el API del servidor
  if (via === "api" && pendingEmail) {
    try {
      const res = await fetch(otpEndpoint("/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      if (res.status !== 404) {
        const data = (await res.json().catch(() => null)) as { ok?: boolean; email?: string; detail?: string } | null;
        if (res.ok && data?.ok) {
          try {
            sessionStorage.removeItem(SS_CODE);
            sessionStorage.removeItem(SS_PENDING_EMAIL);
            sessionStorage.removeItem(SS_VIA);
          } catch {
            /* ignore */
          }
          return { ok: true, email: data.email ?? pendingEmail };
        }
        return { ok: false, detail: data?.detail ?? "Código incorrecto." };
      }
    } catch {
      /* API inalcanzable ahora: caer al pendiente local si existe */
    }
  }

  // 2) respaldo local (hash + intentos + caducidad en sessionStorage)
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
    sessionStorage.removeItem(SS_PENDING_EMAIL);
    sessionStorage.removeItem(SS_VIA);
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
