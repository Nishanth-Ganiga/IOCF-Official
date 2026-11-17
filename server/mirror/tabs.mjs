// What the private mirror sheet holds: every detail the website shows, as tabs of plain rows. Pure functions (no network), so they are tested.
//
//   • each tab is { name, header: [...], rows: [[...]] }; the first row of a sheet is its header
//   • nothing secret is ever written: no password, no password hash, no session or login-attempt fields, no keys
//   • the builders flatten whatever is in the data (every field becomes a column), so a field added to the website later is not left out
const MAX_CELL = 45000; // a Google Sheets cell holds at most 50,000 characters

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A value as it goes into a cell: text or a number or TRUE/FALSE; lists and objects as JSON; nothing as an empty cell. */
export function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v;
  let t = typeof v === 'string' ? v : JSON.stringify(v);
  if (t.length > MAX_CELL) t = `${t.slice(0, MAX_CELL)}… (cut)`;
  return t;
}

/** { a: 1, b: { c: 2 }, d: ['x', 'y'] } → { a: 1, 'b.c': 2, d: 'x | y' } (lists of objects stay as JSON). */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) flatten(v, key, out);
    else if (Array.isArray(v)) out[key] = v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x)) ? v.join(' | ') : v;
    else out[key] = v;
  }
  return out;
}

/** A tab from a list of flat records: the columns are the lead columns first, then every other field in the order it first appears. */
export function table(name, records, lead = []) {
  const cols = [...lead];
  for (const r of records) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return { name, header: cols, rows: records.map((r) => cols.map((c) => cell(r[c]))) };
}

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const iso = (ms) => (ms === null || ms === undefined || ms === '' ? '' : new Date(Number(ms)).toISOString());
const boardName = (boards, s) => boards.find((b) => b.slug === s)?.name ?? s ?? '';

