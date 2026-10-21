"use client";

import type { AppDef, MenuDef } from "./types";
import {
  AxcGamesIcon,
  CalculatorIcon,
  DocIcon,
  FinderIcon,
  ImageDocIcon,
  NotesIcon,
  SafariIcon,
  SettingsIcon,
  TerminalIcon,
  FinderLogoIcon,
  AxcGamesLogoIcon,
  SafariLogoIcon,
  NotesLogoIcon,
  CalculatorLogoIcon,
  SettingsLogoIcon,
  MessagesIcon,
  YouTubeIcon,
} from "./icons";
import AxcGamesApp from "./apps/AxcGames";
import SafariApp from "./apps/Safari";
import FinderApp from "./apps/Finder";
import NotesApp from "./apps/Notes";
import CalculatorApp from "./apps/Calculator";
import TerminalApp from "./apps/Terminal";
import SettingsApp from "./apps/Settings";
import TextEditApp from "./apps/TextEdit";
import PreviewApp from "./apps/Preview";
import AboutApp from "./apps/AboutMac";
import DownloadsApp from "./apps/Downloads";
import MessagesApp from "./apps/Messages";
import YouTubeApp from "./apps/YouTube";

const fileMenu: MenuDef = {
  title: "Archivo",
  items: [
    { label: "Nueva ventana", shortcut: "⌘N", action: "newWindow" },
    { separator: true },
    { label: "Cerrar ventana", shortcut: "⌘W", action: "close" },
  ],
};

const editMenu: MenuDef = {
  title: "Edición",
  items: [
    { label: "Deshacer", shortcut: "⌘Z" },
    { label: "Rehacer", shortcut: "⇧⌘Z", disabled: true },
    { separator: true },
    { label: "Cortar", shortcut: "⌘X" },
    { label: "Copiar", shortcut: "⌘C" },
    { label: "Pegar", shortcut: "⌘V" },
    { label: "Seleccionar todo", shortcut: "⌘A" },
  ],
};

const windowMenu: MenuDef = {
  title: "Ventana",
  items: [
    { label: "Minimizar", shortcut: "⌘M", action: "minimize" },
    { label: "Zoom", action: "zoom" },
    { separator: true },
    { label: "Traer todo al frente" },
  ],
};

const helpMenu: MenuDef = {
  title: "Ayuda",
  items: [{ label: "Ayuda de axcsOS", action: "openApp", actionArg: "notes" }],
};

export const APPS: AppDef[] = [
  {
    id: "finder",
    name: "Finder",
    icon: FinderLogoIcon,
    component: FinderApp,
    defaultSize: { w: 760, h: 500 },
    minSize: { w: 560, h: 360 },
    singleInstance: false,
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      fileMenu,
      editMenu,
      { title: "Ver", items: [{ label: "Como iconos", shortcut: "⌘1" }, { label: "Como lista", shortcut: "⌘2" }] },
      { title: "Ir", items: [{ label: "Escritorio", shortcut: "⇧⌘H", action: "openApp", actionArg: "finder" }] },
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "axcgames",
    name: "AXCGAMES",
    icon: AxcGamesLogoIcon,
    component: AxcGamesApp,
    defaultSize: { w: 1100, h: 700 },
    minSize: { w: 420, h: 320 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      fileMenu,
      editMenu,
      { title: "Juego", items: [{ label: "Pantalla completa", shortcut: "⌃⌘F", action: "zoom" }] },
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "safari",
    name: "Safari",
    icon: SafariLogoIcon,
    component: SafariApp,
    defaultSize: { w: 1020, h: 660 },
    minSize: { w: 460, h: 340 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      fileMenu,
      editMenu,
      { title: "Ver", items: [{ label: "Recargar página", shortcut: "⌘R" }] },
      { title: "Historial", items: [{ label: "Mostrar todo el historial", shortcut: "⌘Y" }] },
      { title: "Marcadores", items: [{ label: "Mostrar marcadores", shortcut: "⌥⌘B" }] },
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "messages",
    name: "Mensajes",
    icon: MessagesIcon,
    component: MessagesApp,
    defaultSize: { w: 880, h: 580 },
    minSize: { w: 560, h: 380 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      fileMenu,
      editMenu,
      { title: "Conversación", items: [{ label: "Nueva nota de voz", action: "openApp", actionArg: "messages" }] },
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: YouTubeIcon,
    component: YouTubeApp,
    defaultSize: { w: 1120, h: 720 },
    minSize: { w: 480, h: 360 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      fileMenu,
      editMenu,
      { title: "Ver", items: [{ label: "Tendencias", action: "openApp", actionArg: "youtube" }] },
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "notes",
    name: "Notas",
    icon: NotesLogoIcon,
    component: NotesApp,
    defaultSize: { w: 780, h: 520 },
    minSize: { w: 520, h: 340 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      { ...fileMenu, items: [{ label: "Nueva nota", shortcut: "⌘N", action: "openApp", actionArg: "notes" }, { separator: true }, { label: "Cerrar ventana", shortcut: "⌘W", action: "close" }] },
      editMenu,
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "calculator",
    name: "Calculadora",
    icon: CalculatorLogoIcon,
    component: CalculatorApp,
    defaultSize: { w: 250, h: 380 },
    minSize: { w: 220, h: 340 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [fileMenu, editMenu, windowMenu, helpMenu],
  },
  {
    id: "terminal",
    name: "Terminal",
    icon: TerminalIcon,
    component: TerminalApp,
    defaultSize: { w: 620, h: 420 },
    minSize: { w: 380, h: 240 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [
      { ...fileMenu, items: [{ label: "Nueva ventana", shortcut: "⌘N", action: "newWindow" }, { separator: true }, { label: "Cerrar", shortcut: "⌘W", action: "close" }] },
      editMenu,
      windowMenu,
      helpMenu,
    ],
  },
  {
    id: "settings",
    name: "Ajustes del Sistema",
    icon: SettingsLogoIcon,
    component: SettingsApp,
    defaultSize: { w: 760, h: 540 },
    minSize: { w: 560, h: 400 },
    showInDock: true,
    showInLaunchpad: true,
    menus: [fileMenu, editMenu, windowMenu, helpMenu],
  },
  {
    id: "downloads",
    name: "Descargas",
    icon: ImageDocIcon,
    component: DownloadsApp,
    defaultSize: { w: 560, h: 420 },
    minSize: { w: 380, h: 300 },
    showInDock: false,
    showInLaunchpad: true,
    menus: [fileMenu, editMenu, windowMenu, helpMenu],
  },
  {
    id: "textedit",
    name: "TextEdit",
    icon: DocIcon,
    component: TextEditApp,
    defaultSize: { w: 520, h: 440 },
    minSize: { w: 300, h: 240 },
    singleInstance: false,
    showInDock: false,
    showInLaunchpad: false,
    menus: [fileMenu, editMenu, windowMenu, helpMenu],
  },
  {
    id: "preview",
    name: "Previsualización",
    icon: ImageDocIcon,
    component: PreviewApp,
    defaultSize: { w: 700, h: 520 },
    minSize: { w: 320, h: 260 },
    singleInstance: false,
    showInDock: false,
    showInLaunchpad: false,
    menus: [fileMenu, editMenu, windowMenu, helpMenu],
  },
  {
    id: "about",
    name: "Acerca de axcsOS",
    icon: FinderIcon,
    component: AboutApp,
    defaultSize: { w: 300, h: 430 },
    minSize: { w: 300, h: 430 },
    showInDock: false,
    showInLaunchpad: false,
    menus: [],
  },
];

export function getAppDef(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id);
}
