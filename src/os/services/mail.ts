"use client";

/* ============================================================
   Mail de axcsOS — correo real entre usuarios del sistema
   ------------------------------------------------------------
   * Dirección propia del usuario: <nombre>@axcs.os (se crea una
     vez en la app Mail y sirve para identificarse al iniciar
     sesión en páginas web — Safari la rellena por ti).
   * Entrega REAL por los brokers MQTT públicos sobre WebSocket
     (misma cadena verificada que usa Mensajes: emqx → hivemq →
     mosquitto), QoS 1 con deduplicación por id de carta.
   * Persistencia en localStorage (recortada por cuota).
   * Los buzones solo existen dentro de axcsOS: las webs externas
     no pueden enviar aquí códigos de verificación (para eso está
     el correo real verificado de AXC ID). No se finge lo contrario.
   ============================================================ */

export const MAIL_DOMAIN = "axcs.os";

export type MailConnState = "offline" | "connecting" | "online" | "error";

export interface MailAccount {
  address: string; // nombre@axcs.os
  createdAt: number;
}

export interface MailLetter {
  id: string;
  from: string; // dirección del remitente
  fromName?: string; // nombre visible del remitente
  to: string; // dirección de destino
  subject: string;
  body: string;
  ts: number;
  mine: boolean;
  read: boolean;
}

/* ---------- tópicos y brokers (cadena verificada del chat) ---------- */

const NS = "axcsos/mail/v1";
const topicInbox = (local: string) => `${NS}/i/${local}`;

const BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
];

/* ---------- persistencia ---------- */

const LS_ACCOUNT = "axcsos-mail-account";
const LS_BOX = (local: string) => `axcsos-mail-box-${local}`;

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

const uid = (p = "m") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MAX_LETTERS = 120;
const MAX_BODY = 8000;

function sanitizeLocal(local: string): string {
  return local
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 24);
}

export function validAddress(addr: string): boolean {
  return new RegExp(`^[a-z0-9]([a-z0-9._-]{1,22})[a-z0-9]@${MAIL_DOMAIN.replace(".", "\\.")}$`, "i").test(addr.trim());
}

/* ---------- cuenta ---------- */

export function getMailAccount(): MailAccount | null {
  if (typeof window === "undefined") return null;
  return lsGet<MailAccount | null>(LS_ACCOUNT, null);
}

export function mailAddress(): string | null {
  return getMailAccount()?.address ?? null;
}

/** Crea la dirección de correo del usuario (una sola vez). */
export function createMailAccount(localPart: string): MailAccount {
  const local = sanitizeLocal(localPart);
  if (!local) throw new Error("Elige un nombre para tu correo (letras, números, punto, guion)");
  const acc: MailAccount = { address: `${local}@${MAIL_DOMAIN}`, createdAt: Date.now() };
  lsSet(LS_ACCOUNT, acc);
  // cartas de bienvenida reales del sistema (se guardan en el buzón)
  const box = lsGet<MailLetter[]>(LS_BOX(local), []);
  const now = Date.now();
  box.unshift(
    {
      id: uid("w1"),
      from: `equipo@${MAIL_DOMAIN}`,
      fromName: "Equipo axcsOS",
      to: acc.address,
      subject: "Tu correo de axcsOS está listo",
      body:
        `Hola:\n\nTu dirección ${acc.address} ya funciona. La usas para dos cosas:\n\n` +
        `1. Iniciar sesión en páginas web: cuando una web pida un correo (dentro de Safari), Safari te ofrecerá rellenarlo con esta dirección automáticamente.\n\n` +
        `2. Escribir a otras personas con axcsOS: escribe su dirección nombre@${MAIL_DOMAIN} en "Redactar" y la carta llega a su Mail en segundos.\n\n` +
        `Importante y honesto: este buzón existe dentro de axcsOS. Las webs externas NO pueden enviarte aquí códigos de verificación; para eso usa tu correo real verificado en Ajustes → Cuenta → AXC ID.\n\n` +
        `— El equipo de axcsOS 🍐`,
      ts: now,
      mine: false,
      read: false,
    },
    {
      id: uid("w2"),
      from: `appstore@${MAIL_DOMAIN}`,
      fromName: "App Store de axcsOS",
      to: acc.address,
      subject: "Juegos listos para instalar",
      body:
        `Crimes Online 6, Rocket League, Counter Strike 2, GTA 5, Marvel vs Capcom, Skate 3, PES 6, Endurance Racing y Survive Nights están en la App Store.\n\n` +
        `Ábrelas desde el Dock: se instalan como apps nativas del sistema (con el motor de navegación dentro) y aparecen aquí mismo en Launchpad.\n\n` +
        `Buenas partidas.`,
      ts: now - 1,
      mine: false,
      read: false,
    }
  );
  lsSet(LS_BOX(local), box.slice(0, MAX_LETTERS));
  return acc;
}

