"use client";

import { useEffect, useState } from "react";
import { useOS } from "../store";
import { PearLogo } from "../icons";
import { fetchAccounts } from "../services/auth";
import { clearStaySession, readStaySession } from "../services/axcid";

export default function BootScreen() {
  const finishBoot = useOS((s) => s.finishBoot);
  const login = useOS((s) => s.login);
  const [progress, setProgress] = useState(0);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // ¿hay sesión persistente (cookie AXC ID verificada)? → entrar directo al escritorio
    const tryStay = async () => {
      let stay: Awaited<ReturnType<typeof readStaySession>> = null;
      try {
        stay = await readStaySession();
      } catch {
        stay = null;
      }
      if (cancelled) return;
      if (!stay) {
        finishBoot();
        return;
      }
      setRestoring(true);
      try {
        const accounts = await Promise.race([
          fetchAccounts(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
        ]);
        if (cancelled) return;
        const acc = accounts.find((a) => a.id === stay!.a && a.username === stay!.u);
        if (!acc) {
          // la cuenta ya no existe (la borraron en GitHub): no se recuerda más
          clearStaySession();
          finishBoot();
          return;
        }
        login({ id: acc.id, username: acc.username });
        // el mismo token de la cookie: las demás pestañas de ESTE dispositivo no se expulsan
        const { startSessionGuard } = await import("../services/auth");
        void startSessionGuard(acc.id, stay.t, (detail) => {
          useOS.getState().logoutFromKick(detail);
        });
      } catch {
        // sin conexión con GitHub ahora: pantalla de login (la cookie se conserva)
        if (!cancelled) finishBoot();
      }
    };

    const start = Date.now();
    const dur = 2600;
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / dur) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(t);
        setTimeout(() => void tryStay(), 320);
      }
    }, 40);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [finishBoot, login]);

  return (
    <div className="fixed inset-0 z-[7000] flex flex-col items-center justify-center gap-8 bg-black">
      <PearLogo className="h-[120px] w-[66px] text-white" />
      <div className="h-[5px] w-[190px] overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      {restoring && <p className="text-[13px] font-light tracking-wide text-white/70">Restaurando sesión…</p>}
    </div>
  );
}
