"use client";

/* ============================================================
   Apps web de axcsOS — páginas instaladas como apps nativas
   ------------------------------------------------------------
   * Registro vivo de apps instaladas (localStorage + suscripción)
     que Dock, Launchpad, Spotlight y la App Store consumen.
   * Instalar una página = darle ventana propia (motor Scramjet +
     respaldo directo), icono y acceso como a cualquier app nativa.
   * Catálogo de la App Store (curado por el estudio).
   ============================================================ */

import { useSyncExternalStore } from "react";
import type { WebAppManifest } from "../types";

/* ---------- persistencia ---------- */

const LS_KEY = "axcsos-webapps";

/** prefijo de appId para apps web instaladas: "webapp:<id>" */
export const WEBAPP_PREFIX = "webapp:";
const listeners = new Set<() => void>();
let cache: WebAppManifest[] | null = null;

function load(): WebAppManifest[] {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return (cache = []);
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? (JSON.parse(raw) as WebAppManifest[]) : [];
    cache = Array.isArray(list) ? list.filter((m) => m && m.id && m.url) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(load()));
  } catch {
    /* cuota llena: el registro vive en memoria esta sesión */
  }
  listeners.forEach((cb) => cb());
}

/* ---------- API ---------- */

export function listWebApps(): WebAppManifest[] {
  return load();
}

export function subscribeWebApps(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook React: apps web instaladas, siempre frescas. */
export function useWebApps(): WebAppManifest[] {
  return useSyncExternalStore(subscribeWebApps, listWebApps, () => []);
}

export function slugify(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return u.hostname.replace(/^www\./, "").replace(/\./g, "-");
    const tail = path.split("/").filter(Boolean).pop() ?? "";
    const clean = tail.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
    const host = u.hostname.replace(/^www\./, "").replace(/\./g, "-");
    return clean ? `${host}-${clean}`.slice(0, 60) : host;
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "app";
  }
}

export function faviconFor(url: string): string {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
  } catch {
    return "";
  }
}

export interface InstallResult {
  ok: boolean;
  reason?: "duplicada";
  manifest?: WebAppManifest;
}

/** Instala (de verdad) una página como app de axcsOS. */
export function installWebApp(input: { url: string; name?: string }): InstallResult {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false };
  const list = load();
  const existing = list.find((m) => m.url === url);
  if (existing) return { ok: false, reason: "duplicada", manifest: existing };
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }
  const manifest: WebAppManifest = {
    id: slugify(url),
    name: (input.name ?? "").trim() || host,
    url,
    host,
    icon: faviconFor(url),
    installedAt: Date.now(),
  };
  // id único entre las instaladas
  let id = manifest.id;
  for (let i = 2; list.some((m) => m.id === id); i++) id = `${manifest.id}-${i}`;
  manifest.id = id;
  cache = [...list, manifest];
  persist();
  return { ok: true, manifest };
}

export function uninstallWebApp(id: string): void {
  cache = load().filter((m) => m.id !== id);
  persist();
}

export function findWebAppByUrl(url: string): WebAppManifest | undefined {
  return load().find((m) => m.url === url);
}

export function findWebAppById(id: string): WebAppManifest | undefined {
  return load().find((m) => m.id === id);
}

/* ---------- icono: gradiente determinista por dominio ---------- */

const TILE_GRADIENTS = [
  "linear-gradient(135deg,#f97316,#dc2626)",
  "linear-gradient(135deg,#22c55e,#047857)",
  "linear-gradient(135deg,#3b82f6,#6366f1)",
  "linear-gradient(135deg,#ec4899,#8b5cf6)",
  "linear-gradient(135deg,#14b8a6,#0ea5e9)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
];

export function tileGradientFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TILE_GRADIENTS[h % TILE_GRADIENTS.length];
}

/* ---------- catálogo de la App Store ---------- */

