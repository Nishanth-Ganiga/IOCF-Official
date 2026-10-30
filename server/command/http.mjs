// Connects the Command Center handler to Node's HTTP server (Fly, local dev) and to Vercel's serverless functions.
import { createHandler } from './handler.mjs';
import { storeFromEnv } from './store.mjs';

const PREFIX = '/api/command';
const MAX_BODY = 16 * 1024;

function readBody(req) {
  // Vercel has usually parsed a JSON body already
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

// the platform's own header first (Fly and Vercel set these themselves); a client-supplied X-Forwarded-For is only a last resort
const clientIp = (req) =>
  req.headers['fly-client-ip'] || req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

/** (req, res) => Promise — answers requests under /api/command; the caller decides which requests reach it. */
export function commandCenterRequestListener({ store = storeFromEnv(), env = process.env } = {}) {
  const handle = createHandler({ store, env });
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { code: 'bad_request', message: 'Invalid request.' } }));
      }
    }
    const out = await handle({
      method: req.method ?? 'GET',
      path: path.split('/').filter(Boolean).map(decodeURIComponent),
      headers: req.headers,
      body,
      ip: clientIp(req),
    });
    res.writeHead(out.status, out.headers);
    res.end(JSON.stringify(out.body));
  };
}
