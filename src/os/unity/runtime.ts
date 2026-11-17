/* ============================================================
   Unity Runtime — el motor que ejecuta una escena Unity:
   grafo de objetos, componentes, física mini (gravitación +
   colisiones AABB/esfera), host de scripts C# (transform,
   rigidbody, GetComponent, Instantiate/Destroy…), render con
   three.js. Lo comparten el editor (play mode) y Unity Player.
   ============================================================ */

import {
  CsClass,
  CsError,
  CsInstance,
  CsValue,
  Interpreter,
  compileCs,
  col,
  isVec,
  setStaticCtx,
  toVec,
  vec3,
  Vector3Val,
  ColorVal,
} from "./csharp";

/* ---------- Modelo de escena (serializable) ---------- */
export type PrimitiveKind = "cube" | "sphere" | "cylinder" | "capsule" | "plane" | "quad";

export interface UTransform { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }
export interface UMeshRenderer { primitive: PrimitiveKind; color: string; metallic: number; smoothness: number }
export interface ULight { kind: "directional" | "point" | "spot"; color: string; intensity: number; range: number }
export interface URigidbody { mass: number; useGravity: boolean; isKinematic: boolean; drag: number }
export interface UCollider { kind: "box" | "sphere"; size: [number, number, number]; isTrigger: boolean }
export interface UScript { className: string }

export interface UComponent {
  type: "MeshRenderer" | "Light" | "Rigidbody" | "Collider" | "Script" | "Camera";
  enabled: boolean;
  mesh?: UMeshRenderer;
  light?: ULight;
  rigidbody?: URigidbody;
  collider?: UCollider;
  script?: UScript;
}
export interface UObject {
  id: string;
  name: string;
  active: boolean;
  tag: string;
  isStatic: boolean;
  transform: UTransform;
  components: UComponent[];
}

export interface UScene { name: string; objects: UObject[] }
export interface UScriptAsset { id: string; name: string; source: string }
export interface UProject {
  name: string;
  scene: UScene;
  scripts: UScriptAsset[];
  updatedAt: number;
}

let _uid = 1;
export const uid = (): string => `o${Date.now().toString(36)}${(_uid++).toString(36)}`;

