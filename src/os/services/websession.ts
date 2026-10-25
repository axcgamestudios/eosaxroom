"use client";

/* ============================================================
   Sesión web del perfil local — cookies del motor
   ------------------------------------------------------------
   El motor del navegador (Scramjet) guarda sus cookies de sitio
   en IndexedDB ($scramjet): por eso las sesiones SOBREVIVEN a
   cierres y reinicios del navegador sin tocar nada.

   Sin cuentas, el perfil es uno y local: el jar se conserva
   siempre (las páginas mantienen la sesión iniciada) y el
   borrado manual real sigue disponible en Ajustes → Perfil.
   Realidad técnica honesta: mientras el motor está vivo mantiene
   la base abierta (el borrado inmediato queda bloqueado), así que
   el borrado se marca como PENDIENTE y se ejecuta en el próximo
   arranque, ANTES de que el motor abra su primera conexión
   (engine/engineData.ts).
   ============================================================ */

import { consumePendingEngineClear, deleteEngineDatabase, setPendingEngineClear } from "../engine/engineData";
import { appBase } from "../engine/scramjet";

const LS_BINDING = "axcsos.websession.binding";

interface Binding {
  profileKey: string; // perfil local con sesión
  ts: number;
}

function readBinding(): Binding | null {
  try {
    const raw = localStorage.getItem(LS_BINDING);
    if (!raw) return null;
    const b = JSON.parse(raw) as Binding;
    return b && typeof b.profileKey === "string" ? b : null;
  } catch {
    return null;
  }
}

function writeBinding(profileKey: string): void {
  try {
    localStorage.setItem(LS_BINDING, JSON.stringify({ profileKey, ts: Date.now() }));
  } catch {
    /* sin almacenamiento: el enlace vive solo esta sesión */
  }
}

/**.unregister + borrado programado + recarga: el navegador entra limpio. */
async function restartBrowserForCleanJar(): Promise<void> {
  setPendingEngineClear(); // se consumirá en el próximo arranque, antes de init del motor
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.(`${appBase()}/sw.js`);
    await reg?.unregister(); // el SW nuevo no debe abrir la base vieja antes de tiempo
  } catch {
    /* best effort */
  }
  // un instante para que la notificación se vea, y recarga (como un cambio de usuario real)
  setTimeout(() => window.location.reload(), 1400);
}

/**
 * Enlaza el jar de cookies del motor al perfil local con sesión.
 * - mismo perfil → no toca nada (las sesiones persisten: requisito)
 * - perfil distinto (p. ej. tras un cambio de nombre de perfil) → borrado
 *   pendiente + reinicio del navegador: entra ya limpio.
 * Llamar al iniciar sesión (store.login).
 */
export async function bindEngineSessionToProfile(profileKey: string): Promise<void> {
  if (!profileKey) return;
  const bound = readBinding();
  if (bound?.profileKey === profileKey) return; // mismo perfil: conservar sesiones
  writeBinding(profileKey);
  if (bound) {
    // el perfil cambió en este dispositivo: sus sesiones no se heredan
    await restartBrowserForCleanJar();
  }
  // primer enlace (o después de un borrado manual): no se borra nada de nadie
}

/**
 * Borrado manual de los datos de navegación (Ajustes → Perfil).
 * Honesto: mientras el motor esté vivo NO se puede borrar en caliente
 * (la base queda bloqueada) → se marca el borrado y se reinicia el
 * navegador; al arrancar, consumePendingEngineClear() lo ejecuta antes
 * de que el motor abra su primera conexión.
 */
export async function clearEngineSiteData(): Promise<{ ok: boolean; restarts: boolean; detail: string }> {
  // si el motor aún no vive en esta página: borrado inmediato real
  const swAlive = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
  if (!swAlive) {
    const ok = await deleteEngineDatabase();
    if (ok) {
      setPendingEngineClear();
      await consumePendingEngineClear(); // limpia el flag (ya borrado)
      return { ok: true, restarts: false, detail: "Datos de navegación del motor borrados (el motor no estaba en uso)." };
    }
  }
  await restartBrowserForCleanJar();
  return {
    ok: true,
    restarts: true,
    detail: "Reiniciando el navegador para borrar los datos de navegación de verdad (las pestañas se cierran).",
  };
}
