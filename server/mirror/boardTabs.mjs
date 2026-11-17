// One tab per board, laid out like the board tabs of the IOCF workbook: a banner, the board's key facts, then a block for each part of the
// board (rankings, achievements, players, umpires, stadiums, series, franchise leagues, credits). Every block has a coloured bar, a light
// header row and pale alternating rows, in the board's own colours. Pure functions, no network.
import { ledger, pendingOf } from '../command/credits.mjs';
import { PURPLE, boardPalette, textOn } from './style.mjs';
import { cell, slug } from './tabs.mjs';

export const NCOLS = 11;
const WIDTHS = [220, 180, 130, 120, 120, 110, 110, 110, 110, 110, 110];
const when = (ms) => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace('T', ' ') : '');
const money = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '');

/** A small builder: rows go in one by one and the formatting for each is remembered. */
export function layoutBuilder(pal, ncols = NCOLS) {
  const rows = [];
  const formats = [];
  const merges = [];
  const heights = [];
  const bands = [];
  const pad = (r) => [...r.map(cell), ...Array(Math.max(0, ncols - r.length)).fill('')].slice(0, ncols);
  const add = (r, fmt, merge = false) => {
    const i = rows.length;
    rows.push(pad(r));
    if (fmt) formats.push({ r0: i, r1: i + 1, c0: 0, c1: ncols, ...fmt });
    if (merge) merges.push({ r0: i, r1: i + 1, c0: 0, c1: ncols });
    return i;
  };
  return {
    rows,
    banner(title, sub) {
      const i = add([title], { bg: pal.banner, fg: textOn(pal.banner), bold: true, size: 22, align: 'LEFT' }, true);
      heights.push({ row: i, px: 48 });
      if (sub) add([sub], { bg: pal.banner, fg: textOn(pal.banner), italic: true, size: 10, align: 'LEFT' }, true);
      add([''], { bg: pal.stripe }, true);
      heights.push({ row: rows.length - 1, px: 6 });
    },
    gap() {
      add(['']);
    },
    /** label / value lines; the label cell is tinted */
    facts(pairs) {
      for (const [k, v] of pairs) {
        const i = add([k, v]);
        formats.push({ r0: i, r1: i + 1, c0: 0, c1: 1, bg: pal.label, bold: true, fg: '#1a1a1a' }, { r0: i, r1: i + 1, c0: 1, c1: ncols, bg: pal.pale, align: 'LEFT' });
      }
    },
    section(title, count) {
      add([count === undefined ? title : `${title}  (${count})`], { bg: pal.bar, fg: textOn(pal.bar), bold: true, size: 12, align: 'LEFT' }, true);
    },
    /** a table: header row then the rows; an empty table says so */
    table(header, body, emptyText = 'Nothing recorded yet.') {
      if (!body.length) {
        add([emptyText], { fg: '#777777', italic: true });
        return;
      }
      // one banded range per table (header colour, then white and pale rows) instead of a format per row
      const h = add(header, { fg: '#1a1a1a', bold: true });
      body.forEach((r) => add(r));
      bands.push({ r0: h, r1: h + 1 + body.length, c0: 0, c1: ncols });
    },
    done(tabName) {
      return { name: tabName, header: [], rows, layout: { widths: WIDTHS.slice(0, ncols), formats, merges, heights, bands }, tabColor: pal.tab, palette: pal };
    },
  };
}

