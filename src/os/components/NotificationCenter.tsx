"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useOS } from "../store";
import { getAppDef } from "../registry";

function CalendarWidget() {
  const [now] = useState(() => new Date());
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7; // monday-first
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div className="glass lg-specular rounded-2xl p-3.5 text-neutral-800 shadow-lg dark:text-neutral-100">
      <p className="mb-1 text-center text-[11px] font-bold uppercase text-red-500">
        {now.toLocaleDateString("es-ES", { weekday: "long" })}
      </p>
      <p className="mb-2 text-center text-[34px] font-semibold leading-none">{now.getDate()}</p>
      <p className="mb-2.5 text-center text-[11px] font-medium text-neutral-400">
        {now.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
      </p>
      <div className="grid grid-cols-7 gap-[2px] text-center text-[9px] text-neutral-400">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
          <span key={i} className="font-semibold">{d}</span>
        ))}
        {cells.map((c, i) => (
          <span
            key={i}
            className={`flex h-[18px] items-center justify-center rounded text-[9.5px] ${
              c === now.getDate()
                ? "bg-red-500 font-bold text-white"
                : c
                  ? "text-neutral-600 dark:text-neutral-300"
                  : ""
            }`}
          >
            {c ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="glass lg-specular flex flex-col items-center justify-center rounded-2xl p-3 text-white shadow-lg" style={{ background: "linear-gradient(160deg, rgba(30,30,80,0.55), rgba(0,0,0,0.35))" }}>
      <p className="text-[30px] font-light tabular-nums leading-none">
        {now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
        <span className="ml-1 text-[14px] opacity-60">{now.toLocaleTimeString("es-ES", { second: "2-digit" })}</span>
      </p>
      <p className="mt-1 text-[11px] font-medium capitalize text-white/70">
        {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}
      </p>
    </div>
  );
}

export function NotificationCenter() {
  const open = useOS((s) => s.notifCenterOpen);
  const setNotifCenter = useOS((s) => s.setNotifCenter);
  const notifications = useOS((s) => s.notifications);
  const dismiss = useOS((s) => s.dismissNotification);
  const openApp = useOS((s) => s.openApp);

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[4470]" onMouseDown={() => setNotifCenter(false)} />
          <motion.div
            initial={{ x: 360, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-2 top-[34px] z-[4480] flex max-h-[calc(100vh-140px)] w-[300px] flex-col gap-2.5 overflow-y-auto"
          >
            {/* notifications */}
            {notifications.length === 0 && (
              <p className="pt-2 text-center text-[12px] text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">
                Sin notificaciones
              </p>
            )}
            {notifications
              .slice()
              .reverse()
              .map((n) => {
                const def = getAppDef(n.appId);
                const Icon = def?.icon;
                return (
                  <motion.button
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass lg-specular group flex items-start gap-2.5 rounded-2xl p-3 text-left shadow-lg"
                    onClick={() => {
                      openApp(n.appId);
                      setNotifCenter(false);
                    }}
                  >
                    {Icon && <Icon className="mt-0.5 h-8 w-8 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{n.title}</span>
                      <span className="block text-[11.5px] leading-snug text-neutral-600 dark:text-neutral-300">{n.body}</span>
                      <span className="mt-0.5 block text-[10px] text-neutral-400">ahora</span>
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss(n.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-neutral-500 opacity-0 transition group-hover:opacity-100 dark:bg-white/15"
                    >
                      <X size={10} />
                    </span>
                  </motion.button>
                );
              })}
            <div className="mt-1 grid grid-cols-1 gap-2.5">
              <ClockWidget />
              <CalendarWidget />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Toast({
  id,
  appId,
  title,
  body,
  onDone,
  onClick,
}: {
  id: string;
  appId: string;
  title: string;
  body: string;
  onDone: (id: string) => void;
  onClick: (appId: string) => void;
}) {
  const def = getAppDef(appId);
  const Icon = def?.icon;
  useEffect(() => {
    const t = setTimeout(() => onDone(id), 5200);
    return () => clearTimeout(t);
  }, [id, onDone]);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.96 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="glass lg-specular flex items-start gap-2.5 rounded-2xl p-3 text-left shadow-2xl"
      onClick={() => onClick(appId)}
    >
      {Icon && <Icon className="mt-0.5 h-9 w-9 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{title}</span>
        <span className="block text-[11.5px] leading-snug text-neutral-600 dark:text-neutral-300">{body}</span>
      </span>
    </motion.button>
  );
}

export function NotificationToasts() {
  const notifications = useOS((s) => s.notifications);
  const dismiss = useOS((s) => s.dismissNotification);
  const openApp = useOS((s) => s.openApp);

  return (
    <div className="fixed right-3 top-[38px] z-[5400] flex w-[310px] flex-col gap-2">
      <AnimatePresence>
        {notifications.map((n) => (
          <Toast
            key={n.id}
            id={n.id}
            appId={n.appId}
            title={n.title}
            body={n.body}
            onDone={dismiss}
            onClick={(appId) => {
              openApp(appId);
              dismiss(n.id);
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
