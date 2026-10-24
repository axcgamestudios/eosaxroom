"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe, Info, Monitor, Palette, Sun, Moon, Upload, User, Search as SearchIcon, ShieldCheck, LogOut, LogIn } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { ACCENTS, CUSTOM_WALLPAPER_ID, WALLPAPERS } from "../wallpapers";
import { PearLogo } from "../icons";
import {
  BAREMUX_VERSION,
  DEMO_WISP,
  LIBCURL_VERSION,
  MAIN_WISP,
  SCRAMJET_VERSION,
  getDiagnostics,
  onDiagnostics,
  recoverEngine,
  type EngineDiagnostics,
} from "../engine/scramjet";
import { getAccount, onAccount, type AosIdProfile } from "../services/account";
import { checkEmailCode, getAxcid, markEmailVerified, sendEmailCode, type AxcidEntry } from "../services/axcid";
import { deleteCredential, useVault } from "../services/vault";
import {
  clearEngineSiteData,
  isWebSessionBindingEnabled,
  setWebSessionBindingEnabled,
} from "../services/websession";
type Pane = "appearance" | "wallpaper" | "dock" | "browser" | "account" | "general";

const PANES: { id: Pane; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "wallpaper", label: "Fondo de pantalla", icon: Monitor },
  { id: "dock", label: "Dock y barra de menús", icon: Sun },
  { id: "browser", label: "Navegador", icon: Globe },
  { id: "account", label: "Cuenta", icon: User },
  { id: "general", label: "General", icon: Info },
];

/** reescala una imagen a dataURL (para wallpapers/avatares sin ocupar mucho localStorage) */
function fileToDataUrl(file: File, maxW: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="mb-4">
      {title && <h3 className="mb-2 ml-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>}
      <div className="overflow-hidden rounded-xl border border-black/8 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/60">
        {children}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 px-4 py-3 last:border-0 dark:border-white/5">
      {children}
    </div>
  );
}

