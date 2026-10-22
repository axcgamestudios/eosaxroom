"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RotateCw, XCircle } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import YouTubeApp, { parseYouTubeUrl } from "./YouTube";
import {
  ensureEngine,
  recoverEngine,
  type ScramjetControllerApi,
  type ScramjetFrameApi,
} from "../engine/scramjet";
import {
  directOkHosts,
  faviconFor,
  hostOf,
  looksLikeErrorPage,
  pageSignature,
  rememberDirectOk,
} from "../engine/pageload";
import { findWebAppById, WEBAPP_PREFIX } from "../services/webapps";

/* ============================================================
   WebAppFrame — ventana NATIVA de una página instalada como app
   ------------------------------------------------------------
   Una app instalada (App Store o Safari → Instalar como app)
   corre con el motor Scramjet dentro de su propia ventana, sin
   chrome de navegador. Escalera honesta:
   motor → conexión directa (IP del usuario) → error con salida
   a Safari. YouTube instalado → cliente nativo del OS.
   ============================================================ */

type Phase = "engine" | "direct" | "error";

const ENGINE_STALL_MS = 20000; // sin progreso del documento por el motor
const ENGINE_CAP_MS = 45000; // tope antes de probar directo
const DIRECT_STALL_MS = 26000; // directo colgado → error honesto

/* espera (fuera del componente) a que el iframe esté montado */
function waitForElement(get: () => HTMLIFrameElement | null, ms = 2500): Promise<HTMLIFrameElement | null> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const check = () => {
      const el = get();
      if (el) return resolve(el);
      if (Date.now() - t0 > ms) return resolve(null);
      setTimeout(check, 40);
    };
    check();
  });
}

