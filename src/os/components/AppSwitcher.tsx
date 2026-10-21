"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOS } from "../store";
import { getAppDef } from "../registry";

export default function AppSwitcher() {
  const open = useOS((s) => s.switcherOpen);
  const setSwitcher = useOS((s) => s.setSwitcher);
  const windows = useOS((s) => s.windows);
  const focusWindow = useOS((s) => s.focusWindow);
  const [idx, setIdx] = useState(0);

  const running = Array.from(new Set(windows.map((w) => w.appId)));

  // order apps by most recent window z
  const ordered = running
    .map((id) => {
      const maxZ = Math.max(0, ...windows.filter((w) => w.appId === id).map((w) => w.z));
      return { id, maxZ };
    })
    .sort((a, b) => b.maxZ - a.maxZ)
    .map((a) => a.id);

  const cur = ordered.length > 0 ? idx % ordered.length : 0;

  // cycle while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIdx((i) => (i + 1) % Math.max(1, ordered.length));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, ordered.length]);

  // commit selection on cmd release
  useEffect(() => {
    if (!open) return;
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        const appId = ordered[cur];
        if (appId) {
          const target = windows
            .filter((w) => w.appId === appId)
            .sort((a, b) => b.z - a.z)[0];
          if (target) focusWindow(target.id);
        }
        setSwitcher(false);
      }
    };
    window.addEventListener("keyup", onUp, true);
    return () => window.removeEventListener("keyup", onUp, true);
  }, [open, cur, ordered, windows, focusWindow, setSwitcher]);

  return (
    <AnimatePresence>
      {open && ordered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.14 }}
          className="fixed left-1/2 top-[38%] z-[5600] -translate-x-1/2"
        >
          <div className="glass lg-specular relative flex items-center gap-3 rounded-3xl p-4 shadow-2xl">
            {ordered.map((appId, i) => {
              const def = getAppDef(appId);
              if (!def) return null;
              const Icon = def.icon;
              return (
                <div key={appId} className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-[64px] w-[64px] items-center justify-center rounded-2xl transition ${
                      i === cur ? "bg-white/35 ring-2 ring-white/70 dark:bg-white/20" : ""
                    }`}
                  >
                    <Icon className="h-[52px] w-[52px]" />
                  </div>
                  {i === cur && (
                    <span className="absolute -bottom-6 whitespace-nowrap text-[12px] font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                      {def.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
