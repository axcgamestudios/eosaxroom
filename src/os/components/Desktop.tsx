"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOS } from "../store";
import { AxcGamesIcon, DocIcon, FolderIcon, HDIcon, ImageDocIcon } from "../icons";
import { APPS } from "../registry";
import { useFs, listFolder, readFile, createFolder, createFile, renameNode, removeNode, type FsNode } from "../services/fs";

/* ============================================================
   Desktop — escritorio real de axcsOS
   ------------------------------------------------------------
   * Iconos con POSICIÓN LIBRE: arrastra cualquier icono y su
     posición se guarda (localStorage).
   * Clic derecho: crear carpetas y archivos .txt DE VERDAD
     (sistema de archivos compartido con Finder y TextEdit),
     y añadir apps al fondo de pantalla.
   * Renombrar y eliminar en el menú del icono (acciones reales).
   ============================================================ */

const DESKTOP_PATH = ["Escritorio"];
const POS_KEY = "axcsos-desktop-positions";
const PIN_KEY = "axcsos-desktop-apps";

type DItem =
  | { kind: "sys"; id: string; name: string; icon: React.ComponentType<{ className?: string }>; open: (openApp: ReturnType<typeof useOS.getState>["openApp"]) => void }
  | { kind: "app"; id: string; name: string; icon: React.ComponentType<{ className?: string }>; appId: string }
  | { kind: "folder"; id: string; name: string }
  | { kind: "txt"; id: string; name: string }
  | { kind: "image"; id: string; name: string; image?: string };

interface Pos {
  x: number;
  y: number;
}

function loadPositions(): Record<string, Pos> {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "{}") as Record<string, Pos>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function loadPinnedApps(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return ["axcgames"]; // valor por defecto: AXCGAMES en el escritorio
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return ["axcgames"];
  }
}

const clampPos = (p: Pos): Pos => ({
  x: Math.max(6, Math.min(p.x, window.innerWidth - 92)),
  y: Math.max(34, Math.min(p.y, window.innerHeight - 128)),
});