/** The tabs made from the dataset (the IOCF sheet as the site reads it). */
export function datasetTabs(d) {
  const tabs = [];
  const boardOfSlug = new Map((d.boards ?? []).map((b) => [slug(b.name), b.name]));
  const bn = (id) => boardOfSlug.get(id) ?? id ?? '';

  // boards
  tabs.push(table('Boards', (d.boards ?? []).map((b) => ({ name: b.name, slug: slug(b.name), chairman: b.chairman, ceo: b.ceo, sponsors: (b.sponsors ?? []).join(' | '), ...Object.fromEntries((b.facts ?? []).map((f) => [f.label, f.value])), players: (d.players ?? []).filter((p) => p.boardId === slug(b.name)).length, umpires: (d.umpires ?? []).filter((u) => u.boardId === slug(b.name)).length })), ['name', 'slug', 'chairman', 'ceo']));
  tabs.push(table('Board Rankings', (d.boards ?? []).flatMap((b) => (b.rankings ?? []).map((r) => ({ board: b.name, format: r.format, rank: r.rank, points: r.points, played: r.played, won: r.won }))), ['board', 'format', 'rank', 'points', 'played', 'won']));
  tabs.push(table('Board Achievements', (d.boards ?? []).flatMap((b) => (b.achievements ?? []).map((a) => ({ board: b.name, title: a.title, detail: a.detail }))), ['board', 'title', 'detail']));
  tabs.push(table('Rank History', (d.rankHistory ?? []).flatMap((h) => Object.entries(h.ranks ?? {}).flatMap(([board, byFormat]) => Object.entries(byFormat).map(([format, rank]) => ({ at: h.at, board, format, rank })))), ['at', 'board', 'format', 'rank']));

  // players
  const pl = d.players ?? [];
  tabs.push(table('Players', pl.map((p) => ({ id: p.id, board: bn(p.boardId), name: p.name, role: p.official, formats: Object.keys(p.formats ?? {}).join(' | '), achievements: (p.achievements ?? []).length, highlights: (p.highlights ?? []).length, tournaments: (p.tournaments ?? []).length })), ['id', 'board', 'name', 'role']));
  tabs.push(table('Player Format Stats', pl.flatMap((p) => Object.entries(p.formats ?? {}).flatMap(([format, kinds]) => Object.entries(kinds ?? {}).map(([kind, stats]) => ({ player_id: p.id, board: bn(p.boardId), name: p.name, format, kind, ...flatten(stats) })))), ['player_id', 'board', 'name', 'format', 'kind']));
  for (const [tab, key] of [['Player Achievements', 'achievements'], ['Player Highlights', 'highlights'], ['Player Tournaments', 'tournaments']]) {
    tabs.push(table(tab, pl.flatMap((p) => (p[key] ?? []).map((a) => ({ player_id: p.id, board: bn(p.boardId), name: p.name, title: a.title, detail: a.detail }))), ['player_id', 'board', 'name', 'title', 'detail']));
  }

  // umpires
  const rank = new Map((d.umpireOrder ?? []).map((id, i) => [id, i + 1]));
  const um = d.umpires ?? [];
  tabs.push(table('Umpires', um.map((u) => ({ id: u.id, board: bn(u.boardId), name: u.name, rank: rank.get(u.id), ...Object.fromEntries(Object.entries(flatten({ career: u.career ?? {}, performance: u.performance ?? {} }))), assignments: (u.assignments ?? []).length, awards: (u.awards ?? []).length })), ['id', 'board', 'name', 'rank']));
  for (const [tab, key] of [['Umpire Assignments', 'assignments'], ['Umpire Awards', 'awards']]) {
    tabs.push(table(tab, um.flatMap((u) => (u[key] ?? []).map((a) => ({ umpire_id: u.id, board: bn(u.boardId), name: u.name, title: a.title, detail: a.detail }))), ['umpire_id', 'board', 'name', 'title', 'detail']));
  }

  // franchise leagues
  const lg = d.leagues ?? [];
  tabs.push(table('Franchise Leagues', lg.map((l) => ({ id: l.id, name: l.name, short_name: l.shortName, status: l.status, host: l.host, champions: l.champions, runners_up: l.runnersUp, fair_play: l.fairPlay, teams: (l.teams ?? []).length, matches: (l.matches ?? []).length })), ['id', 'name', 'short_name', 'status', 'host', 'champions', 'runners_up', 'fair_play']));
  tabs.push(table('League Teams', lg.flatMap((l) => (l.teams ?? []).map((t) => ({ league: l.name, league_id: l.id, team_id: t.id, team: t.name, notes: (t.notes ?? []).join(' | '), players: (t.players ?? []).length }))), ['league', 'league_id', 'team_id', 'team']));
  tabs.push(table('League Squads', lg.flatMap((l) => (l.teams ?? []).flatMap((t) => (t.players ?? []).map((p) => ({ league: l.name, team: t.name, ...flatten(p) })))), ['league', 'team', 'id', 'name', 'board', 'price']));
  tabs.push(table('League Matches', lg.flatMap((l) => (l.matches ?? []).map((m, i) => ({ league: l.name, no: i + 1, ...flatten(m) }))), ['league', 'no', 'teams', 'date', 'venue', 'umpire', 'winner']));
  tabs.push(table('League Awards', lg.flatMap((l) => (l.awards ?? []).map((a) => ({ league: l.name, ...flatten(a) }))), ['league', 'award', 'winner', 'team', 'board', 'credits']));

  // major tournaments
  const mt = d.majorTournaments ?? [];
  tabs.push(table('Major Tournaments', mt.map((t) => ({ id: t.id, name: t.name, kind: t.kind, sheet: t.sheet, editions: (t.editions ?? []).length })), ['id', 'name', 'kind']));
  tabs.push(table('Tournament Editions', mt.flatMap((t) => (t.editions ?? []).map((e) => ({ tournament: t.name, year: e.year, heading: e.heading, host: e.host, champions: e.champions, runners_up: e.runnersUp, sections: (e.sections ?? []).length }))), ['tournament', 'year', 'heading', 'host', 'champions', 'runners_up']));
  // every table the tournament pages show: one row per table row, the column names alongside
  const tt = [];
  for (const t of mt) {
    for (const e of t.editions ?? []) {
      (e.sections ?? []).forEach((s, si) => {
        const title = (s.titles ?? []).join(' / ');
        const cols = s.columns ?? [];
        (s.rows ?? []).forEach((r, ri) => tt.push({ tournament: t.name, year: e.year, section: si + 1, title, row: ri + 1, ...Object.fromEntries(r.map((v, ci) => [cols[ci] || `column ${ci + 1}`, v])) }));
        if (!(s.rows ?? []).length) tt.push({ tournament: t.name, year: e.year, section: si + 1, title, row: 0 });
      });
    }
  }
  tabs.push(table('Tournament Tables', tt, ['tournament', 'year', 'section', 'title', 'row']));

  // series records (the sheet's Series Matches tab) and the federation information
  const sr = d.seriesRecords ?? {};
  tabs.push(table('Series Records', [...(sr.completed ?? []).map((r) => ({ state: 'completed', ...rec(r) })), ...(sr.upcoming ?? []).map((r) => ({ state: 'upcoming', ...rec(r) }))], ['state', 'name', 'month', 'host', 'opponents', 'dates', 'winner', 'runner_up', 'result', 'bet', 'format']));
  const info = d.info ?? {};
  tabs.push(table('Federation Tournaments', (info.tournaments ?? []).map((t) => flatten(t)), ['name', 'kind', 'champions', 'runnersUp', 'note']));
  tabs.push(table('Hall of Fame', (info.hallOfFame ?? []).map((h) => flatten(h)), ['card', 'period', 'batsman', 'bowler']));
  tabs.push(table('Councils', (info.councils ?? []).flatMap((c) => (c.members ?? []).map((m) => ({ council: c.name, member: m }))), ['council', 'member']));
  tabs.push({ name: 'Tournament Award Names', header: ['award'], rows: (info.tournamentAwards ?? []).map((a) => [cell(a)]) });
  return tabs;
}

