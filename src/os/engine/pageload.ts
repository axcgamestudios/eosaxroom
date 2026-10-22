"use client";

/* ============================================================
   Utilidades de carga de páginas (compartidas por apps web
   instaladas y por la App Store)
   Mismo origen de verdad que Safari: la memoria de "sitios que
   cargan bien en directo" se comparte con Safari (misma clave).
   ============================================================ */

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function faviconFor(url: string): string {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
  } catch {
    return "";
  }
}

/* ¿el motor entregó una página de error (403/Access Denied, desafío anti-bot,
   o el propio "Uh oh!" de Scramjet)? Esas páginas NO cuentan como carga real. */
export function looksLikeErrorPage(doc: Document | null | undefined): boolean {
  try {
    if (!doc || !doc.body) return false;
    const title = (doc.title ?? "").trim();
    const txt = `${title} ${doc.body.innerText ?? ""}`.toLowerCase();
    // página de error del PROPIO motor (título exacto "Scramjet"): fallo del túnel
    if (title.toLowerCase() === "scramjet" && /error loading|uh oh/.test(txt)) return true;
    if (doc.getElementsByTagName("*").length > 30) return false; // página con contenido real
    return /access denied|forbidden|error 40[0-9]|40[0-9] error|just a moment|attention required|not found|no se encontr|internal server error|bad gateway|service unavailable/.test(txt);
  } catch {
    return false; // cross-origin o sin documento: no es una página de error legible
  }
}

/* firma de progreso real del documento (modo motor: mismo origen) */
export function pageSignature(doc: Document | null | undefined): string {
  try {
    if (!doc || !doc.documentElement) return "";
    let nodes = 0;
    try {
      nodes = doc.getElementsByTagName("*").length;
    } catch {
      nodes = 0;
    }
    return `${doc.readyState}|${nodes}|${doc.title ?? ""}`;
  } catch {
    return ""; // cross-origin (modo directo) o sin documento todavía
  }
}

/* ---------- memoria compartida con Safari: sitios que cargan bien en directo ---------- */

const LS_DIRECT_OK = "axcsos.safari.direct-ok";

export function directOkHosts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(LS_DIRECT_OK) ?? "[]") as string[];
    return Array.isArray(list) ? list.slice(-40) : [];
  } catch {
    return [];
  }
}

export function rememberDirectOk(host: string): void {
  if (typeof window === "undefined" || !host) return;
  try {
    const list = directOkHosts();
    if (!list.includes(host)) {
      list.push(host);
      window.localStorage.setItem(LS_DIRECT_OK, JSON.stringify(list.slice(-40)));
    }
  } catch {
    /* sin almacenamiento: la memoria vive solo esta sesión */
  }
}
