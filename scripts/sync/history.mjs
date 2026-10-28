// Keeps a short history of board rankings so the site can show rank movement (▲ / ▼).
import fs from 'node:fs';

const MAX_SNAPSHOTS = 12;

const ranksOf = (boards) => Object.fromEntries((boards ?? []).map((b) => [b.name, Object.fromEntries((b.rankings ?? []).map((r) => [r.format, r.rank]))]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * `rankHistory` is a list of past ranking states, oldest first. When the new dataset's rankings differ from the
 * previous run's, the previous run's rankings are appended. Unchanged syncs leave the history alone, so the
 * movement shown on the site stays until the rankings change again.
 */
export function readPrior(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // first run, or the previous file is unreadable
  }
}

export function withRankHistory(dataset, prior) {
  const history = Array.isArray(prior?.rankHistory) ? [...prior.rankHistory] : [];
  if (prior?.boards?.length) {
    const priorRanks = ranksOf(prior.boards);
    const last = history[history.length - 1];
    if (!same(priorRanks, ranksOf(dataset.boards)) && (!last || !same(last.ranks, priorRanks))) {
      history.push({ at: prior.generatedAt ?? null, ranks: priorRanks });
    }
  }
  return { ...dataset, rankHistory: history.slice(-MAX_SNAPSHOTS) };
}
