#!/usr/bin/env node
/* ============================================================
   build:pages — export estático para GitHub Pages
   ------------------------------------------------------------
   GitHub Pages no puede servir API Routes (POST). El export
   estático de Next las rechaza, así que durante el build de Pages
   se aparta src/app/api (FUERA de src/app, porque Next escanea
   toda la carpeta app, incluidos los directorios ocultos) y
   SIEMPRE se restaura al terminar (try/finally). El API completo
   sigue disponible en `next dev`, `next build` (standalone) y
   cualquier despliegue con servidor Node (Render/Vercel/propio).
   ============================================================ */

import { spawnSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiDir = path.join(root, "src", "app", "api");
const stashDir = path.join(root, ".api-build-hidden"); // FUERA de src/app

const restore = () => {
  if (existsSync(stashDir)) {
    try {
      if (existsSync(apiDir)) {
        // algo recreó src/app/api: el stash es el bueno (código fuente)
        renameSync(stashDir, path.join(root, ".api-build-hidden-duplicate"));
        console.error("[build:pages] Aviso: src/app/api ya existía; el stash quedó en .api-build-hidden-duplicate");
      } else {
        renameSync(stashDir, apiDir);
        console.log("[build:pages] src/app/api restaurado ✓");
      }
    } catch (e) {
      console.error("[build:pages] ¡No se pudo restaurar src/app/api! Hazlo a mano: mv .api-build-hidden src/app/api", e);
      process.exitCode = 1;
    }
  }
};

try {
  if (existsSync(apiDir)) {
    console.log("[build:pages] apartando src/app/api (Pages no sirve API routes)…");
    renameSync(apiDir, stashDir);
  }
  const r = spawnSync("bunx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "pages" },
  });
  if (r.status !== 0) {
    process.exitCode = r.status ?? 1;
  } else {
    // GitHub Pages: sin .nojekyll, Jekyll descartaría _next/ del artefacto.
    // Se crea SIEMPRE (desde Actions o local) para que el despliegue sea idéntico.
    const outDir = path.join(root, "out");
    if (existsSync(outDir)) {
      writeFileSync(path.join(outDir, ".nojekyll"), "");
      console.log("[build:pages] out/.nojekyll creado ✓");
    }
  }
} finally {
  restore();
}
