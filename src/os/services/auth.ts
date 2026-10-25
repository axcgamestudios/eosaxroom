"use client";

/* ============================================================
   Identidad del dispositivo
   ------------------------------------------------------------
   axcsOS ya no usa cuentas: se entra escribiendo cualquier
   cosa y el perfil (nombre, foto) vive en este navegador.
   Lo único que sigue haciendo falta es una identidad estable
   del dispositivo (la usa, p. ej., la bóveda de contraseñas
   para derivar su clave AES-256).
   ============================================================ */

const LS_DEVICE = "axcsos.device";

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
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
