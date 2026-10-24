"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Clock,
  Download as DownloadIcon,
  ExternalLink,
  Globe,
  History as HistoryIcon,
  Home,
  Lock,
  Mail as MailIconLucide,
  KeyRound,
  MonitorDown,
  MoreVertical,
  Plus,
  RotateCw,
  Search,
  Settings2,
  ShieldAlert,
  Star,
  X,
  XCircle,
} from "lucide-react";
import type { AppProps } from "../types";
import { useOS, setDownloadObjectUrl } from "../store";
import YouTubeApp, { parseYouTubeUrl } from "./YouTube";
import {
  appBase,
  applyTransport,
  DEMO_WISP,
  ensureEngine,
  engineFetch,
  getDiagnostics,
  MAIN_WISP,
  onDiagnostics,
  onEngineDownload,
  recoverEngine,
  streamToBlob,
  testWisp,
  type EngineDiagnostics,
  type ScramjetControllerApi,
  type ScramjetFrameApi,
} from "../engine/scramjet";
import { findWebAppByUrl, installWebApp } from "../services/webapps";
import {
  identityEmail,
  useAutofillAssistant,
  type AutofillCtx,
} from "../services/autofill";
import { looksLikeErrorPage } from "../engine/pageload";

/* ============================================================
   Safari axcsOS v4 — motor real Scramjet (SW + wisp)
   - Pestañas múltiples con estado independiente (iframes vivos)
   - Barra de direcciones: URL, dominio o búsqueda (DDG integrado)
   - Atrás/Adelante/Recargar/Detener/Inicio reales (ScramjetFrame)
   - Historial + marcadores persistentes (store)
   - Popups y _blank → pestañas internas (nunca salir del OS)
   - Descargas integradas (interceptadas por el SW)
   - Errores del motor y de cada sitio visibles y diagnosticables
   ============================================================ */

const START = "about:start";
const SEARCH_PREFIX = "axcs:search?q=";

interface Tab {
  id: string;
  url: string; // URL real o about:start / axcs:search?q=
  title: string;
  favicon: string;
  loading: boolean;
  pinned: boolean;
  history: string[]; // historial de la pestaña (URLs/acciones)
  hIndex: number; // posición actual en el historial
  rNonce?: number; // contador para forzar recarga de vistas nativas (YouTube)
  fNonce?: number; // contador para forzar iframe limpio al alternar motor ↔ directo
  direct?: boolean; // modo conexión directa: iframe real SIN motor (IP del usuario)
  error?: string; // error visible de carga (p. ej. motor sin respuesta), con reintento
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  host: string;
}

const FAV_LETTER: Record<string, { color: string; letter: string }> = {
  "axcgamestudios.github.io": { color: "linear-gradient(135deg,#6366f1,#ec4899)", letter: "A" },
  "www.youtube.com": { color: "linear-gradient(135deg,#c4302b,#ff0033)", letter: "▶" },
  "es.wikipedia.org": { color: "linear-gradient(135deg,#475569,#0ea5e9)", letter: "W" },
  "duckduckgo.com": { color: "linear-gradient(135deg,#de5833,#f77c3c)", letter: "D" },
};

function faviconFor(url: string): string {
  try {
    const u = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;
  } catch {
    return "";
  }
}

function normalizeInput(raw: string): string {
  const url = raw.trim();
  if (!url) return START;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(url) && !url.includes(" ")) return `https://${url}`;
  return SEARCH_PREFIX + encodeURIComponent(url);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function tabUid(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ---------- memoria de sitios que cargan bien en directo (IP del usuario) ----------
   Cuando un sitio bloquea la IP de los motores (p. ej. CloudFront) pero permite
   mostrarse en un iframe, se recuerda para ir directo a la primera la próxima vez. */
const LS_DIRECT_OK = "axcsos.safari.direct-ok";
function directOkHosts(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(LS_DIRECT_OK) ?? "[]") as string[];
    return Array.isArray(list) ? list.slice(-40) : [];
  } catch {
    return [];
  }
}
function rememberDirectOk(host: string): void {
  if (!host) return;
  try {
    const list = directOkHosts();
    if (!list.includes(host)) {
      list.push(host);
      localStorage.setItem(LS_DIRECT_OK, JSON.stringify(list.slice(-40)));
    }
  } catch {
    /* sin almacenamiento: la memoria vive solo esta sesión */
  }
}

/* (detección de páginas de error compartida: ../engine/pageload.ts) */

/* (detección de formularios, relleno y captura de credenciales: services/autofill.ts) */

/* escalera de carga por pestaña: motor propio → motor de respaldo → conexión directa → error honesto */
type LadderPhase = "engine" | "engineRetry" | "direct" | "error";
interface Ladder {
  start: number;
  lastProgress: number; // último instante con progreso real del documento
  lastSig: string; // firma del documento (motor: mismo origen)
  direct: boolean; // fase actual en directo
  queue: LadderPhase[]; // siguientes intentos si esta fase se estanca
}
const STALL_MS = 14000; // sin progreso del documento
const MIN_TOTAL_MS = 18000; // margen mínimo antes de declarar el estancamiento
const HARD_CAP_MS = 80000; // pasado este tiempo se sube de escalón pase lo que pase

