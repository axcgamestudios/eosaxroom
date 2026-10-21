"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useOS } from "../store";
import { APPS } from "../registry";

export default function Launchpad() {
  const open = useOS((s) => s.launchpadOpen);
  const setLaunchpad = useOS((s) => s.setLaunchpad);
  const openApp = useOS((s) => s.openApp);
  const [q, setQ] = useState("");

  const apps = APPS.filter(
    (a) => a.showInLaunchpad !== false && (!q.trim() || a.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[4300] flex flex-col items-center"
          style={{ background: "rgba(20,20,24,0.35)", backdropFilter: "blur(45px) saturate(1.3)", WebkitBackdropFilter: "blur(45px) saturate(1.3)" }}
          onClick={() => setLaunchpad(false)}
        >
          <div className="mt-10 flex w-[280px] items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 ring-[0.5px] ring-white/20" onClick={(e) => e.stopPropagation()}>
            <Search size={13} className="text-white/60" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setLaunchpad(false)}
              placeholder="Buscar"
              className="os-input h-6 w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/50"
            />
          </div>
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.24, delay: 0.03, ease: [0.32, 0.72, 0, 1] }}
            className="mt-10 grid max-w-[900px] grid-cols-4 gap-x-12 gap-y-8 px-10 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7"
            onClick={(e) => e.stopPropagation()}
          >
            {apps.map((app, i) => (
              <motion.button
                key={app.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 + i * 0.022, duration: 0.25 }}
                onClick={() => {
                  openApp(app.id);
                  setLaunchpad(false);
                }}
                className="group flex w-[92px] flex-col items-center gap-2"
              >
                <app.icon className="h-[68px] w-[68px] drop-shadow-[0_6px_12px_rgba(0,0,0,0.3)] transition-transform duration-150 group-hover:scale-110 group-active:scale-95" />
                <span className="text-center text-[12px] font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                  {app.name}
                </span>
              </motion.button>
            ))}
          </motion.div>
          <p className="absolute bottom-24 text-[12px] text-white/50">Haz clic en cualquier app o pulsa Esc para salir</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
