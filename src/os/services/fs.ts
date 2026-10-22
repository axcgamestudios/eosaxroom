"use client";

/* ============================================================
   Sistema de archivos de axcsOS
   ------------------------------------------------------------
   Árbol REAL compartido: el Escritorio, el Finder y TextEdit
   leen y escriben el mismo árbol (localStorage + suscripción
   con useSyncExternalStore, mismo patrón que webapps.ts).
   Lo que creas en el escritorio aparece en Finder → Escritorio
   y al revés; TextEdit guarda de verdad los .txt.
   ============================================================ */

import { useSyncExternalStore } from "react";

export type FsType = "folder" | "txt" | "image" | "app";

export interface FsNode {
  name: string;
  type: FsType;
  children?: FsNode[];
  content?: string;
  image?: string;
  appId?: string;
  size?: string;
}

const LS_KEY = "axcsos-fs";
const listeners = new Set<() => void>();
let cache: FsNode | null = null;

const TXT_LEEME = `Bienvenido a axcsOS 1.0 "Liquid Glass".

Para empezar:
• AXCGAMES está en el Dock — 21+ juegos gratis
• ⌘Espacio abre Spotlight
• Clic derecho en el escritorio: crea archivos y carpetas, o añade apps
• Arrastra los iconos para ordenar tu escritorio a tu gusto
• Ajustes del Sistema para cambiar el fondo

Todo lo que creas se guarda en tu navegador.
Disfruta del sistema. 🍐`;

const TXT_COMPRA = `Lista de la compra
------------------
• Café de especialidad
• Teclado mecánico silencioso
• Un MacBook con macOS 27`;

const TXT_APUNTES = `Apuntes — Historia de la informática

1984  Macintosh original
2001  Mac OS X 10.0 Cheetah
2025  macOS 26 Tahoe (Liquid Glass)
2026  axcsOS 1.0 — esta demo web 🍐`;

const TXT_PRESUPUESTO = `Ordenador nuevo: 2.199 €
Café: 12 €
Total: dormir menos, programar más.`;

/** árbol inicial (primera visita o almacenamiento corrupto) */
function defaultTree(): FsNode {
  return {
    name: "Macintosh HD",
    type: "folder",
    children: [
      {
        name: "Escritorio",
        type: "folder",
        children: [
          { name: "LÉEME.txt", type: "txt", content: TXT_LEEME, size: "1 KB" },
          { name: "Lista de la compra.txt", type: "txt", content: TXT_COMPRA, size: "1 KB" },
        ],
      },
      {
        name: "Documentos",
        type: "folder",
        children: [
          {
            name: "Universidad",
            type: "folder",
            children: [{ name: "Apuntes.txt", type: "txt", content: TXT_APUNTES, size: "2 KB" }],
          },
          { name: "Presupuesto.txt", type: "txt", content: TXT_PRESUPUESTO, size: "1 KB" },
        ],
      },
      {
        name: "Descargas",
        type: "folder",
        children: [
          { name: "captura-mac-web.png", type: "image", image: "wallpapers/tahoe-dark.png", size: "1,8 MB" },
          { name: "fondo-sequoia.png", type: "image", image: "wallpapers/sequoia.png", size: "2,1 MB" },
        ],
      },
      {
        name: "Imágenes",
        type: "folder",
        children: [
          { name: "Tahoe Oscuro.png", type: "image", image: "wallpapers/tahoe-dark.png", size: "2,4 MB" },
          { name: "Tahoe Claro.png", type: "image", image: "wallpapers/tahoe-light.png", size: "2,2 MB" },
          { name: "Sequoia.png", type: "image", image: "wallpapers/sequoia.png", size: "2,1 MB" },
          { name: "Sonoma.png", type: "image", image: "wallpapers/sonoma.png", size: "2,0 MB" },
        ],
      },
    ],
  };
}

function load(): FsNode {
  if (cache !== null) return cache;
  if (typeof window === "undefined") return (cache = defaultTree());
  try {
    const raw = localStorage.getItem(LS_KEY);
    const tree = raw ? (JSON.parse(raw) as FsNode) : null;
    cache = tree && tree.type === "folder" && Array.isArray(tree.children) ? tree : defaultTree();
  } catch {
    cache = defaultTree();
  }
  return cache;
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    /* cuota llena: los cambios viven en memoria esta sesión */
  }
  listeners.forEach((cb) => cb());
}

