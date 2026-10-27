// Fetches the IOCF Google Sheet (or reads a local .xlsx) and turns it into the site's JSON dataset.
import fs from 'node:fs';
import path from 'node:path';
import { buildDataset, readWorkbook } from './index.mjs';

export function loadConfig(root = process.cwd()) {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(root, 'iocf.config.json'), 'utf8'));
  } catch {
    /* config file is optional */
  }
  return {
    sheetUrl: process.env.IOCF_SHEET_URL || file.sheetUrl || '',
    sheetFile: process.env.IOCF_SHEET_FILE || '',
    intervalMinutes: Number(process.env.SYNC_INTERVAL_MIN || file.syncIntervalMinutes || 30),
    port: Number(process.env.PORT || file.port || 4173),
  };
}

/** Accepts a normal Google Sheets link (…/d/<id>/edit…) or an export/publish link and returns a download URL. */
export function toExportUrl(url) {
  const u = url.trim();
  if (/\/export\?|output=xlsx|\.xlsx(\?|$)/i.test(u)) return u;
  const m = /spreadsheets\/d\/(e\/)?([a-zA-Z0-9_-]+)/.exec(u);
  if (!m) throw new Error('That does not look like a Google Sheets link (expected https://docs.google.com/spreadsheets/d/<id>/…)');
  if (m[1]) throw new Error('Use the sheet’s normal share link or its "Publish to web → Microsoft Excel (.xlsx)" link');
  return `https://docs.google.com/spreadsheets/d/${m[2]}/export?format=xlsx`;
}

export async function downloadWorkbook(url) {
  const res = await fetch(toExportUrl(url), { redirect: 'follow', headers: { 'user-agent': 'iocf-sync/1.0' } });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403 || res.status === 404
        ? `Google returned ${res.status}. Make sure the sheet is shared as "Anyone with the link can view".`
        : `Google returned ${res.status} ${res.statusText}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || buf.toString('latin1', 0, 2) !== 'PK') {
    throw new Error('Google did not return a spreadsheet file. The sheet is probably not shared as "Anyone with the link can view".');
  }
  return buf;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/**
 * One sync run: read the source, build the dataset, validate it and write it to every output path.
 * Throws (leaving existing outputs untouched) if anything is wrong, so a bad edit in the sheet never breaks the site.
 */
export async function syncOnce({ sheetUrl, sheetFile, outputs }) {
  let book;
  let source;
  if (sheetFile) {
    book = await readWorkbook(sheetFile);
    source = `file:${path.basename(sheetFile)}`;
  } else if (sheetUrl) {
    book = await readWorkbook(await downloadWorkbook(sheetUrl));
    source = 'google-sheet';
  } else {
    throw new Error('No sheet configured. Set "sheetUrl" in iocf.config.json (or the IOCF_SHEET_URL environment variable).');
  }
  const { dataset, report } = buildDataset(book, { source });
  const text = JSON.stringify(dataset);
  for (const out of outputs) writeAtomic(out, text);
  return { generatedAt: dataset.generatedAt, source, report };
}
