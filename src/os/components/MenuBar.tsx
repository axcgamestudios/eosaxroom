"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BatteryFull, Search, Wifi, WifiOff } from "lucide-react";
import { useActiveAppId, useOS } from "../store";
import { getAppDef } from "../registry";
import { PearLogo } from "../icons";
import type { MenuItem } from "../types";

function MenuDropdown({
  items,
  onAction,
  onClose,
  x,
}: {
  items: MenuItem[];
  onAction: (item: MenuItem) => void;
  onClose: () => void;
  x?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
      className={`glass lg-specular animate-pop-in absolute top-[26px] z-[4600] min-w-[230px] rounded-lg p-1 text-[13px] ${
        x === "right" ? "right-0" : "left-0"
      } text-neutral-900`}
      style={{ transformOrigin: "top left" }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="mx-2.5 my-1 h-[0.5px] bg-black/12" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => !item.disabled && onAction(item)}
            className={`mac-menu-item flex w-full items-center justify-between px-2.5 py-[3.5px] text-left ${
              item.disabled ? "opacity-35" : ""
            }`}
          >
            <span className="flex items-center gap-1.5">
              {item.checked && <span className="-ml-1 text-[11px]">✓</span>}
              {item.label}
            </span>
            {item.shortcut && <span className="menu-muted ml-6 text-[12px] text-neutral-400">{item.shortcut}</span>}
          </button>
        )
      )}
    </motion.div>
  );
}

