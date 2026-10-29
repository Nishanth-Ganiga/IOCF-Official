import type { League, LeaguePlayer, LeagueTeam } from './leagues';

/**
 * Season 1 player statistics of the franchise leagues, from the STUMPS scorer exports
 * (All Assests/All  Season 1 Franchise League Stats → `npm run league-stats` → leagueStats.json).
 *
 * The stats are the source of truth for runs, wickets and fielding. The live IOCF dataset (the Google Sheet) adds the
 * auction price, national board, role and the Best Batsman / Best Bowler tallies and honours. The two lists spell names
 * differently ("Sai Naveen" / "Sai Naveen Chowdary"), so a player is linked to the squad entry only when the match is
 * unambiguous (see `linkSquad`); anything uncertain stays unlinked rather than risk showing the wrong person's awards.
 */

export const SEASON_ID = 'season-1';
export const SEASON_LABEL = 'Season 1';

export type Season = { id: string; label: string };
/** Seasons played by a league. Add `{ id: 'season-2', label: 'Season 2' }` here when the next one starts. */
export const seasonsOf = (_league: League): Season[] => [{ id: SEASON_ID, label: SEASON_LABEL }];

export type PlayerStats = {
  /** URL id, unique within the team. */
  id: string;
  name: string;
  team: string;
  matches: number;
  pom: number;
  batInn: number;
  runs: number;
  avg: number;
  sr: number;
  thirties: number;
  fifties: number;
  hundreds: number;
  /** Highest score and whether it was not out. */
  hs: number | null;
  hsNotOut: boolean;
  sixes: number;
  fours: number;
  balls: number;
  notOuts: number;
  most6: number;
  most4: number;
  /** Balls taken to reach the milestone, when reached. */
  fast50: number | null;
  fast100: number | null;
  bowlInn: number;
  wickets: number;
  runsConceded: number;
  maidens: number;
  bowlAvg: number;
  bowlSr: number;
  economy: number;
  threeW: number;
  fiveW: number;
  best: string | null;
  ballsBowled: number;
  dots: number;
  catches: number;
  stumpings: number;
  runOuts: number;
};

/** A stats row with the squad entry (price, board, awards) it was matched to, if any. */
export type StatPlayer = PlayerStats & { squad?: LeaguePlayer };

type Raw = { fields: string[]; leagues: Record<string, { title: string; tour: string; rows: (string | number | null)[][] }> };
export type LeagueStats = { title: string; tour: string; players: PlayerStats[] };
export type AllStats = Record<string, LeagueStats>;

const norm = (s: string) => s.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** CSV team names that are spelt differently in the IOCF dataset (normalised form → normalised dataset spelling). */
const TEAM_ALIASES: Record<string, string> = { lucknowsupergiants: 'lucknowsupergaints', southernbraves: 'southernbrave' };
const teamKey = (name: string) => {
  const k = norm(name);
  return TEAM_ALIASES[k] ?? k;
};

/**
 * Pairs the scorer's name with the squad sheet's spelling where the pattern is clear but the automatic rules cannot
 * decide (shortened or differently transliterated names). Keyed `<league>/<normalised scorer team name>/<scorer name>`.
 */
const SQUAD_ALIASES: Record<string, string> = {
  'psl/karachikings/Anand Ajikumar': 'Anand Ajk',
  'psl/karachikings/Shibil': 'Shibili',
  'psl/pindiz/Hrushikesh Dinkar': 'Hrushikesh HD',
  'psl/quettagladiators/Suranjan Deepal': 'Suranja',
  'bbl/brisbaneheat/Hasan Musabbir': 'Hasan Mubashir',
  'bbl/sydneysixers/Anand Ajikumar': 'Anand Ajk',
  'bpl/barisalriverriders/Sai Naveen Chowdary': 'Sai Naveen',
  'bpl/chandpurillishtitans/Gopikrishnan Sv': 'Gopi',
  'bpl/mymensinghmavericks/Aditya Mahajan': 'Adithya',
  'bpl/mymensinghmavericks/Bishwajit Dutta': 'Biswajit',
  'ipl/chennaisuperkings/Marami Ahmed': 'Marami',
  'ipl/chennaisuperkings/Muhammad Ahmed Mughal': 'Ahmed',
  'ipl/lucknowsupergiants/Aditya Mahajan': 'Adithya',
  'ipl/lucknowsupergiants/Aashutosh Jha': 'Ashutosh',
  'ipl/royalchallengersbengaluru/Muhammad Ahmad': 'Ahmed',
  'cpl/guyanaamazonwarriors/Harikrishnan': 'Hari',
  'cpl/trinbagoknightriders/Gopikrishnan Sv': 'Gopi',
  'kcl/centralstags/Hrushikesh Dinkar': 'Hrushikesh HD',
  'kcl/queenstownroyals/Shib Asis': 'Shibasis Nayak',
  'hundred/southernbraves/Anand Ajikumar': 'Anand AKJ',
};

