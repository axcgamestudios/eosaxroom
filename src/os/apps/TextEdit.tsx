"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { writeFile } from "../services/fs";

export default function TextEditApp({ win }: AppProps) {
  const notify = useOS((s) => s.notify);
  const [text, setText] = useState((win.payload?.content as string) ?? "");
  const [dirty, setDirty] = useState(false);
  const fileName = (win.payload?.fileName as string) ?? "Sin título";
  const folderPath = win.payload?.folderPath as string[] | undefined;

  /* un archivo real del sistema de archivos: se puede guardar de verdad */
  const canSave = Boolean(folderPath) && fileName !== "Sin título";

  const save = () => {
    if (!canSave || !folderPath) return;
    if (writeFile(folderPath, fileName, text)) {
      setDirty(false);
      notify("textedit", "Guardado", `“${fileName}” se guardó en ${folderPath[folderPath.length - 1] ?? "Macintosh HD"}.`);
    } else {
      notify("textedit", "No se pudo guardar", "La carpeta ya no existe.");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [text, dirty, canSave, folderPath, fileName]);

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
        {canSave && (
          <button
            onClick={save}
            className={`flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[10.5px] font-medium transition ${
              dirty
                ? "bg-[var(--accent-os)] text-white hover:opacity-90"
                : "text-neutral-400"
            }`}
            title="Guardar (⌘S)"
          >
            <Save size={11} /> Guardar
          </button>
        )}
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
      <div className="flex h-6 shrink-0 items-center justify-end gap-3 border-t border-black/8 bg-neutral-50/80 px-3 text-[10px] text-neutral-400 dark:border-white/8 dark:bg-neutral-900/70">
        <span>{text.split(/\s+/).filter(Boolean).length} palabras</span>
        {canSave && <span>⌘S guarda en el sistema de archivos</span>}
      </div>
    </div>
  );
}
