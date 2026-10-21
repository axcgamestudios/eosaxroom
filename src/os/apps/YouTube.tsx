"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Flame, History, Home, Loader2, MessageSquare, Search, ThumbsUp, User, X } from "lucide-react";
import type { AppProps } from "../types";
import {
  fmtDur,
  fmtViews,
  ytComments,
  ytHistory,
  ytHistoryClear,
  ytHistoryPush,
  ytHomeCached,
  ytMetaFallback,
  ytSearchCached,
  ytChannelCached,
  ytWatch,
  type YtComment,
  type YtVideo,
  type YtWatch,
} from "../services/yt";

/* ============================================================
   YouTube — cliente 100% nativo de axcsOS (sin Scramjet)
   Home / búsqueda / watch / comentarios / canales / historial.
   Reproductor propio <video> o embebido oficial si las fuentes
   libres están bloqueadas. Nunca pide iniciar sesión.
   ============================================================ */

export type YtView =
  | { t: "home" }
  | { t: "search"; q: string }
  | { t: "watch"; id: string }
  | { t: "channel"; id: string }
  | { t: "history" };

export function parseYouTubeUrl(raw: string): YtView | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[A-Za-z0-9_-]{6,}$/.test(id) ? { t: "watch", id } : { t: "home" };
    }
    if (host !== "youtube.com") return null;
    const v = u.searchParams.get("v");
    if (u.pathname === "/watch" && v) return { t: "watch", id: v };
    if (u.pathname === "/results" || u.pathname === "/search") {
      const q = u.searchParams.get("search_query") || u.searchParams.get("q") || "";
      return q ? { t: "search", q } : { t: "home" };
    }
    const ch = /^\/(channel|c|user|@)([^/]+)/.exec(u.pathname);
    if (ch) return { t: "channel", id: ch[2] };
    const sh = /^\/shorts\/([\w-]{6,})/.exec(u.pathname);
    if (sh) return { t: "watch", id: sh[1] };
    if (u.pathname === "/feed/trending" || u.pathname === "/feed/subscriptions") return { t: "home" };
    return { t: "home" };
  } catch {
    return null;
  }
}

export function ytUrlOf(v: YtView): string {
  switch (v.t) {
    case "watch": return `https://www.youtube.com/watch?v=${v.id}`;
    case "search": return `https://www.youtube.com/results?search_query=${encodeURIComponent(v.q)}`;
    case "channel": return `https://www.youtube.com/channel/${v.id}`;
    case "history": return "https://www.youtube.com/feed/history";
    default: return "https://www.youtube.com";
  }
}

/* ---------------- tarjetas ---------------- */

function Thumb({ v, className = "" }: { v: YtVideo; className?: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-xl bg-neutral-800 ${className}`}>
      <img
        src={v.thumb}
        alt=""
        loading="lazy"
        className="aspect-video h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        onError={(e) => {
          (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
        }}
      />
      {v.duration > 0 && (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
          {fmtDur(v.duration)}
        </span>
      )}
      {v.live && <span className="absolute left-1.5 top-1.5 rounded-md bg-red-600 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-white">En vivo</span>}
    </div>
  );
}

function VideoCard({ v, onOpen }: { v: YtVideo; onOpen: (v: YtVideo) => void }) {
  return (
    <button onClick={() => onOpen(v)} className="group flex w-full flex-col gap-2.5 text-left">
      <Thumb v={v} />
      <div className="flex gap-2.5">
        <img
          src={v.authorAvatar || `https://i.ytimg.com/vi/${v.id}/default.jpg`}
          alt=""
          loading="lazy"
          className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-neutral-800 object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
        />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-neutral-100 group-hover:text-white">{v.title}</p>
          <p className="mt-1 truncate text-[11px] text-neutral-400">{v.author}</p>
          <p className="truncate text-[11px] text-neutral-500">
            {fmtViews(v.views)}
            {v.views && v.uploaded ? " · " : ""}
            {v.uploaded}
          </p>
        </div>
      </div>
    </button>
  );
}