export function newObject(name: string, primitive?: PrimitiveKind, pos?: [number, number, number]): UObject {
  const o: UObject = {
    id: uid(),
    name,
    active: true,
    tag: "Untagged",
    isStatic: false,
    transform: { position: pos ?? [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    components: [],
  };
  if (primitive) {
    o.components.push({
      type: "MeshRenderer",
      enabled: true,
      mesh: { primitive, color: "#b9c2cc", metallic: 0.05, smoothness: 0.35 },
    });
    if (primitive !== "plane" && primitive !== "quad") {
      o.components.push({ type: "Collider", enabled: true, collider: { kind: primitive === "sphere" ? "sphere" : "box", size: [1, 1, 1], isTrigger: false } });
    }
  }
  return o;
}

export function defaultScene(): UScene {
  const objs: UObject[] = [];
  const ground = newObject("Plane", "plane", [0, 0, 0]);
  if (ground.components[0]?.mesh) ground.components[0].mesh.color = "#8e97a3";
  ground.transform.scale = [12, 1, 12];
  ground.tag = "Ground";
  objs.push(ground);
  const cube = newObject("Cube", "cube", [0, 1, 0]);
  if (cube.components[0]?.mesh) cube.components[0].mesh.color = "#d9453d";
  cube.components.push({ type: "Rigidbody", enabled: true, rigidbody: { mass: 1, useGravity: true, isKinematic: false, drag: 0 } });
  objs.push(cube);
  const sun = newObject("Directional Light");
  sun.components.push({ type: "Light", enabled: true, light: { kind: "directional", color: "#ffffff", intensity: 1.1, range: 10 } });
  objs.push(sun);
  const cam = newObject("Main Camera");
  cam.components.push({ type: "Camera", enabled: true });
  cam.transform.position = [0, 4.2, -8];
  cam.transform.rotation = [18, 0, 0];
  objs.push(cam);
  return { name: "SampleScene", objects: objs };
}

/* ---------- runtime ---------- */
type ConsoleFn = (kind: "log" | "warn" | "error", msg: string) => void;

interface ScriptInst {
  obj: UObject;
  klass: CsClass;
  inst: CsInstance;
  started: boolean;
  collidedWith: Set<string>;
  err?: string;
}

export class UnityRuntime {
  threeScene: import("three").Scene | null = null;
  renderer: import("three").WebGLRenderer | null = null;
  camera: import("three").PerspectiveCamera | null = null;
  obj3d = new Map<string, import("three").Object3D>();
  physicsState = new Map<string, { vel: [number, number, number]; grounded: boolean }>();
  scripts: ScriptInst[] = [];
  playing = false;
  paused = false;
  editorMode = false;
  frameCount = 0;
  timeSec = 0;
  keys = new Set<string>();
  keyDowns = new Set<string>();
  errors: string[] = [];
  private raf = 0;
  private fixedAcc = 0;
  private onSceneChange?: () => void;
  /** contacto del frame actual para OnCollisionEnter */
  private contacts: { a: string; b: string }[] = [];

  constructor(
    public scene: UScene,
    public scriptsAssets: UScriptAsset[],
    private log: ConsoleFn,
    onSceneChange?: () => void,
  ) {
    this.onSceneChange = onSceneChange;
  }

  /* ---------- lifecycle ---------- */
  /** modo editor: monta three.js y renderiza UNA vez, sin loop ni scripts */
  async startEditor(canvas: HTMLCanvasElement) {
    const THREE = await import("three");
    (globalThis as { __THREE?: typeof import("three") }).__THREE = THREE;
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color("#11151b");
    const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x2c3038, 1.0);
    this.threeScene.add(hemi);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const grid = new THREE.GridHelper(24, 24, 0x3a4150, 0x22262e);
    grid.position.y = 0.02;
    this.threeScene.add(grid);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.camera.position.set(9, 7, -11);
    this.camera.lookAt(0, 0, 0);
    this.editorMode = true;
    this.rebuild();
    this.renderOnce();
  }

  renderOnce() {
    if (!this.renderer || !this.threeScene || !this.camera) return;
    this.renderer.render(this.threeScene, this.camera);
  }

  async start(canvas: HTMLCanvasElement) {
    const THREE = await import("three");
    (globalThis as { __THREE?: typeof import("three") }).__THREE = THREE;
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color("#0e1116");
    this.threeScene.fog = new THREE.Fog(0x0e1116, 30, 90);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.camera.aspect = 1;
    // ambiente
    const hemi = new THREE.HemisphereLight(0xdfe6ee, 0x2c3038, 1.0);
    this.threeScene.add(hemi);
    this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.28));
    this.rebuild();
    // compilar scripts
    this.compileScripts();
    this.playing = true;
    this.frameCount = 0;
    this.timeSec = 0;
    this.keys.clear();
    this.keyDowns.clear();
    // arranque: Start() de todos
    for (const s of this.scripts) {
      if (s.err) continue;
      try { this.callLifecycle(s, "Start", []); s.started = true; } catch (e) { this.scriptError(s, e); }
    }
    const loop = (t: number) => {
      if (!this.playing) return;
      const dt = Math.min(0.05, (t - (this._lastT ?? t)) / 1000 || 0.016);
      this._lastT = t;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private _lastT: number | undefined;

  /** avanza un fotograma manualmente (botón Step con el juego en pausa) */
  step() {
    const p = this.paused;
    this.paused = false;
    this.frame(1 / 60);
    this.paused = p;
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.keyDowns.clear();
    this.keys.clear();
  }

  dispose() {
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.obj3d.clear();
  }

  resize(w: number, h: number) {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /* ---------- reconstrucción del grafo three ---------- */
  rebuild() {
    if (!this.threeScene) return;
    for (const [, o3] of this.obj3d) this.threeScene.remove(o3);
    this.obj3d.clear();
    for (const o of this.scene.objects) this.addObject3D(o);
  }

  /** sincroniza transforms y visuales EN VIVO sobre los mismos Object3D,
      sin reconstruir: usado por el editor cuando solo cambian valores
      (arrastre del gizmo, Inspector). Así el gizmo no se desengancha. */
  syncLive() {
    for (const o of this.scene.objects) {
      const obj = this.obj3d.get(o.id);
      if (!obj) continue;
      this.applyTransform(obj, o);
      obj.name = o.name;
      const meshC = o.components.find((c) => c.type === "MeshRenderer");
      const o3 = obj as unknown as {
        isMesh?: boolean; isLight?: boolean; isPointLight?: boolean; isSpotLight?: boolean;
        material?: { color?: { set: (c: string) => void }; metalness: number; roughness: number };
        color?: { set: (c: string) => void }; intensity: number;
      };
      if (o3.isMesh) {
        obj.visible = o.active && (meshC?.enabled ?? true);
        const mesh = meshC?.enabled ? meshC.mesh : undefined;
        if (mesh && o3.material?.color) {
          o3.material.color.set(mesh.color);
          o3.material.metalness = mesh.metallic;
          o3.material.roughness = 1 - mesh.smoothness;
        }
      }
      const lightC = o.components.find((c) => c.type === "Light" && c.enabled)?.light;
      if (o3.isLight && lightC) {
        o3.color?.set(lightC.color);
        o3.intensity = o3.isPointLight ? lightC.intensity * 14 : o3.isSpotLight ? lightC.intensity * 8 : lightC.intensity;
      }
    }
  }

  private addObject3D(o: UObject) {
    if (!this.threeScene) return;
    const THREE = (globalThis as { __THREE?: typeof import("three") }).__THREE!;
    let obj: import("three").Object3D | null = null;
    const mesh = o.components.find((c) => c.type === "MeshRenderer" && c.enabled)?.mesh;
    const light = o.components.find((c) => c.type === "Light" && c.enabled)?.light;
    if (mesh) {
      const geo = this.geometryFor(THREE, mesh.primitive);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(mesh.color),
        metalness: mesh.metallic,
        roughness: 1 - mesh.smoothness,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      obj = m;
    } else if (light) {
      if (light.kind === "directional") {
        const d = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
        d.position.set(3, 6, 4);
        obj = d;
      } else if (light.kind === "point") {
        const p = new THREE.PointLight(new THREE.Color(light.color), light.intensity * 14, light.range, 1.6);
        obj = p;
      } else {
        const s = new THREE.SpotLight(new THREE.Color(light.color), light.intensity * 8, light.range, 0.6, 0.4);
        obj = s;
      }
    } else {
      obj = new THREE.Object3D(); // vacío / cámara / marcador
    }
    obj.name = o.name;
    this.applyTransform(obj, o);
    this.threeScene.add(obj);
    this.obj3d.set(o.id, obj);
  }

  private applyTransform(obj: import("three").Object3D, o: UObject) {
    const [px, py, pz] = o.transform.position;
    const [rx, ry, rz] = o.transform.rotation;
    const [sx, sy, sz] = o.transform.scale;
    obj.position.set(px, py, pz);
    obj.rotation.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180);
    obj.scale.set(sx, sy, sz);
    obj.visible = o.active;
  }

  geometryFor(THREE: typeof import("three"), p: PrimitiveKind): import("three").BufferGeometry {
    switch (p) {
      case "cube": return new THREE.BoxGeometry(1, 1, 1);
      case "sphere": return new THREE.SphereGeometry(0.5, 24, 18);
      case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      case "capsule": return new THREE.CapsuleGeometry(0.34, 0.7, 6, 14);
      case "plane": return new THREE.BoxGeometry(1, 0.04, 1);
      case "quad": return new THREE.PlaneGeometry(1, 1);
    }
  }

  /* ---------- compilar y enlazar scripts ---------- */
  compileScripts() {
    this.scripts = [];
    this.errors = [];
    for (const asset of this.scriptsAssets) {
      let classes: CsClass[];
      try {
        classes = compileCs(asset.source);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.errors.push(`"${asset.name}.cs": ${msg}`);
        this.log("error", `Compile error — ${asset.name}.cs\n${msg}`);
        continue;
      }
      const mb = classes.find((c) => c.methods.has("Start") || c.methods.has("Update") || c.methods.has("FixedUpdate") || c.name.includes("Behaviour"));
      if (!mb) continue;
      // objetos que llevan este script
      for (const o of this.scene.objects) {
        if (o.components.some((c) => c.type === "Script" && c.script?.className === mb.name && c.enabled)) {
          const inst = new CsInstance(mb, this.hostFor(o, mb.name));
          // inicializar campos públicos con su init (si es constante evaluable)
          const interp0 = new Interpreter(this.lookupFor(mb, inst), (m) => this.log("log", m));
          for (const f of mb.fields) {
            let v: CsValue = null;
            if (f.init) {
              try { v = interp0.runExpr(inst, f.init as never); } catch { v = null; }
            }
            else {
              if (f.type === "float" || f.type === "int") v = 0;
              else if (f.type === "bool") v = false;
              else if (f.type === "string") v = "";
            }
            inst.fields.set(f.name, v);
          }
          this.scripts.push({ obj: o, klass: mb, inst, started: false, collidedWith: new Set() });
        }
      }
    }
  }

  private lookupFor(klass: CsClass, self: CsInstance) {
    return (name: string, _args: CsValue[]): { klass: CsClass; self: CsInstance } | null => {
      if (klass.methods.has(name)) return { klass, self };
      return null;
    };
  }

  private callLifecycle(s: ScriptInst, method: string, args: CsValue[]): CsValue {
    const m = s.klass.methods.get(method);
    if (!m) return null;
    const interp = new Interpreter(this.lookupFor(s.klass, s.inst), (msg) => this.log("log", msg));
    setStaticCtx(this.staticCtx());
    return interp.runMethod(s.inst, m, args);
  }

  private scriptError(s: ScriptInst, e: unknown) {
    const msg = e instanceof CsError ? e.message : e instanceof Error ? e.message : String(e);
    s.err = msg;
    const nm = `${s.obj.name} ← ${s.klass.name}`;
    this.log("error", `Runtime error — ${nm}\n${msg}`);
  }

  /* ---------- host de un objeto (transform, rigidbody, GetComponent…) ---------- */
  hostFor(o: UObject, className: string): import("./csharp").HostObject {
    const self: import("./csharp").HostObject = {
      get: (name) => {
        if (name === "transform") return { __ref: true, obj: this.transformHost(o), klass: "Transform" };
        if (name === "gameObject") return { __ref: true, obj: this.gameObjectHost(o), klass: "GameObject" };
        if (name === "renderer") {
          const mr = o.components.find((c) => c.type === "MeshRenderer" && c.enabled);
          return mr ? { __ref: true, obj: this.rendererHost(o), klass: "Renderer" } : null;
        }
        if (name === "rigidbody") {
          const rb = o.components.find((c) => c.type === "Rigidbody" && c.enabled);
          return rb ? { __ref: true, obj: this.rigidbodyHost(o), klass: "Rigidbody" } : null;
        }
        return undefined;
      },
      set: (_n, _v) => undefined,
      invoke: (name, args) => {
        if (name === "GetComponent") {
          const t = String(args[0] ?? "");
          return this.componentHost(o, t);
        }
        return undefined;
      },
    };
    void className;
    return self;
  }

  private transformHost(o: UObject): import("./csharp").HostObject {
    const pos = () => vec3(o.transform.position[0], o.transform.position[1], o.transform.position[2]);
    const rot = () => vec3(o.transform.rotation[0], o.transform.rotation[1], o.transform.rotation[2]);
    const scl = () => vec3(o.transform.scale[0], o.transform.scale[1], o.transform.scale[2]);
    return {
      get: (n) => {
        if (n === "position") return pos();
        if (n === "localPosition") return pos();
        if (n === "rotation") return rot();
        if (n === "localEulerAngles") return rot();
        if (n === "eulerAngles") return rot();
        if (n === "localScale") return scl();
        if (n === "forward") {
          const [rx, ry, rz] = o.transform.rotation;
          const e = new (this.T().Euler)((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180);
          const v = new (this.T().Vector3)(0, 0, 1).applyEuler(e);
          return vec3(v.x, v.y, v.z);
        }
        if (n === "up") return vec3(0, 1, 0);
        if (n === "right") return vec3(1, 0, 0);
        return undefined;
      },
      set: (n, v) => {
        const vec = toVec(v);
        if (n === "position" || n === "localPosition") o.transform.position = [vec.x, vec.y, vec.z];
        else if (n === "rotation" || n === "localEulerAngles" || n === "eulerAngles") o.transform.rotation = [vec.x, vec.y, vec.z];
        else if (n === "localScale") o.transform.scale = [vec.x, vec.y, vec.z];
        this.syncObj(o);
      },
      invoke: (n, args) => {
        if (n === "Translate") {
          const d = toVec(args[0]);
          o.transform.position = [o.transform.position[0] + d.x, o.transform.position[1] + d.y, o.transform.position[2] + d.z];
          this.syncObj(o);
          return null;
        }
        if (n === "Rotate") {
          const r = toVec(args[0]);
          o.transform.rotation = [o.transform.rotation[0] + r.x, o.transform.rotation[1] + r.y, o.transform.rotation[2] + r.z];
          this.syncObj(o);
          return null;
        }
        if (n === "LookAt") {
          const t = toVec(args[0]);
          const dx = t.x - o.transform.position[0], dz = t.z - o.transform.position[2];
          o.transform.rotation = [0, (Math.atan2(dx, dz) * 180) / Math.PI, 0];
          this.syncObj(o);
          return null;
        }
        if (n === "ToString") return o.name;
        return undefined;
      },
    };
  }

  private gameObjectHost(o: UObject): import("./csharp").HostObject & { __uo: UObject } {
    const h: import("./csharp").HostObject & { __uo: UObject } = {
      __uo: o,
      get: (n) => {
        if (n === "name") return o.name;
        if (n === "activeSelf") return o.active;
        if (n === "activeInHierarchy") return o.active;
        if (n === "tag") return o.tag;
        if (n === "transform") return { __ref: true, obj: this.transformHost(o), klass: "Transform" };
        if (n === "renderer") return { __ref: true, obj: this.rendererHost(o), klass: "Renderer" };
        if (n === "rigidbody") {
          const rb = o.components.find((c) => c.type === "Rigidbody" && c.enabled);
          return rb ? { __ref: true, obj: this.rigidbodyHost(o), klass: "Rigidbody" } : null;
        }
        return undefined;
      },
      set: (n, v) => {
        if (n === "name") o.name = String(v);
        this.onSceneChange?.();
      },
      invoke: (n, args) => {
        if (n === "GetComponent") return this.componentHost(o, String(args[0] ?? ""));
        if (n === "SetActive") { o.active = !!args[0]; this.syncObj(o); return null; }
        if (n === "CompareTag") return o.tag === String(args[0] ?? "");
        if (n === "ToString") return o.name;
        return undefined;
      },
    };
    return h;
  }

  private rendererHost(o: UObject): import("./csharp").HostObject {
    return {
      get: (n) => {
        const mesh = o.components.find((c) => c.type === "MeshRenderer")?.mesh;
        if (n === "material" && mesh) return { __ref: true, obj: this.materialHost(o), klass: "Material" };
        if (n === "enabled") return o.components.find((c) => c.type === "MeshRenderer")?.enabled ?? false;
        return undefined;
      },
      set: (n, v) => {
        if (n === "enabled") { const c = o.components.find((x) => x.type === "MeshRenderer"); if (c) c.enabled = !!v; this.syncObj(o); }
      },
      invoke: () => undefined,
    };
  }

  private materialHost(o: UObject): import("./csharp").HostObject {
    const mesh = () => o.components.find((c) => c.type === "MeshRenderer")?.mesh;
    return {
      get: (n) => {
        const m = mesh();
        if (!m) return undefined;
        if (n === "color") {
          const c = new (this.T().Color)(m.color);
          return col(c.r, c.g, c.b, 1);
        }
        return undefined;
      },
      set: (n, v) => {
        const m = mesh();
        if (!m) return;
        if (n === "color" && v && typeof v === "object" && (v as ColorVal).__col) {
          const cv = v as ColorVal;
          const c = new (this.T().Color)(cv.r, cv.g, cv.b);
          m.color = `#${c.getHexString()}`;
          this.syncObj(o);
        }
      },
      invoke: () => undefined,
    };
  }

  private rigidbodyHost(o: UObject): import("./csharp").HostObject {
    const rb = () => o.components.find((c) => c.type === "Rigidbody")?.rigidbody;
    const st = () => this.physicsState.get(o.id) ?? { vel: [0, 0, 0], grounded: false };
    return {
      get: (n) => {
        if (!rb()) return undefined;
        if (n === "mass") return rb()!.mass;
        if (n === "useGravity") return rb()!.useGravity;
        if (n === "isKinematic") return rb()!.isKinematic;
        if (n === "velocity") { const s = st(); return vec3(s.vel[0], s.vel[1], s.vel[2]); }
        if (n === "drag") return rb()!.drag;
        return undefined;
      },
      set: (n, v) => {
        const r = rb(); if (!r) return;
        if (n === "mass") r.mass = Number(v) || 1;
        if (n === "useGravity") r.useGravity = !!v;
        if (n === "isKinematic") r.isKinematic = !!v;
        if (n === "drag") r.drag = Number(v) || 0;
        if (n === "velocity") { const vec = toVec(v); const s = st(); s.vel = [vec.x, vec.y, vec.z]; this.physicsState.set(o.id, s); }
      },
      invoke: (n, args) => {
        const r = rb(); if (!r) return null;
        if (n === "AddForce") {
          const f = toVec(args[0]);
          const s = st();
          s.vel = [s.vel[0] + f.x / r.mass, s.vel[1] + f.y / r.mass, s.vel[2] + f.z / r.mass];
          this.physicsState.set(o.id, s);
          return null;
        }
        if (n === "AddTorque") return null;
        if (n === "Sleep") { this.physicsState.set(o.id, { vel: [0, 0, 0], grounded: true }); return null; }
        if (n === "Wake") return null;
        return undefined;
      },
    };
  }

  /** GetComponent<T>() — T llega como string del nombre genérico */
  private componentHost(o: UObject, t: string): CsValue {
    if (t === "Transform") return { __ref: true, obj: this.transformHost(o), klass: "Transform" };
    if (t === "Rigidbody") {
      const rb = o.components.find((c) => c.type === "Rigidbody" && c.enabled);
      return rb ? { __ref: true, obj: this.rigidbodyHost(o), klass: "Rigidbody" } : null;
    }
    if (t === "MeshRenderer" || t === "Renderer") {
      const c = o.components.find((x) => x.type === "MeshRenderer" && x.enabled);
      return c ? { __ref: true, obj: this.rendererHost(o), klass: "Renderer" } : null;
    }
    if (t === "Light") {
      const c = o.components.find((x) => x.type === "Light" && x.enabled);
      if (!c) return null;
      const o3 = this.obj3d.get(o.id);
      const light = c.light!;
      return {
        __ref: true,
        klass: "Light",
        obj: {
          get: (n: string) => (n === "intensity" ? light.intensity : n === "range" ? light.range : undefined),
          set: (n: string, v: CsValue) => { if (n === "intensity") { light.intensity = Number(v) || 0; void o3; } },
          invoke: () => undefined,
        },
      };
    }
    // componente script por nombre de clase
    const comp = o.components.find((x) => x.type === "Script" && x.script?.className === t && x.enabled);
    if (comp) {
      const s = this.scripts.find((x) => x.obj.id === o.id && x.klass.name === t);
      if (s) return { __ref: true, obj: s.inst, klass: t };
    }
    return null;
  }

  private T(): typeof import("three") {
    return (globalThis as { __THREE?: typeof import("three") }).__THREE!;
  }

  /* ---------- contexto estático (Input/Time/Debug/GameObject/Random…) ---------- */
  private staticCtx() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- el literal de abajo cierra sobre `this`
    const rt = this;
    const keyOf = (k: string): string => k;
    return {
      input: {
        axis: (name: string) => {
          const n = name.toLowerCase();
          if (n === "horizontal") return (rt.keys.has("LeftArrow") || rt.keys.has("A") ? -1 : 0) + (rt.keys.has("RightArrow") || rt.keys.has("D") ? 1 : 0);
          if (n === "vertical") return (rt.keys.has("DownArrow") || rt.keys.has("S") ? -1 : 0) + (rt.keys.has("UpArrow") || rt.keys.has("W") ? 1 : 0);
          return 0;
        },
        key: (c: string) => rt.keys.has(keyOf(c)),
        keyDown: (c: string) => rt.keyDowns.has(keyOf(c)),
        mousePos: () => vec3(),
        mouse0: () => false,
      },
      time: { deltaTime: rt._dt, time: rt.timeSec, frameCount: rt.frameCount },
      debugLog: (msg: string) => rt.log("log", msg),
      gameObjects: {
        create: (name: string) => {
          const o = newObject(name || "GameObject");
          rt.scene.objects.push(o);
          rt.rebuild();
          rt.onSceneChange?.();
          return { __ref: true, obj: rt.gameObjectHost(o), klass: "GameObject" } as CsValue;
        },
        find: (name: string) => {
          const o = rt.scene.objects.find((x) => x.name === name && x.active);
          return o ? ({ __ref: true, obj: rt.gameObjectHost(o), klass: "GameObject" } as CsValue) : null;
        },
        tag: (tag: string) => {
          const o = rt.scene.objects.find((x) => x.tag === tag && x.active);
          return o ? ({ __ref: true, obj: rt.gameObjectHost(o), klass: "GameObject" } as CsValue) : null;
        },
        findObjectOfType: (type: string) => {
          const o = rt.scene.objects.find((x) => x.components.some((c) => c.type === type || c.script?.className === type));
          return o ? ({ __ref: true, obj: rt.gameObjectHost(o), klass: "GameObject" } as CsValue) : null;
        },
        destroy: (obj: CsValue) => {
          const ref = obj as { __ref?: boolean; obj?: { __uo?: UObject } } | null;
          const target = ref?.obj?.__uo;
          if (!target) return undefined;
          rt.scene.objects = rt.scene.objects.filter((x) => x.id !== target.id);
          rt.scripts = rt.scripts.filter((x) => x.obj.id !== target.id);
          rt.rebuild();
          rt.onSceneChange?.();
          return undefined;
        },
        instantiate: (obj: CsValue, pos?: Vector3Val) => {
          const ref = obj as { __ref?: boolean; obj?: { __uo?: UObject } } | null;
          const src = ref?.obj?.__uo;
          if (!src) return null;
          const clone: UObject = JSON.parse(JSON.stringify(src));
          clone.id = uid();
          clone.name = `${src.name}(Clone)`;
          if (pos) clone.transform.position = [pos.x, pos.y, pos.z];
          rt.scene.objects.push(clone);
          rt.rebuild();
          // instanciar scripts del clon
          rt.compileScripts();
          for (const s of rt.scripts) {
            if (s.obj.id === clone.id && !s.started) {
              try { rt.callLifecycle(s, "Start", []); s.started = true; } catch (e) { rt.scriptError(s, e); }
            }
          }
          rt.onSceneChange?.();
          return { __ref: true, obj: rt.gameObjectHost(clone), klass: "GameObject" } as CsValue;
        },
      },
      physics: {
        raycast: (origin: Vector3Val, dir: Vector3Val, maxDist: number) => {
          const THREE = rt.T();
          if (!rt.threeScene) return null;
          const rc = new THREE.Raycaster(
            new THREE.Vector3(origin.x, origin.y, origin.z),
            new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
            0,
            maxDist || Infinity,
          );
          const hits = rc.intersectObjects([...rt.obj3d.values()], true);
          const hit = hits[0];
          if (!hit) return null;
          const o = rt.scene.objects.find((x) => rt.obj3d.get(x.id) === (hit.object as unknown));
          if (!o) return null;
          return { __ref: true, obj: rt.gameObjectHost(o), klass: "GameObject" } as CsValue;
        },
      },
      random: {
        range: (a: number, b: number) => a + Math.random() * (b - a),
        value: () => Math.random(),
        insideUnitSphere: () => {
          const v = vec3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
          const l = Math.hypot(v.x, v.y, v.z) || 1;
          return vec3(v.x / l, v.y / l, v.z / l);
        },
      },
      loadScene: (name: string) => rt.log("warn", `SceneManager.LoadScene("${name}") — el reproductor no recarga escenas todavía.`),
    };
  }

  /* ---------- frame ---------- */
  private _dt = 0.016;

  frame(dt: number) {
    if (this.editorMode) { this.renderOnce(); return; }
    this._dt = dt;
    if (this.paused) { this.renderer?.render(this.threeScene!, this.camera!); return; }
    this.timeSec += dt;
    this.frameCount++;
    // Update de scripts
    for (const s of this.scripts) {
      if (s.err || !s.inst.host) continue;
      try {
        if (!s.started) { this.callLifecycle(s, "Start", []); s.started = true; }
        this.callLifecycle(s, "Update", []);
      } catch (e) { this.scriptError(s, e); }
    }
    // física con paso fijo (50 Hz como Unity)
    this.fixedAcc += dt;
    while (this.fixedAcc >= 0.02) {
      this.fixedAcc -= 0.02;
      this.fixedStep(0.02);
    }
    // transform → three
    for (const o of this.scene.objects) this.syncObj(o);
    // cámara principal
    this.updateCamera();
    this.keyDowns.clear();
    this.renderer?.render(this.threeScene!, this.camera!);
  }

  private fixedStep(h: number) {
    // FixedUpdate de scripts
    for (const s of this.scripts) {
      if (s.err) continue;
      try { this.callLifecycle(s, "FixedUpdate", []); } catch (e) { this.scriptError(s, e); }
    }
    this.contacts = [];
    const g = -9.81;
    for (const o of this.scene.objects) {
      const rbc = o.components.find((c) => c.type === "Rigidbody" && c.enabled);
      if (!rbc || !rbc.rigidbody || rbc.rigidbody.isKinematic || !o.active) continue;
      const st = this.physicsState.get(o.id) ?? { vel: [0, 0, 0], grounded: false };
      const col = o.components.find((c) => c.type === "Collider" && c.enabled && !c.collider?.isTrigger)?.collider;
      if (rbc.rigidbody.useGravity) st.vel[1] += g * h;
      // drag
      const drag = rbc.rigidbody.drag || 0;
      const damp = Math.max(0, 1 - drag * h);
      st.vel[0] *= damp; st.vel[2] *= damp;
      // suelo y=0 (mitad de la altura del colisionador * escala)
      const halfH = this.halfHeight(o, col);
      const py = o.transform.position[1];
      if (py + st.vel[1] * h <= halfH) {
        o.transform.position[1] = halfH;
        if (st.vel[1] < 0) st.vel[1] = 0;
        st.grounded = true;
      } else st.grounded = false;
      o.transform.position[0] += st.vel[0] * h;
      o.transform.position[1] += st.vel[1] * h;
      o.transform.position[2] += st.vel[2] * h;
      this.physicsState.set(o.id, st);
    }
    // colisiones AABB simples entre objetos con colisionador
    const colliders = this.scene.objects.filter((o) => o.active && o.components.some((c) => c.type === "Collider" && c.enabled && !c.collider?.isTrigger));
    for (let i = 0; i < colliders.length; i++) {
      for (let j = i + 1; j < colliders.length; j++) {
        const a = colliders[i], b = colliders[j];
        if (this.aabbOverlap(a, b)) this.contacts.push({ a: a.id, b: b.id });
      }
    }
    // OnCollisionEnter(Collision) de scripts
    for (const s of this.scripts) {
      if (s.err) continue;
      for (const c of this.contacts) {
        const otherId = c.a === s.obj.id ? c.b : c.b === s.obj.id ? c.a : null;
        if (!otherId) continue;
        if (s.collidedWith.has(otherId)) continue;
        s.collidedWith.add(otherId);
        const other = this.scene.objects.find((x) => x.id === otherId);
        const collisionHost = {
          get: (n: string) => (n === "gameObject" ? { __ref: true, obj: this.gameObjectHost(other!), klass: "GameObject" } : n === "collider" ? { __ref: true, obj: { get: () => undefined, invoke: () => undefined }, klass: "Collider" } : undefined),
          invoke: () => undefined,
        };
        try { this.callLifecycle(s, "OnCollisionEnter", [{ __ref: true, obj: collisionHost, klass: "Collision" } as CsValue]); } catch (e) { this.scriptError(s, e); }
      }
    }
  }

  private halfHeight(o: UObject, col?: UCollider): number {
    const c = col ?? o.components.find((x) => x.type === "Collider")?.collider;
    const sy = o.transform.scale[1];
    if (c?.kind === "sphere") return 0.5 * sy;
    return 0.5 * (c ? c.size[1] : 1) * sy;
  }

  private aabb(a: UObject): { min: [number, number, number]; max: [number, number, number] } {
    const col = a.components.find((c) => c.type === "Collider")?.collider;
    const s = a.transform.scale;
    const size: [number, number, number] = col?.kind === "sphere" ? [1, 1, 1] : (col ? col.size : [1, 1, 1]);
    const hs: [number, number, number] = [(size[0] * s[0]) / 2, (col?.kind === "sphere" ? s[1] : (size[1] * s[1]) / 2), (size[2] * s[2]) / 2];
    const p = a.transform.position;
    return { min: [p[0] - hs[0], p[1] - hs[1], p[2] - hs[2]], max: [p[0] + hs[0], p[1] + hs[1], p[2] + hs[2]] };
  }
  private aabbOverlap(a: UObject, b: UObject): boolean {
    const A = this.aabb(a), B = this.aabb(b);
    return A.min[0] <= B.max[0] && A.max[0] >= B.min[0] && A.min[1] <= B.max[1] && A.max[1] >= B.min[1] && A.min[2] <= B.max[2] && A.max[2] >= B.min[2];
  }

  private updateCamera() {
    if (this.editorMode) return; // el editor orbita con controles externos
    const camObj = this.scene.objects.find((o) => o.components.some((c) => c.type === "Camera" && c.enabled) && o.active);
    if (camObj && this.camera) {
      const o3 = this.obj3d.get(camObj.id);
      if (o3) {
        this.camera.position.copy(o3.position);
        this.camera.quaternion.copy(o3.quaternion);
        // Unity mira a +Z con rotación 0; three.js mira a −Z: girar 180° en Y
        this.camera.rotateY(Math.PI);
        this.camera.scale.set(1, 1, 1);
      }
    }
  }

  syncObj(o: UObject) {
    const o3 = this.obj3d.get(o.id);
    if (o3) { this.applyTransform(o3, o); o3.visible = o.active; }
  }

  /* ---------- input del teclado ---------- */
  keyEvent(e: KeyboardEvent, down: boolean) {
    const code = mapKey(e);
    if (!code) return;
    if (down) {
      if (!this.keys.has(code)) this.keyDowns.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }
}

/** mapeo evento→KeyCode de Unity */
export function mapKey(e: KeyboardEvent): string | null {
  if (e.key === " ") return "Space";
  if (e.key === "ArrowUp") return "UpArrow";
  if (e.key === "ArrowDown") return "DownArrow";
  if (e.key === "ArrowLeft") return "LeftArrow";
  if (e.key === "ArrowRight") return "RightArrow";
  if (/^[a-zA-Z]$/.test(e.key)) return e.key.toUpperCase();
  if (/^[0-9]$/.test(e.key)) return `Alpha${e.key}`;
  if (e.key === "Shift") return "LeftShift";
  if (e.key === "Enter") return "Return";
  if (e.key === "Escape") return "Escape";
  return null;
}