export default function SafariApp({ win }: AppProps) {
  const initialUrl = (win.payload?.url as string) ?? START;
  const winId = win.id;

  const browser = useOS((s) => s.browser);
  const updateBrowser = useOS((s) => s.updateBrowser);
  const bookmarks = useOS((s) => s.bookmarks);
  const addBookmark = useOS((s) => s.addBookmark);
  const removeBookmark = useOS((s) => s.removeBookmark);
  const safariHistory = useOS((s) => s.safariHistory);
  const addHistory = useOS((s) => s.addHistory);
  const removeHistory = useOS((s) => s.removeHistory);
  const clearHistory = useOS((s) => s.clearHistory);
  const addDownload = useOS((s) => s.addDownload);
  const setWindowTitle = useOS((s) => s.setWindowTitle);
  const notify = useOS((s) => s.notify);
  const openApp = useOS((s) => s.openApp);
  const userName = useOS((s) => s.settings.userName);

  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: tabUid(),
      url: initialUrl === START || initialUrl.startsWith(SEARCH_PREFIX) ? initialUrl : initialUrl,
      title: initialUrl === START ? "Nueva pestaña" : hostOf(initialUrl),
      favicon: initialUrl === START ? "" : faviconFor(initialUrl),
      loading: false,
      pinned: false,
      history: [initialUrl],
      hIndex: 0,
    },
  ]);
  const [activeTab, setActiveTab] = useState(0);
  const [address, setAddress] = useState("");
  const [engineDiag, setEngineDiag] = useState<EngineDiagnostics>(getDiagnostics());
  const [panel, setPanel] = useState<null | "bookmarks" | "history">(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [installName, setInstallName] = useState("");
  const [dismissedLoginUrl, setDismissedLoginUrl] = useState("");
  const [dismissedRealwinUrl, setDismissedRealwinUrl] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // ventana real (popup del sistema): referencia + pestaña que la abrió
  const realWinRef = useRef<Window | null>(null);
  const realWinTabRef = useRef<string>("");
  const realWinModeRef = useRef<"engine" | "direct">("engine");

  const ctrlRef = useRef<ScramjetControllerApi | null>(null);
  const framesRef = useRef<Map<string, ScramjetFrameApi>>(new Map());
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  // escalera de carga por pestaña (motor → respaldo → directo → error)
  const hangRef = useRef<Map<string, Ladder>>(new Map());
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeTab);
  tabsRef.current = tabs;
  activeRef.current = activeTab;

  /* ---------------- asistente de acceso (autocompletado) ----------------
     El hook sondea la pestaña activa: detecta formularios de inicio de
     sesión (las páginas del motor son mismo-origen → DOM legible), ofrece
     el CORREO VERIFICADO del perfil (AXC ID) y las contraseñas guardadas
     de la bóveda (AES-256), y captura credenciales nuevas al enviar. */
  const autofillCtxRef = useRef<AutofillCtx>({
    getUrl: () => tabsRef.current[activeRef.current]?.url ?? "",
    getDoc: () => {
      const t = tabsRef.current[activeRef.current];
      if (!t) return null;
      try {
        return iframeRefs.current.get(t.id)?.contentDocument ?? null;
      } catch {
        return null; // cross-origin (modo directo externo)
      }
    },
  });
  const assistant = useAutofillAssistant(autofillCtxRef);
  const snap = assistant.snap;

  /** documento del iframe de la pestaña activa (null si no es accesible) */
  const activeDoc = useCallback((): Document | null => {
    const t = tabsRef.current[activeRef.current];
    if (!t) return null;
    try {
      return iframeRefs.current.get(t.id)?.contentDocument ?? null;
    } catch {
      return null;
    }
  }, []);

  const activeTabData = tabs[activeTab] ?? tabs[0];
  const tabId = activeTabData?.id;

  /* ---------------- motor ---------------- */
  useEffect(() => {
    const off = onDiagnostics(setEngineDiag);
    return off;
  }, []);

  useEffect(() => {
    let alive = true;
    ensureEngine(browser.wispUrl)
      .then((c) => {
        if (alive) ctrlRef.current = c;
      })
      .catch((e) => {
        console.error("[safari] motor:", e);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* aplica cambio de wisp en caliente — solo si el destino está sano,
     para no pelear con el failover automático (p. ej. motor propio dormido) */
  useEffect(() => {
    if (engineDiag.status === "ready" && browser.wispUrl && browser.wispUrl !== engineDiag.wispUrl) {
      let cancelled = false;
      import("../engine/scramjet").then(async (m) => {
        const r = await m.testWisp(browser.wispUrl, 20000);
        if (!cancelled && r.ok) {
          await m.applyTransport(browser.wispUrl);
        } else if (!cancelled && !r.ok) {
          console.warn("[safari] transporte configurado no sano, se mantiene el activo:", r.detail);
        }
      }).catch((e) => console.error("[safari] cambio de wisp:", e));
      return () => {
        cancelled = true;
      };
    }
  }, [browser.wispUrl, engineDiag.status, engineDiag.wispUrl]);

  /* auto-reparación: si el motor entra en error (port is dead, SW muerto,
     wisp caído…), se recupera solo con un periodo de gracia */
  const lastRecoverRef = useRef(0);
  useEffect(() => {
    if (engineDiag.status !== "error") return;
    if (Date.now() - lastRecoverRef.current < 12000) return;
    lastRecoverRef.current = Date.now();
    recoverEngine("error del motor")
      .then(() => notify("safari", "Motor reparado", "Scramjet se ha recuperado automáticamente"))
      .catch((e) => console.error("[safari] auto-reparación:", e));
  }, [engineDiag.status, notify]);

  /* ---------------- descargas del motor ---------------- */
  useEffect(() => {
    const off = onEngineDownload(async (d) => {
      try {
        const name = d.filename || new URL(d.url).pathname.split("/").pop() || "archivo";
        notify("safari", "Descargando…", name);
        const blob = await streamToBlob(d);
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        const id = addDownload({ name, url: d.url, size: blob.size, mime: "application/octet-stream" });
        setDownloadObjectUrl(id, objectUrl);
        notify("safari", "Descarga completada", `${name} · ${(blob.size / 1024).toFixed(0)} KB`);
      } catch (e) {
        console.error("[safari] descarga:", e);
        notify("safari", "Error de descarga", String((e as Error).message ?? e));
      }
    });
    return off;
  }, [addDownload, notify]);

  /* ---------------- utilidades de pestañas ---------------- */
  const patchTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const readPageMeta = useCallback(
    (id: string) => {
      const iframe = iframeRefs.current.get(id);
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) return;
        const title = (doc.title || "").trim();
        let favicon = "";
        const iconLink =
          doc.querySelector<HTMLLinkElement>("link[rel='icon' i]") ??
          doc.querySelector<HTMLLinkElement>("link[rel='shortcut icon' i]") ??
          doc.querySelector<HTMLLinkElement>("link[rel*='icon' i]");
        if (iconLink?.href) favicon = iconLink.href;
        patchTab(id, {
          ...(title ? { title } : {}),
          ...(favicon ? { favicon } : {}),
        });
      } catch {
        /* documento no disponible aún */
      }
    },
    [patchTab]
  );

  const readPageMetaSoon = useCallback(
    (id: string) => {
      setTimeout(() => readPageMeta(id), 350);
      setTimeout(() => readPageMeta(id), 1200);
    },
    [readPageMeta]
  );

  /* interceptor de popups/ventanas: TODO dentro del OS */
  const openInternalTab = useCallback(
    (realUrl: string) => {
      setTabs((ts) => {
        const t: Tab = {
          id: tabUid(),
          url: realUrl,
          title: hostOf(realUrl),
          favicon: faviconFor(realUrl),
          loading: true,
          pinned: false,
          history: [realUrl],
          hIndex: 0,
        };
        return [...ts, t];
      });
      setActiveTab((a) => a + 1); // la nueva pestaña queda al final
      notify("safari", "Pestaña nueva", "Un enlace se abrió dentro del sistema");
    },
    [notify]
  );

  /* espera a que React monte el iframe tras cambiar de vista (start/búsqueda → web) */
  const waitForIframe = useCallback(
    (id: string, ms = 2500): Promise<HTMLIFrameElement | null> =>
      new Promise((resolve) => {
        const t0 = Date.now();
        const check = () => {
          const el = iframeRefs.current.get(id);
          if (el) return resolve(el);
          if (Date.now() - t0 > ms) return resolve(null);
          setTimeout(check, 40);
        };
        check();
      }),
    []
  );

  const attachClickCapture = useCallback(
    (id: string) => {
      const iframe = iframeRefs.current.get(id);
      if (!iframe) return;
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const onClick = (ev: MouseEvent) => {
          const target = ev.target as HTMLElement | null;
          if (!target || !target.closest) return;
          const a = target.closest("a[target='_blank' i], a[target='_new' i]") as HTMLAnchorElement | null;
          if (!a) return;
          ev.preventDefault();
          ev.stopPropagation();
          let real = a.getAttribute("href") || "";
          try {
            if (real) real = ctrlRef.current?.decodeUrl(new URL(real, location.origin).href) ?? real;
          } catch { /* dejar tal cual */ }
          if (real && !real.startsWith("about:") && !real.startsWith("javascript:")) {
            openInternalTab(real);
          }
        };
        doc.addEventListener("click", onClick, true);
      } catch {
        /* cross-origin inesperado */
      }
    },
    [openInternalTab]
  );

  /* escucha de eventos de un frame del motor (urlchange/navigate) */
  const wireFrameEvents = useCallback(
    (frame: ScramjetFrameApi, id: string) => {
      frame.addEventListener("urlchange", (e) => {
        const u = (e as unknown as { url: string }).url;
        // el motor entregó el documento: progreso real para la escalera
        const h = hangRef.current.get(id);
        if (h) {
          h.lastProgress = Date.now();
          h.lastSig = "";
        }
        patchTab(id, { url: u, favicon: faviconFor(u), error: undefined });
        addHistory(u, hostOf(u));
        // mantener la entrada actual del historial de pestaña sincronizada (SPAs)
        setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, history: t.history.map((h2, i) => (i === t.hIndex ? u : h2)) } : t)));
        readPageMetaSoon(id);
      });
      frame.addEventListener("navigate", () => {
        // ventana de carga nueva dentro de la pestaña (navegación interna)
        hangRef.current.set(id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: false, queue: ["engineRetry", "direct", "error"] });
        patchTab(id, { loading: true, error: undefined });
      });
    },
    [addHistory, patchTab, readPageMetaSoon]
  );

  /* desbloqueo defensivo de scroll: sitios que fijan overflow:hidden en la raíz
     (pensando que son la ventana principal) dejan el contenido recortado dentro
     del iframe sin poder scrollear. Si el contenido desborda y el scroller raíz
     está bloqueado, se libera. */
  const unlockRootScroll = useCallback((id: string) => {
    try {
      const doc = iframeRefs.current.get(id)?.contentDocument;
      if (!doc || !doc.documentElement || !doc.body) return;
      const de = doc.documentElement;
      const overflowHidden = /hidden|clip/.test(getComputedStyle(de).overflowY) || /hidden|clip/.test(getComputedStyle(doc.body).overflowY);
      const overflows = de.scrollHeight > de.clientHeight + 8;
      if (overflowHidden && overflows) {
        de.style.overflowY = "auto";
        doc.body.style.overflowY = "visible";
      }
    } catch {
      /* cross-origin o sin documento: nada que hacer */
    }
  }, []);

  /* reintenta la navegación con un frame NUEVO del motor (tras una caída: el
     frame viejo puede quedar enganchado a un SharedWorker/ws muerto) */
  const retryFreshFrame = useCallback(
    async (id: string, url: string): Promise<boolean> => {
      framesRef.current.delete(id);
      try {
        const ctrl = await ensureEngine(browser.wispUrl);
        ctrlRef.current = ctrl;
        const iframe = iframeRefs.current.get(id) ?? (await waitForIframe(id));
        if (!iframe) return false;
        const fresh = ctrl.createFrame(iframe);
        framesRef.current.set(id, fresh);
        wireFrameEvents(fresh, id);
        fresh.go(url);
        // ya es un reintento del motor: si vuelve a estancarse, toca directo
        hangRef.current.set(id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: false, queue: ["direct", "error"] });
        return true;
      } catch (e) {
        console.error("[safari] reintento con frame nuevo:", e);
        return false;
      }
    },
    [browser.wispUrl, waitForIframe, wireFrameEvents]
  );

  /* firma del progreso real del documento (solo en modo motor: mismo origen) */
  const pageSig = useCallback((id: string): string => {
    try {
      const iframe = iframeRefs.current.get(id);
      const doc = iframe?.contentDocument;
      if (!doc || !doc.documentElement) return "";
      let nodes = 0;
      try {
        nodes = doc.getElementsByTagName("*").length;
      } catch {
        nodes = 0;
      }
      return `${doc.readyState}|${nodes}|${doc.title ?? ""}`;
    } catch {
      return ""; // cross-origin (modo directo) o sin documento todavía
    }
  }, []);

  /* ejecuta una fase de la escalera de carga de una pestaña */
  const runPhase = useCallback(
    async (t: Tab, phase: LadderPhase, queueAfter: LadderPhase[]) => {
      const now = Date.now();
      hangRef.current.set(t.id, { start: now, lastProgress: now, lastSig: "", direct: phase === "direct", queue: queueAfter });

      if (phase === "engine") {
        // vuelta de directo al motor: iframe limpio y frame nuevo
        framesRef.current.delete(t.id);
        patchTab(t.id, { direct: false, loading: true, error: undefined });
        notify("safari", "Reintentando con el motor", `${hostOf(t.url)} no cargó en directo; probando con el motor…`);
        setTimeout(() => void retryFreshFrame(t.id, t.url), 250); // margen para remontar el iframe
        return;
      }

      if (phase === "engineRetry") {
        const activeWisp = getDiagnostics().wispUrl || browser.wispUrl;
        const probe = await testWisp(activeWisp, 9000);
        if (!probe.ok) {
          // motor medio muerto (WS abierto sin datos): recuperación real
          notify("safari", "Motor sin flujo", "Recuperando el motor y reintentando la página…");
          try {
            await recoverEngine("carga colgada");
          } catch (e) {
            console.error("[safari] recuperación tras cuelgue:", e);
          }
          await retryFreshFrame(t.id, t.url);
          return;
        }
        // el motor fluye pero ESTE sitio no avanza → probar el OTRO motor (IP distinta)
        const alt = activeWisp === MAIN_WISP ? DEMO_WISP : MAIN_WISP;
        if (alt !== activeWisp) {
          const altProbe = await testWisp(alt, 12000);
          if (altProbe.ok) {
            notify("safari", "Cambiando de motor", `Reintentando ${hostOf(t.url)} con el motor de respaldo…`);
            try {
              await applyTransport(alt);
              updateBrowser({ wispUrl: alt }); // ajuste visible y sincronizado en Ajustes
            } catch (e) {
              console.error("[safari] cambio a motor de respaldo:", e);
            }
          }
        }
        await retryFreshFrame(t.id, t.url);
        return;
      }

      if (phase === "direct") {
        // conexión directa: el iframe carga el sitio real con la IP del usuario,
        // sin motor. Funciona con sitios que permiten mostrarse en un marco.
        framesRef.current.delete(t.id);
        notify("safari", "Conexión directa", `${hostOf(t.url)} no responde por el motor; probando desde tu conexión…`);
        patchTab(t.id, { direct: true, loading: true, error: undefined });
        // si tuvimos que cambiar al motor de respaldo para este sitio, volver al propio
        // (si sigue sano) para las próximas navegaciones normales
        const activeNow = getDiagnostics().wispUrl || browser.wispUrl;
        if (activeNow === DEMO_WISP) {
          void testWisp(MAIN_WISP, 8000)
            .then((r) => (r.ok ? applyTransport(MAIN_WISP) : undefined))
            .then(() => {
              if (getDiagnostics().wispUrl === MAIN_WISP) updateBrowser({ wispUrl: MAIN_WISP });
            })
            .catch(() => {});
        }
        return;
      }

      // fase "error": error honesto tras agotar la escalera
      hangRef.current.delete(t.id);
      patchTab(t.id, {
        loading: false,
        error: `${hostOf(t.url)} no cargó: se probó el motor propio, el de respaldo y la conexión directa. Puede que el sitio bloquee este tipo de acceso (IP de servidor o prohibición de marcos).`,
      });
      notify("safari", "Página sin respuesta", `${hostOf(t.url)} no cargó tras agotar los intentos.`);
    },
    [browser.wispUrl, notify, patchTab, retryFreshFrame, updateBrowser]
  );

  /* escalera de carga: ninguna pestaña puede quedarse "cargando" para siempre.
     Se mide el PROGRESO REAL del documento (nodos, readyState, título); si se
     estanca, se sube de escalón: motor → respaldo → directo → error honesto. */
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      for (const t of tabsRef.current) {
        if (!t.loading) {
          hangRef.current.delete(t.id);
          continue;
        }
        const h = hangRef.current.get(t.id);
        if (!h) continue; // sin escalera (p. ej. motor aún inicializando)
        if (!h.direct) {
          const sig = pageSig(t.id);
          if (sig && sig !== h.lastSig) {
            h.lastSig = sig;
            h.lastProgress = now;
          }
        }
        const stalled = now - h.lastProgress > STALL_MS && now - h.start > MIN_TOTAL_MS;
        const overdue = now - h.start > HARD_CAP_MS;
        if (!stalled && !overdue) continue;
        const next = h.queue.shift();
        if (!next || next === "error") {
          void runPhase(t, "error", []);
        } else {
          void runPhase(t, next, h.queue);
        }
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [pageSig, runPhase]);

  /* ---------------- asistente de acceso: acciones ----------------
     La detección corre en el hook (useAutofillAssistant); aquí viven las
     acciones que Safari ofrece al usuario en el banner y la toolbar. */

  /** rellena (o copia, si la página no lo permite) el correo del perfil */
  const doLoginFill = useCallback(() => {
    const id = identityEmail();
    if (!id) return;
    if (assistant.fillIdentityEmail(activeDoc())) return;
    // página sin campo accesible (o cross-origin): se copia al portapapeles
    navigator.clipboard
      ?.writeText(id.email)
      .then(() => notify("safari", "Correo copiado", "Esta página no permite relleno automático; pégalo con ⌘V"))
      .catch(() => notify("safari", "Tu correo de axcsOS", id.email));
  }, [assistant, activeDoc, notify]);

  /** rellena la credencial guardada del dominio (usuario + contraseña cifrada) */
  const doFillSaved = useCallback(async () => {
    const r = await assistant.fillSaved(activeDoc(), snap.host);
    if (r === "filled") notify("safari", "Credencial rellenada", `${snap.savedUsername ?? snap.host} — pulsa Entrar cuando quieras`);
    else if (r === "no-saved") notify("safari", "Sin contraseña guardada", `${snap.host} no tiene credenciales en axcsOS todavía`);
    else notify("safari", "Formulario no accesible", "Esta página no permite el relleno automático");
  }, [assistant, activeDoc, snap.host, snap.savedUsername, notify]);

  /** rellena la credencial y pulsa el botón de entrar (solo con esta acción explícita) */
  const doFillAndSubmit = useCallback(async () => {
    const r = await assistant.fillAndSubmit(activeDoc(), snap.host);
    if (r === "sent") notify("safari", "Entrando…", `Credencial de ${snap.host} enviada`);
    else if (r === "filled") notify("safari", "Credencial rellenada", "La página no dejó pulsar su botón: pulsa tú el de entrar");
    else if (r === "no-saved") notify("safari", "Sin contraseña guardada", `${snap.host} no tiene credenciales en axcsOS todavía`);
  }, [assistant, activeDoc, snap.host, notify]);

  /* ---------------- instalar la página actual como app ---------------- */
  const canInstallPage = !!activeTabData && /^https?:/i.test(activeTabData.url) && !parseYouTubeUrl(activeTabData.url);

  const openInstall = useCallback(() => {
    const t = tabsRef.current[activeRef.current];
    if (!t || !/^https?:/i.test(t.url) || parseYouTubeUrl(t.url)) return;
    const base = t.title && t.title !== hostOf(t.url) ? t.title : hostOf(t.url);
    setInstallName(base.slice(0, 40));
    setInstallOpen(true);
  }, []);

  const confirmInstall = useCallback(() => {
    const t = tabsRef.current[activeRef.current];
    if (!t || !/^https?:/i.test(t.url)) return;
    const r = installWebApp({ url: t.url, name: installName });
    setInstallOpen(false);
    if (r.manifest) {
      notify("safari", `${r.manifest.name} instalada`, "App nativa añadida: está en Launchpad, el Dock y Spotlight");
      openApp(`webapp:${r.manifest.id}`);
    } else {
      notify("safari", "No se pudo instalar", "Prueba de nuevo en unos segundos");
    }
  }, [installName, notify, openApp]);

  /* ---------------- ventana real (nivel superior) ----------------
     Algunos sitios (Google en cabeza) bloquean los inicios de sesión en
     páginas embebidas: detectan que no son la ventana de nivel superior y
     responden "este navegador no es seguro" aunque todo lo demás sea real.
     La solución honesta es abrir el flujo en una VENTANA REAL del navegador:
     - Por el motor: /popup comparte origen y Service Worker con el OS →
       misma sesión de axcsOS (al cerrar, esta pestaña se recarga sola).
     - Con mi conexión: la ventana navega al sitio real (IP del usuario,
       sin motor); la sesión queda en su navegador. */
  const openRealWindow = useCallback(
    (mode: "engine" | "direct") => {
      const t = tabsRef.current[activeRef.current];
      if (!t || !/^https?:/i.test(t.url) || parseYouTubeUrl(t.url)) return;
      const url = t.url;
      const feats = "popup,width=1080,height=800";
      const win =
        mode === "direct"
          ? window.open(url, "axcsos-realwin", feats)
          : window.open(`${appBase()}/popup?u=${encodeURIComponent(url)}`, "axcsos-realwin", feats);
      if (!win) {
        notify(
          "safari",
          "Ventana emergente bloqueada",
          "Permite las ventanas emergentes de este sitio en tu navegador y vuelve a intentarlo"
        );
        return;
      }
      realWinRef.current = win;
      realWinTabRef.current = t.id;
      realWinModeRef.current = mode;
      notify(
        "safari",
        "Ventana real abierta",
        mode === "engine"
          ? "La sesión que inicies ahí queda dentro de axcsOS: al cerrar la ventana, esta pestaña se recarga"
          : "Se abrirá con tu conexión: la sesión quedará en tu navegador (fuera de axcsOS)"
      );
    },
    [notify]
  );

  const installTargetInstalled = installOpen && activeTabData ? findWebAppByUrl(activeTabData.url) : undefined;

  const navigateTab = useCallback(
    async (id: string, rawUrl: string, opts?: { push?: boolean }) => {
      const push = opts?.push !== false;
      const url = normalizeInput(rawUrl);
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab) return;

      // historial de la pestaña: apilar entrada nueva (o reemplazar la actual en back/forward)
      setTabs((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          if (!push) return { ...t, hIndex: Math.max(0, Math.min(t.history.length - 1, t.hIndex)) };
          if (t.history[t.hIndex] === url) return t;
          const history = [...t.history.slice(0, t.hIndex + 1), url];
          return { ...t, history, hIndex: history.length - 1 };
        })
      );

      if (url === START) {
        patchTab(id, { url: START, title: "Nueva pestaña", favicon: "", loading: false, direct: false });
        return;
      }
      if (url.startsWith(SEARCH_PREFIX)) {
        patchTab(id, { url, title: `Búsqueda: ${decodeURIComponent(url.slice(SEARCH_PREFIX.length))}`, favicon: "", loading: false, direct: false });
        return;
      }

      // YouTube → cliente 100% nativo del OS (sin Scramjet, sin login)
      if (parseYouTubeUrl(url)) {
        patchTab(id, { url, title: "YouTube", favicon: faviconFor(url), loading: false, direct: false });
        addHistory(url, hostOf(url));
        return;
      }

      const host = hostOf(url);

      // sitios que ya cargaron bien en directo (IP del usuario) → directo a la primera
      if (directOkHosts().includes(host)) {
        patchTab(id, {
          url,
          title: host,
          favicon: faviconFor(url),
          loading: true,
          error: undefined,
          direct: true,
          ...(tab.direct ? { fNonce: Date.now() } : {}),
        });
        hangRef.current.set(id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: true, queue: ["engine", "engineRetry", "error"] });
        addHistory(url, host);
        return;
      }

      // páginas de la PROPIA máquina del usuario (localhost): el motor es remoto y
      // no puede alcanzarlas → conexión directa inmediata (además mismo-origen si
      // es este servidor: relleno y captura de credenciales completos)
      if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0])(:\d+)?$/i.test(host)) {
        patchTab(id, {
          url,
          title: host,
          favicon: faviconFor(url),
          loading: true,
          error: undefined,
          direct: true,
        });
        hangRef.current.set(id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: true, queue: ["error"] });
        addHistory(url, host);
        return;
      }

      const wasDirect = !!tab.direct;
      patchTab(id, { url, title: host, favicon: faviconFor(url), loading: true, error: undefined, direct: false });
      if (wasDirect) {
        // venimos de un iframe directo: margen para que React remonte el iframe limpio
        await new Promise((r) => setTimeout(r, 250));
        framesRef.current.delete(id);
      }
      try {
        const ctrl = await ensureEngine(browser.wispUrl);
        ctrlRef.current = ctrl;

        let frame = framesRef.current.get(id);
        let iframe = iframeRefs.current.get(id) ?? (await waitForIframe(id));
        if (!iframe) return;
        if (!frame) {
          // fase about:blank: capturar window.open ANTES de que el motor lo enganche
          try {
            const w = iframe.contentWindow as (Window & { open?: typeof window.open; __axcsOpenHooked?: boolean }) | null;
            if (w && !w.__axcsOpenHooked) {
              w.__axcsOpenHooked = true;
              w.open = function (u: string | URL | null) {
                try {
                  let real = "";
                  if (u) {
                    const abs = new URL(String(u), location.origin).href;
                    real = ctrlRef.current?.decodeUrl(abs) ?? abs;
                  }
                  if (real && /^https?:/i.test(real)) openInternalTab(real);
                } catch { /* ignore */ }
                return null; // comportamiento estándar de "popup bloqueado"
              } as typeof window.open;
            }
          } catch { /* ignore */ }
          frame = ctrl.createFrame(iframe);
          framesRef.current.set(id, frame);
          wireFrameEvents(frame, id);
        }
        frame.go(url);
        hangRef.current.set(id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: false, queue: ["engineRetry", "direct", "error"] });
      } catch (e) {
        console.error("[safari] navegación:", e);
        // auto-recuperación + reintento con frame nuevo (el viejo puede estar roto)
        try {
          await recoverEngine("fallo de navegación");
          if (await retryFreshFrame(id, url)) return;
        } catch (e2) {
          console.error("[safari] recuperación:", e2);
        }
        patchTab(id, { loading: false, title: "Error del motor" });
      }
    },
    [addHistory, browser.wispUrl, openInternalTab, patchTab, readPageMetaSoon, retryFreshFrame, waitForIframe, wireFrameEvents]
  );

  /* recarga una pestaña por id (para la ventana real) */
  const reloadTabById = useCallback(
    (id: string) => {
      const t = tabsRef.current.find((x) => x.id === id);
      if (!t || !/^https?:/i.test(t.url)) return;
      if (parseYouTubeUrl(t.url)) {
        patchTab(t.id, { rNonce: Date.now(), loading: true });
        setTimeout(() => patchTab(t.id, { loading: false }), 350);
        return;
      }
      if (t.direct) {
        patchTab(t.id, { fNonce: Date.now(), loading: true, error: undefined });
        return;
      }
      const frame = framesRef.current.get(t.id);
      if (!frame) {
        void navigateTab(t.id, t.url, { push: false });
        return;
      }
      patchTab(t.id, { loading: true, error: undefined });
      try {
        frame.reload();
      } catch {
        void navigateTab(t.id, t.url, { push: false });
      }
    },
    [navigateTab, patchTab]
  );

  /* al cerrarse la ventana real: recargar la pestaña que la abrió (por el
     motor la sesión es compartida → aparece al instante) */
  useEffect(() => {
    const iv = setInterval(() => {
      const w = realWinRef.current;
      if (!w) return;
      if (w.closed) {
        realWinRef.current = null;
        const tabId = realWinTabRef.current;
        const mode = realWinModeRef.current;
        realWinTabRef.current = "";
        if (tabId) {
          if (mode === "engine") {
            reloadTabById(tabId);
            notify("safari", "Ventana real cerrada", "Recargando para mostrar la sesión iniciada…");
          } else {
            notify(
              "safari",
              "Ventana real cerrada",
              "Si iniciaste sesión con tu conexión, se quedó en tu navegador (no en axcsOS)"
            );
          }
        }
      }
    }, 900);
    return () => clearInterval(iv);
  }, [notify, reloadTabById]);

  /* navegación inicial de la pestaña de arranque */
  useEffect(() => {
    const t = tabs[0];
    if (t && /^https?:/i.test(t.url)) {
      void navigateTab(t.id, t.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* sincronizar barra de direcciones con la pestaña activa */
  useEffect(() => {
    const t = tabs[activeTab];
    setAddress(t && /^https?:/i.test(t.url) ? t.url : "");
    if (t) {
      const isStart = t.url === START;
      const isSearch = t.url.startsWith(SEARCH_PREFIX);
      setWindowTitle(winId, isStart ? "Navegador" : isSearch ? `Búsqueda · Navegador` : t.title.length > 42 ? t.title.slice(0, 42) + "…" : t.title || "Navegador");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabId, activeTabData?.url]);

  /* título de ventana según pestaña */
  useEffect(() => {
    if (!activeTabData) return;
    if (/^https?:/i.test(activeTabData.url) || activeTabData.url === START) {
      setWindowTitle(winId, activeTabData.url === START ? "Navegador" : activeTabData.title.length > 42 ? activeTabData.title.slice(0, 42) + "…" : activeTabData.title || "Navegador");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabData?.title, activeTabData?.url]);

  const newTab = useCallback(() => {
    const t: Tab = { id: tabUid(), url: START, title: "Nueva pestaña", favicon: "", loading: false, pinned: false, history: [START], hIndex: 0 };
    setTabs((ts) => [...ts, t]);
    setActiveTab(tabsRef.current.length);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const idx = tabsRef.current.findIndex((t) => t.id === id);
      setTabs((ts) => {
        if (ts.length === 1) {
          const t: Tab = { id: tabUid(), url: START, title: "Nueva pestaña", favicon: "", loading: false, pinned: false, history: [START], hIndex: 0 };
          return [t];
        }
        return ts.filter((t) => t.id !== id);
      });
      framesRef.current.delete(id);
      iframeRefs.current.delete(id);
      hangRef.current.delete(id);
      // si cerramos la activa, activar la anterior (o la siguiente)
      if (idx >= 0) {
        setActiveTab((a) => {
          if (a === idx) return Math.max(0, idx - 1);
          if (a > idx) return a - 1;
          return a;
        });
      }
    },
    []
  );

  const cmd = useCallback(
    (c: "back" | "forward" | "reload" | "stop") => {
      const t = tabsRef.current[activeRef.current];
      if (!t) return;
      if (c === "stop") {
        try { iframeRefs.current.get(t.id)?.contentWindow?.stop(); } catch { /* ignore */ }
        hangRef.current.delete(t.id);
        patchTab(t.id, { loading: false });
        return;
      }
      if (c === "back" || c === "forward") {
        const target = c === "back" ? t.hIndex - 1 : t.hIndex + 1;
        if (target < 0 || target >= t.history.length) return;
        const url = t.history[target];
        setTabs((ts) => ts.map((x) => (x.id === t.id ? { ...x, hIndex: target } : x)));
        void navigateTab(t.id, url, { push: false });
        return;
      }
      if (!/^https?:/i.test(t.url)) return;
      // vistas nativas (YouTube): recarga = remount
      if (parseYouTubeUrl(t.url)) {
        patchTab(t.id, { rNonce: Date.now(), loading: true });
        setTimeout(() => patchTab(t.id, { loading: false }), 350);
        return;
      }
      // modo directo: recarga = remontar el iframe real
      if (t.direct) {
        patchTab(t.id, { fNonce: Date.now(), loading: true, error: undefined });
        hangRef.current.set(t.id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: true, queue: ["engine", "engineRetry", "error"] });
        return;
      }
      const frame = framesRef.current.get(t.id);
      if (!frame) {
        void navigateTab(t.id, t.url, { push: false });
        return;
      }
      patchTab(t.id, { loading: true, error: undefined });
      hangRef.current.set(t.id, { start: Date.now(), lastProgress: Date.now(), lastSig: "", direct: false, queue: ["engineRetry", "direct", "error"] });
      try {
        frame.reload();
      } catch (e) {
        console.error("[safari] reload", e);
      }
    },
    [navigateTab, patchTab]
  );

  const submitAddress = useCallback(() => {
    const t = tabsRef.current[activeRef.current];
    if (!t) return;
    void navigateTab(t.id, address);
    (document.activeElement as HTMLElement | null)?.blur();
  }, [address, navigateTab]);

  const bookmarked = useMemo(
    () => activeTabData ? bookmarks.some((b) => b.url === activeTabData.url) : false,
    [activeTabData, bookmarks]
  );

  const toggleBookmark = useCallback(() => {
    const t = tabsRef.current[activeRef.current];
    if (!t || !/^https?:/i.test(t.url)) return;
    const existing = bookmarks.find((b) => b.url === t.url);
    if (existing) {
      removeBookmark(existing.id);
      notify("safari", "Marcador eliminado", t.title || t.url);
    } else {
      addBookmark({ url: t.url, name: t.title || hostOf(t.url), folder: "Favoritos" });
      notify("safari", "Marcador añadido", t.title || t.url);
    }
  }, [addBookmark, bookmarks, notify, removeBookmark]);

  /* ---------------- render ---------------- */
  const engineError = engineDiag.status === "error" ? engineDiag.error : null;
  const showStart = !activeTabData || activeTabData.url === START;
  const showSearch = activeTabData?.url.startsWith(SEARCH_PREFIX) ?? false;

  return (
    <div className="nav-theme dark relative flex h-full flex-col bg-[#0b101e]" onKeyDown={onKeyDownShell}>
      {/* banner de error del motor */}
      {engineError && (
        <div className="flex items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-300">
          <XCircle size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Motor de navegación: {engineError}</span>
          <button className="shrink-0 font-semibold underline" onClick={() => openApp("settings", { payload: { section: "browser" } })}>
            Ajustes
          </button>
        </div>
      )}

      {/* franja de pestañas — estilo Chrome, se funde con la toolbar */}
      <div className="flex h-11 shrink-0 items-end gap-1 bg-[var(--nav-strip)] px-2.5 pt-2">
        {/* px/-mx: el padding interno del scroller deja sitio a los hombros curvos
            (flares ±9px) de la pestaña activa sin que overflow los recorte */}
        <div className="no-scrollbar -mx-2.5 flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-2.5">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(i)}
              onDoubleClick={() => patchTab(t.id, { pinned: !t.pinned })}
              className={`group flex h-[34px] shrink-0 items-center gap-1.5 rounded-t-[10px] px-2.5 text-[11.5px] transition-colors ${
                i === activeTab
                  ? "chrome-tab-active bg-[var(--nav-surface)] text-[var(--nav-text)]"
                  : "text-[var(--nav-text-dim)] hover:bg-white/[0.06] hover:text-[var(--nav-text)]"
              } ${t.pinned ? "w-11 justify-center" : "max-w-48 min-w-32"}`}
              title={t.pinned ? `${t.title} (fijada: doble clic para desfijar)` : `${t.title} — doble clic para fijar`}
            >
              {t.loading ? (
                <RotateCw size={11} className="shrink-0 animate-spin text-[var(--nav-accent)]" />
              ) : t.favicon ? (
                <img src={t.favicon} alt="" className="h-3.5 w-3.5 shrink-0 rounded-[3px]" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
              ) : (
                <Globe size={11} className="shrink-0 opacity-60" />
              )}
              {!t.pinned && <span className="min-w-0 flex-1 truncate text-left">{t.title}</span>}
              {!t.pinned && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="shrink-0 rounded-full p-0.5 opacity-0 transition hover:bg-white/15 group-hover:opacity-100"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={newTab}
            className="mb-1 flex h-7 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nav-text-dim)] transition hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]"
            title="Nueva pestaña (⌘T)"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* toolbar — fusionada con la pestaña activa (estilo Chrome) */}
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--nav-border)] bg-[var(--nav-surface)] px-2.5">
        <button onClick={() => cmd("back")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)] disabled:opacity-30" title="Atrás" disabled={!activeTabData || activeTabData.hIndex <= 0}>
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => cmd("forward")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)] disabled:opacity-30" title="Adelante" disabled={!activeTabData || activeTabData.hIndex >= activeTabData.history.length - 1}>
          <ArrowRight size={16} />
        </button>
        <button onClick={() => cmd("reload")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)] disabled:opacity-30" title="Recargar" disabled={showStart || showSearch}>
          <RotateCw size={14} className={activeTabData?.loading ? "animate-spin" : ""} />
        </button>
        {activeTabData?.loading ? (
          <button onClick={() => cmd("stop")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)]" title="Detener carga">
            <XCircle size={14} />
          </button>
        ) : (
          <button
            onClick={() => tabId && navigateTab(tabId, START)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)]"
            title="Página de inicio"
          >
            <Home size={15} />
          </button>
        )}
        {/* omnibox: píldora central estilo Chrome */}
        <form
          className="flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--nav-border)] bg-[var(--nav-field)] px-3.5 transition focus-within:border-[var(--nav-accent)] focus-within:bg-[var(--nav-field-focus)] focus-within:ring-2 focus-within:ring-[var(--nav-accent)]/40"
          onSubmit={(e) => {
            e.preventDefault();
            submitAddress();
          }}
        >
          {showStart || showSearch ? <Search size={12} className="shrink-0 text-[var(--nav-text-dim)]" /> : <Lock size={11} className="shrink-0 text-[var(--nav-accent)]" />}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Buscar en la web o escribir dirección (URL)"
            spellCheck={false}
            className="os-input h-full w-full min-w-0 bg-transparent text-[12px] text-[var(--nav-text)] outline-none placeholder:text-[var(--nav-text-dim)]"
          />
          {activeTabData?.direct && (
            <span
              className="flex h-[17px] shrink-0 items-center rounded-full bg-[var(--nav-accent)]/15 px-2 text-[9.5px] font-semibold text-[var(--nav-accent)]"
              title="Esta pestaña usa conexión directa (tu IP), sin motor: la usan los sitios que bloquean la IP de los motores pero permiten mostrarse aquí."
            >
              directa
            </span>
          )}
          {address && (
            <button type="button" onClick={() => setAddress("")} className="shrink-0 text-[var(--nav-text-dim)] transition hover:text-[var(--nav-text)]">
              <X size={11} />
            </button>
          )}
          <span className="h-4 w-px shrink-0 bg-[var(--nav-border)]" />
          <button
            type="button"
            onClick={toggleBookmark}
            className={`shrink-0 p-0.5 transition ${bookmarked ? "text-amber-300" : "text-[var(--nav-text-dim)] hover:text-[var(--nav-text)]"}`}
            title={bookmarked ? "Quitar marcador" : "Añadir marcador"}
          >
            <Star size={13} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </form>
        {snap.hasSaved && (
          <button
            onClick={() => void doFillSaved()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-400 transition hover:bg-[var(--nav-hover)]"
            title={`Contraseña guardada para ${snap.host}: rellenar usuario y contraseña`}
          >
            <KeyRound size={15} />
          </button>
        )}
        {/* avatar (AXC ID): rellena tu correo en la página o abre tu cuenta */}
        <button
          onClick={() => (snap.identityEmail ? doLoginFill() : openApp("settings", { payload: { section: "account" } }))}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--nav-accent-deep)] to-[#0b101e] text-[11px] font-bold text-white ring-1 transition hover:brightness-125 ${
            snap.identityEmail && snap.detected ? "ring-[var(--nav-accent)]" : "ring-[var(--nav-border)]"
          }`}
          title={
            snap.identityEmail
              ? `Rellenar tu correo (${snap.identityEmail}${snap.identityVerified ? " · verificado" : ""}) en esta página`
              : "Añade tu correo en Ajustes → Cuenta (AXC ID) para que el Navegador rellene tus inicios de sesión"
          }
        >
          {(userName || "U").trim().charAt(0).toUpperCase()}
        </button>
        {/* menú ⋮ estilo Chrome */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[var(--nav-hover)] ${menuOpen ? "bg-[var(--nav-hover)] text-[var(--nav-text)]" : "text-[var(--nav-text-dim)] hover:text-[var(--nav-text)]"}`}
            title="Más opciones"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-xl border border-[var(--nav-border)] bg-[#111830] p-1.5 shadow-2xl shadow-black/50">
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    setPanel(panel === "bookmarks" ? null : "bookmarks");
                  }}
                >
                  <BookMarked size={14} className="shrink-0 text-[var(--nav-text-dim)]" /> Marcadores
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    setPanel(panel === "history" ? null : "history");
                  }}
                >
                  <HistoryIcon size={14} className="shrink-0 text-[var(--nav-text-dim)]" /> Historial
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    openApp("downloads");
                  }}
                >
                  <DownloadIcon size={14} className="shrink-0 text-[var(--nav-text-dim)]" /> Descargas
                </button>
                <div className="mx-2.5 my-1 h-px bg-[var(--nav-border)]" />
                <button
                  disabled={!canInstallPage}
                  title={
                    !canInstallPage
                      ? activeTabData && parseYouTubeUrl(activeTabData.url)
                        ? "YouTube ya es una app nativa de axcsOS (está en el Dock)"
                        : "Navega a una página para poder instalarla como app"
                      : "Instalar esta página como app de axcsOS"
                  }
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => {
                    setMenuOpen(false);
                    if (canInstallPage) openInstall();
                  }}
                >
                  <MonitorDown size={14} className="shrink-0 text-[var(--nav-text-dim)]" /> Instalar como app
                </button>
                <button
                  disabled={!canInstallPage}
                  title={
                    !canInstallPage
                      ? "Navega a una página para poder abrir su ventana real"
                      : activeTabData?.direct
                        ? "Abrir en ventana real con tu conexión"
                        : "Abrir en ventana real (ventana de nivel superior del navegador): para inicios de sesión que bloquean páginas embebidas, p. ej. Google"
                  }
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)] disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => {
                    setMenuOpen(false);
                    if (canInstallPage) openRealWindow(activeTabData?.direct ? "direct" : "engine");
                  }}
                >
                  <ExternalLink size={14} className="shrink-0 text-[var(--nav-text-dim)]" /> Ventana real
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] text-[var(--nav-text)] transition hover:bg-[var(--nav-hover)]"
                  onClick={() => {
                    setMenuOpen(false);
                    openApp("settings", { payload: { section: "browser" } });
                  }}
                >
                  <Settings2 size={14} className="shrink-0 text-[var(--nav-text-dim)]" /> Ajustes del navegador
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {activeTabData?.loading && (
        <div className="h-0.5 shrink-0 overflow-hidden bg-transparent">
          <div className="animate-progress h-full w-1/3 rounded-full bg-[var(--nav-accent)]" />
        </div>
      )}

      {/* banner: sitios que bloquean el login embebido (Google) → ventana real */}
      {!showStart && !showSearch && activeTabData && hostOf(activeTabData.url) === "accounts.google.com" && dismissedRealwinUrl !== activeTabData.url && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/25 bg-amber-500/[0.08] px-3 py-1.5 text-[11px]">
          <ShieldAlert size={13} className="shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
            <b className="text-neutral-800 dark:text-neutral-100">Google</b> bloquea el inicio de sesión dentro de páginas embebidas — ábrelo en una ventana real:
          </span>
          <button
            onClick={() => openRealWindow("engine")}
            className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
            title="Ventana real navegada por el motor de axcsOS (misma sesión del sistema): al cerrarla, esta pestaña se recarga para mostrarte la cuenta iniciada"
          >
            Ventana real · por el motor
          </button>
          <button
            onClick={() => openRealWindow("direct")}
            className="shrink-0 rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium text-neutral-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/20"
            title="Ventana real con tu conexión (tu IP, sin motor): la sesión quedará en tu navegador, no en axcsOS"
          >
            Con mi conexión
          </button>
          <button
            onClick={() => setDismissedRealwinUrl(activeTabData.url)}
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
          >
            Ahora no
          </button>
        </div>
      )}

      {/* banner del asistente de acceso: credencial guardada / correo del perfil / guardar contraseña */}
      {!showStart && !showSearch && activeTabData && !activeTabData.loading && dismissedLoginUrl !== activeTabData.url && (
        <>
          {/* credencial guardada para este sitio */}
          {snap.detected && snap.hasSaved && !snap.signupLike && (
            <div className="flex shrink-0 items-center gap-2 border-b border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1.5 text-[11px]">
              <KeyRound size={13} className="shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
                Tienes una cuenta guardada para <b className="text-neutral-800 dark:text-neutral-100">{snap.host}</b> —{" "}
                {snap.savedUsername}
              </span>
              <button
                onClick={() => void doFillAndSubmit()}
                className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                Entrar
              </button>
              <button
                onClick={() => void doFillSaved()}
                className="shrink-0 rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium text-neutral-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/20"
              >
                Solo rellenar
              </button>
              <button
                onClick={() => setDismissedLoginUrl(activeTabData.url)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                Ahora no
              </button>
            </div>
          )}
          {/* sin credencial: el correo del perfil (verificado AXC ID o @axcs.os) */}
          {snap.detected && !(snap.hasSaved && !snap.signupLike) && snap.identityEmail && (
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--accent-os)]/20 bg-[var(--accent-os)]/[0.08] px-3 py-1.5 text-[11px]">
              <MailIconLucide size={13} className="shrink-0 text-[var(--accent-os)]" />
              <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
                {snap.signupLike ? "Esta página registra cuentas" : "Esta página pide un correo para iniciar sesión"} — usa el tuyo:{" "}
                <b className="text-neutral-800 dark:text-neutral-100">{snap.identityEmail}</b>
                {snap.identityVerified && <span className="ml-1 text-[9.5px] font-semibold text-emerald-500">✓ verificado</span>}
              </span>
              <button
                onClick={doLoginFill}
                className="shrink-0 rounded-full bg-[var(--accent-os)] px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
              >
                Rellenar
              </button>
              <button
                onClick={() => setDismissedLoginUrl(activeTabData.url)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                Ahora no
              </button>
            </div>
          )}
        </>
      )}

      {/* banner: ¿guardar la contraseña capturada en la bóveda? */}
      {assistant.savePrompt && !showStart && !showSearch && assistant.savePrompt.host === snap.host && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/25 bg-amber-500/[0.08] px-3 py-1.5 text-[11px]">
          <KeyRound size={13} className="shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">
            ¿Guardar la contraseña de <b className="text-neutral-800 dark:text-neutral-100">{assistant.savePrompt.host}</b> ({assistant.savePrompt.username}) en axcsOS? Se cifra con AES-256 en este dispositivo.
          </span>
          <button
            onClick={() => void assistant.savePromptSave(assistant.savePrompt!)}
            className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Guardar
          </button>
          <button
            onClick={() => assistant.savePromptNever(assistant.savePrompt!)}
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
          >
            Nunca para este sitio
          </button>
          <button
            onClick={() => assistant.dismissSavePrompt(assistant.savePrompt!.host)}
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
          >
            Ahora no
          </button>
        </div>
      )}

      {/* diálogo: instalar la página como app */}
      {installOpen && activeTabData && /^https?:/i.test(activeTabData.url) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 backdrop-blur-[2px]" onMouseDown={() => setInstallOpen(false)}>
          <div
            className="glass lg-specular w-[min(92%,400px)] rounded-2xl p-5 shadow-2xl dark:glass-dark"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <MonitorDown size={14} className="text-[var(--accent-os)]" />
              <h3 className="flex-1 text-[14px] font-semibold">Instalar como app</h3>
              <button onClick={() => setInstallOpen(false)} className="rounded p-1 text-neutral-400 transition hover:bg-black/10 dark:hover:bg-white/10">
                <X size={13} />
              </button>
            </div>
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/70 p-3 shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
              {activeTabData.favicon ? (
                <img src={activeTabData.favicon} alt="" className="h-10 w-10 shrink-0 rounded-[9px] bg-white" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
              ) : (
                <Globe size={26} className="shrink-0 text-neutral-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold">{activeTabData.title || hostOf(activeTabData.url)}</div>
                <div className="truncate text-[10.5px] text-neutral-400">{activeTabData.url}</div>
              </div>
            </div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Nombre de la app</label>
            <input
              autoFocus
              value={installName}
              onChange={(e) => setInstallName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !installTargetInstalled && confirmInstall()}
              className="os-input mb-3 w-full rounded-lg bg-white/80 px-3 py-2 text-[13px] shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/50 dark:bg-neutral-800/80 dark:ring-white/10"
            />
            <p className="mb-3 text-[10.5px] leading-relaxed text-neutral-400">
              La página se convertirá en una app nativa de axcsOS: ventana propia con el motor de navegación dentro,
              accesible desde Launchpad, el Dock y Spotlight.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setInstallOpen(false)} className="rounded-lg bg-black/5 px-3.5 py-1.5 text-[12px] font-medium transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20">
                Cancelar
              </button>
              {installTargetInstalled ? (
                <button
                  onClick={() => {
                    setInstallOpen(false);
                    openApp(`webapp:${installTargetInstalled.id}`);
                  }}
                  className="rounded-lg bg-emerald-500/15 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-600 transition hover:bg-emerald-500/25 dark:text-emerald-400"
                >
                  Ya instalada — Abrir
                </button>
              ) : (
                <button
                  onClick={confirmInstall}
                  className="rounded-lg bg-[var(--accent-os)] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow transition hover:opacity-90"
                >
                  Instalar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* paneles laterales: marcadores / historial */}
      {panel && (
        <SidePanel
          kind={panel}
          bookmarks={bookmarks}
          history={safariHistory}
          onOpen={(url) => {
            tabId && void navigateTab(tabId, url);
            setPanel(null);
          }}
          onRemoveBookmark={removeBookmark}
          onRemoveHistory={removeHistory}
          onClearHistory={clearHistory}
          onClose={() => setPanel(null)}
        />
      )}

      {/* contenido */}
      <div className="relative min-h-0 flex-1">
        {tabs.map((t, i) => (
          <div key={t.id} className={`absolute inset-0 ${i === activeTab ? "" : "hidden"}`}>
            {t.url === START ? (
              <StartPage
                bookmarks={bookmarks}
                history={safariHistory.slice(0, 8)}
                engineReady={engineDiag.status === "ready"}
                engineWisp={engineDiag.wispUrl || browser.wispUrl}
                engineKind={
                  (engineDiag.wispUrl || browser.wispUrl) === MAIN_WISP ? "own" : (engineDiag.wispUrl || browser.wispUrl) === DEMO_WISP ? "demo" : "other"
                }
                onOpen={(url) => navigateTab(t.id, url)}
                onSearch={(q) => navigateTab(t.id, SEARCH_PREFIX + encodeURIComponent(q))}
                onOpenSettings={() => openApp("settings", { payload: { section: "browser" } })}
              />
            ) : t.url.startsWith(SEARCH_PREFIX) ? (
              <SearchResultsPage
                query={decodeURIComponent(t.url.slice(SEARCH_PREFIX.length))}
                engine={browser.searchEngine}
                searxngUrl={browser.searxngUrl}
                onOpen={(url) => navigateTab(t.id, url)}
                onFallback={() => navigateTab(t.id, `https://html.duckduckgo.com/html/?q=${encodeURIComponent(decodeURIComponent(t.url.slice(SEARCH_PREFIX.length)))}`)}
              />
            ) : parseYouTubeUrl(t.url) ? (
              <YouTubeApp
                key={`${t.id}|${t.url}|${t.rNonce ?? 0}`}
                embedded
                initialView={parseYouTubeUrl(t.url) ?? undefined}
                onNavigate={(u) => navigateTab(t.id, u)}
                onBack={() => cmd("back")}
                canBack={t.hIndex > 0}
                onTitle={(title) => patchTab(t.id, { title })}
              />
            ) : (
              <>
                <iframe
                  key={`${t.id}|d${t.direct ? 1 : 0}|f${t.fNonce ?? 0}`}
                  ref={(el) => {
                    if (el) iframeRefs.current.set(t.id, el);
                    else iframeRefs.current.delete(t.id);
                  }}
                  title={t.title}
                  src={t.direct ? t.url : "about:blank"}
                  className="h-full w-full border-0 bg-white"
                  allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write; gamepad"
                  onLoad={() => {
                    const cur = tabsRef.current.find((x) => x.id === t.id);
                    if (cur?.direct) {
                      // modo directo: el iframe real cargó (o el propio navegador mostró su rechazo)
                      hangRef.current.delete(t.id);
                      patchTab(t.id, { loading: false, error: undefined });
                      // memorizar solo si sigue puesta ≥8 s (evita guardar páginas de rechazo)
                      const host = hostOf(t.url);
                      setTimeout(() => {
                        const later = tabsRef.current.find((x) => x.id === t.id);
                        if (later && later.direct && later.url === t.url && !later.loading && !later.error) rememberDirectOk(host);
                      }, 8000);
                      return;
                    }
                    // modo motor: ¿página de error del servidor? → la escalera sigue al siguiente escalón
                    let doc: Document | null | null = null;
                    try {
                      doc = iframeRefs.current.get(t.id)?.contentDocument ?? null;
                    } catch {
                      doc = null;
                    }
                    if (looksLikeErrorPage(doc)) {
                      const h = hangRef.current.get(t.id);
                      if (h) {
                        const next = h.queue.shift();
                        if (!next || next === "error") {
                          void runPhase(t, "error", []);
                        } else {
                          void runPhase(t, next, h.queue);
                        }
                        return; // NO marcar como cargada: no lo es
                      }
                    }
                    hangRef.current.delete(t.id); // la página cargó: escalera completada
                    patchTab(t.id, { loading: false, error: undefined });
                    readPageMeta(t.id);
                    attachClickCapture(t.id);
                    unlockRootScroll(t.id);
                  }}
                />
                {t.error && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/95 p-6 text-center backdrop-blur-sm dark:bg-neutral-900/95">
                    <XCircle size={38} className="shrink-0 text-red-500" />
                    <div className="max-w-md space-y-1">
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">La página no cargó</p>
                      <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{t.error}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigateTab(t.id, t.url, { push: false })}
                        className="rounded-lg bg-[var(--accent-os)] px-3.5 py-1.5 text-xs font-medium text-white shadow transition hover:opacity-90"
                      >
                        Reintentar
                      </button>
                      <button
                        onClick={() => openApp("settings", { payload: { section: "browser" } })}
                        className="rounded-lg bg-black/5 px-3.5 py-1.5 text-xs font-medium text-neutral-700 shadow transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20"
                      >
                        Ajustes del navegador
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  function onKeyDownShell(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "l") {
      e.preventDefault();
      const input = (e.currentTarget as HTMLElement).querySelector("input");
      (input as HTMLInputElement | null)?.focus();
      (input as HTMLInputElement | null)?.select();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "t") {
      e.preventDefault();
      newTab();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "w") {
      e.preventDefault();
      const t = tabsRef.current[activeRef.current];
      if (t) closeTab(t.id);
    }
  }
}

/* ============================================================
   Página de inicio
   ============================================================ */
function StartPage({
  bookmarks,
  history,
  engineReady,
  engineWisp,
  engineKind,
  onOpen,
  onSearch,
  onOpenSettings,
}: {
  bookmarks: { id: string; url: string; name: string; folder?: string }[];
  history: { id: string; url: string; title: string }[];
  engineReady: boolean;
  engineWisp: string;
  engineKind: "own" | "demo" | "other";
  onOpen: (url: string) => void;
  onSearch: (q: string) => void;
  onOpenSettings: () => void;
}) {
  const [q, setQ] = useState("");
  const favs = bookmarks.filter((b) => b.folder === "Favoritos").slice(0, 8);
  const list = favs.length ? favs : bookmarks.slice(0, 8);

  return (
    <div className="mac-scrollbar h-full overflow-y-auto bg-[radial-gradient(120%_80%_at_50%_0%,#17203d_0%,#0b101e_58%)] px-8 py-12">
      <div className="mx-auto flex max-w-xl flex-col items-center">
        {/* logo del Navegador (la brújula del estudio) */}
        <img src="icons/safari.png" alt="" draggable={false} className="mb-4 h-16 w-16 rounded-[15px] shadow-lg shadow-black/40 ring-1 ring-white/10" />
        <p className="mb-7 text-center text-[11px] text-[var(--nav-text-dim)]">Navegación real por el motor Scramjet · dentro de axcsOS</p>

        <form
          className="mb-9 flex h-12 w-full items-center gap-3 rounded-full border border-[var(--nav-border)] bg-[var(--nav-field)] px-5 shadow-lg shadow-black/30 transition focus-within:border-[var(--nav-accent)] focus-within:ring-2 focus-within:ring-[var(--nav-accent)]/40"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onSearch(q.trim());
          }}
        >
          <Search size={16} className="shrink-0 text-[var(--nav-text-dim)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en la web (Bing)"
            className="os-input h-full w-full bg-transparent text-[14px] text-[var(--nav-text)] outline-none placeholder:text-[var(--nav-text-dim)]"
          />
        </form>

        {/* accesos directos estilo Chrome (círculos) */}
        <div className="grid w-full grid-cols-4 gap-5">
          {list.map((f) => {
            const key = hostOf(f.url);
            const meta = FAV_LETTER[key] ?? { color: "linear-gradient(135deg,#64748b,#334155)", letter: f.name[0]?.toUpperCase() ?? "•" };
            return (
              <button key={f.id} onClick={() => onOpen(f.url)} className="group flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg shadow-black/40 ring-1 ring-white/10 transition group-hover:scale-105 group-hover:ring-[var(--nav-accent)]" style={{ background: meta.color }}>
                  {meta.letter}
                </div>
                <span className="max-w-full truncate text-[11px] text-[var(--nav-text-dim)] group-hover:text-[var(--nav-text)]">{f.name}</span>
              </button>
            );
          })}
        </div>

        {history.length > 0 && (
          <div className="mt-10 w-full rounded-2xl border border-[var(--nav-border)] bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[var(--nav-text-dim)]">
              <Clock size={12} /> Visitados recientemente
            </div>
            <div className="flex flex-col gap-1">
              {history.slice(0, 5).map((h) => (
                <button key={h.id} onClick={() => onOpen(h.url)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.06]">
                  <Globe size={11} className="shrink-0 text-[var(--nav-text-dim)]" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--nav-text)]">{h.title || h.url}</span>
                  <span className="shrink-0 text-[10px] text-[var(--nav-text-dim)]">{hostOf(h.url)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 w-full rounded-2xl border border-[var(--nav-border)] bg-white/[0.03] p-4 text-[11px] leading-relaxed text-[var(--nav-text-dim)]">
          <div className="mb-1 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${engineReady ? "bg-emerald-500" : "bg-amber-500"}`} />
            <b className="text-[var(--nav-text)]">Motor {engineReady ? "activo" : "iniciando…"}</b>
            <span className="min-w-0 flex-1 truncate text-[var(--nav-text-dim)]">{engineWisp}</span>
          </div>
          {engineKind === "own" ? (
            <p>
              Motor propio del estudio activo (wisp en Render). Si se cae, axcsOS conmuta solo al respaldo público y
              vuelve cuando el propio recupera la salud.
            </p>
          ) : engineKind === "demo" ? (
            <p>
              Conectado al transporte público de demostración de Mercury Workshop (respaldo externo, sin garantía). El
              motor propio del estudio se retomará automáticamente cuando responda. Puedes forzar el reintento desde{" "}
              <button onClick={onOpenSettings} className="font-semibold text-[var(--nav-accent)] underline">
                Ajustes → Navegador
              </button>
              .
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Resultados de búsqueda nativos (DDG vía motor · SearXNG opcional)
   ============================================================ */
function SearchResultsPage({ query, engine, searxngUrl, onOpen, onFallback }: { query: string; engine: "bing" | "searxng"; searxngUrl: string; onOpen: (url: string) => void; onFallback: () => void }) {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineName, setEngineName] = useState(engine === "searxng" ? "SearXNG" : "Bing");

  useEffect(() => {
    let alive = true;
    void (async () => {
      setResults(null);
      setError(null);
      try {
        let res: SearchResult[];
        if (engine === "searxng" && searxngUrl) {
          setEngineName("SearXNG");
          res = await searchSearXNG(searxngUrl, query);
        } else {
          setEngineName("Bing");
          // 1) Bing RSS (resultados reales, sin clave)
          try {
            // 1) Bing RSS (resultados reales, sin clave)
            res = await searchBingRSS(query);
          } catch {
            // 2) DDG html como respaldo
            res = await searchDDG(query);
          }
        }
        if (!alive) return;
        if (res.length === 0) {
          // el proveedor bloqueó la consulta directa: abrir la búsqueda DENTRO
          // del motor, donde el desafío se ejecuta con JavaScript real
          setError("");
          setTimeout(() => alive && onFallback(), 900);
          return;
        }
        setResults(res);
      } catch (e) {
        if (!alive) return;
        setError("");
        setTimeout(() => alive && onFallback(), 900);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query, engine, searxngUrl, onFallback]);

  return (
    <div className="mac-scrollbar h-full overflow-y-auto bg-[#0c1120]">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-4 flex items-center gap-2 text-[12px] text-neutral-400">
          <Search size={13} />
          Resultados de {engineName} para <b className="text-neutral-600 dark:text-neutral-200">{query}</b>
          <span className="ml-auto text-[10px]">{results === null ? "consultando…" : "cargados por el motor Scramjet"}</span>
        </div>
        {error !== null && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[12px] text-amber-700 dark:text-amber-300">
            <Search size={13} className="shrink-0" />
            El proveedor bloqueó la consulta directa. Abriendo la búsqueda dentro del motor (donde funciona con JavaScript real)…
          </div>
        )}
        {!error && !results && (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4">
          {results?.map((r, i) => (
            <div key={i} className="group cursor-pointer rounded-xl p-3 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]" onClick={() => onOpen(r.url)}>
              <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                <Globe size={10} />
                <span className="truncate">{r.host}</span>
              </div>
              <div className="text-[14px] font-medium text-[var(--accent-os)] group-hover:underline">{r.title}</div>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">{r.snippet}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Búsqueda real con Bing (salida RSS pública, sin clave) a través del motor. */
async function searchBingRSS(query: string): Promise<SearchResult[]> {
  const target = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=20`;
  const res = await engineFetch(target, { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`Bing RSS devolvió HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const out: SearchResult[] = [];
  doc.querySelectorAll("item").forEach((it) => {
    const url = it.querySelector("link")?.textContent?.trim() ?? "";
    const title = it.querySelector("title")?.textContent?.trim() ?? url;
    const snippet = (it.querySelector("description")?.textContent ?? "").replace(/<[^>]+>/g, "").trim();
    if (/^https?:/i.test(url)) out.push({ title, url, snippet, host: hostOf(url) });
  });
  return out.slice(0, 20);
}

/** Búsqueda real: DDG html a través del motor → parseo a resultados nativos. */
async function searchDDG(query: string): Promise<SearchResult[]> {
  const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await engineFetch(target, {
    headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`El motor devolvió HTTP ${res.status} al consultar DuckDuckGo`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: SearchResult[] = [];
  doc.querySelectorAll(".result, .web-result").forEach((el) => {
    const a = el.querySelector<HTMLAnchorElement>("a.result__a");
    if (!a) return;
    let href = a.getAttribute("href") || "";
    // enlaces redirigidos de DDG: //duckduckgo.com/l/?uddg=<url codificada>
    const m = /[?&]uddg=([^&]+)/.exec(href);
    if (m) {
      try {
        href = decodeURIComponent(m[1]);
      } catch { /* ignore */ }
    }
    if (href.startsWith("//")) href = "https:" + href;
    if (!/^https?:/i.test(href)) return;
    const snippet = el.querySelector(".result__snippet")?.textContent?.trim() ?? "";
    out.push({ title: a.textContent?.trim() || href, url: href, snippet, host: hostOf(href) });
  });
  return out.slice(0, 20);
}

/** Búsqueda SearXNG (instancia propia con API JSON habilitada). */
async function searchSearXNG(base: string, query: string): Promise<SearchResult[]> {
  const url = `${base.replace(/\/+$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`SearXNG respondió HTTP ${res.status}. Comprueba que la instancia tenga format=json habilitado y permita CORS.`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? [])
    .filter((r) => r.url && /^https?:/i.test(r.url))
    .slice(0, 20)
    .map((r) => ({ title: r.title ?? r.url ?? "", url: r.url!, snippet: r.content ?? "", host: hostOf(r.url!) }));
}

/* ============================================================
   Panel lateral: marcadores / historial
   ============================================================ */
function SidePanel({
  kind,
  bookmarks,
  history,
  onOpen,
  onRemoveBookmark,
  onRemoveHistory,
  onClearHistory,
  onClose,
}: {
  kind: "bookmarks" | "history";
  bookmarks: { id: string; url: string; name: string; folder?: string }[];
  history: { id: string; url: string; title: string; time: number }[];
  onOpen: (url: string) => void;
  onRemoveBookmark: (id: string) => void;
  onRemoveHistory: (id: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mac-scrollbar max-h-48 shrink-0 overflow-y-auto border-b border-[var(--nav-border)] bg-[#0d1425] px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-[var(--nav-text-dim)] uppercase">
        {kind === "bookmarks" ? <BookMarked size={11} /> : <HistoryIcon size={11} />}
        {kind === "bookmarks" ? "Marcadores" : "Historial"}
        <span className="flex-1" />
        {kind === "history" && history.length > 0 && (
          <button onClick={onClearHistory} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-500 transition hover:bg-rose-500/10">
            Borrar todo
          </button>
        )}
        <button onClick={onClose} className="rounded p-0.5 text-[var(--nav-text-dim)] transition hover:bg-[var(--nav-hover)] hover:text-[var(--nav-text)]">
          <X size={11} />
        </button>
      </div>
      <div className="flex flex-col">
        {kind === "bookmarks" &&
          (bookmarks.length === 0 ? (
            <span className="px-2 py-1.5 text-[11px] text-[var(--nav-text-dim)]">Sin marcadores todavía. Pulsa la estrella para guardar la página actual.</span>
          ) : (
            bookmarks.map((b) => (
              <div key={b.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.06]">
                <button onClick={() => onOpen(b.url)} className="min-w-0 flex-1 truncate text-left text-[11px] text-[var(--nav-text)]">
                  {b.name} <span className="text-[var(--nav-text-dim)]">· {hostOf(b.url)}</span>
                </button>
                <button onClick={() => onRemoveBookmark(b.id)} className="shrink-0 rounded p-0.5 text-[var(--nav-text-dim)] opacity-0 transition hover:text-rose-400 group-hover:opacity-100" title="Eliminar">
                  <X size={10} />
                </button>
              </div>
            ))
          ))}
        {kind === "history" &&
          (history.length === 0 ? (
            <span className="px-2 py-1.5 text-[11px] text-[var(--nav-text-dim)]">Sin historial. Se guarda según Ajustes → Navegador.</span>
          ) : (
            history.map((h) => (
              <div key={h.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.06]">
                <button onClick={() => onOpen(h.url)} className="min-w-0 flex-1 truncate text-left text-[11px] text-[var(--nav-text)]">
                  {h.title || h.url} <span className="text-[var(--nav-text-dim)]">· {hostOf(h.url)}</span>
                </button>
                <span className="shrink-0 text-[9px] text-[var(--nav-text-dim)]">{new Date(h.time).toLocaleDateString()}</span>
                <button onClick={() => onRemoveHistory(h.id)} className="shrink-0 rounded p-0.5 text-[var(--nav-text-dim)] opacity-0 transition hover:text-rose-400 group-hover:opacity-100" title="Eliminar entrada">
                  <X size={10} />
                </button>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}
