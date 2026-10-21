"use client";

import { ExternalLink, FileArchive, FileAudio, FileText, FileVideo, File as FileIcon, ImageIcon, Trash2 } from "lucide-react";
import type { AppProps } from "../types";
import { useOS, getDownloadObjectUrl } from "../store";

function iconFor(mime: string, name: string) {
  if (mime.startsWith("image/")) return <ImageIcon size={34} className="text-sky-500" />;
  if (mime.startsWith("video/")) return <FileVideo size={34} className="text-fuchsia-500" />;
  if (mime.startsWith("audio/")) return <FileAudio size={34} className="text-violet-500" />;
  if (mime.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(name)) return <FileText size={34} className="text-neutral-400" />;
  if (/(zip|rar|tar|gz|dmg|pkg)/i.test(mime + name)) return <FileArchive size={34} className="text-amber-500" />;
  return <FileIcon size={34} className="text-neutral-400" />;
}

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " bytes";
}

export default function DownloadsApp({}: AppProps) {
  const downloads = useOS((s) => s.downloads);
  const removeDownload = useOS((s) => s.removeDownload);
  const clearDownloads = useOS((s) => s.clearDownloads);
  const notify = useOS((s) => s.notify);

  const open = (id: string, name: string) => {
    const obj = getDownloadObjectUrl(id);
    if (obj) {
      window.open(obj, "_blank", "noopener");
    } else {
      notify("downloads", "Archivo no disponible", `"${name}" se descargó en una sesión anterior. Vuelve a descargarlo desde Safari.`);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-black/8 bg-neutral-100/80 px-4 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-900/80">
        <h2 className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">Descargas</h2>
        {downloads.length > 0 && (
          <button
            onClick={() => {
              clearDownloads();
              notify("downloads", "Descargas limpiadas", "Se vació la lista de descargas.");
            }}
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-red-500 transition hover:bg-red-500/10"
          >
            <Trash2 size={12} /> Vaciar
          </button>
        )}
      </div>

      <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {downloads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <FileIcon size={30} className="text-neutral-400" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">Sin descargas</p>
              <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-neutral-400">
                Los archivos que descargues desde Safari aparecerán aquí. Prueba desde cualquier página.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {downloads.map((d) => (
              <div
                key={d.id}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-black/5 dark:hover:bg-white/5"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center">{iconFor(d.mime, d.name)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-200">{d.name}</p>
                  <p className="truncate text-[10.5px] text-neutral-400">
                    {fmtSize(d.size)} · {new Date(d.date).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => open(d.id, d.name)}
                    title="Abrir"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
                  >
                    <ExternalLink size={13} />
                  </button>
                  <button
                    onClick={() => removeDownload(d.id)}
                    title="Eliminar de la lista"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