export default function Desktop() {
  const openApp = useOS((s) => s.openApp);
  const stage = useOS((s) => s.stage);
  const notify = useOS((s) => s.notify);
  const fsTree = useFs(); // re-renderiza al mutar el sistema de archivos

  const [selected, setSelected] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [itemCtx, setItemCtx] = useState<{ x: number; y: number; item: DItem } | null>(null);
  const [addAppsOpen, setAddAppsOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [positions, setPositions] = useState<Record<string, Pos>>(() => (typeof window === "undefined" ? {} : loadPositions()));
  const [pinnedApps, setPinnedApps] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadPinnedApps()));

  /* ------- arrastre libre (pointer events) ------- */
  const dragRef = useRef<{ id: string; startPx: number; startPy: number; origX: number; origY: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const close = () => {
      setCtx(null);
      setItemCtx(null);
      setSelected(null);
      setAddAppsOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  /* ------- elementos del escritorio ------- */
  const items = useMemo<DItem[]>(() => {
    const sys: DItem[] = [
      {
        kind: "sys",
        id: "sys:hd",
        name: "Macintosh HD",
        icon: HDIcon,
        open: (oa) => oa("finder", { title: "Macintosh HD", payload: { path: [] } }),
      },
      {
        kind: "sys",
        id: "sys:docs",
        name: "Documentos",
        icon: FolderIcon,
        open: (oa) => oa("finder", { title: "Documentos", payload: { path: ["Documentos"] } }),
      },
    ];
    const apps: DItem[] = pinnedApps
      .map((appId) => APPS.find((a) => a.id === appId))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ kind: "app" as const, id: `app:${a.id}`, name: a.name, icon: a.icon, appId: a.id }));
    const fsItems: DItem[] = listFolder(DESKTOP_PATH).map((n: FsNode) =>
      n.type === "folder"
        ? { kind: "folder" as const, id: `folder:${n.name}`, name: n.name }
        : n.type === "image"
          ? { kind: "image" as const, id: `image:${n.name}`, name: n.name, image: n.image }
          : { kind: "txt" as const, id: `txt:${n.name}`, name: n.name },
    );
    return [...sys, ...apps, ...fsItems];
  }, [pinnedApps, fsTree]);

  if (stage !== "desktop") return null;

  /* renombrar: solo nodos reales del FS; eliminar: todo menos los accesos del sistema */
  const canRename = (item: DItem) => item.kind === "folder" || item.kind === "txt" || item.kind === "image";
  const canDelete = (item: DItem) => item.kind !== "sys";

  /* ------- posiciones: guardadas o auto-rejilla a la derecha ------- */
  const posFor = (item: DItem, index: number): Pos => {
    const saved = positions[item.id];
    if (saved) return clampPos(saved);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const perCol = Math.max(1, Math.floor((vh - 60) / 92));
    const col = Math.floor(index / perCol);
    const row = index % perCol;
    return clampPos({ x: vw - 96 - col * 96, y: 44 + row * 92 });
  };

  const savePosition = (id: string, p: Pos) => {
    const next = { ...positions, [id]: p };
    setPositions(next);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      /* sin cuota: la posición vive en memoria esta sesión */
    }
  };

  /* ------- abrir elementos ------- */
  const openItem = (item: DItem) => {
    if (item.kind === "sys") return item.open(openApp);
    if (item.kind === "app") return openApp(item.appId);
    if (item.kind === "folder")
      return openApp("finder", { title: item.name, payload: { path: [...DESKTOP_PATH, item.name] } });
    if (item.kind === "txt") {
      const node = readFile(DESKTOP_PATH, item.name);
      return openApp("textedit", {
        title: item.name,
        payload: { fileName: item.name, content: node?.content ?? "", folderPath: DESKTOP_PATH },
      });
    }
    if (item.kind === "image") return openApp("preview", { title: item.name, payload: { image: item.image, fileName: item.name } });
  };

  /* ------- acciones del menú contextual ------- */
  const newFolder = () => {
    const name = createFolder(DESKTOP_PATH);
    if (name) {
      setSelected(`folder:${name}`);
      setRenaming(`folder:${name}`);
      setRenameText(name);
      notify("finder", "Carpeta creada", `“${name}” está en el escritorio y en Finder → Escritorio.`);
    }
  };

  const newTextFile = () => {
    const name = createFile(DESKTOP_PATH, "sin título.txt", "");
    if (name) {
      setSelected(`txt:${name}`);
      setRenaming(`txt:${name}`);
      setRenameText(name);
    }
  };

  const pinApp = (appId: string) => {
    if (pinnedApps.includes(appId)) return;
    const next = [...pinnedApps, appId];
    setPinnedApps(next);
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(next));
    } catch {
      /* memoria de sesión */
    }
    const def = APPS.find((a) => a.id === appId);
    notify("finder", "App en el escritorio", `“${def?.name ?? appId}” se añadió al fondo. Arrástrala donde quieras.`);
  };

  const unpinApp = (appId: string) => {
    const next = pinnedApps.filter((x) => x !== appId);
    setPinnedApps(next);
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(next));
    } catch {
      /* memoria de sesión */
    }
  };

  const commitRename = () => {
    if (!renaming) return;
    const id = renaming;
    setRenaming(null);
    const name = id.slice(id.indexOf(":") + 1);
    const finalName = renameText.trim();
    if (!finalName || finalName === name) return;
    const result = renameNode(DESKTOP_PATH, name, finalName);
    if (result) setSelected(id.startsWith("folder:") ? `folder:${result}` : `txt:${result}`);
  };

  const deleteItem = (item: DItem) => {
    if (item.kind === "folder" || item.kind === "txt" || item.kind === "image") {
      if (removeNode(DESKTOP_PATH, item.name)) {
        setSelected(null);
        notify("finder", "Eliminado", `“${item.name}” se eliminó del escritorio.`);
      }
    } else if (item.kind === "app") {
      unpinApp(item.appId);
      setSelected(null);
      notify("finder", "Quitada del escritorio", `“${item.name}” ya no está en el fondo (sigue en el Dock y Launchpad).`);
    }
  };

  const sortByGrid = () => {
    setPositions({});
    try {
      localStorage.removeItem(POS_KEY);
    } catch {
      /* ignore */
    }
    notify("finder", "Escritorio", "Iconos reordenados por rejilla.");
  };

  /* ------- icono según tipo ------- */
  const Glyph = ({ item }: { item: DItem }) => {
    if (item.kind === "sys" || item.kind === "app") {
      const Icon = item.icon;
      return <Icon className="h-[52px] w-[52px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />;
    }
    if (item.kind === "folder")
      return <FolderIcon className="h-[52px] w-[52px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />;
    if (item.kind === "image")
      return <ImageDocIcon className="h-[52px] w-[52px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />;
    return <DocIcon className="h-[52px] w-[52px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />;
  };

  const pinnableApps = APPS.filter((a) => a.showInLaunchpad !== false && a.id !== "finder");

  return (
    <div
      className="absolute inset-0 z-10"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-desktop-item]")) return;
        e.preventDefault();
        setItemCtx(null);
        setCtx({ x: e.clientX, y: e.clientY });
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSelected(null);
      }}
    >
      {/* iconos con posición libre */}
      {items.map((item, i) => {
        const base = posFor(item, i);
        const isDragging = dragging?.id === item.id;
        const pos = isDragging ? { x: dragging.x, y: dragging.y } : base;
        const isRenamingThis = renaming === item.id;
        return (
          <div
            key={item.id}
            data-desktop-item
            className="absolute flex w-[86px] touch-none select-none flex-col items-center gap-1 rounded-lg px-1 py-1.5"
            style={{
              left: pos.x,
              top: pos.y,
              zIndex: isDragging ? 50 : 1,
              cursor: isDragging ? "grabbing" : "default",
              transition: isDragging ? "none" : "opacity 0.12s",
              opacity: isDragging ? 0.85 : 1,
            }}
            onPointerDown={(e) => {
              if (e.button !== 0 || isRenamingThis) return;
              dragRef.current = { id: item.id, startPx: e.clientX, startPy: e.clientY, origX: pos.x, origY: pos.y, moved: false };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              if (!d || d.id !== item.id) return;
              const dx = e.clientX - d.startPx;
              const dy = e.clientY - d.startPy;
              if (!d.moved && Math.hypot(dx, dy) < 5) return;
              d.moved = true;
              setDragging({ id: item.id, ...clampPos({ x: d.origX + dx, y: d.origY + dy }) });
            }}
            onPointerUp={() => {
              const d = dragRef.current;
              dragRef.current = null;
              if (!d || d.id !== item.id) return;
              if (d.moved && dragging?.id === item.id) {
                savePosition(item.id, { x: dragging.x, y: dragging.y });
              }
              setDragging(null);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDragging(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(item.id);
            }}
            onDoubleClick={() => openItem(item)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCtx(null);
              setSelected(item.id);
              setItemCtx({ x: e.clientX, y: e.clientY, item });
            }}
          >
            <div className={`rounded-xl p-1 transition ${selected === item.id ? "bg-white/25" : "bg-white/0"}`}>
              <Glyph item={item} />
            </div>
            {isRenamingThis ? (
              <input
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={commitRename}
                className="w-[84px] rounded-[6px] border border-[var(--accent-os)] bg-white px-1 py-[1px] text-center text-[11.5px] font-medium leading-tight text-neutral-900 outline-none"
              />
            ) : (
              <span
                className={`max-w-full truncate rounded-[6px] px-1.5 py-[1px] text-[11.5px] font-medium leading-tight text-white ${
                  selected === item.id
                    ? "bg-[var(--accent-os)]"
                    : "[text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_6px_rgba(0,0,0,0.55)]"
                }`}
              >
                {item.name}
              </span>
            )}
          </div>
        );
      })}

      {/* menú contextual del escritorio */}
      <AnimatePresence>
        {ctx && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
            className="glass lg-specular fixed z-[4600] min-w-[230px] rounded-lg p-1 text-[13px] text-neutral-900 shadow-xl"
            style={{
              left: Math.min(ctx.x, window.innerWidth - 250),
              top: Math.min(ctx.y, window.innerHeight - 340),
              transformOrigin: "top left",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="mac-menu-item w-full px-2.5 py-[3.5px] text-left" onClick={newFolder}>
              Nueva carpeta
            </button>
            <button className="mac-menu-item w-full px-2.5 py-[3.5px] text-left" onClick={newTextFile}>
              Nuevo documento de texto
            </button>
            <div className="mx-2.5 my-1 h-[0.5px] bg-black/12" />
            <button
              className="mac-menu-item flex w-full items-center justify-between px-2.5 py-[3.5px] text-left"
              onClick={() => setAddAppsOpen((v) => !v)}
            >
              Añadir app al escritorio <span className="text-[10px] text-neutral-400">{addAppsOpen ? "▲" : "▼"}</span>
            </button>
            {addAppsOpen && (
              <div className="mac-scrollbar my-1 max-h-44 overflow-y-auto rounded-md bg-black/[0.04] p-0.5 dark:bg-white/[0.06]">
                {pinnableApps.map((a) => {
                  const pinned = pinnedApps.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      disabled={pinned}
                      onClick={() => {
                        pinApp(a.id);
                        setAddAppsOpen(false);
                        setCtx(null);
                      }}
                      className={`mac-menu-item flex w-full items-center gap-2 rounded px-2 py-[3px] text-left text-[12px] ${
                        pinned ? "opacity-40" : ""
                      }`}
                    >
                      <a.icon className="h-4 w-4" /> {a.name} {pinned ? "· ya está" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mx-2.5 my-1 h-[0.5px] bg-black/12" />
            <button
              className="mac-menu-item w-full px-2.5 py-[3.5px] text-left"
              onClick={() => notify("finder", "Información", "axcsOS 1.0 · Z1 Silicon · 16 GB")}
            >
              Obtener información
            </button>
            <button className="mac-menu-item w-full px-2.5 py-[3.5px] text-left" onClick={() => openApp("settings")}>
              Cambiar fondo de escritorio…
            </button>
            <button className="mac-menu-item w-full px-2.5 py-[3.5px] text-left" onClick={() => openApp("settings")}>
              Ajustes del Dock…
            </button>
            <div className="mx-2.5 my-1 h-[0.5px] bg-black/12" />
            <button className="mac-menu-item w-full px-2.5 py-[3.5px] text-left" onClick={sortByGrid}>
              Reordenar iconos por rejilla
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* menú contextual del icono */}
      <AnimatePresence>
        {itemCtx && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
            className="glass lg-specular fixed z-[4600] min-w-[190px] rounded-lg p-1 text-[13px] text-neutral-900 shadow-xl"
            style={{
              left: Math.min(itemCtx.x, window.innerWidth - 210),
              top: Math.min(itemCtx.y, window.innerHeight - 200),
              transformOrigin: "top left",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="mac-menu-item w-full px-2.5 py-[3.5px] text-left"
              onClick={() => {
                openItem(itemCtx.item);
                setItemCtx(null);
              }}
            >
              Abrir
            </button>
            {itemCtx.item.kind === "txt" && (
              <button
                className="mac-menu-item w-full px-2.5 py-[3.5px] text-left"
                onClick={() => {
                  openItem(itemCtx.item);
                  setItemCtx(null);
                }}
              >
                Abrir con TextEdit
              </button>
            )}
            {canRename(itemCtx.item) && (
              <button
                className="mac-menu-item w-full px-2.5 py-[3.5px] text-left"
                onClick={() => {
                  setRenaming(itemCtx.item.id);
                  setRenameText(itemCtx.item.name);
                  setItemCtx(null);
                }}
              >
                Renombrar
              </button>
            )}
            {canDelete(itemCtx.item) && (
              <>
                <div className="mx-2.5 my-1 h-[0.5px] bg-black/12" />
                <button
                  className="mac-menu-item w-full px-2.5 py-[3.5px] text-left text-red-600 dark:text-red-400"
                  onClick={() => {
                    deleteItem(itemCtx.item);
                    setItemCtx(null);
                  }}
                >
                  {itemCtx.item.kind === "app" ? "Quitar del escritorio" : "Eliminar"}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
