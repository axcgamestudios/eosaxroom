"use client";

/* ============================================================
   Motor de navegación Scramjet para axcsOS
   ------------------------------------------------------------
   Cadena completa (todas las piezas verificadas):
   página → Service Worker (scramjet.all.js) → rewriter WASM
   → BareMux SharedWorker → transporte libcurl → wisp (WebSocket)
   → servidor wisp → sitio real.

   - Scramjet 1.1.0 (release oficial de GitHub, OSS)
   - @mercuryworkshop/bare-mux 2.1.9
   - @mercuryworkshop/libcurl-transport 1.5.2 (compatible con SJ 1.x)
   - Backend wisp: @mercuryworkshop/wisp-js (ver server/ del repo)
   Assets servidos estáticos desde /public: no requieren servidor.
   ============================================================ */

export const SCRAMJET_VERSION = "1.1.0";
export const BAREMUX_VERSION = "2.1.9";
export const LIBCURL_VERSION = "1.5.2";

/** Motor propio del estudio: wisp-server-node desplegado en Render.
 *  Verificado en vivo: handshake wisp v1 + CONNECT + HTTP 200 real a través del túnel.
 *  Transporte principal del sistema (respaldado por la cadena de failover). */
export const MAIN_WISP = "wss://wsn-c6o3.onrender.com/";
/** Transporte de demostración público de Mercury Workshop (el de la demo oficial de Scramjet). Externo y sin garantía; SOLO respaldo si el motor propio cae. */
export const DEMO_WISP = "wss://wisp.mercurywork.shop/";
/** Wisp local para desarrollo (scripts/wisp-server.mjs). */
export const LOCAL_WISP = "ws://localhost:3001/";

/** Transporte del motor: configurado por el sistema (motor propio del estudio). */
export function defaultWisp(): string {
  return MAIN_WISP;
}

/** Ruta base de la app: '' en raíz, '/aos' en GitHub Pages. */
export function appBase(): string {
  if (typeof window === "undefined") return "";
  const p = window.location.pathname.replace(/\/+$/, "");
  if (!p) return "";
  const seg = p.slice(p.lastIndexOf("/") + 1);
  if (seg.includes(".")) return p.slice(0, p.lastIndexOf("/"));
  return p;
}

/* ---------- tipos mínimos de los globals que inyecta scramjet.all.js ---------- */
export interface ScramjetFrameApi extends EventTarget {
  frame: HTMLIFrameElement;
  url: URL;
  go(url: string): void;
  back(): void;
  forward(): void;
  reload(): void;
}
export interface ScramjetControllerApi extends EventTarget {
  init(): Promise<void>;
  createFrame(frame?: HTMLIFrameElement): ScramjetFrameApi;
  encodeUrl(url: string | URL): string;
  decodeUrl(url: string | URL): string;
  modifyConfig(cfg: Record<string, unknown>): Promise<void>;
}
interface ScramjetGlobals {
  $scramjetLoadController?: () => { ScramjetController: new (cfg: unknown) => unknown };
  $scramjetVersion?: { version: string; build: string };
}
interface BareMuxGlobals {
  BareMux?: {
    BareMuxConnection: new (workerPath: string) => {
      getTransport(): Promise<string>;
      setTransport(url: string, args: unknown[], transfer?: unknown[]): Promise<void>;
    };
  };
}

type Win = (typeof globalThis) & ScramjetGlobals & BareMuxGlobals;

declare const window: Win;

/* ---------- estado del motor ---------- */
export type EngineStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface EngineDiagnostics {
  status: EngineStatus;
  scriptsLoaded: boolean;
  swRegistered: boolean;
  transportSet: boolean;
  wispUrl: string;
  error?: string;
  version?: string;
}

let controller: ScramjetControllerApi | null = null;
let connection: InstanceType<NonNullable<Win["BareMux"]>["BareMuxConnection"]> | null = null;
let initPromise: Promise<ScramjetControllerApi> | null = null;
let currentWisp = "";
let lastWispUrl = "";
let diag: EngineDiagnostics = {
  status: "idle",
  scriptsLoaded: false,
  swRegistered: false,
  transportSet: false,
  wispUrl: "",
};
const diagListeners = new Set<(d: EngineDiagnostics) => void>();

