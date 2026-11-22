// Telemetry receiver: http://127.0.0.1:5100 (localhost only — never bind to other interfaces).
// The game itself is NOT served from here: it is opened straight from disk (index.html over file://). The game
// queues events in localStorage and POSTs them here whenever this receiver is running (agentic-sdlc's ./start.sh
// runs it as a child process). This process also keeps data/health.json fresh for agentic-sdlc's goal checks.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { ingest } from './events.js';
import { writeHealth } from './health.js';
import * as telemetry from './telemetry.js';

const HEALTH_EVERY_MS = 60 * 60 * 1000;

// The file:// origin is "null"; the receiver only accepts small JSON batches and exposes nothing sensitive.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true' };

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > limit) throw Object.assign(new Error('body too large'), { status: 413 });
  }
  try {
    return JSON.parse(s || 'null');
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

function refreshHealth() {
  try {
    return writeHealth();
  } catch (e) {
    telemetry.error('health.write_failed', e);
    return null;
  }
}

export function createApp() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, refreshHealth());
      if (url.pathname === '/api/events') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
        const r = ingest(await readBody(req));
        if (!r.ok) return send(res, 400, { error: r.error });
        if (r.stored) refreshHealth();
        return send(res, 200, { accepted: r.accepted, rejected: r.rejected });
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      if (!e.status) telemetry.error('server.request_failed', e, { path: url.pathname });
      return send(res, e.status ?? 500, { error: e.status ? e.message : 'internal error' });
    }
  });
}

/* c8 ignore start */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.PORT) || 5100;
  createApp().listen(port, '127.0.0.1', () => console.log(`animal-sanctuary telemetry receiver on http://127.0.0.1:${port}`));
  refreshHealth();
  setInterval(refreshHealth, HEALTH_EVERY_MS).unref?.();
  telemetry.info('server.started', { port });
}
/* c8 ignore stop */
