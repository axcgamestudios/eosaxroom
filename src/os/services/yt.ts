/* ============================================================
   YouTube 100% nativo de axcsOS — SIN Scramjet, SIN login.
   ------------------------------------------------------------
   Estrategia (verificada en red):
   1. Metadatos (tendencias, búsqueda, comentarios, canales):
      API pública de Piped (instancias OSS con CORS *),
      con failover automático entre instancias.
   2. Reproducción: stream directo muxed (vídeo+audio) vía el
      proxy de la instancia → <video> nativo propio.
   3. Si todas las fuentes libres están bloqueadas por Google
      (muro anti-bot de las IPs de las instancias), se usa el
      reproductor oficial embebido (youtube-nocookie), que se
      sirve desde la IP DEL USUARIO y no pide login.
   Nunca pasa por Scramjet. Navegación 100% dentro del OS.
   ============================================================ */

export interface YtVideo {
  id: string;
  title: string;
  author: string;
  authorId: string;
  authorAvatar?: string;
  thumb: string;
  duration: number; // segundos
  views?: number;
  uploaded?: string;
  isShort?: boolean;
  live?: boolean;
}

export interface YtChannelInfo {
  id: string;
  name: string;
  avatar: string;
  banner?: string;
  description: string;
  subscribers: number;
  verified: boolean;
}

export interface YtStream {
  url: string;
  quality: string;
  mime: string;
  muxed: boolean;
  sizeBytes?: number;
}

export interface YtWatch {
  id: string;
  title: string;
  author: string;
  authorId: string;
  authorAvatar: string;
  subscribers?: number;
  description: string;
  duration: number;
  views: number;
  likes?: number;
  uploaded: string;
  thumb: string;
  live: boolean;
  streams: YtStream[]; // muxed, ordenadas de mayor a menor calidad
  hls?: string;
  related: YtVideo[];
  /** true → hay que usar el reproductor embebido oficial */
  embedFallback: boolean;
  embedReason?: string;
}

export interface YtComment {
  id: string;
  author: string;
  authorAvatar: string;
  authorId: string;
  content: string;
  time: string;
  likes: number;
  pinned?: boolean;
  replies?: number;
}

/* ---------------- instancias ---------------- */
// Orden: primero las verificadas con CORS + API viva. El failover rota.
const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.ducks.party",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.reallyaweso.me",
];

let idx = 0; // índice de la instancia "sana" actual
let okUntil = 0; // evita sondear en cada llamada cuando todo falla

function base(): string {
  return PIPED_INSTANCES[idx % PIPED_INSTANCES.length];
}

async function piped<T>(path: string, timeoutMs = 12000): Promise<T> {
  if (Date.now() < okUntil) throw new Error("fuentes ocupadas (cooldown)");
  const started = Date.now();
  const tried = new Set<string>();
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < PIPED_INSTANCES.length; attempt++) {
    const i = (idx + attempt) % PIPED_INSTANCES.length;
    const inst = PIPED_INSTANCES[i];
    if (tried.has(inst)) break;
    tried.add(inst);
    try {
      const res = await fetch(inst + path, { signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("respuesta no JSON (instancia caída)");
      }
      // la API de Piped devuelve {error: "..."} con 200 a veces
      const maybe = data as { error?: string; message?: string; code?: number };
      if (maybe && typeof maybe.error === "string" && Object.keys(maybe).length <= 3) {
        throw new Error(maybe.error.slice(0, 140));
      }
      idx = i; // esta instancia funciona: fíjala
      return data as T;
    } catch (e) {
      lastErr = e;
      if (Date.now() - started > timeoutMs * 2.2) break;
    }
  }
  // todo falló: cooldown corto para no martillear
  okUntil = Date.now() + 12000;
  throw lastErr instanceof Error ? lastErr : new Error("Sin instancias disponibles");
}

/* ---------------- helpers ---------------- */

export function ytRegion(): string {
  try {
    const loc = new Intl.Locale(navigator.language || "es");
    const r = (loc as unknown as { region?: string }).region;
    if (r && r.length === 2) return r;
  } catch { /* ignore */ }
  return "US";
}