export default function WebAppFrame({ win }: AppProps) {
  // el Dock/Launchpad abren sin payload: el manifiesto se resuelve desde el appId
  const manifestId =
    win.appId.startsWith(WEBAPP_PREFIX)
      ? win.appId.slice(WEBAPP_PREFIX.length)
      : ((win.payload?.manifestId as string) ?? "");
  const url = (win.payload?.url as string) ?? findWebAppById(manifestId)?.url ?? "";
  const winId = win.id;

  const setWindowTitle = useOS((s) => s.setWindowTitle);
  const openApp = useOS((s) => s.openApp);
  const notify = useOS((s) => s.notify);
  const browser = useOS((s) => s.browser);

  const [title, setTitle] = useState(hostOf(url) || "App");
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>(directOkHosts().includes(hostOf(url)) ? "direct" : "engine");
  const [error, setError] = useState<string | null>(null);
  const [fNonce, setFNonce] = useState(0); // remonta el iframe directo

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameRef = useRef<ScramjetFrameApi | null>(null);
  const ctrlRef = useRef<ScramjetControllerApi | null>(null);
  const ladderRef = useRef<{ start: number; lastProgress: number; lastSig: string } | null>(null);
  const aliveRef = useRef(true);

  /* vista YouTube estable (objeto memoizado: no se recrea en cada render) */
  const ytView = useMemo(() => parseYouTubeUrl(url), [url]);

  /* ------- carga por el motor ------- */
  /* eslint-disable react-hooks/preserve-manual-memoization -- el compilador de React no está activo en este proyecto; la memoización manual de esta función asíncrona con refs es correcta */
  const loadWithEngine = useCallback(
    async (fresh: boolean) => {
      if (!url || ytView) return;
      setError(null);
      setLoading(true);
      setPhase("engine");
      ladderRef.current = { start: Date.now(), lastProgress: Date.now(), lastSig: "" };
      try {
        const ctrl = await ensureEngine(browser.wispUrl);
        if (!aliveRef.current) return;
        ctrlRef.current = ctrl;
        // iframe montado (en modo motor nace en about:blank)
        const iframe = await waitForElement(() => iframeRef.current);
        if (!aliveRef.current || !iframe) return;
        if (fresh || !frameRef.current) {
          frameRef.current = ctrl.createFrame(iframe);
          frameRef.current.addEventListener("urlchange", () => {
            if (ladderRef.current) {
              ladderRef.current.lastProgress = Date.now();
              ladderRef.current.lastSig = "";
            }
          });
        }
        frameRef.current.go(url);
      } catch (e) {
        console.error("[webapp] motor:", e);
        // una última carta: directo
        setPhase("direct");
        setFNonce((n) => n + 1);
        setLoading(true);
      }
    },
    [browser.wispUrl, url, ytView]
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  /* ------- ciclo de vida de la ventana ------- */
  useEffect(() => {
    aliveRef.current = true;
    if (!url || ytView) return;
    // arranque diferido: el estado inicial ya es "cargando" y así el efecto
    // no cambia estado de forma síncrona (sin renders en cascada)
    const t = setTimeout(() => {
      if (!aliveRef.current) return;
      if (directOkHosts().includes(hostOf(url))) {
        // memoria compartida con Safari: este sitio va mejor en directo
        setLoading(true);
        ladderRef.current = { start: Date.now(), lastProgress: Date.now(), lastSig: "" };
      } else {
        void loadWithEngine(false);
      }
    }, 0);
    return () => {
      aliveRef.current = false;
      frameRef.current = null;
      clearTimeout(t);
    };
  }, [url, ytView, loadWithEngine]);

  /* ------- escalera de carga: ninguna app puede quedarse cargando para siempre ------- */
  useEffect(() => {
    if (!url || ytView) return;
    const iv = setInterval(() => {
      const l = ladderRef.current;
      if (!l || !loading) return;
      const now = Date.now();
      if (phase === "engine") {
        let sig = "";
        try {
          sig = pageSignature(iframeRef.current?.contentDocument);
        } catch {
          sig = "";
        }
        if (sig && sig !== l.lastSig) {
          l.lastSig = sig;
          l.lastProgress = now;
          try {
            const t = (iframeRef.current?.contentDocument?.title ?? "").trim();
            if (t) setTitle(t);
          } catch {
            /* ignore */
          }
        }
        const stalled = now - l.lastProgress > ENGINE_STALL_MS;
        const overdue = now - l.start > ENGINE_CAP_MS;
        if (stalled || overdue) {
          notify("webapp", "Probando conexión directa", `${hostOf(url)} no avanzó con el motor; probando desde tu conexión…`);
          setPhase("direct");
          setFNonce((n) => n + 1);
          setLoading(true);
          ladderRef.current = { start: now, lastProgress: now, lastSig: "" };
        }
        return;
      }
      if (phase === "direct") {
        if (now - l.start > DIRECT_STALL_MS) {
          ladderRef.current = null;
          setLoading(false);
          setError(
            `${hostOf(url)} no cargó ni con el motor ni con tu conexión directa. Puede que el sitio bloquee este tipo de acceso (IP de servidor o prohibición de marcos).`
          );
        }
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [loading, phase, url, ytView, notify]);

  /* ------- título de la ventana con el título real de la página ------- */
  useEffect(() => {
    setWindowTitle(winId, `${title} · app`);
  }, [title, winId, setWindowTitle]);

  /* ------- recarga ------- */
  /* eslint-disable-next-line react-hooks/preserve-manual-memoization -- compilador de React no activo en el proyecto */
  const reload = useCallback(() => {
    setError(null);
    if (ytView) {
      setLoading(true);
      setFNonce((n) => n + 1);
      setTimeout(() => setLoading(false), 400);
      return;
    }
    if (phase === "engine" && frameRef.current) {
      setLoading(true);
      ladderRef.current = { start: Date.now(), lastProgress: Date.now(), lastSig: "" };
      try {
        frameRef.current.reload();
        return;
      } catch {
        /* frame muerto: reintento completo */
      }
    }
    void loadWithEngine(true);
  }, [loadWithEngine, phase, ytView]);

  /* ------- render ------- */
  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white text-neutral-500 dark:bg-neutral-950">
        <XCircle size={30} className="text-neutral-400" />
        <p className="text-[12px]">Esta app ya no está instalada.</p>
      </div>
    );
  }

  /* YouTube instalado → cliente nativo del OS (sin motor, sin login) */
  if (ytView) {
    return (
      <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
        <WebAppToolbar
          host="YouTube"
          title={title}
          favicon={faviconFor("https://www.youtube.com")}
          loading={loading}
          onReload={reload}
          onOpenSafari={() => openApp("safari", { payload: { url } })}
          url={url}
        />
        <div className="min-h-0 flex-1">
          <YouTubeApp key={`${winId}|${fNonce}`} win={win} embedded initialView={ytView} onTitle={(t) => setTitle(t)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <WebAppToolbar
        host={hostOf(url)}
        title={title}
        favicon={faviconFor(url)}
        loading={loading}
        direct={phase === "direct"}
        onReload={reload}
        onOpenSafari={() => openApp("safari", { payload: { url } })}
        url={url}
      />

      <div className="relative min-h-0 flex-1">
        <iframe
          key={`f${fNonce}|d${phase === "direct" ? 1 : 0}`}
          ref={(el) => {
            iframeRef.current = el;
          }}
          title={title}
          src={phase === "direct" ? url : "about:blank"}
          className="h-full w-full border-0 bg-white"
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write; gamepad; cross-origin-isolated"
          onLoad={() => {
            if (phase === "direct") {
              const doc = (() => {
                try {
                  return iframeRef.current?.contentDocument ?? null;
                } catch {
                  return null;
                }
              })();
              // el propio navegador puede mostrar su rechazo dentro del marco
              ladderRef.current = null;
              setLoading(false);
              const host = hostOf(url);
              setTimeout(() => rememberDirectOk(host), 8000);
              return;
            }
            // modo motor: ¿página de error del servidor? → directo
            let doc: Document | null | null = null;
            try {
              doc = iframeRef.current?.contentDocument ?? null;
            } catch {
              doc = null;
            }
            if (looksLikeErrorPage(doc)) {
              setPhase("direct");
              setFNonce((n) => n + 1);
              setLoading(true);
              ladderRef.current = { start: Date.now(), lastProgress: Date.now(), lastSig: "" };
              return;
            }
            ladderRef.current = null;
            setLoading(false);
            try {
              const d = iframeRef.current?.contentDocument;
              const t = (d?.title ?? "").trim();
              if (t) setTitle(t);
            } catch {
              /* ignore */
            }
          }}
        />

        {loading && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
            <div className="animate-progress h-full w-1/3 rounded-full bg-[var(--accent-os)]" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/95 p-6 text-center backdrop-blur-sm dark:bg-neutral-900/95">
            <XCircle size={38} className="shrink-0 text-red-500" />
            <div className="max-w-md space-y-1">
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">La app no cargó</p>
              <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{error}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void recoverEngine("reintento de app").finally(() => void loadWithEngine(true))}
                className="rounded-lg bg-[var(--accent-os)] px-3.5 py-1.5 text-xs font-medium text-white shadow transition hover:opacity-90"
              >
                Reintentar
              </button>
              <button
                onClick={() => openApp("safari", { payload: { url } })}
                className="flex items-center gap-1.5 rounded-lg bg-black/5 px-3.5 py-1.5 text-xs font-medium text-neutral-700 shadow transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20"
              >
                <ExternalLink size={12} /> Abrir en Safari
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- barra fina de app nativa ---------- */

function WebAppToolbar({
  host,
  title,
  favicon,
  loading,
  direct,
  onReload,
  onOpenSafari,
  url,
}: {
  host: string;
  title: string;
  favicon: string;
  loading: boolean;
  direct?: boolean;
  onReload: () => void;
  onOpenSafari: () => void;
  url: string;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-black/8 bg-neutral-100/85 px-3 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-900/85">
      {favicon ? (
        <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded-[3px]" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-200">{title}</span>
      {direct && (
        <span
          className="flex h-[18px] shrink-0 items-center rounded-full bg-sky-500/15 px-2 text-[9.5px] font-semibold text-sky-600 dark:text-sky-400"
          title="Esta app usa conexión directa (tu IP), sin motor: el sitio bloquea la IP de los motores pero permite mostrarse aquí."
        >
          directa
        </span>
      )}
      <button
        onClick={onReload}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/10 dark:text-neutral-400 dark:hover:bg-white/10"
        title="Recargar app"
      >
        <RotateCw size={13} className={loading ? "animate-spin" : ""} />
      </button>
      <button
        onClick={onOpenSafari}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-neutral-500 transition hover:bg-black/10 dark:text-neutral-400 dark:hover:bg-white/10"
        title={`Abrir ${url} en una pestaña de Safari`}
      >
        <ExternalLink size={12} /> Safari
      </button>
    </div>
  );
}
