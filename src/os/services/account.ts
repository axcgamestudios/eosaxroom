/* ============================================================
   axcsOS ID — la cuenta del sistema ("cuenta Apple" de axcsOS)
   ------------------------------------------------------------
   * Vive en el dispositivo: claves ECDH P-256 + perfil en
     localStorage. Sin servidor de cuentas que configurar.
   * El @id se deriva de la huella de la clave pública: es la
     dirección a la que otros te escriben y llaman.
   * Las claves permiten cifrar de extremo a extremo (ECDH →
     AES-GCM 256) los mensajes directos y las claves de grupo.
   ============================================================ */

export interface AosIdProfile {
  id: string; // 6 caracteres, ej. "k7m2qx" → se muestra como @k7m2qx
  name: string;
  avatar: string | null; // dataURL
  bio: string;
  status: string;
  createdAt: number;
}

interface StoredIdentity extends AosIdProfile {
  priv: JsonWebKey;
  pub: JsonWebKey;
}

const KEY = "axcsos-id";
const listeners = new Set<(p: AosIdProfile | null) => void>();
let cache: StoredIdentity | null | undefined;

function load(): StoredIdentity | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as StoredIdentity) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function save(identity: StoredIdentity | null) {
  cache = identity;
  try {
    if (identity) localStorage.setItem(KEY, JSON.stringify(identity));
    else localStorage.removeItem(KEY);
  } catch { /* cuota */ }
  const profile = identity ? publicOf(identity) : null;
  listeners.forEach((cb) => cb(profile));
}

function publicOf(i: StoredIdentity): AosIdProfile {
  return { id: i.id, name: i.name, avatar: i.avatar, bio: i.bio, status: i.status, createdAt: i.createdAt };
}

export function getAccount(): AosIdProfile | null {
  const i = load();
  return i ? publicOf(i) : null;
}

export function getMyKeys(): { priv: JsonWebKey; pub: JsonWebKey } | null {
  const i = load();
  return i ? { priv: i.priv, pub: i.pub } : null;
}

export function onAccount(cb: (p: AosIdProfile | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* ---------- crypto helpers ---------- */

const b64 = {
  enc: (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  dec: (s: string): Uint8Array<ArrayBuffer> => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

async function fingerprint(pub: JsonWebKey): Promise<string> {
  const material = `${pub.x || ""}|${pub.y || ""}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material)));
  // Crockford base32 sin caracteres ambiguos (6 chars ≈ 30 bits)
  const ALPHA = "0123456789abcdefghjkmnpqrstvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHA[digest[i * 2] % 32];
  return out;
}

/** clave compartida ECDH → AES-GCM 256 (para DM con ese par) */
export async function deriveDmKey(myPriv: JsonWebKey, peerPub: JsonWebKey): Promise<CryptoKey> {
  const priv = await crypto.subtle.importKey("jwk", myPriv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const pub = await crypto.subtle.importKey("jwk", peerPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptString(key: CryptoKey, text: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}

export async function decryptString(key: CryptoKey, payload: { iv: string; ct: string }): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.dec(payload.iv) }, key, b64.dec(payload.ct));
  return new TextDecoder().decode(pt);
}

/** clave simétrica de grupo: AES-GCM 256 en base64 (para repartir cifrada) */
export async function genGroupKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return b64.enc(raw);
}

export async function importGroupKey(b64key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", b64.dec(b64key), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/* ---------- API de la cuenta ---------- */

export async function createAccount(name: string, avatar: string | null = null, bio = "Usando axcsOS"): Promise<AosIdProfile> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const id = await fingerprint(pub as JsonWebKey);
  const identity: StoredIdentity = {
    id,
    name: name.trim() || "Usuario axcsOS",
    avatar,
    bio,
    status: "Disponible",
    createdAt: Date.now(),
    priv: priv as JsonWebKey,
    pub: pub as JsonWebKey,
  };
  save(identity);
  return publicOf(identity);
}

export function updateProfile(patch: Partial<Pick<AosIdProfile, "name" | "avatar" | "bio" | "status">>): AosIdProfile | null {
  const i = load();
  if (!i) return null;
  const next: StoredIdentity = { ...i, ...patch };
  save(next);
  return publicOf(next);
}

export function signOut() {
  save(null);
}

/** avatar por defecto: inicial con gradiente derivado del id */
export function defaultAvatar(p: { id: string; name: string }): string {
  const palettes = [
    ["#34d399", "#0ea5e9"], ["#f472b6", "#8b5cf6"], ["#fbbf24", "#f97316"],
    ["#60a5fa", "#6366f1"], ["#a3e635", "#22c55e"], ["#f87171", "#dc2626"],
  ];
  const h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [c1, c2] = palettes[h % palettes.length];
  const letter = (p.name.trim()[0] || "A").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><text x="32" y="41" text-anchor="middle" font-family="-apple-system,system-ui,sans-serif" font-size="28" font-weight="600" fill="#fff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** reescala una imagen a dataURL (avatares) */
export function fileToDataUrl(file: File, maxW: number, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}
