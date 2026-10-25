"use client";

import { useEffect, useState } from "react";
import { useOS } from "../store";
import { PearLogo } from "../icons";

/* Arranque del sistema: logo + barra de progreso.
   Sin cuentas no hay sesión que restaurar: al terminar va directo
   a la pantalla de inicio (entras escribiendo cualquier cosa). */
export default function BootScreen() {
  const finishBoot = useOS((s) => s.finishBoot);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const dur = 2600;
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / dur) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(t);
        setTimeout(() => finishBoot(), 320);
      }
    }, 40);
    return () => clearInterval(t);
  }, [finishBoot]);

  return (
    <div className="fixed inset-0 z-[7000] flex flex-col items-center justify-center gap-8 bg-black">
      <PearLogo className="h-[120px] w-[66px] text-white" />
      <div className="h-[5px] w-[190px] overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