function MenuButton({
  id,
  open,
  onOpen,
  onHover,
  items,
  onAction,
  children,
  bold,
}: {
  id: string;
  open: string | null;
  onOpen: (key: string | null) => void;
  onHover: (key: string) => void;
  items: MenuItem[];
  onAction: (item: MenuItem) => void;
  children: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="relative">
      <button
        onMouseDown={(e: React.MouseEvent) => {
          e.stopPropagation();
          if (open === id) {
            onOpen(null);
          } else {
            onOpen(id);
          }
        }}
        onMouseEnter={() => onHover(id)}
        className={`flex h-[22px] items-center rounded-[6px] px-2.5 text-[13px] leading-none transition-colors ${
          open === id ? "bg-black/12 dark:bg-white/20" : "hover:bg-black/8 dark:hover:bg-white/10"
        } ${bold ? "font-semibold" : ""}`}
      >
        {children}
      </button>
      <AnimatePresence>
        {open === id && (
          <MenuDropdown items={items} onAction={onAction} onClose={() => onOpen(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const activeAppId = useActiveAppId();
  const def = getAppDef(activeAppId);
  const os = useOS();
  const sys = useOS((s) => s.sys);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const runAction = (item: MenuItem) => {
    const id = os.activeId;
    switch (item.action) {
      case "close": if (id) os.closeWindow(id); break;
      case "minimize": if (id) os.minimizeWindow(id); break;
      case "zoom": if (id) os.zoomWindow(id); break;
      case "quit": os.closeApp(activeAppId); break;
      case "about": os.openApp("about"); break;
      case "settings": os.openApp("settings"); break;
      case "lock": os.lock(); break;
      case "logout": os.logout(); break;
      case "newWindow": os.openApp(activeAppId); break;
      case "openApp": if (item.actionArg) os.openApp(item.actionArg); break;
      case "spotlight": os.setSpotlight(true); break;
    }
    setOpen(null);
  };

  const appleItems: MenuItem[] = [
    { label: "Acerca de axcsOS", action: "about" },
    { separator: true },
    { label: "Ajustes del Sistema…", action: "settings" },
    { label: "App Store…", action: "openApp", actionArg: "notes" },
    { separator: true },
    { label: "Bloquear pantalla", shortcut: "⌃⌘Q", action: "lock" },
    { label: `Cerrar sesión de «${os.session?.username ?? os.settings.userName}»…`, shortcut: "⇧⌘Q", action: "logout" },
    { separator: true },
    { label: "Apagar…", action: "logout" },
    { label: "Reiniciar…", action: "logout" },
  ];

  const appItems: MenuItem[] = [
    { label: `Acerca de ${def?.name ?? "app"}`, action: "about" },
    { separator: true },
    { label: "Ajustes…", shortcut: "⌘,", action: "settings" },
    { separator: true },
    { label: `Ocultar ${def?.name ?? ""}`, shortcut: "⌘H", action: "minimize" },
    { separator: true },
    { label: `Salir de ${def?.name ?? ""}`, shortcut: "⌘Q", action: "quit" },
  ];

  const hoverKey = (key: string) => {
    if (open) setOpen(key);
  };

  const dateStr = now.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const menuFor = (id: string): MenuItem[] =>
    id === "apple" ? appleItems : id === "app" ? appItems : (def?.menus?.find((m) => m.title === id)?.items ?? []);

  return (
    <div
      className={`os-no-select fixed inset-x-0 top-0 z-[4400] flex h-[30px] items-center gap-0.5 px-2 text-neutral-800 dark:text-neutral-100 ${
        os.settings.reduceTransparency
          ? "bg-[#eeeef0]/95 dark:bg-[#1a1a1c]/95"
          : "glass-chrome dark:glass-chrome-dark"
      }`}
    >
      {/* Apple menu */}
      <MenuButton id="apple" open={open} onOpen={setOpen} onHover={hoverKey} items={menuFor("apple")} onAction={runAction}>
        <PearLogo className="h-[16px] w-[9px]" />
      </MenuButton>

      {/* App name menu */}
      <MenuButton id="app" open={open} onOpen={setOpen} onHover={hoverKey} items={menuFor("app")} onAction={runAction} bold>
        {def?.name ?? "Finder"}
      </MenuButton>

      {/* App menus */}
      {def?.menus?.map((m) => (
        <MenuButton key={m.title} id={m.title} open={open} onOpen={setOpen} onHover={hoverKey} items={menuFor(m.title)} onAction={runAction}>
          {m.title}
        </MenuButton>
      ))}

      <div className="flex-1" />

      {/* right status */}
      <div className="flex items-center gap-1">
        {sys.dnd && (
          <span className="mr-0.5 text-[10px] text-neutral-400" title="No molestar activado">
            ◐
          </span>
        )}
        <div className="flex items-center gap-1 px-1.5" title="Batería al 100 %">
          <span className="text-[11px] tabular-nums opacity-75">100%</span>
          <BatteryFull size={17} strokeWidth={1.6} />
        </div>
        <button
          onClick={() => os.notify("settings", "Wi-Fi", "Wi-Fi: no hay redes disponibles en la demo.")}
          className="flex h-[22px] items-center rounded-[6px] px-1.5 transition hover:bg-black/8 dark:hover:bg-white/10"
          title={sys.wifi ? "Wi-Fi activado" : "Wi-Fi desactivado"}
        >
          {sys.wifi ? <Wifi size={16} strokeWidth={1.8} /> : <WifiOff size={16} strokeWidth={1.8} className="opacity-40" />}
        </button>
        <button
          onClick={() => os.setSpotlight(true)}
          className="flex h-[22px] items-center rounded-[6px] px-1.5 transition hover:bg-black/8 dark:hover:bg-white/10"
          title="Spotlight (⌘Espacio)"
        >
          <Search size={15} strokeWidth={1.9} />
        </button>
        <button
          onClick={() => os.setControlCenter(!os.controlCenterOpen)}
          className="flex h-[22px] items-center rounded-[6px] px-1.5 transition hover:bg-black/8 dark:hover:bg-white/10"
          title="Centro de control"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 8h10M18.5 8H20M4 16h4M12 16h8" />
            <circle cx="16" cy="8" r="2.2" />
            <circle cx="10" cy="16" r="2.2" />
          </svg>
        </button>
        <button
          onClick={() => os.setNotifCenter(!os.notifCenterOpen)}
          className={`flex h-[22px] items-center gap-2 rounded-[6px] px-2 text-[12.5px] antialiased transition hover:bg-black/8 dark:hover:bg-white/10 ${
            os.notifCenterOpen ? "bg-black/10 dark:bg-white/15" : ""
          }`}
        >
          <span className="capitalize">{dateStr}</span>
          <span className="tabular-nums">{timeStr}</span>
        </button>
      </div>
    </div>
  );
}