export function getDiagnostics(): EngineDiagnostics {
  return { ...diag, version: SCRAMJET_VERSION };
}
export function onDiagnostics(cb: (d: EngineDiagnostics) => void): () => void {
  diagListeners.add(cb);
  return () => diagListeners.delete(cb);
}
function updateDiag(patch: Partial<EngineDiagnostics>) {
  diag = { ...diag, ...patch };
  const snapshot = getDiagnostics();
  diagListeners.forEach((cb) => cb(snapshot));
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-sj="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.sj = src;
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src} (¿está public/scram/ completo?)`)));
    document.head.appendChild(s);
  });
}

/* ---------- prueba REAL de salud de un wisp ----------
   QUE NO ENGAÑE: un motor dormido (Render se apaga tras ~15 min sin tráfico)
   ACEPTA el WebSocket y hasta envía el CONTINUE inicial, pero jamás hace
   fluir datos → las páginas quedarían cargando para siempre y ningún error
   dispararía la auto-reparación. Por eso la prueba abre un mini-túnel wisp
   de verdad (CONNECT a example.com:80 + GET mínimo) y exige el primer byte
   de datos de vuelta. Solo sana si los datos fluyen. */
function wispFrame(type: number, streamId: number, payload: Uint8Array): Uint8Array {
  const f = new Uint8Array(5 + payload.length);
  f[0] = type;
  new DataView(f.buffer).setUint32(1, streamId, true);
  f.set(payload, 5);
  return f;
}

export function testWisp(url: string, timeoutMs = 9000): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    if (!/^wss?:\/\//i.test(url)) return resolve({ ok: false, detail: "La URL debe empezar por ws:// o wss://" });
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return resolve({ ok: false, detail: `URL inválida: ${String(e)}` });
    }
    ws.binaryType = "arraybuffer";
    const done = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve({ ok, detail });
    };
    const timer = setTimeout(
      () => done(false, "El motor acepta conexiones pero no hizo fluir datos a tiempo (¿motor dormido o arrancando?)"),
      timeoutMs,
    );
    ws.onopen = () => {
      // túnel mínimo wisp v1: CONNECT(example.com:80, TCP) + GET con cierre
      const host = "example.com";
      const hb = new TextEncoder().encode(host);
      const conn = new Uint8Array(3 + hb.length);
      conn[0] = 0x01; // TCP
      new DataView(conn.buffer).setUint16(1, 80, true);
      conn.set(hb, 3);
      ws.send(wispFrame(0x01, 1, conn)); // CONNECT
      ws.send(
        wispFrame(
          0x02,
          1,
          new TextEncoder().encode(`GET / HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: axcsos-health\r\nConnection: close\r\n\r\n`),
        ),
      ); // DATA
    };
    ws.onmessage = (ev) => {
      if (settled || !(ev.data instanceof ArrayBuffer)) return;
      const b = new Uint8Array(ev.data);
      if (b.length < 5) return;
      const type = b[0];
      if (type === 0x02) {
        // DATA del túnel: los datos fluyen de verdad
        done(true, "Túnel verificado: el motor hace fluir datos reales");
      } else if (type === 0x04) {
        // CLOSE del servidor: el motor rechazó el CONNECT de prueba
        done(false, "El motor rechazó la conexión de prueba al túnel");
      }
      // CONTINUE(0x03) / INFO(0x05): indiferente, seguir esperando datos
    };
    ws.onerror = () => {
      clearTimeout(timer);
      done(false, "El servidor rechazó o no existe la conexión WebSocket");
    };
    ws.onclose = () => {
      clearTimeout(timer);
      if (!settled) done(false, "El servidor cerró la conexión sin responder");
    };
  });
}

/**
 * Inicializa el motor completo. Orden crítico (verificado contra la app oficial):
 * 1. cargar scripts  2. controller.init() (crea IDB con stores ANTES que el SW)
 * 3. registrar SW     4. BareMuxConnection + setTransport(libcurl, wisp)
 */
export async function ensureEngine(wispUrl: string): Promise<ScramjetControllerApi> {
  lastWispUrl = wispUrl || lastWispUrl;
  if (!controller) {
    if (!initPromise) initPromise = doInit(wispUrl);
    controller = await initPromise;
  } else if (wispUrl && wispUrl !== currentWisp) {
    await applyTransport(wispUrl);
  }
  return controller;
}

async function doInit(wispUrl: string): Promise<ScramjetControllerApi> {
  const b = appBase();
  updateDiag({ status: "loading", wispUrl, error: undefined });
  try {
    await Promise.all([loadScript(`${b}/scram/scramjet.all.js`), loadScript(`${b}/baremux/index.js`)]);
    updateDiag({ scriptsLoaded: true });

    const w = window as unknown as Win;
    if (!w.$scramjetLoadController) throw new Error("scramjet.all.js no expuso $scramjetLoadController");
    const { ScramjetController } = w.$scramjetLoadController();
    const ctrl = new ScramjetController({
      prefix: `${b}/scramjet/`,
      files: {
        wasm: `${b}/scram/scramjet.wasm.wasm`,
        all: `${b}/scram/scramjet.all.js`,
        sync: `${b}/scram/scramjet.sync.js`,
      },
      flags: {
        interceptDownloads: true,
        allowInvalidJs: true,
        allowFailedIntercepts: true,
        captureErrors: true,
      },
    }) as unknown as ScramjetControllerApi;

    try {
      await ctrl.init();
    } catch (e) {
      // Autocura: si la BD $scramjet quedó creada sin stores (condición de carrera
      // conocida cuando el SW arranca antes que el controller), se borra y reintenta.
      const msg = String((e as Error)?.message ?? e);
      if (/object store/i.test(msg)) {
        await new Promise<void>((res) => {
          const req = indexedDB.deleteDatabase("$scramjet");
          req.onsuccess = req.onerror = req.onblocked = () => res();
        });
        await ctrl.init();
      } else {
        throw e;
      }
    }

    await navigator.serviceWorker.register(`${b}/sw.js`);
    await navigator.serviceWorker.ready;
    updateDiag({ swRegistered: true });

    // ACK del protocolo de sincronización de Scramjet: cuando una respuesta con
    // set-cookie llega a un fetch de ESTA página (no de un iframe), el SW espera
    // confirmación del cliente (client/dom/cookie.ts en el runtime real).
    // Sin este ACK, las peticiones a sitios que fijan cookies colgarían para siempre.
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data as { scramjet$type?: string; scramjet$token?: number } | null;
      if (d && typeof d === "object" && d.scramjet$type === "cookie" && typeof d.scramjet$token === "number") {
        navigator.serviceWorker.controller?.postMessage({
          scramjet$token: d.scramjet$token,
          scramjet$type: "cookie",
        });
      }
    });

    // ANTES de fijar el transporte se comprueba la cadena con la prueba
    // honesta (datos reales): si el motor propio está dormido/medio muerto
    // (arranque en frío de Render), se aplica el respaldo sano de verdad
    // en vez de dejar la primera navegación colgada para siempre.
    let healthy = wispUrl;
    try {
      healthy = await ensureHealthyWisp();
    } catch {
      /* sin prueba: se usa el solicitado tal cual, el watchdog de Safari actuará */
    }

    const conn = new w.BareMux!.BareMuxConnection(`${b}/baremux/worker.js`);
    connection = conn;
    await conn.setTransport(`${b}/libcurl/index.mjs`, [{ websocket: healthy }]);
    currentWisp = healthy;
    lastWispUrl = healthy;
    updateDiag({ transportSet: true, status: "ready", wispUrl: healthy });

    // proxy global de descargas: lo conecta Safari con la app Descargas
    ctrl.addEventListener("download", (e) => {
      const detail = (e as unknown as { download?: SjDownload }).download;
      if (detail?.body) downloadHandlers.forEach((h) => h(detail));
    });

    return ctrl;
  } catch (e) {
    updateDiag({ status: "error", error: String((e as Error)?.message ?? e) });
    initPromise = null;
    throw e;
  }
}

/** Cambia el servidor wisp en caliente (Ajustes → Navegador). */
export async function applyTransport(wispUrl: string): Promise<void> {
  if (!connection) throw new Error("El motor aún no está inicializado");
  await connection.setTransport(`${appBase()}/libcurl/index.mjs`, [{ websocket: wispUrl }]);
  currentWisp = wispUrl;
  updateDiag({ transportSet: true, wispUrl, status: "ready", error: undefined });
}

/* ---------- auto-recuperación ----------
   Scramjet "se cae de la nada" por causas reales conocidas:
   1. El SharedWorker de BareMux muere (ahorro de memoria del navegador,
      o el wisp demo corta la conexión) → "port is dead" en cada fetch.
   2. El Service Worker se desregistra/cuela tras una actualización.
   3. El servidor wisp demo cae (externo, sin garantía).
   recoverEngine() ataca las tres: re-registra el SW si hace falta, crea una
   conexión BareMux NUEVA (SharedWorker fresco) y comprueba la salud del wisp
   con failover a la cadena disponible. */
let recovering: Promise<void> | null = null;

async function setTransportFresh(wispUrl: string): Promise<void> {
  const w = window as unknown as Win;
  if (!w.BareMux) {
    await loadScript(`${appBase()}/baremux/index.js`);
  }
  const w2 = window as unknown as Win;
  if (!w2.BareMux) throw new Error("baremux no disponible");
  const conn = new w2.BareMux.BareMuxConnection(`${appBase()}/baremux/worker.js`);
  await conn.setTransport(`${appBase()}/libcurl/index.mjs`, [{ websocket: wispUrl }]);
  connection = conn;
  currentWisp = wispUrl;
  lastWispUrl = wispUrl;
}

/** Comprueba la cadena de wisps y aplica el primero sano. Devuelve el wisp activo.
 *  Cadena: motor propio (Render) → demo público → wisp local (solo desarrollo). */
export async function ensureHealthyWisp(): Promise<string> {
  const cur = currentWisp || lastWispUrl || defaultWisp();
  const isLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
  const chain = [cur, MAIN_WISP, DEMO_WISP, ...(isLocal ? [LOCAL_WISP] : [])];
  const seen = new Set<string>();
  for (const wisp of chain) {
    if (seen.has(wisp)) continue;
    seen.add(wisp);
    // El motor propio puede estar frío (Render se duerme sin tráfico): margen
    // amplio para el primer arranque; el resto de la cadena se prueba rápido.
    // La prueba es a nivel de DATOS: un WS que abre pero no fluye datos es un
    // motor medio muerto que colgaría las páginas para siempre.
    const r = await testWisp(wisp, wisp === MAIN_WISP ? 22000 : 8000);
    if (r.ok) {
      if (wisp !== cur) await setTransportFresh(wisp);
      updateDiag({ wispUrl: wisp, status: controller || diag.scriptsLoaded ? "ready" : "idle", transportSet: true, error: undefined });
      return wisp;
    }
  }
  return cur; // nada sano: se queda con el actual, los reintentos lo volverán a probar
}

/* ---------- keepalive del motor propio ----------
   El motor vive en Render (plan gratuito): sin tráfico, la instancia se
   duerme y la primera navegación cuelga sin datos (arranque en frío).
   Mantenemos un WebSocket abierto durante toda la sesión del OS y, además,
   lo RENOVAMOS cada 4 minutos: cada nueva conexión ES una petición entrante
   que resetea de verdad el temporizador de inactividad de Render (un WS
   abierto pero en silencio puede no contarse como tráfico). Si la conexión
   se corta antes, se reanuda sola a los 20 s. */
let keepaliveStarted = false;
let keepaliveWs: WebSocket | null = null;
let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;

export function startWispKeepalive(): void {
  if (keepaliveStarted || typeof window === "undefined") return;
  keepaliveStarted = true;
  const tick = (delay: number) => {
    if (keepaliveTimer) clearTimeout(keepaliveTimer);
    keepaliveTimer = setTimeout(() => {
      try {
        keepaliveWs?.close();
      } catch {
        /* ya estaba cerrado */
      }
      try {
        const ws = new WebSocket(MAIN_WISP);
        keepaliveWs = ws;
        ws.onopen = () => {
          // señal de depuración/E2E: el motor propio está caliente
          (window as unknown as { __wispKeepalive?: boolean }).__wispKeepalive = true;
          // renovación proactiva: dentro de 4 min, cerrar y reabrir
          tick(240000);
        };
        ws.onclose = () => {
          if (ws === keepaliveWs) tick(20000); // reconexión tras corte
        };
        ws.onerror = () => {
          /* onclose llegará después */
        };
      } catch {
        tick(60000);
      }
    }, delay);
  };
  tick(0);
}

/** Repara el motor tras una caída. Idempotente y seguro de llamar en cualquier momento. */
export async function recoverEngine(reason = "auto"): Promise<void> {
  if (recovering) {
    await recovering.catch(() => undefined);
    return;
  }
  recovering = (async () => {
    updateDiag({ status: "loading", error: `recuperando motor (${reason})` });
    try {
      // 1) Service Worker: re-registrar si la página dejó de estar controlada
      try {
        const reg = await navigator.serviceWorker.getRegistration?.(`${appBase()}/sw.js`);
        if (!reg || !navigator.serviceWorker.controller) {
          await navigator.serviceWorker.register(`${appBase()}/sw.js`);
          await navigator.serviceWorker.ready;
          updateDiag({ swRegistered: true });
        }
      } catch {
        /* el SW puede seguir vivo; continuar */
      }

      // 2) wisp sano + conexión BareMux nueva (SharedWorker fresco)
      try {
        await ensureHealthyWisp();
        await setTransportFresh(currentWisp || lastWispUrl || defaultWisp());
        updateDiag({ transportSet: true, status: "ready", error: undefined });
        return;
      } catch {
        /* continúa con el re-init completo */
      }

      // 3) re-init completo (controller incluido)
      controller = null;
      initPromise = null;
      await ensureEngine(lastWispUrl || defaultWisp());
    } finally {
      recovering = null;
    }
  })();
  await recovering;
}

/* ---------- descargas: el SW intercepta y emite un stream legible ---------- */
export interface SjDownload {
  filename?: string;
  url: string;
  body: ReadableStream<Uint8Array>;
  length: number;
}
type DownloadHandler = (d: SjDownload) => void;
const downloadHandlers = new Set<DownloadHandler>();
export function onEngineDownload(h: DownloadHandler): () => void {
  downloadHandlers.add(h);
  return () => downloadHandlers.delete(h);
}

export async function streamToBlob(d: SjDownload): Promise<Blob> {
  const reader = d.body.getReader();
  const chunks: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as unknown as BlobPart);
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

/** URL ya reescrita por el motor, lista para <iframe src>. Inicializa si hace falta. */
export async function engineEncodeUrl(url: string): Promise<string> {
  if (!controller) await ensureEngine(lastWispUrl || defaultWisp());
  if (!controller) throw new Error("Motor no inicializado");
  return controller.encodeUrl(url);
}

/**
 * fetch() de una URL real A TRAVÉS del motor (SW → wisp → sitio).
 * La página del OS ya está controlada por el SW, así que las rutas
 * /scramjet/ se interceptan y se sirven por el proxy.
 */
export async function engineFetch(url: string, init?: RequestInit): Promise<Response> {
  const enc = await engineEncodeUrl(url);
  return fetch(enc, init);
}

export function isEngineReady(): boolean {
  return diag.status === "ready";
}
