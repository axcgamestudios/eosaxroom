/* ============================================================
   Chat real de axcsOS — mensajería estilo WhatsApp SIN servidor
   propio que configurar.
   ------------------------------------------------------------
   Transporte: brokers MQTT públicos sobre WebSocket (failover
   automático emqx → hivemq → mosquitto). Suscripción al buzón
   propio + presencia global + topics de grupo.
   Cifrado: mensajes directos E2E (ECDH P-256 → AES-GCM 256).
   Grupos: clave de grupo AES-256 repartida cifrada a cada
   miembro por DM.
   Llamadas: WebRTC P2P (audio/vídeo) con señalización cifrada
   por el mismo canal. STUN público, sin TURN (best-effort P2P).
   Persistencia: mensajes/ contactos/ grupos en localStorage
   (recortados por cuota).
   ============================================================ */

import type { AosIdProfile } from "./account";
import { deriveDmKey, encryptString, decryptString, genGroupKey, importGroupKey, getMyKeys } from "./account";

export type ConnState = "offline" | "connecting" | "online" | "error";

export interface PresenceUser {
  id: string;
  name: string;
  avatar?: string | null;
  bio?: string;
  status?: string;
  pubkey?: JsonWebKey;
  lastSeen: number;
  online: boolean;
}

export interface Media {
  kind: "image" | "voice" | "sticker";
  mime: string;
  data: string; // dataURL/base64
  dur?: number; // voz: segundos
  name?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string; // "dm:<peerId>" | "g:<groupId>"
  from: string; // id del autor
  fromName?: string;
  text?: string;
  media?: Media;
  sticker?: string; // emoji grande
  ts: number;
  mine: boolean;
  read?: boolean;
  sys?: boolean;
}

export interface GroupInfo {
  id: string;
  name: string;
  members: PresenceUser[];
  key: string; // AES-256 base64 (se reparte cifrada por DM)
  createdAt: number;
}

export type CallKind = "audio" | "video";
export type CallState = "ringing-out" | "ringing-in" | "connecting" | "active" | "ended" | "declined" | "busy" | "failed";

export interface CallSession {
  callId: string;
  peer: PresenceUser;
  kind: CallKind;
  state: CallState;
  direction: "out" | "in";
  startedAt?: number;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  muted?: boolean;
  cameraOff?: boolean;
}

/* ---------- tópicos ---------- */
const NS = "aos/v2";
const topicPresence = `${NS}/p`;
const topicInbox = (id: string) => `${NS}/i/${id}`;
const topicGroup = (gid: string) => `${NS}/g/${gid}`;

/* ---------- brokers públicos (failover en orden) ---------- */
const BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
];

/* ---------- envelopes ---------- */
type Env =
  | { v: 1; t: "msg"; from: string; ts: number; id: string; e: { iv: string; ct: string } }
  | { v: 1; t: "grp"; from: string; ts: number; id: string; g: string; e: { iv: string; ct: string } }
  | { v: 1; t: "invite"; from: string; ts: number; g: string; e: { iv: string; ct: string } }
  | { v: 1; t: "read"; from: string; ts: number; chat: string; upto: string }
  | { v: 1; t: "typing"; from: string; ts: number; chat: string; on: boolean }
  | { v: 1; t: "call"; from: string; ts: number; callId: string; video: boolean; kind: "offer" | "answer" | "ice" | "end" | "decline" | "busy"; e: { iv: string; ct: string } };

interface PresenceEnv {
  v: 1; t: "presence"; id: string; name: string; avatar?: string | null; bio?: string; status?: string; pubkey?: JsonWebKey; ts: number;
}

