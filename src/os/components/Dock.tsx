"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOS } from "../store";
import { getAppDef } from "../registry";
import { LaunchpadIcon, TrashIcon } from "../icons";

const DOCK_APPS = [
  "finder",
  "launchpad",
  "safari",
  "youtube",
  "messages",
  "axcgames",
  "notes",
  "calculator",
  "terminal",
  "settings",
];

export default function Dock() {
  const openApp = useOS((s) => s.openApp);
  const focusWindow = useOS((s) => s.focusWindow);
  const windows = useOS((s) => s.windows);
  const settings = useOS((s) => s.settings);
  const bouncing = useOS((s) => s.bouncing);
  const setLaunchpad = useOS((s) => s.setLaunchpad);
  const notify = useOS((s) => s.notify);
  const [mx, setMx] = useState<number | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [centers, setCenters] = useState<Record<string, number>>({});
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const size = settings.dockSize;

  // derive which apps are currently bouncing (launched < 1.9s ago)
  const bounceIds = useMemo(
    () =>
      Object.entries(bouncing)
        .filter(([, t]) => Date.now() - t < 1900)
        .map(([id]) => id),
    [bouncing]
  );

  // schedule a re-render when the bounce animations expire
  useEffect(() => {
    if (Object.keys(bouncing).length === 0) return;
    const timers = Object.entries(bouncing).map(([, t]) =>
      setTimeout(() => setTick((n) => n + 1), Math.max(100, 1950 - (Date.now() - t)))
    );
    return () => timers.forEach(clearTimeout);
  }, [bouncing]);

  // measure icon centers (after mount and on layout changes)
  useEffect(() => {
    const measure = () => {
      const next: Record<string, number> = {};
      Object.entries(refs.current).forEach(([id, el]) => {
        if (el) next[id] = el.getBoundingClientRect().left + el.offsetWidth / 2;
      });
      setCenters((prev) => {
        const same =
          Object.keys(prev).length === Object.keys(next).length &&
          Object.entries(next).every(([k, v]) => Math.abs((prev[k] ?? -1) - v) < 1);
        return same ? prev : next;
      });
    };
    measure();
    const t = setTimeout(measure, 120); // after magnify transitions settle
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [size, settings.dockMagnify]);

  const runningApps = new Set(windows.map((w) => w.appId));

  const activate = (appId: string) => {
    if (appId === "launchpad") {
      setLaunchpad(true);
      return;
    }
    if (appId === "trash") {
      openApp("finder", { title: "Papelera", payload: { location: "trash" } });
      return;
    }
    // if already running: focus latest window instead of new instance
    const existing = windows.filter((w) => w.appId === appId).sort((a, b) => b.z - a.z)[0];
    if (existing) {
      focusWindow(existing.id);
      // clicking dock of single-instance app w/ window: just focus (openApp would focus too)
      if (getAppDef(appId)?.singleInstance === false && existing) return;
    } else {
      openApp(appId);
    }
  };

  const scaleFor = (id: string) => {
    if (!settings.dockMagnify || mx === null) return 1;
    const c = centers[id];
    if (!c) return 1;
    const d = Math.abs(c - mx);
    const sigma = size * 1.15;
    const s = 1 + 0.5 * Math.exp(-(d * d) / (2 * sigma * sigma));
    return s;
  };

  const items = [...DOCK_APPS, "trash"];

  return (
    <div
      className="os-no-select fixed inset-x-0 bottom-0 z-[4400] flex justify-center"
      style={{ paddingBottom: 6 }}
      onPointerLeave={() => {
        setMx(null);
        setHovered(null);
      }}
    >
      <div
        onPointerMove={(e) => setMx(e.clientX)}
        className={`lg-specular flex items-end gap-[6px] rounded-[22px] px-[7px] pb-[7px] pt-[7px] ${
          settings.reduceTransparency
            ? "bg-[#e9e9ec]/95 shadow-xl dark:bg-[#232326]/95"
            : "glass"
        }`}
        style={{ marginBottom: 0 }}
      >
        {items.map((appId) => {
          const def = appId === "launchpad" ? null : getAppDef(appId);
          const Icon = appId === "launchpad" ? LaunchpadIcon : appId === "trash" ? TrashIcon : def!.icon;
          const label =
            appId === "launchpad" ? "Launchpad" : appId === "trash" ? "Papelera" : def!.name;
          const s = scaleFor(appId);
          const isRunning = appId !== "trash" && appId !== "launchpad" && runningApps.has(appId);
          const bouncingNow = bounceIds.includes(appId);
          return (
            <div key={appId} className="flex items-end">
              {appId === "trash" && (
                <span className="mx-[5px] mb-4 h-10 w-[1px] shrink-0 rounded bg-black/15 dark:bg-white/20" />
              )}
              <div className="relative flex flex-col items-center">
              {/* tooltip */}
              {hovered === appId && (
                <div className="glass lg-specular pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium text-neutral-800 shadow-md dark:text-neutral-100">
                  {label}
                </div>
              )}
              <button
                ref={(el) => {
                  refs.current[appId] = el;
                }}
                onMouseEnter={() => setHovered(appId)}
                onClick={() => activate(appId)}
                className="group relative block origin-bottom transition-transform duration-100 ease-out"
                style={{
                  width: size,
                  height: size,
                  transform: `translateY(${-(s - 1) * size * 0.5}px) scale(${s})`,
                  zIndex: Math.round(s * 10),
                }}
                aria-label={label}
              >
                <span className={bouncingNow ? "animate-dock-bounce block h-full w-full" : "block h-full w-full"}>
                  <Icon className="h-full w-full drop-shadow-[0_3px_5px_rgba(0,0,0,0.25)]" />
                </span>
              </button>
              <span
                className={`mt-[2px] h-[4px] w-[4px] rounded-full transition ${
                  isRunning ? "bg-neutral-500 dark:bg-neutral-300 opacity-80" : "opacity-0"
                }`}
              />
              {appId === "trash" && <span className="sr-only">Papelera</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
