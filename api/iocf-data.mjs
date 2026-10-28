// Vercel serverless function: reads the Google Sheet and returns the IOCF dataset as JSON.
// The site's CDN caches the answer for a few minutes, so the sheet is fetched at most about once per 5 minutes
// and edits show up on the site shortly after, with no redeploy. If this fails the site falls back to the
// last committed /iocf-data.json, then to the bundled snapshot.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFromSource, loadConfig } from '../scripts/sync/sheet.mjs';
import { withRankHistory } from '../scripts/sync/history.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function handler(req, res) {
  try {
    const cfg = loadConfig(root);
    const { dataset } = await buildFromSource({ sheetUrl: cfg.sheetUrl, sheetFile: '' });

    // Rank movement compares against the last committed copy of the data (this function keeps no files of its own).
    let prior = null;
    try {
      const r = await fetch(`https://${req.headers.host}/iocf-data.json`);
      if (r.ok) prior = await r.json();
    } catch {
      /* no earlier copy: just no movement arrows */
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.end(JSON.stringify(withRankHistory(dataset, prior)));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Sync failed' }));
  }
}
