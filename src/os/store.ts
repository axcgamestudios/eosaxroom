"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { stopSessionGuard } from "./services/auth";
import { clearStaySession } from "./services/axcid";
import type {
  Bookmark,
  BrowserSettings,
  DownloadItem,
  HistoryEntry,
  Note,
  OsNotification,
  OsSettings,
  Rect,
  Stage,
  WindowOpenOptions,
  WindowState,
} from "./types";
import { DEFAULT_WALLPAPER, PREVIOUS_DEFAULT_WALLPAPER } from "./wallpapers";
import { getAppDef } from "./registry";
import { defaultWisp, startWispKeepalive } from "./engine/scramjet";

const MENUBAR_H = 30;
const DOCK_RESERVED = 96;

const SEED_NOTES: Note[] = [
  {
    id: "note-welcome",
    title: "Bienvenido a axcsOS",
    content:
      "Bienvenido a axcsOS 1.0 “Liquid Glass”.\n\nCosas que puedes probar:\n• ⌘ + Espacio abre Spotlight\n• ⌘ + Tab cambia de aplicación\n• Haz clic derecho en el escritorio\n• Abre la app AXCGAMES desde el Dock\n\nTodo se guarda automáticamente en este navegador.",
    updatedAt: Date.now(),
    folder: "Notas",
  },
  {
    id: "note-shortcuts",
    title: "Atajos de teclado",
    content:
      "Atajos útiles del sistema:\n\n⌘ Espacio — Spotlight\n⌘ Tab — Cambiar app\n⌘ W — Cerrar ventana\n⌘ M — Minimizar\n⌘ Q — Salir de la app\n⌘ , — Ajustes\n\nLos semáforos (rojo, amarillo, verde) están en la esquina superior izquierda de cada ventana.",
    updatedAt: Date.now() - 86400000,
    folder: "Notas",
  },
];

export interface SysState {
  volume: number;
  brightness: number;
  wifi: boolean;
  bluetooth: boolean;
  airdrop: boolean;
  dnd: boolean;
  stageManager: boolean;
}

interface OsStore {
  stage: Stage;
  booted: boolean;
  session: { accountId: string; username: string } | null;
  kickMessage: string;
  windows: WindowState[];
  zTop: number;
  activeId: string | null;
  cascade: number;
  bouncing: Record<string, number>;
  spotlightOpen: boolean;
  launchpadOpen: boolean;
  controlCenterOpen: boolean;
  notifCenterOpen: boolean;
  switcherOpen: boolean;
  settings: OsSettings;
  sys: SysState;
  notes: Note[];
  notifications: OsNotification[];
  downloads: DownloadItem[];
  trashCount: number;
  browser: BrowserSettings;
  safariHistory: HistoryEntry[];
  bookmarks: Bookmark[];

  setStage: (s: Stage) => void;
  finishBoot: () => void;
  login: (account?: { id: string; username: string }) => void;
  logout: () => void;
  logoutFromKick: (message: string) => void;
  setKickMessage: (m: string) => void;
  lock: () => void;

  openApp: (appId: string, opts?: WindowOpenOptions) => string | null;
  closeWindow: (id: string) => void;
  closeApp: (appId: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  zoomWindow: (id: string) => void;
  refitMaximized: () => void;
  setWindowRect: (id: string, rect: Partial<Rect>) => void;
  setWindowTitle: (id: string, title: string) => void;
  minimizeActive: () => void;

  updateSettings: (patch: Partial<OsSettings>) => void;
  setSys: (patch: Partial<SysState>) => void;

  updateBrowser: (patch: Partial<BrowserSettings>) => void;
  addHistory: (url: string, title: string) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  addBookmark: (b: Omit<Bookmark, "id">) => string;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, patch: Partial<Bookmark>) => void;

  upsertNote: (note: Partial<Note> & { id?: string }) => string;
  deleteNote: (id: string) => void;

