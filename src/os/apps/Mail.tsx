"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Inbox,
  Loader2,
  Mail as MailIconLucide,
  PenLine,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import {
  createMailAccount,
  deleteMailAccount,
  fmtMailDate,
  getMail,
  MAIL_DOMAIN,
  mailAddress,
  validAddress,
  type MailConnState,
  type MailLetter,
} from "../services/mail";

/* constante estable: sin "cascading renders" cuando el servicio aún no existe */
const NO_LETTERS: MailLetter[] = [];

/* ============================================================
   Mail de axcsOS — bandeja real entre usuarios del sistema
   ============================================================ */

export default function MailApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const session = useOS((s) => s.session);
  const settings = useOS((s) => s.settings);
  const openApp = useOS((s) => s.openApp);

  const mail = useMemo(() => (typeof window !== "undefined" ? getMail() : null), []);
  const [address, setAddress] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");

  /* cuenta + servicio */
  useEffect(() => {
    // lectura de localStorage tras el montaje (evita desajuste de hidratación):
    // setState una sola vez al montar es intencional
    const acc = mailAddress();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddress(acc);
    setReady(true);
    if (acc) mail?.start();
    const off = mail?.onEvent((e) => {
      if (e.type === "letter") setTick((t) => t + 1);
      if (e.type === "sent" || e.type === "state") setTick((t) => t + 1);
    });
    return () => {
      off?.();
    };
  }, []);

  const connState: MailConnState = mail?.state ?? "offline";
  const connLabel: Record<MailConnState, string> = {
    online: "Conectado a la red de correo",
    connecting: "Conectando…",
    offline: "Sin conexión de correo",
    error: "Error de red de correo",
  };

  const letters = mail ? mail.letters : NO_LETTERS;
  const current = letters.find((l) => l.id === openId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return letters
      .filter((l) => (folder === "inbox" ? !l.mine : l.mine))
      .filter((l) => !q || l.subject.toLowerCase().includes(q) || l.from.toLowerCase().includes(q) || l.to.toLowerCase().includes(q) || l.body.toLowerCase().includes(q))
      .sort((a, b) => b.ts - a.ts);
  }, [letters, folder, search, tick]);

  const unread = letters.filter((l) => !l.mine && !l.read).length;

  const openLetter = useCallback(
    (id: string) => {
      setOpenId(id);
      mail?.markRead(id);
      setTick((t) => t + 1);
    },
    [mail]
  );

  if (!ready) {
    return <div className="flex h-full items-center justify-center bg-white dark:bg-neutral-950" />;
  }

  /* ---------- onboarding: crear la dirección ---------- */
  if (!address) {
    return <MailOnboarding username={session?.username ?? settings.userName} onDone={(addr) => setAddress(addr)} />;
  }

  const connDot =
    connState === "online" ? "bg-emerald-500" : connState === "connecting" ? "bg-amber-400 animate-pulse" : "bg-rose-500";

  return (
    <div className="flex h-full bg-white text-[13px] text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
      {/* sidebar */}
      <div className="flex w-52 shrink-0 flex-col border-r border-black/8 bg-neutral-100/80 dark:border-white/8 dark:bg-neutral-900/80">
        <button
          onClick={() => setComposing(true)}
          className="m-3 flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-os)] px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <PenLine size={13} /> Redactar
        </button>
        <div className="px-2">
          <SidebarItem icon={<Inbox size={14} />} label="Bandeja de entrada" badge={unread} active={folder === "inbox"} onClick={() => { setFolder("inbox"); setOpenId(null); }} />
          <SidebarItem icon={<Send size={14} />} label="Enviados" active={folder === "sent"} onClick={() => { setFolder("sent"); setOpenId(null); }} />
        </div>
        <div className="mt-1 px-4 pb-2 pt-3 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">
          Mi correo
        </div>
        <div className="mx-2 rounded-xl bg-white/70 p-3 text-center shadow-sm ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
          <div className="flex items-center justify-center gap-1.5">
            <MailIconLucide size={12} className="text-[var(--accent-os)]" />
            <span className="truncate text-[12px] font-semibold">{address}</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(address).then(
                () => notify("mail", "Correo copiado", "Pégalo donde quieras iniciar sesión"),
                () => openApp("settings")
              );
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-black/5 px-2 py-1.5 text-[11px] font-medium transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <Copy size={11} /> Copiar
          </button>
          <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">
            Safari lo rellena solo en las webs que pidan correo para iniciar sesión.
          </p>
        </div>
        <div className="mt-auto flex items-center gap-2 px-4 pb-3 text-[10.5px] text-neutral-400">
          <span className={`h-2 w-2 shrink-0 rounded-full ${connDot}`} />
          <span className="truncate">{connLabel[connState]}</span>
        </div>
      </div>

      {/* lista */}
      <div className="flex w-72 shrink-0 flex-col border-r border-black/8 dark:border-white/8">
        <div className="flex h-11 items-center gap-2 border-b border-black/8 px-3 dark:border-white/8">
          <Search size={12} className="shrink-0 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar"
            spellCheck={false}
            className="os-input h-full w-full bg-transparent text-[12px] outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-[11.5px] leading-relaxed text-neutral-400">
              {folder === "inbox" ? (
                <>
                  Sin cartas por ahora.
                  <br />
                  Tu dirección <b className="text-neutral-500 dark:text-neutral-300">{address}</b> ya puede recibir
                  de otras cuentas axcsOS.
                </>
              ) : (
                "Nada enviado todavía."
              )}
            </div>
          )}
          {filtered.map((l) => (
            <button
              key={l.id}
              onClick={() => openLetter(l.id)}
              className={`block w-full border-b border-black/5 px-3 py-2.5 text-left transition hover:bg-black/[0.04] dark:border-white/5 dark:hover:bg-white/[0.05] ${
                openId === l.id ? "bg-[var(--accent-os)]/10" : ""
              }`}
            >
              <div className="flex items-baseline gap-2">
                {!l.mine && !l.read && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-os)]" />}
                <span className={`min-w-0 flex-1 truncate text-[12px] ${l.mine || l.read ? "text-neutral-500 dark:text-neutral-400" : "font-semibold"}`}>
                  {l.mine ? `Para: ${l.to}` : l.fromName || l.from}
                </span>
                <span className="shrink-0 text-[10px] text-neutral-400">{fmtMailDate(l.ts)}</span>
              </div>
              <div className={`mt-0.5 truncate text-[12px] ${!l.mine && !l.read ? "font-semibold" : "font-medium"}`}>{l.subject}</div>
              <div className="mt-0.5 truncate text-[11px] text-neutral-400">{l.body.replace(/\s+/g, " ").slice(0, 90)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* lector */}
      <div className="mac-scrollbar min-w-0 flex-1 overflow-y-auto">
        {current ? (
          <div className="p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-semibold leading-snug">{current.subject}</h2>
                <div className="mt-1 text-[11.5px] text-neutral-400">
                  {current.mine ? `Para: ${current.to}` : `De: ${current.fromName ?? ""} <${current.from}>`} ·{" "}
                  {new Date(current.ts).toLocaleString("es-ES")}
                </div>
              </div>
              <button
                onClick={() => {
                  mail?.deleteLetter(current.id);
                  setOpenId(null);
                  setTick((t) => t + 1);
                }}
                className="shrink-0 rounded-md p-1.5 text-neutral-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                title="Eliminar carta"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {!current.mine && (
              <button
                onClick={() => setComposing(true)}
                className="mb-4 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              >
                <ArrowLeft size={11} className="rotate-180" /> Responder a {current.from}
              </button>
            )}
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
              {current.body}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
            <MailIconLucide size={34} strokeWidth={1.4} />
            <p className="text-[12px]">{folder === "inbox" ? "Elige una carta de la bandeja" : "Elige un enviado"}</p>
          </div>
        )}
      </div>

      {composing && (
        <ComposeDialog
          from={address}
          prefillTo={current && !current.mine ? current.from : ""}
          prefillSubject={current && !current.mine ? `Re: ${current.subject}` : ""}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            setFolder("sent");
            setTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

/* ---------- onboarding ---------- */

function MailOnboarding({ username, onDone }: { username: string; onDone: (addr: string) => void }) {
  const suggested = useMemo(
    () =>
      (username || "usuario")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 24) || "usuario",
    [username]
  );
  const [local, setLocal] = useState(suggested);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clean = local.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const full = `${clean}@${MAIL_DOMAIN}`;
  const ok = clean.length >= 3 && validAddress(full);

  const create = () => {
    if (!ok) {
      setError("El nombre necesita al menos 3 caracteres (letras, números, punto, guion)");
      return;
    }
    setBusy(true);
    try {
      const acc = createMailAccount(clean);
      getMail().start(acc);
      onDone(acc.address);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mac-scrollbar flex h-full items-center justify-center overflow-y-auto bg-gradient-to-b from-sky-50/60 to-neutral-100 px-6 py-8 dark:from-neutral-900 dark:to-neutral-950">
      <div className="w-full max-w-md">
        <div className="glass lg-specular rounded-3xl p-7 shadow-xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg">
            <MailIconLucide size={26} className="text-white" />
          </div>
          <h2 className="text-[19px] font-semibold">Tu correo de axcsOS</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Elige tu dirección: servirá para que <b>Safari inicie sesión por ti</b> en las páginas que pidan un
            correo, y para escribir a otras cuentas de axcsOS.
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-[var(--accent-os)]/50 dark:bg-neutral-800 dark:ring-white/10">
            <input
              autoFocus
              value={local}
              onChange={(e) => {
                setLocal(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder={suggested}
              spellCheck={false}
              className="os-input w-full bg-transparent text-[14px] font-medium outline-none"
            />
            <span className="shrink-0 text-[13px] font-semibold text-neutral-400">@{MAIL_DOMAIN}</span>
          </div>
          {error ? (
            <p className="mt-2 text-[11px] text-rose-500">{error}</p>
          ) : (
            <p className="mt-2 text-[11px] text-neutral-400">Tu dirección será <b className="text-neutral-500 dark:text-neutral-300">{full}</b></p>
          )}

          <button
            onClick={create}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-os)] py-2.5 text-[13px] font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Crear mi correo
          </button>
          <p className="mt-3 text-[10.5px] leading-relaxed text-neutral-400">
            Honesto: este buzón vive dentro de axcsOS (entrega real entre cuentas). Las webs externas no pueden
            enviarte aquí códigos; para esos casos usa tu correo real en Ajustes → Cuenta (AXC ID).
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- redactar ---------- */

function ComposeDialog({
  from,
  prefillTo,
  prefillSubject,
  onClose,
  onSent,
}: {
  from: string;
  prefillTo: string;
  prefillSubject: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const notify = useOS((s) => s.notify);
  const [to, setTo] = useState(prefillTo);
  const [subject, setSubject] = useState(prefillSubject);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    toRef.current?.focus();
  }, []);

  const send = () => {
    setBusy(true);
    const r = getMail().sendLetter(to, subject, body);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo enviar");
      return;
    }
    notify("mail", "Carta enviada", `A: ${to.trim()}`);
    onSent();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className="glass lg-specular w-full max-w-lg rounded-2xl p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <PenLine size={14} className="text-[var(--accent-os)]" />
          <h3 className="flex-1 text-[14px] font-semibold">Nueva carta</h3>
          <span className="text-[10.5px] text-neutral-400">De: {from}</span>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 transition hover:bg-black/10 dark:hover:bg-white/10">
            <X size={13} />
          </button>
        </div>
        <div className="space-y-2">
          <input
            ref={toRef}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setError("");
            }}
            placeholder={`Para: nombre@${MAIL_DOMAIN}`}
            spellCheck={false}
            className="os-input w-full rounded-lg bg-white/80 px-3 py-2 text-[12.5px] shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/50 dark:bg-neutral-800/80 dark:ring-white/10"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Asunto"
            className="os-input w-full rounded-lg bg-white/80 px-3 py-2 text-[12.5px] shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/50 dark:bg-neutral-800/80 dark:ring-white/10"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe tu carta…"
            rows={7}
            className="os-input mac-scrollbar w-full resize-none rounded-lg bg-white/80 px-3 py-2 text-[12.5px] shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/50 dark:bg-neutral-800/80 dark:ring-white/10"
          />
        </div>
        {error && <p className="mt-2 text-[11px] text-rose-500">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-black/5 px-3.5 py-1.5 text-[12px] font-medium transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20">
            Cancelar
          </button>
          <button
            onClick={send}
            disabled={busy || !to.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-os)] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-50"
          >
            <Send size={12} /> Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  badge,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
        active ? "bg-[var(--accent-os)] text-white shadow-sm" : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {badge ? (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/25" : "bg-[var(--accent-os)] text-white"}`}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}
