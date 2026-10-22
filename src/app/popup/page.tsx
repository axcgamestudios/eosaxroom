"use client";

/* ============================================================
   Ventana real de axcsOS — visor del motor en ventana propia
   ------------------------------------------------------------
   Algunos sitios (p. ej. Google) bloquean los inicios de sesión
   en páginas embebidas (iframes) aunque el navegador sea real:
   detectan que no son la ventana de nivel superior y rechazan
   el acceso con "este navegador no es seguro".

   Esta página vive en una VENTANA REAL de nivel superior abierta
   por Safari. Como comparte origen (y Service Worker) con el OS,
   el motor Scramjet funciona aquí con el MISMO frasco de cookies:
   la sesión iniciada en esta ventana queda dentro de axcsOS y al
   cerrarla Safari recarga la pestaña para mostrarla.

   Además del motor, la barra ofrece "Con mi conexión": navega
   esta misma ventana al sitio REAL (IP del usuario, sin motor)
   para los casos en que el sitio también rechaza la IP de los
   servidores del motor.
   ============================================================ */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Globe, Loader2, RotateCw, ShieldAlert, X } from "lucide-react";
import { PearLogo } from "@/os/icons";
import {
  defaultWisp,
  ensureEngine,
  onDiagnostics,
  getDiagnostics,
  type EngineDiagnostics,
  type ScramjetControllerApi,
  type ScramjetFrameApi,
} from "@/os/engine/scramjet";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* tema del OS leído del store persistido (mismo origen → mismo localStorage),
   sin importar el store completo: la ventana debe cargar ligera */
function readOsTheme(): { appearance: string; accent: string } {
  try {
    const raw = localStorage.getItem("axcsos");
    if (!raw) return { appearance: "dark", accent: "#0a84ff" };
    const parsed = JSON.parse(raw) as {
      state?: { settings?: { appearance?: string; accent?: string } };
    };
    return {
      appearance: parsed.state?.settings?.appearance ?? "dark",
      accent: parsed.state?.settings?.accent ?? "#0a84ff",
    };
  } catch {
    return { appearance: "dark", accent: "#0a84ff" };
  }
}

export default function PopupViewerPage() {
  return (
    <Suspense fallback={null}>
      <PopupInner />
    </Suspense>
  );
}

