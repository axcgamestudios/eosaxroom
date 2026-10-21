// sw.js — Service Worker de axcsOS para el motor Scramjet
// Rutas relativas: funciona en / (dev/autohost) y /aos/ (GitHub Pages)
importScripts("scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

self.addEventListener("install", () => {
        // aplicar actualizaciones del motor sin esperar a que cierren las ventanas
        self.skipWaiting();
});

self.addEventListener("activate", (event) => {
        event.waitUntil(self.clients.claim());
});

async function handleRequest(event) {
        let isSj = false;
        try {
                if (event.request.url.includes("/scramjet/")) console.log("[sw] fetch:", event.request.url, "dest:", event.request.destination);
                await scramjet.loadConfig();
                isSj = !!(scramjet.config && scramjet.route(event));
        } catch (e) {
                // sin config del motor: dejar pasar la petición sin romper el sistema
                isSj = false;
        }
        if (!isSj) return fetch(event.request);
        try {
                return await scramjet.fetch(event);
        } catch (e) {
                return new Response(
                        "<!doctype html><meta charset='utf-8'><body style=\"font-family:system-ui;background:#1b1b1f;color:#eee;display:grid;place-items:center;height:100vh;margin:0\"><div style='max-width:520px;padding:32px'><h2>El motor no pudo cargar esta página</h2><p style='color:#bbb'>" +
                                String(e && e.message ? e.message : e).replace(/[<>]/g, "") +
                                "</p><p style='color:#999'>Comprueba el estado del transporte (wisp) en Ajustes → Navegador y vuelve a intentarlo.</p></div></body>",
                        { status: 502, headers: { "content-type": "text/html; charset=utf-8" } }
                );
        }
}

self.addEventListener("fetch", (event) => {
        event.respondWith(handleRequest(event));
});
