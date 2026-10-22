"use client";

/* ============================================================
   Sesión web ligada al perfil — cookies del motor por cuenta
   ------------------------------------------------------------
   El motor del navegador (Scramjet) guarda sus cookies de sitio
   en IndexedDB ($scramjet): por eso las sesiones SOBREVIVEN a
   cierres y reinicios del navegador sin tocar nada.

   Esta capa asocia ese jar de cookies al ID del perfil con sesión:
   * MISMO perfil → el jar se conserva tal cual: las páginas
     mantienen la sesión iniciada automáticamente (requisito).
   * PERFIL DISTINTO (cambio de cuenta en este dispositivo) → el
     jar se borra de verdad y las sesiones de una cuenta jamás se
     mezclan con las de otra. Realidad técnica honesta: mientras
     el motor está vivo mantiene la base abierta (el borrado
     inmediato queda bloqueado), así que el borrado se marca como
     PENDIENTE y se ejecuta en el próximo arranque, ANTES de que
     el motor abra su primera conexión (engine/engineData.ts).
     Al cambiar de cuenta el navegador se REINICIA (como cambia
     de usuario un sistema operativo real) y entra ya limpio.
   * Conmutador en Ajustes → Cuenta (activo por defecto).
   ============================================================ */

import { consumePendingEngineClear, deleteEngineDatabase, setPendingEngineClear } from "../engine/engineData";
import { appBase } from "../engine/scramjet";

const LS_BINDING = "axcsos.websession.binding";
const LS_ENABLED = "axcsos.websession.enabled";

interface Binding {
  profileKey: string; // accountId de la cuenta con sesión
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

/** ¿El usuario tiene activado ligar las cookies del motor a la cuenta? (por defecto sí) */
export function isWebSessionBindingEnabled(): boolean {
  try {
    const v = localStorage.getItem(LS_ENABLED);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setWebSessionBindingEnabled(on: boolean): void {
  try {
    localStorage.setItem(LS_ENABLED, on ? "1" : "0");
  } catch {
    /* ignore */
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
 * Enlaza el jar de cookies del motor al perfil con sesión.
 * - mismo perfil → no toca nada (las sesiones persisten: requisito)
 * - perfil distinto → borrado pendiente + reinicio del navegador:
 *   entra ya limpio, sin heredar NADA de la cuenta anterior.
 * Llamar al iniciar sesión (store.login).
 */
export async function bindEngineSessionToProfile(profileKey: string): Promise<void> {
  if (!profileKey) return;
  if (!isWebSessionBindingEnabled()) return; // desactivado: jar compartido (comportamiento clásico)
  const bound = readBinding();
  if (bound?.profileKey === profileKey) return; // mismo perfil: conservar sesiones
  writeBinding(profileKey);
  if (bound) {
    // la cuenta cambió en este dispositivo: sus sesiones no se heredan
    await restartBrowserForCleanJar();
  }
  // primer enlace (o después de un borrado manual): no se borra nada de nadie
}

/**
 * Borrado manual de los datos de navegación (Ajustes → Cuenta).
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
