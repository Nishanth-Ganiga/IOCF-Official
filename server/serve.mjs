#!/usr/bin/env node
// Production server: serves the built site (dist/) and keeps the IOCF data fresh from the Google Sheet.
//   npm run build && npm run serve
// The data is re-synced on start-up and every `syncIntervalMinutes`; the last good copy is kept if a sync fails.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadConfig, syncOnce } from '../scripts/sync/sheet.mjs';

const root = process.cwd();
const cfg = loadConfig(root);
const dist = path.join(root, 'dist');
const cacheFile = path.join(root, '.cache', 'iocf-data.json');
const status = { lastSyncAt: null, lastOk: null, lastError: null, source: null, report: null, syncing: false };

async function sync() {
  if (status.syncing) return;
  status.syncing = true;
  status.lastSyncAt = new Date().toISOString();
  try {
    const r = await syncOnce({ sheetUrl: cfg.sheetUrl, sheetFile: cfg.sheetFile, outputs: [cacheFile] });
    Object.assign(status, { lastOk: r.generatedAt, lastError: null, source: r.source, report: r.report });
    console.log(`[sync] ok ${r.generatedAt} (${r.source})`, JSON.stringify(r.report));
  } catch (err) {
    status.lastError = err.message;
    console.error(`[sync] failed: ${err.message}`);
  } finally {
    status.syncing = false;
  }
}

if (!cfg.sheetUrl && !cfg.sheetFile) console.warn('[sync] No sheetUrl configured — serving the bundled snapshot. Set "sheetUrl" in iocf.config.json.');
else {
  void sync();
  setInterval(sync, Math.max(1, cfg.intervalMinutes) * 60_000).unref?.();
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };

function send(res, code, body, headers = {}) {
  res.writeHead(code, headers);
  res.end(body);
}

http
  .createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/iocf-data.json') {
      // the freshly synced copy, falling back to whatever the build shipped
      const file = fs.existsSync(cacheFile) ? cacheFile : path.join(dist, 'iocf-data.json');
      if (!fs.existsSync(file)) return send(res, 404, 'No data yet');
      return send(res, 200, fs.readFileSync(file), { 'content-type': TYPES['.json'], 'cache-control': 'no-cache' });
    }
    if (pathname === '/api/status') return send(res, 200, JSON.stringify(status), { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });

    let file = path.normalize(path.join(dist, pathname));
    if (!file.startsWith(dist)) return send(res, 403, 'Forbidden');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html'); // single-page app
    const cacheable = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    send(res, 200, req.method === 'HEAD' ? '' : fs.readFileSync(file), { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': cacheable });
  })
  .listen(cfg.port, () => console.log(`IOCF site on http://localhost:${cfg.port}  (data re-syncs every ${cfg.intervalMinutes} min)`));