  addDownload: (d: Omit<DownloadItem, "id" | "date">) => string;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;

  notify: (appId: string, title: string, body: string) => void;
  dismissNotification: (id: string) => void;

  setSpotlight: (open: boolean) => void;
  setLaunchpad: (open: boolean) => void;
  setControlCenter: (open: boolean) => void;
  setNotifCenter: (open: boolean) => void;
  setSwitcher: (open: boolean) => void;
  closePopovers: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* objectURLs de descargas (solo sesión actual, no persisten) */
const downloadUrls = new Map<string, string>();
export function setDownloadObjectUrl(id: string, url: string) {
  downloadUrls.set(id, url);
}
export function getDownloadObjectUrl(id: string): string | undefined {
  return downloadUrls.get(id);
}

/* migrar la clave antigua de persistencia a la nueva (y estrenar wallpaper Golden Gate) */
if (typeof window !== "undefined") {
  try {
    if (!window.localStorage.getItem("axcsos")) {
      const old = window.localStorage.getItem("macos-web-27");
      if (old) {
        const parsed = JSON.parse(old);
        const oldState = parsed.state ?? {};
        window.localStorage.setItem(
          "axcsos",
          JSON.stringify({
            ...parsed,
            state: {
              ...oldState,
              downloads: [],
              settings: { ...(oldState.settings ?? {}), wallpaper: "goldengate" },
            },
          })
        );
      }
    }
  } catch {
    /* ignore */
  }
}

let uidCounter = 0;
const uid = (prefix = "w") =>
  `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

export const useOS = create<OsStore>()(
  persist(
    (set, get) => ({
      stage: "boot",
      booted: false,
      session: null,
      kickMessage: "",
      windows: [],
      zTop: 10,
      activeId: null,
      cascade: 0,
      bouncing: {},
      spotlightOpen: false,
      launchpadOpen: false,
      controlCenterOpen: false,
      notifCenterOpen: false,
      switcherOpen: false,
      settings: {
        wallpaper: DEFAULT_WALLPAPER,
        appearance: "dark",
        accent: "#0a84ff",
        dockSize: 52,
        dockMagnify: true,
        reduceTransparency: false,
        userName: "Usuario",
        glassIntensity: 65,
        animSpeed: "normal",
      },
      sys: {
        volume: 65,
        brightness: 100,
        wifi: true,
        bluetooth: true,
        airdrop: false,
        dnd: false,
        stageManager: false,
      },
      notes: SEED_NOTES,
      notifications: [],
      downloads: [],
      trashCount: 3,
      browser: {
        wispUrl: "",
        searchEngine: "bing",
        searxngUrl: "",
        keepHistory: true,
      },
      safariHistory: [],
      bookmarks: [
        { id: "bm-axcgames", url: "https://axcgamestudios.github.io/nueva-pestana/", name: "AXCGAMES", folder: "Favoritos" },
        { id: "bm-youtube", url: "https://www.youtube.com", name: "YouTube", folder: "Favoritos" },
        { id: "bm-wikipedia", url: "https://es.wikipedia.org", name: "Wikipedia", folder: "Favoritos" },
        { id: "bm-ddg", url: "https://duckduckgo.com", name: "DuckDuckGo", folder: "Favoritos" },
      ],

      setStage: (s) => set({ stage: s }),
      finishBoot: () => set({ booted: true, stage: "login" }),
      login: (account) => {
        set({
          stage: "desktop",
          kickMessage: "",
          ...(account ? { session: { accountId: account.id, username: account.username }, settings: { ...get().settings, userName: account.username } } : {}),
        });
        // mantiene el motor de navegación propio (Render) caliente durante la sesión
        startWispKeepalive();
        // sesión web ligada al perfil: las cookies del motor se asocian a ESTA
        // cuenta — mismo perfil las conserva (sesiones persistentes), cambio de
        // cuenta las borra (nada se hereda entre perfiles)
        if (account?.id) {
          void import("./services/websession").then((m) => m.bindEngineSessionToProfile(account.id)).catch(() => undefined);
        }
        const who = account?.username ?? get().settings.userName;
        setTimeout(() => {
          get().notify("finder", `Hola, ${who}`, "Sesión iniciada en axcsOS.");
        }, 900);
      },
      logout: () => {
        stopSessionGuard(); // 1 dispositivo por cuenta: esta sesión deja de afirmarse
        clearStaySession(); // la cookie de «no volver a iniciar sesión» se va con la sesión
        set({
          stage: "login",
          session: null,
          windows: [],
          activeId: null,
          spotlightOpen: false,
          launchpadOpen: false,
          controlCenterOpen: false,
          notifCenterOpen: false,
        });
      },
      logoutFromKick: (message) => {
        stopSessionGuard();
        clearStaySession(); // la cuenta pasó a otro dispositivo: aquí ya no se recuerda
        set({
          stage: "login",
          session: null,
          kickMessage: message,
          windows: [],
          activeId: null,
          spotlightOpen: false,
          launchpadOpen: false,
          controlCenterOpen: false,
          notifCenterOpen: false,
        });
      },
      setKickMessage: (m) => set({ kickMessage: m }),
      lock: () => set({ stage: "lock" }),

      openApp: (appId, opts) => {
        const def = getAppDef(appId);
        if (!def) return null;
        const state = get();

        // single-instance: focus existing
        if (def.singleInstance !== false) {
          const existing = state.windows.find((w) => w.appId === appId);
          if (existing) {
            get().focusWindow(existing.id);
            set({ launchpadOpen: false, spotlightOpen: false });
            closePopoversHelper(set);
            return existing.id;
          }
        }

        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        const w = Math.min(def.defaultSize.w, vw - 48);
        const h = Math.min(def.defaultSize.h, vh - MENUBAR_H - DOCK_RESERVED);
        const step = state.cascade % 7;
        const baseX = vw / 2 - w / 2 + (step - 3) * 26;
        const baseY = MENUBAR_H + 24 + step * 22;
        const x = clamp(opts?.center === false ? baseX : baseX, 12, Math.max(12, vw - w - 12));
        const y = clamp(baseY, MENUBAR_H + 8, Math.max(MENUBAR_H + 8, vh - h - 70));

        const id = uid();
        const win: WindowState = {
          id,
          appId,
          title: opts?.title ?? def.name,
          x,
          y,
          w,
          h,
          z: state.zTop + 1,
          minimized: false,
          maximized: false,
          payload: opts?.payload,
        };
        set({
          windows: [...state.windows, win],
          zTop: state.zTop + 1,
          activeId: id,
          cascade: state.cascade + 1,
          launchpadOpen: false,
          spotlightOpen: false,
          bouncing: { ...state.bouncing, [appId]: Date.now() },
        });
        closePopoversHelper(set);
        return id;
      },

      closeWindow: (id) => {
        const state = get();
        const rest = state.windows.filter((w) => w.id !== id);
        const nextActive =
          state.activeId === id
            ? [...rest].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null
            : state.activeId;
        set({ windows: rest, activeId: nextActive });
      },

      closeApp: (appId) => {
        const state = get();
        const rest = state.windows.filter((w) => w.appId !== appId);
        const nextActive =
          [...rest].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null;
        set({ windows: rest, activeId: nextActive });
      },

      focusWindow: (id) => {
        const state = get();
        const win = state.windows.find((w) => w.id === id);
        if (!win) return;
        if (state.activeId === id && !win.minimized) return;
        set({
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, z: state.zTop + 1, minimized: false } : w
          ),
          zTop: state.zTop + 1,
          activeId: id,
        });
      },

      minimizeWindow: (id) => {
        const state = get();
        const rest = state.windows.filter((w) => w.id !== id && !w.minimized);
        const nextActive =
          state.activeId === id
            ? [...rest].sort((a, b) => b.z - a.z)[0]?.id ?? null
            : state.activeId;
        set({
          windows: state.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
          activeId: nextActive,
        });
      },

      restoreWindow: (id) => get().focusWindow(id),

      zoomWindow: (id) => {
        const state = get();
        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        set({
          windows: state.windows.map((w) => {
            if (w.id !== id) return w;
            if (w.maximized && w.prevRect) {
              return { ...w, ...w.prevRect, maximized: false, prevRect: undefined };
            }
            // zoom a borde de pantalla: sin márgenes laterales, bajo la barra de menú, sobre el dock
            return {
              ...w,
              prevRect: { x: w.x, y: w.y, w: w.w, h: w.h },
              x: 0,
              y: MENUBAR_H,
              w: vw,
              h: vh - MENUBAR_H - DOCK_RESERVED,
              maximized: true,
            };
          }),
        });
      },

      // al cambiar el tamaño de la ventana del navegador, las ventanas maximizadas vuelven a encajar
      refitMaximized: () => {
        const state = get();
        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        set({
          windows: state.windows.map((w) =>
            w.maximized ? { ...w, x: 0, y: MENUBAR_H, w: vw, h: vh - MENUBAR_H - DOCK_RESERVED } : w,
          ),
        });
      },

      setWindowRect: (id, rect) => {
        const state = get();
        set({
          windows: state.windows.map((w) => (w.id === id ? { ...w, ...rect } : w)),
        });
      },

      setWindowTitle: (id, title) => {
        const state = get();
        set({
          windows: state.windows.map((w) => (w.id === id ? { ...w, title } : w)),
        });
      },

      minimizeActive: () => {
        const { activeId } = get();
        if (activeId) get().minimizeWindow(activeId);
      },

      updateSettings: (patch) => {
        set({ settings: { ...get().settings, ...patch } });
      },

      setSys: (patch) => {
        set({ sys: { ...get().sys, ...patch } });
      },

      updateBrowser: (patch) => {
        set({ browser: { ...get().browser, ...patch } });
      },

      addHistory: (url, title) => {
        if (!get().browser.keepHistory || !/^https?:/i.test(url)) return;
        const prev = get().safariHistory;
        // deduplicar consecutivas con la misma URL (navegación SPA)
        if (prev[0] && prev[0].url === url) {
          set({ safariHistory: [{ ...prev[0], title: title || prev[0].title, time: Date.now() }] });
          return;
        }
        set({ safariHistory: [{ id: uid("h"), url, title, time: Date.now() }, ...prev].slice(0, 500) });
      },

      removeHistory: (id) => {
        set({ safariHistory: get().safariHistory.filter((h) => h.id !== id) });
      },

      clearHistory: () => set({ safariHistory: [] }),

      addBookmark: (b) => {
        const id = uid("bm");
        set({ bookmarks: [...get().bookmarks, { ...b, id }] });
        return id;
      },

      removeBookmark: (id) => {
        set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) });
      },

      updateBookmark: (id, patch) => {
        set({ bookmarks: get().bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
      },

      upsertNote: (note) => {
        const id = note.id ?? uid("n");
        const state = get();
        const existing = state.notes.find((n) => n.id === id);
        if (existing) {
          set({
            notes: [
              { ...existing, ...note, id, updatedAt: Date.now() },
              ...state.notes.filter((n) => n.id !== id),
            ],
          });
        } else {
          set({
            notes: [
              {
                id,
                title: note.title?.trim() || "Nueva nota",
                content: note.content ?? "",
                updatedAt: Date.now(),
                folder: "Notas",
              },
              ...state.notes,
            ],
          });
        }
        return id;
      },

      deleteNote: (id) => {
        set({ notes: get().notes.filter((n) => n.id !== id) });
      },

      addDownload: (d) => {
        const id = uid("dl");
        set({ downloads: [{ ...d, id, date: Date.now() }, ...get().downloads] });
        return id;
      },
      removeDownload: (id) => {
        const obj = downloadUrls.get(id);
        if (obj) {
          URL.revokeObjectURL(obj);
          downloadUrls.delete(id);
        }
        set({ downloads: get().downloads.filter((d) => d.id !== id) });
      },
      clearDownloads: () => {
        for (const obj of downloadUrls.values()) URL.revokeObjectURL(obj);
        downloadUrls.clear();
        set({ downloads: [] });
      },

      notify: (appId, title, body) => {
        if (get().sys.dnd) return;
        const n: OsNotification = { id: uid("nt"), appId, title, body, time: Date.now() };
        set({ notifications: [...get().notifications.slice(-4), n] });
      },

      dismissNotification: (id) => {
        set({ notifications: get().notifications.filter((n) => n.id !== id) });
      },

      setSpotlight: (open) => {
        closePopoversHelper(set);
        set({ spotlightOpen: open });
      },
      setLaunchpad: (open) => {
        closePopoversHelper(set);
        set({ launchpadOpen: open });
      },
      setControlCenter: (open) => {
        closePopoversHelper(set);
        set({ controlCenterOpen: open });
      },
      setNotifCenter: (open) => {
        closePopoversHelper(set);
        set({ notifCenterOpen: open });
      },
      setSwitcher: (open) => {
        set({ switcherOpen: open });
      },
      closePopovers: () => closePopoversHelper(set),
    }),
    {
      name: "axcsos",
      partialize: (s) => ({
        settings: s.settings,
        sys: s.sys,
        notes: s.notes,
        downloads: s.downloads,
        trashCount: s.trashCount,
        browser: s.browser,
        safariHistory: s.safariHistory,
        bookmarks: s.bookmarks,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<OsStore>;
        // Migración ÚNICA del fondo predeterminado (t18): quien tenía el default
        // anterior (goldengate) estrena el nuevo (AXC Azul Marino); quien eligió
        // otro fondo conserva su elección. El flag evita repetir la migración si
        // el usuario vuelve a elegir el fondo antiguo a propósito.
        let wallpaper = p.settings?.wallpaper ?? current.settings.wallpaper;
        const NAVY_MIGRATION_FLAG = "axcsos-wp-default-t18";
        try {
          if (typeof window !== "undefined" && !window.localStorage.getItem(NAVY_MIGRATION_FLAG)) {
            if (wallpaper === PREVIOUS_DEFAULT_WALLPAPER) wallpaper = DEFAULT_WALLPAPER;
            window.localStorage.setItem(NAVY_MIGRATION_FLAG, "1");
          }
        } catch {
          /* localStorage no disponible: se queda el fondo persistido */
        }
        return {
          ...current,
          ...p,
          browser: {
            ...current.browser,
            ...(p.browser ?? {}),
            // migración: el transporte ya no se configura a mano — el valor
            // persistido (p. ej. el demo público antiguo) se sustituye por el
            // motor propio del estudio configurado por el sistema
            wispUrl: defaultWisp(),
            // migración: el valor antiguo "ddg" pasa a "bing"
            searchEngine: p.browser?.searchEngine === "searxng" ? "searxng" : "bing",
          },
          settings: { ...current.settings, ...(p.settings ?? {}), wallpaper },
        };
      },
    }
  )
);

function closePopoversHelper(set: (partial: Partial<OsStore>) => void) {
  set({ controlCenterOpen: false, notifCenterOpen: false, spotlightOpen: false, launchpadOpen: false });
}

/* ---------- helpers / selectors ---------- */

export function useActiveAppId(): string {
  return useOS((s) => {
    const win = s.windows.find((w) => w.id === s.activeId);
    return win && !win.minimized ? win.appId : "finder";
  });
}
