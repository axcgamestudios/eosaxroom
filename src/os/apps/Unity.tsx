"use client";

/* ============================================================
   Unity — clon del editor: jerarquía, vista de escena (three.js
   con gizmos de mover/rotar/escalar), inspector de componentes,
   navegador de proyecto con scripts C# (editor de código),
   consola, y Play/Pause/Step contra el runtime real.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  FileCode2,
  Lightbulb,
  Pause,
  Play,
  Plus,
  Rotate3d,
  Save,
  SkipForward,
  Square,
  Trash2,
  Video,
  Hand,
  Move,
  Maximize2,
} from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import {
  UnityRuntime,
  defaultScene,
  newObject,
  type PrimitiveKind,
  type UComponent,
  type UObject,
  type UProject,
} from "../unity/runtime";
import { compileCs } from "../unity/csharp";
import {
  deleteProject,
  exportProjectJson,
  getActive,
  getProject,
  listProjects,
  parseProjectJson,
  saveProject,
  setActive,
} from "../services/unityprojects";

type Tab = "scene" | "game" | "console";
type ToolMode = "hand" | "translate" | "rotate" | "scale";
type LogEntry = { kind: "log" | "warn" | "error"; msg: string; t: number };

const SCRIPT_TEMPLATE = (name: string) => `using UnityEngine;

public class ${name} : MonoBehaviour
{
    public float speed = 3f;

    void Start()
    {
        Debug.Log("${name} listo");
    }

    void Update()
    {
        transform.Rotate(Vector3.up * speed * Time.deltaTime);
    }
}
`;

export default function UnityApp({ win }: AppProps) {
  const notify = useOS((s) => s.notify);
  const [project, setProject] = useState<UProject | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("scene");
  const [tool, setTool] = useState<ToolMode>("translate");
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [codeOpen, setCodeOpen] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addComponentOpen, setAddComponentOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const editRtRef = useRef<UnityRuntime | null>(null);
  const gameRtRef = useRef<UnityRuntime | null>(null);
  const orbitRef = useRef<unknown>(null);
  const gizmoRef = useRef<unknown>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  const selected = useMemo(() => project?.scene.objects.find((o) => o.id === selectedId) ?? null, [project, selectedId]);

  const log = useCallback((kind: LogEntry["kind"], msg: string) => {
    setLogs((l) => [...l.slice(-199), { kind, msg, t: Date.now() }]);
  }, []);

  /* ---------- carga inicial ---------- */
  useEffect(() => {
    const list = listProjects();
    setProjects(list.map((p) => p.name));
    const active = getActive();
    const p = getProject(active ?? "") ?? list[0] ?? { name: "MiJuego", scene: defaultScene(), scripts: [], updatedAt: Date.now() };
    setProject(p);
    setActive(p.name);
    setSelectedId(p.scene.objects.find((o) => o.components.some((c) => c.type === "MeshRenderer"))?.id ?? p.scene.objects[0]?.id ?? null);
  }, []);

  /* ---------- persistencia (autoguardado) ---------- */
  useEffect(() => {
    if (!project) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveProject(project), 700);
    setProjects((old) => (old.includes(project.name) ? old : [...old, project.name]));
  }, [project]);

  /* ---------- vista de escena (editor) ---------- */
  useEffect(() => {
    let alive = true;
    if (!project || !sceneCanvasRef.current) return;
    const rt = new UnityRuntime(project.scene, [], log);
    editRtRef.current = rt;
    void (async () => {
      await rt.startEditor(sceneCanvasRef.current!);
      if (!alive) return;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { TransformControls } = await import("three/examples/jsm/controls/TransformControls.js");
      if (!alive || !rt.renderer || !rt.camera) return;
      const orbit = new OrbitControls(rt.camera, rt.renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      orbit.addEventListener("change", () => rt.renderOnce());
      orbitRef.current = orbit;
      // tamaño real inicial: sin esto el canvas queda a 300×150 estirado por CSS (pixeleado)
      const vr = viewRef.current?.getBoundingClientRect();
      if (vr && vr.width > 0) rt.resize(vr.width, vr.height);
      rt.renderOnce();
      // pick por clic
      const onDown = (ev: MouseEvent) => {
        if ((ev.target as HTMLElement).tagName !== "CANVAS") return;
        // no re-seleccionar cuando el puntero está sobre el gizmo (arrastrando herramientas)
        const gz = gizmoRef.current as { axis?: string | null } | null;
        if (gz && gz.axis) return;
        const rect = rt.renderer!.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        const rc = new THREE.Raycaster();
        rc.setFromCamera({ x, y } as never, rt.camera!);
        const hits = rc.intersectObjects([...rt.obj3d.values()], true);
        const hit = hits.find((h) => h.object instanceof THREE.Mesh);
        if (!hit) return;
        const found = [...rt.obj3d.entries()].find(([, o3]) => o3 === hit.object || o3 === hit.object.parent);
        if (found) setSelectedId(found[0]);
      };
      rt.renderer.domElement.addEventListener("pointerdown", onDown);
      (rt as unknown as { __pick?: unknown }).__pick = onDown;
      return () => rt.renderer?.domElement.removeEventListener("pointerdown", onDown);
    })();
    return () => {
      alive = false;
      (orbitRef.current as { dispose?: () => void } | null)?.dispose?.();
      orbitRef.current = null;
      if (gizmoRef.current) {
        const g = gizmoRef.current as { dispose: () => void; parent?: unknown };
        g.dispose?.();
        gizmoRef.current = null;
      }
      (rt as unknown as { __pick?: unknown }).__pick = null;
      rt.dispose();
      editRtRef.current = null;
    };
  }, [project?.name, log]);

  /* ---------- reconstruir escena al cambiar objetos ---------- */
  useEffect(() => {
    const rt = editRtRef.current;
    if (!rt || !project) return;
    rt.scene = project.scene;
    // ¿misma estructura (añadir/quitar objetos) o solo cambiaron valores?
    const sameShape =
      rt.obj3d.size === project.scene.objects.length &&
      project.scene.objects.every((o) => rt.obj3d.has(o.id));
    if (sameShape) {
      // sincronizar en vivo: no interrumpe el gizmo ni su arrastre
      rt.syncLive();
    } else {
      rt.rebuild();
    }
    rt.renderOnce();
  }, [project]);

  /* ---------- gizmo de transformación del objeto seleccionado ---------- */
  useEffect(() => {
    if (!selectedId || !editRtRef.current || playing) {
      const g = gizmoRef.current as ({ detach: () => void; dispose?: () => void } & { __helper?: unknown }) | null;
      if (g) {
        try {
          g.detach();
          g.dispose?.();
        } catch { /* ya desechado */ }
        const rt = editRtRef.current;
        const helper = g.__helper as { parent?: unknown } | undefined;
        if (helper && rt?.threeScene) (rt.threeScene as unknown as { remove: (o: unknown) => void }).remove(helper);
        gizmoRef.current = null;
      }
      return;
    }
    let alive = true;
    void (async () => {
      const rt = editRtRef.current;
      if (!rt || !rt.threeScene || !rt.renderer || !rt.camera) return;
      const { TransformControls } = await import("three/examples/jsm/controls/TransformControls.js");
      if (!alive || !rt.threeScene || !rt.renderer || !rt.camera) return;
      type Gz = InstanceType<typeof TransformControls> & { __helper?: unknown };
      let gizmo = gizmoRef.current as Gz | null;
      if (!gizmo) {
        gizmo = new TransformControls(rt.camera, rt.renderer.domElement) as Gz;
        (gizmo as unknown as { size: number }).size = 0.85;
        // three r169+: TransformControls ya no es un Object3D — su helper (las flechas)
        // debe añadirse aparte a la escena, o el gizmo no se ve ni responde
        const helper = ((gizmo as unknown as { getHelper?: () => unknown }).getHelper?.() ?? gizmo) as unknown;
        gizmo.__helper = helper;
        (rt.threeScene as unknown as { add: (o: unknown) => void }).add(helper);
        gizmoRef.current = gizmo;
        // arrastrar el gizmo no debe orbitar la cámara a la vez
        gizmo.addEventListener("dragging-changed", (ev) => {
          const orbit = orbitRef.current as { enabled: boolean } | null;
          if (orbit) orbit.enabled = !(ev as unknown as { value: boolean }).value;
        });
        gizmo.addEventListener("objectChange", () => {
          const o3 = gizmo!.object;
          if (!o3) return;
          const id = [...rt.obj3d.entries()].find(([, v]) => v === o3)?.[0];
          if (!id) return;
          setProject((p) =>
            p
              ? {
                  ...p,
                  scene: {
                    ...p.scene,
                    objects: p.scene.objects.map((o) =>
                      o.id === id
                        ? {
                            ...o,
                            transform: {
                              position: [+o3.position.x.toFixed(4), +o3.position.y.toFixed(4), +o3.position.z.toFixed(4)],
                              rotation: [+(o3.rotation.x * (180 / Math.PI)).toFixed(2), +(o3.rotation.y * (180 / Math.PI)).toFixed(2), +(o3.rotation.z * (180 / Math.PI)).toFixed(2)],
                              scale: [+o3.scale.x.toFixed(4), +o3.scale.y.toFixed(4), +o3.scale.z.toFixed(4)],
                            },
                          }
                        : o
                    ),
                  },
                }
              : p
          );
        });
      }
      const o3 = rt.obj3d.get(selectedId);
      if (o3) gizmo.attach(o3);
      if (tool !== "hand") gizmo.setMode(tool);
      else gizmo.detach();
      rt.renderOnce();
    })();
    return () => {
      alive = false;
    };
  }, [selectedId, tool, playing, project]);

  /* ---------- redimensionar ---------- */
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      editRtRef.current?.resize(r.width, r.height);
      gameRtRef.current?.resize(r.width, r.height);
      editRtRef.current?.renderOnce();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- teclado del editor ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (codeOpen) return;
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
      if (playing && gameRtRef.current) {
        gameRtRef.current.keyEvent(e, e.type === "keydown");
        if (e.key === "Escape") stopPlay();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        duplicateSelected();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
      // atajos de herramientas como en Unity: Q vista, W mover, E rotar, R escalar
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "q") setTool("hand");
        else if (k === "w") setTool("translate");
        else if (k === "e") setTool("rotate");
        else if (k === "r") setTool("scale");
        else if (k === "escape" || k === "esc") setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, selectedId, codeOpen, project]);

  /* ---------- play / stop ---------- */
  const startPlay = useCallback(async () => {
    if (!project) return;
    // cambiar a la pestaña Juego y esperar un fotograma para que el canvas tenga tamaño
    setPlaying(true);
    setPaused(false);
    setTab("game");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!gameCanvasRef.current) return;
    const clone = JSON.parse(JSON.stringify(project.scene)) as typeof project.scene;
    const rt = new UnityRuntime(clone, project.scripts, log);
    gameRtRef.current = rt;
    log("log", `— Play mode: ${project.scene.objects.length} objetos · ${project.scripts.length} scripts —`);
    await rt.start(gameCanvasRef.current);
    const el = viewRef.current?.getBoundingClientRect();
    if (el) rt.resize(el.width, el.height);
  }, [project, log]);

  const stopPlay = useCallback(() => {
    gameRtRef.current?.dispose();
    gameRtRef.current = null;
    setPlaying(false);
    setPaused(false);
    setTab("scene");
    log("log", "— Stop: la escena del editor queda intacta (como en Unity) —");
    editRtRef.current?.renderOnce();
  }, [log]);

  useEffect(() => {
    // arranque de emergencia si el juego no arrancó en startPlay (canvas sin tamaño)
    if (tab === "game" && playing && gameRtRef.current && !gameRtRef.current.playing && gameRtRef.current.editorMode === false && gameCanvasRef.current) {
      void gameRtRef.current.start(gameCanvasRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, playing]);

  /* ---------- mutaciones de escena ---------- */
  const mutate = useCallback((fn: (objs: UObject[]) => UObject[]) => {
    setProject((p) => (p ? { ...p, scene: { ...p.scene, objects: fn(p.scene.objects) } } : p));
  }, []);

  const addObject = useCallback(
    (o: UObject) => {
      mutate((objs) => [...objs, o]);
      setSelectedId(o.id);
    },
    [mutate]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    mutate((objs) => objs.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, mutate]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId || !project) return;
    const src = project.scene.objects.find((o) => o.id === selectedId);
    if (!src) return;
    const clone = JSON.parse(JSON.stringify(src)) as UObject;
    clone.id = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    clone.name = `${src.name} (1)`;
    clone.transform.position[0] += 1.2;
    mutate((objs) => [...objs, clone]);
    setSelectedId(clone.id);
  }, [selectedId, project, mutate]);

  const patchObject = useCallback(
    (id: string, patch: Partial<UObject>) => {
      mutate((objs) => objs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    },
    [mutate]
  );

  const patchComponent = useCallback(
    (id: string, idx: number, patch: Partial<UComponent>) => {
      mutate((objs) =>
        objs.map((o) => (o.id === id ? { ...o, components: o.components.map((c, i) => (i === idx ? { ...c, ...patch } : c)) } : o))
      );
    },
    [mutate]
  );

  const createScript = useCallback(() => {
    if (!project) return;
    const base = "NuevoScript";
    let n = 1;
    let name = base;
    while (project.scripts.some((s) => s.name === name)) name = `${base}${++n}`;
    const asset = { id: `sc${Date.now().toString(36)}`, name, source: SCRIPT_TEMPLATE(name) };
    setProject((p) => (p ? { ...p, scripts: [...p.scripts, asset] } : p));
    setCodeOpen(asset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  /* ---------- render ---------- */
  if (!project) {
    return <div className="flex h-full items-center justify-center bg-[#171719] text-[13px] text-neutral-400">Abriendo Unity…</div>;
  }

  const primitives: { label: string; kind: PrimitiveKind }[] = [
    { label: "Cube", kind: "cube" },
    { label: "Sphere", kind: "sphere" },
    { label: "Cylinder", kind: "cylinder" },
    { label: "Capsule", kind: "capsule" },
    { label: "Plane", kind: "plane" },
    { label: "Quad", kind: "quad" },
  ];

  return (
    <div className="flex h-full select-none flex-col bg-[#1d1d1f] font-[13px] text-neutral-200">
      {/* ---- barra de herramientas superior ---- */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-black/40 bg-[#26262a] px-2">
        {/* herramientas */}
        <div className="flex items-center gap-0.5 rounded-md bg-black/25 p-0.5">
          {[
            { m: "hand" as const, icon: Hand, title: "Vista (Q)" },
            { m: "translate" as const, icon: Move, title: "Mover (W)" },
            { m: "rotate" as const, icon: Rotate3d, title: "Rotar (E)" },
            { m: "scale" as const, icon: Maximize2, title: "Escalar (R)" },
          ].map(({ m, icon: Icon, title }) => (
            <button
              key={m}
              title={title}
              onClick={() => setTool(m)}
              className={`flex h-7 w-8 items-center justify-center rounded ${tool === m ? "bg-[#3d6ea5] text-white" : "text-neutral-400 hover:bg-white/10"}`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        {/* play/pause/step/stop */}
        <div className="ml-3 flex items-center gap-1">
          <button
            onClick={() => (playing ? stopPlay() : void startPlay())}
            className={`flex h-7 w-9 items-center justify-center rounded ${!playing ? "bg-[#3d8f52] text-white hover:brightness-110" : "bg-[#b3554d] text-white hover:brightness-110"}`}
            title={playing ? "Detener (Esc)" : "Play"}
          >
            {playing ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          </button>
          <button
            onClick={() => {
              if (!playing) return void startPlay();
              setPaused((p) => {
                gameRtRef.current && (gameRtRef.current.paused = !p);
                return !p;
              });
            }}
            disabled={!playing}
            className="flex h-7 w-8 items-center justify-center rounded bg-black/25 text-neutral-300 hover:bg-white/10 disabled:opacity-30"
            title="Pausa"
          >
            <Pause size={12} />
          </button>
          <button
            onClick={() => gameRtRef.current?.step()}
            disabled={!playing || !paused}
            className="flex h-7 w-8 items-center justify-center rounded bg-black/25 text-neutral-300 hover:bg-white/10 disabled:opacity-30"
            title="Paso a paso (en pausa)"
          >
            <SkipForward size={12} />
          </button>
        </div>
        {/* info del proyecto */}
        <div className="ml-auto flex items-center gap-2 pr-1 text-[11px] text-neutral-400">
          <span className="rounded bg-black/25 px-2 py-0.5">{project.name}</span>
          <span>{project.scripts.length} scripts · {project.scene.objects.length} objetos</span>
          <span className="text-neutral-600">Unity 27.0.0f1 Personal</span>
        </div>
      </div>

      {/* ---- cuerpo principal ---- */}
      <div className="flex min-h-0 flex-1">
        {/* jerarquía */}
        <div className="flex w-52 shrink-0 flex-col border-r border-black/40 bg-[#28282c]">
          <div className="flex h-7 items-center justify-between border-b border-black/30 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Jerarquía
            <div className="relative">
              <button onClick={() => setCreateOpen((v) => !v)} className="rounded p-0.5 text-neutral-400 hover:bg-white/10 hover:text-white" title="Crear objeto">
                <Plus size={13} />
              </button>
              {createOpen && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setCreateOpen(false)} />
                  <div className="absolute right-0 top-6 z-[60] w-52 rounded-md border border-black/50 bg-[#333338] py-1 text-[11.5px] shadow-xl">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">Objeto 3D</div>
                    {primitives.map((p) => (
                      <button
                        key={p.kind}
                        onClick={() => {
                          setCreateOpen(false);
                          addObject(newObject(p.label, p.kind, [0, p.kind === "plane" ? 0 : 1, 0]));
                        }}
                        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#3d6ea5] hover:text-white"
                      >
                        {p.kind === "sphere" ? <Circle size={11} /> : <Box size={11} />} {p.label}
                      </button>
                    ))}
                    <div className="mt-1 border-t border-black/30 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">Otros</div>
                    <button
                      onClick={() => {
                        setCreateOpen(false);
                        addObject(newObject("Luz puntual"));
                        patchLastComponent("Light");
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#3d6ea5] hover:text-white"
                    >
                      <Lightbulb size={11} /> Luz puntual
                    </button>
                    <button
                      onClick={() => {
                        setCreateOpen(false);
                        addObject(newObject("Cámara"));
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#3d6ea5] hover:text-white"
                    >
                      <Video size={11} /> Cámara
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mac-scrollbar flex-1 overflow-y-auto py-1 text-[12px]">
            {project.scene.objects.map((o) => {
              const mesh = o.components.find((c) => c.type === "MeshRenderer")?.mesh;
              return (
                <div
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  onDoubleClick={() => setRenaming(o.id)}
                  className={`group mx-1 flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-[3px] ${selectedId === o.id ? "bg-[#3d6ea5] text-white" : "text-neutral-300 hover:bg-white/[0.07]"}`}
                >
                  <ChevronRight size={10} className="shrink-0 opacity-40" />
                  {mesh ? (
                    mesh.primitive === "sphere" ? <Circle size={10} className="shrink-0 opacity-80" /> : <Box size={10} className="shrink-0 opacity-80" />
                  ) : o.components.some((c) => c.type === "Light") ? (
                    <Lightbulb size={10} className="shrink-0 opacity-80" />
                  ) : o.components.some((c) => c.type === "Camera") ? (
                    <Video size={10} className="shrink-0 opacity-80" />
                  ) : (
                    <Box size={10} className="shrink-0 opacity-30" />
                  )}
                  {renaming === o.id ? (
                    <input
                      autoFocus
                      defaultValue={o.name}
                      onBlur={(e) => {
                        patchObject(o.id, { name: e.target.value || o.name });
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="w-full rounded bg-black/30 px-1 text-[12px] text-white outline-none ring-1 ring-[#5a9ce6]"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  )}
                  {!o.active && <span className="shrink-0 text-[9px] text-neutral-500">off</span>}
                </div>
              );
            })}
          </div>
          {/* acciones del seleccionado */}
          <div className="flex items-center gap-1 border-t border-black/30 p-1.5">
            <button onClick={duplicateSelected} disabled={!selectedId} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30" title="Duplicar (⌘D)">
              <Copy size={11} /> Duplicar
            </button>
            <button onClick={deleteSelected} disabled={!selectedId} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30" title="Eliminar (Supr)">
              <Trash2 size={11} /> Eliminar
            </button>
          </div>
        </div>

        {/* centro: vista (pestañas Scene/Game/Console) + proyecto abajo */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-7 shrink-0 items-center gap-0.5 border-b border-black/40 bg-[#26262a] px-2">
            {(
              [
                { id: "scene", label: "Escena" },
                { id: "game", label: "Juego" },
                { id: "console", label: "Consola" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-t px-2.5 py-1 text-[11.5px] ${tab === t.id ? "bg-[#1d1d1f] text-white" : "text-neutral-400 hover:bg-white/[0.06]"}`}
              >
                {t.label}
                {t.id === "console" && logs.some((l) => l.kind === "error") && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />}
              </button>
            ))}
            {playing && (
              <span className="ml-3 flex items-center gap-1.5 rounded-full bg-[#3d8f52]/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Play mode — Esc para detener
              </span>
            )}
            <span className="ml-auto text-[10px] text-neutral-500">
              {selected ? `${selected.name} — ${selected.transform.position.map((n) => n.toFixed(1)).join(", ")}` : "nada seleccionado"}
            </span>
          </div>

          {/* área de vista */}
          <div ref={viewRef} className="relative min-h-0 flex-1 bg-[#11151b]">
            {/* canvas de escena (editor) */}
            <canvas ref={sceneCanvasRef} className={`absolute inset-0 h-full w-full ${tab === "scene" ? "" : "hidden"}`} />
            {/* canvas de juego (runtime) */}
            <canvas
              ref={gameCanvasRef}
              className={`absolute inset-0 h-full w-full ${tab === "game" ? "" : "hidden"}`}
              tabIndex={0}
            />
            {tab === "game" && !playing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#11151b]/95 text-center">
                <Play size={26} className="text-emerald-400" />
                <p className="max-w-xs text-[12px] leading-relaxed text-neutral-400">
                  Pulsa <b className="text-neutral-200">Play</b> en la barra de arriba para ejecutar la escena con sus scripts C#.
                  La escena del editor no se modifica mientras juegas.
                </p>
              </div>
            )}
            {tab === "scene" && playing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[12px] text-neutral-300">
                El juego se está ejecutando en la pestaña Juego
              </div>
            )}
            {tab === "console" && (
              <div className="mac-scrollbar absolute inset-0 overflow-y-auto bg-[#18181b] p-2 text-[11.5px] leading-relaxed">
                <div className="mb-2 flex items-center gap-2">
                  <button onClick={() => setLogs([])} className="rounded bg-white/10 px-2 py-1 text-[10.5px] text-neutral-300 hover:bg-white/20">Limpiar</button>
                  <span className="text-[10px] text-neutral-500">{logs.length} entradas · Debug.Log, errores de compilación y de runtime</span>
                </div>
                {logs.length === 0 && <p className="px-2 py-6 text-center text-neutral-600">La consola está vacía. Debug.Log() escribe aquí.</p>}
                {logs.map((l, i) => (
                  <div key={i} className={`mb-0.5 flex gap-2 rounded px-2 py-1 ${l.kind === "error" ? "bg-red-500/10 text-red-300" : l.kind === "warn" ? "bg-amber-500/10 text-amber-300" : "text-neutral-300"}`}>
                    <span className="shrink-0 opacity-40">{new Date(l.t).toLocaleTimeString()}</span>
                    <span className="whitespace-pre-wrap">{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
            {/* editor de código */}
            {codeOpen && (
              <CodeEditor
                asset={project.scripts.find((s) => s.id === codeOpen)!}
                onClose={() => setCodeOpen(null)}
                onSave={(src) => {
                  setProject((p) => (p ? { ...p, scripts: p.scripts.map((s) => (s.id === codeOpen ? { ...s, source: src } : s)) } : p));
                  // compilar para validar al guardar
                  try {
                    compileCs(src);
                    setScriptError(null);
                    log("log", `Compilación de "${project.scripts.find((s) => s.id === codeOpen)?.name}.cs" sin errores`);
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setScriptError(msg);
                    log("error", `Compile error — ${project.scripts.find((s) => s.id === codeOpen)?.name}.cs\n${msg}`);
                  }
                }}
              />
            )}
          </div>

          {/* panel proyecto (assets/scripts) */}
          <div className="flex h-36 shrink-0 flex-col border-t border-black/40 bg-[#26262a]">
            <div className="flex h-7 items-center gap-2 border-b border-black/30 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Proyecto
              <button onClick={createScript} className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium normal-case text-[#8fbff2] hover:bg-white/10">
                <FileCode2 size={11} /> Crear script
              </button>
              <div className="ml-auto flex items-center gap-1 normal-case">
                <button
                  onClick={() => {
                    const json = exportProjectJson(project);
                    const blob = new Blob([json], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${project.name}.unityweb.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    notify("unity", "Proyecto exportado", `${project.name}.unityweb.json — ábrelo en Unity Player`);
                  }}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-neutral-300 hover:bg-white/10"
                  title="Exportar el proyecto como archivo .unityweb.json (lo puedes abrir en la app Unity Player)"
                >
                  <Save size={11} /> Exportar
                </button>
                <label className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-neutral-300 hover:bg-white/10" title="Importar proyecto .unityweb.json">
                  <ChevronDown size={11} className="rotate-[-90deg]" /> Importar
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
                        notify("unity", "Importación fallida", "El archivo no parece un proyecto .unityweb.json");
                        return;
                      }
                      saveProject(imported);
                      setActive(imported.name);
                      setProject(imported);
                      notify("unity", "Proyecto importado", imported.name);
                    }}
                  />
                </label>
                <select
                  value={project.name}
                  onChange={(e) => {
                    const p = getProject(e.target.value);
                    if (!p) return;
                    setActive(p.name);
                    setProject(p);
                    setSelectedId(p.scene.objects[0]?.id ?? null);
                  }}
                  className="rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] text-neutral-300 outline-none"
                  title="Proyectos guardados en este navegador"
                >
                  {projects.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const name = `NuevoProyecto${projects.length + 1}`;
                    const p: UProject = { name, scene: defaultScene(), scripts: [], updatedAt: Date.now() };
                    saveProject(p);
                    setActive(name);
                    setProject(p);
                    notify("unity", "Proyecto creado", name);
                  }}
                  className="rounded px-1.5 py-0.5 text-[10.5px] text-neutral-300 hover:bg-white/10"
                >
                  + Nuevo
                </button>
                <button
                  onClick={() => {
                    if (projects.length <= 1) return;
                    deleteProject(project.name);
                    const rest = listProjects();
                    if (rest[0]) {
                      setActive(rest[0].name);
                      setProject(rest[0]);
                    }
                    setProjects(rest.map((x) => x.name));
                  }}
                  className="rounded px-1.5 py-0.5 text-[10.5px] text-neutral-500 hover:bg-red-500/20 hover:text-red-300"
                  title="Eliminar este proyecto del navegador"
                >
                  Eliminar
                </button>
              </div>
            </div>
            <div className="mac-scrollbar flex flex-1 gap-2 overflow-x-auto p-2">
              {/* la escena */}
              <div className="flex shrink-0 flex-col items-center gap-1 rounded border border-white/10 bg-black/20 p-2">
                <Box size={26} className="text-neutral-300" />
                <span className="text-[10.5px] text-neutral-400">{project.scene.name}</span>
                <span className="text-[9px] text-neutral-600">escena</span>
              </div>
              {/* scripts */}
              {project.scripts.map((s) => (
                <button
                  key={s.id}
                  onDoubleClick={() => setCodeOpen(s.id)}
                  onClick={() => setCodeOpen(s.id)}
                  className="flex shrink-0 flex-col items-center gap-1 rounded border border-white/10 bg-black/20 p-2 hover:border-[#5a9ce6]"
                  title={`Doble clic para editar ${s.name}.cs`}
                >
                  <FileCode2 size={26} className="text-[#8fbff2]" />
                  <span className="text-[10.5px] text-neutral-300">{s.name}</span>
                  <span className="text-[9px] text-neutral-600">{s.source.split("\n").length} líneas</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* inspector */}
        <div className="mac-scrollbar flex w-72 shrink-0 flex-col overflow-y-auto border-l border-black/40 bg-[#28282c]">
          <div className="flex h-7 shrink-0 items-center justify-between border-b border-black/30 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Inspector
            {selected && (
              <div className="relative">
                <button onClick={() => setAddComponentOpen((v) => !v)} className="rounded p-0.5 text-neutral-400 hover:bg-white/10 hover:text-white" title="Añadir componente">
                  <Plus size={13} />
                </button>
                {addComponentOpen && (
                  <>
                    <div className="fixed inset-0 z-50" onClick={() => setAddComponentOpen(false)} />
                    <div className="absolute right-0 top-6 z-[60] w-48 rounded-md border border-black/50 bg-[#333338] py-1 text-[11.5px] shadow-xl">
                      {(
                        [
                          { type: "Rigidbody", label: "Rigidbody (física)" },
                          { type: "Collider", label: "Collider (colisión)" },
                          { type: "Light", label: "Light (luz)" },
                          { type: "Camera", label: "Camera" },
                        ] as const
                      ).map((c) => (
                        <button
                          key={c.type}
                          onClick={() => {
                            setAddComponentOpen(false);
                            if (!selected) return;
                            mutate((objs) =>
                              objs.map((o) =>
                                o.id === selected.id
                                  ? {
                                      ...o,
                                      components: [
                                        ...o.components,
                                        {
                                          type: c.type,
                                          enabled: true,
                                          rigidbody: c.type === "Rigidbody" ? { mass: 1, useGravity: true, isKinematic: false, drag: 0 } : undefined,
                                          collider: c.type === "Collider" ? { kind: "box", size: [1, 1, 1], isTrigger: false } : undefined,
                                          light: c.type === "Light" ? { kind: "point", color: "#ffffff", intensity: 1, range: 8 } : undefined,
                                        } as UComponent,
                                      ],
                                    }
                                  : o
                              )
                            );
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#3d6ea5] hover:text-white"
                        >
                          {c.label}
                        </button>
                      ))}
                      <div className="mt-1 border-t border-black/30" />
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">Scripts</div>
                      {project.scripts.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setAddComponentOpen(false);
                            if (!selected) return;
                            mutate((objs) =>
                              objs.map((o) => (o.id === selected.id ? { ...o, components: [...o.components, { type: "Script", enabled: true, script: { className: s.name } } as UComponent] } : o))
                            );
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#3d6ea5] hover:text-white"
                        >
                          <FileCode2 size={11} /> {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {!selected && <p className="p-3 text-[11.5px] leading-relaxed text-neutral-500">Selecciona un objeto en la Jerarquía (o haz clic en él en la Escena) para ver y editar sus componentes.</p>}

          {selected && (
            <div className="p-2">
              {/* cabecera del objeto */}
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={selected.name}
                  onChange={(e) => patchObject(selected.id, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/25 px-1.5 py-1 text-[12px] font-semibold text-white outline-none focus:border-[#5a9ce6]"
                />
                <label className="flex items-center gap-1 text-[10.5px] text-neutral-400" title="Activo">
                  <input type="checkbox" checked={selected.active} onChange={(e) => patchObject(selected.id, { active: e.target.checked })} className="accent-[#3d6ea5]" />
                  activo
                </label>
              </div>
              <input
                value={selected.tag}
                onChange={(e) => patchObject(selected.id, { tag: e.target.value })}
                placeholder="Tag (Untagged)"
                className="mb-2 w-full rounded border border-white/10 bg-black/25 px-1.5 py-1 text-[11px] text-neutral-300 outline-none focus:border-[#5a9ce6]"
                title={'Tag: úsalo con GameObject.FindGameObjectWithTag("...")'}
              />

              {/* Transform */}
              <Section title="Transform">
                {(["position", "rotation", "scale"] as const).map((k) => (
                  <div key={k} className="mb-1.5">
                    <div className="mb-0.5 text-[10.5px] capitalize text-neutral-500">{k === "rotation" ? "rotación (grados)" : k}</div>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <NumField
                          key={i}
                          value={selected.transform[k][i]}
                          onChange={(v) => {
                            const t = { ...selected.transform, [k]: [...selected.transform[k]] } as typeof selected.transform;
                            t[k][i] = v;
                            patchObject(selected.id, { transform: t });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </Section>

              {/* componentes */}
              {selected.components.map((c, idx) => (
                <Section
                  key={`${c.type}-${idx}`}
                  title={c.type === "Script" ? c.script?.className ?? "Script" : c.type}
                  onRemove={() => mutate((objs) => objs.map((o) => (o.id === selected.id ? { ...o, components: o.components.filter((_, i) => i !== idx) } : o)))}
                  right={
                    <label className="flex items-center gap-1 text-[10px] text-neutral-400">
                      <input type="checkbox" checked={c.enabled} onChange={(e) => patchComponent(selected.id, idx, { enabled: e.target.checked })} className="accent-[#3d6ea5]" />
                      on
                    </label>
                  }
                >
                  {c.mesh && (
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                        Primitiva
                        <select
                          value={c.mesh.primitive}
                          onChange={(e) => patchComponent(selected.id, idx, { mesh: { ...c.mesh!, primitive: e.target.value as PrimitiveKind } })}
                          className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none"
                        >
                          {primitives.map((p) => (
                            <option key={p.kind} value={p.kind}>{p.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                        Color
                        <input type="color" value={c.mesh.color} onChange={(e) => patchComponent(selected.id, idx, { mesh: { ...c.mesh!, color: e.target.value } })} className="h-6 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
                      </label>
                      <Slider label="Metálico" value={c.mesh.metallic} onChange={(v) => patchComponent(selected.id, idx, { mesh: { ...c.mesh!, metallic: v } })} />
                      <Slider label="Suavidad" value={c.mesh.smoothness} onChange={(v) => patchComponent(selected.id, idx, { mesh: { ...c.mesh!, smoothness: v } })} />
                    </div>
                  )}
                  {c.light && (
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                        Tipo
                        <select
                          value={c.light.kind}
                          onChange={(e) => patchComponent(selected.id, idx, { light: { ...c.light!, kind: e.target.value as "directional" | "point" | "spot" } })}
                          className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none"
                        >
                          <option value="directional">direccional</option>
                          <option value="point">puntual</option>
                          <option value="spot">foco</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                        Color
                        <input type="color" value={c.light.color} onChange={(e) => patchComponent(selected.id, idx, { light: { ...c.light!, color: e.target.value } })} className="h-6 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
                      </label>
                      <Slider label="Intensidad" value={c.light.intensity} min={0} max={5} step={0.1} onChange={(v) => patchComponent(selected.id, idx, { light: { ...c.light!, intensity: v } })} />
                      {c.light.kind !== "directional" && <Slider label="Alcance" value={c.light.range} min={1} max={40} step={1} onChange={(v) => patchComponent(selected.id, idx, { light: { ...c.light!, range: v } })} />}
                    </div>
                  )}
                  {c.rigidbody && (
                    <div className="space-y-1.5">
                      <NumRow label="Masa" value={c.rigidbody.mass} onChange={(v) => patchComponent(selected.id, idx, { rigidbody: { ...c.rigidbody!, mass: v } })} />
                      <NumRow label="Arrastre" value={c.rigidbody.drag} onChange={(v) => patchComponent(selected.id, idx, { rigidbody: { ...c.rigidbody!, drag: v } })} />
                      <CheckRow label="Usar gravedad" checked={c.rigidbody.useGravity} onChange={(v) => patchComponent(selected.id, idx, { rigidbody: { ...c.rigidbody!, useGravity: v } })} />
                      <CheckRow label="Cinemático (ignora física)" checked={c.rigidbody.isKinematic} onChange={(v) => patchComponent(selected.id, idx, { rigidbody: { ...c.rigidbody!, isKinematic: v } })} />
                    </div>
                  )}
                  {c.collider && (
                    <div className="space-y-1.5">
                      <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
                        Forma
                        <select
                          value={c.collider.kind}
                          onChange={(e) => patchComponent(selected.id, idx, { collider: { ...c.collider!, kind: e.target.value as "box" | "sphere" } })}
                          className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none"
                        >
                          <option value="box">caja</option>
                          <option value="sphere">esfera</option>
                        </select>
                      </label>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <NumField key={i} value={c.collider!.size[i]} onChange={(v) => { const s = [...c.collider!.size]; s[i] = v; patchComponent(selected.id, idx, { collider: { ...c.collider!, size: s as [number, number, number] } }); }} />
                        ))}
                      </div>
                      <CheckRow label="Disparador (sin colisión física)" checked={c.collider.isTrigger} onChange={(v) => patchComponent(selected.id, idx, { collider: { ...c.collider!, isTrigger: v } })} />
                    </div>
                  )}
                  {c.script && (
                    <div className="space-y-1.5">
                      <p className="text-[10.5px] leading-relaxed text-neutral-500">
                        Ciclo de vida: Start, Update, FixedUpdate, OnCollisionEnter(Collision). Campos públicos visibles en el script.
                      </p>
                      <button
                        onClick={() => {
                          const s = project.scripts.find((x) => x.name === c.script!.className);
                          if (s) setCodeOpen(s.id);
                        }}
                        className="w-full rounded bg-[#3d6ea5]/80 px-2 py-1 text-[11px] text-white hover:bg-[#3d6ea5]"
                      >
                        Abrir script
                      </button>
                    </div>
                  )}
                </Section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* pie de estado */}
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-black/40 bg-[#26262a] px-2 text-[10px] text-neutral-500">
        <span>C# (subconjunto Unity) · intérprete local</span>
        {scriptError && <span className="text-red-400">error de compilación — ver Consola</span>}
        <span className="ml-auto">Gizmos: arrastra las flechas · orbita con arrastre · rueda para zoom</span>
      </div>
    </div>
  );

  /** crear objeto y parchear su componente (para el menú de luz) */
  function patchLastComponent(type: string) {
    setProject((p) => {
      if (!p) return p;
      const objs = [...p.scene.objects];
      const last = objs[objs.length - 1];
      if (last) {
        objs[objs.length - 1] = {
          ...last,
          components: [...last.components, { type: "Light" as const, enabled: true, light: { kind: "point" as const, color: "#ffe9c4", intensity: 1.2, range: 8 } }],
        };
      }
      void type;
      return { ...p, scene: { ...p.scene, objects: objs } };
    });
  }
}

/* ============ subcomponentes del inspector ============ */
function Section({ title, children, onRemove, right }: { title: string; children: React.ReactNode; onRemove?: () => void; right?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2 rounded border border-white/10 bg-black/15">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-neutral-200">
          <ChevronDown size={10} className={open ? "" : "-rotate-90"} /> {title}
        </button>
        <span className="flex-1" />
        {right}
        {onRemove && (
          <button onClick={onRemove} className="rounded p-0.5 text-neutral-500 hover:text-red-400" title="Quitar componente">
            <Trash2 size={10} />
          </button>
        )}
      </div>
      {open && <div className="p-2">{children}</div>}
    </div>
  );
}

function NumField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      step={0.1}
      value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full rounded border border-white/10 bg-black/25 px-1 py-[3px] text-center text-[11px] tabular-nums text-neutral-200 outline-none focus:border-[#5a9ce6]"
    />
  );
}

function NumRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
      {label}
      <input type="number" step={0.1} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="w-24 rounded border border-white/10 bg-black/25 px-1 py-[3px] text-right text-[11px] tabular-nums text-neutral-200 outline-none focus:border-[#5a9ce6]" />
    </label>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-neutral-400">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#3d6ea5]" />
      {label}
    </label>
  );
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="block text-[11px] text-neutral-400">
      <span className="mb-0.5 block">{label} — <span className="tabular-nums text-neutral-300">{Math.round(value * 100) / 100}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-[#3d6ea5]" />
    </label>
  );
}

/* ============ editor de código C# ============ */
function CodeEditor({ asset, onClose, onSave }: { asset: { name: string; source: string }; onClose: () => void; onSave: (src: string) => void }) {
  const [src, setSrc] = useState(asset.source);
  const [saved, setSaved] = useState(true);
  const lines = src.split("\n").length;
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#141416]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-black/50 bg-[#26262a] px-2">
        <FileCode2 size={13} className="text-[#8fbff2]" />
        <span className="text-[12px] font-semibold text-neutral-200">{asset.name}.cs</span>
        {!saved && <span className="text-[10px] text-amber-400">modificado</span>}
        <span className="flex-1" />
        <button
          onClick={() => {
            onSave(src);
            setSaved(true);
          }}
          className="rounded bg-[#3d8f52] px-2.5 py-1 text-[11px] font-medium text-white hover:brightness-110"
        >
          Guardar y compilar
        </button>
        <button onClick={onClose} className="rounded bg-white/10 px-2.5 py-1 text-[11px] text-neutral-300 hover:bg-white/20">Cerrar</button>
      </div>
      <textarea
        value={src}
        spellCheck={false}
        onChange={(e) => {
          setSrc(e.target.value);
          setSaved(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.target as HTMLTextAreaElement;
            const s = el.selectionStart;
            setSrc(src.slice(0, s) + "    " + src.slice(el.selectionEnd));
            requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            onSave(src);
            setSaved(true);
          }
        }}
        className="mac-scrollbar min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-[12.5px] leading-[1.55] text-neutral-200 outline-none"
        style={{ fontFamily: "'SF Mono', 'Menlo', 'Consolas', monospace" }}
      />
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-black/40 bg-[#26262a] px-3 text-[10px] text-neutral-500">
        <span>{lines} líneas</span>
        <span>C# (subconjunto Unity: MonoBehaviour, Vector3, Mathf, Input, Debug, física)</span>
        <span className="ml-auto">⌘S guardar · Tab indenta</span>
      </div>
    </div>
  );
}
