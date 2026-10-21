"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Fingerprint, Mail, ShieldAlert } from "lucide-react";
import { useOS } from "../store";
import { AvatarIcon } from "../icons";
import {
  createSession,
  fetchAccounts,
  findAccount,
  getStoredSession,
  startSessionGuard,
  verifyPassword,
  type AccountRecord,
  type StoredSession,
} from "../services/auth";
import { checkEmailCode, findVerifiedAccountIds, sendEmailCode, setStaySession } from "../services/axcid";

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

export function LoginScreen({ mode }: { mode: "login" | "lock" }) {
  const userName = useOS((s) => s.settings.userName);
  const avatar = useOS((s) => s.settings.avatar);
  const session = useOS((s) => s.session);
  const kickMessage = useOS((s) => s.kickMessage);
  const login = useOS((s) => s.login);
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [stored, setStored] = useState<StoredSession | null>(null);
  const [remember, setRemember] = useState(true);
  const [loginMode, setLoginMode] = useState<"password" | "axcid">("password");
  const [axcEmail, setAxcEmail] = useState("");
  const [axcCode, setAxcCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [axcBusy, setAxcBusy] = useState(false);
  const [axcMsg, setAxcMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isLock = mode === "lock" && !!session;
  const shownName = isLock ? session.username : user.trim() || userName;

  useEffect(() => {
    setStored(getStoredSession());
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const fail = (msg: string) => {
    setError(msg);
    setShake(true);
    setBusy(false);
    setTimeout(() => setShake(false), 500);
  };

  const enterWith = (
    account: AccountRecord | { id: string; username: string },
    opts?: { token?: string; remember?: boolean },
  ) => {
    const reuse = !!opts?.token;
    const sess = reuse ? null : createSession(account as AccountRecord);
    const finalToken = opts?.token ?? sess!.token;
    setLeaving(true);
    setTimeout(() => {
      login({ id: account.id, username: account.username });
      // 1 dispositivo por cuenta: afirmar esta sesión y expulsar las demás
      void startSessionGuard(account.id, finalToken, (detail) => {
        useOS.getState().logoutFromKick(detail);
      });
      // «Recordarme»: sesión persistente en cookie (30 días) — sin pantalla de inicio
      if (opts?.remember) {
        void setStaySession(account.id, account.username, finalToken);
      }
    }, 450);
  };

  const submit = async () => {
    if (busy) return;
    if (!isLock && !user.trim()) {
      fail("Introduce tu usuario.");
      return;
    }
    if (!pw.trim()) {
      fail("Introduce la contraseña de tu cuenta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const accounts = await fetchAccounts();
      const account = findAccount(accounts, isLock ? session.username : user);
      if (!account) {
        fail("Esa cuenta no existe. Pide al administrador que la cree.");
        return;
      }
      const ok = await verifyPassword(pw, account);
      if (!ok) {
        fail("Usuario o contraseña incorrectos.");
        return;
      }
      const wantsRemember = remember && !isLock;
      enterWith(account, { remember: wantsRemember });
    } catch (e) {
      fail("No se pudo comprobar la cuenta (sin conexión con GitHub).");
      console.error("[login]", e);
    }
  };

  const touchId = async () => {
    if (busy || !stored) return;
    setBusy(true);
    setError("");
    try {
      const accounts = await fetchAccounts();
      const acc = accounts.find((a) => a.id === stored.accountId);
      if (!acc) {
        fail("Esta cuenta ya no existe. Pide al administrador una nueva.");
        return;
      }
      enterWith(acc, { token: stored.token });
    } catch (e) {
      fail("Sin conexión con GitHub para verificar la cuenta.");
      console.error("[login touchid]", e);
    }
  };

  /* ---- AXC ID: entrar con correo + código (sin contraseña) ---- */
  const axcSend = async () => {
    if (axcBusy) return;
    setAxcBusy(true);
    setAxcMsg("");
    try {
      // el correo debe estar verificado en ESTE dispositivo (regla 1 cuenta = 1 dispositivo)
      const ids = findVerifiedAccountIds(axcEmail);
      if (ids.length === 0) {
        setAxcMsg("Ese correo no está verificado aquí. Entra una vez con tu contraseña y verifícalo en Ajustes → Cuenta.");
        setAxcBusy(false);
        return;
      }
      const r = await sendEmailCode(axcEmail);
      setAxcMsg(r.detail);
      if (r.sent) setCodeSent(true);
    } finally {
      setAxcBusy(false);
    }
  };

  const axcEnter = async () => {
    if (axcBusy || !codeSent) return;
    setAxcBusy(true);
    setAxcMsg("");
    try {
      const c = await checkEmailCode(axcCode);
      if (!c.ok) {
        setAxcMsg(c.detail ?? "Código incorrecto.");
        setAxcBusy(false);
        return;
      }
      const accounts = await fetchAccounts();
      const ids = findVerifiedAccountIds(c.email ?? axcEmail);
      const account = accounts.find((a) => ids.includes(a.id));
      if (!account) {
        setAxcMsg("La cuenta de ese correo ya no existe.");
        setAxcBusy(false);
        return;
      }
      enterWith(account, { remember: true });
    } catch {
      setAxcMsg("Sin conexión con GitHub para comprobar la cuenta.");
      setAxcBusy(false);
    }
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
        {/* bloque de autenticación, en el tercio inferior como macOS */}
        <div className="absolute top-[52%] flex w-[340px] flex-col items-center">
          {avatar ? (
            <img src={avatar} alt="" className="h-[92px] w-[92px] rounded-full object-cover shadow-[0_10px_38px_rgba(0,0,0,0.45)] ring-[3px] ring-white/35" />
          ) : (
            <AvatarIcon className="h-[92px] w-[92px] rounded-full shadow-[0_10px_38px_rgba(0,0,0,0.45)] ring-[3px] ring-white/35" />
          )}

          {kickMessage && (
            <div className="mt-3 flex items-center gap-1.5 rounded-full bg-red-500/25 px-3 py-1.5 text-[12px] text-white ring-[0.5px] ring-red-300/40 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              <ShieldAlert size={13} className="shrink-0" />
              {kickMessage}
            </div>
          )}

          {loginMode === "password" || isLock ? (
            <>
              {!isLock && (
                <input
                  value={user}
                  onChange={(e) => {
                    setUser(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="Usuario"
                  autoComplete="username"
                  className={`${inputCls} mt-4`}
                />
              )}

              <motion.div
                animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : {}}
                transition={{ duration: 0.45 }}
                className={`${isLock ? "mt-4" : "mt-2.5"} flex h-[38px] w-[252px] items-center overflow-hidden rounded-full bg-black/30 pl-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_2px_14px_rgba(0,0,0,0.25)] ring-[0.5px] ring-white/25 backdrop-blur-xl`}
              >
                <input
                  ref={inputRef}
                  type="password"
                  value={pw}
                  disabled={busy}
                  onChange={(e) => {
                    setPw(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  placeholder="Introduce la contraseña"
                  autoComplete="current-password"
                  className="os-input h-full w-full bg-transparent text-center text-[13px] text-white outline-none placeholder:text-white/60 disabled:opacity-60"
                />
                <button
                  onClick={() => void submit()}
                  disabled={busy}
                  aria-label="Entrar"
                  className="mr-1.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-white/25 text-white transition hover:bg-white/45 disabled:opacity-50"
                >
                  {busy ? (
                    <span className="block h-[13px] w-[13px] animate-spin rounded-full border-[2px] border-white/40 border-t-white" />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                </button>
              </motion.div>

              {error && <p className="mt-2.5 text-[12px] text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">{error}</p>}

              {!isLock && (
                <button
                  onClick={() => setRemember((r) => !r)}
                  className="mt-2.5 flex items-center gap-2 text-[11.5px] text-white/70 transition hover:text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]"
                  title="Guarda la sesión en una cookie de 30 días: al abrir o recargar entrarás directo al escritorio"
                >
                  <span
                    className={`flex h-[14px] w-[14px] items-center justify-center rounded-[4px] text-[10px] font-bold ${
                      remember ? "bg-white/85 text-black" : "bg-black/30 text-transparent ring-[0.5px] ring-white/40"
                    }`}
                  >
                    ✓
                  </span>
                  Recordarme en este dispositivo
                </button>
              )}

              {stored && (
                <button
                  onClick={touchId}
                  disabled={busy}
                  className="mt-3.5 flex items-center gap-1.5 text-[12px] text-white/75 transition hover:text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)] disabled:opacity-50"
                >
                  <Fingerprint size={15} />
                  Touch ID · entrar como {stored.username}
                </button>
              )}

              {!isLock && (
                <button
                  onClick={() => {
                    setLoginMode("axcid");
                    setError("");
                    setAxcMsg("");
                  }}
                  className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-white/80 transition hover:text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]"
                >
                  <Mail size={14} />
                  Entrar con correo y código (AXC ID)
                </button>
              )}
            </>
          ) : (
            <>
              {/* --- AXC ID: correo + código --- */}
              <p className="mt-4 text-[12.5px] font-medium text-white/85 [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
                AXC ID · entra sin contraseña
              </p>
              <input
                value={axcEmail}
                onChange={(e) => {
                  setAxcEmail(e.target.value);
                  setAxcMsg("");
                }}
                onKeyDown={(e) => e.key === "Enter" && (codeSent ? void axcEnter() : void axcSend())}
                placeholder="tu correo verificado"
                type="email"
                autoComplete="email"
                className={`${inputCls} mt-3`}
                disabled={codeSent}
              />
              {!codeSent ? (
                <button
                  onClick={() => void axcSend()}
                  disabled={axcBusy}
                  className="mt-3 flex h-[36px] w-[252px] items-center justify-center gap-2 rounded-full bg-white/20 text-[12.5px] font-medium text-white ring-[0.5px] ring-white/30 backdrop-blur-xl transition hover:bg-white/30 disabled:opacity-60"
                >
                  {axcBusy ? (
                    <span className="block h-[13px] w-[13px] animate-spin rounded-full border-[2px] border-white/40 border-t-white" />
                  ) : (
                    <Mail size={14} />
                  )}
                  Enviarme el código por correo
                </button>
              ) : (
                <>
                  <input
                    value={axcCode}
                    onChange={(e) => {
                      setAxcCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setAxcMsg("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && void axcEnter()}
                    placeholder="código de 6 dígitos"
                    inputMode="numeric"
                    className={`${inputCls} mt-3 tracking-[0.4em]`}
                  />
                  <button
                    onClick={() => void axcEnter()}
                    disabled={axcBusy}
                    className="mt-3 flex h-[36px] w-[252px] items-center justify-center gap-2 rounded-full bg-white/85 text-[12.5px] font-semibold text-black transition hover:bg-white disabled:opacity-60"
                  >
                    {axcBusy && <span className="block h-[13px] w-[13px] animate-spin rounded-full border-[2px] border-black/30 border-t-black" />}
                    Entrar
                  </button>
                  <button
                    onClick={() => {
                      setCodeSent(false);
                      setAxcCode("");
                      setAxcMsg("");
                    }}
                    className="mt-2 text-[11px] text-white/60 transition hover:text-white"
                  >
                    Usar otro correo
                  </button>
                </>
              )}
              {axcMsg && (
                <p className="mt-2.5 max-w-[280px] text-center text-[11.5px] leading-relaxed text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
                  {axcMsg}
                </p>
              )}
              <button
                onClick={() => {
                  setLoginMode("password");
                  setCodeSent(false);
                  setAxcMsg("");
                }}
                className="mt-3 text-[12px] text-white/75 transition hover:text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]"
              >
                ← Volver a usuario y contraseña
              </button>
            </>
          )}
        </div>

        <div className="absolute bottom-7 flex flex-col items-center gap-1 text-white/60">
          <p className="text-[11px]">Cuentas creadas por el administrador · 1 dispositivo por cuenta</p>
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
