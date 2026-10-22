import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail, verifyOtp } from "@/lib/auth-otp";

/* ============================================================
   POST /api/auth/verify-otp
   ------------------------------------------------------------
   Parte 2 del flujo: { email, code } → valida el código contra el
   hash PBKDF2 guardado (10 min de vida, 5 intentos, solo códigos
   enviados de verdad). Si es correcto:
   - registra el correo en VerifiedEmail (perfil remoto) y
   - responde { ok: true, emailVerified: true } para que el cliente
     active emailVerified en el perfil local del dispositivo.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: unknown; code?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ ok: false, detail: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, detail: "Correo no válido." }, { status: 400 });
  }

  try {
    const r = await verifyOtp(email, code);
    if (!r.ok) {
      return NextResponse.json({ ok: false, emailVerified: false, detail: r.detail }, { status: r.status });
    }
    return NextResponse.json({ ok: true, emailVerified: true, email: r.email, detail: "Correo verificado." });
  } catch (e) {
    return NextResponse.json({ ok: false, detail: `Error interno: ${String((e as Error)?.message ?? e)}` }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, detail: "Usa POST con { email, code }." }, { status: 405 });
}
