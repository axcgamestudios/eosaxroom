"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { WindowState } from "../types";
import { useOS } from "../store";
import { getAppDef } from "../registry";

const MENUBAR_H = 30;

function TrafficLight({
  color,
  inactive,
  onClick,
  label,
  glyph,
}: {
  color: string;
  inactive: boolean;
  onClick: () => void;
  label: string;
  glyph: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="traffic-lights flex h-[12px] w-[12px] items-center justify-center rounded-full transition-colors"
      style={{
        background: inactive ? "rgba(140,140,148,0.45)" : color,
        boxShadow: inactive ? "none" : "inset 0 0 0 0.5px rgba(0,0,0,0.12)",
      }}
    >
      <span className="traffic-glyph flex h-full w-full items-center justify-center text-[9px] font-bold leading-none text-black/55">
        {glyph}
      </span>
    </button>
  );
}

const XGlyph = (
  <svg viewBox="0 0 10 10" width="7" height="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M2 2l6 6M8 2L2 8" />
  </svg>
);
const MinGlyph = (
  <svg viewBox="0 0 10 10" width="8" height="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M2 5h6" />
  </svg>
);
const ZoomGlyph = (
  <svg viewBox="0 0 10 10" width="7" height="7" fill="currentColor">
    <path d="M1 6.5L6.5 1H1v5.5z" />
    <path d="M9 3.5L3.5 9H9V3.5z" opacity="0.9" />
  </svg>
);

