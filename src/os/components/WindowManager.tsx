"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useOS } from "../store";
import WindowFrame from "./WindowFrame";

export default function WindowManager() {
  const windows = useOS((s) => s.windows);
  const activeId = useOS((s) => s.activeId);
  const refitMaximized = useOS((s) => s.refitMaximized);
  const sorted = [...windows].sort((a, b) => a.z - b.z);
  const orderOf = (id: string) => sorted.findIndex((w) => w.id === id);

  // las ventanas maximizadas encajan de nuevo cuando cambia el tamaño del navegador
  useEffect(() => {
    const onResize = () => refitMaximized();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [refitMaximized]);

  return (
    <div className="absolute inset-0 z-[100] overflow-hidden">
      <AnimatePresence>
        {windows.map((win) => (
          <WindowFrame key={win.id} win={win} order={orderOf(win.id)} active={activeId === win.id} />
        ))}
      </AnimatePresence>
    </div>
  );
}
