"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Image as ImageIcon,
  LogOut,
  Mic,
  MicOff,
  MessageSquarePlus,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Plus,
  Search,
  Send,
  Smile,
  Sticker,
  Trash2,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import {
  createAccount,
  defaultAvatar,
  fileToDataUrl,
  getAccount,
  onAccount,
  updateProfile,
  type AosIdProfile,
} from "../services/account";
import {
  blobToDataUrl,
  fmtClock,
  fmtDay,
  getChat,
  shrinkImage,
  type ChatMessage,
  type ConnState,
  type GroupInfo,
  type Media,
  type PresenceUser,
} from "../services/chat";

/* ============================================================
   Mensajes axcsOS — chat real estilo WhatsApp
   Cuenta axcsOS ID + red MQTT pública con cifrado E2E +
   llamadas y videollamadas WebRTC. Todo dentro del OS.
   ============================================================ */

/* ---------- packs de stickers y emojis (nativos, sin assets) ---------- */
const EMOJI_CATS: { name: string; icon: string; emojis: string[] }[] = [
  { name: "Caras", icon: "😀", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😢","😭","😤","😠","😡","🤬","💀","☠️","👻","👽","🤖"] },
  { name: "Gestos", icon: "👍", emojis: ["👍","👎","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👏","🙌","🫶","👐","🤲","🤝","🙏","💪","🦾","✍️","💅","🤳","👀","🧠","🫀","👋","🤚","🖐️","✋","🖖","👊","🤛","🤜","✊"] },
  { name: "Animales", icon: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🦄","🐝","🦋","🐢","🐍","🦖","🐙","🦑","🦐","🐡","🐬","🐳","🐋","🦈","🐊","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐔","🐧","🐦","🐤","🦆","🦢","🦉","🦩","🦚","🦜"] },
  { name: "Comida", icon: "🍕", emojis: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🥦","🥬","🥒","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🧇","🥞","🧈","🍳","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🥙","🍜","🍝","🍣","🍱","🍛","🍤","🍙","🍚","🍥","🥟","🍦","🍰","🎂","🧁","🥧","🍫","🍬","🍭","🍯"] },
  { name: "Objetos", icon: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🥊","🎮","🕹️","🎲","🎯","🎳","🎸","🎹","🎺","🎻","🥁","🎤","🎧","🎵","🎶","📱","💻","⌨️","🖥️","🖨️","🖱️","💾","💿","📷","🎥","🔋","💡","🔦","🕯️","🧨","🎈","🎉","🎊","🎁","🏅","🥇","🏆","⭐","🌟","✨","💥","🔥","🌈","☀️","🌙","☁️","⚡","❄️","💧","🌊"] },
  { name: "Símbolos", icon: "❤️", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","♻️","✅","❌","❓","❗","💯","🔞","📢","👍","🍐"] },
];

const STICKER_PACKS: { name: string; stickers: string[] }[] = [
  { name: "Emociones", stickers: ["😂","🥰","😎","🤩","😭","😡","🤯","🥳","😴","🤔","😱","🙈","😤","🤗","🙃","😈"] },
  { name: "Pear", stickers: ["🍐","🍏","🍎","🍋","🍉","🍓","🥝","🍑","🍒","🥑","🍍","🥥"] },
  { name: "Animales", stickers: ["🐶","🐱","🦊","🐻","🐼","🐨","🦁","🐮","🐷","🐸","🐵","🦄","🐧","🦉","🦋","🐢"] },
  { name: "Corazones", stickers: ["❤️","🧡","💛","💚","💙","💜","🖤","💕","💖","💘","💝","💟"] },
  { name: "Fiesta", stickers: ["🎉","🎊","🎈","🎁","🏆","🥇","🎯","🎮","🔥","⭐","🌈","💯"] },
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/* ---------- utilidades de render ---------- */

function Avatar({ user, size = 40, ring = false }: { user: { name: string; avatar?: string | null; id: string }; size?: number; ring?: boolean }) {
  const src = user.avatar || defaultAvatar({ id: user.id, name: user.name });
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-white/60" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}

function Checkmarks({ msg }: { msg: ChatMessage }) {
  if (!msg.mine) return null;
  return msg.read ? <CheckCheck size={13} className="text-sky-500" /> : <Check size={13} className="text-neutral-400" />;
}

/* ============================================================
   Onboarding — crear la cuenta axcsOS ID
   ============================================================ */

function Onboarding({ onDone }: { onDone: (p: AosIdProfile) => void }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const p = await createAccount(name.trim(), avatar, bio.trim() || "Usando axcsOS");
      onDone(p);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-neutral-100 px-6 dark:from-neutral-900 dark:to-neutral-950">
      <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white/90 p-7 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25d366] to-[#128c7e] text-white shadow-lg">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a10 10 0 0 1-5.9-5.2c-.3-.6-.5-1.3-.5-1.9 0-.6.3-1.1.6-1.4.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.4l.8 1.9c.1.2 0 .4-.1.6l-.3.4c-.2.2-.3.3-.1.6.4.7 1 1.4 1.7 1.8.5.4 1 .6 1.3.8.2.1.4 0 .6-.2l.6-.7c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.4.4 0 .2 0 .8-.2 1.3Z"/></svg>
          </div>
          <h2 className="text-[16px] font-bold text-neutral-800 dark:text-neutral-100">Crea tu axcsOS ID</h2>
          <p className="max-w-[260px] text-[11px] leading-relaxed text-neutral-500">
            Tu cuenta del sistema para Mensajes y llamadas. Se genera en este dispositivo con claves propias de cifrado;
            no hay nada que configurar.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-black/15 p-2.5 transition hover:border-[#25d366] dark:border-white/15">
            {avatar ? (
              <img src={avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/5 text-neutral-400 dark:bg-white/10">
                <Plus size={16} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-200">Foto de perfil (opcional)</p>
              <p className="text-[10px] text-neutral-400">JPG o PNG, se reescala sola</p>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setAvatar(await fileToDataUrl(f, 256, 0.85));
              }}
            />
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            autoFocus
            className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-[#25d366]/50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <input
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Info (p. ej. Disponible)"
            className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-[#25d366]/50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="w-full rounded-xl bg-[#25d366] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#20bd5a] disabled:opacity-40"
          >
            {busy ? "Generando claves…" : "Crear mi cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   App principal
   ============================================================ */

interface ChatEntry {
  key: string; // "dm:<id>" | "g:<gid>"
  title: string;
  user?: PresenceUser;
  group?: GroupInfo;
  last?: ChatMessage;
  unread: number;
}

export default function MessagesApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const openApp = useOS((s) => s.openApp);
  const updateSettings = useOS((s) => s.updateSettings);

  const [account, setAccount] = useState<AosIdProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "newchat" | "profile">(null);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const chat = useMemo(() => (typeof window !== "undefined" ? getChat() : null), []);

  /* cuenta + servicio */
  useEffect(() => {
    const acc = getAccount();
    setAccount(acc);
    setReady(true);
    if (acc && chat) chat.start(acc);
    const off = onAccount((p) => {
      setAccount(p);
      if (p && chat) {
        chat.reloadProfile(p);
        updateSettings({ userName: p.name, ...(p.avatar ? { avatar: p.avatar } : {}) });
      }
    });
    return () => {
      off();
      // NO paramos el servicio al cerrar la ventana: sigue recibiendo (notificaciones)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* eventos del servicio de chat → re-render + notificaciones */
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeChat;
  useEffect(() => {
    if (!chat) return;
    chat.onEvent = (e) => {
      setTick((t) => t + 1);
      if (e.type === "message" && !e.msg.mine && !e.msg.sys) {
        const isActive = e.msg.chatId === activeRef.current && document.hasFocus();
        if (isActive) {
          chat.markRead(e.msg.chatId);
        } else {
          const who = e.msg.fromName || e.msg.from;
          const preview = e.msg.text || (e.msg.media?.kind === "voice" ? "🎙️ Nota de voz" : e.msg.media?.kind === "image" ? "📷 Foto" : e.msg.sticker ? "Sticker" : "Mensaje");
          notify("messages", who, preview);
        }
      }
      if (e.type === "call") {
        if (e.session.state === "ringing-in") {
          notify("messages", `Llamada entrante de ${e.session.peer.name}`, e.session.kind === "video" ? "Videollamada" : "Llamada de voz");
        } else if (e.reason && e.session.state !== "active") {
          const why: Record<string, string> = {
            declined: "Llamada rechazada",
            busy: "Ocupado",
            ended: "Llamada finalizada",
            failed: "La llamada no se pudo conectar (red muy restrictiva)",
          };
          if (why[e.reason]) notify("messages", why[e.reason]!, e.session.peer.name);
        }
      }
    };
    return () => {
      chat.onEvent = null;
    };
  }, [chat, notify]);

  const connState: ConnState = chat?.state ?? "offline";
  const connLabel: Record<ConnState, string> = {
    offline: "Sin conexión — reintentando…",
    connecting: "Conectando con la red de mensajería…",
    online: "",
    error: "Error de red",
  };

  /* lista de chats */
  const entries: ChatEntry[] = useMemo(() => {
    if (!chat || !account) return [];
    const list: ChatEntry[] = [];
    const read = chat.readMarks;
    for (const c of chat.contacts) {
      const key = `dm:${c.id}`;
      const msgs = chat.messages[key] ?? [];
      const last = msgs[msgs.length - 1];
      const r = read[key];
      const unread = msgs.filter((m) => !m.mine && !m.sys && m.ts > (r?.ts ?? 0)).length;
      list.push({ key, title: c.name, user: c, last, unread });
    }
    // personas con mensajes que no están en contactos (me escribieron)
    for (const keyRaw of Object.keys(chat.messages)) {
      if (!keyRaw.startsWith("dm:")) continue;
      const id = keyRaw.slice(3);
      if (list.some((l) => l.key === keyRaw)) continue;
      const msgs = chat.messages[keyRaw] ?? [];
      const last = msgs[msgs.length - 1];
      if (!last) continue;
      const u = chat.directory.get(id) ?? { id, name: last.fromName || `@${id}`, lastSeen: 0, online: false };
      const r = read[keyRaw];
      const unread = msgs.filter((m) => !m.mine && !m.sys && m.ts > (r?.ts ?? 0)).length;
      list.push({ key: keyRaw, title: u.name, user: { ...u, name: u.name }, last, unread });
    }
    for (const g of chat.groups) {
      const msgs = chat.messages[`g:${g.id}`] ?? [];
      const last = msgs[msgs.length - 1];
      const r = read[`g:${g.id}`];
      const unread = msgs.filter((m) => !m.mine && !m.sys && m.ts > (r?.ts ?? 0)).length;
      list.push({ key: `g:${g.id}`, title: g.name, group: g, last, unread });
    }
    list.sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0));
    const q = search.trim().toLowerCase();
    return q ? list.filter((l) => l.title.toLowerCase().includes(q)) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, account, search, tick]);

  /* abrir conversación marca como leído */
  useEffect(() => {
    if (activeChat && chat) chat.markRead(activeChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat]);

  const openDm = useCallback((user: PresenceUser) => {
    if (!chat) return;
    chat.addContact(user);
    setActiveChat(`dm:${user.id}`);
    setPanel(null);
  }, [chat]);

  if (!ready) {
    return <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-950" />;
  }

  if (!account) {
    return <Onboarding onDone={(p) => { setAccount(p); chat?.start(p); updateSettings({ userName: p.name }); }} />;
  }

  const activeEntry = entries.find((e) => e.key === activeChat) ?? null;
  const activePeer = activeEntry?.user ?? null;
  const activeGroup = activeEntry?.group ?? null;

  /* ---------- vista móvil/estrecha ---------- */
  const showList = !activeChat || panel;
  const showConv = !!activeChat;

  return (
    <div className="flex h-full bg-[#efeae2] dark:bg-neutral-950">
      {/* lista de chats */}
      {(showList || true) && (
        <div className={`${activeChat && !panel ? "hidden md:flex" : "flex"} h-full w-full flex-col border-r border-black/8 bg-white md:w-[330px] md:shrink-0 dark:border-white/8 dark:bg-neutral-900`}>
          {/* cabecera con mi perfil */}
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-black/5 bg-[#f0f2f5] px-3.5 dark:border-white/5 dark:bg-neutral-800">
            <button onClick={() => setPanel("profile")} title="Mi perfil" className="transition hover:opacity-80">
              <Avatar user={account} size={36} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{account.name}</p>
              <p className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">@{account.id} · cifrado de extremo a extremo</p>
            </div>
            <button onClick={() => setPanel("newchat")} title="Nuevo chat" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25d366] text-white shadow transition hover:bg-[#20bd5a]">
              <MessageSquarePlus size={15} />
            </button>
          </div>

          {connState !== "online" && (
            <div className="flex items-center gap-2 bg-amber-50 px-3.5 py-1.5 text-[10.5px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              {connLabel[connState]}
            </div>
          )}

          <div className="px-3 py-2">
            <div className="flex h-8 items-center gap-2 rounded-lg bg-black/5 px-3 dark:bg-white/10">
              <Search size={13} className="shrink-0 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar o empezar un chat nuevo"
                className="h-full w-full bg-transparent text-[12px] outline-none placeholder:text-neutral-400 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto">
            {entries.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="text-[12px] font-medium text-neutral-500">Aún no tienes chats</p>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">Pulsa el botón verde para añadir contactos por su @id, o comparte el tuyo: <b>@{account.id}</b></p>
              </div>
            )}
            {entries.map((en) => (
              <button
                key={en.key}
                onClick={() => { setActiveChat(en.key); setPanel(null); }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/5 ${activeChat === en.key ? "bg-[#f0f2f5] dark:bg-white/10" : ""}`}
              >
                {en.group ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neutral-400 to-neutral-600 text-[15px] font-bold text-white">
                    <Users size={16} />
                  </div>
                ) : (
                  <Avatar user={en.user ?? { id: en.key.slice(3), name: en.title, avatar: null }} size={40} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{en.title}</p>
                    {en.last && <span className="shrink-0 text-[10px] text-neutral-400">{fmtClock(en.last.ts)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11.5px] text-neutral-500 dark:text-neutral-400">
                      {en.last?.sys ? en.last.text :
                        en.last ? (
                          <>
                            {en.last.mine && <span className="text-neutral-400">Tú: </span>}
                            {en.last.sticker ? `${en.last.sticker} sticker` :
                              en.last.media?.kind === "voice" ? "🎙️ Nota de voz" :
                              en.last.media?.kind === "image" ? "📷 Foto" :
                              en.last.text}
                          </>
                        ) : en.group ? `${en.group.members.length} miembros` : "Sin mensajes"}
                    </p>
                    {en.unread > 0 && (
                      <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-white">
                        {en.unread > 99 ? "99+" : en.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="shrink-0 border-t border-black/5 px-3.5 py-1.5 text-[9.5px] leading-relaxed text-neutral-400 dark:border-white/5">
            Red P2P cifrada · brokers MQTT públicos · llamadas WebRTC
          </div>
        </div>
      )}

      {/* conversación / paneles */}
      {showConv && !panel && activePeer && (
        <Conversation
          key={activeChat}
          chatId={activeChat!}
          peer={activePeer}
          onBack={() => setActiveChat(null)}
          onOpenImage={(src) => openApp("preview", { payload: { image: src } })}
        />
      )}
      {showConv && !panel && activeGroup && (
        <GroupConversation
          key={activeChat}
          chatId={activeChat!}
          group={activeGroup}
          onBack={() => setActiveChat(null)}
          onOpenImage={(src) => openApp("preview", { payload: { image: src } })}
        />
      )}
      {!showConv && !panel && (
        <div className="hidden h-full flex-1 flex-col items-center justify-center gap-3 bg-[#efeae2] px-10 text-center md:flex dark:bg-[#0b141a]">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dfe5e4] dark:bg-white/5">
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-neutral-400" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a10 10 0 0 1-5.9-5.2c-.3-.6-.5-1.3-.5-1.9 0-.6.3-1.1.6-1.4.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.4l.8 1.9c.1.2 0 .4-.1.6l-.3.4c-.2.2-.3.3-.1.6.4.7 1 1.4 1.7 1.8.5.4 1 .6 1.3.8.2.1.4 0 .6-.2l.6-.7c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.4.4 0 .2 0 .8-.2 1.3Z"/></svg>
          </div>
          <p className="text-[14px] font-light text-neutral-600 dark:text-neutral-300">Mensajes axcsOS</p>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-neutral-400">
            Elige un chat o comparte tu ID <b className="text-neutral-500 dark:text-neutral-300">@{account.id}</b> para que te escriban.
            Tus mensajes se cifran de extremo a extremo y las llamadas viajan P2P.
          </p>
        </div>
      )}

      {/* panel nuevo chat / perfil */}
      {panel === "newchat" && (
        <NewChatPanel
          onClose={() => setPanel(null)}
          onOpenDm={openDm}
          onCreateGroup={async (name, members) => {
            const g = await chat?.createGroup(name, members);
            setPanel(null);
            if (g) setActiveChat(`g:${g.id}`);
          }}
        />
      )}
      {panel === "profile" && (
        <ProfilePanel
          account={account}
          onClose={() => setPanel(null)}
          onSignOut={() => { chat?.stop(); import("../services/account").then((m) => m.signOut()); setAccount(null); setPanel(null); setActiveChat(null); }}
        />
      )}

      {/* llamadas */}
      <CallLayer onOpenImage={(src) => openApp("preview", { payload: { image: src } })} />
    </div>
  );
}

/* ============================================================
   Burbuja de mensaje
   ============================================================ */

function VoiceBubble({ media, mine }: { media: Media; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pos, setPos] = useState(0);
  const dur = media.dur ?? 0;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setProgress(a.duration ? a.currentTime / a.duration : 0);
      setPos(a.currentTime);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setPos(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  };

  const bars = 22;
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mine ? "bg-[#25d366]/20 text-emerald-800" : "bg-black/5 text-neutral-600 dark:bg-white/10 dark:text-neutral-200"}`}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <div className="flex h-8 items-center gap-[2.5px]">
        {Array.from({ length: bars }).map((_, i) => {
          const active = i / bars <= progress;
          const h = 5 + ((i * 7919) % 17);
          return <div key={i} className={`w-[3px] rounded-full ${active ? (mine ? "bg-emerald-800" : "bg-[#25d366]") : mine ? "bg-emerald-800/25" : "bg-neutral-400/50"}`} style={{ height: h }} />;
        })}
      </div>
      <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400">
        {`0:${String(Math.max(0, Math.round(playing ? pos : dur))).padStart(2, "0")}`}
      </span>
      <audio ref={audioRef} src={media.data} preload="metadata" />
    </div>
  );
}

function MessageBubble({ msg, showName, onOpenImage }: { msg: ChatMessage; showName?: boolean; onOpenImage: (src: string) => void }) {
  if (msg.sys) {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-lg bg-white/80 px-3 py-1 text-[10.5px] font-medium text-neutral-500 shadow-sm dark:bg-white/10 dark:text-neutral-400">{msg.text}</span>
      </div>
    );
  }
  return (
    <div className={`flex ${msg.mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed shadow-sm ${
          msg.mine
            ? "rounded-tr-none bg-[#d9fdd3] text-neutral-800 dark:bg-[#005c4b] dark:text-neutral-50"
            : "rounded-tl-none bg-white text-neutral-800 dark:bg-[#202c33] dark:text-neutral-50"
        } ${msg.sticker ? "bg-transparent! p-0! shadow-none!" : ""}`}
      >
        {showName && !msg.mine && (
          <p className="mb-0.5 text-[10.5px] font-semibold text-[#25d366]">{msg.fromName || `@${msg.from}`}</p>
        )}
        {msg.sticker && (
          <div className="pop-in flex flex-col items-center gap-1 px-1 py-0.5">
            <span className="text-[56px] leading-none drop-shadow-sm">{msg.sticker}</span>
          </div>
        )}
        {msg.media?.kind === "image" && (
          <button onClick={() => onOpenImage(msg.media!.data)} className="mb-1 block overflow-hidden rounded-lg">
            <img src={msg.media.data} alt="" className="max-h-72 max-w-[320px] rounded-lg object-cover" />
          </button>
        )}
        {msg.media?.kind === "voice" && <VoiceBubble media={msg.media} mine={msg.mine} />}
        {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
        <span className={`mt-0.5 flex items-center justify-end gap-1 text-[9.5px] ${msg.mine ? "text-emerald-700/70 dark:text-emerald-200/70" : "text-neutral-400"}`}>
          {fmtClock(msg.ts)}
          <Checkmarks msg={msg} />
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   Conversación (DM y grupo comparten maqueta)
   ============================================================ */

interface ConvHeaderUser {
  title: string;
  avatar?: string | null;
  id: string;
  online: boolean;
  subtitle: string;
  isGroup: boolean;
}

function ConversationShell({
  header,
  chatId,
  peerId,
  groupId,
  onBack,
  onOpenImage,
  renderExtra,
}: {
  header: ConvHeaderUser;
  chatId: string;
  peerId?: string;
  groupId?: string;
  onBack: () => void;
  onOpenImage: (src: string) => void;
  renderExtra?: (send: (payload: { text?: string; media?: Media; sticker?: string }) => void) => React.ReactNode;
}) {
  const chat = useMemo(() => (typeof window !== "undefined" ? getChat() : null), []);
  const [, setTick] = useState(0);
  const [typingNow, setTypingNow] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingUntil = useRef(0);
  const msgCount = chat ? (chat.messages[chatId]?.length ?? 0) : 0;

  useEffect(() => {
    const prev = chat?.onEvent;
    if (chat) chat.onEvent = (e) => {
      prev?.(e);
      setTick((t) => t + 1);
      if (e.type === "typing" && `dm:${e.from}` === chatId) {
        typingUntil.current = Date.now() + 3400;
        setTypingNow(true);
      }
    };
    return () => { if (chat) chat.onEvent = prev ?? null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() > typingUntil.current) setTypingNow((v) => (v ? false : v));
    }, 900);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: msgCount > 30 ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgCount]);

  const msgs = chat?.messages[chatId] ?? [];
  const subtitle = typingNow ? "escribiendo…" : header.subtitle;

  const send = useCallback(
    (payload: { text?: string; media?: Media; sticker?: string }) => {
      if (!chat) return;
      if (peerId) {
        const peer = chat.contacts.find((c) => c.id === peerId) ?? chat.directory.get(peerId) ?? { id: peerId, name: `@${peerId}`, lastSeen: 0, online: false };
        void chat.sendDm(peer, payload);
      } else if (groupId) {
        void chat.sendGroup(groupId, payload);
      }
    },
    [chat, peerId, groupId]
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[#efeae2] dark:bg-[#0b141a]">
      {/* cabecera */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-black/5 bg-[#f0f2f5] px-3 dark:border-white/5 dark:bg-[#202c33]">
        <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 md:hidden dark:hover:bg-white/10">
          <ArrowLeft size={16} />
        </button>
        {header.isGroup ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neutral-400 to-neutral-600 text-white">
            <Users size={17} />
          </div>
        ) : (
          <div className="relative">
            <Avatar user={{ id: header.id, name: header.title, avatar: header.avatar }} size={40} />
            {header.online && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#f0f2f5] bg-[#25d366] dark:border-[#202c33]" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{header.title}</p>
          <p className={`truncate text-[10.5px] ${typingNow ? "text-[#25d366]" : "text-neutral-500 dark:text-neutral-400"}`}>{subtitle}</p>
        </div>
        {peerId && (
          <>
            <button
              onClick={() => chat && void chat.startCall(chat.contacts.find((c) => c.id === peerId) ?? chat.directory.get(peerId) ?? { id: peerId, name: header.title, lastSeen: 0, online: false }, "audio")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
              title="Llamada de voz"
            >
              <Phone size={15} />
            </button>
            <button
              onClick={() => chat && void chat.startCall(chat.contacts.find((c) => c.id === peerId) ?? chat.directory.get(peerId) ?? { id: peerId, name: header.title, lastSeen: 0, online: false }, "video")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
              title="Videollamada"
            >
              <Video size={15} />
            </button>
          </>
        )}
      </div>

      {/* mensajes */}
      <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.028) 1px, transparent 1px)", backgroundSize: "22px 22px" }}>
        {msgs.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <span className="rounded-lg bg-white/80 px-4 py-2 text-center text-[11px] leading-relaxed text-neutral-500 shadow-sm dark:bg-white/10 dark:text-neutral-400">
              Los mensajes se cifran de extremo a extremo.
              <br />Nadie fuera de esta conversación puede leerlos.
            </span>
          </div>
        )}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
          const showName = !!(header.isGroup && !m.mine && (!prev || prev.from !== m.from));
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-lg bg-white/85 px-3 py-1 text-[9.5px] font-semibold tracking-wide text-neutral-500 shadow-sm dark:bg-white/10 dark:text-neutral-400">{fmtDay(m.ts)}</span>
                </div>
              )}
              <MessageBubble msg={m} showName={showName} onOpenImage={onOpenImage} />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {renderExtra?.(send)}
      <Composer chatId={chatId} peerId={peerId} onSend={send} />
    </div>
  );
}

function Conversation({ chatId, peer, onBack, onOpenImage }: { chatId: string; peer: PresenceUser; onBack: () => void; onOpenImage: (src: string) => void }) {
  const chat = useMemo(() => (typeof window !== "undefined" ? getChat() : null), []);
  const [, setTick] = useState(0);
  useEffect(() => {
    const prev = chat?.onEvent;
    if (chat) chat.onEvent = (e) => { prev?.(e); setTick((t) => t + 1); };
    return () => { if (chat) chat.onEvent = prev ?? null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const live = chat?.directory.get(peer.id) ?? peer;
  return (
    <ConversationShell
      chatId={chatId}
      peerId={peer.id}
      onBack={onBack}
      onOpenImage={onOpenImage}
      header={{
        title: live.name,
        avatar: live.avatar,
        id: live.id,
        online: live.online,
        isGroup: false,
        subtitle: live.online ? "en línea" : "desconectado",
      }}
    />
  );
}

function GroupConversation({ chatId, group, onBack, onOpenImage }: { chatId: string; group: GroupInfo; onBack: () => void; onOpenImage: (src: string) => void }) {
  return (
    <ConversationShell
      chatId={chatId}
      groupId={group.id}
      onBack={onBack}
      onOpenImage={onOpenImage}
      header={{
        title: group.name,
        id: group.id,
        online: false,
        isGroup: true,
        subtitle: group.members.map((m) => m.name).join(", "),
      }}
    />
  );
}

/* ============================================================
   Composer: emoji, stickers, imágenes, voz, texto
   ============================================================ */

function Composer({ chatId, peerId, onSend }: { chatId: string; peerId?: string; onSend: (p: { text?: string; media?: Media; sticker?: string }) => void }) {
  const chat = useMemo(() => (typeof window !== "undefined" ? getChat() : null), []);
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<null | "emoji" | "sticker">(null);
  const [emojiCat, setEmojiCat] = useState(0);
  const [stickerPack, setStickerPack] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const notifyTyping = () => {
    if (chat && peerId) chat.typing(peerId, chatId, true);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimer.current) clearInterval(recTimer.current);
        setRecording(false);
        const secs = recSecs;
        if (cancelledRef.current || chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size > 240_000) return; // no debería pasar con opus 24k
        const data = await blobToDataUrl(blob);
        onSend({ media: { kind: "voice", mime: blob.type, data, dur: secs } });
      };
      recorderRef.current = rec;
      rec.start(500);
      setRecording(true);
      setRecSecs(0);
      recTimer.current = setInterval(() => {
        setRecSecs((s) => {
          if (s >= 59) {
            recorderRef.current?.stop();
            return 59;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      chat?.onEvent?.({ type: "error", error: "Micrófono no disponible" });
    }
  };

  const stopRec = () => { recorderRef.current?.stop(); };
  const cancelRec = () => { cancelledRef.current = true; recorderRef.current?.stop(); };

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    onSend({ text: t });
    setText("");
  };

  return (
    <div className="relative shrink-0 border-t border-black/5 bg-[#f0f2f5] px-3 py-2.5 dark:border-white/5 dark:bg-[#202c33]">
      {/* selector de emoji / stickers */}
      {picker && (
        <div className="absolute bottom-[calc(100%+6px)] left-3 z-10 w-[320px] rounded-2xl border border-black/8 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-neutral-800">
          {picker === "emoji" ? (
            <>
              <div className="mb-1.5 flex gap-0.5 border-b border-black/5 pb-1.5 dark:border-white/10">
                {EMOJI_CATS.map((c, i) => (
                  <button key={c.name} onClick={() => setEmojiCat(i)} className={`flex h-7 w-8 items-center justify-center rounded-lg text-[15px] transition ${i === emojiCat ? "bg-black/8 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`} title={c.name}>
                    {c.icon}
                  </button>
                ))}
                <button onClick={() => setPicker(null)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"><X size={13} /></button>
              </div>
              <div className="mac-scrollbar grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
                {EMOJI_CATS[emojiCat].emojis.map((em) => (
                  <button key={em} onClick={() => setText((t) => t + em)} className="flex h-9 items-center justify-center rounded-lg text-[19px] transition hover:bg-black/5 dark:hover:bg-white/10">
                    {em}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 flex gap-1 border-b border-black/5 pb-1.5 dark:border-white/10">
                {STICKER_PACKS.map((p, i) => (
                  <button key={p.name} onClick={() => setStickerPack(i)} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${i === stickerPack ? "bg-[#25d366] text-white" : "text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"}`}>
                    {p.name}
                  </button>
                ))}
                <button onClick={() => setPicker(null)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"><X size={13} /></button>
              </div>
              <div className="mac-scrollbar grid max-h-52 grid-cols-4 gap-1 overflow-y-auto">
                {STICKER_PACKS[stickerPack].stickers.map((s) => (
                  <button key={s} onClick={() => { onSend({ sticker: s }); setPicker(null); }} className="pop-in flex h-20 items-center justify-center rounded-xl text-[44px] transition hover:scale-110 hover:bg-black/5 dark:hover:bg-white/10">
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        {recording ? (
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-3.5 shadow-inner dark:bg-neutral-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-[12px] font-medium tabular-nums text-neutral-600 dark:text-neutral-200">0:{String(recSecs).padStart(2, "0")}</span>
            <span className="text-[10.5px] text-neutral-400">grabando nota de voz…</span>
            <button onClick={cancelRec} className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" title="Cancelar">
              <Trash2 size={14} />
            </button>
            <button onClick={stopRec} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25d366] text-white shadow transition hover:bg-[#20bd5a]" title="Enviar">
              <Send size={12} />
            </button>
          </div>
        ) : (
          <>
            <button onClick={() => setPicker(picker === "emoji" ? null : "emoji")} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${picker === "emoji" ? "text-[#25d366]" : "text-neutral-400"}`} title="Emoticonos">
              <Smile size={18} />
            </button>
            <button onClick={() => setPicker(picker === "sticker" ? null : "sticker")} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10 ${picker === "sticker" ? "text-[#25d366]" : "text-neutral-400"}`} title="Stickers">
              <Sticker size={18} />
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition hover:bg-black/5 dark:hover:bg-white/10" title="Enviar imagen">
              <ImageIcon size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const raw = await fileToDataUrl(f, 1600, 0.85);
                const shrunk = await shrinkImage(raw);
                onSend({ media: { kind: "image", mime: "image/jpeg", data: shrunk, name: f.name } });
              }}
            />
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-full bg-white px-4 shadow-inner dark:bg-neutral-700">
              <input
                value={text}
                onChange={(e) => { setText(e.target.value); notifyTyping(); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                placeholder="Escribe un mensaje"
                className="h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-neutral-400 dark:text-neutral-100"
              />
            </div>
            {text.trim() ? (
              <button onClick={sendText} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white shadow transition hover:bg-[#20bd5a]" title="Enviar">
                <Send size={15} />
              </button>
            ) : (
              <button onClick={() => void startRec()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white shadow transition hover:bg-[#20bd5a]" title="Mantener pulsado para grabar (clic para empezar)">
                <Mic size={15} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Panel: nuevo chat / grupo
   ============================================================ */

function NewChatPanel({ onClose, onOpenDm, onCreateGroup }: { onClose: () => void; onOpenDm: (u: PresenceUser) => void; onCreateGroup: (name: string, members: PresenceUser[]) => Promise<void> }) {
  const chat = useMemo(() => (typeof window !== "undefined" ? getChat() : null), []);
  const [, setTick] = useState(0);
  const [tab, setTab] = useState<"contacts" | "group">("contacts");
  const [addId, setAddId] = useState("");
  const [addErr, setAddErr] = useState("");
  const [gName, setGName] = useState("");
  const [gSel, setGSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const prev = chat?.onEvent;
    if (chat) chat.onEvent = (e) => { prev?.(e); setTick((t) => t + 1); };
    return () => { if (chat) chat.onEvent = prev ?? null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const users = chat?.knownUsers().filter((u) => u.id !== chat.me?.id) ?? [];
  const contacts = chat?.contacts ?? [];

  const startDmById = (raw: string) => {
    const id = raw.trim().replace(/^@/, "").toLowerCase();
    if (!id || !chat) return;
    const known = users.find((u) => u.id.toLowerCase() === id);
    if (known) {
      onOpenDm(known);
      return;
    }
    if (!/^[0-9a-z]{6}$/.test(id)) {
      setAddErr("El ID tiene 6 caracteres (ej. k7m2qx)");
      return;
    }
    setAddErr("");
    onOpenDm({ id, name: `@${id}`, lastSeen: 0, online: false });
  };

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/25 backdrop-blur-[2px] md:left-[330px]">
      <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-neutral-900">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-black/5 px-4 dark:border-white/10">
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
          <p className="text-[14px] font-semibold text-neutral-800 dark:text-neutral-100">Nuevo chat</p>
        </div>
        <div className="flex gap-1 px-4 pt-3">
          <button onClick={() => setTab("contacts")} className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition ${tab === "contacts" ? "bg-[#25d366] text-white" : "bg-black/5 text-neutral-500 dark:bg-white/10 dark:text-neutral-300"}`}>Contactos</button>
          <button onClick={() => setTab("group")} className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold transition ${tab === "group" ? "bg-[#25d366] text-white" : "bg-black/5 text-neutral-500 dark:bg-white/10 dark:text-neutral-300"}`}>Nuevo grupo</button>
        </div>

        {tab === "contacts" ? (
          <>
            <div className="px-4 py-3">
              <div className="flex h-9 items-center gap-2 rounded-lg bg-black/5 px-3 dark:bg-white/10">
                <Search size={13} className="text-neutral-400" />
                <input
                  value={addId}
                  onChange={(e) => { setAddId(e.target.value); setAddErr(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") startDmById(addId); }}
                  placeholder="Añadir por @id (ej. @k7m2qx)"
                  spellCheck={false}
                  className="h-full w-full bg-transparent text-[12px] outline-none placeholder:text-neutral-400 dark:text-neutral-100"
                />
                <button onClick={() => startDmById(addId)} className="shrink-0 rounded-full bg-[#25d366] px-3 py-1 text-[10.5px] font-semibold text-white">Chat</button>
              </div>
              {addErr && <p className="mt-1.5 px-1 text-[10.5px] text-red-500">{addErr}</p>}
            </div>
            <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">En la red ahora ({users.filter((u) => u.online).length})</p>
              {users.filter((u) => u.online).map((u) => (
                <UserRow key={u.id} user={u} onClick={() => onOpenDm(u)} known={contacts.some((c) => c.id === u.id)} />
              ))}
              <p className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Vistos hace poco</p>
              {users.filter((u) => !u.online).slice(0, 30).map((u) => (
                <UserRow key={u.id} user={u} onClick={() => onOpenDm(u)} known={contacts.some((c) => c.id === u.id)} />
              ))}
              {users.length === 0 && (
                <p className="px-4 py-6 text-center text-[11px] leading-relaxed text-neutral-400">
                  Nadie más está conectado todavía. Comparte tu ID <b>@{chat?.me?.id}</b> o pide el de la otra persona y añádelo arriba.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
            <input
              value={gName}
              onChange={(e) => setGName(e.target.value)}
              placeholder="Nombre del grupo"
              className="mb-3 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-[#25d366]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto">
              {users.map((u) => {
                const sel = gSel.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      const next = new Set(gSel);
                      if (sel) next.delete(u.id); else next.add(u.id);
                      setGSel(next);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/5 ${sel ? "bg-[#25d366]/10" : ""}`}
                  >
                    <Avatar user={u} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-neutral-800 dark:text-neutral-100">{u.name}</p>
                      <p className="text-[10px] text-neutral-400">@{u.id} {u.online ? "· en línea" : ""}</p>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${sel ? "border-[#25d366] bg-[#25d366]" : "border-neutral-300 dark:border-neutral-600"}`}>
                      {sel && <Check size={12} className="text-white" strokeWidth={3.5} />}
                    </div>
                  </button>
                );
              })}
              {users.length === 0 && <p className="py-6 text-center text-[11px] text-neutral-400">Necesitas contactos en la red para crear un grupo.</p>}
            </div>
            <button
              disabled={!gName.trim() || gSel.size === 0 || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const members = users.filter((u) => gSel.has(u.id));
                  await onCreateGroup(gName.trim(), members);
                } finally { setBusy(false); }
              }}
              className="mt-3 w-full rounded-xl bg-[#25d366] py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#20bd5a] disabled:opacity-40"
            >
              {busy ? "Creando grupo…" : `Crear grupo (${gSel.size} miembro${gSel.size === 1 ? "" : "s"})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, onClick, known }: { user: PresenceUser; onClick: () => void; known: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/5">
      <div className="relative">
        <Avatar user={user} size={38} />
        {user.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#25d366] dark:border-neutral-900" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-neutral-800 dark:text-neutral-100">{user.name}</p>
        <p className="truncate text-[10px] text-neutral-400">@{user.id}{user.bio ? ` · ${user.bio}` : ""}</p>
      </div>
      {!known && <span className="shrink-0 rounded-full bg-[#25d366]/10 px-2 py-0.5 text-[9px] font-semibold text-[#128c7e]">nuevo</span>}
    </button>
  );
}

/* ============================================================
   Panel: mi perfil
   ============================================================ */

function ProfilePanel({ account, onClose, onSignOut }: { account: AosIdProfile; onClose: () => void; onSignOut: () => void }) {
  const [name, setName] = useState(account.name);
  const [bio, setBio] = useState(account.bio);
  const [status, setStatus] = useState(account.status);
  const [saved, setSaved] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(account.avatar);

  const save = () => {
    updateProfile({ name: name.trim() || account.name, bio: bio.trim(), status: status.trim() || "Disponible", ...(avatar !== account.avatar ? { avatar } : {}) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/25 backdrop-blur-[2px] md:left-[330px]">
      <div className="mac-scrollbar h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl dark:bg-neutral-900">
        <div className="mb-4 flex items-center gap-2">
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-black/5 dark:hover:bg-white/10"><X size={16} /></button>
          <p className="text-[14px] font-semibold text-neutral-800 dark:text-neutral-100">Mi perfil</p>
        </div>
        <div className="mb-5 flex flex-col items-center gap-2">
          <label className="relative cursor-pointer">
            {avatar ? <img src={avatar} alt="" className="h-24 w-24 rounded-full object-cover" /> : <Avatar user={account} size={96} />}
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#25d366] text-white shadow">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M9 2 7.2 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.2L15 2H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"/></svg>
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setAvatar(await fileToDataUrl(f, 256, 0.85)); }} />
          </label>
          <button
            onClick={() => navigator.clipboard?.writeText(`@${account.id}`)}
            className="rounded-full bg-black/5 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300"
            title="Copiar mi ID"
          >
            @{account.id} — copiar
          </button>
          <p className="text-center text-[10px] leading-relaxed text-neutral-400">
            Este es tu ID de axcsOS. Quien lo tenga puede escribirte, llamarte y añadirte a grupos.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Nombre</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-[#25d366]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Info</p>
            <input value={bio} onChange={(e) => setBio(e.target.value)} className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-[#25d366]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Estado</p>
            <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Disponible" className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-[#25d366]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100" />
          </div>
          <button onClick={save} className="w-full rounded-xl bg-[#25d366] py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#20bd5a]">
            {saved ? "Guardado ✓" : "Guardar cambios"}
          </button>
        </div>
        <div className="mt-6 rounded-xl bg-black/[0.03] p-3.5 dark:bg-white/5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Cómo funciona</p>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Tu cuenta vive en este dispositivo: un par de claves ECDH P-256 cifra cada mensaje de extremo a extremo.
            La mensajería usa brokers públicos MQTT y las llamadas viajan P2P con WebRTC. No hay servidor propio que
            configurar ni contraseñas que recordar.
          </p>
        </div>
        <button onClick={onSignOut} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2.5 text-[12px] font-semibold text-red-500 transition hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">
          <LogOut size={14} /> Borrar cuenta de este dispositivo
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Llamadas: modal entrante + overlay activo
   ============================================================ */

function CallLayer({ onOpenImage }: { onOpenImage: (src: string) => void }) {
  const chat = useMemo(() => (typeof window !== "undefined" ? getChat() : null), []);
  const [, setTick] = useState(0);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const prev = chat?.onEvent;
    if (chat) chat.onEvent = (e) => { prev?.(e); setTick((t) => t + 1); };
    return () => { if (chat) chat.onEvent = prev ?? null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const session = chat?.call ?? null;

  /* enchufar streams */
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = session?.remoteStream ?? null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = session?.remoteStream ?? null;
    if (localVideoRef.current) localVideoRef.current.srcObject = session?.localStream ?? null;
    if (session?.remoteStream) {
      remoteVideoRef.current?.play().catch(() => undefined);
      remoteAudioRef.current?.play().catch(() => undefined);
    }
  }, [session?.remoteStream, session?.localStream, session?.state]);

  if (!session) return null;

  const dur = session.startedAt ? Math.floor((now - session.startedAt) / 1000) : 0;
  const durLabel = `${String(Math.floor(dur / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}`;

  /* ----- llamada entrante ----- */
  if (session.state === "ringing-in") {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="pop-in flex w-80 flex-col items-center gap-4 rounded-3xl bg-white p-7 shadow-2xl dark:bg-neutral-900">
          <div className="relative">
            <Avatar user={session.peer} size={84} />
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-[#25d366]" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-neutral-800 dark:text-neutral-100">{session.peer.name}</p>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">
              {session.kind === "video" ? "Videollamada entrante" : "Llamada de voz entrante"} · @{session.peer.id}
            </p>
          </div>
          <div className="flex items-center gap-8">
            <button onClick={() => chat?.declineCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:scale-105" title="Rechazar">
              <PhoneOff size={22} />
            </button>
            <button onClick={() => chat?.acceptCall()} className="flex h-14 w-14 animate-bounce items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg transition hover:scale-105" title="Responder">
              {session.kind === "video" ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ----- overlay de llamada (saliente/conectando/activa) ----- */
  const stateLabel: Record<string, string> = {
    "ringing-out": "Llamando…",
    connecting: "Conectando…",
    active: durLabel,
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-gradient-to-b from-[#1f2c33] to-[#0b141a]">
      {/* vídeo remoto */}
      {session.kind === "video" && session.state === "active" ? (
        <video ref={remoteVideoRef} autoPlay playsInline className="min-h-0 flex-1 bg-black object-cover" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <div className="relative">
            <Avatar user={session.peer} size={120} ring />
            {session.state !== "active" && <span className="absolute inset-0 animate-ping rounded-full border-2 border-white/40" />}
          </div>
          <p className="text-[17px] font-semibold text-white">{session.peer.name}</p>
          <p className="text-[12.5px] tabular-nums text-white/70">{stateLabel[session.state] ?? session.state}</p>
          <p className="text-[10px] text-white/40">cifrada de extremo a extremo (DTLS-SRTP)</p>
        </div>
      )}

      {/* vídeo local PiP */}
      {session.kind === "video" && session.localStream && (
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-24 right-4 h-32 w-24 scale-x-[-1] rounded-2xl border-2 border-white/20 bg-black object-cover shadow-xl" />
      )}

      {/* controles */}
      <div className="flex shrink-0 items-center justify-center gap-4 pb-7 pt-4">
        <button
          onClick={() => chat?.toggleMute()}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition ${session.muted ? "bg-white text-neutral-800" : "bg-white/10 text-white hover:bg-white/20"}`}
          title={session.muted ? "Activar micrófono" : "Silenciar"}
        >
          {session.muted ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
        {session.kind === "video" && (
          <button
            onClick={() => chat?.toggleCamera()}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${session.cameraOff ? "bg-white text-neutral-800" : "bg-white/10 text-white hover:bg-white/20"}`}
            title={session.cameraOff ? "Encender cámara" : "Apagar cámara"}
          >
            {session.cameraOff ? <VideoOff size={19} /> : <Video size={19} />}
          </button>
        )}
        <button onClick={() => chat?.hangUp()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:scale-105" title="Colgar">
          <PhoneOff size={22} />
        </button>
      </div>
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}
