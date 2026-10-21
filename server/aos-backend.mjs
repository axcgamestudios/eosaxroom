// aos-backend.mjs — Backend de cuentas y mensajería de axcsOS
// Node puro (sin dependencias). Despliegue: ver README.md de este directorio.
//
// Seguridad implementada:
// - Contraseñas con scrypt + salt aleatorio (nunca en texto plano)
// - Tokens de sesión de 32 bytes aleatorios (Authorization: Bearer)
// - Comparaciones en tiempo constante, rate-limit por IP en login/registro
// - Validación de entradas y límites de tamaño (adjuntos ≤ 2 MB, base64)
// - Control de acceso por usuario en TODAS las rutas de chats/mensajes
// - CORS con allowlist configurable
import http from "node:http";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 4100);
const DATA_FILE = process.env.AOS_DATA_FILE || join(dirname(fileURLToPath(import.meta.url)), "data.json");
const ALLOWED_ORIGINS = (process.env.AOS_ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_ATTACHMENT = 2 * 1024 * 1024; // 2 MB en base64
const MAX_BODY = 4 * 1024 * 1024;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

/* ---------------- almacenamiento (archivo JSON, escrituras atómicas) ---------------- */
let db = { users: {}, tokens: {}, chats: {}, seq: 1 };
async function load() {
  try {
    if (existsSync(DATA_FILE)) db = JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("[aos-backend] no se pudo leer data.json, empezando vacío:", e.message);
  }
}
let saving = Promise.resolve();
function save() {
  // serializar escrituras; renombrar atómico para no corromper el archivo
  saving = saving.then(async () => {
    const tmp = DATA_FILE + ".tmp";
    await writeFile(tmp, JSON.stringify(db));
    await rename(tmp, DATA_FILE);
  }).catch((e) => console.error("[aos-backend] error guardando:", e.message));
  return saving;
}
const uid = (p) => p + "_" + db.seq++;
const now = () => Date.now();

/* ---------------- seguridad ---------------- */
const rateBuckets = new Map(); // ip → {count, reset}
function rateLimit(ip, max = 20, windowMs = 60_000) {
  const b = rateBuckets.get(ip);
  const t = now();
  if (!b || t > b.reset) {
    rateBuckets.set(ip, { count: 1, reset: t + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}
function hashPassword(pw, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(pw, salt, 64).toString("hex") };
}
function verifyPassword(pw, salt, hash) {
  try {
    return timingSafeEqual(Buffer.from(scryptSync(pw, salt, 64).toString("hex"), "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}
function auth(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  const t = db.tokens[token];
  if (!t || t.expires < now()) {
    if (t) { delete db.tokens[token]; save(); }
    return null;
  }
  const user = Object.values(db.users).find((u) => u.id === t.userId) || null;
  return { token, user };
}
const publicUser = (u) => u && { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar || null, bio: u.bio || "" };

/* ---------------- http ---------------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGINS[0] === "*" ? "*" : "",
    "cache-control": "no-store",
  });
  if (ALLOWED_ORIGINS[0] !== "*") {
    const origin = res.req?.headers?.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "Origin");
    }
  }
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("cuerpo demasiado grande")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}
const isStr = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const ip = req.socket.remoteAddress || "?";

  // CORS preflight
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS[0] !== "*" && !ALLOWED_ORIGINS.includes(origin)) { res.writeHead(403).end(); return; }
    res.writeHead(204, {
      "access-control-allow-origin": ALLOWED_ORIGINS[0] === "*" ? "*" : origin,
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "access-control-max-age": "86400",
    });
    res.end();
    return;
  }

  try {
    /* ---- health ---- */
    if (path === "/" || path === "/health") {
      return json(res, 200, { ok: true, service: "aos-backend", version: "1.0.0", users: Object.keys(db.users).length });
    }

    /* ---- auth ---- */
    if (path === "/api/auth/register" && req.method === "POST") {
      if (!rateLimit(ip, 10)) return json(res, 429, { error: "Demasiados intentos; espera un minuto" });
      const b = await readBody(req);
      if (!isStr(b.username, 3, 24) || !/^[\w.]+$/.test(b.username)) return json(res, 400, { error: "Nombre de usuario inválido (3-24 caracteres: letras, números, . _)" });
      if (!isStr(b.password, 6, 128)) return json(res, 400, { error: "La contraseña debe tener entre 6 y 128 caracteres" });
      if (db.users[b.username.toLowerCase()]) return json(res, 409, { error: "Ese nombre de usuario ya existe" });
      const { salt, hash } = hashPassword(b.password);
      const user = {
        id: uid("u"),
        username: b.username.toLowerCase(),
        displayName: isStr(b.displayName, 1, 32) ? b.displayName : b.username,
        avatar: null,
        bio: "",
        salt, hash,
        created: now(),
      };
      db.users[user.username] = user;
      const token = randomBytes(32).toString("hex");
      db.tokens[token] = { userId: user.id, expires: now() + TOKEN_TTL_MS };
      await save();
      return json(res, 201, { token, user: publicUser(user) });
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      if (!rateLimit(ip, 15)) return json(res, 429, { error: "Demasiados intentos; espera un minuto" });
      const b = await readBody(req);
      const user = db.users[String(b.username || "").toLowerCase()];
      if (!user || !verifyPassword(String(b.password || ""), user.salt, user.hash)) {
        return json(res, 401, { error: "Usuario o contraseña incorrectos" });
      }
      const token = randomBytes(32).toString("hex");
      db.tokens[token] = { userId: user.id, expires: now() + TOKEN_TTL_MS };
      return json(res, 200, { token, user: publicUser(user) });
    }

    if (path === "/api/auth/logout" && req.method === "POST") {
      const a = auth(req);
      if (a?.token) { delete db.tokens[a.token]; save(); }
      return json(res, 200, { ok: true });
    }

    /* ---- a partir de aquí todo requiere sesión ---- */
    const a = auth(req);
    if (!a || !a.user) return json(res, 401, { error: "No autenticado" });
    const me = a.user;

    if (path === "/api/me" && req.method === "GET") return json(res, 200, { user: publicUser(me) });

    if (path === "/api/me" && req.method === "PATCH") {
      const b = await readBody(req);
      if (b.displayName !== undefined) { if (!isStr(b.displayName, 1, 32)) return json(res, 400, { error: "Nombre visible inválido" }); me.displayName = b.displayName; }
      if (b.bio !== undefined) { if (!isStr(b.bio, 0, 200)) return json(res, 400, { error: "Biografía demasiado larga" }); me.bio = b.bio; }
      if (b.avatar !== undefined) {
        if (b.avatar === null || b.avatar === "") me.avatar = null;
        else if (typeof b.avatar === "string" && b.avatar.startsWith("data:image/") && b.avatar.length < 300 * 1024) me.avatar = b.avatar;
        else return json(res, 400, { error: "Avatar inválido (dataURL de imagen < 300 KB)" });
      }
      await save();
      return json(res, 200, { user: publicUser(me) });
    }

    /* ---- usuarios / contactos ---- */
    if (path === "/api/users" && req.method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase().trim();
      if (q.length < 2) return json(res, 200, { users: [] });
      const users = Object.values(db.users)
        .filter((u) => u.id !== me.id && (u.username.includes(q) || (u.displayName || "").toLowerCase().includes(q)))
        .slice(0, 12)
        .map(publicUser);
      return json(res, 200, { users });
    }

    if (path === "/api/friends" && req.method === "GET") {
      const friends = (me.friends || []).map((id) => publicUser(Object.values(db.users).find((u) => u.id === id))).filter(Boolean);
      const incoming = Object.values(db.chats).filter((c) => c.type === "request" && c.to === me.id).map((c) => ({ id: c.id, from: publicUser(Object.values(db.users).find((u) => u.id === c.from)) }));
      const outgoing = Object.values(db.chats).filter((c) => c.type === "request" && c.from === me.id).map((c) => ({ id: c.id, to: publicUser(Object.values(db.users).find((u) => u.id === c.to)) }));
      return json(res, 200, { friends, incoming, outgoing });
    }

    if (path === "/api/friends/request" && req.method === "POST") {
      if (!rateLimit(ip, 30)) return json(res, 429, { error: "Demasiadas peticiones" });
      const b = await readBody(req);
      const target = db.users[String(b.username || "").toLowerCase()];
      if (!target) return json(res, 404, { error: "Usuario no encontrado" });
      if (target.id === me.id) return json(res, 400, { error: "No puedes enviarte una solicitud a ti mismo" });
      if ((me.friends || []).includes(target.id)) return json(res, 409, { error: "Ya sois amigos" });
      const dup = Object.values(db.chats).find((c) => c.type === "request" && ((c.from === me.id && c.to === target.id) || (c.from === target.id && c.to === me.id)));
      if (dup) return json(res, 409, { error: "Ya hay una solicitud pendiente entre vosotros" });
      const rid = uid("req");
      db.chats[rid] = { id: rid, type: "request", from: me.id, to: target.id, created: now() };
      await save();
      return json(res, 201, { ok: true });
    }

    if (path === "/api/friends/respond" && req.method === "POST") {
      const b = await readBody(req);
      const req_ = db.chats[String(b.id || "")];
      if (!req_ || req_.type !== "request" || req_.to !== me.id) return json(res, 404, { error: "Solicitud no encontrada" });
      const from = Object.values(db.users).find((u) => u.id === req_.from);
      if (!from) return json(res, 404, { error: "Usuario no encontrado" });
      delete db.chats[req_.id];
      if (b.accept) {
        me.friends = [...new Set([...(me.friends || []), from.id])];
        from.friends = [...new Set([...(from.friends || []), me.id])];
        // chat directo entre ambos
        const dm = Object.values(db.chats).find((c) => c.type === "dm" && c.members.includes(me.id) && c.members.includes(from.id));
        if (!dm) {
          const did = uid("dm");
          db.chats[did] = { id: did, type: "dm", members: [me.id, from.id], created: now(), messages: [], reads: {} };
        }
      }
      await save();
      return json(res, 200, { ok: true, friends: b.accept });
    }

    if (path === "/api/friends/remove" && req.method === "POST") {
      const b = await readBody(req);
      const target = db.users[String(b.username || "").toLowerCase()];
      if (!target) return json(res, 404, { error: "Usuario no encontrado" });
      me.friends = (me.friends || []).filter((id) => id !== target.id);
      target.friends = (target.friends || []).filter((id) => id !== me.id);
      await save();
      return json(res, 200, { ok: true });
    }

    /* ---- chats y mensajes ---- */
    if (path === "/api/chats" && req.method === "GET") {
      const chats = Object.values(db.chats)
        .filter((c) => (c.type === "dm" || c.type === "group") && c.members.includes(me.id))
        .map((c) => {
          const last = c.messages[c.messages.length - 1];
          const others = c.members.filter((m) => m !== me.id).map((id) => publicUser(Object.values(db.users).find((u) => u.id === id)));
          return {
            id: c.id,
            type: c.type,
            name: c.type === "group" ? c.name : others[0]?.displayName || "?",
            avatar: c.type === "group" ? null : others[0]?.avatar,
            members: others,
            last: last ? { text: last.text || (last.attachment ? "📎 " + last.attachment.name : ""), time: last.time, from: last.from === me.id } : null,
            unread: c.messages.filter((m) => m.from !== me.id && (c.reads?.[me.id] || 0) < m.time).length,
          };
        })
        .sort((x, y) => (y.last?.time || 0) - (x.last?.time || 0));
      return json(res, 200, { chats });
    }

    if (path === "/api/chats" && req.method === "POST") {
      const b = await readBody(req);
      if (!isStr(b.name, 1, 48)) return json(res, 400, { error: "Nombre de grupo inválido" });
      if (!Array.isArray(b.members) || b.members.length < 1) return json(res, 400, { error: "Añade al menos a un amigo" });
      const memberIds = [me.id];
      for (const uname of b.members) {
        const u = db.users[String(uname).toLowerCase()];
        if (!u || !(me.friends || []).includes(u.id)) return json(res, 400, { error: `No eres amigo de ${uname}` });
        memberIds.push(u.id);
      }
      const gid = uid("grp");
      const chat = { id: gid, type: "group", name: b.name, members: [...new Set(memberIds)], admin: me.id, created: now(), messages: [], reads: {} };
      db.chats[gid] = chat;
      await save();
      return json(res, 201, { id: gid });
    }

    const mMsg = /^\/api\/messages\/([\w-]+)$/.exec(path);
    if (mMsg) {
      const chat = db.chats[mMsg[1]];
      if (!chat || !(chat.type === "dm" || chat.type === "group") || !chat.members.includes(me.id)) {
        return json(res, 403, { error: "No tienes acceso a esta conversación" });
      }
      if (req.method === "GET") {
        const after = Number(url.searchParams.get("after") || 0);
        const msgs = chat.messages
          .filter((m) => m.time > after)
          .slice(-100)
          .map((m) => ({ ...m, mine: m.from === me.id, fromUser: publicUser(Object.values(db.users).find((u) => u.id === m.from)) }));
        // marcar leído
        chat.reads = { ...(chat.reads || {}), [me.id]: now() };
        save();
        return json(res, 200, { messages: msgs, members: chat.members.map((id) => publicUser(Object.values(db.users).find((u) => u.id === id))) });
      }
      if (req.method === "POST") {
        if (!rateLimit(ip, 240, 60_000)) return json(res, 429, { error: "Estás enviando mensajes demasiado rápido" });
        const b = await readBody(req);
        const hasText = isStr(b.text, 1, 4000);
        const hasAtt = b.attachment && typeof b.attachment.name === "string" && typeof b.attachment.mime === "string" && typeof b.attachment.data === "string";
        if (!hasText && !hasAtt) return json(res, 400, { error: "Mensaje vacío" });
        if (hasAtt && b.attachment.data.length > MAX_ATTACHMENT) return json(res, 413, { error: "El adjunto supera 2 MB" });
        if (hasAtt && !/^(image|audio|video|application|text)\//.test(b.attachment.mime)) return json(res, 400, { error: "Tipo de adjunto no permitido" });
        const msg = { id: uid("m"), from: me.id, text: hasText ? b.text : "", time: now() };
        if (hasAtt) msg.attachment = { name: b.attachment.name.slice(0, 120), mime: b.attachment.mime, data: b.attachment.data };
        chat.messages.push(msg);
        if (chat.messages.length > 500) chat.messages = chat.messages.slice(-500);
        await save();
        return json(res, 201, { message: { ...msg, mine: true } });
      }
    }

    return json(res, 404, { error: "Ruta no encontrada: " + path });
  } catch (e) {
    console.error("[aos-backend]", e);
    return json(res, 500, { error: "Error interno del servidor" });
  }
});

await load();
server.listen(PORT, () => {
  console.log(`aos-backend escuchando en :${PORT}`);
  console.log(`  orígenes permitidos: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`  datos: ${DATA_FILE}`);
});