export default function SettingsApp({ win }: AppProps) {
  const settings = useOS((s) => s.settings);
  const sys = useOS((s) => s.sys);
  const setSys = useOS((s) => s.setSys);
  const update = useOS((s) => s.updateSettings);
  const openApp = useOS((s) => s.openApp);
  const browser = useOS((s) => s.browser);
  const updateBrowser = useOS((s) => s.updateBrowser);
  const notify = useOS((s) => s.notify);
  const [pane, setPane] = useState<Pane>((win.payload?.section as Pane) || "appearance");

  return (
    <div className="flex h-full">
      {/* sidebar */}
      <div className="w-48 shrink-0 border-r border-black/8 bg-neutral-100/70 backdrop-blur-2xl dark:border-white/8 dark:bg-neutral-900/60">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
          {settings.avatar ? (
            <img src={settings.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[13px] font-bold text-white">
              {settings.userName[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <div>
            <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{settings.userName}</p>
            <p className="text-[10px] text-neutral-400">Cuenta local de axcsOS</p>
          </div>
        </div>
        <div className="px-2 pt-1">
          {PANES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPane(p.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-[12px] ${
                pane === p.id
                  ? "bg-[var(--accent-os)] text-white"
                  : "text-neutral-700 hover:bg-black/8 dark:text-neutral-200 dark:hover:bg-white/10"
              }`}
            >
              <p.icon size={14} className={pane === p.id ? "text-white" : "text-[var(--accent-os)]"} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="mac-scrollbar min-w-0 flex-1 overflow-y-auto bg-neutral-50/80 p-5 dark:bg-neutral-950/80">
        <h2 className="mb-4 px-1 text-[17px] font-bold text-neutral-800 dark:text-neutral-100">
          {PANES.find((p) => p.id === pane)?.label}
        </h2>

        {pane === "appearance" && (
          <>
            <Card>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Apariencia</span>
                <div className="flex gap-2.5">
                  {(
                    [
                      { id: "light", label: "Claro", icon: Sun },
                      { id: "dark", label: "Oscuro", icon: Moon },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => update({ appearance: mode.id })}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={`flex h-11 w-16 items-center justify-center rounded-lg border-2 transition ${
                          settings.appearance === mode.id
                            ? "border-[var(--accent-os)]"
                            : "border-black/10 dark:border-white/15"
                        } ${mode.id === "light" ? "bg-white" : "bg-neutral-900"}`}
                      >
                        <mode.icon size={16} className={mode.id === "light" ? "text-neutral-700" : "text-amber-300"} />
                      </div>
                      <span className="text-[10.5px] text-neutral-500">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Color de acento</span>
                <div className="flex gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.value}
                      title={a.name}
                      onClick={() => update({ accent: a.value })}
                      className="flex h-5 w-5 items-center justify-center rounded-full transition hover:scale-110"
                      style={{ background: a.value }}
                    >
                      {settings.accent === a.value && <Check size={11} className="text-white" strokeWidth={3.5} />}
                    </button>
                  ))}
                </div>
              </Row>
              <Row>
                <div>
                  <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Reducir transparencia</p>
                  <p className="text-[10.5px] text-neutral-400">Sustituye el Liquid Glass por materiales opacos</p>
                </div>
                <Toggle checked={settings.reduceTransparency} onChange={(v) => update({ reduceTransparency: v })} />
              </Row>
              <Row>
                <div className="min-w-0">
                  <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Intensidad del desenfoque</p>
                  <p className="text-[10.5px] text-neutral-400">Cuánto difumina el Liquid Glass ({settings.glassIntensity}%)</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.glassIntensity}
                  onChange={(e) => update({ glassIntensity: Number(e.target.value) })}
                  className="w-40 accent-[var(--accent-os)]"
                />
              </Row>
              <Row>
                <div>
                  <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Velocidad de animaciones</p>
                  <p className="text-[10.5px] text-neutral-400">Aplica a ventanas, Dock y paneles del sistema</p>
                </div>
                <div className="flex gap-2">
                  {(
                    [
                      { id: "slow", label: "Lenta" },
                      { id: "normal", label: "Normal" },
                      { id: "fast", label: "Rápida" },
                    ] as const
                  ).map((m) => (
                    <ChoiceButton key={m.id} active={settings.animSpeed === m.id} onClick={() => update({ animSpeed: m.id })} label={m.label} />
                  ))}
                </div>
              </Row>
            </Card>
          </>
        )}

        {pane === "wallpaper" && (
          <>
            <Card>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                {settings.customWallpaper && (
                  <button
                    onClick={() => update({ wallpaper: CUSTOM_WALLPAPER_ID })}
                    className="group flex flex-col gap-1.5"
                  >
                    <div
                      className={`aspect-[16/10] rounded-lg border-2 bg-neutral-300 bg-cover bg-center transition shadow-sm group-hover:scale-[1.02] dark:bg-neutral-800 ${
                        settings.wallpaper === CUSTOM_WALLPAPER_ID ? "border-[var(--accent-os)]" : "border-black/10 dark:border-white/10"
                      }`}
                      style={{ backgroundImage: `url(${settings.customWallpaper})` }}
                    />
                    <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                      {settings.customWallpaperName ?? "Personalizado"}
                    </span>
                  </button>
                )}
                {WALLPAPERS.map((w) => (
                  <button key={w.id} onClick={() => update({ wallpaper: w.id })} className="group flex flex-col gap-1.5">
                    <div
                      className={`aspect-[16/10] rounded-lg border-2 bg-neutral-300 transition shadow-sm group-hover:scale-[1.02] dark:bg-neutral-800 ${
                        settings.wallpaper === w.id ? "border-[var(--accent-os)]" : "border-black/10 dark:border-white/10"
                      }`}
                      style={{ background: w.css }}
                    />
                    <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">{w.name}</span>
                  </button>
                ))}
              </div>
              <WallpaperUpload
                onUploaded={(dataUrl, name) => {
                  update({ customWallpaper: dataUrl, customWallpaperName: name, wallpaper: CUSTOM_WALLPAPER_ID });
                  notify("settings", "Fondo actualizado", "Tu imagen es ahora el fondo de pantalla.");
                }}
              />
            </Card>
          </>
        )}

        {pane === "dock" && (
          <>
            <Card>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Tamaño de los iconos</span>
                <input
                  type="range"
                  min={40}
                  max={68}
                  value={settings.dockSize}
                  onChange={(e) => update({ dockSize: Number(e.target.value) })}
                  className="w-44 accent-[var(--accent-os)]"
                />
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Ampliación</span>
                <Toggle checked={settings.dockMagnify} onChange={(v) => update({ dockMagnify: v })} />
              </Row>
            </Card>
            <Card title="Barra de menús">
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">No molestar</span>
                <Toggle checked={sys.dnd} onChange={(v) => setSys({ dnd: v })} />
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Wi-Fi</span>
                <Toggle checked={sys.wifi} onChange={(v) => setSys({ wifi: v })} />
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Bluetooth</span>
                <Toggle checked={sys.bluetooth} onChange={(v) => setSys({ bluetooth: v })} />
              </Row>
            </Card>
          </>
        )}

        {pane === "browser" && <BrowserPane />}

        {pane === "account" && <AccountPane />}

        {pane === "general" && (
          <>
            <Card title="Perfil">
              <Row>
                <div className="flex min-w-0 items-center gap-3">
                  {settings.avatar ? (
                    <img src={settings.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[14px] font-bold text-white">
                      {settings.userName[0]?.toUpperCase() ?? "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <input
                      value={settings.userName}
                      onChange={(e) => update({ userName: e.target.value.slice(0, 24) || "Usuario" })}
                      className="w-40 rounded-md border border-black/10 bg-white px-2 py-1 text-[12.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <p className="mt-1 text-[10.5px] text-neutral-400">Nombre visible en el sistema</p>
                  </div>
                </div>
                <AvatarUpload
                  onUploaded={(dataUrl) => {
                    update({ avatar: dataUrl });
                    notify("settings", "Avatar actualizado", "Foto de perfil guardada.");
                  }}
                />
              </Row>
            </Card>
            <Card title="Acerca de">
              <Row>
                <div className="flex items-center gap-4">
                  <PearLogo className="h-9 w-5 text-neutral-700 dark:text-neutral-200" />
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">axcsOS 1.0</p>
                    <p className="text-[11px] text-neutral-400">Compilación 27A1241 · Liquid Glass · Motor Scramjet {SCRAMJET_VERSION}</p>
                  </div>
                </div>
                <button
                  onClick={() => openApp("about")}
                  className="rounded-md border border-black/10 bg-white px-3 py-1 text-[11.5px] font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  Más información
                </button>
              </Row>
              {[
                ["Chip", "Z1 Silicon · 8 núcleos"],
                ["Memoria", "16 GB"],
                ["Número de serie", "Z1WEB27X0001"],
                ["Pantalla", `${typeof window !== "undefined" ? window.screen.width : 1440} × ${typeof window !== "undefined" ? window.screen.height : 900}`],
              ].map(([k, v]) => (
                <Row key={k}>
                  <span className="text-[12.5px] text-neutral-500">{k}</span>
                  <span className="text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">{v}</span>
                </Row>
              ))}
            </Card>
            <Card title="Almacenamiento">
              <div className="p-4">
                <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div className="h-full w-[34%] rounded-full bg-gradient-to-r from-[var(--accent-os)] to-purple-500" />
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">171,4 GB usados de 512 GB · 251,42 GB libres</p>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= panel Cuenta ================= */

/* Contraseñas guardadas (bóveda AES-256) + sesión web ligada al perfil */
function VaultCard() {
  const notify = useOS((s) => s.notify);
  const session = useOS((s) => s.session);
  const entries = useVault();
  const [binding, setBinding] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setBinding(isWebSessionBindingEnabled());
  }, []);

  const toggleBinding = () => {
    const next = !binding;
    setWebSessionBindingEnabled(next);
    setBinding(next);
    notify(
      "settings",
      "Sesiones del navegador",
      next ? "Las cookies del motor quedan ligadas a tu cuenta: al cambiar de cuenta, el navegador se reinicia y se limpian" : "Las cookies del motor se comparten entre cuentas (comportamiento clásico)",
    );
  };

  const clearNow = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const r = await clearEngineSiteData();
      notify("settings", "Datos de navegación", r.detail);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card title="Contraseñas y autocompletado">
      <Row>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">
            Contraseñas guardadas ({entries.length})
          </p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-neutral-400">
            Cuando inicies sesión en una página con el Navegador, te ofrecerá guardar la contraseña. Se almacena cifrada con
            <b> AES-256-GCM</b> y una clave propia de este dispositivo: nunca en texto plano.
          </p>
          {entries.length > 0 && (
            <div className="mac-scrollbar mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg bg-black/[0.03] p-1.5 dark:bg-white/[0.04]">
              {entries.map((e) => (
                <div key={e.domain} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-medium text-neutral-700 dark:text-neutral-200">{e.domain}</p>
                    <p className="truncate text-[10px] text-neutral-400">
                      {e.username} · guardada el {new Date(e.updatedAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      deleteCredential(e.domain);
                      notify("settings", "Contraseña eliminada", `${e.domain} ya no está en la bóveda`);
                    }}
                    className="shrink-0 rounded-md px-2 py-1 text-[10.5px] font-medium text-rose-500 transition hover:bg-rose-500/10"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Row>
      <Row>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Sesiones ligadas a la cuenta{session ? ` «${session.username}»` : ""}</p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-neutral-400">
            Las cookies de navegación se asocian a tu cuenta: al volver a abrir el navegador, las páginas siguen con la
            sesión iniciada; si entra OTRA cuenta en este dispositivo, el navegador se reinicia y sus datos se borran de
            verdad (nada se hereda entre perfiles). El borrado manual también reinicia: es la única forma real de
            liberar la base del motor.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={toggleBinding}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                binding ? "bg-[var(--accent-os)] text-white hover:opacity-90" : "border border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
              }`}
            >
              {binding ? "Ligadas a la cuenta ✓ (tocar para desactivar)" : "Desactivado: cookies compartidas (tocar para ligar)"}
            </button>
            <button
              onClick={() => void clearNow()}
              disabled={clearing}
              className="rounded-md border border-rose-500/30 px-3 py-1.5 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
            >
              {clearing ? "Reiniciando…" : "Borrar datos de navegación (reinicia)"}
            </button>
          </div>
        </div>
      </Row>
    </Card>
  );
}

/* AXC ID: correo verificado → sesión persistente con cookie + entrada por código */
function AxcIdCard() {
  const session = useOS((s) => s.session);
  const logout = useOS((s) => s.logout);
  const notify = useOS((s) => s.notify);
  const [entry, setEntry] = useState<AxcidEntry | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = () => {
    if (!session) return;
    const e = getAxcid(session.accountId);
    setEntry(e);
    setEmail(e?.email ?? "");
  };
  useEffect(() => {
    reload();
    setSent(false);
    setCode("");
    setMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accountId]);

  if (!session) {
    return (
      <Card title="AXC ID · correo">
        <Row>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Sin sesión iniciada</p>
            <p className="text-[10.5px] text-neutral-400">Inicia sesión con tu cuenta para gestionar tu correo AXC ID.</p>
          </div>
        </Row>
      </Card>
    );
  }

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await sendEmailCode(email);
      setMsg(r.detail);
      if (r.sent) setSent(true);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const c = await checkEmailCode(code);
      if (!c.ok) {
        setMsg(c.detail ?? "Código incorrecto.");
        return;
      }
      markEmailVerified(session.accountId, c.email ?? email);
      reload();
      setSent(false);
      setCode("");
      notify("settings", "Correo verificado", "Ya puedes entrar con un código a ese correo, sin contraseña.");
      setMsg("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="AXC ID · tu correo">
      <Row>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">
            Correo de la cuenta «{session.username}»
          </p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-neutral-400">
            {entry?.verified
              ? "Verificado ✓ — es el correo que el Navegador rellena por ti al iniciar sesión en la web, y al que puedes entrar sin contraseña desde la pantalla de inicio."
              : "Pon el correo que YA TIENES (Gmail, Outlook, el que sea): te llega un código de 6 dígitos y, al verificarlo, el Navegador lo usará para rellenar tus inicios de sesión en las páginas. «Recordarme» en la pantalla de inicio funciona igual, con o sin correo."}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setMsg("");
              }}
              disabled={entry?.verified || sent}
              placeholder="tu correo"
              type="email"
              className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 disabled:opacity-70 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
            />
            {!entry?.verified &&
              (sent ? (
                <button
                  onClick={() => void verify()}
                  disabled={busy || code.length < 6}
                  className="shrink-0 rounded-md bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Verificar
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={busy || !email.includes("@")}
                  className="shrink-0 rounded-md bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Enviando…" : "Enviar código"}
                </button>
              ))}
          </div>
          {sent && !entry?.verified && (
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setMsg("");
                }}
                placeholder="código de 6 dígitos"
                inputMode="numeric"
                className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] tracking-[0.3em] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <button
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setMsg("");
                }}
                className="shrink-0 rounded-md border border-black/10 px-3 py-1.5 text-[11px] font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                Reenviar
              </button>
            </div>
          )}
          {msg && <p className="mt-2 text-[10.5px] leading-relaxed text-amber-600 dark:text-amber-400">{msg}</p>}
          {entry?.verified && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-neutral-400">
              El código se envía por el servidor (/api/auth/send-otp): usa Resend si hay RESEND_API_KEY configurada y,
              si no, FormSubmit (gratuito; la primera vez pide activar su enlace desde tu correo). Las contraseñas que
              Safari te ofrezca guardar viven cifradas con AES-256 en este dispositivo (ver «Contraseñas y
              autocompletado» aquí abajo).
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            entry?.verified ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-black/5 text-neutral-400 dark:bg-white/10"
          }`}
        >
          {entry?.verified ? "verificado" : "sin verificar"}
        </span>
      </Row>
      <Row>
        <div className="min-w-0">
          <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Sesión en este dispositivo</p>
          <p className="text-[10.5px] text-neutral-400">Al cerrar sesión se borra la cookie recordada y volverá a pedirse la contraseña.</p>
        </div>
        <button
          onClick={() => logout()}
          className="shrink-0 rounded-md border border-black/10 px-3 py-1.5 text-[11px] font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          Cerrar sesión
        </button>
      </Row>
    </Card>
  );
}

function AccountPane() {
  const settings = useOS((s) => s.settings);
  const update = useOS((s) => s.updateSettings);
  const notify = useOS((s) => s.notify);
  const openApp = useOS((s) => s.openApp);
  const [account, setAccount] = useState<AosIdProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const acc = getAccount();
    setAccount(acc);
    setName(acc?.name ?? "");
    setReady(true);
    return onAccount((p) => {
      setAccount(p);
      setName(p?.name ?? "");
    });
  }, []);

  const saveName = () => {
    if (!account) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === account.name) return;
    import("../services/account").then((m) => {
      m.updateProfile({ name: trimmed });
      update({ userName: trimmed });
      notify("settings", "Cuenta axcsOS", "Nombre actualizado");
    });
  };

  if (!ready) return <div className="p-6" />;

  return (
    <>
      <Card title="axcsOS ID">
        {account ? (
          <>
            <Row>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {account.avatar ? (
                  <img src={account.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#25d366] to-[#128c7e] text-[17px] font-bold text-white">
                    {account.name[0]?.toUpperCase() ?? "A"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{account.name}</p>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(`@${account.id}`);
                      notify("settings", "ID copiado", `@${account.id} está en el portapapeles`);
                    }}
                    className="text-[10.5px] text-neutral-400 transition hover:text-[var(--accent-os)]"
                    title="Copiar ID"
                  >
                    @{account.id} · copiar
                  </button>
                  <p className="text-[10px] text-neutral-400">Cuenta del sistema · usada por Mensajes y llamadas</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">activa</span>
              </div>
            </Row>
            <Row>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Nombre visible</p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <button onClick={saveName} className="shrink-0 rounded-md bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90">
                    Guardar
                  </button>
                </div>
              </div>
            </Row>
            <Row>
              <div className="min-w-0">
                <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Perfil completo</p>
                <p className="text-[10.5px] text-neutral-400">Foto, info y estado se gestionan en Mensajes → Mi perfil</p>
              </div>
              <button
                onClick={() => openApp("messages")}
                className="shrink-0 rounded-md border border-black/10 px-3 py-1.5 text-[11px] font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                Abrir Mensajes
              </button>
            </Row>
          </>
        ) : (
          <Row>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Sin cuenta todavía</p>
              <p className="text-[10.5px] leading-relaxed text-neutral-400">
                El axcsOS ID es la cuenta del sistema: da identidad a Mensajes, llamadas y grupos con cifrado de extremo
                a extremo. Se crea en este dispositivo en segundos y no requiere configurar nada.
              </p>
            </div>
            <button
              onClick={() => openApp("messages")}
              className="shrink-0 rounded-md bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
            >
              Crear cuenta
            </button>
          </Row>
        )}
      </Card>
      <AxcIdCard />
      <VaultCard />
      <Card title="Cómo funciona tu cuenta">
        <div className="px-4 py-3 text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          El axcsOS ID vive en este dispositivo: se genera un par de claves <b>ECDH P-256</b> y tu <b>@id</b> se deriva de la
          huella de la clave pública. Los mensajes directos se cifran de extremo a extremo con <b>AES-GCM 256</b>; las
          llamadas viajan P2P con <b>WebRTC</b>. No hay servidor de cuentas que configurar: la mensajería usa brokers
          públicos MQTT con failover automático y todo lo demás queda en tu navegador.
        </div>
      </Card>
    </>
  );
}

/* ================= panel Navegador ================= */
function BrowserPane() {
  const browser = useOS((s) => s.browser);
  const updateBrowser = useOS((s) => s.updateBrowser);
  const notify = useOS((s) => s.notify);
  const clearHistory = useOS((s) => s.clearHistory);
  const [diag, setDiag] = useState<EngineDiagnostics>(getDiagnostics());
  const [repairing, setRepairing] = useState(false);

  useEffect(() => onDiagnostics(setDiag), []);

  const repair = async () => {
    setRepairing(true);
    try {
      await recoverEngine("manual desde Ajustes");
      notify("settings", "Motor de navegación", "Reparación completada");
    } catch (e) {
      notify("settings", "Motor de navegación", `No se pudo reparar: ${String((e as Error).message ?? e).slice(0, 80)}`);
    } finally {
      setRepairing(false);
    }
  };

  const statusColor =
    diag.status === "ready" ? "bg-emerald-500" : diag.status === "error" ? "bg-rose-500" : diag.status === "loading" ? "bg-amber-500" : "bg-neutral-400";

  return (
    <>
      <Card title="Motor de navegación">
        <Row>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12.5px] text-neutral-700 dark:text-neutral-200">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
              Estado: <b>{diag.status === "ready" ? "activo" : diag.status === "loading" ? "iniciando o reparando" : diag.status === "error" ? "error" : "en espera"}</b>
            </p>
            <p className="mt-0.5 text-[10.5px] text-neutral-400">
              Scramjet {SCRAMJET_VERSION} · BareMux {BAREMUX_VERSION} · libcurl {LIBCURL_VERSION}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-neutral-400">
            <span>{diag.swRegistered ? "SW registrado ✓" : "SW sin registrar"}</span>
            <span>{diag.transportSet ? "Transporte listo ✓" : "Transporte pendiente"}</span>
          </div>
        </Row>
        <Row>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Servidor de transporte (wisp)</p>
            <p className="mb-2 text-[10.5px] leading-relaxed text-neutral-400">
              Motor propio del estudio, configurado automáticamente{diag.wispUrl ? `: ${diag.wispUrl}` : "."} Si cae,
              axcsOS conmuta solo al transporte público de respaldo y regresa cuando el propio responde.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void repair()}
                disabled={repairing || diag.status === "loading"}
                className="shrink-0 rounded-md bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {repairing ? "Reparando…" : "Reparar motor"}
              </button>
            </div>
            {diag.error && <p className="mt-1.5 text-[10.5px] text-rose-500">Motor: {diag.error}</p>}
          </div>
        </Row>
        {diag.wispUrl === MAIN_WISP && (
          <div className="flex items-start gap-2 border-t border-black/5 bg-emerald-500/10 px-4 py-2.5 text-[10.5px] leading-relaxed text-emerald-700 dark:border-white/5 dark:text-emerald-300">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              Conectado al motor propio del estudio (wisp-server-node en Render): primera prioridad, sin depender de
              servicios públicos de terceros. Un mantenimiento en caliente del sistema lo mantiene despierto durante tu
              sesión; si aun así cae, el respaldo automático toma el relevo.
            </span>
          </div>
        )}
        {diag.wispUrl === DEMO_WISP && (
          <div className="flex items-start gap-2 border-t border-black/5 bg-amber-500/10 px-4 py-2.5 text-[10.5px] leading-relaxed text-amber-700 dark:border-white/5 dark:text-amber-300">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              El motor propio del estudio no responde, así que axcsOS está usando ahora el transporte público de
              demostración de Mercury Workshop (externo y sin garantía). La navegación sigue funcionando; el sistema
              volverá al motor propio en cuanto recupere la salud (pruébalo con «Reparar motor»).
            </span>
          </div>
        )}
      </Card>

      <Card title="Búsqueda">
        <Row>
          <div className="min-w-0">
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Motor de búsqueda</p>
            <p className="text-[10.5px] text-neutral-400">Resultados reales mostrados dentro del Navegador; se abren por el motor integrado.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <ChoiceButton active={browser.searchEngine === "bing"} onClick={() => updateBrowser({ searchEngine: "bing" })} label="Bing" />
            <ChoiceButton active={browser.searchEngine === "searxng"} onClick={() => updateBrowser({ searchEngine: "searxng" })} label="SearXNG" />
          </div>
        </Row>
        {browser.searchEngine === "searxng" && (
          <Row>
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[12.5px] text-neutral-700 dark:text-neutral-200">Instancia SearXNG (API JSON)</p>
              <input
                value={browser.searxngUrl}
                onChange={(e) => updateBrowser({ searxngUrl: e.target.value })}
                spellCheck={false}
                placeholder="https://searx.example.com"
                className="w-full rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <p className="mt-1.5 text-[10.5px] text-neutral-400">
                La instancia debe tener <code>format=json</code> habilitado. Sin configurar, Safari seguirá usando DuckDuckGo.
              </p>
            </div>
          </Row>
        )}
      </Card>

      <Card title="Privacidad">
        <Row>
          <div>
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Guardar historial</p>
            <p className="text-[10.5px] text-neutral-400">Las visitas se guardan solo en este dispositivo</p>
          </div>
          <Toggle checked={browser.keepHistory} onChange={(v) => updateBrowser({ keepHistory: v })} />
        </Row>
        <Row>
          <div>
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Borrar historial ahora</p>
            <p className="text-[10.5px] text-neutral-400">Elimina todas las entradas guardadas</p>
          </div>
          <button
            onClick={() => {
              clearHistory();
              notify("settings", "Historial", "Historial de navegación borrado.");
            }}
            className="shrink-0 rounded-md border border-rose-500/40 px-3 py-1 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10"
          >
            Borrar
          </button>
        </Row>
      </Card>

      <Card title="Créditos del motor">
        <div className="px-4 py-3 text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Navegación integrada con <b>Scramjet</b> (MercuryWorkshop, OSS), <b>BareMux</b> y <b>libcurl-transport</b>, con backend <b>wisp</b>
          {" "}(wisp-js). Archivos servidos desde el propio sitio (sin dependencias externas del frontend). Los sitios se cargan tal cual;
          el sistema no altera DRM ni autenticaciones de terceros.
        </div>
      </Card>
    </>
  );
}

function ChoiceButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
        active ? "bg-[var(--accent-os)] text-white" : "border border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

/* ================= subidas de archivos ================= */
function WallpaperUpload({ onUploaded }: { onUploaded: (dataUrl: string, name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-black/5 px-4 py-3 dark:border-white/5">
      <div>
        <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Usar tu propia imagen</p>
        <p className="text-[10.5px] text-neutral-400">JPG/PNG · se reescala y guarda en este dispositivo</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const dataUrl = await fileToDataUrl(f, 1920, 0.82);
            onUploaded(dataUrl, f.name.replace(/\.[^.]+$/, ""));
          } catch {
            /* imagen inválida */
          }
          e.target.value = "";
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
      >
        <Upload size={11} /> Elegir imagen…
      </button>
    </div>
  );
}

function AvatarUpload({ onUploaded }: { onUploaded: (dataUrl: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            onUploaded(await fileToDataUrl(f, 96, 0.85));
          } catch {
            /* imagen inválida */
          }
          e.target.value = "";
        }}
      />
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => ref.current?.click()}
          className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <Upload size={10} className="mr-1 inline" /> Foto
        </button>
      </div>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] rounded-full transition ${checked ? "bg-[var(--accent-os)]" : "bg-black/15 dark:bg-white/20"}`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-[2px]"}`}
      />
    </button>
  );
}
