/* ============================================================
   Duplicar pantalla — protocolo compartido emisor/receptor
   ------------------------------------------------------------
   WebRTC punto a punto (PeerJS, señalización pública de
   0.peerjs.com — sin servidor propio, funciona en GitHub Pages).

   Receptor (app del OS):  peer con ID fijo  axcs-mirror-<CÓDIGO>
   Emisor  (página /mirror, móvil): peer anónimo que se conecta
   a ese ID y envía:
     · MediaConnection (cámara o pantalla en vivo)
     · DataConnection   (control + ficheros de grabación)

   Mensajes de control (JSON por el DataConnection):
     { t: "hello", ua }                      saludo del emisor
     { t: "live-start", label }              empieza retransmisión
     { t: "live-stop" }                      se detuvo
     { t: "file-start", name, size, mime }   cabecera del fichero
     { t: "file-end" }                       fin del fichero
     { t: "file-progress", sent }            progreso (cortesía)
     { t: "ack" }                            el receptor confirma
   Los trozos del fichero llegan como ArrayBuffer binario.
   ============================================================ */

/** Alfabeto sin caracteres ambiguos (sin 0/O ni 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LEN = 6;

export function genMirrorCode(): string {
  let s = "";
  const rnd = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[rnd[i] % CODE_ALPHABET.length];
  return s;
}

export function isValidMirrorCode(c: unknown): c is string {
  return typeof c === "string" && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`).test(c);
}

export function mirrorPeerId(code: string): string {
  return `axcs-mirror-${code}`;
}

/** URL absoluta de la página emisora (funciona en Pages y en dev). */
export function mirrorSenderUrl(code: string): string {
  const base = new URL("mirror/", document.baseURI);
  base.searchParams.set("c", code);
  return base.toString();
}

/* --------- tipos de mensajes --------- */

export interface MirrorHello { t: "hello"; ua: string }
export interface MirrorLiveStart { t: "live-start"; label: string }
export interface MirrorLiveStop { t: "live-stop" }
export interface MirrorFileStart { t: "file-start"; name: string; size: number; mime: string }
export interface MirrorFileEnd { t: "file-end" }
export interface MirrorFileProgress { t: "file-progress"; sent: number }
export interface MirrorAck { t: "ack" }

export type MirrorControl =
  | MirrorHello
  | MirrorLiveStart
  | MirrorLiveStop
  | MirrorFileStart
  | MirrorFileEnd
  | MirrorFileProgress
  | MirrorAck;

export const CHUNK_SIZE = 64 * 1024; // 64 KiB por mensaje del canal de datos
export const MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MB de tope razonable

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Detecta soporte de captura de pantalla (no existe en iPhone Safari). */
export function canShareScreen(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

/* ============================================================
   Carga de PeerJS
   ------------------------------------------------------------
   Se usa el build UMD propio (public/vendor/peerjs.min.js) con
   <script> clásico en vez del import() del paquete npm: el
   empaquetado de Next/Turbopack rompía el WebSocket de
   señalización del EMISOR (probado en E2E), mientras que el UMD
   funciona idéntico en ambos extremos. Se cachea la promesa.
   ============================================================ */

/** URL de un asset de public/ sirviendo bien bajo basePath:
 *  /eosaxroom/mirror/ → /eosaxroom/… · /eosaxroom/ → /eosaxroom/… · / → /… */
export function vendorAssetUrl(file: string): string {
  let base = location.pathname;
  base = base.replace(/mirror\/?$/, "");
  if (!base.endsWith("/")) base += "/";
  return base + file;
}

export interface PeerDataConn {
  open: boolean;
  send(data: unknown): void;
  on(ev: string, cb: (e: unknown) => void): void;
  close(): void;
  readonly dataChannel?: RTCDataChannel;
}

export interface PeerMediaConn {
  on(ev: string, cb: (e: unknown) => void): void;
  close(): void;
}

export interface PeerInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(ev: string, cb: (e: any) => void): void;
  connect(id: string, opts?: Record<string, unknown>): PeerDataConn;
  call(id: string, stream: MediaStream, opts?: Record<string, unknown>): PeerMediaConn;
  destroy(): void;
  reconnect(): void;
}

export type PeerConstructor = new (
  idOrOpts?: string | Record<string, unknown>,
  opts?: Record<string, unknown>
) => PeerInstance;

let peerLib: Promise<PeerConstructor> | null = null;

/** Carga (una sola vez) PeerJS UMD como window.Peer. */
export function loadPeerClass(): Promise<PeerConstructor> {
  if (peerLib) return peerLib;
  peerLib = new Promise<PeerConstructor>((resolve, reject) => {
    const w = window as unknown as { Peer?: PeerConstructor };
    if (w.Peer) {
      resolve(w.Peer);
      return;
    }
    const s = document.createElement("script");
    s.src = vendorAssetUrl("vendor/peerjs.min.js");
    s.async = true;
    s.onload = () => {
      if (w.Peer) resolve(w.Peer);
      else reject(new Error("PeerJS cargado pero no se registró como global"));
    };
    s.onerror = () => reject(new Error("No se pudo cargar PeerJS (vendor/peerjs.min.js)"));
    document.head.appendChild(s);
  });
  return peerLib;
}
