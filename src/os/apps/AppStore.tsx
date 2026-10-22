"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Download, Search, Store, Trash2 } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { getAppDef } from "../registry";
import {
  installWebApp,
  listWebApps,
  STORE_CATALOG,
  STORE_INCLUDED,
  tileGradientFor,
  uninstallWebApp,
  useWebApps,
  type StoreApp,
} from "../services/webapps";

/* ============================================================
   App Store de axcsOS — catálogo curado del estudio
   Las apps se INSTALAN de verdad: pasan a ser apps nativas del
   sistema (ventana propia con el motor de navegación dentro) y
   aparecen en Launchpad, Dock y Spotlight.
   ============================================================ */

export default function AppStoreApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const openApp = useOS((s) => s.openApp);
  const [tab, setTab] = useState<"discover" | "installed">("discover");
  const [q, setQ] = useState("");

  const installed = useWebApps();
  const installedUrls = useMemo(() => new Set(installed.map((m) => m.url)), [installed]);

  const query = q.trim().toLowerCase();
  const catalog = useMemo(
    () =>
      STORE_CATALOG.filter(
        (a) => !query || a.name.toLowerCase().includes(query) || a.developer.toLowerCase().includes(query) || a.category.toLowerCase().includes(query)
      ),
    [query]
  );
  const hero = catalog.find((a) => a.hero) ?? null;
  const rest = catalog.filter((a) => a !== hero);

  const install = (app: StoreApp) => {
    const r = installWebApp({ url: app.url, name: app.name });
    if (r.ok && r.manifest) {
      notify("appstore", `${app.name} instalada`, "Ya está en Launchpad, el Dock y Spotlight");
    } else if (r.reason === "duplicada") {
      notify("appstore", `${app.name} ya estaba instalada`, "La tienes en Launchpad");
    }
  };

  const openInstalled = (url: string) => {
    const m = listWebApps().find((x) => x.url === url);
    if (m) openApp(`webapp:${m.id}`);
  };

  return (
    <div className="flex h-full bg-white dark:bg-neutral-950">
      {/* sidebar */}
      <div className="flex w-52 shrink-0 flex-col border-r border-black/8 bg-neutral-100/80 px-2 py-3 dark:border-white/8 dark:bg-neutral-900/80">
        <div className="mb-3 flex items-center gap-2 px-2">
          <Store size={16} className="text-[var(--accent-os)]" />
          <span className="text-[13px] font-bold tracking-tight">App Store</span>
        </div>
        <SideBtn active={tab === "discover"} onClick={() => setTab("discover")} label="Descubrir" icon={<Search size={13} />} />
        <SideBtn active={tab === "installed"} onClick={() => setTab("installed")} label={`Instaladas${installed.length ? ` (${installed.length})` : ""}`} icon={<CircleCheck size={13} />} />
        <div className="mt-auto px-2 pb-1 text-[10px] leading-relaxed text-neutral-400">
          Las apps instaladas son páginas con ventana nativa y el motor de navegación dentro: se abren y comportan
          como apps del sistema.
        </div>
      </div>

      {/* contenido */}
      <div className="mac-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-black/8 bg-white/85 px-5 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-950/85">
          <Search size={13} className="shrink-0 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar juegos y apps"
            spellCheck={false}
            className="os-input h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-neutral-400"
          />
        </div>

        {tab === "discover" ? (
          <div className="p-5">
            {/* ficha destacada */}
            {hero && !query && (
              <div className="glass lg-specular mb-6 overflow-hidden rounded-2xl">
                <div className="flex items-center gap-4 p-5">
                  <AppTileIcon url={hero.url} name={hero.name} size={72} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold tracking-widest text-[var(--accent-os)] uppercase">Destacada del estudio</div>
                    <h2 className="mt-0.5 truncate text-[19px] font-bold">{hero.name}</h2>
                    <p className="mt-0.5 text-[11px] text-neutral-400">{hero.developer} · {hero.category}</p>
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">{hero.description}</p>
                  </div>
                  <InstallBtn
                    installed={installedUrls.has(hero.url)}
                    onInstall={() => install(hero)}
                    onOpen={() => openInstalled(hero.url)}
                    small
                  />
                </div>
              </div>
            )}

            <h3 className="mb-3 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">Juegos y apps</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rest.map((app) => (
                <CatalogCard
                  key={app.sid}
                  app={app}
                  installed={installedUrls.has(app.url)}
                  onInstall={() => install(app)}
                  onOpen={() => openInstalled(app.url)}
                  onOpenNative={app.nativeAppId ? () => openApp(app.nativeAppId!) : undefined}
                />
              ))}
            </div>

            {/* apps incluidas en el sistema */}
            <h3 className="mb-3 mt-7 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">Incluidas en axcsOS</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STORE_INCLUDED.map((inc) => {
                const def = getAppDef(inc.appId);
                if (!def) return null;
                return (
                  <div key={inc.appId} className="glass rounded-2xl p-3.5">
                    <div className="flex items-center gap-3">
                      <def.icon className="h-11 w-11 shrink-0 rounded-[10px] shadow-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{inc.name}</div>
                        <div className="truncate text-[10.5px] text-neutral-400">axcsOS · app nativa del sistema</div>
                      </div>
                      <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Incluida
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">{inc.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ---------- instaladas ---------- */
          <div className="p-5">
            <h3 className="mb-3 text-[13px] font-bold text-neutral-700 dark:text-neutral-200">Apps web instaladas</h3>
            {installed.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center">
                <Download size={26} className="mx-auto mb-2 text-neutral-300" />
                <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400">
                  Todavía no hay apps instaladas. Ve a <b>Descubrir</b> e instala un juego (o instala cualquier
                  página desde Safari con el botón de instalar).
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {installed.map((m) => (
                  <div key={m.id} className="glass flex items-center gap-3.5 rounded-2xl p-3.5">
                    <AppTileIcon url={m.url} name={m.name} size={46} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{m.name}</div>
                      <div className="truncate text-[10.5px] text-neutral-400">
                        {m.host} · instalada el {new Date(m.installedAt).toLocaleDateString("es-ES")}
                      </div>
                    </div>
                    <button
                      onClick={() => openApp(`webapp:${m.id}`)}
                      className="shrink-0 rounded-full bg-[var(--accent-os)] px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:opacity-90"
                    >
                      Abrir
                    </button>
                    <button
                      onClick={() => {
                        uninstallWebApp(m.id);
                        notify("appstore", `${m.name} desinstalada`, "Se quitó de Launchpad, el Dock y Spotlight");
                      }}
                      className="shrink-0 rounded-full bg-rose-500/10 p-1.5 text-rose-500 transition hover:bg-rose-500/20"
                      title="Desinstalar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- tarjeta de catálogo ---------- */

function CatalogCard({
  app,
  installed,
  onInstall,
  onOpen,
  onOpenNative,
}: {
  app: StoreApp;
  installed: boolean;
  onInstall: () => void;
  onOpen: () => void;
  onOpenNative?: () => void;
}) {
  const native = !!app.nativeAppId;
  return (
    <div className="glass group rounded-2xl p-3.5 transition hover:shadow-md">
      <div className="flex items-center gap-3">
        {native ? <NativeYoutubeIcon /> : <AppTileIcon url={app.url} name={app.name} size={46} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold">{app.name}</div>
          <div className="truncate text-[10.5px] text-neutral-400">{app.developer} · {app.category}</div>
        </div>
        {native ? (
          <button
            onClick={onOpenNative}
            className="shrink-0 rounded-full bg-[var(--accent-os)] px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Abrir
          </button>
        ) : installed ? (
          <button
            onClick={onOpen}
            className="shrink-0 rounded-full bg-emerald-500/12 px-3.5 py-1.5 text-[11.5px] font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-500/20 dark:text-emerald-400"
          >
            Abrir
          </button>
        ) : (
          <InstallBtn installed={false} onInstall={onInstall} onOpen={onOpen} />
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">{app.description}</p>
      {native && (
        <p className="mt-1.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
          App nativa de axcsOS incluida de serie — sin instalar nada.
        </p>
      )}
    </div>
  );
}

function InstallBtn({ installed, onInstall, onOpen, small }: { installed: boolean; onInstall: () => void; onOpen: () => void; small?: boolean }) {
  if (installed)
    return (
      <button
        onClick={onOpen}
        className={`shrink-0 rounded-full bg-emerald-500/12 font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-500/20 dark:text-emerald-400 ${small ? "px-3.5 py-1.5 text-[12px]" : "px-4 py-1.5 text-[11.5px]"}`}
      >
        Abrir
      </button>
    );
  return (
    <button
      onClick={onInstall}
      className={`shrink-0 rounded-full bg-[var(--accent-os)] font-semibold text-white shadow-sm transition hover:opacity-90 ${small ? "px-3.5 py-1.5 text-[12px]" : "px-4 py-1.5 text-[11.5px]"}`}
    >
      Instalar
    </button>
  );
}

/* ---------- icono de app web: favicon real con mosaico de respaldo ---------- */

export function AppTileIcon({ url, name, size = 46 }: { url: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const icon = `https://icons.duckduckgo.com/ip3/${(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })()}.ico`;
  const letter = (name || "?").trim()[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size, background: tileGradientFor(url || name) }}
    >
      {!failed && url ? (
        <img
          src={icon}
          alt=""
          className="h-full w-full object-cover"
          style={{ background: "#fff" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-bold text-white" style={{ fontSize: size * 0.44 }}>
          {letter}
        </span>
      )}
    </div>
  );
}

function NativeYoutubeIcon() {
  const def = getAppDef("youtube");
  if (!def) return null;
  return <def.icon className="h-[46px] w-[46px] shrink-0 rounded-[10px] shadow-sm" />;
}

function SideBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
        active ? "bg-[var(--accent-os)] text-white shadow-sm" : "text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </button>
  );
}