/* ---------- persistencia ---------- */
const LS = {
  contacts: "axcsos-chat-contacts",
  dms: (id: string) => `axcsos-chat-dm-${id}`,
  groups: (id: string) => `axcsos-chat-groups-${id}`,
  read: (id: string) => `axcsos-chat-read-${id}`,
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const uid = (p = "") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MAX_MSGS = 90; // por chat, por cuota de localStorage

function pruneMessages(map: Record<string, ChatMessage[]>) {
  for (const k of Object.keys(map)) {
    const arr = map[k] || [];
    if (arr.length > MAX_MSGS) map[k] = arr.slice(-MAX_MSGS);
  }
}

/* ---------- servicio ---------- */

type ChatEvent =
  | { type: "state"; state: ConnState; detail?: string }
  | { type: "message"; msg: ChatMessage }
  | { type: "presence" }
  | { type: "typing"; chatId: string; from: string; on: boolean }
  | { type: "read"; chatId: string; upto: string; from: string }
  | { type: "groups" }
  | { type: "contacts" }
  | { type: "call"; session: CallSession; reason?: string }
  | { type: "error"; error: string };

class ChatService {
  state: ConnState = "offline";
  me: AosIdProfile | null = null;
  directory = new Map<string, PresenceUser>(); // usuarios vistos por presencia
  contacts: PresenceUser[] = [];
  messages: Record<string, ChatMessage[]> = {};
  groups: GroupInfo[] = [];
  readMarks: Record<string, { ts: number; upto: string }> = {};
  call: CallSession | null = null;
  onEvent: ((e: ChatEvent) => void) | null = null;

  private client: import("mqtt").MqttClient | null = null;
  private brokerIdx = 0;
  private failures = 0;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private typingLast = new Map<string, number>();
  private suffix = ""; // anti-kick multi-pestaña
  private kicked = 0;
  private lastKickAt = 0;
  private retryOnce = new Set<string>();
  private unloadHandler: (() => void) | null = null;
  private dmKeys = new Map<string, CryptoKey>();
  private groupKeys = new Map<string, CryptoKey>();
  private pcs = new Map<string, RTCPeerConnection>();
  private ending = false;

  /* ----- ciclo de vida ----- */

  start(me: AosIdProfile) {
    this.me = me;
    this.contacts = lsGet<PresenceUser[]>(LS.contacts, []);
    this.messages = lsGet(LS.dms(me.id), {});
    this.groups = lsGet<GroupInfo[]>(LS.groups(me.id), []);
    this.readMarks = lsGet(LS.read(me.id), {});
    this.connect();
    this.announce();
    this.presenceTimer = setInterval(() => {
      if (this.state === "online") this.announce();
      this.sweepPresence();
    }, 45000);
    if (typeof window !== "undefined") {
      this.unloadHandler = () => this.stop();
      window.addEventListener("beforeunload", this.unloadHandler);
    }
  }

  stop() {
    this.ending = true;
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.unloadHandler) window.removeEventListener("beforeunload", this.unloadHandler);
    try { this.client?.end(true); } catch { /* ignore */ }
    this.client = null;
    this.state = "offline";
    this.emit({ type: "state", state: "offline" });
  }

  reloadProfile(me: AosIdProfile) {
    this.me = me;
    if (this.state === "online") this.announce();
  }

  private emit(e: ChatEvent) {
    this.onEvent?.(e);
  }

  private connect() {
    if (!this.me || this.client) return;
    this.state = "connecting";
    this.emit({ type: "state", state: "connecting" });
    void this.doConnect();
  }

  private async doConnect() {
    if (!this.me) return;
    let mqttLib: typeof import("mqtt");
    try {
      mqttLib = await import("mqtt");
    } catch (e) {
      this.state = "error";
      this.emit({ type: "state", state: "error", detail: "No se pudo cargar el módulo de red (mqtt)" });
      return;
    }
    const url = BROKERS[this.brokerIdx % BROKERS.length];
    const mqtt = (mqttLib as unknown as { default?: typeof import("mqtt") }).default ?? mqttLib;
    const clientId = `aos2-${this.me.id}${this.suffix}`;
    let client: import("mqtt").MqttClient;
    try {
      client = mqtt.connect(url, {
        clientId,
        clean: this.suffix !== "",
        connectTimeout: 9000,
        reconnectPeriod: 0, // manual: controlamos el failover nosotros
        keepalive: 30,
      });
    } catch (e) {
      this.nextBroker("conexión inválida");
      return;
    }
    this.client = client;

    const failTimer = setTimeout(() => {
      if (this.state !== "online") {
        this.failures++;
        this.nextBroker("tiempo de espera agotado");
      }
    }, 11000);

    client.on("connect", () => {
      clearTimeout(failTimer);
      this.failures = 0;
      this.state = "online";
      this.emit({ type: "state", state: "online" });
      const myId = this.me?.id;
      if (!myId) return;
      const subs: Record<string, { qos: 0 | 1 }> = {
        [topicPresence]: { qos: 0 },
        [topicInbox(myId)]: { qos: 1 },
      };
      for (const g of this.groups) subs[topicGroup(g.id)] = { qos: 1 };
      client.subscribe(subs, () => {
        this.announce();
      });
    });

    client.on("message", (topic, payload) => {
      try {
        this.handleMessage(topic, payload.toString());
      } catch (e) {
        console.error("[chat] mensaje malformado", e);
      }
    });

    client.on("error", () => { /* on close decidimos */ });

    client.on("close", () => {
      clearTimeout(failTimer);
      if (this.ending || !this.client) return;
      // kick por clientId duplicado (dos pestañas): cambia el id y reintenta
      const now = Date.now();
      if (now - this.lastKickAt < 12000) this.kicked++;
      else this.kicked = 1;
      this.lastKickAt = now;
      if (this.kicked >= 2 && !this.suffix) {
        this.suffix = `-${Math.random().toString(36).slice(2, 6)}`;
      }
      this.failures++;
      this.client = null;
      this.state = "offline";
      this.emit({ type: "state", state: "offline" });
      if (this.failures >= 3) {
        this.brokerIdx++;
        this.failures = 0;
      }
      const wait = Math.min(15000, 1200 * Math.pow(1.6, Math.min(this.failures, 6)));
      setTimeout(() => this.connect(), wait);
    });
  }

  private nextBroker(reason: string) {
    try { this.client?.end(true); } catch { /* ignore */ }
    this.client = null;
    this.brokerIdx++;
    this.failures++;
    this.state = "connecting";
    this.emit({ type: "state", state: "connecting", detail: `cambiando de servidor de mensajería (${reason})` });
    setTimeout(() => this.connect(), 400);
  }

  private publish(topic: string, obj: unknown, qos: 0 | 1 = 1): boolean {
    if (!this.client || this.state !== "online") return false;
    const payload = JSON.stringify(obj);
    if (payload.length > 250_000) {
      this.emit({ type: "error", error: "El archivo es demasiado grande para enviarlo (máx. ~250 KB)" });
      return false;
    }
    try {
      this.client.publish(topic, payload, { qos });
      return true;
    } catch {
      return false;
    }
  }

  /* ----- presencia ----- */

  private announce() {
    const keys = getMyKeys();
    if (!this.me || !keys) return;
    const env: PresenceEnv = {
      v: 1, t: "presence",
      id: this.me.id, name: this.me.name, avatar: this.me.avatar, bio: this.me.bio, status: this.me.status,
      pubkey: keys.pub, ts: Date.now(),
    };
    this.publish(topicPresence, env, 0);
    // refresca mi propia entrada
    const cur = this.directory.get(this.me.id);
    this.directory.set(this.me.id, {
      id: this.me.id, name: this.me.name, avatar: this.me.avatar, bio: this.me.bio, status: this.me.status,
      pubkey: keys.pub, lastSeen: Date.now(), online: true,
    });
    if (!cur) this.emit({ type: "presence" });
  }

  private sweepPresence() {
    let changed = false;
    const now = Date.now();
    for (const [id, u] of this.directory) {
      const online = now - u.lastSeen < 100_000;
      if (u.online !== online) {
        u.online = online;
        changed = true;
      }
    }
    if (changed) this.emit({ type: "presence" });
  }

  /* ----- manejo de mensajes entrantes ----- */

  private handleMessage(topic: string, raw: string) {
    const env = JSON.parse(raw) as Env | PresenceEnv;
    if ((env as PresenceEnv).t === "presence") {
      const p = env as PresenceEnv;
      if (!p.id || p.id === this.me?.id) return;
      const known = this.directory.get(p.id);
      this.directory.set(p.id, {
        id: p.id, name: p.name || p.id, avatar: p.avatar, bio: p.bio, status: p.status,
        pubkey: p.pubkey, lastSeen: Date.now(), online: true,
      });
      if (!known || known.name !== p.name || known.avatar !== p.avatar) {
        // refresca contactos guardados con el nombre nuevo
        this.contacts = this.contacts.map((c) => (c.id === p.id ? { ...c, name: p.name, avatar: p.avatar, bio: p.bio, pubkey: p.pubkey } : c));
        this.saveContacts();
      }
      this.emit({ type: "presence" });
      return;
    }

    const e = env as Env;
    if (!e.from || e.from === this.me?.id) return;
    switch (e.t) {
      case "msg": void this.onDm(e);
        break;
      case "grp": void this.onGroup(e);
        break;
      case "invite": void this.onInvite(e);
        break;
      case "read": {
        this.readMarks[e.chat] = { ts: Date.now(), upto: e.upto };
        for (const m of this.messages[e.chat] ?? []) if (m.id === e.upto) m.read = true;
        // marca todo hasta upto como leído (orden por ts)
        const arr = this.messages[e.chat] ?? [];
        const idx = arr.findIndex((m) => m.id === e.upto);
        if (idx >= 0) for (let i = 0; i <= idx; i++) if (arr[i].mine) arr[i].read = true;
        this.persistMessages();
        this.emit({ type: "read", chatId: e.chat, upto: e.upto, from: e.from });
        break;
      }
      case "typing":
        this.emit({ type: "typing", chatId: e.chat, from: e.from, on: e.on });
        break;
      case "call":
        void this.onCallSignal(e);
        break;
    }
  }

  private async dmKeyFor(peerId: string, peerPub?: JsonWebKey): Promise<CryptoKey | null> {
    const cached = this.dmKeys.get(peerId);
    if (cached) return cached;
    const keys = getMyKeys();
    const pub = peerPub ?? this.directory.get(peerId)?.pubkey ?? this.contacts.find((c) => c.id === peerId)?.pubkey;
    if (!keys || !pub) return null;
    try {
      const key = await deriveDmKey(keys.priv, pub);
      this.dmKeys.set(peerId, key);
      return key;
    } catch {
      return null;
    }
  }

  private async groupKeyFor(gid: string, b64?: string): Promise<CryptoKey | null> {
    const cached = this.groupKeys.get(gid);
    if (cached) return cached;
    const b = b64 ?? this.groups.find((g) => g.id === gid)?.key;
    if (!b) return null;
    const key = await importGroupKey(b);
    this.groupKeys.set(gid, key);
    return key;
  }

  private async onDm(e: Extract<Env, { t: "msg" }>) {
    const key = await this.dmKeyFor(e.from);
    if (!key) {
      // carrera con la presencia (la clave pública aún no llegó): reintento único
      if (!this.retryOnce.has(e.id)) {
        this.retryOnce.add(e.id);
        setTimeout(() => void this.onDm(e), 2600);
      } else {
        this.emit({ type: "error", error: `Mensaje de @${e.from} ilegible (sin clave pública del remitente)` });
      }
      return;
    }
    let inner: { text?: string; media?: Media; sticker?: string; name?: string };
    try {
      inner = JSON.parse(await decryptString(key, e.e));
    } catch {
      return; // no era para nosotros / clave cambiada
    }
    const chatId = `dm:${e.from}`;
    // QoS 1 = entrega "al menos una vez": deduplica por id de mensaje
    if ((this.messages[chatId] ?? []).some((m) => m.id === e.id)) return;
    const msg: ChatMessage = {
      id: e.id, chatId, from: e.from, fromName: inner.name,
      text: inner.text, media: inner.media, sticker: inner.sticker,
      ts: e.ts, mine: false,
    };
    this.appendMessage(msg);
    this.emit({ type: "message", msg });
  }

  private async onGroup(e: Extract<Env, { t: "grp" }>) {
    const key = await this.groupKeyFor(e.g);
    if (!key) return;
    let inner: { text?: string; media?: Media; sticker?: string; name?: string };
    try {
      inner = JSON.parse(await decryptString(key, e.e));
    } catch {
      return;
    }
    const chatId = `g:${e.g}`;
    // deduplicación por id (reentregas QoS 1)
    if ((this.messages[chatId] ?? []).some((m) => m.id === e.id)) return;
    const msg: ChatMessage = {
      id: e.id, chatId, from: e.from, fromName: inner.name ?? e.from,
      text: inner.text, media: inner.media, sticker: inner.sticker,
      ts: e.ts, mine: false,
    };
    this.appendMessage(msg);
    this.emit({ type: "message", msg });
  }

  private async onInvite(e: Extract<Env, { t: "invite" }>) {
    const key = await this.dmKeyFor(e.from);
    if (!key) return;
    let inner: { name: string; key: string; members: PresenceUser[] };
    try {
      inner = JSON.parse(await decryptString(key, e.e));
    } catch {
      return;
    }
    const creator = this.directory.get(e.from) ?? this.contacts.find((c) => c.id === e.from);
    const members = (inner.members ?? []).filter((m) => m.id !== this.me?.id);
    if (creator) members.unshift({ ...creator, online: creator.online ?? false });
    const group: GroupInfo = { id: e.g, name: inner.name, members, key: inner.key, createdAt: e.ts };
    this.groups = [group, ...this.groups.filter((g) => g.id !== e.g)];
    this.saveGroups();
    try { this.client?.subscribe(topicGroup(e.g), { qos: 1 }); } catch { /* ignore */ }
    const chatId = `g:${e.g}`;
    this.appendMessage({
      id: uid("sys"), chatId, from: e.from, fromName: creator?.name ?? e.from,
      text: `te añadió al grupo “${inner.name}”`, ts: e.ts, mine: false, sys: true,
    });
    this.emit({ type: "groups" });
  }

  private appendMessage(msg: ChatMessage) {
    if (!this.messages[msg.chatId]) this.messages[msg.chatId] = [];
    this.messages[msg.chatId].push(msg);
    pruneMessages(this.messages);
    this.persistMessages();
  }

  private persistMessages() {
    if (!this.me) return;
    // si la cuota estalla, recorta lo más viejo con medios
    if (!lsSet(LS.dms(this.me.id), this.messages)) {
      for (const k of Object.keys(this.messages)) {
        this.messages[k] = this.messages[k].slice(-24);
      }
      lsSet(LS.dms(this.me.id), this.messages);
    }
  }

  private saveContacts() {
    lsSet(LS.contacts, this.contacts);
    this.emit({ type: "contacts" });
  }
  private saveGroups() {
    if (this.me) lsSet(LS.groups(this.me.id), this.groups);
    this.emit({ type: "groups" });
  }
  private saveRead() {
    if (this.me) lsSet(LS.read(this.me.id), this.readMarks);
  }

  /* ----- API de envío ----- */

  private async myPub(): Promise<{ id: string; name: string; avatar: string | null; pubkey: JsonWebKey } | null> {
    const keys = getMyKeys();
    if (!keys || !this.me) return null;
    return { id: this.me.id, name: this.me.name, avatar: this.me.avatar, pubkey: keys.pub };
  }

  async sendDm(peer: PresenceUser, payload: { text?: string; media?: Media; sticker?: string }): Promise<ChatMessage | null> {
    if (!this.me) return null;
    const key = await this.dmKeyFor(peer.id, peer.pubkey);
    if (!key) {
      this.emit({ type: "error", error: `@${peer.id} aún no está en la red (sin clave pública)` });
      return null;
    }
    const me = await this.myPub();
    const e = await encryptString(key, JSON.stringify({ text: payload.text, media: payload.media, sticker: payload.sticker, name: me?.name }));
    const id = uid("m");
    const env: Env = { v: 1, t: "msg", from: this.me.id, ts: Date.now(), id, e };
    if (!this.publish(topicInbox(peer.id), env)) {
      this.emit({ type: "error", error: "Sin conexión con la red de mensajería" });
      return null;
    }
    const msg: ChatMessage = {
      id, chatId: `dm:${peer.id}`, from: this.me.id, fromName: me?.name,
      text: payload.text, media: payload.media, sticker: payload.sticker,
      ts: env.ts, mine: true,
    };
    this.appendMessage(msg);
    this.emit({ type: "message", msg });
    return msg;
  }

  async sendGroup(gid: string, payload: { text?: string; media?: Media; sticker?: string }): Promise<ChatMessage | null> {
    if (!this.me) return null;
    const key = await this.groupKeyFor(gid);
    if (!key) return null;
    const me = await this.myPub();
    const e = await encryptString(key, JSON.stringify({ text: payload.text, media: payload.media, sticker: payload.sticker, name: me?.name }));
    const id = uid("m");
    const env: Env = { v: 1, t: "grp", from: this.me.id, ts: Date.now(), id, g: gid, e };
    if (!this.publish(topicGroup(gid), env)) {
      this.emit({ type: "error", error: "Sin conexión con la red de mensajería" });
      return null;
    }
    const msg: ChatMessage = {
      id, chatId: `g:${gid}`, from: this.me.id, fromName: me?.name,
      text: payload.text, media: payload.media, sticker: payload.sticker,
      ts: env.ts, mine: true,
    };
    this.appendMessage(msg);
    this.emit({ type: "message", msg });
    return msg;
  }

  sendReceipt(chatId: string, upto: string) {
    if (!this.me || !chatId.startsWith("dm:")) return;
    const peer = chatId.slice(3);
    this.publish(topicInbox(peer), { v: 1, t: "read", from: this.me.id, ts: Date.now(), chat: `dm:${this.me.id}`, upto });
  }

  markRead(chatId: string) {
    if (!this.me) return;
    const arr = this.messages[chatId] ?? [];
    const last = [...arr].reverse().find((m) => !m.mine && !m.sys);
    if (!last) return;
    this.readMarks[chatId] = { ts: Date.now(), upto: last.id };
    for (const m of arr) if (!m.mine) m.read = true;
    this.saveRead();
    this.persistMessages();
    this.sendReceipt(chatId, last.id);
  }

  typing(peerId: string, chatId: string, on: boolean) {
    const last = this.typingLast.get(peerId) ?? 0;
    if (on && Date.now() - last < 2100) return;
    this.typingLast.set(peerId, Date.now());
    this.publish(topicInbox(peerId), { v: 1, t: "typing", from: this.me!.id, ts: Date.now(), chat: chatId, on }, 0);
  }

  /* ----- contactos ----- */

  addContact(user: PresenceUser) {
    this.contacts = [user, ...this.contacts.filter((c) => c.id !== user.id)];
    this.saveContacts();
  }
  removeContact(id: string) {
    this.contacts = this.contacts.filter((c) => c.id !== id);
    this.saveContacts();
  }

  knownUsers(): PresenceUser[] {
    const map = new Map<string, PresenceUser>();
    for (const c of this.contacts) map.set(c.id, { ...c, online: this.directory.get(c.id)?.online ?? false, lastSeen: this.directory.get(c.id)?.lastSeen ?? 0 });
    for (const [id, u] of this.directory) if (!map.has(id)) map.set(id, u);
    return [...map.values()];
  }

  /* ----- grupos ----- */

  async createGroup(name: string, members: PresenceUser[]): Promise<GroupInfo | null> {
    if (!this.me) return null;
    const gid = uid("g").slice(1, 12);
    const key = await genGroupKey();
    const me = await this.myPub();
    const allMembers: PresenceUser[] = [{ ...(me as unknown as PresenceUser), online: true, lastSeen: Date.now() }, ...members];
    const group: GroupInfo = { id: gid, name: name.trim() || "Grupo", members: allMembers, key, createdAt: Date.now() };
    // reparte la clave cifrada a cada miembro por su buzón
    for (const m of members) {
      const dm = await this.dmKeyFor(m.id, m.pubkey);
      if (!dm) continue;
      const inner = JSON.stringify({ name: group.name, key, members: allMembers.map((x) => ({ id: x.id, name: x.name, avatar: x.avatar, pubkey: x.pubkey })) });
      const e = await encryptString(dm, inner);
      this.publish(topicInbox(m.id), { v: 1, t: "invite", from: this.me.id, ts: Date.now(), g: gid, e });
    }
    this.groups = [group, ...this.groups];
    this.saveGroups();
    try { this.client?.subscribe(topicGroup(gid), { qos: 1 }); } catch { /* ignore */ }
    this.appendMessage({
      id: uid("sys"), chatId: `g:${gid}`, from: this.me.id, fromName: me?.name,
      text: `Grupo “${group.name}” creado con ${members.length + 1} miembros`, ts: Date.now(), mine: true, sys: true,
    });
    return group;
  }

  /* ----- llamadas (WebRTC) ----- */

  private async encFor(peerId: string, obj: unknown): Promise<{ iv: string; ct: string } | null> {
    const key = await this.dmKeyFor(peerId);
    if (!key) return null;
    return encryptString(key, JSON.stringify(obj));
  }
  private async decFrom(peerId: string, e: { iv: string; ct: string }): Promise<unknown | null> {
    const key = await this.dmKeyFor(peerId);
    if (!key) return null;
    try {
      return JSON.parse(await decryptString(key, e));
    } catch {
      return null;
    }
  }

  private peerOf(id: string): PresenceUser {
    return this.directory.get(id) ?? this.contacts.find((c) => c.id === id) ?? { id, name: `@${id}`, lastSeen: 0, online: false };
  }

  async startCall(peer: PresenceUser, kind: CallKind): Promise<boolean> {
    if (!this.me || this.call) {
      this.emit({ type: "error", error: "Ya hay una llamada en curso" });
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" });
      const callId = uid("c");
      const pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      this.wirePc(callId, pc, peer.id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const e = await this.encFor(peer.id, { kind: "offer", sdp: pc.localDescription?.sdp, callId, video: kind === "video", fromName: this.me.name });
      if (!e) throw new Error("sin clave pública del destinatario");
      this.publish(topicInbox(peer.id), { v: 1, t: "call", from: this.me.id, ts: Date.now(), callId, video: kind === "video", kind: "offer", e });
      this.call = { callId, peer, kind, state: "ringing-out", direction: "out", localStream: stream };
      this.emit({ type: "call", session: this.call });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit({ type: "error", error: `No se pudo iniciar la llamada: ${msg}` });
      return false;
    }
  }

  private async onCallSignal(e: Extract<Env, { t: "call" }>) {
    const inner = (await this.decFrom(e.from, e.e)) as { sdp?: string; callId: string; video: boolean; fromName?: string } | null;
    if (!inner) return;

    if (e.kind === "offer") {
      if (this.call) {
        this.publish(topicInbox(e.from), { v: 1, t: "call", from: this.me!.id, ts: Date.now(), callId: e.callId, video: e.video, kind: "busy", e: (await this.encFor(e.from, { note: "ocupado" }))! });
        return;
      }
      const peer = { ...this.peerOf(e.from), name: inner.fromName || this.peerOf(e.from).name };
      this.call = {
        callId: e.callId, peer, kind: inner.video ? "video" : "audio", state: "ringing-in", direction: "in",
      };
      (this.call as CallSession & { pendingOffer?: string }).pendingOffer = inner.sdp;
      this.emit({ type: "call", session: this.call });
      return;
    }

    if (!this.call || this.call.callId !== e.callId) return;

    if (e.kind === "answer" && inner.sdp) {
      const pc = this.pcs.get(e.callId);
      if (pc) {
        await pc.setRemoteDescription({ type: "answer", sdp: inner.sdp });
        this.call.state = "connecting";
        this.emit({ type: "call", session: this.call });
      }
    } else if (e.kind === "ice") {
      const pc = this.pcs.get(e.callId);
      if (pc && inner.sdp) {
        try { await pc.addIceCandidate({ candidate: inner.sdp }); } catch { /* candidato tardío */ }
      }
    } else if (e.kind === "decline") {
      this.endCall("declined");
    } else if (e.kind === "busy") {
      this.endCall("busy");
    } else if (e.kind === "end") {
      this.endCall("ended");
    }
  }

  async acceptCall(): Promise<boolean> {
    if (!this.call || !this.me) return false;
    const pending = (this.call as CallSession & { pendingOffer?: string }).pendingOffer;
    if (!pending) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: this.call.kind === "video" });
      const pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      this.wirePc(this.call.callId, pc, this.call.peer.id);
      await pc.setRemoteDescription({ type: "offer", sdp: pending });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const e = await this.encFor(this.call.peer.id, { sdp: pc.localDescription?.sdp });
      this.publish(topicInbox(this.call.peer.id), { v: 1, t: "call", from: this.me.id, ts: Date.now(), callId: this.call.callId, video: this.call.kind === "video", kind: "answer", e: e! });
      this.call.localStream = stream;
      this.call.state = "connecting";
      this.emit({ type: "call", session: this.call });
      return true;
    } catch (err) {
      this.emit({ type: "error", error: `Micrófono/cámara no disponible: ${err instanceof Error ? err.message : err}` });
      return false;
    }
  }

  async declineCall() {
    if (!this.call || !this.me) return;
    const e = await this.encFor(this.call.peer.id, { note: "decline" });
    this.publish(topicInbox(this.call.peer.id), { v: 1, t: "call", from: this.me.id, ts: Date.now(), callId: this.call.callId, video: this.call.kind === "video", kind: "decline", e: e! });
    this.endCall("declined");
  }

  async hangUp() {
    if (!this.call || !this.me) return;
    const e = await this.encFor(this.call.peer.id, { note: "end" });
    this.publish(topicInbox(this.call.peer.id), { v: 1, t: "call", from: this.me.id, ts: Date.now(), callId: this.call.callId, video: this.call.kind === "video", kind: "end", e: e! });
    this.endCall("ended");
  }

  private endCall(state: CallState) {
    const session = this.call;
    if (!session) return;
    session.state = state;
    session.localStream?.getTracks().forEach((t) => t.stop());
    session.localStream = undefined;
    const pc = this.pcs.get(session.callId);
    try { pc?.close(); } catch { /* ignore */ }
    this.pcs.delete(session.callId);
    this.call = null;
    this.emit({ type: "call", session, reason: state });
  }

  toggleMute(): boolean {
    if (!this.call?.localStream) return false;
    const track = this.call.localStream.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
    this.call.muted = track ? !track.enabled : false;
    this.emit({ type: "call", session: this.call });
    return this.call.muted;
  }

  toggleCamera(): boolean {
    if (!this.call?.localStream) return false;
    const track = this.call.localStream.getVideoTracks()[0];
    if (track) track.enabled = !track.enabled;
    this.call.cameraOff = track ? !track.enabled : true;
    this.emit({ type: "call", session: this.call });
    return this.call.cameraOff;
  }

  private wirePc(callId: string, pc: RTCPeerConnection, peerId: string) {
    this.pcs.set(callId, pc);
    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.me) {
        void this.encFor(peerId, { sdp: ev.candidate.candidate }).then((e) => {
          if (e) this.publish(topicInbox(peerId), { v: 1, t: "call", from: this.me!.id, ts: Date.now(), callId, video: this.call?.kind === "video", kind: "ice", e });
        });
      }
    };
    pc.ontrack = (ev) => {
      if (!this.call || this.call.callId !== callId) return;
      this.call.remoteStream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.call.state = "active";
      if (!this.call.startedAt) this.call.startedAt = Date.now();
      this.emit({ type: "call", session: this.call });
    };
    pc.onconnectionstatechange = () => {
      if (!this.call || this.call.callId !== callId) return;
      if (pc.connectionState === "failed") {
        this.endCall("failed");
      } else if (pc.connectionState === "disconnected" && this.call.state === "active") {
        this.endCall("ended");
      }
    };
  }
}

