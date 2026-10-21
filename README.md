# axcsOS 🍐 — Sistema operativo web con navegador integrado real

axcsOS es un escritorio web estilo macOS "Liquid Glass" que corre **100% en el
navegador**, con un navegador propio (**Safari axcsOS**) que carga **sitios web
reales** dentro de sus ventanas mediante el motor **Scramjet**.

> **Demo:** https://axcgamestudios.github.io/aos/

---

## ✨ Qué incluye

| App | Descripción |
|---|---|
| **Safari** | Navegador real: pestañas múltiples, historial, marcadores, descargas, buscador con resultados reales (Bing RSS / SearXNG opcional) |
| **AXCGAMES** | Portal de juegos del estudio (integrado) |
| **Finder / Notas / Calculadora / Terminal / TextEdit / Previsualización / Ajustes / Descargas** | Utilidades del sistema |
| Escritorio | Dock con magnificación, Spotlight (⌘Espacio), Launchpad, Centro de Control, Centro de Notificaciones, App Switcher (⌘Tab), múltiples escritorios de ventanas, bloqueo de sesión, arranque animado |

## 🧭 El navegador: cómo funciona de verdad

```
┌────────────────────────── axcsOS (estático, GitHub Pages) ──────────────────────────┐
│  Safari (UI) ── pestañas ──▶ <iframe> mismo origen                                  │
│        │                                                                            │
│        ▼                                                                            │
│  Service Worker (/sw.js + Scramjet 1.1.0) ── reescribe HTML/CSS/JS (rewriter WASM)  │
│        │                                                                            │
│        ▼                                                                            │
│  BareMux SharedWorker ── transporte libcurl ── WebSocket (wisp)                     │
└────────────────────────────────────────┬───────────────────────────────────────────┘
                                         ▼
                          🔧 Servidor wisp (backend tuyo, ver server/)
                                         ▼
                              🌍 Sitios web reales
```

- **Frontend**: Service Worker + Scramjet + transporte = archivos estáticos servidos
  desde GitHub Pages (`public/scram`, `public/baremux`, `public/libcurl`, `public/sw.js`).
- **Backend**: un único servicio **wisp** (WebSocket → TCP) que despliegas tú.
  Incluido en [`server/`](server/README.md) con Dockerfile, variables de entorno y
  protecciones anti-SSRF activadas por defecto.
- **Sin configurar backend**, el navegador arranca con el transporte público de
  demostración de Mercury Workshop (externo, sin garantía) y te lo indica en
  Ajustes → Navegador.

### Versiones y licencias del motor

| Pieza | Versión | Licencia |
|---|---|---|
| Scramjet (MercuryWorkshop) | 1.1.0 (release oficial) | OSS (GPL family) |
| bare-mux (MercuryWorkshop) | 2.1.9 | OSS |
| libcurl-transport (ading2210/Mercury) | 1.5.2 | OSS |
| wisp-js (MercuryWorkshop, backend) | 0.5.0 | LGPL-3.0 |

Se sirven sin modificar desde `public/`. No se alteran DRM, autenticaciones ni
protecciones de ningún sitio.

## 🔎 Resultados de compatibilidad (probado en este entorno)

| Sitio | Resultado | Detalle |
|---|---|---|
| example.com | ✅ Completo | HTML/CSS/JS/imágenes reales |
| **YouTube** | ✅ Parcial | SPA completa, búsqueda interna con resultados orgánicos reales y portadas a color. La **reproducción** puede pedir "Sign in to confirm you're not a bot" según la IP del servidor wisp (anti-bot de Google, ajeno al proyecto) |
| **GeForce NOW** | ✅ Landing completa | UI real, imágenes a color. El juego en streaming requiere login + no se probó con GPU |
| **Poki** | ✅ Completo | Catálogo real (245 imágenes). Juegos individuales sin probar uno a uno |
| **Netflix** | ✅ Landing completa | Carátulas a color. Reproducción requiere DRM (Widevine) → **no compatible** con proxy web (por diseño, no se elude) |
| Búsqueda web | ✅ | Resultados reales vía salida RSS de Bing, renderizados nativos y abiertos por el motor. SearXNG opcional |
| Wikipedia | ✅ | Completa vía motor |

Limitaciones honestas: sitios con DRM (Netflix, Disney+…), algunos con CAPTCHA
agresivo o que bloquean IPs de datacenter pueden fallar; el error se muestra
dentro de la pestaña, nunca se oculta.

## 🚀 Desarrollo

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # build standalone (autoalojado)
npm run build:pages    # export estático → out/ (GitHub Pages, basePath /aos)
```

Servidor wisp local: `cd server && npm install && npm start` (puerto 3001).
En localhost el navegador lo detecta automáticamente.

## 📦 Despliegue

- **Frontend**: estático. Este repo genera el export con `npm run build:pages`
  y lo publica en la rama `gh-pages` (GitHub Pages → https://axcgamestudios.github.io/aos/).
- **Transporte wisp**: el navegador usa por defecto el **motor propio del estudio**
  (wisp-server-node en Render), auto-configurado por el sistema con cadena de
  respaldo automática (motor propio → transporte demo público → wisp local en
  desarrollo). Si quieres desplegar el tuyo, ver [`server/README.md`](server/README.md).

## 🗂️ Estructura

```
public/            assets estáticos del OS + motor del navegador (scram/, baremux/, libcurl/, sw.js)
server/            backend wisp desplegable (Dockerfile + README)
src/os/            núcleo del sistema operativo (store, registry, ventanas, componentes)
src/os/engine/     integración del motor Scramjet (scramjet.ts)
src/os/apps/       aplicaciones (Safari, Ajustes, Notas, …)
```

## ⚠️ Aviso

Proyecto educativo/personal de axcgamestudios. No afiliado a Apple. No usa
recursos protegidos de marcas. El navegador respeta DRM y condiciones de uso
de los sitios; no intenta eludir ninguna protección.