/** Turns the compact rows of a scorer export (see scripts/lib/scorer-csv.mjs) into player records. */
export function decodePlayers(fields: string[], rows: (string | number | null)[][]): PlayerStats[] {
  const used = new Map<string, number>();
  return rows.map((row) => {
    const o: Record<string, string | number | null> = {};
    fields.forEach((f, i) => (o[f] = row[i]));
    const hs = String(o.hs ?? '');
    const fast = (v: unknown) => {
      const m2 = /\((\d+)\)/.exec(String(v ?? ''));
      return m2 ? Number(m2[1]) : null;
    };
    const best = String(o.best ?? '').trim();
    // ids repeat only if two players of a team share a name; number the later ones
    const base = slug(String(o.name)) || 'player';
    const key = `${norm(String(o.team))}/${base}`;
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    const num = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : 0);
    const p: PlayerStats = {
      id: n === 1 ? base : `${base}-${n}`,
      name: String(o.name),
      team: String(o.team),
      matches: num('matches'),
      pom: num('pom'),
      batInn: num('batInn'),
      runs: num('runs'),
      avg: num('avg'),
      sr: num('sr'),
      thirties: num('thirties'),
      fifties: num('fifties'),
      hundreds: num('hundreds'),
      hs: hs ? parseInt(hs, 10) : null,
      hsNotOut: hs.endsWith('*'),
      sixes: num('sixes'),
      fours: num('fours'),
      balls: num('balls'),
      notOuts: num('notOuts'),
      most6: num('most6'),
      most4: num('most4'),
      fast50: fast(o.fast50),
      fast100: fast(o.fast100),
      bowlInn: num('bowlInn'),
      wickets: num('wickets'),
      runsConceded: num('runsConceded'),
      maidens: num('maidens'),
      bowlAvg: num('bowlAvg'),
      bowlSr: num('bowlSr'),
      economy: num('economy'),
      threeW: num('threeW'),
      fiveW: num('fiveW'),
      best: best && best !== '0' ? best : null,
      ballsBowled: num('ballsBowled'),
      dots: num('dots'),
      catches: num('catches'),
      stumpings: num('stumpings'),
      runOuts: num('runOuts'),
    };
    return p;
  });
}

let cache: Promise<AllStats> | null = null;

/** Loads and decodes the stats (a separate chunk, fetched the first time a league page needs it). */
export function loadLeagueStats(): Promise<AllStats> {
  cache ??= import('./leagueStats.json').then((m) => {
    const raw = m.default as unknown as Raw;
    const out: AllStats = {};
    for (const [leagueId, l] of Object.entries(raw.leagues)) out[leagueId] = { title: l.title, tour: l.tour, players: decodePlayers(raw.fields, l.rows) };
    return out;
  });
  return cache;
}

/* ---------- linking scorer names to squad entries ---------- */

