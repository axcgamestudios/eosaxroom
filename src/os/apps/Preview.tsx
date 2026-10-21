"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { AppProps } from "../types";

export default function PreviewApp({ win }: AppProps) {
  const image = (win.payload?.image as string) ?? "wallpapers/tahoe-dark.png";
  const [zoom, setZoom] = useState(1);
  return (
    <div className="flex h-full flex-col bg-neutral-900">
      <div className="flex h-9 shrink-0 items-center justify-center gap-1 border-b border-white/10 bg-neutral-800/70 backdrop-blur">
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-300 hover:bg-white/10"
        >
          <Minus size={12} />
        </button>
        <span className="w-12 text-center text-[11px] tabular-nums text-neutral-300">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-300 hover:bg-white/10"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="mac-scrollbar mac-scrollbar-dark flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={image}
          alt={win.title}
          style={{ transform: `scale(${zoom})` }}
          className="max-h-full max-w-full rounded-lg border border-white/10 object-contain shadow-2xl transition-transform duration-200"
        />
      </div>
    </div>
  );
}