function VideoRow({ v, onOpen }: { v: YtVideo; onOpen: (v: YtVideo) => void }) {
  return (
    <button onClick={() => onOpen(v)} className="group flex w-full gap-3 rounded-xl p-1.5 text-left transition hover:bg-white/5">
      <Thumb v={v} className="w-44 shrink-0" />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-100">{v.title}</p>
        <p className="mt-1 text-[11px] text-neutral-400">{fmtViews(v.views)} {v.uploaded ? `· ${v.uploaded}` : ""}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {v.authorAvatar && <img src={v.authorAvatar} alt="" className="h-4 w-4 rounded-full object-cover" />}
          <p className="truncate text-[11px] text-neutral-500">{v.author}</p>
        </div>
      </div>
    </button>
  );
}

/* ---------------- reproductor ---------------- */

function Player({ w, onEnd }: { w: YtWatch; onEnd?: () => void }) {
  const [qOverride, setQOverride] = useState<string | null>(null);
  const quality = qOverride && w.streams.some((s) => s.quality === qOverride) ? qOverride : (w.streams[0]?.quality ?? "");
  const src = useMemo(() => w.streams.find((s) => s.quality === quality)?.url ?? w.streams[0]?.url ?? "", [quality, w.streams]);
  const ref = useRef<HTMLVideoElement | null>(null);

  if (w.live && w.hls) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black text-[12px] text-neutral-400">
        Las retransmisiones en directo necesitan fuentes externas ahora mismo.
      </div>
    );
  }

  if (w.embedFallback) {
    return (
      <div className="relative w-full">
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${w.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={w.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-neutral-500">
          Reproduciendo con el reproductor embebido oficial (las fuentes de vídeo libres están bloqueadas por Google en
          este momento). Sin Scramjet y sin iniciar sesión.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <video
        ref={ref}
        key={`${w.id}:${quality}`}
        src={src}
        controls
        autoPlay
        playsInline
        onEnded={onEnd}
        className="aspect-video w-full rounded-xl bg-black outline-none"
      />
      {w.streams.length > 1 && (
        <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
          <span className="text-[10px] text-neutral-500">Calidad</span>
          {w.streams.map((s) => (
            <button
              key={s.quality}
              onClick={() => setQOverride(s.quality)}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition ${
                s.quality === quality ? "bg-red-600 text-white" : "bg-white/10 text-neutral-300 hover:bg-white/20"
              }`}
            >
              {s.quality}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-neutral-600">reproductor nativo axcsOS · sin login</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- comentarios ---------------- */

function Comments({ videoId }: { videoId: string }) {
  const [data, setData] = useState<{ comments: YtComment[]; next?: string } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const retriedCooldown = useRef(false);

  const load = useCallback(
    (next?: string) => {
      setLoading(true);
      setErr("");
      ytComments(videoId, next)
        .then((r) => setData((d) => ({ comments: [...(d?.comments ?? []), ...r.comments], next: r.next })))
        .catch((e) => {
          const msg = String((e as Error).message ?? e);
          setErr(msg);
          // si /streams acaba de fallar, las fuentes están en cooldown breve: un reintento automático
          if (msg.includes("fuentes ocupadas") && !retriedCooldown.current) {
            retriedCooldown.current = true;
            setTimeout(() => load(next), 13200);
          }
        })
        .finally(() => setLoading(false));
    },
    [videoId]
  );

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className="border-t border-white/8 pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-neutral-200">
        <MessageSquare size={14} /> Comentarios
      </h3>
      {err && !data && (
        <div className="rounded-lg bg-white/5 p-3 text-[11.5px] text-neutral-400">
          {err}{" "}
          <button className="text-red-400 underline" onClick={() => load()}>
            reintentar
          </button>
        </div>
      )}
      <div className="space-y-4">
        {(data?.comments ?? []).map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <img src={c.authorAvatar} alt="" className="h-7 w-7 shrink-0 rounded-full bg-neutral-800 object-cover" />
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-neutral-200">
                {c.author} <span className="ml-1 font-normal text-neutral-500">{c.time}</span>
                {c.pinned && <span className="ml-1.5 rounded bg-white/10 px-1 py-0.5 text-[9px] uppercase text-neutral-400">fijado</span>}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-neutral-300">{c.content}</p>
              <p className="mt-1 flex items-center gap-1 text-[10.5px] text-neutral-500">
                <ThumbsUp size={10} /> {c.likes.toLocaleString("es")}
                {c.replies ? ` · ${c.replies} respuestas` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
      {data?.next && (
        <button onClick={() => load(data.next)} disabled={loading} className="mt-4 rounded-full bg-white/10 px-3.5 py-1.5 text-[11.5px] font-semibold text-neutral-200 transition hover:bg-white/20 disabled:opacity-50">
          {loading ? <Loader2 size={12} className="animate-spin" /> : "Cargar más comentarios"}
        </button>
      )}
      {loading && !data && <p className="text-[11.5px] text-neutral-500">Cargando comentarios…</p>}
      {!loading && !err && data && data.comments.length === 0 && <p className="text-[11.5px] text-neutral-500">Sin comentarios.</p>}
    </div>
  );
}

/* ---------------- página watch ---------------- */

function Watch({ id, onOpen, onOpenChannel, onTitle }: { id: string; onOpen: (v: YtVideo) => void; onOpenChannel: (id: string) => void; onTitle?: (t: string) => void }) {
  const [w, setW] = useState<YtWatch | null>(null);
  const [err, setErr] = useState("");
  const [metaFb, setMetaFb] = useState<{ title: string; author: string } | null>(null);
  const [descOpen, setDescOpen] = useState(false);
  const [related, setRelated] = useState<YtVideo[]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setW(null); setErr(""); setMetaFb(null); setRelated([]); setDescOpen(false);
      try {
        const data = await ytWatch(id);
        if (!alive) return;
        setW(data);
        if (onTitle) onTitle(`${data.title.slice(0, 48)} — YouTube`);
        ytHistoryPush({ id, title: data.title, author: data.author, thumb: data.thumb, duration: data.duration });
        if (data.related.length === 0) {
          // /streams bloqueado parcial → relacionados vía búsqueda del título
          try {
            const r = await ytSearchCached(data.title.slice(0, 60));
            if (alive) setRelated(r.filter((x) => x.id !== id).slice(0, 12));
          } catch { /* sin relacionados */ }
        }
      } catch (e) {
        if (!alive) return;
        // /streams bloqueado por completo → metadatos por oEmbed + relacionados por búsqueda + embed para reproducir
        try {
          const fb = await ytMetaFallback(id);
          if (!alive) return;
          setMetaFb(fb);
          if (onTitle) onTitle(`${fb.title.slice(0, 48)} — YouTube`);
          setW({
            id, title: fb.title, author: fb.author || "YouTube", authorId: "", authorAvatar: "",
            description: "", duration: 0, views: 0, uploaded: "", thumb: fb.thumb, live: false,
            streams: [], related: [], embedFallback: true,
            embedReason: "fuentes libres bloqueadas temporalmente",
          });
          const r = await ytSearchCached(fb.title.slice(0, 60)).catch(() => []);
          if (alive) setRelated(r.filter((x) => x.id !== id).slice(0, 12));
          ytHistoryPush({ id, title: fb.title, author: fb.author, thumb: fb.thumb, duration: 0 });
        } catch {
          setErr(String((e as Error).message ?? e));
        }
      }
    })();
    return () => { alive = false; };
  }, [id, retry]);

  if (err) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-[13px] font-semibold text-neutral-200">No se pudo cargar el vídeo</p>
        <p className="max-w-sm text-[11.5px] leading-relaxed text-neutral-500">{err}</p>
        <button onClick={() => setRetry((r) => r + 1)} className="rounded-full bg-red-600 px-4 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-red-500">
          Reintentar
        </button>
      </div>
    );
  }

  if (!w) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={22} className="animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="mac-scrollbar h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Player w={w} />
          <h1 className="mt-3 text-[15.5px] font-bold leading-snug text-neutral-50">{w.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-neutral-400">
            <span>{fmtViews(w.views)}</span>
            {w.uploaded && <span>· {w.uploaded}</span>}
            {typeof w.likes === "number" && w.likes > 0 && (
              <span className="flex items-center gap-1"><ThumbsUp size={11} /> {w.likes.toLocaleString("es")}</span>
            )}
            {metaFb && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">metadatos parciales</span>}
          </div>

          {w.author && (
            <button
              onClick={() => w.authorId && onOpenChannel(w.authorId)}
              className={`mt-3 flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/5 ${w.authorId ? "" : "cursor-default"}`}
            >
              {w.authorAvatar ? (
                <img src={w.authorAvatar} alt="" className="h-9 w-9 rounded-full bg-neutral-800 object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600/20 text-red-400"><User size={16} /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-neutral-100">{w.author}</p>
                {w.subscribers ? <p className="text-[10.5px] text-neutral-500">{w.subscribers.toLocaleString("es")} suscriptores</p> : null}
              </div>
              {w.authorId && <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-semibold text-neutral-200">Ver canal</span>}
            </button>
          )}

          {w.description && (
            <div className="mt-3 rounded-xl bg-white/[0.06] p-3">
              <p className={`whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-neutral-300 ${descOpen ? "" : "line-clamp-3"}`}>{w.description}</p>
              <button onClick={() => setDescOpen((o) => !o)} className="mt-1.5 text-[10.5px] font-semibold text-neutral-400 hover:text-neutral-200">
                {descOpen ? "Mostrar menos" : "…mostrar más"}
              </button>
            </div>
          )}

          <div className="mt-5">
            <Comments videoId={id} />
          </div>
        </div>

        <aside className="min-w-0">
          <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Siguientes</h3>
          <div className="space-y-2">
            {(w.related.length ? w.related : related).map((v) => (
              <VideoRow key={v.id} v={v} onOpen={onOpen} />
            ))}
            {(w.related.length === 0 && related.length === 0) && (
              <p className="text-[11px] text-neutral-600">Sin recomendaciones ahora mismo.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- contenedor principal ---------------- */

interface YtAppProps extends Partial<AppProps> {
  initialView?: YtView;
  embedded?: boolean;
  onNavigate?: (url: string) => void;
  onTitle?: (title: string) => void;
  onBack?: () => void;
  canBack?: boolean;
}

export default function YouTubeApp({ initialView, embedded = false, onNavigate, onTitle, onBack, canBack }: YtAppProps) {
  const [stack, setStack] = useState<YtView[]>([initialView ?? { t: "home" }]);
  const [pos, setPos] = useState(0);
  /* en modo incrustado (pestaña de Safari) la vista la manda la URL de la pestaña:
     cada navegación pasa por onNavigate → historial real de Safari → remount */
  const view = embedded ? (initialView ?? stack[0] ?? { t: "home" as const }) : (stack[pos] ?? stack[0]);
  const [query, setQuery] = useState(view.t === "search" ? view.q : "");
  const [homeItems, setHomeItems] = useState<YtVideo[] | null>(null);
  const [homeErr, setHomeErr] = useState("");
  const [searchItems, setSearchItems] = useState<YtVideo[] | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [reload, setReload] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const go = useCallback(
    (v: YtView, url?: string) => {
      if (embedded && onNavigate) {
        onNavigate(url ?? ytUrlOf(v));
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
        return;
      }
      setStack((s) => [...s.slice(0, pos + 1), v]);
      setPos((p) => p + 1);
      if (onNavigate) onNavigate(url ?? ytUrlOf(v));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
    },
    [pos, onNavigate, embedded]
  );

  const back = useCallback(() => {
    if (embedded && onBack) return onBack();
    setPos((p) => Math.max(0, p - 1));
  }, [embedded, onBack]);
  const canBackLocal = embedded ? (canBack ?? false) : pos > 0;

  const openVideo = useCallback((v: YtVideo) => go({ t: "watch", id: v.id }), [go]);
  const openChannel = useCallback((id: string) => go({ t: "channel", id }), [go]);

  /* título de ventana */
  useEffect(() => {
    if (!onTitle) return;
    const t =
      view.t === "watch" ? "YouTube · Vídeo" :
      view.t === "search" ? `YouTube · ${view.q}` :
      view.t === "channel" ? "YouTube · Canal" :
      view.t === "history" ? "YouTube · Historial" : "YouTube";
    onTitle(t);
  }, [view, onTitle]);

  /* home */
  useEffect(() => {
    if (view.t !== "home" || homeItems || homeErr) return;
    let alive = true;
    ytHomeCached()
      .then((items) => alive && setHomeItems(items))
      .catch((e) => alive && setHomeErr(String((e as Error).message ?? e)));
    return () => { alive = false; };
  }, [view.t, homeItems, homeErr, reload]);

  /* búsqueda */
  useEffect(() => {
    if (view.t !== "search") return;
    let alive = true;
    void (async () => {
      setSearchItems(null); setSearchErr("");
      try {
        const items = await ytSearchCached(view.q);
        if (alive) setSearchItems(items);
      } catch (e) {
        if (alive) setSearchErr(String((e as Error).message ?? e));
      }
    })();
    return () => { alive = false; };
  }, [view, reload]);

  /* historial */
  const histItems = useMemo(
    () => view.t === "history"
      ? ytHistory().map((h) => ({ id: h.id, title: h.title, author: h.author, authorId: "", thumb: h.thumb, duration: h.duration }))
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.t, reload]
  );

  const sidebar = (
    <>
      <button
        onClick={() => go({ t: "home" })}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${view.t === "home" ? "bg-white/12 text-white" : "text-neutral-400 hover:bg-white/6 hover:text-neutral-200"}`}
      >
        <Home size={15} /> Tendencias
      </button>
      <button
        onClick={() => go({ t: "history" })}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${view.t === "history" ? "bg-white/12 text-white" : "text-neutral-400 hover:bg-white/6 hover:text-neutral-200"}`}
      >
        <History size={15} /> Historial
      </button>
      {view.t === "search" && (
        <button
          onClick={() => go({ t: "search", q: view.q })}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-neutral-400 transition hover:bg-white/6 hover:text-neutral-200"
        >
          <Flame size={15} /> “{view.q.slice(0, 18)}”
        </button>
      )}
      <div className="mt-3 border-t border-white/8 pt-3">
        <p className="px-2.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-neutral-600">Acerca de</p>
        <p className="px-2.5 text-[10px] leading-relaxed text-neutral-600">
          Cliente nativo de axcsOS. Funciona sin cuenta, sin Scramjet y sin iniciar sesión. Vídeo vía fuentes libres o
          reproductor oficial embebido.
        </p>
      </div>
    </>
  );

  const errBox = (msg: string) => (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-[12.5px] font-semibold text-neutral-300">Las fuentes de YouTube no responden</p>
      <p className="max-w-sm text-[11px] leading-relaxed text-neutral-500">{msg}</p>
      <button onClick={() => { setHomeItems(null); setHomeErr(""); setSearchItems(null); setSearchErr(""); setReload((r) => r + 1); }} className="rounded-full bg-red-600 px-4 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-red-500">
        Reintentar
      </button>
    </div>
  );

  const content = (
    <div ref={scrollRef} className="mac-scrollbar h-full overflow-y-auto bg-[#0f0f0f]">
      {view.t === "home" && (
        <div className="mx-auto max-w-6xl p-5">
          {homeErr && errBox(homeErr)}
          {!homeErr && !homeItems && (
            <div className="flex h-64 items-center justify-center"><Loader2 size={22} className="animate-spin text-red-500" /></div>
          )}
          {homeItems && homeItems.length === 0 && (
            <p className="py-16 text-center text-[12px] text-neutral-500">Sin vídeos ahora mismo.</p>
          )}
          {homeItems && homeItems.length > 0 && (
            <>
              <h2 className="mb-4 flex items-center gap-2 text-[14px] font-bold text-neutral-100"><Flame size={15} className="text-red-500" /> Tendencias</h2>
              <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {homeItems.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
              </div>
            </>
          )}
        </div>
      )}

      {view.t === "search" && (
        <div className="mx-auto max-w-4xl p-5">
          {searchErr && errBox(searchErr)}
          {!searchErr && !searchItems && (
            <div className="flex h-64 items-center justify-center"><Loader2 size={22} className="animate-spin text-red-500" /></div>
          )}
          {searchItems && searchItems.length === 0 && (
            <p className="py-16 text-center text-[12px] text-neutral-500">Sin resultados para “{view.q}”.</p>
          )}
          <div className="space-y-2.5">
            {(searchItems ?? []).map((v) => <VideoRow key={v.id} v={v} onOpen={openVideo} />)}
          </div>
        </div>
      )}

      {view.t === "history" && (
        <div className="mx-auto max-w-4xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[14px] font-bold text-neutral-100"><Clock size={15} /> Historial de visualización</h2>
            {histItems.length > 0 && (
              <button onClick={() => { ytHistoryClear(); setReload((r) => r + 1); }} className="rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-semibold text-neutral-300 transition hover:bg-white/20">
                Borrar historial
              </button>
            )}
          </div>
          {histItems.length === 0 ? (
            <p className="py-14 text-center text-[12px] text-neutral-500">Aún no has visto ningún vídeo en axcsOS.</p>
          ) : (
            <div className="space-y-2.5">{histItems.map((v) => <VideoRow key={v.id} v={v} onOpen={openVideo} />)}</div>
          )}
        </div>
      )}

      {view.t === "watch" && <Watch id={view.id} onOpen={openVideo} onOpenChannel={openChannel} onTitle={onTitle} />}

      {view.t === "channel" && <ChannelView id={view.id} onOpen={openVideo} />}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex h-full flex-col bg-[#0f0f0f]">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/8 bg-[#0f0f0f]/95 px-2.5">
          {canBackLocal ? (
            <button onClick={back} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-neutral-200 transition hover:bg-white/20" title="Atrás en YouTube">
              <ArrowLeft size={14} />
            </button>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600/15">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-red-500" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </div>
          )}
          <form
            className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/8 px-3 focus-within:ring-2 focus-within:ring-red-500/50"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              if (q) go({ t: "search", q });
            }}
          >
            <Search size={12} className="shrink-0 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en YouTube"
              spellCheck={false}
              className="h-full w-full bg-transparent text-[11.5px] text-neutral-200 outline-none placeholder:text-neutral-600"
            />
          </form>
        </div>
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#0f0f0f]">
      <aside className="mac-scrollbar hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/8 bg-[#0f0f0f] p-2.5 sm:flex">
        <div className="mb-3 flex items-center gap-2 px-1.5 pt-1">
          <svg viewBox="0 0 28 20" className="h-4.5 w-6" aria-hidden>
            <rect width="28" height="20" rx="5" fill="#FF0000" />
            <path d="M11.5 5.8v8.4l7-4.2z" fill="#fff" />
          </svg>
          <span className="text-[13px] font-bold tracking-tight text-white">YouTube</span>
        </div>
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/8 px-4">
          {canBackLocal && (
            <button onClick={back} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-neutral-200 transition hover:bg-white/20" title="Atrás">
              <ArrowLeft size={14} />
            </button>
          )}
          <form
            className="flex h-8 min-w-0 max-w-xl flex-1 items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.06] px-4 focus-within:border-red-500/60"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              if (q) go({ t: "search", q });
            }}
          >
            <Search size={13} className="shrink-0 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar vídeos en YouTube"
              spellCheck={false}
              className="h-full w-full bg-transparent text-[12.5px] text-neutral-200 outline-none placeholder:text-neutral-600"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="shrink-0 text-neutral-600 hover:text-neutral-300"><X size={12} /></button>
            )}
          </form>
          <span className="ml-auto hidden shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[9.5px] font-semibold text-emerald-400 md:block">sin sesión · sin Scramjet</span>
        </div>
        <div className="min-h-0 flex-1">{content}</div>
      </div>
    </div>
  );
}

/* ---------------- vista de canal ---------------- */

function ChannelView({ id, onOpen }: { id: string; onOpen: (v: YtVideo) => void }) {
  const [data, setData] = useState<{ name: string; avatar: string; description: string; subscribers: number } | null>(null);
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setErr(""); setData(null); setVideos([]);
      try {
        const r = await ytChannelCached(id);
        if (!alive) return;
        setData(r.info);
        setVideos(r.videos);
      } catch (e) {
        if (alive) setErr(String((e as Error).message ?? e));
      }
    })();
    return () => { alive = false; };
  }, [id, retry]);

  if (err) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-[13px] font-semibold text-neutral-200">No se pudo cargar el canal</p>
        <p className="max-w-sm text-[11.5px] text-neutral-500">{err}</p>
        <button onClick={() => setRetry((r) => r + 1)} className="rounded-full bg-red-600 px-4 py-1.5 text-[11.5px] font-semibold text-white">Reintentar</button>
      </div>
    );
  }
  if (!data) {
    return <div className="flex h-full items-center justify-center"><Loader2 size={22} className="animate-spin text-red-500" /></div>;
  }
  return (
    <div className="mac-scrollbar h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-5">
        <div className="flex items-center gap-4 border-b border-white/8 pb-5">
          <img src={data.avatar} alt="" className="h-16 w-16 rounded-full bg-neutral-800 object-cover" />
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-neutral-50">{data.name}</h2>
            <p className="text-[11px] text-neutral-400">{data.subscribers.toLocaleString("es")} suscriptores</p>
            {data.description && <p className="mt-1 line-clamp-2 text-[11px] text-neutral-500">{data.description}</p>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {videos.map((v) => <VideoCard key={v.id} v={v} onOpen={onOpen} />)}
        </div>
        {videos.length === 0 && <p className="py-14 text-center text-[12px] text-neutral-500">Este canal no tiene vídeos públicos ahora mismo.</p>}
      </div>
    </div>
  );
}