function rec(r) {
  return { name: r.name, month: r.month, host: r.host?.name, opponents: (r.opponents ?? []).map((o) => o.name).join(' | '), dates: r.dates, winner: r.winner?.name, runner_up: r.runnerUp?.name, result: r.result, result_lines: Array.isArray(r.resultLines) ? r.resultLines.join(' | ') : r.resultLines, bet: r.bet, format: r.format };
}

/** Statistics rows ("fields" + "rows" as the scorer exports are stored) as a tab: one row per player, the series or tournament in the lead columns. */
function statLines(name, groups) {
  const records = [];
  let fields = null;
  for (const g of groups) {
    fields ??= g.fields;
    for (const row of g.rows ?? []) records.push({ source: g.source, id: g.id, series: g.name, ...Object.fromEntries((g.fields ?? fields).map((f, i) => [f, row[i]])) });
  }
  return table(name, records, ['source', 'id', 'series']);
}

/**
 * The tabs made from the Command Center (the database): series announced on the site, stadiums, credits, accounts (no secrets), the
 * statistics the administrator uploaded, and the activity log.
 */
export function commandTabs({ boards, series = [], stadiumRows = [], baseStadiums = {}, credits = [], accounts = [], stats = [], meta = [], audit = [] }) {
  const tabs = [];
  tabs.push(table('Announced Series', series.map((s) => ({ id: s.id, name: s.name, type: s.series_type, host: boardName(boards, s.host), opponents: (s.opponents ?? []).map((o) => boardName(boards, o)).join(' | '), accepted_by: (s.accepted ?? []).map((o) => boardName(boards, o)).join(' | '), status: s.status, matches: s.matches, stadiums: (s.stadiums ?? []).join(' | '), dates: (s.dates ?? []).join(' | '), bet: s.bet, format: s.format, club_format: s.club_format, deadline: iso(s.deadline_at), announced: iso(s.created_at), accepted: iso(s.accepted_at), result_winner: s.result_winner ? boardName(boards, s.result_winner) : '', result_note: s.result_note, result_recorded: iso(s.result_at), declined_by: s.declined_by ? boardName(boards, s.declined_by) : '', declined: iso(s.declined_at), credits_entered_in_sheet: iso(s.credits_applied_at) })), ['id', 'name', 'type', 'host', 'opponents', 'status']));
  tabs.push(table('Stadiums', [
    ...Object.entries(baseStadiums).flatMap(([b, list]) => list.map((n) => ({ board: boardName(boards, b), stadium: n, level: '', venue: '', source: 'IOCF stadium sheet (before Build a Stadium)' }))),
    ...stadiumRows.filter((r) => r.status === 'accepted').map((r) => ({ board: boardName(boards, r.board), stadium: r.name, level: r.level, venue: r.venue, source: 'Build a Stadium', accepted: iso(r.decided_at) })),
  ], ['board', 'stadium', 'level', 'venue', 'source']));
  tabs.push(table('Stadium Requests', stadiumRows.map((r) => ({ id: r.key, board: boardName(boards, r.board), stadium: r.name, place: r.place, venue: r.venue, level: r.level, cost: r.cost, status: r.status, requested_by: r.requested_by, requested: iso(r.requested_at), decided_by: r.decided_by, decided: iso(r.decided_at), decline_reason: r.decline_reason, board_dismissed_notice: iso(r.acknowledged_at) })), ['id', 'board', 'stadium', 'venue', 'level', 'cost', 'status']));
  tabs.push(table('Credit Adjustments', credits.map((a) => ({ id: a.id, board: boardName(boards, a.board), amount: a.amount, reason: a.reason, by: a.created_by, at: iso(a.created_at), entered_in_sheet: iso(a.applied_at) })), ['id', 'board', 'amount', 'reason', 'by', 'at']));
  // accounts: who can sign in, never how
  tabs.push(table('Board Accounts', accounts.map((a) => ({ account_id: a.account_id, role: a.role, board: a.board_name ?? '', username: a.username, status: a.status, chairman_name: a.chairman_name, last_sign_in: a.last_login_at, created: a.created_at })), ['account_id', 'role', 'board', 'username', 'status']));
  tabs.push(table('Series Stats Uploads', stats.map((e) => ({ key: e.key, kind: e.kind, name: e.name, title: e.title, tour: e.tour, players: e.players, uploaded: iso(e.uploaded_at), uploaded_by: e.uploaded_by })), ['key', 'kind', 'name', 'players', 'uploaded']));
  tabs.push(table('Series Formats', meta.map((m) => ({ key: m.key, format: m.format, updated: iso(m.updated_at), updated_by: m.updated_by })), ['key', 'format']));
  tabs.push(table('Activity Log', audit.map((a) => ({ at: a.at, action: a.action, actor: a.actor, role: a.actor_role, target: a.target, detail: a.detail })), ['at', 'action', 'actor', 'target']));
  return tabs;
}