/** Squad names carry notes such as "Ashiqui Ashi (C", "Ans Sheikh: 600000" or "Harsh 1500". */
const clean = (s: string) => s.split(/[:(]/)[0].replace(/[\s-]*\d+\s*$/, '').trim();
const tokens = (s: string) => (clean(s).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);

function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Matches the scorer's players of one team to that team's squad, by (1) the agreed aliases, (2) the same name,
 * (3) one name's words being all contained in the other's, (4) a one–two letter spelling difference in a long name.
 * A pair is taken only when each side has exactly one candidate; rules 3–4 repeat until nothing more resolves.
 * Returns scorer index → squad index.
 */
export function linkSquad(leagueId: string, scorerTeam: string, scorer: string[], squad: string[]): Map<number, number> {
  const out = new Map<number, number>();
  const free = { c: new Set(scorer.keys()), s: new Set(squad.keys()) };
  const take = (i: number, j: number) => {
    out.set(i, j);
    free.c.delete(i);
    free.s.delete(j);
  };
  const ck = scorer.map((x) => norm(clean(x)));
  const sk = squad.map((x) => norm(clean(x)));

  for (const i of [...free.c]) {
    const alias = SQUAD_ALIASES[`${leagueId}/${norm(scorerTeam)}/${scorer[i]}`];
    const j = alias ? squad.findIndex((x, idx) => free.s.has(idx) && x === alias) : -1;
    if (j >= 0) take(i, j);
  }
  for (const i of [...free.c]) {
    const js = [...free.s].filter((j) => sk[j] === ck[i]);
    if (js.length === 1 && [...free.c].filter((k) => ck[k] === ck[i]).length === 1) take(i, js[0]);
  }

  const rules: ((i: number, j: number) => boolean)[] = [
    (i, j) => {
      const a = new Set(tokens(scorer[i]));
      const b = new Set(tokens(squad[j]));
      if (!a.size || !b.size) return false;
      const sub = (x: Set<string>, y: Set<string>) => [...x].every((t) => y.has(t));
      return sub(a, b) || sub(b, a);
    },
    (i, j) => ck[i].length >= 8 && sk[j].length >= 8 && distance(ck[i], sk[j]) <= 2,
  ];
  for (const rule of rules) {
    for (let progress = true; progress; ) {
      progress = false;
      const cand = new Map<number, number[]>();
      const back = new Map<number, number[]>();
      for (const i of free.c)
        for (const j of free.s)
          if (rule(i, j)) {
            cand.set(i, [...(cand.get(i) ?? []), j]);
            back.set(j, [...(back.get(j) ?? []), i]);
          }
      for (const [i, js] of cand) if (js.length === 1 && back.get(js[0])?.length === 1) {
        take(i, js[0]);
        progress = true;
      }
    }
  }
  return out;
}

const teamCache = new WeakMap<LeagueTeam, StatPlayer[]>();

/** The scorer's players for a team, each with its squad entry when one could be matched. */
export function playersOf(all: AllStats | null, league: League, team: LeagueTeam): StatPlayer[] {
  const stats = all?.[league.id];
  if (!stats) return [];
  const hit = teamCache.get(team);
  if (hit) return hit;
  const key = teamKey(team.name);
  const mine = stats.players.filter((p) => teamKey(p.team) === key);
  if (!mine.length) return [];
  const links = linkSquad(league.id, mine[0].team, mine.map((p) => p.name), team.players.map((p) => p.name));
  const list = mine.map((p, i) => ({ ...p, squad: links.has(i) ? team.players[links.get(i)!] : undefined }));
  teamCache.set(team, list);
  return list;
}

export const hasStats = (all: AllStats | null, league: League) => Boolean(all?.[league.id]?.players.length);

/** Every player of a league, with the team they play for. */
export function leaguePlayers(all: AllStats | null, league: League) {
  return league.teams.flatMap((t) => playersOf(all, league, t).map((p) => ({ p, team: t })));
}

/** Tournament-wide totals and leaders. */
export function leagueSummary(all: AllStats | null, league: League) {
  const list = leaguePlayers(all, league);
  const top = (key: (e: (typeof list)[number]) => number, n = 5) =>
    [...list]
      .filter((e) => key(e) > 0)
      .sort((a, b) => key(b) - key(a) || a.p.name.localeCompare(b.p.name))
      .slice(0, n);
  const sum = (key: (p: PlayerStats) => number) => list.reduce((t, e) => t + key(e.p), 0);
  return {
    players: list.length,
    runs: sum((p) => p.runs),
    wickets: sum((p) => p.wickets),
    sixes: sum((p) => p.sixes),
    hundreds: sum((p) => p.hundreds),
    runsLeaders: top((e) => e.p.runs),
    wicketLeaders: top((e) => e.p.wickets),
    sixesLeaders: top((e) => e.p.sixes),
    highScores: top((e) => e.p.hs ?? 0),
  };
}

/** Totals for one team. */
export function teamTotals(players: PlayerStats[]) {
  const sum = (key: (p: PlayerStats) => number) => players.reduce((t, p) => t + key(p), 0);
  return { runs: sum((p) => p.runs), wickets: sum((p) => p.wickets), sixes: sum((p) => p.sixes), fours: sum((p) => p.fours), catches: sum((p) => p.catches), hundreds: sum((p) => p.hundreds), fifties: sum((p) => p.fifties) };
}

/** The same player (exact name) in other franchise leagues. */
export function otherStints(all: AllStats | null, leagues: League[], current: { leagueId: string; name: string }) {
  if (!all) return [];
  const name = norm(current.name);
  const out: { league: League; team: LeagueTeam; p: StatPlayer }[] = [];
  for (const league of leagues) {
    if (league.id === current.leagueId) continue;
    for (const team of league.teams) {
      const p = playersOf(all, league, team).find((x) => norm(x.name) === name);
      if (p) out.push({ league, team, p });
    }
  }
  return out;
}
