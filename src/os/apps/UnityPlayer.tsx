"use client";

/* ============================================================
   Unity Player — app SEPARADA del editor para probar los
   proyectos: lista los proyectos guardados del navegador (e
   importa .unityweb.json) y los ejecuta a pantalla completa
   de la ventana con el mismo runtime del editor.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, FolderOpen, Play, Square, Upload } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { UnityRuntime, type UProject } from "../unity/runtime";
import {
  listProjects,
  parseProjectJson,
  saveProject,
  getProject,
  setActive,
  getActive,
} from "../services/unityprojects";

export default function UnityPlayerApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const [projects, setProjects] = useState<UProject[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rtRef = useRef<UnityRuntime | null>(null);

  useEffect(() => {
    const list = listProjects();
    // cargar en el siguiente tick para no setear estado dentro del efecto de montaje
    const t = window.setTimeout(() => setProjects(list), 0);
    return () => window.clearTimeout(t);
  }, []);

  const log = useCallback((kind: "log" | "warn" | "error", msg: string) => {
    setLogs((l) => [...l.slice(-29), `${kind === "error" ? "✕ " : kind === "warn" ? "⚠ " : ""}${msg}`]);
  }, []);

  const run = useCallback(
    async (p: UProject) => {
      setRunning(p.name);
      setLogs([]);
      await new Promise((r) => requestAnimationFrame(r));
      if (!canvasRef.current) return;
      const rt = new UnityRuntime(p.scene, p.scripts, log);
      rtRef.current = rt;
      await rt.start(canvasRef.current);
      const el = canvasRef.current.getBoundingClientRect();
      rt.resize(el.width, el.height);
      canvasRef.current.focus();
    },
    [log]
  );

  const stop = useCallback(() => {
    rtRef.current?.dispose();
    rtRef.current = null;
    setRunning(null);
  }, []);

  /* teclado → juego (con foco del canvas) */
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const rt = rtRef.current;
      if (!rt) return;
      if (e.key === "Escape") {
        stop();
        return;
      }
      rt.keyEvent(e, e.type === "keydown");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [running, stop]);

  useEffect(() => () => rtRef.current?.dispose(), []);

  /* ---------- render ---------- */
  if (running) {
    return (
      <div className="relative h-full bg-black">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          className="absolute inset-0 h-full w-full outline-none"
          onKeyDown={() => undefined}
        />
        {/* HUD mínimo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 text-[11px] text-white/70">
          <span className="rounded-full bg-black/45 px-2.5 py-1 backdrop-blur-sm">{running} — Unity Player</span>
          <span className="rounded-full bg-black/45 px-2.5 py-1 backdrop-blur-sm">WASD/flechas · Espacio salta · Esc detiene</span>
        </div>
        {/* consola superpuesta (últimos 6) */}
        {logs.length > 0 && (
          <div className="mac-scrollbar pointer-events-none absolute bottom-3 left-3 max-h-40 max-w-md overflow-y-auto rounded-lg bg-black/55 p-2 font-mono text-[10.5px] leading-relaxed text-emerald-200/90 backdrop-blur-sm">
            {logs.slice(-6).map((l, i) => (
              <div key={i} className={l.startsWith("✕") ? "text-red-300" : l.startsWith("⚠") ? "text-amber-300" : ""}>{l}</div>
            ))}
          </div>
        )}
        <button
          onClick={stop}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur-sm hover:bg-black/75"
        >
          <Square size={11} fill="currentColor" /> Detener
        </button>
      </div>
    );
  }

  /* lista de proyectos */
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#101012] to-[#17181c] text-neutral-200">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <img src="icons/unityplayer.svg" alt="" className="h-6 w-6" draggable={false} />
        <span className="text-[13px] font-semibold">Unity Player</span>
        <span className="text-[11px] text-neutral-500">prueba tus proyectos fuera del editor</span>
        <span className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-medium hover:bg-white/20">
          <Upload size={12} /> Importar .unityweb.json
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              const imported = parseProjectJson(text);
              if (!imported) {
                notify("unityplayer", "Importación fallida", "No parece un proyecto .unityweb.json válido");
                return;
              }
              saveProject(imported);
              setActive(imported.name);
              setProjects(listProjects());
              notify("unityplayer", "Proyecto importado", `${imported.name} — listo para jugar`);
            }}
          />
        </label>
      </div>

      <div className="mac-scrollbar flex-1 overflow-y-auto p-5">
        <h2 className="mb-1 text-[15px] font-semibold">Tus proyectos</h2>
        <p className="mb-4 max-w-lg text-[11.5px] leading-relaxed text-neutral-500">
          Crea y edita escenas con scripts C# en la app Unity, y pruébalas aquí a pantalla completa.
          El progreso de juego usa el mismo runtime (física, Input, Debug.Log).
        </p>
        {projects.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-[12px] text-neutral-500">
            No hay proyectos todavía. Abre <b className="text-neutral-300">Unity</b> en el Dock o crea uno, y aparecerá aquí.
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {projects.map((p) => {
            const meshes = p.scene.objects.filter((o) => o.components.some((c) => c.type === "MeshRenderer")).length;
            const scripts = new Set(p.scene.objects.flatMap((o) => o.components.filter((c) => c.type === "Script").map((c) => c.script?.className))).size;
            return (
              <button
                key={p.name}
                onClick={() => void run(p)}
                className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-emerald-400/60 hover:bg-emerald-400/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400/30 to-cyan-500/20 ring-1 ring-emerald-300/30">
                    <FolderOpen size={20} className="text-emerald-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{p.name}</div>
                    <div className="text-[10.5px] text-neutral-500">
                      {meshes} objetos 3D · {scripts} scripts · {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <span className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-1.5 text-[11.5px] font-semibold text-emerald-300 transition group-hover:bg-emerald-500/30">
                  <Play size={11} fill="currentColor" /> Ejecutar
                </span>
              </button>
            );
          })}
        </div>

        {/* abrir el activo por defecto */}
        {getActive() && getProject(getActive()!) && (
          <p className="mt-6 text-[10.5px] text-neutral-600">
            Última edición activa: {getActive()} — el editor Unity guarda automáticamente.
          </p>
        )}
      </div>
    </div>
  );
}