function fmtDurPath(u: string): string {
  // "/watch?v=ID" → "ID"
  const m = /[?&]v=([\w-]{6,})/.exec(u || "");
  return m ? m[1] : "";
}

function mapItem(it: Record<string, unknown>): YtVideo | null {
  const type = String(it.type ?? "");
  const id = fmtDurPath(String(it.url ?? "")) || String(it.id ?? "");
  if (type === "channel" || type === "playlist" || !id) return null;
  const dur = Number(it.duration ?? 0);
  return {
    id,
    title: String(it.title ?? ""),
    author: String(it.uploaderName ?? ""),
    authorId: String(it.uploaderUrl ?? "").replace("/channel/", "") || String(it.uploaderId ?? ""),
    authorAvatar: String(it.uploaderAvatar ?? "") || undefined,
    thumb: String(it.thumbnail ?? "") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: Number.isFinite(dur) ? dur : 0,
    views: typeof it.views === "number" && it.views > 0 ? it.views : undefined,
    uploaded: typeof it.uploadedDate === "string" ? it.uploadedDate : undefined,
    isShort: Boolean(it.isShort),
    live: dur < 0 || Boolean(it.isLive),
  };
}

export function mapItems(raw: unknown): YtVideo[] {
  const arr = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
  return (arr as Record<string, unknown>[]).map(mapItem).filter((v): v is YtVideo => !!v);
}

