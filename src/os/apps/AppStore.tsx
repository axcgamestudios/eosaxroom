"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Download, Search, Store, Trash2, ChevronLeft, Play } from "lucide-react";
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
import { installNative, isNativeInstalled, onNativeAppsChanged, uninstallNative } from "../services/nativeapps";

/* ============================================================
   App Store de macOS — la tienda REAL del sistema:
   catálogo con apps web de verdad (se instalan con ventana
   propia y el motor de navegación dentro), apps nativas
   descargables (Unity + Unity Player) con progreso de
   descarga, y pestañas Descubrir / Crear / Jugar / Instaladas.
   ============================================================ */

type SideTab = "discover" | "create" | "play" | "develop" | "installed";

const CREATE_CATS = new Set(["Fotografía", "Productividad", "Educación"]);

function appIconFor(a: StoreApp): React.ReactNode {
  if (a.nativeInstall || a.nativeAppId) {
    const def = getAppDef(a.nativeInstall?.[0] ?? a.nativeAppId ?? "");
    if (def) {
      const Icon = def.icon;
      return <Icon className="h-full w-full" />;
    }
  }
  const letter = a.name.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span className="flex h-full w-full items-center justify-center text-[34%] font-bold text-white" style={{ background: tileGradientFor(a.url || a.name) }}>
      {letter}
    </span>
  );
}

function categoryOf(a: StoreApp): string {
  return a.category;
}

