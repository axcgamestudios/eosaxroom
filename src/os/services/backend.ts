"use client";

/* ============================================================
   Cliente del backend de cuentas/mensajería de axcsOS
   (server/aos-backend.mjs — despliegue propio opcional)
   Sin backend configurado, las funciones devuelven estados
   honestos en lugar de simular nada.
   ============================================================ */

export interface AosUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string;
}
export interface AosChat {
  id: string;
  type: "dm" | "group";
  name: string;
  avatar: string | null;
  members: AosUser[];
  last: { text: string; time: number; from: boolean } | null;
  unread: number;
}
export interface AosMessage {
  id: string;
  from: string;
  text: string;
  time: number;
  mine: boolean;
  fromUser: AosUser | null;
  attachment?: { name: string; mime: string; data: string };
}

const LS_URL = "aos-backend-url";

export function getBackendUrl(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LS_URL) || "";
}
export function setBackendUrl(url: string) {
  if (typeof window === "undefined") return;
  const clean = url.trim().replace(/\/+$/, "");
  if (clean) window.localStorage.setItem(LS_URL, clean);
  else window.localStorage.removeItem(LS_URL);
}

function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem("aos-token") || window.localStorage.getItem("aos-token") || "";
}
export function setToken(t: string) {
  if (typeof window === "undefined") return;
  if (t) {
    window.localStorage.setItem("aos-token", t);
    window.sessionStorage.setItem("aos-token", t);
  } else {
    window.localStorage.removeItem("aos-token");
    window.sessionStorage.removeItem("aos-token");
  }
}

async function api<T>(path: string, init?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const base = getBackendUrl();
  if (!base) throw new Error("Backend no configurado (Ajustes → Cuenta)");
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    ...init,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ---------- health / sesión ---------- */
export async function checkBackend(url?: string): Promise<{ ok: boolean; detail: string; users?: number }> {
  const base = (url ?? getBackendUrl()).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) return { ok: false, detail: "Pon la URL completa (http://… o https://…)" };
  try {
    const res = await fetch(base + "/health", { signal: AbortSignal.timeout(6000) });
    const j = (await res.json()) as { ok?: boolean; service?: string; users?: number };
    if (j.ok && j.service === "aos-backend") return { ok: true, detail: `Conectado (${j.users ?? 0} usuarios registrados)`, users: j.users };
    return { ok: false, detail: "El servidor responde pero no es un backend de axcsOS" };
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e) };
  }
}

export const register = (username: string, password: string, displayName: string) =>
  api<{ token: string; user: AosUser }>("/api/auth/register", { method: "POST", body: { username, password, displayName } });
export const login = (username: string, password: string) =>
  api<{ token: string; user: AosUser }>("/api/auth/login", { method: "POST", body: { username, password } });
export const logout = () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
export const me = () => api<{ user: AosUser }>("/api/me");
export const updateMe = (patch: { displayName?: string; bio?: string; avatar?: string | null }) =>
  api<{ user: AosUser }>("/api/me", { method: "PATCH", body: patch });

/* ---------- contactos ---------- */
export const searchUsers = (q: string) => api<{ users: AosUser[] }>(`/api/users?q=${encodeURIComponent(q)}`);
export interface FriendsState {
  friends: AosUser[];
  incoming: { id: string; from: AosUser }[];
  outgoing: { id: string; to: AosUser }[];
}
export const getFriends = () => api<FriendsState>("/api/friends");
export const requestFriend = (username: string) => api<{ ok: boolean }>("/api/friends/request", { method: "POST", body: { username } });
export const respondFriend = (id: string, accept: boolean) => api<{ ok: boolean }>("/api/friends/respond", { method: "POST", body: { id, accept } });
export const removeFriend = (username: string) => api<{ ok: boolean }>("/api/friends/remove", { method: "POST", body: { username } });

/* ---------- chats y mensajes ---------- */
export const getChats = () => api<{ chats: AosChat[] }>("/api/chats");
export const createGroup = (name: string, members: string[]) => api<{ id: string }>("/api/chats", { method: "POST", body: { name, members } });
export const getMessages = (chatId: string, after = 0) =>
  api<{ messages: AosMessage[]; members: AosUser[] }>(`/api/messages/${chatId}?after=${after}`);
export const sendMessage = (chatId: string, body: { text?: string; attachment?: { name: string; mime: string; data: string } }) =>
  api<{ message: AosMessage }>(`/api/messages/${chatId}`, { method: "POST", body });

export const hasBackend = () => !!getBackendUrl();
export const isLogged = () => !!getToken();
