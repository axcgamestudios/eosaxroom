import { NextResponse } from "next/server";
import { checkRate, cleanupOldOtps, createOtp, isValidEmail, markOtpSent, normalizeEmail } from "@/lib/auth-otp";
import { sendOtpEmail } from "@/lib/mailer";

/* ============================================================
   POST /api/auth/send-otp
   ------------------------------------------------------------
   Parte 1 del flujo de verificación de correo del perfil (AXC ID):
   { email } → genera un código de 6 dígitos (solo su hash en la
   base de datos) y lo envía de verdad al correo con Resend (si hay
   RESEND_API_KEY) o FormSubmit. Sin proveedor disponible responde
   el fallo honesto: el código queda NO verificable (sent=false).
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ ok: false, detail: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, detail: "Escribe un correo válido (nombre@dominio.com)." }, { status: 400 });
  }

  const ip = clientIp(req);
  const rate = checkRate(email, ip);
  if (!rate.ok) {
    return NextResponse.json({ ok: false, detail: rate.detail }, { status: 429 });
  }

  void cleanupOldOtps().catch(() => undefined);

  try {
    const { id, code } = await createOtp(email, ip);
    const send = await sendOtpEmail(email, code);
    if (!send.ok) {
      // el código queda registrado pero NO verificable (sent=false):
      // nadie puede verificar un código que nunca salió del servidor
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          detail: `No se pudo enviar el correo ahora. ${send.detail} Revisa la dirección o vuelve a intentarlo en unos minutos.`,
        },
        { status: 502 },
      );
    }
    await markOtpSent(id);
    return NextResponse.json({
      ok: true,
      sent: true,
      provider: send.provider,
      detail: `Código enviado a ${email}. Revisa también el correo no deseado. Caduca en 10 minutos.`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, detail: `Error interno: ${String((e as Error)?.message ?? e)}` }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, detail: "Usa POST con { email }." }, { status: 405 });
}
