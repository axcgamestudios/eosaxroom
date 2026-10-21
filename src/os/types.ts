import type { ComponentType, ReactNode } from "react";

export type Stage = "boot" | "login" | "desktop" | "lock";

export type Appearance = "light" | "dark";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowState extends Rect {
  id: string;
  appId: string;
  title: string;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** rect before zoom, to restore */
  prevRect?: Rect;
  /** extra payload, e.g. URL for browser windows */
  payload?: Record<string, unknown>;
}

export interface MenuItem {
  label?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  action?:
    | "close"
    | "minimize"
    | "zoom"
    | "quit"
    | "about"
    | "settings"
    | "lock"
    | "logout"
    | "newWindow"
    | "openApp"
    | "spotlight";
  actionArg?: string;
  checked?: boolean;
}

export interface MenuDef {
  title: string;
  items: MenuItem[];
}

export interface AppProps {
  win: WindowState;
}

export interface AppDef {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType<AppProps>;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  singleInstance?: boolean;
  showInDock?: boolean;
  showInLaunchpad?: boolean;
  dockSeparatorBefore?: boolean;
  menus?: MenuDef[];
  /** window body background, default light/dark material */
  bodyClass?: string;
  /** frameless like macOS 27 utilities (transparent glass) */
  frameless?: boolean;
  centerOnOpen?: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  folder?: string;
}

export interface OsNotification {
  id: string;
  appId: string;
  title: string;
  body: string;
  time: number;
}

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  size: number;
  mime: string;
  date: number;
}

export interface OsSettings {
  wallpaper: string;
  appearance: Appearance;
  accent: string;
  dockSize: number;
  dockMagnify: boolean;
  reduceTransparency: boolean;
  userName: string;
  /** intensidad del desenfoque Liquid Glass (0-100) */
  glassIntensity: number;
  /** velocidad de animaciones del sistema */
  animSpeed: "slow" | "normal" | "fast";
  /** avatar del usuario como dataURL (imagen subida, opcional) */
  avatar?: string;
  /** fondo personalizado como dataURL (imagen subida, opcional) */
  customWallpaper?: string;
  customWallpaperName?: string;
}

export interface BrowserSettings {
  /** URL del servidor wisp (transporte del motor Scramjet) */
  wispUrl: string;
  /** motor de búsqueda: Bing (RSS público) o instancia SearXNG propia */
  searchEngine: "bing" | "searxng";
  searxngUrl: string;
  /** guardar historial de navegación */
  keepHistory: boolean;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  time: number;
}

export interface Bookmark {
  id: string;
  url: string;
  name: string;
  folder?: string;
}

export type WindowOpenOptions = {
  title?: string;
  payload?: Record<string, unknown>;
  center?: boolean;
};