/* ---------- instancia única (solo navegador: el módulo se evalúa también en SSR) ---------- */
let singleton: ChatService | null = null;
export function getChat(): ChatService {
  if (!singleton) singleton = new ChatService();
  return singleton;
}

/* debugging/E2E: acceso de solo lectura al servicio */
if (typeof window !== "undefined") {
  (window as unknown as { __aosChat?: { svc: ChatService } }).__aosChat = { svc: getChat() };
}

/* ---------- utilidades de medios ---------- */

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer el audio"));
    r.readAsDataURL(blob);
  });
}

/** reescala una imagen para que quepa por la red (<220 KB de payload) */
export async function shrinkImage(dataUrl: string, maxDim = 1280, quality = 0.78): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("imagen ilegible"));
    img.src = dataUrl;
  });
  let w = img.width, h = img.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  let out = dataUrl, q = quality;
  for (let i = 0; i < 5; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL("image/jpeg", q);
    if (out.length < 210_000) break;
    q -= 0.14; w = Math.round(w * 0.82); h = Math.round(h * 0.82);
  }
  return out;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(ts: number): string {
  const d = new Date(ts), now = new Date();
  const day = 86400000;
  if (now.toDateString() === d.toDateString()) return "HOY";
  if (new Date(now.getTime() - day).toDateString() === d.toDateString()) return "AYER";
  return d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}
