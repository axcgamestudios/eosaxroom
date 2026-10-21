# Backend wisp de axcsOS (transporte del navegador)

El navegador integrado de axcsOS usa el motor **Scramjet** (Service Worker + rewriter
WASM que corre 100% en el navegador) y necesita un único servicio de backend: un
**servidor wisp** que hace de transporte (WebSocket → TCP) hacia los sitios web reales.

Este directorio contiene ese servidor, listo para desplegar en cualquier host con
Node.js 18+ (Render, Railway, Fly.io, Cleavr, un VPS, Docker…).

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP/WebSocket |
| `WISP_ALLOWED_ORIGINS` | `*` | Orígenes permitidos (CORS no aplica a WS: se valida a mano). Para producción pon `https://axcgamestudios.github.io` |
| `WISP_TOKEN` | *(vacío)* | Si se define, exige `?token=…` en la URL del WebSocket |
| `WISP_ALLOW_PRIVATE` | `false` | Permitir destinos en redes privadas (peligroso: SSRF) |
| `WISP_ALLOW_LOOPBACK` | `false` | Permitir destinos 127.0.0.1/localhost (peligroso: SSRF) |
| `WISP_ALLOW_DIRECT_IP` | `true` | Permitir destinos IP directos |
| `WISP_STREAM_LIMIT` | `64` | Máx. de streams simultáneos por conexión |
| `WISP_STREAM_LIMIT_HOST` | `16` | Máx. de streams simultáneos hacia el mismo host |

## Despliegue rápido

### Render / Railway / Fly.io
1. Crea un servicio web apuntando a este directorio (o a la raíz del repo con
   root `server/`).
2. Comando de arranque: `npm start` (instala dependencias automáticamente).
3. Variables: `WISP_ALLOWED_ORIGINS=https://axcgamestudios.github.io`.
4. El servicio quedará en `https://TU-SERVICIO.example.com` → esa es tu URL wisp.

### VPS con Docker
```bash
docker build -t aos-wisp .
docker run -d -p 443:3001 -e WISP_ALLOWED_ORIGINS=https://axcgamestudios.github.io aos-wisp
```
(termina el TLS con tu proxy inverso habitual: Caddy/nginx/certbot)

### VPS sin Docker
```bash
cd server && npm install
PORT=3001 WISP_ALLOWED_ORIGINS=https://axcgamestudios.github.io node wisp-server.mjs
```

## Conectarlo con el sistema

En axcsOS abre **Ajustes → Navegador → Servidor de transporte (wisp)** y escribe:
`wss://TU-SERVICIO.example.com/` (importante el `wss://` y la barra final).
Pulsa **Probar** (verifica el WebSocket) y **Aplicar**.

## Seguridad incluida

- Bloqueo de destinos en redes privadas y loopback por defecto (anti-SSRF),
  listo en la librería `wisp-js` (LGPL-3.0).
- Allowlist de orígenes en el handshake del WebSocket.
- Token opcional por query-string.
- Límites de streams por conexión y por host.
- Es un **relay TCP**: no termina TLS de los sitios destino (no ve el tráfico
  descifrado, no guarda cookies ni datos).

## Estado por defecto del frontend

Sin configurar nada, axcsOS usa el transporte público de demostración de
Mercury Workshop (`wss://wisp.mercurywork.shop/`) para que el navegador
funcione desde el primer minuto. Es un servicio ajeno, sin garantía: para uso
real despliega tu propio servidor con este directorio.
