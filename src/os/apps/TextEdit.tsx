"use client";

import { useEffect, useState } from "react";
import type { AppProps } from "../types";

export default function TextEditApp({ win }: AppProps) {
  const [text, setText] = useState((win.payload?.content as string) ?? "");
  const [dirty, setDirty] = useState(false);
  const fileName = (win.payload?.fileName as string) ?? "Sin título";

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-black/8 bg-neutral-50/80 px-4 text-[11px] text-neutral-500 dark:border-white/8 dark:bg-neutral-900/70">
        <span>Helvetica</span>
        <span className="h-4 w-px bg-black/10 dark:bg-white/10" />
        <span>12</span>
        <span className="h-4 w-px bg-black/10 dark:bg-white/10" />
        <button className="font-bold">B</button>
        <button className="italic">i</button>
        <button className="underline">u</button>
        <div className="flex-1" />
        {dirty && <span className="text-[10px] text-neutral-400">editado</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        className="mac-scrollbar os-input min-h-0 flex-1 resize-none bg-transparent px-6 py-4 font-serif text-[13.5px] leading-relaxed text-neutral-800 outline-none dark:text-neutral-100"
        spellCheck={false}
      />
      <div className="flex h-6 shrink-0 items-center justify-end border-t border-black/8 bg-neutral-50/80 px-3 text-[10px] text-neutral-400 dark:border-white/8 dark:bg-neutral-900/70">
        {text.split(/\s+/).filter(Boolean).length} palabras
      </div>
    </div>
  );
}
