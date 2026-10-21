"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";
import { useOS } from "../store";
import { APPS } from "../registry";
import { DocIcon, ImageDocIcon } from "../icons";

function tryMath(q: string): string | null {
  const cleaned = q.replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
  if (!/^[\d\s+\-*/().]+$/.test(cleaned)) return null;
  if (!/[\d]/.test(cleaned) || !/[+\-*/]/.test(cleaned)) return null;
  try {
    const r = Function(`"use strict";return (${cleaned})`)() as unknown;
    if (typeof r === "number" && isFinite(r)) return String(Math.round(r * 1e10) / 1e10);
  } catch {
    return null;
  }
  return null;
}

interface ResultItem {
  id: string;
  title: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

function SpotlightPanel({ onClose }: { onClose: () => void }) {
  const openApp = useOS((s) => s.openApp);
  const notes = useOS((s) => s.notes);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const results = useMemo<ResultItem[]>(() => {
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    const list: ResultItem[] = [];
    APPS.filter((a) => a.showInLaunchpad !== false && a.name.toLowerCase().includes(lower))
      .slice(0, 5)
      .forEach((a) =>
        list.push({ id: `app-${a.id}`, title: a.name, sub: "Aplicación", icon: a.icon, run: () => openApp(a.id) })
      );
    notes
      .filter((n) => n.title.toLowerCase().includes(lower) || n.content.toLowerCase().includes(lower))
      .slice(0, 3)
      .forEach((n) =>
        list.push({
          id: `note-${n.id}`,
          title: n.title || "Sin título",
          sub: "Nota · " + new Date(n.updatedAt).toLocaleDateString("es-ES"),
          icon: DocIcon,
          run: () => openApp("notes"),
        })
      );
    list.push({
      id: "web",
      title: `Buscar «${q}» en la web`,
      sub: "Búsqueda web",
      icon: ImageDocIcon,
      run: () =>
        openApp("safari", { payload: { url: `https://www.bing.com/search?q=${encodeURIComponent(q)}` } }),
    });
    return list;
  }, [q, notes, openApp]);

  const math = useMemo(() => (q.trim() ? tryMath(q) : null), [q]);

  // reset selection when query changes (derived-state pattern)
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setSel(0);
  }

  const total = (math ? 1 : 0) + results.length;

  const activate = (i: number) => {
    if (math && i === 0) {
      navigator.clipboard?.writeText(math).catch(() => {});
      onClose();
      return;
    }
    const item = results[i - (math ? 1 : 0)];
    item?.run();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[4990]" onMouseDown={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="glass lg-specular fixed left-1/2 top-[22%] z-[5000] w-[min(92vw,620px)] -translate-x-1/2 overflow-hidden rounded-2xl text-neutral-900 shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(total - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            activate(sel);
          } else if (e.key === "Escape") {
            onClose();
          }
        }}
      >
        <div className="flex h-[54px] items-center gap-3 px-5">
          <Search size={20} className="shrink-0 text-neutral-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Búsqueda en Spotlight"
            className="os-input h-full w-full bg-transparent text-[19px] font-light text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
          />
        </div>

        {(math || (q.trim() && results.length > 0)) && (
          <div className="mac-scrollbar max-h-[340px] overflow-y-auto border-t border-black/8 p-1.5">
            {math && (
              <button
                onClick={() => activate(0)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 ${
                  sel === 0 ? "bg-[var(--accent-os)] text-white" : "hover:bg-black/6"
                }`}
              >
                <span className="flex items-baseline gap-2 text-[15px] font-light">
                  {q} <span className="text-neutral-400">=</span>
                </span>
                <span className="flex items-center gap-2 text-[24px] font-semibold tabular-nums">{math}</span>
              </button>
            )}
            {results.map((r, i) => {
              const idx = (math ? 1 : 0) + i;
              return (
                <button
                  key={r.id}
                  onClick={() => activate(idx)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                    sel === idx ? "bg-[var(--accent-os)] text-white" : "hover:bg-black/6"
                  }`}
                >
                  <r.icon className="h-8 w-8 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{r.title}</span>
                    <span className={`block truncate text-[11px] ${sel === idx ? "text-white/70" : "text-neutral-400"}`}>
                      {r.sub}
                    </span>
                  </span>
                  {sel === idx && <ArrowRight size={14} className="text-white/70" />}
                </button>
              );
            })}
          </div>
        )}
      </motion.div>
    </>
  );
}

export default function Spotlight() {
  const open = useOS((s) => s.spotlightOpen);
  const setSpotlight = useOS((s) => s.setSpotlight);
  if (!open) return null;
  return <SpotlightPanel onClose={() => setSpotlight(false)} />;
}
