"use client";

import { useRef, useState } from "react";
import { ExternalLink, RotateCw, Gamepad2 } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";

export const AXC_URL = "https://axcgamestudios.github.io/nueva-pestana/";

export default function AxcGamesApp({ win }: AppProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const notify = useOS((s) => s.notify);

  const openExternal = () => {
    window.open(AXC_URL, "_blank", "noopener,noreferrer");
    notify("axcgames", "AXCGAMES", "Página abierta en una pestaña nueva del navegador.");
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/8 bg-neutral-100/80 px-3 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-900/80">
        <button
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Recargar"
        >
          <RotateCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-black/5 px-3 text-[12px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
          <Gamepad2 size={13} className="shrink-0 text-violet-500" />
          <span className="truncate select-text">axcgamestudios.github.io/nueva-pestana</span>
        </div>
        <button
          onClick={openExternal}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Abrir en el navegador"
        >
          <ExternalLink size={13} />
          Abrir fuera
        </button>
      </div>

      {/* progress bar */}
      <div className="relative h-0.5 shrink-0 overflow-hidden bg-transparent">
        {loading && (
          <div className="animate-progress absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        )}
      </div>

      {/* iframe */}
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={AXC_URL}
          title={win.title}
          className="h-full w-full border-0"
          allow="fullscreen; autoplay; gamepad; clipboard-write; encrypted-media"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-indigo-50 via-white to-pink-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg">
              <Gamepad2 size={26} className="text-white" />
            </div>
            <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
              Cargando AXCGAMES…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
