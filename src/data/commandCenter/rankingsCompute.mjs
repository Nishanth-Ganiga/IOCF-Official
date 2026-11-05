// Works out EVERY ranking of the Rankings profile in one go, on the server, so that rank movement can be tracked (rankMoves.mjs).
// It uses the same pure helpers as the browser (careerStats.mjs, rankingsCore.mjs, leagueLink.mjs), fed with the same data.
//
//   input = {
//     dataset,                      // the sheet's dataset: boards, players, umpires, leagues, info, seriesRecords
//     tournamentStats, leagueStats, // { fields, tournaments|leagues: { <id>: { rows } } } as in src/data/*.json
//     tournamentOverrides,          // { <tournament id>: { fields, rows } } uploaded by the administrator
//     seriesStats,                  // [{ key, fields, rows, format }]  uploaded series statistics, with the format ('' if unknown)
//     seriesResults, meta,          // finished site series [{ boards, winner, format }] and formats given to earlier series { key: format }
//     aliases,                      // playerAliases.json
//   }
//   → { <ranking id>: [{ key, rank }] }   (the first TOP entries of each)
import { isHiddenBoard } from '../hiddenBoards.mjs';
import { FORMAT_ORDER, TOURNAMENT_FORMAT, formatKey, norm } from '../careerStats.mjs';
import { CATEGORIES, boardsIn, groupPlayers, rankPlayers, rankRows, seriesTable } from '../rankingsCore.mjs';
import { buildAliasIndex } from './aliases.mjs';
import { cleanSquadText, linkSquad, teamKey } from './leagueLink.mjs';
import { rankingId } from './rankingIds.mjs';

export { rankingId };

export const TOP = 100;
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => s.toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (_, p, c) => p + c.toUpperCase());

/** One row of a scorer export as a statistics line (the numbers as numbers; the highest score and the best figures read). */
export function decodeRow(fields, row) {
  const o = {};
  fields.forEach((f, i) => (o[f] = row[i]));
  const num = (k) => (typeof o[k] === 'number' ? o[k] : 0);
  const hs = String(o.hs ?? '');
  const fast = (v) => {
    const m = /\((\d+)\)/.exec(String(v ?? ''));
    return m ? Number(m[1]) : null;
  };
  const best = String(o.best ?? '').trim();
  return {
    name: String(o.name),
    team: String(o.team),
    matches: num('matches'), pom: num('pom'), batInn: num('batInn'), runs: num('runs'), avg: num('avg'), sr: num('sr'),
    thirties: num('thirties'), fifties: num('fifties'), hundreds: num('hundreds'),
    hs: hs ? parseInt(hs, 10) : null, hsNotOut: hs.endsWith('*'),
    sixes: num('sixes'), fours: num('fours'), balls: num('balls'), notOuts: num('notOuts'), most6: num('most6'), most4: num('most4'),
    fast50: fast(o.fast50), fast100: fast(o.fast100),
    bowlInn: num('bowlInn'), wickets: num('wickets'), runsConceded: num('runsConceded'), maidens: num('maidens'),
    bowlAvg: num('bowlAvg'), bowlSr: num('bowlSr'), economy: num('economy'), threeW: num('threeW'), fiveW: num('fiveW'),
    best: best && best !== '0' ? best : null,
    ballsBowled: num('ballsBowled'), dots: num('dots'), catches: num('catches'), stumpings: num('stumpings'), runOuts: num('runOuts'),
  };
}

const TEAM_FIXES = { 'ZZDISMANTLED SA': 'South Africa' };
/** The board a scorer team name stands for ("… EMERGING" and "… W" are that board's youth and women's sides). */
export function boardOfTeam(team, boardNames) {
  const fixed = TEAM_FIXES[team];
  const base = fixed ?? String(team).replace(/\s+(EMERGING|W)$/i, '');
  const name = boardNames.find((b) => norm(b) === norm(base)) ?? titleCase(base);
  return { name, slug: slugOf(name) };
}

