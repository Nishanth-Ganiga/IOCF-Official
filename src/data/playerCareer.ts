import { api } from './commandApi';
import { decodePlayers, type PlayerStats } from './leagueStats';
import { FORMAT_ORDER, TOURNAMENT_FORMAT, formatKey } from './careerStats.mjs';
import { WARMUP_KEY, allSeriesRecords, keyOf } from './seriesRecords';
import { boardOf, boardSlug, loadTournamentStats } from './tournamentStats';
import { majorTournaments } from './tournaments';

/** One player's statistics line in one tournament or series, with the board he played it for. */
export type CareerLine = {
  name: string;
  boardSlug: string;
  boardName: string;
  source: 'tournament' | 'series';
  id: string;
  label: string;
  /** odi / test / t20 / t10 / club / l4i, or null when the tournament or series has no format yet. */
  format: string | null;
  line: PlayerStats;
};
export type FormatId = (typeof FORMAT_ORDER)[number];

let cache: { at: number; lines: Promise<CareerLine[]> } | null = null;

async function build(): Promise<CareerLine[]> {
  const out: CareerLine[] = [];
  const names = new Map(majorTournaments().map((t) => [t.id, t.name]));
  const all = await loadTournamentStats();
  for (const [id, t] of Object.entries(all)) {
    const format = (TOURNAMENT_FORMAT as Record<string, string>)[id] ?? null;
    for (const p of t.players) {
      const b = boardOf(p.team);
      out.push({ name: p.name, boardSlug: boardSlug(b.name), boardName: b.name, source: 'tournament', id, label: names.get(id) ?? t.title, format, line: p });
    }
  }
  // series: the statistics the administrator uploaded (the sheet's own format is used for an earlier series without one set)
  try {
    const sheetFormat = new Map([...allSeriesRecords().completed, ...allSeriesRecords().upcoming].map((r) => [keyOf(r), r.format]));
    const { series } = await api.seriesLines();
    for (const s of series) {
      const format = formatKey(s.format) ?? formatKey(sheetFormat.get(s.key)) ?? (s.key === WARMUP_KEY ? 'odi' : null);
      for (const p of decodePlayers(s.fields, s.rows)) {
        const b = boardOf(p.team);
        out.push({ name: p.name, boardSlug: boardSlug(b.name), boardName: b.name, source: 'series', id: s.key, label: s.name, format, line: p });
      }
    }
  } catch {
    /* the Command Center service is not reachable here (for example in the apps), or no series statistics exist yet */
  }
  return out;
}

/** Every statistics line of the tournaments and the series, kept for a minute so opening several profiles is quick. */
export function loadCareerLines(): Promise<CareerLine[]> {
  if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), lines: build() };
  return cache.lines;
}
