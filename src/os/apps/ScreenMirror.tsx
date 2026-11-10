"use client";

/* ============================================================
   Duplicar pantalla — receptora del OS (estilo AirPlay)
   ------------------------------------------------------------
   Al abrir la app: crea su punto de conexión (señalización
   pública de PeerJS + TURN público de Open Relay) y muestra
   CÓDIGO + QR + enlace. El iPhone abre la página emisora
   (/mirror), se empareja con el código y envía:
     · Cámara en vivo (stream WebRTC con audio)
     · Grabaciones de pantalla (fichero por el canal de datos)
     · Pantalla en vivo (desde Mac/PC/Android; Apple no permite
       capturar la pantalla del iPhone desde Safari)
   peerjs se carga como UMD propio (public/vendor) y qrcode con
   import() dinámico: nada pesa en el arranque del sistema.

   ROBUSTEZ: si la señalización se cae (pestaña en 2º plano del
   mismo iPhone, red inestable), el punto se AUTO-REPARA con el
   MISMO código — el QR/enlace que ya tienes sigue siendo válido.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, MonitorUp, RefreshCw, Smartphone, Volume2, VolumeX, X } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import {
  fmtBytes,
  genMirrorCode,
  isSignalingError,
  loadPeerClass,
  mirrorPeerId,
  mirrorSenderUrl,
  peerCommonOpts,
  type MirrorControl,
  type PeerDataConn,
  type PeerInstance,
  type PeerMediaConn,
} from "../services/mirror";

type Phase =
  | { s: "boot" } // creando el punto de conexión
  | { s: "ready" } // esperando al iPhone (código + QR)
  | { s: "connecting" } // emisor conectado, esperando contenido
  | { s: "live"; label: string } // retransmisión en vivo
  | { s: "file"; name: string; size: number; url: string } // grabación recibida
  | { s: "error"; msg: string };

/* límites de auto-reparación (sin bucles infinitos) */
const MAX_SIGNAL_RESPINS = 6; // re-spins con el mismo código tras fallos de señalización

