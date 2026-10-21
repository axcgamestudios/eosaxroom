"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOS } from "../store";
import { AxcGamesIcon, DocIcon, FolderIcon, HDIcon } from "../icons";

interface DesktopItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  onOpen: (openApp: ReturnType<typeof useOS.getState>["openApp"]) => void;
}

const ITEMS: DesktopItem[] = [
  {
    id: "hd",
    name: "Macintosh HD",
    icon: HDIcon,
    onOpen: (openApp) => openApp("finder", { title: "Macintosh HD", payload: { path: [] } }),
  },
  {
    id: "docs",
    name: "Documentos",
    icon: FolderIcon,
    onOpen: (openApp) => openApp("finder", { title: "Documentos", payload: { path: ["Documentos"] } }),
  },
  {
    id: "axc",
    name: "AXCGAMES",
    icon: AxcGamesIcon,
    onOpen: (openApp) => openApp("axcgames"),
  },
  {
    id: "leeme",
    name: "LÉEME.txt",
    icon: DocIcon,
    onOpen: (openApp) =>
      openApp("textedit", {
        title: "LÉEME.txt",
        payload: {
          fileName: "LÉEME.txt",
          content:
            "Bienvenido a axcsOS 1.0 “Liquid Glass”.\n\nPara empezar:\n• AXCGAMES está en el Dock — 21+ juegos gratis\n• ⌘Espacio abre Spotlight\n• Clic derecho en el escritorio para más opciones\n• Ajustes del Sistema para cambiar el fondo\n\nDisfruta del sistema. 🍐",
        },
      }),
  },
];

export default function Desktop() {
  const openApp = useOS((s) => s.openApp);
  const stage = useOS((s) => s.stage);
  const notify = useOS((s) => s.notify);
  const [selected, setSelected] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const close = () => {
      setCtx(null);
      setSelected(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  if (stage !== "desktop") return null;

  return (
    <div
      className="absolute inset-0 z-10"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-desktop-item]")) return;
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY });
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSelected(null);
      }}
    >
      {/* context menu */}
      <AnimatePresence>
        {ctx && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
            className="glass lg-specular fixed z-[4600] min-w-[220px] rounded-lg p-1 text-[13px] text-neutral-900 shadow-xl"
            style={{
              left: Math.min(ctx.x, (typeof window !== "undefined" ? window.innerWidth : 1440) - 240),
              top: Math.min(ctx.y, (typeof window !== "undefined" ? window.innerHeight : 900) - 260),
              transformOrigin: "top left",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: "Nueva carpeta", action: () => notify("finder", "Nueva carpeta", "Las carpetas del escritorio no se guardan en la demo.") },
              { label: "Obtener información", action: () => notify("finder", "Información", "axcsOS 1.0 · Z1 Silicon · 16 GB") },
              { sep: true },
              { label: "Cambiar fondo de escritorio…", action: () => openApp("settings") },
              { label: "Ajustes del Dock…", action: () => openApp("settings") },
              { sep: true },
              { label: "Usar pilas", action: () => notify("finder", "Pilas", "Pilas activadas en el escritorio.") },
              { label: "Ordenar por nombre", action: () => notify("finder", "Escritorio", "Iconos ordenados por nombre.") },
            ].map((item, i) =>
              "sep" in item ? (
                <div key={i} className="mx-2.5 my-1 h-[0.5px] bg-black/12" />
              ) : (
                <button
                  key={i}
                  onClick={() => {
                    item.action?.();
                    setCtx(null);
                  }}
                  className="mac-menu-item w-full px-2.5 py-[3.5px] text-left"
                >
                  {item.label}
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* icons column */}
      <div className="pointer-events-none absolute right-3 top-9 flex flex-col items-end gap-1">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            data-desktop-item
            className="pointer-events-auto flex w-[86px] flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(item.id);
            }}
            onDoubleClick={() => item.onOpen(openApp)}
          >
            <div
              className={`rounded-xl p-1 transition ${
                selected === item.id ? "bg-white/25" : "bg-white/0"
              }`}
            >
              <item.icon className="h-[52px] w-[52px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
            </div>
            <span
              className={`max-w-full truncate rounded-[6px] px-1.5 py-[1px] text-[11.5px] font-medium leading-tight text-white ${
                selected === item.id
                  ? "bg-[var(--accent-os)]"
                  : "[text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_6px_rgba(0,0,0,0.55)]"
              }`}
            >
              {item.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