export function fmtViews(n?: number): string {
  if (!n || n <= 0) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".0", "")} B de vistas`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".0", "")} M de vistas`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} K de vistas`;
  return `${n} vistas`;
}

export function fmtDur(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/* ---------------- feeds ---------------- */

export async function ytHome(region?: string): Promise<YtVideo[]> {
  return mapItems(await piped<unknown>(`/trending?region=${encodeURIComponent(region || ytRegion())}`));
}

export async function ytSearch(q: string): Promise<YtVideo[]> {
  return mapItems(await piped<unknown>(`/search?q=${encodeURIComponent(q)}&filter=videos`));
}

export async function ytSearchAll(q: string): Promise<(YtVideo | { channel: YtChannelInfo })[]> {
  const raw = await piped<{ items?: Record<string, unknown>[] }>(`/search?q=${encodeURIComponent(q)}`);
  const out: (YtVideo | { channel: YtChannelInfo })[] = [];
  for (const it of raw.items ?? []) {
    const v = mapItem(it);
    if (v) { out.push(v); continue; }
    if (String(it.type) === "channel") {
      out.push({
        channel: {
          id: String(it.url ?? "").replace("/channel/", ""),
          name: String(it.name ?? ""),
          avatar: String(it.thumbnail ?? ""),
          description: String(it.description ?? ""),
          subscribers: Number(it.subscribers ?? 0),
          verified: Boolean(it.verified),
        },
      });
    }
  }
  return out;
}

/* ---------------- watch ---------------- */

export async function ytWatch(id: string): Promise<YtWatch> {
  const data = await piped<Record<string, unknown>>(`/streams/${encodeURIComponent(id)}`);
  if (!data || typeof data.title !== "string") throw new Error("respuesta sin datos");

  const rawStreams = (data.videoStreams ?? []) as Record<string, unknown>[];
  const muxed: YtStream[] = rawStreams
    .filter((s) => !s.videoOnly && String(s.url ?? "").startsWith("http"))
    .map((s) => ({
      url: String(s.url),
      quality: String(s.quality ?? "?"),
      mime: String(s.mimeType ?? "video/mp4"),
      muxed: true,
    }))
    .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

  return {
    id,
    title: String(data.title ?? ""),
    author: String(data.uploader ?? ""),
    authorId: String(data.uploaderUrl ?? "").replace("/channel/", ""),
    authorAvatar: String(data.uploaderAvatar ?? ""),
    subscribers: typeof data.uploaderSubscriberCount === "number" ? data.uploaderSubscriberCount : undefined,
    description: String(data.description ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
    duration: Number(data.duration ?? 0),
    views: Number(data.views ?? 0),
    likes: typeof data.likes === "number" ? data.likes : undefined,
    uploaded: String(data.uploadDate ?? ""),
    thumb: String(data.thumbnail ?? "") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    live: Boolean(data.livestream),
    streams: muxed,
    hls: typeof data.hls === "string" ? data.hls : undefined,
    related: mapItems(data.relatedStreams ?? []),
    embedFallback: muxed.length === 0,
    embedReason: muxed.length === 0 ? "Las instancias libres están bloqueadas por Google ahora mismo" : undefined,
  };
}

/** Metadatos de respaldo vía oEmbed público (CORS *), cuando /streams está bloqueado. */
export async function ytMetaFallback(id: string): Promise<{ title: string; author: string; thumb: string }> {
  const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, {
    signal: AbortSignal.timeout(9000),
  });
  const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  if (!j.title) throw new Error("sin metadatos");
  return { title: j.title, author: j.author_name ?? "", thumb: j.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
}

/* ---------------- comentarios ---------------- */

export async function ytComments(id: string, nextpage?: string): Promise<{ comments: YtComment[]; next?: string }> {
  const q = nextpage ? `?nextpage=${encodeURIComponent(nextpage)}` : "";
  const data = await piped<{ comments?: Record<string, unknown>[]; nextpage?: string }>(`/comments/${encodeURIComponent(id)}${q}`);
  return {
    comments: (data.comments ?? []).map((c) => ({
      id: String(c.id ?? ""),
      author: String(c.author ?? ""),
      authorAvatar: String(c.thumbnail ?? ""),
      authorId: String(c.commentorId ?? c.authorId ?? ""),
      content: String(c.commentText ?? c.content ?? "").replace(/<[^>]+>/g, ""),
      time: String(c.commentedTime ?? c.timeText ?? ""),
      likes: Number(c.likeCount ?? 0),
      pinned: Boolean(c.pinned),
      replies: typeof c.replyCount === "number" ? c.replyCount : undefined,
    })),
    next: data.nextpage,
  };
}

/* ---------------- canales ---------------- */

export async function ytChannel(id: string): Promise<{ info: YtChannelInfo; videos: YtVideo[] }> {
  const data = await piped<Record<string, unknown>>(`/channel/${encodeURIComponent(id)}`);
  const info: YtChannelInfo = {
    id,
    name: String(data.name ?? ""),
    avatar: String(data.avatarUrl ?? ""),
    banner: typeof data.bannerUrl === "string" ? data.bannerUrl : undefined,
    description: String(data.description ?? ""),
    subscribers: Number(data.subscriberCount ?? 0),
    verified: Boolean(data.verified),
  };
  return { info, videos: mapItems(data.relatedStreams ?? []) };
}

/* ---------------- historial local ---------------- */

const HIST_KEY = "axcsos-yt-history";
export interface HistEntry { id: string; title: string; author: string; thumb: string; at: number; duration: number }

export function ytHistory(): HistEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || "[]") as HistEntry[];
  } catch {
    return [];
  }
}

export function ytHistoryPush(v: { id: string; title: string; author: string; thumb: string; duration: number }) {
  try {
    const h = ytHistory().filter((e) => e.id !== v.id);
    h.unshift({ ...v, at: Date.now() });
    localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 120)));
  } catch { /* cuota */ }
}

export function ytHistoryClear() {
  try { localStorage.removeItem(HIST_KEY); } catch { /* ignore */ }
}

/* ---------------- caché de feeds (navegación ágil) ---------------- */

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 5 * 60 * 1000;

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

export const ytHomeCached = (region?: string) => cached(`home:${region || ytRegion()}`, () => ytHome(region));
export const ytSearchCached = (q: string) => cached(`search:${q}`, () => ytSearch(q));
export const ytChannelCached = (id: string) => cached(`chan:${id}`, () => ytChannel(id));
