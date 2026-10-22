/* ============================================================
   Datos de navegación del motor ($scramjet IndexedDB) — higiene
   ------------------------------------------------------------
   Módulo SIN dependencias del motor: consumido por ensureEngine
   ANTES de inicializar nada (cuando nadie tiene la base abierta).
   ============================================================ */

const LS_PENDING_CLEAR = "axcsos.websession.pendingClear";

/** La base del motor: cookies de sitios, localStorage de sitios, etc. */
export const ENGINE_DB = "$scramjet";

export function setPendingEngineClear(): void {
  try {
    localStorage.setItem(LS_PENDING_CLEAR, "1");
  } catch {
    /* ignore */
  }
}

export function clearPendingEngineClear(): void {
  try {
    localStorage.removeItem(LS_PENDING_CLEAR);
  } catch {
    /* ignore */
  }
}

export function hasPendingEngineClear(): boolean {
  try {
    return localStorage.getItem(LS_PENDING_CLEAR) === "1";
  } catch {
    return false;
  }
}

/**
 * Borra la base del motor. SOLO funciona cuando ninguna conexión
 * la tiene abierta (el controller del motor y el Service Worker
 * mantienen conexiones mientras viven): llamar ANTES de inicializar
 * el motor en una página recién cargada.
 */
export function deleteEngineDatabase(timeoutMs = 8000): Promise<boolean> {
  if (typeof indexedDB === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((res) => {
    let done = false;
    const fin = (v: boolean) => {
      if (!done) {
        done = true;
        res(v);
      }
    };
    try {
      const req = indexedDB.deleteDatabase(ENGINE_DB);
      req.onsuccess = () => fin(true);
      req.onerror = () => fin(false);
      req.onblocked = () => fin(false); // alguien la tiene abierta (otra pestaña viva)
      setTimeout(() => fin(false), timeoutMs);
    } catch {
      fin(false);
    }
  });
}

/**
 * Arranque: si hay un borrado pendiente (cambio de cuenta o borrado
 * manual), se ejecuta AHORA — antes de que el motor abra su primera
 * conexión, que es el único momento en que el borrado es real.
 * Si no se puede (otra pestaña del OS con el motor vivo), el borrado
 * queda pendiente para el próximo arranque (honesto).
 */
export async function consumePendingEngineClear(): Promise<boolean> {
  if (!hasPendingEngineClear()) return false;
  const ok = await deleteEngineDatabase();
  if (ok) clearPendingEngineClear();
  return ok;
}
