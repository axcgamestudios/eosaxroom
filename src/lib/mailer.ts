/* ============================================================
   Envío del código OTP por correo real — lado servidor
   ------------------------------------------------------------
   Cadena honesta de proveedores:
   1. RESEND_API_KEY configurada → Resend (API con clave: funciona
      desde cualquier servidor, plan gratuito de 100 correos/día).
      Variables: RESEND_API_KEY y opcional RESEND_FROM
      (p. ej. "AXC OS <no-reply@tudominio.com>").
   2. Sin clave → FormSubmit (https://formsubmit.co — gratuito y sin
      cuenta, la primera vez pide activar un enlace desde el propio
      correo). OJO: FormSubmit está detrás de Cloudflare y puede
      rechazar IPs de centro de datos; si falla se devuelve el error
      honesto y el cliente puede reintentar desde su navegador.
   Nunca se finge un envío: sin proveedor disponible, ok=false.
   ============================================================ */

export interface SendOtpResult {
  ok: boolean;
  provider: "resend" | "formsubmit";
  detail: string;
}

const SUBJECT = "Tu código de verificación · AXC ID (axcsOS)";

function otpHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0"><tr><td align="center">
    <table role="presentation" width="420" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.08)">
      <tr><td style="background:linear-gradient(135deg,#0f766e,#14b8a6);padding:26px 32px;color:#fff">
        <div style="font-size:18px;font-weight:700">🍐 axcsOS · AXC ID</div>
        <div style="font-size:12px;opacity:.85;margin-top:2px">Verificación de correo</div>
      </td></tr>
      <tr><td style="padding:30px 32px 12px">
        <p style="margin:0 0 6px;font-size:15px;color:#1f2937">Tu código de verificación es:</p>
        <div style="margin:14px 0 18px;text-align:center;background:#f0fdfa;border:1px dashed #14b8a6;border-radius:12px;padding:14px;font-size:34px;letter-spacing:12px;font-weight:700;color:#0f766e">${code}</div>
        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.6">Caduca en <b>10 minutos</b>. Si no has pedido este código, ignora este correo: nadie más podrá usarlo.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 30px">
        <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6">Este correo verifica tu dirección para que axcsOS la use al iniciar sesión en páginas web (autocompletado de credenciales). Nunca compartas el código.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function otpText(code: string): string {
  return `Tu código de verificación de AXC ID (axcsOS) es ${code}. Caduca en 10 minutos. Si no lo has pedido, ignora este correo.`;
}

async function sendWithResend(to: string, code: string): Promise<SendOtpResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, provider: "resend", detail: "sin clave" };
  const from = process.env.RESEND_FROM || "AXC OS <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: SUBJECT, html: otpHtml(code), text: otpText(code) }),
    });
    if (res.ok) return { ok: true, provider: "resend", detail: "Enviado con Resend." };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, provider: "resend", detail: `Resend rechazó el envío (${res.status}): ${body?.message ?? "sin detalle"}` };
  } catch (e) {
    return { ok: false, provider: "resend", detail: `Sin conexión con Resend (${String((e as Error)?.message ?? e)})` };
  }
}

async function sendWithFormsubmit(to: string, code: string): Promise<SendOtpResult> {
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: SUBJECT,
        _template: "table",
        _captcha: "false",
        Sistema: "axcsOS · AXC ID",
        Codigo: code,
        Mensaje: otpText(code),
      }),
    });
    const data = (await res.json().catch(() => null)) as { success?: string; message?: string } | null;
    if (res.ok && data && String(data.success) === "true") {
      const activation = /activat/i.test(data.message ?? "");
      return {
        ok: true,
        provider: "formsubmit",
        detail: activation
          ? "La primera vez FormSubmit pide activar su enlace desde tu correo; luego pide el código de nuevo."
          : "Enviado con FormSubmit.",
      };
    }
    const why = data?.message || `FormSubmit respondió ${res.status}`;
    if (/activat/i.test(why)) {
      return { ok: false, provider: "formsubmit", detail: "Primera vez con este correo: abre el enlace de activación que te llegó y pide el código de nuevo." };
    }
    return { ok: false, provider: "formsubmit", detail: `FormSubmit no aceptó el envío: ${why}` };
  } catch {
    return { ok: false, provider: "formsubmit", detail: "Sin conexión con FormSubmit (el proveedor bloquea algunas IP de servidor)." };
  }
}

/** Envía el código por el primer proveedor disponible. Nada de fingir envíos. */
export async function sendOtpEmail(to: string, code: string): Promise<SendOtpResult> {
  if (process.env.RESEND_API_KEY) {
    const r = await sendWithResend(to, code);
    if (r.ok) return r;
    // Resend con clave pero fallo puntual: se intenta FormSubmit de respaldo
    const f = await sendWithFormsubmit(to, code);
    if (f.ok) return f;
    return { ok: false, provider: "resend", detail: `${r.detail} · tampoco el respaldo: ${f.detail}` };
  }
  return sendWithFormsubmit(to, code);
}
