"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Search, SquarePen, Trash2 } from "lucide-react";
import type { AppProps, Note } from "../types";
import { useOS } from "../store";

function NotesEditor({ note, onChange }: { note: Note; onChange: (title: string, content: string) => void }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  // debounce autosave to the store
  useEffect(() => {
    if (title === note.title && content === note.content) return;
    const t = setTimeout(() => onChange(title, content), 350);
    return () => clearTimeout(t);
  }, [title, content]);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#fffdf5] dark:bg-neutral-950">
      <p className="pt-3 text-center text-[10.5px] text-neutral-400">
        {new Date(note.updatedAt).toLocaleString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="os-input bg-transparent px-8 pt-2 text-center text-[16px] font-bold text-neutral-800 outline-none dark:text-neutral-100"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Empieza a escribir…"
        className="mac-scrollbar os-input min-h-0 flex-1 resize-none bg-transparent px-8 py-3 text-[13px] leading-relaxed text-neutral-700 outline-none placeholder:text-neutral-400 dark:text-neutral-200"
      />
    </div>
  );
}

export default function NotesApp(_props: AppProps) {
  const notes = useOS((s) => s.notes);
  const upsertNote = useOS((s) => s.upsertNote);
  const deleteNote = useOS((s) => s.deleteNote);
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      notes.filter(
        (n) =>
          !query.trim() ||
          n.title.toLowerCase().includes(query.toLowerCase()) ||
          n.content.toLowerCase().includes(query.toLowerCase())
      ),
    [notes, query]
  );

  const active = notes.find((n) => n.id === activeId) ?? null;

  const createNote = () => {
    const id = upsertNote({ title: "Nueva nota", content: "" });
    setActiveId(id);
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  return (
    <div className="flex h-full">
      {/* sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-black/8 bg-neutral-100/70 backdrop-blur-2xl dark:border-white/8 dark:bg-neutral-900/60">
        <div className="flex h-11 shrink-0 items-center gap-2 px-2.5">
          <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md bg-black/5 px-2 dark:bg-white/10">
            <Search size={11} className="shrink-0 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              className="os-input h-full w-full bg-transparent text-[11px] outline-none placeholder:text-neutral-400 dark:text-neutral-200"
            />
          </div>
          <button
            onClick={createNote}
            title="Nueva nota"
            className="flex h-7 w-7 items-center justify-center rounded-md text-amber-500 transition hover:bg-black/8 dark:hover:bg-white/10"
          >
            <SquarePen size={14} />
          </button>
        </div>
        <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className={`mb-0.5 flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left ${
                n.id === activeId
                  ? "bg-[#ffd60a]/80 dark:bg-amber-500/30"
                  : "hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              <span className="truncate text-[12px] font-semibold text-neutral-800 dark:text-neutral-100">
                {n.title || "Sin título"}
              </span>
              <span className="flex items-baseline gap-1.5 text-[10.5px] text-neutral-500 dark:text-neutral-400">
                <span className="shrink-0">{fmtDate(n.updatedAt)}</span>
                <span className="truncate">{n.content.split("\n")[0] || "Contenido adicional…"}</span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-[11px] text-neutral-400">Sin resultados</p>
          )}
        </div>
        <div className="flex h-8 shrink-0 items-center justify-between border-t border-black/8 px-3 dark:border-white/8">
          <span className="text-[10.5px] text-neutral-400">Notas · {notes.length}</span>
          <div className="flex items-center gap-0.5 text-neutral-400">
            <FolderPlus size={13} />
            <button
              onClick={() => {
                if (activeId) {
                  deleteNote(activeId);
                  setActiveId(notes.find((n) => n.id !== activeId)?.id ?? null);
                }
              }}
              className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-black/8 hover:text-red-500 dark:hover:bg-white/10"
              title="Eliminar nota"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* editor (remounts per note via key) */}
      {active ? (
        <NotesEditor
          key={active.id}
          note={active}
          onChange={(title, content) => upsertNote({ id: active.id, title, content })}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#fffdf5] dark:bg-neutral-950">
          <p className="text-[13px] text-neutral-400">Sin nota seleccionada</p>
          <button
            onClick={createNote}
            className="rounded-lg bg-amber-400/90 px-4 py-1.5 text-[12px] font-semibold text-neutral-800 transition hover:bg-amber-400"
          >
            Crear nota
          </button>
        </div>
      )}
    </div>
  );
}
