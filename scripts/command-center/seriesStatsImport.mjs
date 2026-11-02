// Matches a folder of scorer statistics CSVs to the earlier series from the IOCF records, so they can be uploaded in one go
// (npm run cc -- series-stats). A file is matched by its series name (the file name or the title inside it), and checked
// against the teams in it: the teams must be boards of that series. Anything doubtful is reported, never uploaded.
import { parseUpload, recordKey, boardForTeam } from '../../server/command/seriesStats.mjs';
import { FIELD_NAMES } from '../../src/data/commandCenter/scorerCsv.mjs';
import { slug } from '../sync/helpers.mjs';

const norm = (x) => String(x ?? '').toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');
const words = (x) => new Set((String(x ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !['the', 'and', 'vs', 'series', 'cup', 'trophy'].includes(w)));

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}
/** How alike two names are, 0–1: spelling distance, one containing the other, or the shared words. */
export function nameScore(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const lev = 1 - distance(x, y) / Math.max(x.length, y.length);
  const contain = x.includes(y) || y.includes(x) ? 0.9 : 0;
  const wa = words(a);
  const wb = words(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const jac = wa.size && wb.size ? shared / (wa.size + wb.size - shared) : 0;
  // shared words alone never make a perfect match ("… Rivalry I" and "… Rivalry II" share all their long words)
  return Math.max(lev, contain, Math.min(jac, 0.8));
}

// files that cover several series at once are kept as their own entry (counted in the totals, not shown under one series)
const COMBINED = [{ re: /warm-?up.*all matches/i, key: 'rec-odi-wc-warmup-games', name: 'ODI World Cup warm-up games (all matches)' }];

/**
 * files: [{ file, text }]; records: [{ name, host:{name,slug}, opponents:[{name,slug}] }]; boards: the 26 boards.
 * Returns one item per file: { file, status: 'ok' | 'check' | 'unmatched' | 'invalid' | 'duplicate', key, name, series, note, upload }.
 */
export function planImport({ files, records, boards }) {
  const used = new Map();
  const items = [];
  for (const { file, text } of files) {
    const base = file.replace(/\.csv$/i, '');
    const parsed = parseUpload(text, boards);
    if (parsed.error) {
      items.push({ file, status: 'invalid', note: parsed.error });
      continue;
    }
    const upload = parsed.value;
    const combined = COMBINED.find((c) => c.re.test(file));
    if (combined) {
      items.push({ file, status: used.has(combined.key) ? 'duplicate' : 'ok', key: combined.key, name: combined.name, series: 'combined file (several series)', note: `${upload.players} players`, upload });
      used.set(combined.key, file);
      continue;
    }
    const teams = [...new Set(upload.rows.map((r) => String(r[FIELD_NAMES.indexOf('team')])))];
    const slugs = teams.map((t) => boardForTeam(t, boards)).filter(Boolean);
    const fits = (r) => {
      const ids = [r.host, ...r.opponents].map((b) => b.slug).filter(Boolean);
      return slugs.length > 0 && slugs.every((s) => ids.includes(s));
    };
    const scored = records
      .map((r) => ({ r, score: Math.max(nameScore(base, r.name), nameScore(upload.title, r.name)), fits: fits(r) }))
      .sort((a, b) => b.score - a.score);
    // the same series name can be played twice (e.g. "… I" and "… II"): among exact names prefer the one whose teams fit
    const exact = scored.filter((x) => x.score === 1);
    let pick = exact.find((x) => x.fits) ?? null;
    let status = 'ok';
    let note = `${upload.players} players`;
    if (!pick && exact.length) {
      pick = exact[0];
      status = 'check';
      note = `the teams in the file (${teams.join(', ')}) are not the boards of this series`;
    }
    if (!pick) {
      const best = scored.filter((x) => x.fits && (x.score >= 0.75 || (x.score >= 0.4 && slugs.length >= 2 && teamsAre(slugs, x.r))));
      if (best.length && (best.length === 1 || best[0].score - best[1].score >= 0.05)) {
        pick = best[0];
        note = `matched by similar name and teams (${upload.players} players)`;
      }
    }
    if (!pick) {
      const near = scored[0] && scored[0].score >= 0.6 ? ` Closest name in the records: “${scored[0].r.name}” (${[scored[0].r.host, ...scored[0].r.opponents].map((b) => b.name).join(', ')}).` : '';
      items.push({ file, status: 'unmatched', note: `no series with this name and these teams (${teams.join(', ')}).${near}`, upload });
      continue;
    }
    const key = recordKey(pick.r.name, pick.r.keyHost ?? pick.r.host.name);
    if (status === 'ok' && used.has(key)) {
      items.push({ file, status: 'duplicate', key, name: pick.r.name, series: pick.r.name, note: `“${used.get(key)}” already covers this series`, upload });
      continue;
    }
    if (status === 'ok') used.set(key, file);
    items.push({ file, status, key, name: pick.r.name, series: `${pick.r.name} (${pick.r.host.name} vs ${pick.r.opponents.map((b) => b.name).join(', ')})`, note, upload });
  }
  return items;
}
const teamsAre = (slugs, r) => new Set(slugs).size === new Set([r.host, ...r.opponents].map((b) => b.slug)).size;
export { slug };