function cloneTree(root: FsNode): FsNode {
  return JSON.parse(JSON.stringify(root)) as FsNode;
}

function findFolder(root: FsNode, path: string[]): FsNode | null {
  let dir = root;
  for (const seg of path) {
    const next = dir.children?.find((n) => n.name === seg && n.type === "folder");
    if (!next) return null;
    dir = next;
  }
  return dir;
}

function sizeOf(content: string): string {
  return `${Math.max(1, Math.ceil(content.length / 1024))} KB`;
}

/* ---------- API pública ---------- */

export function listFolder(path: string[]): FsNode[] {
  return findFolder(load(), path)?.children ?? [];
}

export function readFile(path: string[], name: string): FsNode | null {
  return findFolder(load(), path)?.children?.find((n) => n.name === name) ?? null;
}

/** nombre disponible dentro de dir ("sin título", "sin título 2", …) */
function uniqueName(dir: FsNode, base: string): string {
  const names = new Set((dir.children ?? []).map((n) => n.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 2; ; i++) {
    const cand = `${stem} ${i}${ext}`;
    if (!names.has(cand.toLowerCase())) return cand;
  }
}

/** crea una carpeta real; devuelve el nombre final (único) o "" si falló */
export function createFolder(path: string[], name = "carpeta sin título"): string {
  const root = cloneTree(load());
  const dir = findFolder(root, path);
  if (!dir) return "";
  const finalName = uniqueName(dir, name.trim() || "carpeta sin título");
  (dir.children ??= []).push({ name: finalName, type: "folder", children: [] });
  cache = root;
  persist();
  return finalName;
}

/** crea un .txt real; devuelve el nombre final (único) o "" si falló */
export function createFile(path: string[], name: string, content = ""): string {
  const root = cloneTree(load());
  const dir = findFolder(root, path);
  if (!dir) return "";
  const finalName = uniqueName(dir, name.trim() || "sin título.txt");
  (dir.children ??= []).push({ name: finalName, type: "txt", content, size: sizeOf(content) });
  cache = root;
  persist();
  return finalName;
}

/** guarda (crea o sobrescribe) un .txt existente */
export function writeFile(path: string[], name: string, content: string): boolean {
  const root = cloneTree(load());
  const dir = findFolder(root, path);
  if (!dir) return false;
  const existing = dir.children?.find((n) => n.name === name);
  if (existing && existing.type === "txt") {
    existing.content = content;
    existing.size = sizeOf(content);
  } else if (!existing) {
    (dir.children ??= []).push({ name, type: "txt", content, size: sizeOf(content) });
  } else {
    return false; // existe un nodo no-txt con ese nombre
  }
  cache = root;
  persist();
  return true;
}

/** renombra un nodo dentro de path */
export function renameNode(path: string[], name: string, newName: string): string | null {
  const target = newName.trim();
  if (!target) return null;
  const root = cloneTree(load());
  const dir = findFolder(root, path);
  const node = dir?.children?.find((n) => n.name === name);
  if (!dir || !node) return null;
  if (target === name) return name;
  node.name = uniqueName(dir, target);
  cache = root;
  persist();
  return node.name;
}

/** elimina un nodo (archivo o carpeta con todo su contenido) */
export function removeNode(path: string[], name: string): boolean {
  const root = cloneTree(load());
  const dir = findFolder(root, path);
  if (!dir?.children) return false;
  const before = dir.children.length;
  dir.children = dir.children.filter((n) => n.name !== name);
  if (dir.children.length === before) return false;
  cache = root;
  persist();
  return true;
}

/* ---------- suscripción (patrón webapps.ts) ---------- */

export function subscribeFs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getFs(): FsNode {
  return load();
}

/** Hook React: el árbol, siempre fresco (re-renderiza al mutar). */
export function useFs(): FsNode {
  return useSyncExternalStore(subscribeFs, getFs, getFs);
}
