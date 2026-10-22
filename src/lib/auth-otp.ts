import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

/* ============================================================
   Códigos OTP de verificación de correo (AXC ID) — lado servidor
   ------------------------------------------------------------
   * Código de 6 dígitos, TTL 10 minutos, máximo 5 intentos.
   * En la base de datos SOLO vive el hash PBKDF2-SHA256 con sal
     aleatoria por código: jamás el código en claro.
   * Un código solo es verificable si el proveedor de correo
     aceptó su envío (sent=true) — nunca se "verifica" lo que no
     salió del servidor.
   * Rate-limit en memoria por correo y por IP (desplegable de un
     solo proceso; para serverless multi-instancia mover a Redis).
   ============================================================ */

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
export const OTP_MAX_ATTEMPTS = 5;
const PBKDF2_ITERATIONS = 60_000;

/* ---------- validación de correo ---------- */

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/* ---------- rate limit (en memoria, por proceso) ---------- */

const WINDOW_SENDS_MS = 15 * 60 * 1000; // 15 min
const MAX_SENDS_EMAIL = 3; // por correo
const MAX_SENDS_IP = 12; // por IP, ventana de 1 h
const WINDOW_IP_MS = 60 * 60 * 1000;

const sendsByEmail = new Map<string, number[]>();
const sendsByIp = new Map<string, number[]>();

function prune(map: Map<string, number[]>, key: string, windowMs: number): number[] {
  const now = Date.now();
  const list = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length) map.set(key, list);
  else map.delete(key);
  return list;
}

export function checkRate(email: string, ip: string): { ok: boolean; detail?: string } {
  const byEmail = prune(sendsByEmail, email, WINDOW_SENDS_MS);
  if (byEmail.length >= MAX_SENDS_EMAIL) {
    return { ok: false, detail: "Demasiados códigos para este correo en poco tiempo: espera unos minutos." };
  }
  const byIp = prune(sendsByIp, ip, WINDOW_IP_MS);
  if (byIp.length >= MAX_SENDS_IP) {
    return { ok: false, detail: "Demasiados envíos desde esta conexión: espera un rato." };
  }
  return { ok: true };
}

function noteSend(email: string, ip: string): void {
  const now = Date.now();
  sendsByEmail.set(email, [...(sendsByEmail.get(email) ?? []), now]);
  sendsByIp.set(ip, [...(sendsByIp.get(ip) ?? []), now]);
}

/* ---------- creación ---------- */

function hashCode(code: string, saltHex: string): string {
  return pbkdf2Sync(code, saltHex, PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
}

export interface CreatedOtp {
  id: string;
  code: string;
}

/**
 * Genera un código nuevo para el correo, invalida los anteriores
 * pendientes y lo guarda (solo su hash). Devuelve el código en
 * claro EXCLUSIVAMENTE al llamador que debe enviarlo por correo.
 */
export async function createOtp(email: string, ip: string | null): Promise<CreatedOtp> {
  // invalidar códigos pendientes anteriores del mismo correo
  await db.otpCode.updateMany({
    where: { email, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const salt = randomBytes(12).toString("hex");
  const row = await db.otpCode.create({
    data: {
      email,
      salt,
      codeHash: hashCode(code, salt),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ip: ip ?? null,
    },
  });
  noteSend(email, ip ?? "?");
  // Registro del código SOLO en desarrollo (traza de depuración en el
  // log del servidor). En producción jamás se escribe el código.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[otp] código para ${email} (dev): ${code}`);
  }
  return { id: row.id, code };
}

/** Marca que el proveedor de correo aceptó el envío (sin esto, el código no es verificable). */
export async function markOtpSent(id: string): Promise<void> {
  await db.otpCode.update({ where: { id }, data: { sent: true } }).catch(() => undefined);
}

/* ---------- verificación ---------- */

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; status: number; detail: string };

export async function verifyOtp(email: string, code: string): Promise<VerifyResult> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return { ok: false, status: 400, detail: "El código debe tener 6 dígitos." };

  const pending = await db.otpCode.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) return { ok: false, status: 400, detail: "Pide primero un código para este correo." };
  if (!pending.sent) return { ok: false, status: 409, detail: "El último código no llegó a enviarse (proveedor de correo no disponible). Pide uno nuevo." };
  if (Date.now() > pending.expiresAt.getTime()) return { ok: false, status: 410, detail: "El código caducó. Pide uno nuevo." };
  if (pending.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, status: 429, detail: "Demasiados intentos. Pide un código nuevo." };

  const attempt = hashCode(clean, pending.salt);
  const good =
    attempt.length === pending.codeHash.length &&
    timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(pending.codeHash, "hex"));
  if (!good) {
    await db.otpCode.update({ where: { id: pending.id }, data: { attempts: pending.attempts + 1 } });
    const left = Math.max(0, OTP_MAX_ATTEMPTS - (pending.attempts + 1));
    return { ok: false, status: 400, detail: left > 0 ? `Código incorrecto. Te quedan ${left} intentos.` : "Código incorrecto. Pide un código nuevo." };
  }

  await db.otpCode.update({ where: { id: pending.id }, data: { consumedAt: new Date() } });
  // registro remoto del correo verificado (upsert)
  await db.verifiedEmail
    .upsert({
      where: { email },
      create: { email },
      update: { verifiedAt: new Date(), verifyCount: { increment: 1 } },
    })
    .catch(() => undefined);
  return { ok: true, email };
}

/* ---------- limpieza periódica (códigos viejos) ---------- */

let lastCleanup = 0;
export async function cleanupOldOtps(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) return; // como mucho cada 10 min
  lastCleanup = now;
  await db.otpCode
    .deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } })
    .catch(() => undefined);
}
