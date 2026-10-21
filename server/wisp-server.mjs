// wisp-server.mjs — Servidor de transporte wisp para el navegador de axcsOS
// Backend del motor Scramjet (idéntico al backend de la app oficial de Scramjet).
// Producción: node wisp-server.mjs con variables de entorno (ver README de server/).
import http from 'node:http';
import { server } from '@mercuryworkshop/wisp-js/server';

const PORT = parseInt(process.env.PORT || '3001', 10);
const ALLOWED_ORIGINS = (process.env.WISP_ALLOWED_ORIGINS || '*')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const TOKEN = process.env.WISP_TOKEN || ''; // opcional: ?token=...

const opts = {
	// Seguridad: bloquear redes privadas/loopback por defecto (anti-SSRF)
	allow_private_ips: process.env.WISP_ALLOW_PRIVATE === 'true',
	allow_loopback_ips: process.env.WISP_ALLOW_LOOPBACK === 'true',
	allow_direct_ip: process.env.WISP_ALLOW_DIRECT_IP !== 'false',
	stream_limit_total: parseInt(process.env.WISP_STREAM_LIMIT || '64', 10),
	stream_limit_per_host: parseInt(process.env.WISP_STREAM_LIMIT_HOST || '16', 10),
	wisp_version: 2,
};

const httpServer = http.createServer((req, res) => {
	if (req.url === '/' || req.url === '/health') {
		res.writeHead(200, { 'content-type': 'text/plain' });
		res.end('wisp-server (axcsOS) OK');
		return;
	}
	res.writeHead(404);
	res.end('not found');
});

httpServer.on('upgrade', (req, socket, head) => {
	const origin = req.headers.origin || '';
	const url = req.url || '/';

	// Filtro de origen (CORS no aplica a WS: hay que validarlo aquí)
	if (ALLOWED_ORIGINS[0] !== '*') {
		if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
			socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
			socket.destroy();
			console.warn(`[wisp] origen rechazado: ${origin || '(sin origen)'}`);
			return;
		}
	}

	// Token opcional en query: /?token=xxx
	if (TOKEN) {
		const q = new URL(url, 'http://x').searchParams;
		if (q.get('token') !== TOKEN) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			console.warn('[wisp] token inválido');
			return;
		}
	}

	console.log(`[wisp] conexión desde ${req.socket.remoteAddress} origin=${origin || '-'} ${url}`);
	server.routeRequest(req, socket, head, opts);
});

httpServer.listen(PORT, () => {
	console.log(`wisp-server axcsOS escuchando en :${PORT}`);
	console.log(`  orígenes permitidos: ${ALLOWED_ORIGINS.join(', ') || '*'}`);
	console.log(`  privados: ${opts.allow_private_ips}, loopback: ${opts.allow_loopback_ips}`);
});
