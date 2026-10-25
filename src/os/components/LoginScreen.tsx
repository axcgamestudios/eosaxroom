"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useOS } from "../store";
import { AvatarIcon } from "../icons";

function ClockBig() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute top-[11%] left-0 flex w-full flex-col items-center text-white">
      <p className="text-[21px] font-normal capitalize tracking-wide text-white/90 [text-shadow:0_1px_18px_rgba(0,0,0,0.45)]">
        {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <p className="mt-1 text-[96px] font-thin leading-none tabular-nums tracking-tight [text-shadow:0_2px_38px_rgba(0,0,0,0.55)]">
        {now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

const inputCls =
  "os-input h-[38px] w-[252px] rounded-full bg-black/30 px-4 text-center text-[13px] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_2px_14px_rgba(0,0,0,0.25)] ring-[0.5px] ring-white/25 backdrop-blur-xl outline-none placeholder:text-white/60";

/* ============================================================
   Pantalla de inicio de sesión — SIN cuentas.
   Como antes: escribes cualquier cosa (o nada) y entras.
   El campo de nombre es real (es tu nombre en el sistema);
   la píldora es el gesto de entrada: acepta lo que sea.
   ============================================================ */
export function LoginScreen({ mode }: { mode: "login" | "lock" }) {
  const userName = useOS((s) => s.settings.userName);
  const avatar = useOS((s) => s.settings.avatar);
  const session = useOS((s) => s.session);
  const login = useOS((s) => s.login);
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLock = mode === "lock" && !!session;
  const shownName = isLock ? session.username : user.trim() || userName;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const submit = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      // sin cuentas: el nombre escrito (o el que ya había) es la sesión
      if (isLock) login({ id: session.accountId, username: session.username });
      else login({ id: "local", username: user.trim() || userName });
    }, 450);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="fixed inset-0 z-[6500]"
    >
      {/* capa sutil sobre el wallpaper — el fondo queda visible como en macOS */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: "blur(2px) brightness(0.82) saturate(1.12)",
          WebkitBackdropFilter: "blur(2px) brightness(0.82) saturate(1.12)",
        }}
      />
      {/* degradado suave para legibilidad inferior */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/35" />

      <ClockBig />

      <div className="relative flex h-full flex-col items-center">
        {/* bloque de entrada, en el tercio inferior como macOS */}
        <div className="absolute top-[52%] flex w-[340px] flex-col items-center">
          {avatar ? (
            <img src={avatar} alt="" className="h-[92px] w-[92px] rounded-full object-cover shadow-[0_10px_38px_rgba(0,0,0,0.45)] ring-[3px] ring-white/35" />
          ) : (
            <AvatarIcon className="h-[92px] w-[92px] rounded-full shadow-[0_10px_38px_rgba(0,0,0,0.45)] ring-[3px] ring-white/35" />
          )}

          <p className="mt-3.5 text-[15px] font-medium text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">{shownName}</p>

          {!isLock && (
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Tu nombre (como quieras llamarte)"
              autoComplete="off"
              maxLength={24}
              className={`${inputCls} mt-3`}
            />
          )}

          <div className={`${isLock ? "mt-4" : "mt-2.5"} flex h-[38px] w-[252px] items-center overflow-hidden rounded-full bg-black/30 pl-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_2px_14px_rgba(0,0,0,0.25)] ring-[0.5px] ring-white/25 backdrop-blur-xl`}>
            <input
              ref={inputRef}
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Escribe cualquier cosa y entra"
              autoComplete="off"
              aria-label="Entrar"
              className="os-input h-full w-full bg-transparent text-center text-[13px] text-white outline-none placeholder:text-white/60"
            />
            <button
              onClick={submit}
              aria-label="Entrar"
              className="mr-1.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-white/25 text-white transition hover:bg-white/45"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="absolute bottom-7 flex flex-col items-center gap-1 text-white/60">
          <p className="text-[11px]">Sin cuentas: entra escribiendo cualquier cosa</p>
          <p className="text-[11px] font-medium text-white/45">axcsOS 1.0 · Liquid Glass</p>
        </div>
      </div>
    </motion.div>
  );
}

export function LoginGate() {
  const stage = useOS((s) => s.stage);
  return (
    <AnimatePresence>
      {(stage === "login" || stage === "lock") && <LoginScreen key={stage} mode={stage === "lock" ? "lock" : "login"} />}
    </AnimatePresence>
  );
}