export default function ScreenMirrorApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const [phase, setPhase] = useState<Phase>({ s: "boot" });
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [senderUrl, setSenderUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(true);
  const [fileProgress, setFileProgress] = useState<{ got: number; total: number } | null>(null);
  const [signal, setSignal] = useState<"ok" | "off" | "err">("ok");

  const peerRef = useRef<PeerInstance | null>(null);
  const offlineRef = useRef(false); // peer desconectado de la señalización
  const connRef = useRef<PeerDataConn | null>(null);
  const callRef = useRef<PeerMediaConn | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<{ name: string; size: number; mime: string; chunks: ArrayBuffer[]; got: number } | null>(null);
  const codeRef = useRef("");
  const busyRef = useRef(false); // ya hay un emisor aceptado
  const lastDataRef = useRef(0); // latido: último dato del emisor
  const spinTokenRef = useRef(0); // invalida spins obsoletos (carreras)
  const respinsRef = useRef(0); // re-spins consecutivos sin éxito
  const idRetryRef = useRef(0); // colisiones unavailable-id consecutivas

  /* ---------- mensajes del emisor ---------- */

  const onData = (raw: unknown) => {
    lastDataRef.current = Date.now(); // cualquier dato = señal de vida del emisor
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
      const f = fileRef.current;
      if (!f) return; // trozo sin cabecera: ignorar
      f.chunks.push(raw instanceof ArrayBuffer ? raw : (raw as Uint8Array).slice().buffer);
      f.got += raw.byteLength;
      if (f.size > 0) setFileProgress({ got: f.got, total: f.size });
      return;
    }
    const msg = raw as MirrorControl;
    if (!msg || typeof msg.t !== "string") return;
    switch (msg.t) {
      case "hello":
        notify("mirror", "iPhone conectado", "Elige en el móvil qué enviar: cámara, pantalla o una grabación.");
        break;
      case "ping":
        // latido del emisor: contestar en el acto para que sepa que vivimos
        try { connRef.current?.send({ t: "pong" } satisfies Record<string, unknown>); } catch { /* canal caído */ }
        break;
      case "live-start":
        setFileProgress(null);
        setPhase({ s: "live", label: msg.label || "En vivo" });
        break;
      case "live-stop":
        if (videoRef.current) videoRef.current.srcObject = null;
        setPhase({ s: "connecting" });
        break;
      case "file-start":
        fileRef.current = { name: msg.name, size: msg.size, mime: msg.mime || "video/mp4", chunks: [], got: 0 };
        setFileProgress({ got: 0, total: msg.size });
        break;
      case "file-end": {
        const f = fileRef.current;
        fileRef.current = null;
        setFileProgress(null);
        if (f) {
          const blob = new Blob(f.chunks, { type: f.mime });
          const url = URL.createObjectURL(blob);
          setPhase({ s: "file", name: f.name, size: f.size, url });
          notify("mirror", "Grabación recibida", `${f.name} · ${fmtBytes(f.size)}`);
        }
        break;
      }
      default:
        break;
    }
  };

  /* ---------- crear / recrear el punto de conexión ----------
     spin()          → código NUEVO (botón «Nueva conexión», primer arranque)
     spin(código)    → MISMO código: auto-reparación sin invalidar el QR      */

  const spin = useCallback(async (reuse?: string) => {
    // limpiar lo anterior
    try { peerRef.current?.destroy(); } catch { /* ignore */ }
    peerRef.current = null;
    connRef.current = null;
    callRef.current = null;
    fileRef.current = null;
    busyRef.current = false;
    offlineRef.current = false;
    if (reuse) respinsRef.current += 1; // cuenta auto-reparaciones consecutivas
    setFileProgress(null);
    setSignal("ok");

    const c = reuse ?? genMirrorCode();
    const myToken = ++spinTokenRef.current;
    codeRef.current = c;

    if (reuse) {
      // auto-reparación: el código/QR/enlace que ya ves SIGUEN valiendo
      setPhase((p) => (p.s === "boot" || p.s === "error" ? { s: "ready" } : p));
    } else {
      respinsRef.current = 0;
      setPhase({ s: "boot" });
      setCode(c);
      const url = mirrorSenderUrl(c);
      setSenderUrl(url);
      setCopied(false);
      // QR en paralelo a la creación del peer (no bloquea la señal)
      import("qrcode")
        .then((m) => m.default.toDataURL(url, { margin: 1, width: 300, color: { dark: "#0b1220ff", light: "#ffffffff" } }))
        .then((dataUrl: string) => setQr(dataUrl))
        .catch(() => setQr(""));
    }

    try {
      const Peer = await loadPeerClass();
      if (myToken !== spinTokenRef.current) return; // llegó otra spin: ceder
      const peer = new Peer(mirrorPeerId(c), peerCommonOpts());
      peerRef.current = peer;

      peer.on("open", () => {
        if (myToken !== spinTokenRef.current) return;
        offlineRef.current = false;
        respinsRef.current = 0; // recuperación exitosa
        idRetryRef.current = 0;
        setSignal("ok");
        setPhase((p) => (p.s === "boot" ? { s: "ready" } : p));
      });

      peer.on("disconnected", () => {
        if (myToken !== spinTokenRef.current) return;
        offlineRef.current = true;
        setSignal("off");
        // NO destruir si hay un emisor en vivo: el canal P2P sobrevive a la
        // caída de la señalización. Solo se re-para cuando estamos esperando.
        if (!busyRef.current) {
          window.setTimeout(() => {
            if (myToken === spinTokenRef.current && offlineRef.current && !busyRef.current) {
              void spin(codeRef.current);
            }
          }, 2000);
        }
      });

      peer.on("error", (err: Error & { type?: string }) => {
        if (myToken !== spinTokenRef.current) return;
        const type = err.type ?? "";
        if (type === "peer-unavailable") return; // respuestas a conn fallidas
        if (type === "unavailable-id") {
          // colisión: casi siempre nuestro propio ID recién liberado.
          // Reintentar el MISMO código (el QR sigue válido); si reincide, nuevo.
          const attempts = ++idRetryRef.current;
          window.setTimeout(
            () => void spin(attempts <= 1 ? codeRef.current : undefined),
            1500
          );
          return;
        }
        if (isSignalingError(type)) {
          setSignal("err");
          // señal caída: re-crear con el MISMO código hasta el tope, para no
          // invalidar el QR por una caída pasajera de la red.
          if (respinsRef.current < MAX_SIGNAL_RESPINS) {
            window.setTimeout(() => {
              if (!busyRef.current) void spin(codeRef.current);
            }, 2500);
          } else {
            setPhase({ s: "error", msg: "La conexión de emparejamiento es inestable en esta red. Comprueba la conexión del aula y reintenta con una conexión nueva." });
          }
          return;
        }
        setSignal("err");
        setPhase({ s: "error", msg: friendlyPeerError(type, err.message) });
      });

      /* ----- canal de datos: control + ficheros ----- */
      peer.on("connection", (conn) => {
        if (myToken !== spinTokenRef.current) { try { conn.close(); } catch { /* ignore */ } return; }
        if (busyRef.current) {
          // ya hay un emisor: esta conexión extra se descarta con aviso
          try { conn.on("open", () => conn.send({ t: "ack", busy: true } satisfies Record<string, unknown>)); } catch { /* ignore */ }
          setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 800);
          return;
        }
        busyRef.current = true;
        lastDataRef.current = Date.now();
        connRef.current = conn;
        conn.on("open", () => { lastDataRef.current = Date.now(); setPhase({ s: "connecting" }); });
        conn.on("data", (raw) => onData(raw as MirrorControl));
        conn.on("close", () => onSenderGone("El iPhone se desconectó"));
        conn.on("error", () => onSenderGone("Se perdió la conexión con el iPhone"));
      });

      /* ----- llamada multimedia: cámara / pantalla en vivo ----- */
      peer.on("call", (call) => {
        if (myToken !== spinTokenRef.current) return;
        if (!busyRef.current) return; // solo de nuestro emisor
        callRef.current = call;
        call.answer(); // sin stream local: solo recibimos
        call.on("stream", (remote) => {
          setMuted(true);
          setPhase((p) => (p.s === "live" ? p : { s: "live", label: p.s === "connecting" ? "iPhone" : "live" }));
          requestAnimationFrame(() => {
            const v = videoRef.current;
            if (v) {
              v.srcObject = remote as MediaStream;
              v.play().catch(() => { /* autoplay silenciado siempre permitido */ });
            }
          });
        });
        call.on("close", () => {
          if (videoRef.current) videoRef.current.srcObject = null;
          setPhase((p) => (p.s === "live" ? { s: "ready" } : p));
        });
      });
    } catch (e) {
      setSignal("err");
      setPhase({ s: "error", msg: String((e as Error).message ?? e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSenderGone = (why: string) => {
    if (connRef.current === null) return;
    connRef.current = null;
    callRef.current = null;
    busyRef.current = false;
    fileRef.current = null;
    setFileProgress(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase({ s: "ready" });
    notify("mirror", "Duplicar pantalla", why);
  };

  useEffect(() => {
    void spin();
    // iOS/Android suspenden pestañas en 2º plano: el socket de señalización
    // se cae en silencio y los temporizadores congelados saltan desordenados.
    // Al volver a primer plano se repara el punto con el MISMO código (el
    // QR/enlace que ya tienes sigue valiendo) — no se confía en peerjs.reconnect,
    // que no siempre re-registra el ID tras una suspensión larga.
    const repair = () => {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current) return; // con emisor en vivo, el canal P2P sigue
      if (offlineRef.current || !peerRef.current) void spin(codeRef.current);
    };
    document.addEventListener("visibilitychange", repair);
    // red de vigilancia: repara si tras una suspensión/fallo no hay peer vivo
    // (respinsRef acota las auto-reparaciones consecutivas: sin bucles)
    const iv = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      // emisor ZOMBI: iOS mata su pestaña en 2º plano sin disparar "close";
      // sin datos suyos en 45 s se libera el punto para re-emparejar (el
      // emisor nuevo se auto-reconecta con el mismo código y funciona).
      if (busyRef.current && Date.now() - lastDataRef.current > 45000) {
        onSenderGone("El iPhone dejó de responder (pestaña cerrada o en 2º plano largo): ya puedes emparejar de nuevo");
      }
      if (busyRef.current) return;
      if (spinTokenRef.current > 0 && respinsRef.current < MAX_SIGNAL_RESPINS) repair();
    }, 12000);
    return () => {
      document.removeEventListener("visibilitychange", repair);
      window.clearInterval(iv);
      try { callRef.current?.close(); } catch { /* ignore */ }
      try { connRef.current?.close(); } catch { /* ignore */ }
      try { peerRef.current?.destroy(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- acciones de UI ---------- */

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(senderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      notify("mirror", "Copia manual", senderUrl);
    }
  };

  const goFullscreen = () => {
    // iPhone Safari no soporta requestFullscreen en <div>: usar las variantes
    // webkit (y, en última instancia, el fullscreen NATIVO del elemento <video>)
    const v = videoRef.current;
    const wrap = v?.parentElement as (HTMLElement & { webkitRequestFullscreen?: () => unknown }) | null | undefined;
    try {
      if (wrap?.requestFullscreen) { void wrap.requestFullscreen(); return; }
      if (wrap?.webkitRequestFullscreen) { wrap.webkitRequestFullscreen(); return; }
      (v as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
    } catch { /* navegador sin fullscreen */ }
  };

  /* ================= render ================= */

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#101018] to-[#08080d] text-neutral-100">
      {/* barra superior */}
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <MonitorUp size={15} className="text-sky-400" />
        <span className="text-[12.5px] font-semibold">Duplicar pantalla</span>
        <span className="ml-2 flex items-center gap-1.5 text-[10.5px] text-neutral-400">
          <span className={`h-1.5 w-1.5 rounded-full ${signal === "ok" ? "bg-emerald-400" : signal === "off" ? "bg-amber-400" : "bg-red-400"}`} />
          {signal === "ok" ? "punto de conexión activo" : signal === "off" ? "reconectando…" : "señalización caída"}
        </span>
        <button
          onClick={() => void spin()}
          title="Nueva conexión (código nuevo)"
          className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-medium text-neutral-200 transition hover:bg-white/20"
        >
          <RefreshCw size={11} /> Nueva conexión
        </button>
      </div>

      {/* cuerpo según estado */}
      <div className="mac-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        {phase.s === "boot" && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-sky-400" />
              <p className="text-[12px]">Preparando el punto de conexión…</p>
            </div>
          </div>
        )}

        {phase.s === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
            <X size={26} className="text-red-400" />
            <p className="text-[13px] font-semibold">No se pudo abrir el punto de conexión</p>
            <p className="max-w-md text-[11.5px] leading-relaxed text-neutral-400">{phase.msg}</p>
            <button onClick={() => void spin()} className="rounded-full bg-sky-500 px-4 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-sky-400">
              Reintentar
            </button>
          </div>
        )}

        {(phase.s === "ready" || phase.s === "connecting") && (
          <div className="mx-auto grid max-w-4xl items-center gap-8 p-6 md:grid-cols-[auto_minmax(0,1fr)]">
            {/* tarjeta con código + QR */}
            <div className="mx-auto w-full max-w-[290px] rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`Código QR para emparejar: ${code}`} className="mx-auto w-full rounded-xl bg-white p-2" draggable={false} />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-white/5 text-[11px] text-neutral-500">generando QR…</div>
              )}
              <p className="mt-4 text-center text-[10.5px] font-medium uppercase tracking-wider text-neutral-500">código de emparejamiento</p>
              <p className="mt-1 text-center font-mono text-[30px] font-bold leading-none tracking-[0.18em] text-white">{code || "······"}</p>
              {signal !== "ok" && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-center text-[10px] leading-relaxed text-amber-200/90">
                  {signal === "off" ? "Reconectando el punto… mantén esta pantalla visible mientras tanto." : "Señalización caída: reintentando con el mismo código…"}
                </p>
              )}
              <button
                onClick={() => void copyLink()}
                className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                  copied ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-neutral-200 hover:bg-white/20"
                }`}
              >
                <Copy size={12} /> {copied ? "¡Enlace copiado!" : "Copiar enlace para el iPhone"}
              </button>
            </div>

            {/* instrucciones */}
            <div className="space-y-4">
              <h2 className="text-[16px] font-semibold text-white">Muestra tu iPhone aquí</h2>
              {phase.s === "connecting" ? (
                <div className="flex items-center gap-3 rounded-xl border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-[12px] text-sky-200">
                  <Smartphone size={16} className="shrink-0 animate-pulse" />
                  iPhone conectado. Elige en el móvil «Cámara en vivo», «Compartir pantalla» o envía una grabación.
                </div>
              ) : (
                <ol className="space-y-3 text-[12px] leading-relaxed text-neutral-300">
                  <li className="flex gap-3">
                    <Step n={1} />
                    <span>Escanea el código QR con la cámara del <b>iPhone</b> (o abre el enlace copiado en él).</span>
                  </li>
                  <li className="flex gap-3">
                    <Step n={2} />
                    <span>En la página que se abre, elige <b>Cámara en vivo</b> para verte en directo, o envía una <b>grabación de pantalla</b>.</span>
                  </li>
                  <li className="flex gap-3">
                    <Step n={3} />
                    <span>Esta pantalla mostrará tu iPhone <b>al instante</b>, con sonido incluido.</span>
                  </li>
                </ol>
              )}
              <a
                href={senderUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300/90 underline-offset-4 hover:underline"
              >
                Probar el emisor en este mismo equipo ↗
              </a>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-[10.5px] leading-relaxed text-neutral-400">
                <p className="mb-1 font-semibold text-neutral-300">Cómo grabar la pantalla del iPhone</p>
                Centro de control → botón <b>Grabación</b> (⏺) → mantén pulsado y activa el micrófono si quieres. Detén la grabación, ábrela en Fotos y envíala desde la página del enlace.
                <p className="mt-2 text-neutral-500">La duplicación <b>en vivo</b> de la pantalla completa solo está disponible enviando desde Mac, PC o Android. Apple no permite capturar la pantalla del iPhone desde el navegador.</p>
              </div>
            </div>
          </div>
        )}

        {phase.s === "live" && (
          <div className="flex h-full flex-col">
            <div className="relative flex-1 bg-black">
              <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-contain" />
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> en vivo · {phase.label}
              </div>
              {muted && (
                <button
                  onClick={() => setMuted(false)}
                  className="absolute inset-x-0 bottom-3 mx-auto flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-semibold text-neutral-900 shadow-lg transition hover:bg-white"
                >
                  <Volume2 size={12} /> Activar sonido
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-white/8 px-4 py-2.5">
              <span className="text-[11px] text-neutral-400">Recibiendo vídeo y audio del iPhone en directo</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-medium text-neutral-200 transition hover:bg-white/20"
                >
                  {muted ? <VolumeX size={11} /> : <Volume2 size={11} />} {muted ? "Sonido" : "Silenciar"}
                </button>
                <button onClick={goFullscreen} className="rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-medium text-neutral-200 transition hover:bg-white/20">
                  Pantalla completa
                </button>
              </div>
            </div>
          </div>
        )}

        {phase.s === "file" && (
          <div className="flex h-full flex-col">
            <div className="flex-1 bg-black">
              <video src={phase.url} controls autoPlay className="h-full w-full object-contain" />
            </div>
            <div className="flex items-center gap-2 border-t border-white/8 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-neutral-100">{phase.name}</p>
                <p className="text-[10px] text-neutral-500">grabación recibida · {fmtBytes(phase.size)}</p>
              </div>
              <a
                href={phase.url}
                download={phase.name}
                className="ml-auto rounded-full bg-sky-500 px-4 py-1.5 text-[10.5px] font-semibold text-white transition hover:bg-sky-400"
              >
                Guardar
              </a>
              <button onClick={() => void spin()} className="rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-medium text-neutral-200 transition hover:bg-white/20">
                Otra
              </button>
            </div>
          </div>
        )}

        {fileProgress && (
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 backdrop-blur">
            <p className="mb-1 flex justify-between text-[10.5px] text-neutral-300">
              <span>Recibiendo grabación…</span>
              <span>{fmtBytes(fileProgress.got)} / {fmtBytes(fileProgress.total)}</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width]"
                style={{ width: `${Math.min(100, (fileProgress.got / Math.max(1, fileProgress.total)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-[10.5px] font-bold text-sky-300">
      {n}
    </span>
  );
}

function friendlyPeerError(type: string, msg: string): string {
  switch (type) {
    case "browser-incompatible":
      return "Este navegador no soporta WebRTC.";
    case "network":
    case "server-error":
    case "socket-error":
      return "No se pudo alcanzar el servicio de emparejamiento (0.peerjs.com). Comprueba la conexión y reintenta.";
    case "webrtc":
      return `Fallo WebRTC: ${msg}`;
    default:
      return msg || type;
  }
}
