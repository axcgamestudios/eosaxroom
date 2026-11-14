/* ============================================================
   Proyectos Unity — persistencia local (múltiples proyectos),
   exportación/importación a archivos .unityweb.json para
   probarlos en la app separada "Unity Player".
   ============================================================ */

import type { UProject, UScene, UScriptAsset } from "../unity/runtime";
import { defaultScene } from "../unity/runtime";

const KEY = "axcsos-unity-projects";
const ACTIVE_KEY = "axcsos-unity-active";

const DEMO_ROTATOR = `using UnityEngine;

public class Rotator : MonoBehaviour
{
    public float speed = 45f;

    void Update()
    {
        transform.Rotate(Vector3.up * speed * Time.deltaTime);
    }
}
`;

const DEMO_PLAYER = `using UnityEngine;

public class PlayerController : MonoBehaviour
{
    public float speed = 6f;
    public float jumpForce = 6f;

    void Start()
    {
        Debug.Log("PlayerController listo — mueve con WASD/flechas y salta con Espacio");
    }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        Vector3 dir = new Vector3(h, 0, v) * speed * Time.deltaTime;
        transform.position += dir;

        if (Input.GetKeyDown(KeyCode.Space))
        {
            transform.position += Vector3.up * 0.4f;
        }

        if (transform.position.y < -5f)
        {
            transform.position = new Vector3(0, 1, 0);
        }
    }
}
`;

const DEMO_SPINNER = `using UnityEngine;

public class ColorPulse : MonoBehaviour
{
    void Update()
    {
        float t = Time.time * 2f;
        renderer.material.color = new Color(
            (Mathf.Sin(t) + 1f) * 0.5f,
            (Mathf.Sin(t + 2f) + 1f) * 0.5f,
            (Mathf.Sin(t + 4f) + 1f) * 0.5f);
    }
}
`;

function read(): UProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UProject[];
  } catch {
    return [];
  }
}

function write(list: UProject[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function defaultProject(): UProject {
  const scene: UScene = defaultScene();
  // una esfera giratoria y un cubo jugador con scripts de demo
  const spinner = scene.objects.find((o) => o.name === "Cube")!;
  spinner.name = "Player";
  spinner.tag = "Player";
  if (spinner.components[0]?.mesh) spinner.components[0].mesh.color = "#2f7fe8";
  spinner.components.push({ type: "Script", enabled: true, script: { className: "PlayerController" } });
  spinner.components.push({ type: "Script", enabled: true, script: { className: "ColorPulse" } });
  const sphere = { ...spinner, id: `s${Date.now().toString(36)}`, name: "Sphere", tag: "Untagged" } as typeof spinner;
  sphere.transform = { position: [3.2, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  // ojo: sphere.components aún REFERENCEA los del Player — se reemplazan por objetos nuevos
  // (nunca mutarlos en sitio: son compartidos con Player por el spread)
  sphere.components = [
    { type: "MeshRenderer", enabled: true, mesh: { primitive: "sphere", color: "#f2c14e", metallic: 0.1, smoothness: 0.5 } },
    { type: "Collider", enabled: true, collider: { kind: "sphere", size: [1, 1, 1], isTrigger: false } },
    { type: "Rigidbody", enabled: true, rigidbody: { mass: 1, useGravity: false, isKinematic: true, drag: 0 } },
    { type: "Script", enabled: true, script: { className: "Rotator" } },
  ];
  scene.objects.push(sphere);
  const scripts: UScriptAsset[] = [
    { id: "sc1", name: "PlayerController", source: DEMO_PLAYER },
    { id: "sc2", name: "Rotator", source: DEMO_ROTATOR },
    { id: "sc3", name: "ColorPulse", source: DEMO_SPINNER },
  ];
  return { name: "MiJuego", scene, scripts, updatedAt: Date.now() };
}

export function listProjects(): UProject[] {
  const l = read();
  if (l.length) return l;
  const d = defaultProject();
  write([d]);
  setActive(d.name);
  return [d];
}

export function saveProject(p: UProject) {
  p.updatedAt = Date.now();
  const l = read();
  const i = l.findIndex((x) => x.name === p.name);
  if (i >= 0) l[i] = p;
  else l.push(p);
  write(l);
}

export function deleteProject(name: string) {
  write(read().filter((x) => x.name !== name));
  if (typeof window !== "undefined" && window.localStorage.getItem(ACTIVE_KEY) === name) {
    window.localStorage.removeItem(ACTIVE_KEY);
  }
}

export function getProject(name: string): UProject | undefined {
  return read().find((x) => x.name === name);
}

export function setActive(name: string) {
  window.localStorage.setItem(ACTIVE_KEY, name);
}
export function getActive(): string | null {
  return window.localStorage.getItem(ACTIVE_KEY);
}

/** proyecto → archivo .unityweb.json (para Unity Player / compartir) */
export function exportProjectJson(p: UProject): string {
  return JSON.stringify({ format: "unityweb", version: 1, ...p }, null, 2);
}

export function parseProjectJson(json: string): UProject | null {
  try {
    const data = JSON.parse(json) as Partial<UProject> & { format?: string };
    if (!data.scene || !Array.isArray(data.scene.objects)) return null;
    return {
      name: data.name || "Importado",
      scene: data.scene,
      scripts: Array.isArray(data.scripts) ? data.scripts : [],
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}