export function deleteMailAccount(): void {
  const acc = getMailAccount();
  if (!acc) return;
  try {
    localStorage.removeItem(LS_ACCOUNT);
  } catch {
    /* ignore */
  }
}

/* ---------- servicio de entrega (MQTT real) ---------- */

interface MailEnv {
  v: 1;
  t: "letter";
  id: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  ts: number;
}

export type MailEvent =
  | { type: "state"; state: MailConnState; detail?: string }
  | { type: "letter"; letter: MailLetter }
  | { type: "sent"; letter: MailLetter }
  | { type: "error"; error: string };

class MailService {
  state: MailConnState = "offline";
  account: MailAccount | null = null;
  letters: MailLetter[] = [];
  private listeners = new Set<(e: MailEvent) => void>();
  private client: import("mqtt").MqttClient | null = null;
  private brokerIdx = 0;
  private suffix = ""; // anti-kick multi-pestaña
  private seen = new Set<string>(); // dedupe QoS 1
  private ending = false;

  onEvent(cb: (e: MailEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: MailEvent) {
    this.listeners.forEach((cb) => cb(e));
  }

  /** Arranca la recepción de correo para la cuenta guardada (idempotente). */
  start(account?: MailAccount) {
    const acc = account ?? getMailAccount();
    if (!acc) return;
    const changed = this.account?.address !== acc.address;
    this.account = acc;
    if (changed || this.letters.length === 0) {
      this.letters = lsGet<MailLetter[]>(LS_BOX(this.local()), []);
    }
    if (this.client && this.state === "online" && !changed) return;
    this.connect();
  }

  stop() {
    this.ending = true;
    try {
      this.client?.end(true);
    } catch {
      /* ignore */
    }
    this.client = null;
    this.state = "offline";
    this.emit({ type: "state", state: "offline" });
  }

  private local(): string {
    return (this.account?.address ?? "").split("@")[0] ?? "";
  }

  private connect() {
    if (!this.account || this.client) return;
    this.ending = false;
    this.state = "connecting";
    this.emit({ type: "state", state: "connecting" });
    void this.doConnect();
  }

  private async doConnect() {
    if (!this.account) return;
    let mqttLib: typeof import("mqtt");
    try {
      mqttLib = await import("mqtt");
    } catch {
      this.state = "error";
      this.emit({ type: "state", state: "error", detail: "No se pudo cargar el módulo de red (mqtt)" });
      return;
    }
    const url = BROKERS[this.brokerIdx % BROKERS.length];
    const mqtt = (mqttLib as unknown as { default?: typeof import("mqtt") }).default ?? mqttLib;
    const local = this.local();
    // sufijo único por pestaña: el broker permite una conexión por clientId
    if (!this.suffix) this.suffix = `-${Math.random().toString(36).slice(2, 5)}`;
    let client: import("mqtt").MqttClient;
    try {
      client = mqtt.connect(url, {
        clientId: `aosmail-${local}${this.suffix}`,
        clean: true,
        connectTimeout: 9000,
        reconnectPeriod: 0, // failover manual
        keepalive: 30,
      });
    } catch {
      this.nextBroker("conexión inválida");
      return;
    }
    this.client = client;

    const failTimer = setTimeout(() => {
      if (this.state !== "online") this.nextBroker("tiempo de espera agotado");
    }, 11000);

    client.on("connect", () => {
      clearTimeout(failTimer);
      this.state = "online";
      this.emit({ type: "state", state: "online" });
      client.subscribe(topicInbox(local), { qos: 1 }, (err) => {
        if (err) this.emit({ type: "error", error: "No se pudo suscribir al buzón" });
      });
    });

    client.on("message", (_topic, payload) => {
      try {
        this.handleEnvelope(payload.toString());
      } catch {
        /* carta corrupta: ignorar */
      }
    });

    client.on("error", () => {
      /* onclose hará el failover */
    });

    client.on("close", () => {
      if (this.ending) return;
      this.client = null;
      this.state = "offline";
      this.emit({ type: "state", state: "offline" });
      if (!this.ending) setTimeout(() => !this.ending && this.connect(), 1500);
    });
  }

  private nextBroker(reason: string) {
    this.brokerIdx++;
    try {
      this.client?.end(true);
    } catch {
      /* ignore */
    }
    this.client = null;
    this.state = "connecting";
    this.emit({ type: "state", state: "connecting", detail: `Reintentando (${reason})…` });
    setTimeout(() => !this.ending && this.connect(), 800);
  }

  private handleEnvelope(raw: string) {
    let env: MailEnv;
    try {
      env = JSON.parse(raw) as MailEnv;
    } catch {
      return;
    }
    if (!env || env.v !== 1 || env.t !== "letter" || !env.id) return;
    if (this.seen.has(env.id)) return; // dedupe QoS 1
    this.seen.add(env.id);
    if (this.seen.size > 600) this.seen = new Set([...this.seen].slice(-300));
    const letter: MailLetter = {
      id: env.id,
      from: env.from,
      fromName: env.fromName,
      to: env.to,
      subject: (env.subject ?? "").slice(0, 120),
      body: (env.body ?? "").slice(0, MAX_BODY),
      ts: env.ts || Date.now(),
      mine: false,
      read: false,
    };
    // ¿es una carta mía repetida por el buzón? ignorar
    if (this.account && letter.from === this.account.address) return;
    this.letters = [letter, ...this.letters].slice(0, MAX_LETTERS);
    lsSet(LS_BOX(this.local()), this.letters);
    this.emit({ type: "letter", letter });
  }

  /** Envía una carta REAL al buzón de otra dirección axcsOS. */
  sendLetter(to: string, subject: string, body: string): { ok: boolean; error?: string } {
    if (!this.account) return { ok: false, error: "Primero crea tu dirección en Mail" };
    const dest = to.trim().toLowerCase();
    if (!validAddress(dest)) return { ok: false, error: `La dirección debe ser nombre@${MAIL_DOMAIN}` };
    if (dest === this.account.address) return { ok: false, error: "Escríbete a ti mismo no tiene gracia: elige otra dirección" };
    if (this.state !== "online" || !this.client) {
      // reintento único rápido de conexión
      this.connect();
      return { ok: false, error: "La red de correo se está conectando… vuelve a intentarlo en unos segundos" };
    }
    const letter: MailLetter = {
      id: uid(),
      from: this.account.address,
      fromName: this.account.address.split("@")[0],
      to: dest,
      subject: subject.trim().slice(0, 120) || "(sin asunto)",
      body: body.trim().slice(0, MAX_BODY),
      ts: Date.now(),
      mine: true,
      read: true,
    };
    const env: MailEnv = {
      v: 1,
      t: "letter",
      id: letter.id,
      from: letter.from,
      fromName: letter.fromName,
      to: letter.to,
      subject: letter.subject,
      body: letter.body,
      ts: letter.ts,
    };
    let published = false;
    try {
      published = this.client.publish(topicInbox(dest.split("@")[0]), JSON.stringify(env), { qos: 1, retain: false }) !== undefined;
    } catch {
      published = false;
    }
    if (!published) return { ok: false, error: "No se pudo enviar ahora mismo (red de correo caída)" };
    // copia en Enviados (local, como cualquier cliente de correo)
    this.letters = [letter, ...this.letters].slice(0, MAX_LETTERS);
    lsSet(LS_BOX(this.local()), this.letters);
    this.emit({ type: "sent", letter });
    return { ok: true };
  }

  markRead(id: string) {
    this.letters = this.letters.map((l) => (l.id === id ? { ...l, read: true } : l));
    lsSet(LS_BOX(this.local()), this.letters);
  }

  markAllRead() {
    this.letters = this.letters.map((l) => ({ ...l, read: true }));
    lsSet(LS_BOX(this.local()), this.letters);
  }

  deleteLetter(id: string) {
    this.letters = this.letters.filter((l) => l.id !== id);
    lsSet(LS_BOX(this.local()), this.letters);
  }
}

let singleton: MailService | null = null;

/** Singleton del servicio de correo de axcsOS. */
export function getMail(): MailService {
  if (!singleton) singleton = new MailService();
  return singleton;
}

/* ---------- helpers de interfaz ---------- */

export function fmtMailDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
