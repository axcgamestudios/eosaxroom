/* ============================================================
   Apps nativas instalables desde la App Store (Unity, Unity
   Player…). Persiste la instalación en localStorage y expone
   los ids instalados; Dock y Launchpad las muestran al instalar.
   ============================================================ */

const KEY = "axcsos-native-apps";

export interface NativeInstall { id: string; installedAt: number }

export function installedNativeIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as NativeInstall[];
    return list.map((x) => x.id);
  } catch {
    return [];
  }
}

export function isNativeInstalled(id: string): boolean {
  return installedNativeIds().includes(id);
}

/** Instala (y devuelve la lista nueva). "apps relacionadas" se instalan juntas. */
export function installNative(ids: string[]): string[] {
  const current = installedNativeIds();
  const all = [...new Set([...current, ...ids])];
  window.localStorage.setItem(KEY, JSON.stringify(all.map((id) => ({ id, installedAt: Date.now() }))));
  // evento para que Dock/Launchpad/AppStore se enteren sin recargar
  window.dispatchEvent(new CustomEvent("native-apps-changed"));
  return all;
}

export function uninstallNative(id: string): string[] {
  const all = installedNativeIds().filter((x) => x !== id);
  window.localStorage.setItem(KEY, JSON.stringify(all.map((x) => ({ id: x, installedAt: Date.now() }))));
  window.dispatchEvent(new CustomEvent("native-apps-changed"));
  return all;
}

/** hook-lite: suscripción a cambios (sin React 18 useSyncExternalStore innecesario) */
export function onNativeAppsChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener("native-apps-changed", h);
  return () => window.removeEventListener("native-apps-changed", h);
}