type DragState = { startX: number; startY: number; winX: number; winY: number };
type ResizeState = {
  mode: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export default function WindowFrame({
  win,
  order,
  active,
}: {
  win: WindowState;
  order: number;
  active: boolean;
}) {
  const def = getAppDef(win.appId);
  const closeWindow = useOS((s) => s.closeWindow);
  const minimizeWindow = useOS((s) => s.minimizeWindow);
  const zoomWindow = useOS((s) => s.zoomWindow);
  const focusWindow = useOS((s) => s.focusWindow);
  const setWindowRect = useOS((s) => s.setWindowRect);
  const drag = useRef<DragState | null>(null);
  const resize = useRef<ResizeState | null>(null);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  /* ---- pantalla completa 100% (API nativa del navegador) ----
     El botón verde lleva la ventana a pantalla TOTAL del dispositivo:
     cubre barra de menú, dock y el propio navegador. Esc o el botón
     verde de nuevo devuelven la ventana a su tamaño anterior. */
  useEffect(() => {
    const onFsChange = () => setIsFs(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleNativeFullscreen = async () => {
    try {
      if (document.fullscreenElement === frameRef.current) {
        await document.exitFullscreen();
      } else {
        await frameRef.current?.requestFullscreen();
      }
    } catch {
      // navegadores que lo bloqueen: comportamiento clásico de zoom
      zoomWindow(win.id);
    }
  };

  const minW = def?.minSize?.w ?? 300;
  const minH = def?.minSize?.h ?? 200;
  const dockTargetY =
    typeof window !== "undefined" ? window.innerHeight - win.y - win.h / 2 : 400;

  /* ---- drag ---- */
  const onTitlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input,select,textarea")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, winX: win.x, winY: win.y };
    setDragging(true);
    focusWindow(win.id);
  };
  const onTitlePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const nx = d.winX + (e.clientX - d.startX);
    const ny = Math.max(MENUBAR_H, d.winY + (e.clientY - d.startY));
    setWindowRect(win.id, { x: nx, y: ny });
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  /* ---- resize ---- */
  const onResizeDown = (mode: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      x: win.x,
      y: win.y,
      w: win.w,
      h: win.h,
    };
    focusWindow(win.id);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resize.current;
    if (!r) return;
    e.preventDefault();
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    let { x, y, w, h } = r;
    if (r.mode.includes("e")) w = Math.max(minW, r.w + dx);
    if (r.mode.includes("s")) h = Math.max(minH, r.h + dy);
    if (r.mode.includes("w")) {
      const nw = Math.max(minW, r.w - dx);
      x = r.x + (r.w - nw);
      w = nw;
    }
    if (r.mode.includes("n")) {
      const nh = Math.max(minH, r.h - dy);
      y = Math.max(MENUBAR_H, r.y + (r.h - nh));
      h = nh;
    }
    setWindowRect(win.id, { x, y, w, h });
  };
  const endResize = () => {
    resize.current = null;
  };

  useEffect(() => {
    // clear captures if window unmounts mid-drag
    return () => {
      drag.current = null;
      resize.current = null;
    };
  }, []);

  const Body = def?.component;

  const handles = useMemo(
    () =>
      [
        ["n", "top-0 left-3 right-3 h-[5px] cursor-ns-resize"],
        ["s", "bottom-0 left-3 right-3 h-[5px] cursor-ns-resize"],
        ["w", "left-0 top-3 bottom-3 w-[5px] cursor-ew-resize"],
        ["e", "right-0 top-3 bottom-3 w-[5px] cursor-ew-resize"],
        ["nw", "left-0 top-0 h-3 w-3 cursor-nwse-resize"],
        ["ne", "right-0 top-0 h-3 w-3 cursor-nesw-resize"],
        ["sw", "left-0 bottom-0 h-3 w-3 cursor-nesw-resize"],
        ["se", "right-0 bottom-0 h-3 w-3 cursor-nwse-resize"],
      ] as const,
    []
  );

  return (
    <motion.div
      ref={frameRef}
      initial={{ opacity: 0, scale: 0.92, y: 18 }}
      animate={{
        opacity: win.minimized ? 0 : 1,
        scale: win.minimized ? 0.14 : 1,
        y: win.minimized ? dockTargetY : 0,
      }}
      exit={{ opacity: 0, scale: 0.94, y: 12 }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      className="absolute"
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: 100 + order,
        pointerEvents: win.minimized ? "none" : "auto",
      }}
      onPointerDown={() => !active && focusWindow(win.id)}
    >
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-white dark:bg-[#1e1e21] ${
          isFs ? "rounded-none" : "rounded-xl"
        } ${active || isFs ? "win-shadow" : "win-shadow-inactive"} ${dragging ? "cursor-grabbing" : ""}`}
      >
        {/* title bar */}
        <div
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => zoomWindow(win.id)}
          className={`relative flex h-10 shrink-0 items-center gap-2 border-b px-3.5 ${
            active
              ? "border-black/8 bg-[#f6f6f7]/90 dark:border-white/8 dark:bg-[#2a2a2d]/90"
              : "border-black/6 bg-[#f0f0f1]/90 dark:border-white/6 dark:bg-[#242427]/90"
          } backdrop-blur-2xl`}
        >
          <div className="flex items-center gap-[8px]">
            <TrafficLight
              color="#ff5f57"
              inactive={!active}
              onClick={() => closeWindow(win.id)}
              label="Cerrar"
              glyph={XGlyph}
            />
            <TrafficLight
              color="#febc2e"
              inactive={!active}
              onClick={() => minimizeWindow(win.id)}
              label="Minimizar"
              glyph={MinGlyph}
            />
            <TrafficLight
              color="#28c840"
              inactive={!active}
              onClick={() => void toggleNativeFullscreen()}
              label={isFs ? "Salir de pantalla completa" : "Pantalla completa"}
              glyph={ZoomGlyph}
            />
          </div>
          <span
            className={`pointer-events-none absolute inset-x-0 text-center text-[13px] font-semibold ${
              active
                ? "text-neutral-700 dark:text-neutral-200"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {win.title}
          </span>
        </div>

        {/* content */}
        <div className="relative min-h-0 flex-1 dark:bg-neutral-950">
          {Body ? <Body win={win} /> : null}
        </div>
      </div>

      {/* resize handles */}
      {!win.maximized && !isFs &&
        handles.map(([mode, cls]) => (
          <div
            key={mode}
            onPointerDown={onResizeDown(mode)}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className={`absolute z-10 ${cls}`}
          />
        ))}
    </motion.div>
  );
}