export interface StoreApp {
  /** identificador de catálogo */
  sid: string;
  name: string;
  /** url real a instalar (vacío para apps nativas del sistema) */
  url: string;
  developer: string;
  category: string;
  description: string;
  /** app nativa de axcsOS (no se instala: ya viene incluida) */
  nativeAppId?: string;
  /** url de portada para la ficha destacada */
  hero?: boolean;
}

/** Catálogo curado de la App Store de axcsOS. */
export const STORE_CATALOG: StoreApp[] = [
  {
    sid: "crimes-online-6",
    name: "Crimes Online 6: Mafia City",
    url: "https://www.crazygames.com/game/gangster-crimes-online-6-mafia-city",
    developer: "crazygames.com",
    category: "Juegos",
    description: "Mundo abierto mafioso: coches, misiones y la ciudad entera para dominar la banda.",
    hero: true,
  },
  {
    sid: "rocket-league",
    name: "Rocket League",
    url: "https://axcgamestudios.github.io/ra1/",
    developer: "axcgamestudios",
    category: "Juegos",
    description: "Fútbol con coches a reacción del estudio: golpes aéreos, turbo y partidos rápidos.",
  },
  {
    sid: "counter-strike-2",
    name: "Counter Strike 2",
    url: "https://www.clutcher.io/",
    developer: "clutcher.io",
    category: "Juegos",
    description: "El shooter táctico por equipos, jugable en el navegador con el motor de axcsOS.",
  },
  {
    sid: "gta-5",
    name: "GTA 5",
    url: "https://wasmarcade.com/gta-5",
    developer: "wasmarcade.com",
    category: "Juegos",
    description: "Los Santos en el navegador: la versión web jugable del clásico de mundo abierto.",
  },
  {
    sid: "marvel-vs-capcom",
    name: "Marvel vs Capcom",
    url: "https://wasmarcade.com/retro-games/marvel-vs-capcom-clash-of-super-heroes",
    developer: "wasmarcade.com",
    category: "Juegos",
    description: "Marvel vs Capcom: Clash of Super Heroes, el clásico de luchas 2D con etiquetas.",
  },
  {
    sid: "skate-3",
    name: "Skate 3",
    url: "https://skate.aaddpp.lol",
    developer: "aaddpp.lol",
    category: "Juegos",
    description: "Skateboarding libre: trucos, líneas y el parque entero para patinar.",
  },
  {
    sid: "pes-6",
    name: "PES 6",
    url: "https://pes6.optijuegos.net",
    developer: "optijuegos.net",
    category: "Juegos",
    description: "Pro Evolution Soccer 6: partidos clásicos de fútbol directo y arcade.",
  },
  {
    sid: "endurance-racing",
    name: "Endurance Racing",
    url: "https://endurance-racing.vercel.app",
    developer: "vercel.app",
    category: "Juegos",
    description: "Carreras de resistencia: aguanta el ritmo, gestiona el coche y cruza la meta.",
  },
  {
    sid: "survive-nights",
    name: "Survive Nights",
    url: "https://survivethenightgame.com",
    developer: "survivethenightgame.com",
    category: "Juegos",
    description: "Sobrevive a las noches: explora, consigue recursos y aguanta hasta el amanecer.",
  },
  {
    sid: "youtube",
    name: "YouTube",
    url: "https://www.youtube.com",
    developer: "axcsOS",
    category: "Entretenimiento",
    description: "El cliente YouTube de axcsOS: 100% nativo, sin sesión y sin depender del motor.",
    nativeAppId: "youtube",
  },
];

/** Apps del sistema que la App Store muestra como incluidas. */
export const STORE_INCLUDED: { appId: string; name: string; description: string }[] = [
  { appId: "axcgames", name: "AXCGAMES", description: "El portal de juegos del estudio, incluido en axcsOS." },
  { appId: "mail", name: "Mail", description: "Correo axcsOS: tu dirección para iniciar sesión en la web." },
  { appId: "messages", name: "Mensajes", description: "Chat cifrado de extremo a extremo entre cuentas axcsOS." },
];
