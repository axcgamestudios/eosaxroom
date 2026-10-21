"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, KeyRound, Loader2, Lock, Plus, RefreshCw, Shield, Trash2, X } from "lucide-react";
import { useOS } from "../store";
import {
  accountUid,
  clearAdminToken,
  fetchAccounts,
  getAdminToken,
  hashPassword,
  saveAccountsToGithub,
  setAdminToken,
  validateAdminToken,
  verifyAdminPassword,
  type AccountRecord,
  type SaveResult,
} from "../services/auth";

/* ============================================================
   Panel de administrador de axcsOS
   ------------------------------------------------------------
   Se abre manteniendo la combinación J + K + L (en cualquier
   pantalla, incluso en el inicio de sesión) y pide la
   contraseña de administrador. Desde aquí se crean, restablecen
   y eliminan cuentas. TODOS los cambios se guardan SIEMPRE en
   GitHub (main + gh-pages) mediante la API de GitHub: el token
   lo pega el administrador una sola vez y vive únicamente en SU
   navegador (el repositorio es público: jamás va en el código).
   ============================================================ */

const REPO = "axcgamestudios/aos";

type Status = { kind: "ok" | "warn" | "err"; text: string } | null;

export default function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminErr, setAdminErr] = useState("");
  const [checkingPw, setCheckingPw] = useState(false);

  /* ---- acorde J+K+L (las tres teclas mantenidas a la vez) ---- */
  useEffect(() => {
    const CHORD = new Set(["j", "k", "l"]);
    const held = new Set<string>();
    let fired = false;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (CHORD.has(k)) held.add(k);
      if (held.size >= 3 && !fired) {
        fired = true;
        setOpen((o) => !o);
      }
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase());
      if (held.size < 3) fired = false;
    };
    const clear = () => {
      held.clear();
      fired = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setAdminPw("");
      setAdminErr("");
    }
  }, [open]);

  const checkAdmin = async () => {
    if (checkingPw) return;
    setCheckingPw(true);
    setAdminErr("");
    const ok = await verifyAdminPassword(adminPw);
    setCheckingPw(false);
    if (ok) setUnlocked(true);
    else {
      setAdminErr("Contraseña de administrador incorrecta.");
      setAdminPw("");
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[3px]">
          <div className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-neutral-100/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-black/10 backdrop-blur-2xl dark:bg-neutral-900/95 dark:ring-white/15">
            {!unlocked ? <Gate pw={adminPw} setPw={setAdminPw} err={adminErr} busy={checkingPw} onCheck={checkAdmin} onClose={() => setOpen(false)} /> : (
              <Dashboard onClose={() => setOpen(false)} onLock={() => setUnlocked(false)} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- puerta: contraseña de administrador ---------------- */

function Gate({ pw, setPw, err, busy, onCheck, onClose }: { pw: string; setPw: (v: string) => void; err: string; busy: boolean; onCheck: () => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex flex-col items-center px-8 py-10">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg">
        <Lock size={26} />
      </div>
      <h2 className="mt-4 text-[15px] font-semibold text-neutral-800 dark:text-neutral-100">Administración de axcsOS</h2>
      <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">Acceso solo para el administrador</p>
      <input
        ref={ref}
        type="password"
        value={pw}
        disabled={busy}
        onChange={(e) => {
          setPw(e.target.value);
        }}
        onKeyDown={(e) => e.key === "Enter" && onCheck()}
        placeholder="Contraseña de administrador"
        className={`os-input mt-5 h-[38px] w-[280px] rounded-full bg-black/5 px-4 text-center text-[13px] text-neutral-800 ring-1 outline-none ring-black/10 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--accent-os)] dark:bg-white/10 dark:text-neutral-100 dark:ring-white/15 ${err ? "ring-2 !ring-red-500" : ""}`}
      />
      {err && <p className="mt-2 text-[12px] text-red-500">{err}</p>}
      <div className="mt-5 flex gap-2">
        <button
          onClick={onCheck}
          disabled={busy || !pw}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-os)] px-4 py-1.5 text-[12px] font-medium text-white shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
          Desbloquear
        </button>
        <button onClick={onClose} className="rounded-lg bg-black/5 px-4 py-1.5 text-[12px] font-medium text-neutral-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/20">
          Cerrar
        </button>
      </div>
    </div>
  );
}

/* ---------------- panel principal ---------------- */

function Dashboard({ onClose, onLock }: { onClose: () => void; onLock: () => void }) {
  const notify = useOS((s) => s.notify);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [newUser, setNewUser] = useState("");
  const [newPw, setNewPw] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [lastList, setLastList] = useState<AccountRecord[] | null>(null);

  /* token de GitHub */
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenCheck, setTokenCheck] = useState<Status>(null);
  const [checkingTok, setCheckingTok] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const list = await fetchAccounts();
      setAccounts(list);
      setLastList(null);
    } catch (e) {
      setLoadErr("No se pudo cargar la lista de cuentas desde GitHub.");
      console.error("[admin]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setToken(getAdminToken());
    void reload();
  }, [reload]);

  const applySave = (r: SaveResult, actionLabel: string, revertTo: AccountRecord[] | null) => {
    if (r.main.ok && r.pages.ok) {
      setStatus({ kind: "ok", text: `${actionLabel} · guardado en main ✓ y gh-pages ✓ — activo en el sitio en ~1 min` });
      setLastList(null);
      notify("settings", "Cuentas guardadas en GitHub", actionLabel);
    } else if (r.main.ok || r.pages.ok) {
      setStatus({
        kind: "warn",
        text: `${actionLabel} · guardado en ${r.main.ok ? "main" : "gh-pages"} ✓ pero FALLÓ en ${r.main.ok ? "gh-pages" : "main"} (${(r.main.ok ? r.pages : r.main).error}) — usa «Reintentar guardado»`,
      });
      setLastList(revertTo);
    } else {
      setStatus({ kind: "err", text: `${actionLabel} · NO guardado en GitHub: ${r.main.error}. ${revertTo ? "Cambio revertido." : ""}` });
      if (revertTo) setAccounts(revertTo); // honesto: GitHub manda
    }
  };

  const persist = async (list: AccountRecord[], message: string, actionLabel: string, revertTo: AccountRecord[] | null) => {
    setBusyAction(true);
    try {
      const r = await saveAccountsToGithub(list, message);
      applySave(r, actionLabel, revertTo);
      if (r.main.ok && r.pages.ok) setAccounts(list);
      return r.main.ok && r.pages.ok;
    } finally {
      setBusyAction(false);
    }
  };

  const createAccount = async () => {
    const u = newUser.trim();
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(u)) {
      setStatus({ kind: "err", text: "El usuario debe tener 3-24 caracteres (letras, números, punto, guion o guion bajo)." });
      return;
    }
    if (newPw.length < 6) {
      setStatus({ kind: "err", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    if (accounts.some((a) => a.username.toLowerCase() === u.toLowerCase())) {
      setStatus({ kind: "err", text: "Ya existe una cuenta con ese usuario." });
      return;
    }
    setBusyAction(true);
    const { salt, hash } = await hashPassword(newPw);
    const acc: AccountRecord = { id: accountUid(), username: u, salt, hash, created: new Date().toISOString() };
    const list = [...accounts, acc];
    setBusyAction(false);
    const ok = await persist(list, `[panel admin] cuenta creada: ${u}`, `Cuenta «${u}» creada`, accounts);
    if (ok) {
      setNewUser("");
      setNewPw("");
    }
  };

  const resetPassword = async (acc: AccountRecord) => {
    if (resetPw.length < 6) {
      setStatus({ kind: "err", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    setBusyAction(true);
    const { salt, hash } = await hashPassword(resetPw);
    const list = accounts.map((a) => (a.id === acc.id ? { ...a, salt, hash } : a));
    setBusyAction(false);
    const ok = await persist(list, `[panel admin] contraseña restablecida: ${acc.username}`, `Contraseña de «${acc.username}» restablecida`, accounts);
    if (ok) {
      setResetFor(null);
      setResetPw("");
    }
  };

  const deleteAccount = async (acc: AccountRecord) => {
    const list = accounts.filter((a) => a.id !== acc.id);
    const ok = await persist(list, `[panel admin] cuenta eliminada: ${acc.username}`, `Cuenta «${acc.username}» eliminada`, accounts);
    if (ok) setConfirmDel(null);
  };

  const retrySave = async () => {
    if (busyAction) return;
    if (lastList) {
      // hubo un fallo parcial: reintentar la lista actual contra GitHub
      await persist(accounts, "[panel admin] reintento de guardado de cuentas", "Cuentas reintentadas", null);
    } else {
      // recargar la verdad desde GitHub
      await reload();
      setStatus({ kind: "ok", text: "Lista recargada desde GitHub." });
    }
  };

  const saveToken = async () => {
    const t = tokenInput.trim();
    if (!t) return;
    setCheckingTok(true);
    setTokenCheck(null);
    const r = await validateAdminToken(t);
    setCheckingTok(false);
    if (r.ok) {
      setAdminToken(t);
      setToken(t);
      setTokenInput("");
      setTokenCheck({ kind: "ok", text: r.detail });
    } else {
      setTokenCheck({ kind: "err", text: r.detail });
    }
  };

  const revalidateToken = async () => {
    setCheckingTok(true);
    setTokenCheck(null);
    const r = await validateAdminToken(token);
    setCheckingTok(false);
    setTokenCheck({ kind: r.ok ? "ok" : "err", text: r.detail });
  };

  const removeToken = () => {
    clearAdminToken();
    setToken("");
    setTokenCheck({ kind: "warn", text: "Token eliminado de este navegador. Guarda uno nuevo para hacer cambios." });
  };

  return (
    <div className="flex min-h-0 flex-col">
      {/* cabecera */}
      <div className="flex items-center gap-2.5 border-b border-black/10 px-5 py-3 dark:border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 text-white shadow">
          <Shield size={16} />
        </div>
        <div className="flex-1">
          <h2 className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">Administración de axcsOS</h2>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Cuentas del sistema · se guardan siempre en GitHub</p>
        </div>
        <button onClick={retrySave} disabled={busyAction || loading} title="Recargar / reintentar guardado" className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button onClick={onLock} title="Bloquear el panel" className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10">
          <Lock size={14} />
        </button>
        <button onClick={onClose} title="Cerrar" className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10">
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* token de GitHub */}
        <section className="rounded-xl bg-black/[0.03] p-3.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
              <KeyRound size={13} /> Token de GitHub
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${token ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
              {token ? "configurado en este navegador" : "sin configurar"}
            </span>
          </div>
          {token ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-black/5 px-2 py-1 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                {token.slice(0, 7)}••••••{token.slice(-4)}
              </code>
              <button onClick={revalidateToken} disabled={checkingTok} className="rounded-lg bg-black/5 px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition hover:bg-black/10 disabled:opacity-50 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/20">
                {checkingTok ? "Comprobando…" : "Comprobar"}
              </button>
              <button onClick={removeToken} className="rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-500/20">
                Quitar
              </button>
            </div>
          ) : (
            <div className="mt-2.5 space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_… / github_pat_…"
                  className="os-input h-[32px] flex-1 rounded-lg bg-black/5 px-2.5 text-[12px] text-neutral-800 ring-1 ring-black/10 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--accent-os)] dark:bg-white/10 dark:text-neutral-100 dark:ring-white/15"
                />
                <button onClick={saveToken} disabled={checkingTok || !tokenInput.trim()} className="flex items-center gap-1 rounded-lg bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-medium text-white shadow transition hover:opacity-90 disabled:opacity-50">
                  {checkingTok ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                </button>
              </div>
              <p className="text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                Créalo en GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained</b>: solo el repositorio <b>{REPO}</b>, permiso <b>Contents: Read and write</b>. Pégalo una sola vez: se guarda cifrado por el navegador en este perfil y <b>nunca</b> forma parte del código (el repositorio es público).
              </p>
            </div>
          )}
          {tokenCheck && (
            <p className={`mt-2 text-[11px] ${tokenCheck.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : tokenCheck.kind === "warn" ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>{tokenCheck.text}</p>
          )}
        </section>

        {/* crear cuenta */}
        <section className="rounded-xl bg-black/[0.03] p-3.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
            <Plus size={13} /> Crear cuenta
          </h3>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <input
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              placeholder="Usuario (3-24)"
              className="os-input h-[32px] w-[150px] rounded-lg bg-black/5 px-2.5 text-[12px] text-neutral-800 ring-1 ring-black/10 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--accent-os)] dark:bg-white/10 dark:text-neutral-100 dark:ring-white/15"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Contraseña (mín. 6)"
              className="os-input h-[32px] w-[170px] rounded-lg bg-black/5 px-2.5 text-[12px] text-neutral-800 ring-1 ring-black/10 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--accent-os)] dark:bg-white/10 dark:text-neutral-100 dark:ring-white/15"
            />
            <button
              onClick={createAccount}
              disabled={busyAction || !token}
              title={token ? "Crear y guardar en GitHub" : "Configura primero el token de GitHub"}
              className="flex items-center gap-1 rounded-lg bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-medium text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyAction ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Crear y guardar
            </button>
          </div>
          {!token && <p className="mt-2 text-[10.5px] text-amber-600 dark:text-amber-400">Configura el token de GitHub arriba: todo cambio se guarda SIEMPRE en GitHub.</p>}
        </section>

        {/* lista de cuentas */}
        <section className="rounded-xl bg-black/[0.03] ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <div className="flex items-center justify-between px-3.5 pt-3 pb-1">
            <h3 className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">Cuentas ({accounts.length})</h3>
            {loading && <Loader2 size={12} className="animate-spin text-neutral-400" />}
          </div>
          {loadErr && <p className="px-3.5 pb-3 text-[11px] text-red-500">{loadErr}</p>}
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {accounts.map((a) => (
              <div key={a.id} className="px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white uppercase">
                    {a.username.slice(0, 1)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[12.5px] font-medium text-neutral-800 dark:text-neutral-100">{a.username}</p>
                    <p className="text-[10.5px] text-neutral-400">creada {new Date(a.created).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} · PBKDF2-SHA256</p>
                  </div>
                  <button
                    onClick={() => {
                      setResetFor(resetFor === a.id ? null : a.id);
                      setConfirmDel(null);
                      setResetPw("");
                    }}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 transition hover:bg-blue-500/10 dark:text-blue-400"
                  >
                    Restablecer contraseña
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDel(confirmDel === a.id ? null : a.id);
                      setResetFor(null);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 transition hover:bg-red-500/10"
                    title="Eliminar cuenta"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {resetFor === a.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                    <input
                      type="password"
                      value={resetPw}
                      onChange={(e) => setResetPw(e.target.value)}
                      placeholder="Nueva contraseña (mín. 6)"
                      className="os-input h-[30px] w-[190px] rounded-lg bg-black/5 px-2.5 text-[12px] text-neutral-800 ring-1 ring-black/10 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--accent-os)] dark:bg-white/10 dark:text-neutral-100 dark:ring-white/15"
                    />
                    <button
                      onClick={() => resetPassword(a)}
                      disabled={busyAction}
                      className="flex items-center gap-1 rounded-lg bg-[var(--accent-os)] px-2.5 py-1 text-[11px] font-medium text-white shadow transition hover:opacity-90 disabled:opacity-50"
                    >
                      {busyAction ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Guardar en GitHub
                    </button>
                  </div>
                )}
                {confirmDel === a.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                    <p className="text-[11px] text-red-500">¿Eliminar «{a.username}»? Esta acción se commitea a GitHub.</p>
                    <button onClick={() => deleteAccount(a)} disabled={busyAction} className="rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-medium text-white shadow transition hover:opacity-90 disabled:opacity-50">
                      Sí, eliminar
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="rounded-lg bg-black/5 px-2.5 py-1 text-[11px] font-medium text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!loading && !accounts.length && !loadErr && (
              <p className="px-3.5 py-4 text-center text-[11.5px] text-neutral-400">Todavía no hay cuentas. Crea la primera arriba.</p>
            )}
          </div>
        </section>
      </div>

      {/* estado */}
      {status && (
        <div className={`flex items-start gap-2 border-t px-5 py-2.5 text-[11.5px] ${status.kind === "ok" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : status.kind === "warn" ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
          {status.kind === "ok" ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
          <p>{status.text}</p>
          <button onClick={() => setStatus(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