/** The numbers of the credits a board has: "7,363,245" → 7363245. */
const creditsOf = (b) => {
  const raw = (b.facts ?? []).find((f) => /available credits/i.test(f.label))?.value;
  const n = raw ? Number(String(raw).replace(/[^\d-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Everything about one board as a tab. ctx: { dataset, boards (boards.json), series, stadiumRows, baseStadiums, credits, accounts, now } */
export function boardTab(b, ctx) {
  const { dataset: d, boards, series = [], stadiumRows = [], baseStadiums = {}, credits = [], accounts = [], now = () => Date.now() } = ctx;
  const s = slug(b.name);
  const theme = boards.find((x) => x.slug === s);
  const pal = boardPalette(theme);
  const L = layoutBuilder(pal);
  const nameOf = (sl) => d.boards.find((x) => slug(x.name) === sl)?.name ?? boards.find((x) => x.slug === sl)?.name ?? sl ?? '';

  const players = (d.players ?? []).filter((p) => p.boardId === s);
  const umpires = (d.umpires ?? []).filter((u) => u.boardId === s);
  const rank = new Map((d.umpireOrder ?? []).map((id, i) => [id, i + 1]));
  const sheetCredits = creditsOf(b);
  const lines = ledger(series, credits, boards);
  const pending = pendingOf(lines, s);
  const account = accounts.find((a) => a.board_slug === s);
  const stadiums = [
    ...(baseStadiums[s] ?? []).map((n) => [n, '', '', 'IOCF stadium sheet', '']),
    ...stadiumRows.filter((r) => r.board === s && r.status === 'accepted').map((r) => [r.name, r.venue, r.level, 'Build a Stadium', when(r.decided_at)]),
  ];
  const sr = d.seriesRecords ?? {};
  const involves = (r) => r.host?.slug === s || (r.opponents ?? []).some((o) => o.slug === s);
  const records = [...(sr.completed ?? []).map((r) => ['completed', r]), ...(sr.upcoming ?? []).map((r) => ['upcoming', r])].filter(([, r]) => involves(r));
  const mine = series.filter((x) => x.host === s || (x.opponents ?? []).includes(s));
  const squads = (d.leagues ?? []).flatMap((l) => (l.teams ?? []).flatMap((t) => (t.players ?? []).filter((p) => p.board === b.name).map((p) => [l.name, t.name, p.name, p.price, p.mom, p.bat, p.bowl, (p.honours ?? []).map((h) => `${h.title}${h.credits ? ` (${h.credits})` : ''}`).join(' | ')])));

  L.banner(`${b.name.toUpperCase()} BOARD`, `International Online Cricket Federation  ·  mirror of the IOCF sheet and the Command Center  ·  written ${new Date(now()).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  L.facts([
    ['Chairman', b.chairman ?? ''],
    ['CEO', b.ceo ?? ''],
    ['Sponsors', (b.sponsors ?? []).join(' | ')],
    ['Credits in the IOCF sheet', sheetCredits === null ? 'not listed' : money(sheetCredits)],
    ['Pending credit changes (Command Center)', pending],
    ['Balance (sheet + pending)', sheetCredits === null ? '' : money(sheetCredits + pending)],
    ...(b.facts ?? []).filter((f) => !/available credits/i.test(f.label)).map((f) => [f.label, f.value]),
    ['Players', players.length],
    ['Umpires', umpires.length],
    ['Stadiums', stadiums.length],
    ['Series in the IOCF records', records.length],
    ['Series announced on the site', mine.length],
    ['Command Center login', account ? `${account.status}${account.chairman_name ? ` · chairman ${account.chairman_name}` : ''}` : 'no login yet'],
  ]);
  L.gap();

  L.section('BOARD RANKINGS', (b.rankings ?? []).length);
  L.table(['Format', 'Rank', 'Points', 'Played', 'Won'], (b.rankings ?? []).map((r) => [r.format, r.rank, r.points, r.played, r.won]));
  L.gap();
  L.section('BOARD ACHIEVEMENTS', (b.achievements ?? []).length);
  L.table(['Award', 'Details'], (b.achievements ?? []).map((a) => [a.title, a.detail]));
  L.gap();

  L.section('PLAYERS', players.length);
  L.table(['Player', 'Role', 'Formats with stats', 'Achievements', 'Highlights', 'Tournament awards', 'Player id'], players.map((p) => [p.name, p.official ?? '', Object.keys(p.formats ?? {}).join(' | '), (p.achievements ?? []).length, (p.highlights ?? []).length, (p.tournaments ?? []).length, p.id]));
  L.gap();
  const awards = players.flatMap((p) => [...(p.achievements ?? []).map((a) => [p.name, 'Award', a.title, a.detail]), ...(p.highlights ?? []).map((a) => [p.name, 'Highlight', a.title, a.detail]), ...(p.tournaments ?? []).map((a) => [p.name, 'Tournament', a.title, a.detail])]);
  L.section('PLAYER AWARDS AND HIGHLIGHTS', awards.length);
  L.table(['Player', 'Kind', 'Title', 'Details'], awards);
  L.gap();

  L.section('UMPIRES', umpires.length);
  L.table(['Umpire', 'Rank', 'Club', 'T10', 'T20', '100-ball', 'ODI', 'Test', 'Total matches', 'Credits', 'Points'], umpires.map((u) => [u.name, rank.get(u.id), u.career?.club, u.career?.t10, u.career?.t20, u.career?.hundred, u.career?.odi, u.career?.test, u.career?.total, u.performance?.credits, u.performance?.points]));
  L.gap();
  const asg = umpires.flatMap((u) => [...(u.assignments ?? []).map((a) => [u.name, 'Assignment', a.title, a.detail]), ...(u.awards ?? []).map((a) => [u.name, 'Award', a.title, a.detail])]);
  L.section('UMPIRE ASSIGNMENTS AND AWARDS', asg.length);
  L.table(['Umpire', 'Kind', 'Title', 'Details'], asg);
  L.gap();

  L.section('STADIUMS', stadiums.length);
  L.table(['Stadium', 'Venue', 'Level', 'Source', 'Added'], stadiums);
  L.gap();
  const reqs = stadiumRows.filter((r) => r.board === s);
  L.section('STADIUM REQUESTS (BUILD A STADIUM)', reqs.length);
  L.table(['Stadium', 'Venue', 'Level', 'Cost', 'Status', 'Requested', 'Decided', 'Reason'], reqs.sort((x, y) => y.requested_at - x.requested_at).map((r) => [r.name, r.venue, r.level, r.cost, r.status, when(r.requested_at), when(r.decided_at), r.decline_reason ?? '']));
  L.gap();

  L.section('SERIES IN THE IOCF RECORDS', records.length);
  L.table(['State', 'Series', 'Month', 'Host', 'Opponents', 'Dates', 'Winner', 'Result', 'Bet', 'Format'], records.map(([st, r]) => [st, r.name, r.month, r.host?.name, (r.opponents ?? []).map((o) => o.name).join(' | '), r.dates, r.winner?.name, r.result, r.bet, r.format]));
  L.gap();
  L.section('SERIES ANNOUNCED ON THE SITE', mine.length);
  L.table(['Series', 'Role', 'Opponents', 'Status', 'Dates', 'Stadiums', 'Bet', 'Format', 'Winner', 'Announced'], mine.sort((x, y) => y.created_at - x.created_at).map((x) => [x.name, x.host === s ? 'host' : 'opponent', [x.host, ...(x.opponents ?? [])].filter((o) => o !== s).map(nameOf).join(' | '), x.status, (x.dates ?? []).join(' | '), (x.stadiums ?? []).join(' | '), x.bet, x.club_format ? `${x.format} · ${x.club_format}` : x.format, x.result_winner ? (x.result_winner === 'draw' ? 'draw' : nameOf(x.result_winner)) : '', when(x.created_at)]));
  L.gap();

  L.section('FRANCHISE LEAGUES (PLAYERS NAMED FOR THIS BOARD)', squads.length);
  L.table(['League', 'Team', 'Player', 'Price', 'Man of the match', 'Best batsman', 'Best bowler', 'Honours'], squads);
  L.gap();

  const mineCredits = lines.filter((l) => l.board === s);
  L.section('CREDIT CHANGES RECORDED ON THE SITE', mineCredits.length);
  L.table(['Date', 'Change', 'Kind', 'Details', 'In the IOCF sheet'], mineCredits.map((l) => [when(l.at), l.delta, l.kind, l.series ? `${l.series}: ${l.text}` : l.text, l.applied ? 'yes' : 'not yet']));
  return L.done(b.name);
}

/** The first tab: what the sheet is, a legend of the colours, and the list of every tab with its size. */
export function overviewLayout({ at, dataset, tabs, boardTabNames, warnings = [] }) {
  const L = layoutBuilder(PURPLE, 4);
  L.banner('IOCF — PRIVATE MIRROR SHEET', `Everything on the IOCF website, written automatically  ·  last written ${at}`);
  L.facts([
    ['What this is', 'A private copy of everything on the website: the IOCF sheet\'s data plus the Command Center (series, stadiums, credits, uploaded statistics).'],
    ['Do not edit here', 'This sheet is rewritten from the website each time; edit the IOCF sheet or the Command Center instead. Changes made here are lost.'],
    ['Website data generated', dataset.generatedAt ?? ''],
    ['Website data source', dataset.source ?? ''],
    ['Passwords', 'Never written here. The account tab lists usernames and status only.'],
    ['Colours', 'Each board\'s tab is in that board\'s own colours (dark banner, coloured section bars, light table headers). The tabs that hold every board together are purple.'],
  ]);
  L.gap();
  L.section('BOARD TABS', boardTabNames.length);
  L.table(['Board', 'Rows'], boardTabNames.map((n) => [n, tabs.find((t) => t.name === n)?.rows.length ?? 0]));
  L.gap();
  const rest = tabs.filter((t) => !boardTabNames.includes(t.name));
  L.section('ALL-BOARD TABS (EVERY DETAIL, ONE ROW EACH)', rest.length);
  L.table(['Tab', 'Rows'], rest.map((t) => [t.name, t.rows.length]));
  if (warnings.length) {
    L.gap();
    L.section('NOT WRITTEN THIS TIME', warnings.length);
    L.table(['Reason'], warnings.map((w) => [w]));
  }
  const tab = L.done('Overview');
  tab.layout.widths = [260, 520, 120, 120];
  return tab;
}
