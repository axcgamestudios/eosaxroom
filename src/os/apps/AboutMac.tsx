"use client";

import type { AppProps } from "../types";
import { PearLogo } from "../icons";
import { useOS } from "../store";

export default function AboutApp(_props: AppProps) {
  const openApp = useOS((s) => s.openApp);
  const closeApp = useOS((s) => s.closeApp);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-b from-neutral-50 to-neutral-100 px-8 pt-2 dark:from-neutral-900 dark:to-neutral-950">
      <div className="flex flex-col items-center gap-2 pb-3">
        {/* MacBook silhouette */}
        <svg viewBox="0 0 120 84" className="h-24 w-32" aria-hidden>
          <defs>
            <linearGradient id="mb-a" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e8eaee" />
              <stop offset="1" stopColor="#b9bfc9" />
            </linearGradient>
            <linearGradient id="mb-s" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1e293b" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <rect x="18" y="6" width="84" height="56" rx="5" fill="url(#mb-a)" />
          <rect x="23" y="11" width="74" height="46" rx="2.5" fill="url(#mb-s)" />
          <path d="M20 62h80c3 0 4 2 5 5H15c1-3 2-5 5-5z" fill="url(#mb-a)" />
          <rect x="50" y="63.4" width="20" height="1.8" rx="0.9" fill="#8b929c" />
          <circle cx="60" cy="34" r="6" fill="rgba(255,255,255,0.92)" />
          <g transform="translate(56.8 31) scale(0.0058)" style={{ color: "#334155" }}>
            <PearLogo className="h-[560px] w-[310px]" />
          </g>
        </svg>
      </div>
      <h2 className="text-[19px] font-semibold text-neutral-800 dark:text-neutral-100">axcsOS</h2>
      <p className="text-[11px] text-neutral-400">Versión 27.0 (Liquid Glass)</p>
      <div className="mt-3 w-full space-y-[3px] text-[11.5px]">
        {[
          ["Chip", "Z1 Silicon"],
          ["Memoria", "16 GB"],
          ["Núcleos", "8 CPU · 10 GPU"],
          ["Serial", "Z1WEB27X0001"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="font-semibold text-neutral-500">{k}</span>
            <span className="text-neutral-700 dark:text-neutral-200">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => openApp("settings")}
          className="rounded-md border border-black/10 bg-white px-3 py-[5px] text-[11.5px] font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
        >
          Más información…
        </button>
        <button
          onClick={() => closeApp("about")}
          className="rounded-md bg-[var(--accent-os)] px-4 py-[5px] text-[11.5px] font-medium text-white shadow-sm transition hover:brightness-110"
        >
          OK
        </button>
      </div>
    </div>
  );
}