const creditsOf = (b) => {
  const v = b.facts?.find((f) => /credits/i.test(f.label))?.value;
  const n = v ? Number(String(v).replace(/[^0-9.]/g, '')) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const top = (rows) => rows.slice(0, TOP).map((r) => ({ key: r.key, rank: r.rank }));

export function computeAllRankings(input) {
  const { dataset } = input;
  const boards = dataset.boards.map((b) => ({ ...b, slug: slugOf(b.name) }));
  const boardNames = boards.map((b) => b.name);
  const out = {};
  const aliasIndex = buildAliasIndex(input.aliases ?? []);

  // ---- boards: the sheet's own ranking, per format
  const formats = ['Overall', 'T10', 'T20', 'ODI', 'Test', 'Club'];
  for (const f of formats) {
    const rows = boards.map((b) => ({ key: b.slug, rank: b.rankings?.find((r) => r.format === f)?.rank })).filter((r) => r.rank).sort((a, b) => a.rank - b.rank);
    if (rows.length) out[rankingId.boards(f)] = top(rows);
  }

  // ---- credits
  out[rankingId.credits()] = top(rankRows(boards.filter((b) => creditsOf(b) !== undefined).map((b) => ({ key: b.slug, name: b.name, v: creditsOf(b) })), (r) => r.v));

  // ---- series (earlier series from the records + series announced on the site)
  const results = [
    ...(dataset.seriesRecords?.completed ?? []).map((r) => ({ boards: [r.host.slug, ...r.opponents.map((o) => o.slug)], winner: r.winner?.slug ?? null, format: input.meta?.[`rec-${norm(r.name)}-${norm(r.keyHost ?? r.host.name)}`] ?? r.format })),
    ...(input.seriesResults ?? []),
  ];
  const slugs = new Set(boards.map((b) => b.slug));
  const seriesFormats = ['all', ...FORMAT_ORDER.filter((f) => results.some((s) => formatKey(s.format) === f))];
  for (const f of seriesFormats) {
    const rows = seriesTable(results, { format: f }).filter((r) => slugs.has(r.slug)).map((r) => ({ key: r.slug, name: r.slug, v: r.won * 1000 + r.winPct }));
    out[rankingId.series(f)] = top(rankRows(rows, (r) => r.v));
  }

  // ---- players, board cricket: major tournaments + series
  const lines = [];
  const tournaments = { ...(input.tournamentStats?.tournaments ?? {}), ...Object.fromEntries(Object.entries(input.tournamentOverrides ?? {}).map(([id, t]) => [id, { fields: t.fields, rows: t.rows }])) };
  for (const [id, t] of Object.entries(tournaments)) {
    const fields = t.fields ?? input.tournamentStats.fields;
    for (const row of t.rows) {
      const p = decodeRow(fields, row);
      const b = boardOfTeam(p.team, boardNames);
      lines.push({ name: p.name, boardSlug: b.slug, boardName: b.name, source: 'tournament', id, format: TOURNAMENT_FORMAT[id] ?? null, line: p });
    }
  }
  const sheetFormat = new Map([...(dataset.seriesRecords?.completed ?? []), ...(dataset.seriesRecords?.upcoming ?? [])].map((r) => [`rec-${norm(r.name)}-${norm(r.keyHost ?? r.host.name)}`, r.format]));
  for (const s of input.seriesStats ?? []) {
    const format = formatKey(s.format) ?? formatKey(sheetFormat.get(s.key)) ?? (s.key === 'rec-odi-wc-warmup-games' ? 'odi' : null);
    for (const row of s.rows) {
      const p = decodeRow(s.fields, row);
      const b = boardOfTeam(p.team, boardNames);
      lines.push({ name: p.name, boardSlug: b.slug, boardName: b.name, source: 'series', id: s.key, format, line: p });
    }
  }
  const rosterBoard = (name) => dataset.players.find((p) => norm(p.name) === norm(name))?.boardId;
  // (a dismantled board's players are not ranked; their statistics still count in the totals of the players they were played against)
  const boardPeople = groupPlayers(lines, { aliases: aliasIndex, rosterBoard, boardNameOf: (s) => boards.find((b) => b.slug === s)?.name }).filter((p) => !isHiddenBoard(p.boardSlug));
  const boardFormats = FORMAT_ORDER.filter((f) => boardPeople.some((p) => p.lines.some((l) => l.format === f)));

  // ---- players, franchise leagues: the scorer's rows linked to their squad entry (which names the player's national board)
  const franchise = [];
  for (const league of dataset.leagues) {
    const stats = input.leagueStats?.leagues?.[league.id];
    if (!stats) continue;
    const decoded = stats.rows.map((r) => decodeRow(input.leagueStats.fields, r));
    for (const team of league.teams) {
      const mine = decoded.filter((p) => teamKey(p.team) === teamKey(team.name));
      if (!mine.length) continue;
      const links = linkSquad(league.id, mine[0].team, mine.map((p) => p.name), team.players.map((p) => p.name));
      mine.forEach((p, i) => {
        const board = links.has(i) ? team.players[links.get(i)].board : undefined;
        franchise.push({ name: p.name, boardSlug: board ? slugOf(board) : '', boardName: board || '—', source: 'franchise', id: league.id, format: null, line: p });
      });
    }
  }
  const franchisePeople = groupPlayers(franchise, { aliases: aliasIndex, rosterBoard, boardNameOf: (s) => boards.find((b) => b.slug === s)?.name });

  for (const [scope, people, fmts] of [['board', boardPeople, ['all', ...boardFormats]], ['franchise', franchisePeople, ['all']]]) {
    for (const kind of Object.keys(CATEGORIES)) {
      for (const cat of CATEGORIES[kind]) {
        for (const f of fmts) out[rankingId.players(scope, kind, cat.id, f)] = top(rankPlayers(people, cat, f));
      }
    }
  }

  // ---- umpires
  out[rankingId.umpires()] = top(rankRows(dataset.umpires.filter((u) => u.performance?.points !== undefined).map((u) => ({ key: u.id, name: u.name, v: Number(u.performance.points) })), (r) => r.v));

  // ---- franchise league tables (league-stage matches, ranked by wins)
  for (const league of dataset.leagues) {
    if (!league.matches.length) continue;
    const rows = new Map(league.teams.map((t) => [t.name, { key: `${league.id}:${t.id}`, name: t.name, won: 0, lost: 0 }]));
    for (const m of league.matches) {
      if (m.stage) continue;
      for (const name of m.teams) {
        const r = rows.get(name);
        if (!r) continue;
        if (m.winner === name) r.won += 1;
        else if (m.winner && m.teams.includes(m.winner)) r.lost += 1;
      }
    }
    out[rankingId.league(league.id)] = top(rankRows([...rows.values()].map((r) => ({ ...r, v: r.won * 1000 - r.lost })), (r) => r.v));
  }

  // ---- Major Tournament titles
  const titles = boardNames.map((name) => {
    let t = 0;
    let ru = 0;
    for (const x of dataset.info?.tournaments ?? []) {
      if (boardsIn(x.champions ?? '', [name]).length) t += 1;
      if (boardsIn(x.runnersUp ?? '', [name]).length) ru += 1;
    }
    return { key: slugOf(name), name, t, ru };
  }).filter((r) => r.t + r.ru > 0);
  out[rankingId.majors()] = top(rankRows(titles.map((r) => ({ ...r, v: r.t * 1000 + r.ru })), (r) => r.v));

  return out;
}
export { cleanSquadText };
