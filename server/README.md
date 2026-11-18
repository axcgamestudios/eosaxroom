# Backend wisp de axcsOS (transporte del navegador)

> Nota de almacenamiento: este servidor wisp es un relay TCP **sin estado**:
> no escribe nada en disco (ni caché, ni logs persistentes, ni cookies).
> El que sí usa disco es `aos-backend.mjs` (ver abajo, sección
> "Control de almacenamiento").

El navegador integrado de axcsOS usa el motor **Scramjet** (Service Worker + rewriter
WASM que corre 100% en el navegador) y necesita un único servicio de backend: un
**servidor wisp** que hace de transporte (WebSocket → TCP) hacia los sitios web reales.

Este directorio contiene ese servidor, listo para desplegar en cualquier host con
Node.js 18+ (Render, Railway, Fly.io, Cleavr, un VPS, Docker…).

## Control de almacenamiento (aos-backend.mjs)

El backend de cuentas/mensajería guarda TODO en un único `data.json`. En hosts
gratuitos con cuota de disco limitada puede acabar llenando el disco. Ahora lleva
límites automáticos (se pueden ajustar por variable de entorno):

| Variable | Por defecto | Descripción |
|---|---|---|
| `AOS_DATA_FILE` | `server/data.json` | Ruta del archivo de datos. Pon `/tmp/aos-data.json` en hosts con disco efímero (Render free, etc.): los datos se pierden al reiniciar, pero el disco nunca se llena |
| `AOS_ATTACH_TTL_DAYS` | `7` | Los adjuntos (imágenes/audio, guardados en base64) se borran pasados esos días. El texto del mensaje se conserva |
| `AOS_ATTACH_MAX_MB` | `32` | Presupuesto global de adjuntos; si se supera, se borran los más antiguos (FIFO) |
| `AOS_SWEEP_MINUTES` | `60` | Cada cuánto corre la purga de tokens caducados y adjuntos viejos |

Además: máx. 500 mensajes por chat, tokens con caducidad automática de 30 días,
adjuntos ≤ 2 MB, avatares ≤ 300 KB. Con esto `data.json` se mantiene en unos pocos MB.

## Variables de entorno (wisp)

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
