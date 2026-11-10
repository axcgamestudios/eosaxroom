"use client";

/* ============================================================
   /mirror — página emisora de Duplicar pantalla (para el móvil)
   ------------------------------------------------------------
   Se abre escaneando el QR de la app "Duplicar pantalla" del OS
   (o con ?c=CÓDIGO). Empareja por PeerJS y permite:
     · Cámara en vivo (iPhone: trasera, con audio)
     · Compartir pantalla (donde el navegador lo soporte)
     · Enviar una grabación de pantalla hecha en el iPhone
   Página independiente del escritorio: se ve bien en el móvil
   desde el primer píxel. Se sirve en /eosaxroom/mirror/ (Pages).
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, MonitorSmartphone, Square, Upload } from "lucide-react";
import {
  CHUNK_SIZE,
  MAX_FILE_BYTES,
  canShareScreen,
  fmtBytes,
  isValidMirrorCode,
  mirrorPeerId,
  type MirrorControl,
} from "@/os/services/mirror";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";

type Mode = "idle" | "live" | "sending";
type Conn = "setup" | "connecting" | "ready" | "error";

export default function MirrorSender() {
  /* código: del QR (?c=…) o tecleado */
  const [input, setInput] = useState("");
  const [code, setCode] = useState("");
  const [conn, setConn] = useState<Conn>("setup");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const callRef = useRef<{ close: () => void } | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* código inicial de la URL */
  useEffect(() => {
    const c = new URLSearchParams(location.search).get("c") ?? "";
    if (isValidMirrorCode(c)) {
      setInput(c);
      setCode(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- conexión con la pantalla del OS ---------- */

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { callRef.current?.close(); } catch { /* ignore */ }
    try { connRef.current?.close(); } catch { /* ignore */ }
    try { peerRef.current?.destroy(); } catch { /* ignore */ }
    callRef.current = null;
    connRef.current = null;
    peerRef.current = null;
    setMode("idle");
    setSendProgress(null);
  }, []);

  const connect = useCallback(
    async (c: string) => {
      if (!isValidMirrorCode(c)) {
        setErr("El código tiene 6 letras/números (sin 0/O ni 1/I).");
        return;
      }
      setErr("");
      setConn("connecting");
      setCode(c);
      try {
        const { default: Peer } = await import("peerjs");
        const peer = new Peer({ debug: 0 }); // ID anónimo asignado por la nube
        peerRef.current = peer;

        const data = peer.connect(mirrorPeerId(c), { reliable: true });
        connRef.current = data;

        const failTimer = window.setTimeout(() => {
          setConn("error");
          setErr("No se encontró la pantalla con ese código. ¿Sigue abierta la app «Duplicar pantalla»?");
          try { peer.destroy(); } catch { /* ignore */ }
        }, 12000);

        data.on("open", () => {
          window.clearTimeout(failTimer);
          setConn("ready");
          data.send({ t: "hello", ua: navigator.userAgent } satisfies MirrorControl);
        });
        data.on("close", () => {
          setConn("error");
          setErr("La pantalla receptora cerró la conexión.");
          cleanup();
        });
        data.on("error", () => {
          setConn("error");
          setErr("Error del canal de datos con la pantalla.");
        });

        peer.on("error", (e: Error & { type?: string }) => {
          if (e.type === "peer-unavailable") {
            window.clearTimeout(failTimer);
            setConn("error");
            setErr("No se encontró la pantalla con ese código. Compruébalo e reintenta.");
            try { peer.destroy(); } catch { /* ignore */ }
          }
        });
      } catch (e) {
        setConn("error");
        setErr(String((e as Error).message ?? e));
      }
    },
    [cleanup]
  );

  useEffect(() => () => cleanup(), [cleanup]);

  /* ---------- retransmitir un MediaStream ---------- */

  const stopLive = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { callRef.current?.close(); } catch { /* ignore */ }
    callRef.current = null;
    try { connRef.current?.send({ t: "live-stop" } satisfies MirrorControl); } catch { /* ignore */ }
    if (previewRef.current) previewRef.current.srcObject = null;
    setMode("idle");
  }, []);

  const goLive = useCallback(
    async (label: string) => {
      const conn0 = connRef.current;
      const peer0 = peerRef.current;
      if (!conn0 || !peer0 || !conn0.open) return;

      // cortar una retransmisión anterior
      if (streamRef.current) stopLive();

      let stream: MediaStream;
      try {
        if (label === "Pantalla") {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
        }
      } catch (e) {
        setErr(`No se pudo acceder a ${label === "Pantalla" ? "la pantalla" : "la cámara"}: ${String((e as Error).message ?? e)}`);
        return;
      }
      setErr("");
      streamRef.current = stream;

      const call = peer0.call(mirrorPeerId(code), stream);
      callRef.current = call;
      call.on("close", () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setMode((m) => (m === "live" ? "idle" : m));
      });

      conn0.send({ t: "live-start", label } satisfies MirrorControl);
      setMode("live");

      // preview local (sin sonido para no acoplar)
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => { /* ignore */ });
      }

      // si se detiene desde el diálogo nativo del navegador
      stream.getVideoTracks()[0]?.addEventListener("ended", stopLive);
    },
    [code, stopLive]
  );

  /* ---------- enviar una grabación (fichero) ---------- */

  const sendFile = useCallback(async (f: File) => {
    const conn0 = connRef.current;
    if (!conn0 || !f) return;
    if (f.size > MAX_FILE_BYTES) {
      setErr(`El vídeo pesa ${fmtBytes(f.size)}: el tope es ${fmtBytes(MAX_FILE_BYTES)}. Recórtalo en Fotos antes de enviarlo.`);
      return;
    }
    setMode("sending");
    setSendProgress({ sent: 0, total: f.size });
    conn0.send({ t: "file-start", name: f.name, size: f.size, mime: f.type || "video/mp4" } satisfies MirrorControl);

    const dc = (conn0 as unknown as { dataChannel?: RTCDataChannel }).dataChannel;
    let sent = 0;
    const CHUNKS = Math.ceil(f.size / CHUNK_SIZE);
    for (let i = 0; i < CHUNKS; i++) {
      // eslint-disable-next-line no-await-in-loop
      const buf = await f.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).arrayBuffer();
      // control de contrapresión: si el canal está lleno, respira
      if (dc && dc.bufferedAmount > 4 * 1024 * 1024) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((r) => setTimeout(r, 60));
      }
      conn0.send(buf);
      sent += buf.byteLength;
      if (i % 8 === 0 || i === CHUNKS - 1) setSendProgress({ sent, total: f.size });
    }
    conn0.send({ t: "file-end" } satisfies MirrorControl);
    setTimeout(() => setSendProgress(null), 1200);
    setMode("idle");
  }, []);

  /* ---------- UI ---------- */

  const screenOK = canShareScreen();

  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#0d1424] to-[#070b14] text-neutral-100">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-8 pt-10">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-400/30">
            <MonitorSmartphone size={30} className="text-sky-400" />
          </div>
          <h1 className="text-[22px] font-bold tracking-tight">Duplicar pantalla</h1>
          <p className="mt-1 text-[12.5px] text-neutral-400">Envía tu iPhone a la pantalla del aula</p>
        </header>

        {conn === "setup" || conn === "error" ? (
          /* -------- paso 1: código -------- */
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Código de la pantalla</label>
            <div className="mt-2 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))}
                placeholder="ABC234"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-[20px] font-bold tracking-[0.25em] text-white outline-none placeholder:text-neutral-600 focus:border-sky-400/60"
              />
              <button
                onClick={() => void connect(input)}
                className="shrink-0 rounded-xl bg-sky-500 px-5 text-[13px] font-bold text-white transition active:bg-sky-400"
              >
                Conectar
              </button>
            </div>
            {conn === "error" && <p className="mt-3 text-[11.5px] leading-relaxed text-red-300">{err}</p>}
            <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
              El código aparece en grande dentro de la app <b className="text-neutral-300">Duplicar pantalla</b> del aula, junto a su código QR.
            </p>
          </section>
        ) : conn === "connecting" ? (
          /* -------- conectando -------- */
          <section className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-8">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-sky-400" />
            <p className="text-[12.5px] text-neutral-300">
              Emparejando con la pantalla <span className="font-mono font-bold">{code}</span>…
            </p>
          </section>
        ) : (
          /* -------- conectado: modos -------- */
          <section className="space-y-3">
            {mode === "live" ? (
              <div className="overflow-hidden rounded-3xl border border-red-400/30 bg-black">
                <div className="relative">
                  <video ref={previewRef} muted playsInline className="max-h-64 w-full bg-black object-contain" />
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-bold uppercase text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> en vivo
                  </div>
                </div>
                <button
                  onClick={stopLive}
                  className="flex w-full items-center justify-center gap-2 py-4 text-[14px] font-bold text-red-300 transition active:bg-white/5"
                >
                  <Square size={14} /> Detener y elegir otra cosa
                </button>
              </div>
            ) : sendProgress ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <p className="mb-3 text-[12.5px] font-semibold">Enviando grabación…</p>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${(sendProgress.sent / sendProgress.total) * 100}%` }} />
                </div>
                <p className="mt-2 text-right text-[11px] text-neutral-400">
                  {fmtBytes(sendProgress.sent)} / {fmtBytes(sendProgress.total)}
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={() => void goLive("Cámara")}
                  className="flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition active:scale-[0.99] active:bg-white/10"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/20 ring-1 ring-sky-400/40">
                    <Camera size={22} className="text-sky-300" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold">Cámara en vivo</span>
                    <span className="block text-[11.5px] leading-snug text-neutral-400">Videollamada con la pantalla del aula, con sonido</span>
                  </span>
                </button>

                {screenOK && (
                  <button
                    onClick={() => void goLive("Pantalla")}
                    className="flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition active:scale-[0.99] active:bg-white/10"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/40">
                      <MonitorSmartphone size={22} className="text-emerald-300" />
                    </span>
                    <span>
                      <span className="block text-[15px] font-bold">Compartir pantalla</span>
                      <span className="block text-[11.5px] leading-snug text-neutral-400">Duplica tu pantalla en directo</span>
                    </span>
                  </button>
                )}

                <label className="flex w-full cursor-pointer items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition active:scale-[0.99] active:bg-white/10">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 ring-1 ring-amber-400/40">
                    <Upload size={22} className="text-amber-300" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold">Enviar grabación de pantalla</span>
                    <span className="block text-[11.5px] leading-snug text-neutral-400">
                      Grábala en el iPhone (Centro de control ⏺) y envíala aquí — se reproduce al instante en el aula
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void sendFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>

                {!screenOK && (
                  <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-[10.5px] leading-relaxed text-amber-200/80">
                    Apple no permite compartir la pantalla del iPhone en directo desde el navegador. Usa la <b>cámara en vivo</b> o envía una <b>grabación</b>: ambas se ven en el aula al momento.
                  </p>
                )}
              </>
            )}

            <button
              onClick={() => {
                cleanup();
                setConn("setup");
              }}
              className="w-full rounded-2xl border border-white/10 py-3 text-[12px] font-medium text-neutral-400 transition active:bg-white/5"
            >
              Cambiar de pantalla (otro código)
            </button>
          </section>
        )}

        <footer className="mt-auto pt-8 text-center text-[10px] text-neutral-600">
          Conexión directa iPhone ↔ pantalla, cifrada (WebRTC). Sin servidores intermedios de vídeo.
        </footer>
      </div>
    </main>
  );
}
