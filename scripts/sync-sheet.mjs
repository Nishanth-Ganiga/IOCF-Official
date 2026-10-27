#!/usr/bin/env node
// Usage: npm run sync            (uses sheetUrl from iocf.config.json or $IOCF_SHEET_URL)
//        npm run sync -- --file "IOCF ALL BOARDS .xlsx"
//        npm run sync -- --url "https://docs.google.com/spreadsheets/d/<id>/edit"
import path from 'node:path';
import { loadConfig, syncOnce } from './sync/sheet.mjs';

const root = process.cwd();
const cfg = loadConfig(root);
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

try {
  const result = await syncOnce({
    sheetUrl: arg('--url') ?? cfg.sheetUrl,
    sheetFile: arg('--file') ?? cfg.sheetFile,
    // public/ is served by the dev server and copied into dist/; the snapshot is the bundled offline fallback
    outputs: [path.join(root, 'public/iocf-data.json'), path.join(root, 'src/data/snapshot.json')],
  });
  console.log(`Synced from ${result.source} at ${result.generatedAt}`);
  console.table(result.report);
} catch (err) {
  console.error(`Sync failed: ${err.message}`);
  process.exit(1);
}