function PopupInner() {
  const sp = useSearchParams();
  const url = sp.get("u") ?? "";
  const valid = /^https?:\/\//i.test(url);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(valid ? null : "Falta la dirección para la ventana real.");
  const [diag, setDiag] = useState<EngineDiagnostics>(getDiagnostics());

  const ctrlRef = useRef<ScramjetControllerApi | null>(null);
  const frameRef = useRef<ScramjetFrameApi | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadNonce = useRef(0); // reintento limpio del frame

  /* ---------- tema del OS (ligero, sin store) ---------- */
  useEffect(() => {
    const t = readOsTheme();
    const root = document.documentElement;
    root.classList.toggle("dark", t.appearance === "dark");
    root.style.setProperty("--accent-os", t.accent);
    document.title = valid ? `Ventana real · ${hostOf(url)} · axcsOS` : "Ventana real · axcsOS";
  }, [valid, url]);

  /* ---------- diagnóstico del motor ---------- */
  useEffect(() => onDiagnostics(setDiag), []);

  /* ---------- cargar por el motor ---------- */
  const load = useCallback(async (target: string) => {
    const nonce = ++loadNonce.current;
    try {
      const ctrl = await ensureEngine(getDiagnostics().wispUrl || defaultWisp());
      if (nonce !== loadNonce.current) return; // llegó un reintento más nuevo
      // los cambios de estado van DESPUÉS del await: así el efecto que dispara
      // la primera carga no hace setState síncrono (regla del compilador de React)
      setLoading(true);
      setError(null);
      ctrlRef.current = ctrl;

      const iframe = iframeRef.current;
      if (!iframe) return; // desmontado

      let frame = frameRef.current;
      if (!frame) {
        frame = ctrl.createFrame(iframe);
        frameRef.current = frame;
        frame.addEventListener("urlchange", (e) => {
          const u = (e as unknown as { url: string }).url;
          if (u && hostOf(u)) document.title = `Ventana real · ${hostOf(u)} · axcsOS`;
        });
      }
      frame.go(target);
    } catch (e) {
      if (nonce !== loadNonce.current) return;
      console.error("[popup] motor:", e);
      setError(
        "El motor no pudo arrancar en esta ventana. Puede reintentarse o abrirse con tu conexión (ventana real sin motor)."
      );
      setLoading(false);
      return;
    }
    // el estado "cargando" se limpia en el onLoad del iframe (progreso real)
  }, []);

  /* el iframe siempre existe (motor); el onLoad marca el fin de la carga */
  useEffect(() => {
    if (valid && !error) void load(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid]);

  const reload = useCallback(() => {
    if (valid) {
      setLoading(true);
      void load(url);
    }
  }, [load, url, valid]);

  /** escape honesto: esta misma ventana navega al sitio REAL (IP del usuario) */
  const goDirect = useCallback(() => {
    if (valid) window.location.replace(url);
  }, [url, valid]);

  const close = useCallback(() => {
    window.close();
    // si el navegador no permite cerrar (no fue abierta por script), avisar
    setTimeout(() => setError("Esta ventana no se puede cerrar automáticamente; ciérrala tú."), 50);
  }, []);

  /* avisar a la ventana que abrió (Safari recarga la pestaña al enterarse) */
  useEffect(() => {
    const post = () => {
      try {
        window.opener?.postMessage({ type: "axcsos-realwin", event: "pagehide" }, window.location.origin);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", post);
    return () => {
      window.removeEventListener("pagehide", post);
      post();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* barra de la ventana real */}
      <div className="glass lg-specular relative z-10 flex h-11 shrink-0 items-center gap-2 border-b border-black/10 px-3 dark:border-white/10">
        <PearLogo className="h-4 w-4 shrink-0" />
        <Globe size={13} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{hostOf(url) || "axcsOS"}</span>
        <span
          className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-sky-600 dark:text-sky-400"
          title="Esta ventana usa el motor de navegación de axcsOS: la sesión iniciada aquí queda dentro del sistema."
        >
          motor
        </span>
        <button
          onClick={reload}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Recargar"
        >
          <RotateCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={goDirect}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Abrir este sitio con TU conexión (IP del usuario, sin motor): útil si el sitio rechaza la IP de los servidores del motor. La sesión quedará en tu navegador, no en axcsOS."
        >
          <ExternalLink size={12} />
          Con mi conexión
        </button>
        <button
          onClick={close}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Cerrar ventana"
        >
          <X size={14} />
        </button>
      </div>

      {/* contenido */}
      <div className="relative min-h-0 flex-1">
        <iframe
          ref={iframeRef}
          title={hostOf(url) || "Ventana real"}
          src="about:blank"
          className="h-full w-full border-0 bg-white dark:bg-neutral-900"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write; gamepad"
          onLoad={() => setLoading(false)}
        />

        {loading && !error && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-8">
            <div className="glass lg-specular flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-300">
              <Loader2 size={12} className="animate-spin" />
              Cargando {hostOf(url)} por el motor…
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/95 p-6 text-center backdrop-blur-sm dark:bg-neutral-900/95">
            <ShieldAlert size={38} className="shrink-0 text-amber-500" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-semibold">La ventana real no pudo cargar</p>
              <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{error}</p>
              {diag.status === "error" && diag.error && (
                <p className="text-[10.5px] text-neutral-400">Detalle del motor: {diag.error}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={reload}
                disabled={!valid}
                className="rounded-lg bg-[var(--accent-os)] px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-40"
              >
                Reintentar con el motor
              </button>
              <button
                onClick={goDirect}
                disabled={!valid}
                className="rounded-lg bg-black/5 px-3.5 py-1.5 text-xs font-medium transition hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:hover:bg-white/20"
              >
                Abrir con mi conexión
              </button>
              <button
                onClick={() => window.close()}
                className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
