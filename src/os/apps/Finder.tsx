"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { APPS } from "../registry";
import { FolderIcon, HDIcon } from "../icons";

type NodeType = "folder" | "txt" | "image" | "app";

interface FsNode {
  name: string;
  type: NodeType;
  children?: FsNode[];
  content?: string;
  image?: string;
  appId?: string;
  size?: string;
}

const TXT_README = `axcsOS 1.0 "Liquid Glass"
=============================

Este sistema operativo web incluye:

• App AXCGAMES — portal con 21+ juegos
• Finder, Safari, Notas, Calculadora, Terminal
• Ajustes del Sistema con fondos y acentos
• Spotlight (⌘Espacio) y ⌘Tab

Consejo: todo se guarda en tu navegador.
Si algo se ve raro, cierra sesión y vuelve a entrar.`;

const TXT_NOTAS = `Lista de la compra
------------------
• Café de especialidad
• Teclado mecánico silencioso
• Un MacBook con macOS 27`;

const TXT_APUNTES = `Apuntes — Historia de la informática

1984  Macintosh original
2001  Mac OS X 10.0 Cheetah
2025  macOS 26 Tahoe (Liquid Glass)
2026  axcsOS 1.0 — esta demo web 🍐`;

const ROOT: FsNode = {
  name: "Macintosh HD",
  type: "folder",
  children: [
    {
      name: "Escritorio",
      type: "folder",
      children: [
        { name: "LÉEME.txt", type: "txt", content: TXT_README, size: "1 KB" },
        { name: "Lista de la compra.txt", type: "txt", content: TXT_NOTAS, size: "1 KB" },
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
        { name: "Presupuesto.txt", type: "txt", content: "Ordenador nuevo: 2.199 €\nCafé: 12 €\nTotal: dormir menos, programar más.", size: "1 KB" },
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
    {
      name: "Aplicaciones",
      type: "folder",
      children: [], // built lazily from APPS (avoids import cycle at module evaluation)
    },
  ],
};

/** children for the Aplicaciones folder, resolved lazily */
function appsChildren(): FsNode[] {
  return APPS.filter((a) => a.showInLaunchpad !== false && a.id !== "finder").map((a) => ({
    name: `${a.name}.app`,
    type: "app" as NodeType,
    appId: a.id,
  }));
}

interface SideItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  path?: string[];
  action?: "trash" | "recents" | "airdrop";
}

const SIDEBAR: SideItem[] = [
  { id: "airdrop", label: "AirDrop", icon: Sparkles, action: "airdrop" },
  { id: "recents", label: "Recientes", icon: Clock, action: "recents" },
  { id: "apps", label: "Aplicaciones", icon: LayoutGrid, path: ["Aplicaciones"] },
  { id: "desktop", label: "Escritorio", icon: HardDrive, path: ["Escritorio"] },
  { id: "docs", label: "Documentos", icon: HardDrive, path: ["Documentos"] },
  { id: "downloads", label: "Descargas", icon: Download, path: ["Descargas"] },
  { id: "images", label: "Imágenes", icon: ImageIcon, path: ["Imágenes"] },
];

export default function FinderApp({ win }: AppProps) {
  const openApp = useOS((s) => s.openApp);
  const notify = useOS((s) => s.notify);
  const isTrash = win.payload?.location === "trash";

  const [stack, setStack] = useState<{ path: string[]; view: "grid" | "list" }[]>([
    { path: isTrash ? [] : win.payload?.path ? (win.payload.path as string[]) : ["Escritorio"], view: "grid" },
  ]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const current = stack[idx];
  const view = current.view;

  const setView = (v: "grid" | "list") =>
    setStack((s) => s.map((f, i) => (i === idx ? { ...f, view: v } : f)));

  const navigateTo = (path: string[]) => {
    setStack((s) => [...s.slice(0, idx + 1), { path, view: s[idx].view }]);
    setIdx((i) => i + 1);
    setSelected(null);
  };

  const items = useMemo<FsNode[]>(() => {
    if (isTrash) {
      return [
        { name: "captura-vieja.png", type: "image", image: "wallpapers/sonoma.png", size: "0,9 MB" },
        { name: "borrador.txt", type: "txt", content: "(vacío)", size: "1 KB" },
      ];
    }
    if (current.path.join("/") === "Aplicaciones") {
      return query.trim()
        ? appsChildren().filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
        : appsChildren();
    }
    let list: FsNode[] = current.path.length === 0 ? ROOT.children ?? [] : [];
    for (const seg of current.path) {
      const found = list.find((n) => n.name === seg && n.type === "folder");
      list = found?.children ?? [];
    }
    if (!query.trim()) return list;
    return list.filter((n) => n.name.toLowerCase().includes(query.toLowerCase()));
  }, [current.path, query, isTrash]);

  const open = (node: FsNode) => {
    if (node.type === "folder") navigateTo([...current.path, node.name]);
    else if (node.type === "txt")
      openApp("textedit", { title: node.name, payload: { fileName: node.name, content: node.content } });
    else if (node.type === "image")
      openApp("preview", { title: node.name, payload: { image: node.image, fileName: node.name } });
    else if (node.type === "app" && node.appId) openApp(node.appId);
  };

  const title = isTrash ? "Papelera" : current.path.length ? current.path[current.path.length - 1] : "Macintosh HD";

  const FileGlyph = ({ node, size = 48 }: { node: FsNode; size?: number }) => {
    if (node.type === "folder") return <FolderIcon className="shrink-0" />;
    if (node.type === "image")
      return (
        <div
          className="shrink-0 overflow-hidden rounded-md border border-black/10 shadow-sm dark:border-white/15"
          style={{ width: size, height: size * 0.75 }}
        >
          <img src={node.image} alt={node.name} className="h-full w-full object-cover" />
        </div>
      );
    if (node.type === "app") {
      const def = APPS.find((a) => a.id === node.appId);
      const Icon = def?.icon;
      if (!Icon) return <FolderIcon />;
      return <Icon className="shrink-0" />;
    }
    return (
      <div className="flex shrink-0 items-center justify-center rounded-lg border border-black/10 bg-gradient-to-b from-white to-neutral-100 shadow-sm dark:border-white/15 dark:from-neutral-800 dark:to-neutral-900" style={{ width: size, height: size * 0.78 }}>
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
          <path d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </div>
    );
  };

  return (
    <div className="flex h-full">
      {/* sidebar */}
      <div className="mac-scrollbar w-44 shrink-0 overflow-y-auto border-r border-black/8 bg-neutral-100/70 pt-1 backdrop-blur-2xl dark:border-white/8 dark:bg-neutral-900/60">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Favoritos
        </p>
        {SIDEBAR.map((item) => {
          const active = !isTrash && JSON.stringify(current.path) === JSON.stringify(item.path);
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.action === "airdrop")
                  notify("finder", "AirDrop", "Buscando dispositivos cercanos…");
                else if (item.action === "recents") navigateTo(["Documentos"]);
                else if (item.path) navigateTo(item.path);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-[5px] mx-2 text-[12px] ${
                active
                  ? "bg-[var(--accent-os)] text-white"
                  : "text-neutral-700 hover:bg-black/8 dark:text-neutral-200 dark:hover:bg-white/10"
              }`}
              style={{ width: "calc(100% - 16px)" }}
            >
              <item.icon size={13} className={active ? "text-white" : "text-[var(--accent-os)]"} />
              {item.label}
            </button>
          );
        })}
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Ubicaciones
        </p>
        <button
          onClick={() => navigateTo([])}
          className="mx-2 flex items-center gap-2 rounded-md px-2 py-[5px] text-[12px] text-neutral-700 hover:bg-black/8 dark:text-neutral-200 dark:hover:bg-white/10"
          style={{ width: "calc(100% - 16px)" }}
        >
          <HDIcon className="h-[18px] w-[18px]" /> Macintosh HD
        </button>
        <button
          onClick={() => notify("finder", "Papelera", "La Papelera se abre desde el Dock.")}
          className="mx-2 flex items-center gap-2 rounded-md px-2 py-[5px] text-[12px] text-neutral-700 hover:bg-black/8 dark:text-neutral-200 dark:hover:bg-white/10"
          style={{ width: "calc(100% - 16px)" }}
        >
          <Trash2 size={13} className="text-neutral-400" /> Papelera
        </button>
      </div>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col bg-white dark:bg-neutral-950">
        {/* toolbar */}
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/8 bg-neutral-50/80 px-3 backdrop-blur dark:border-white/8 dark:bg-neutral-900/70">
          <button
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/8 disabled:opacity-25 dark:hover:bg-white/10"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            disabled={idx >= stack.length - 1}
            onClick={() => setIdx((i) => Math.min(stack.length - 1, i + 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/8 disabled:opacity-25 dark:hover:bg-white/10"
          >
            <ChevronRight size={16} />
          </button>
          <h2 className="min-w-0 truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
            {title}
          </h2>
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 rounded-md p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`flex h-6 w-7 items-center justify-center rounded ${view === "grid" ? "bg-black/10 text-neutral-900 dark:bg-white/15 dark:text-white" : "text-neutral-400"}`}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex h-6 w-7 items-center justify-center rounded ${view === "list" ? "bg-black/10 text-neutral-900 dark:bg-white/15 dark:text-white" : "text-neutral-400"}`}
            >
              <List size={13} />
            </button>
          </div>
          <div className="flex h-7 w-36 items-center gap-1.5 rounded-md bg-black/5 px-2 dark:bg-white/10">
            <Search size={11} className="shrink-0 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              className="os-input h-full w-full bg-transparent text-[11px] outline-none placeholder:text-neutral-400 dark:text-neutral-200"
            />
          </div>
        </div>

        {/* content */}
        <div
          className="mac-scrollbar min-h-0 flex-1 overflow-y-auto p-4"
          onClick={() => setSelected(null)}
        >
          {view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-x-2 gap-y-5">
              {items.map((node) => (
                <button
                  key={node.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(node.name);
                  }}
                  onDoubleClick={() => open(node)}
                  className="flex flex-col items-center gap-1.5 px-1 py-1.5"
                >
                  <div className="flex h-12 items-end justify-center">
                    <FileGlyph node={node} />
                  </div>
                  <span
                    className={`line-clamp-2 rounded px-1.5 py-0.5 text-center text-[11px] leading-tight ${
                      selected === node.name
                        ? "bg-[var(--accent-os)] text-white"
                        : "text-neutral-700 dark:text-neutral-200"
                    }`}
                  >
                    {node.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-black/8 dark:border-white/10">
              <div className="flex items-center gap-3 border-b border-black/8 bg-black/[0.03] px-3 py-1.5 text-[11px] font-semibold text-neutral-500 dark:border-white/8 dark:bg-white/5">
                <span className="flex-1">Nombre</span>
                <span className="w-24 text-right">Tamaño</span>
                <span className="w-28 text-right">Tipo</span>
              </div>
              {items.map((node, i) => (
                <button
                  key={node.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(node.name);
                  }}
                  onDoubleClick={() => open(node)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-[12px] ${
                    selected === node.name
                      ? "bg-[var(--accent-os)] text-white"
                      : i % 2
                        ? "bg-black/[0.02] text-neutral-700 dark:bg-white/[0.03] dark:text-neutral-200"
                        : "text-neutral-700 dark:text-neutral-200"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center">
                    <span className="scale-[0.42] origin-center">
                      <FileGlyph node={node} size={26} />
                    </span>
                  </span>
                  <span className="flex-1 truncate text-left">{node.name}</span>
                  <span className="w-24 text-right text-[11px] opacity-70">{node.size ?? "--"}</span>
                  <span className="w-28 text-right text-[11px] opacity-70">
                    {node.type === "folder" ? "Carpeta" : node.type === "app" ? "Aplicación" : node.name.split(".").pop()?.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* status bar */}
        <div className="flex h-6 shrink-0 items-center justify-center border-t border-black/8 bg-neutral-50/80 text-[10.5px] text-neutral-400 dark:border-white/8 dark:bg-neutral-900/60">
          {items.length} elementos · 251,42 GB disponibles
        </div>
      </div>
    </div>
  );
}