export default function AppStoreApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const openApp = useOS((s) => s.openApp);
  const [tab, setTab] = useState<SideTab>("discover");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<StoreApp | null>(null);
  /** progreso de descarga de apps nativas: sid → 0..1 */
  const [progress, setProgress] = useState<Record<string, number>>({});

  const installed = useWebApps();
  const installedUrls = useMemo(() => new Set(installed.map((m) => m.url)), [installed]);
  const [nativeIds, setNativeIds] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setNativeIds((_) => (isNativeInstalled("unity") ? ["unity", "unityplayer"] : []));
    read();
    return onNativeAppsChanged(read);
  }, []);

  const query = q.trim().toLowerCase();

  const visible = useMemo(() => {
    let list = STORE_CATALOG.filter((a) => {
      if (tab === "create") return CREATE_CATS.has(categoryOf(a));
      if (tab === "play") return categoryOf(a) === "Juegos";
      if (tab === "develop") return categoryOf(a) === "Desarrollo";
      return true;
    });
    if (query) {
      list = STORE_CATALOG.filter(
        (a) => a.name.toLowerCase().includes(query) || a.developer.toLowerCase().includes(query) || a.category.toLowerCase().includes(query)
      );
    }
    return list;
  }, [tab, query]);

  const hero = visible.find((a) => a.hero) ?? null;
  const rest = visible.filter((a) => a !== hero);

  /* ---------- instalación con descarga visible ---------- */
  const startInstall = (app: StoreApp) => {
    if (app.nativeInstall) {
      if (app.nativeInstall.every((id) => isNativeInstalled(id))) return;
      const total = app.sizeMb ?? 2.4;
      setProgress((p) => ({ ...p, [app.sid]: 0 }));
      const t0 = Date.now();
      const dur = 2600 + total * 400;
      const iv = window.setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / dur);
        setProgress((p) => ({ ...p, [app.sid]: k }));
        if (k >= 1) {
          window.clearInterval(iv);
          installNative(app.nativeInstall!);
          setProgress((p) => {
            const n = { ...p };
            delete n[app.sid];
            return n;
          });
          notify("appstore", `${app.name} instalada`, "Se añadió al Dock y al Launchpad. Se ejecuta sin conexión.");
        }
      }, 90);
      return;
    }
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

  const stateOf = (a: StoreApp): "installed" | "installing" | "get" | "open-native" => {
    if (a.nativeInstall) return a.nativeInstall.every((id) => nativeIds.includes(id)) ? "open-native" : progress[a.sid] !== undefined ? "installing" : "get";
    if (a.nativeAppId) return "open-native";
    return installedUrls.has(a.url) ? "installed" : "get";
  };

  const openAppByStoreApp = (a: StoreApp) => {
    if (a.nativeInstall) openApp(a.nativeInstall[0]);
    else if (a.nativeAppId) openApp(a.nativeAppId);
    else openInstalled(a.url);
  };

  const GetButton = ({ a, wide }: { a: StoreApp; wide?: boolean }) => {
    const st = stateOf(a);
    const pr = progress[a.sid] ?? 0;
    if (st === "installing") {
      return (
        <span className={`flex items-center gap-2 rounded-full bg-[var(--accent-os)] px-3 py-1 text-[11px] font-semibold text-white ${wide ? "" : "w-[74px] justify-center"}`}>
          <span className="h-3 w-3 animate-spin rounded-full border-[1.6px] border-white/40 border-t-white" />
          {(a.sizeMb ?? 2.4) * pr >= 0.1 ? `${(a.sizeMb! * pr).toFixed(1)} MB` : "…"}
        </span>
      );
    }
    if (st === "installed") {
      return (
        <button onClick={() => openInstalled(a.url)} className={`rounded-full bg-black/10 px-3.5 py-1 text-[11px] font-bold text-[var(--accent-os)] transition hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/25 ${wide ? "" : "w-[74px]"}`}>
          Abrir
        </button>
      );
    }
    if (st === "open-native") {
      return (
        <button onClick={() => openAppByStoreApp(a)} className={`rounded-full bg-black/10 px-3.5 py-1 text-[11px] font-bold text-[var(--accent-os)] transition hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/25 ${wide ? "" : "w-[74px]"}`}>
          Abrir
        </button>
      );
    }
    return (
      <button
        onClick={() => startInstall(a)}
        className={`rounded-full bg-[var(--accent-os)] px-3.5 py-1 text-[11px] font-bold text-white transition hover:brightness-110 ${wide ? "" : "w-[74px]"}`}
      >
        Obtener
      </button>
    );
  };

  /* ---------- render ---------- */
  return (
    <div className="flex h-full bg-white dark:bg-neutral-950">
      {/* sidebar */}
      <div className="flex w-52 shrink-0 flex-col border-r border-black/8 bg-neutral-100/80 px-2 py-3 dark:border-white/8 dark:bg-neutral-900/80">
        <div className="mb-3 flex items-center gap-2 px-2">
          <Store size={16} className="text-[var(--accent-os)]" />
          <span className="text-[13px] font-bold tracking-tight">App Store</span>
        </div>
        <SideBtn active={tab === "discover" && !detail} onClick={() => { setTab("discover"); setDetail(null); }} label="Descubrir" icon={<Search size={13} />} />
        <SideBtn active={tab === "create" && !detail} onClick={() => { setTab("create"); setDetail(null); }} label="Crear" icon={<Download size={13} />} />
        <SideBtn active={tab === "play" && !detail} onClick={() => { setTab("play"); setDetail(null); }} label="Jugar" icon={<Play size={12} fill="currentColor" />} />
        <SideBtn active={tab === "develop" && !detail} onClick={() => { setTab("develop"); setDetail(null); }} label="Desarrollar" icon={<Download size={13} />} />
        <SideBtn active={tab === "installed" && !detail} onClick={() => { setTab("installed"); setDetail(null); }} label={`Instaladas${installed.length + nativeIds.length ? ` (${installed.length + nativeIds.length})` : ""}`} icon={<CircleCheck size={13} />} />
        <div className="mt-auto px-2 pb-1 text-[10px] leading-relaxed text-neutral-400">
          Apps web reales que se instalan con ventana propia y el motor de navegación dentro. Unity se descarga e instala
          como app nativa del sistema.
        </div>
      </div>

      {/* contenido */}
      <div className="mac-scrollbar min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-black/8 bg-white/85 px-5 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-950/85">
          {detail && (
            <button onClick={() => setDetail(null)} className="mr-1 flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[var(--accent-os)] hover:bg-black/5 dark:hover:bg-white/10">
              <ChevronLeft size={14} /> Atrás
            </button>
          )}
          <Search size={13} className="shrink-0 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setDetail(null);
            }}
            placeholder="Buscar apps, juegos y más"
            className="os-input h-7 w-full max-w-sm rounded-md bg-black/5 px-2.5 text-[12px] text-neutral-800 outline-none placeholder:text-neutral-400 dark:bg-white/10 dark:text-neutral-100"
          />
        </div>

        {/* ------- ficha de detalle ------- */}
        {detail ? (
          <div className="px-6 py-6">
            <div className="flex items-start gap-5">
              <span className="flex h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[24%] shadow-lg ring-1 ring-black/10 dark:ring-white/15">{appIconFor(detail)}</span>
              <div className="min-w-0 flex-1">
                <h1 className="text-[22px] font-bold leading-tight text-neutral-900 dark:text-white">{detail.name}</h1>
                <p className="text-[13px] text-[var(--accent-os)]">{detail.developer}</p>
                <div className="mt-2 flex items-center gap-3">
                  <GetButton a={detail} wide />
                  <span className="text-[11px] text-neutral-500">{detail.category}</span>
                  {detail.nativeInstall && <span className="text-[11px] text-neutral-500">{detail.sizeMb} MB · sin conexión</span>}
                  {!detail.nativeInstall && !detail.nativeAppId && <span className="text-[11px] text-neutral-500">gratis</span>}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="mb-2 text-[15px] font-bold text-neutral-800 dark:text-neutral-100">Descripción</h2>
              <p className="max-w-2xl text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{detail.description}</p>
            </div>

            {detail.nativeInstall && (
              <div className="mt-8 max-w-2xl rounded-2xl border border-black/8 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="mb-2 text-[13px] font-bold text-neutral-800 dark:text-neutral-100">Qué incluye la descarga</h3>
                <ul className="list-inside list-disc space-y-1 text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                  <li><b>Unity</b>: editor completo — jerarquía, vista de escena con gizmos, inspector, física, consola y Play mode.</li>
                  <li><b>Unity Player</b>: app separada para ejecutar tus proyectos a pantalla completa.</li>
                  <li>Scripts en <b>C#</b> (subconjunto de Unity) interpretado en local: MonoBehaviour, Input, Mathf, Vector3, Debug, colisiones.</li>
                  <li>Proyectos exportables como <b>.unityweb.json</b> para pasarlos a otro equipo.</li>
                </ul>
              </div>
            )}

            <div className="mt-8 max-w-2xl space-y-[6px] text-[12px]">
              <InfoRow k="Desarrollador" v={detail.developer} />
              <InfoRow k="Categoría" v={detail.category} />
              <InfoRow k="Compatibilidad" v="macOS (este sistema)" />
              <InfoRow k="Idioma" v="Español / Inglés" />
            </div>
          </div>
        ) : tab === "installed" ? (
          /* ------- instaladas ------- */
          <div className="px-5 py-5">
            <h1 className="mb-4 text-[19px] font-bold text-neutral-900 dark:text-white">Instaladas</h1>
            {installed.length === 0 && nativeIds.length === 0 && (
              <p className="rounded-xl border border-black/8 bg-black/[0.02] p-8 text-center text-[12px] text-neutral-500 dark:border-white/10 dark:bg-white/[0.03]">
                Todavía no has instalado nada. Ve a <b>Descubrir</b> y pulsa Obtener — Unity es buen comienzo.
              </p>
            )}
            {nativeIds.map((id) => {
              const def = getAppDef(id);
              if (!def) return null;
              const Icon = def.icon;
              return (
                <div key={id} className="mb-2 flex items-center gap-3 rounded-xl border border-black/8 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-[24%] ring-1 ring-black/10 dark:ring-white/15">
                    <Icon className="h-full w-full" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{def.name}</div>
                    <div className="text-[11px] text-neutral-500">App nativa del sistema · se ejecuta sin conexión</div>
                  </div>
                  <button onClick={() => openApp(id)} className="mr-2 rounded-full bg-black/10 px-3.5 py-1 text-[11px] font-bold text-[var(--accent-os)] hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/25">
                    Abrir
                  </button>
                  <button
                    onClick={() => {
                      uninstallNative(id);
                      setNativeIds(isNativeInstalled("unity") ? ["unity", "unityplayer"] : []);
                      notify("appstore", `${def.name} desinstalada`, "Se quitó del Dock y del Launchpad");
                    }}
                    className="rounded-full p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-500"
                    title="Desinstalar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {installed.map((m) => (
              <div key={m.id} className="mb-2 flex items-center gap-3 rounded-xl border border-black/8 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <img src={m.icon || ""} alt="" className="h-12 w-12 shrink-0 rounded-[24%] bg-white object-contain p-1.5 ring-1 ring-black/10 dark:ring-white/15" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{m.name}</div>
                  <div className="text-[11px] text-neutral-500">{m.host} · app web con motor integrado</div>
                </div>
                <button onClick={() => openApp(`webapp:${m.id}`)} className="mr-2 rounded-full bg-black/10 px-3.5 py-1 text-[11px] font-bold text-[var(--accent-os)] hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/25">
                  Abrir
                </button>
                <button
                  onClick={() => {
                    uninstallWebApp(m.id);
                    notify("appstore", `${m.name} desinstalada`, "Se quitó del Dock y del Launchpad");
                  }}
                  className="rounded-full p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-500"
                  title="Desinstalar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <h2 className="mb-2 mt-8 text-[15px] font-bold text-neutral-800 dark:text-neutral-100">Incluidas en macOS</h2>
            {STORE_INCLUDED.map((inc) => {
              const def = getAppDef(inc.appId);
              if (!def) return null;
              const Icon = def.icon;
              return (
                <div key={inc.appId} className="mb-2 flex items-center gap-3 rounded-xl border border-black/8 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-[24%] ring-1 ring-black/10 dark:ring-white/15">
                    <Icon className="h-full w-full" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{inc.name}</div>
                    <div className="text-[11px] text-neutral-500">{inc.description}</div>
                  </div>
                  <button onClick={() => openApp(inc.appId)} className="rounded-full bg-black/10 px-3.5 py-1 text-[11px] font-bold text-[var(--accent-os)] hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/25">
                    Abrir
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          /* ------- descubrir ------- */
          <div className="px-5 py-5">
            {hero && (
              <button onClick={() => setDetail(hero)} className="lg-sheen mb-7 flex w-full items-center gap-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#101319] via-[#1b2230] to-[#2a3550] p-6 text-left shadow-lg ring-1 ring-black/40">
                <span className="flex h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[24%] shadow-2xl ring-1 ring-white/20">
                  {appIconFor(hero)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/50">Ahora en la App Store</p>
                  <h1 className="mt-0.5 text-[24px] font-bold leading-tight text-white">{hero.name}</h1>
                  <p className="mt-1 line-clamp-2 max-w-xl text-[12.5px] leading-relaxed text-white/65">{hero.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
                    <Download size={11} /> {hero.sizeMb} MB · instalación local
                  </span>
                </div>
                <span onClick={(e) => { e.stopPropagation(); startInstall(hero); }} className="shrink-0">
                  <GetButton a={hero} />
                </span>
              </button>
            )}

            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[17px] font-bold text-neutral-900 dark:text-white">Apps y juegos</h2>
              <span className="text-[11px] text-neutral-500">{visible.length} resultados</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
              {rest.map((a) => (
                <button key={a.sid} onClick={() => setDetail(a)} className="flex items-center gap-3 rounded-xl border border-black/8 bg-black/[0.02] p-3 text-left transition hover:border-[var(--accent-os)]/50 hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
                  <span className="flex h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[24%] shadow-md ring-1 ring-black/10 dark:ring-white/15">{appIconFor(a)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{a.name}</div>
                    <div className="truncate text-[11px] text-neutral-500">{a.description}</div>
                    <div className="mt-0.5 text-[10.5px] text-neutral-400">{a.category} · {a.developer}</div>
                  </div>
                  <GetButton a={a} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SideBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12.5px] font-medium ${
        active ? "bg-[var(--accent-os)] text-white" : "text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </button>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/6 pb-[5px] text-neutral-600 dark:border-white/8 dark:text-neutral-300">
      <span className="font-semibold text-neutral-500 dark:text-neutral-500">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