/** The statistics tabs: the uploaded series and tournaments (from the database) and the franchise leagues (from the bundled scorer exports). */
export function statTabs({ seriesStats = [], tournamentStats = [], leagueStats = null }) {
  const tabs = [];
  tabs.push(statLines('Series Player Stats', seriesStats.map((e) => ({ source: e.kind === 'site' ? 'announced on the site' : 'earlier series', id: e.key, name: e.name, fields: e.fields, rows: e.rows }))));
  tabs.push(statLines('Tournament Player Stats', tournamentStats.map((e) => ({ source: 'major tournament', id: e.key.replace(/^tour-/, ''), name: e.title ?? e.name, fields: e.fields, rows: e.rows }))));
  if (leagueStats) tabs.push(statLines('League Player Stats', Object.entries(leagueStats.leagues ?? {}).map(([id, l]) => ({ source: 'franchise league', id, name: l.title, fields: leagueStats.fields, rows: l.rows }))));
  return tabs;
}

/** The first tab: what this sheet is, when it was last written and how many rows each tab has. */
export function overviewTab({ at, generatedAt, source, tabs }) {
  const rows = [
    ['What this is', 'A private mirror of everything on the IOCF website. It is rewritten from the website\'s data; edit the website or the IOCF sheet, not this one.'],
    ['Last written', at],
    ['Website data generated', generatedAt ?? ''],
    ['Website data source', source ?? ''],
    ['Passwords', 'Never written here. Account tabs list usernames and status only.'],
    ['', ''],
    ['Tab', 'Rows'],
    ...tabs.map((t) => [t.name, t.rows.length]),
  ];
  return { name: 'Overview', header: ['', ''], rows };
}

export { slug };
