import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Board } from '../data/boards';
import { FORMAT_LABEL, FORMAT_ORDER } from '../data/careerStats.mjs';
import type { ProfileId } from '../data/portfolio';
import { CATEGORIES, boardsIn, rankPlayers, rankRows, seriesTable, type Category, type Person, type RankedPlayer } from '../data/rankingsCore.mjs';
import { api } from '../data/commandApi';
import { rankingId } from '../data/commandCenter/rankingIds.mjs';
import { loadPeople, loadSeriesResults, PLAYER_SCOPES, type PlayerScope, type SeriesResult } from '../data/rankingsData';
import { store } from '../data/store';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { Flag } from './IocfChairmen';
import { IocfHeader } from './IocfHome';
import { BackButton, Loading, Notice, searchInput } from './IocfPlayers';
import SiteFooter from './SiteFooter';

type BoardsModule = typeof import('../data/boards');
type InsightsModule = typeof import('../data/boardInsights');
// NOT imported at the top of this file: data/leagues.ts takes a copy of the leagues when it is first loaded, so it must only be loaded after the
// dataset (and so also from the Franchise Leagues profile, which loads it the same way).
type LeaguesModule = typeof import('../data/leagues');
const ROUTE = '#/rankings';
const GOLD = '#c9a24b';

type TileId = 'boards' | 'credits' | 'series' | 'batting' | 'bowling' | 'fielding' | 'awards' | 'umpires' | 'leagues' | 'majors' | 'halloffame' | 'councils';
const TILES: { id: TileId; title: string; blurb: string }[] = [
  { id: 'boards', title: 'Board Rankings', blurb: 'The official board rankings: Overall and each format, with movement.' },
  { id: 'credits', title: 'Board Credits', blurb: 'Every board ranked by the credits it holds.' },
  { id: 'series', title: 'Series Rankings', blurb: 'Series won and lost by every board, overall and by format.' },
  { id: 'batting', title: 'Batting Rankings', blurb: 'Runs, average, strike rate, sixes, fours, fifties, hundreds and highest scores.' },
  { id: 'bowling', title: 'Bowling Rankings', blurb: 'Wickets, economy, average, best figures, hauls, maidens and dot balls.' },
  { id: 'fielding', title: 'Fielding Rankings', blurb: 'Catches, stumpings, run outs and total dismissals.' },
  { id: 'awards', title: 'Match Awards', blurb: 'Player of the Match awards and most matches played.' },
  { id: 'umpires', title: 'Umpire Rankings', blurb: 'Every umpire ranked by performance points.' },
  { id: 'leagues', title: 'Franchise League Tables', blurb: 'Standings of every franchise league, with its champions.' },
  { id: 'majors', title: 'Major Tournament Titles', blurb: 'Boards ranked by Major Tournament titles, and every champion.' },
  { id: 'halloffame', title: 'Hall of Fame', blurb: 'The best batsman and bowler of every Hall of Fame card.' },
  { id: 'councils', title: 'Councils', blurb: 'Which boards sit in each council.' },
];

function readRoute(): TileId | null {
  const h = window.location.hash;
  if (!h.startsWith(ROUTE)) return null;
  const id = h.slice(ROUTE.length).split('/').filter(Boolean)[0];
  return TILES.some((t) => t.id === id) ? (id as TileId) : null;
}
const navigate = (id?: string) => {
  window.location.hash = id ? `${ROUTE}/${id}` : ROUTE;
};

function useRoute() {
  const [route, setRoute] = useState<TileId | null>(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

type Data = { b: BoardsModule; i: InsightsModule; l: LeaguesModule };
function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/boardInsights'), import('../data/leagues')]).then(([b, i, l]) => setData({ b, i, l }), () => setFailed(true));
  }, []);
  return { data, failed };
}

/** The rankings profile: one tile per ranking, each opening its own page. Everything is worked out from the live data. */
export default function IocfRankings({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const route = useRoute();
  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [route, scrollTo]);
  const links = [{ id: 'top', label: 'Rankings' }];
  const go = () => (route ? navigate() : scrollTo(0, { offset: 0 }));

  let body: ReactNode;
  if (failed) body = <Notice tone="error">The rankings could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (!route) body = <Home data={data} />;
  else body = <Page id={route} data={data} />;

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      <main className="min-h-[100svh]">
        {body}
        <SiteFooter />
      </main>
    </>
  );
}

/* ---------- home: the tiles ---------- */

function preview(id: TileId, data: Data): string {
  const top = (arr: { name: string }[]) => (arr[0] ? `#1 ${arr[0].name}` : '');
  switch (id) {
    case 'boards': {
      const ranked = data.b.boards.filter((b) => data.i.overallRank(b)).sort((a, b) => data.i.overallRank(a)! - data.i.overallRank(b)!);
      return top(ranked);
    }
    case 'credits':
      return top([...data.b.boards].filter((b) => data.i.creditsOf(b) !== undefined).sort((a, b) => data.i.creditsOf(b)! - data.i.creditsOf(a)!));
    case 'umpires':
      return `${store.umpires.length} umpires`;
    case 'leagues':
      return `${store.leagues.length} leagues`;
    case 'majors':
      return `${store.info.tournaments.length} tournaments`;
    case 'halloffame':
      return `${store.info.hallOfFame.length} cards`;
    case 'councils':
      return `${store.info.councils.length} councils`;
    default:
      return '';
  }
}

function Home({ data }: { data: Data }) {
  return (
    <>
      <section id="top" className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_45%,rgba(122,31,61,0.4),transparent_70%)]" />
        <div className="gutter relative z-[2] pb-8 pt-28">
          <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: GOLD }}>
            INTERNATIONAL ONLINE CRICKET FEDERATION
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,8vw,6rem)] leading-[0.9] tracking-wide text-bone">IOCF RANKINGS</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mist">Every ranking in the federation, each in its own tile. They are worked out from the live data — the IOCF sheet, the series results and the scorer statistics — so they are always up to date.</p>
        </div>
      </section>
      <section aria-label="Rankings" className="gutter pb-20">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => navigate(t.id)} className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-white/10 bg-ink-2 p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#c9a24b]/60">
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-display text-2xl tracking-wide text-bone">{t.title.toUpperCase()}</span>
                  {preview(t.id, data) && <span className="shrink-0 rounded-full border border-[#c9a24b]/50 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em]" style={{ color: GOLD }}>{preview(t.id, data).toUpperCase()}</span>}
                </span>
                <span className="text-sm leading-relaxed text-mist">{t.blurb}</span>
                <span className="mt-auto text-xs font-semibold tracking-[0.2em] transition group-hover:translate-x-1" style={{ color: GOLD }}>
                  OPEN →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ---------- shared pieces ---------- */

function Frame({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  return (
    <div className="gutter pb-20 pt-28">
      <BackButton onClick={() => navigate()}>BACK TO ALL RANKINGS</BackButton>
      <h1 className="mt-5 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.92] tracking-wide text-bone">{title.toUpperCase()}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">{blurb}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

const pill = (active: boolean) => `rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition ${active ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`;

function Pills<T extends string>({ value, options, onPick, label }: { value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onPick(o.id)} className={pill(value === o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Table({ head, rows, empty = 'Nothing to rank yet.' }: { head: { label: string; right?: boolean }[]; rows: { key: string; cells: ReactNode[] }[]; empty?: string }) {
  if (!rows.length) return <p className="rounded-2xl border border-white/10 bg-ink-2 p-8 text-center text-sm text-mist">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-2">
      <table className="min-w-full text-sm">
        <thead className="text-[10px] font-semibold tracking-[0.16em] text-smoke">
          <tr className="border-b border-white/10">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`px-3 py-3 ${h.right ? 'text-right' : 'text-left'}`}>
                {h.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-bone">
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => (i === 0 ? (
                <th key={i} scope="row" className="w-14 px-3 py-2.5 text-left font-display text-xl" style={{ color: typeof c === 'number' && c <= 3 ? GOLD : undefined }}>
                  {c}
                </th>
              ) : (
                <td key={i} className={`px-3 py-2.5 ${head[i]?.right ? 'text-right' : ''}`}>
                  {c}
                </td>
              )))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardCell({ name, slug, data }: { name: string; slug?: string | null; data: Data }) {
  const b = data.b.boards.find((x) => (slug ? data.b.boardSlug(x) === slug : x.name === name));
  return (
    <span className="flex items-center gap-2.5">
      {b ? <Flag board={b} className="text-xl" /> : <span className="w-6" />}
      <span className="font-medium">{name}</span>
    </span>
  );
}

type Moves = Record<string, { by: number; isNew: boolean }>;

/**
 * How far each entry of a ranking moved in the last 10 days, worked out and remembered by the server (a move disappears after 10 days).
 * undefined while loading; null if the server could not be reached (the Move column then shows nothing).
 */
function useMoves(id: string): Moves | null | undefined {
  const [state, setState] = useState<{ id: string; moves: Moves | null } | undefined>();
  useEffect(() => {
    let live = true;
    api.rankMoves(id).then(
      (r) => live && setState({ id, moves: r.moves }),
      () => live && setState({ id, moves: null }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return state?.id === id ? state.moves : undefined;
}

function Move({ m, loading = false }: { m?: { by: number; isNew: boolean }; loading?: boolean }) {
  if (loading) return <span className="text-smoke">·</span>;
  if (!m) return <span className="text-smoke" title="No move in the last 10 days">–</span>;
  if (m.isNew) return <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em]" style={{ borderColor: GOLD, color: GOLD }} title="New in this ranking in the last 10 days">NEW</span>;
  return <span style={{ color: m.by > 0 ? '#6fcf8e' : '#e07a7a' }} title="Moved in the last 10 days">{m.by > 0 ? `▲ ${m.by}` : `▼ ${-m.by}`}</span>;
}

const MOVE_NOTE = 'Move: how far an entry has moved up (▲) or down (▼) since its rank last changed. A move shows for 10 days and then disappears.';

/** Ranks with ties from a list already ordered best first. */
const ranked = <T,>(rows: T[], value: (r: T) => number, name: (r: T) => string, low = false) => rankRows(rows.map((r) => ({ r, name: name(r) })), (x) => value(x.r), low).map((x) => ({ ...x.r, rank: x.rank }));

/* ---------- the pages ---------- */

function Page({ id, data }: { id: TileId; data: Data }) {
  const tile = TILES.find((t) => t.id === id)!;
  let body: ReactNode;
  switch (id) {
    case 'boards': body = <BoardRankings data={data} />; break;
    case 'credits': body = <CreditRankings data={data} />; break;
    case 'series': body = <SeriesRankings data={data} />; break;
    case 'batting': body = <PlayerRankings kind="batting" />; break;
    case 'bowling': body = <PlayerRankings kind="bowling" />; break;
    case 'fielding': body = <PlayerRankings kind="fielding" />; break;
    case 'awards': body = <PlayerRankings kind="awards" />; break;
    case 'umpires': body = <UmpireRankings data={data} />; break;
    case 'leagues': body = <LeagueTables data={data} />; break;
    case 'majors': body = <MajorTitles data={data} />; break;
    case 'halloffame': body = <HallOfFame />; break;
    default: body = <Councils data={data} />;
  }
  return (
    <Frame title={tile.title} blurb={tile.blurb}>
      {body}
    </Frame>
  );
}

function BoardRankings({ data }: { data: Data }) {
  const formats = ['Overall', ...['T10', 'T20', 'ODI', 'Test', 'Club']].filter((f) => data.b.boards.some((b) => data.i.rankIn(b, f)));
  const [format, setFormat] = useState(formats[0] ?? 'Overall');
  const rows = data.b.boards.filter((b) => data.i.rankIn(b, format)).sort((a, b) => data.i.rankIn(a, format)!.rank - data.i.rankIn(b, format)!.rank);
  const moves = useMoves(rankingId.boards(format));
  return (
    <>
      <Pills value={format} options={formats.map((f) => ({ id: f, label: f }))} onPick={setFormat} label="Format" />
      <div className="mt-4">
        <Table
          head={[{ label: 'Rank' }, { label: 'Board' }, { label: 'Points', right: true }, { label: 'Played', right: true }, { label: 'Won', right: true }, { label: 'Win %', right: true }, { label: 'Move', right: true }]}
          rows={rows.map((b: Board) => {
            const r = data.i.rankIn(b, format)!;
            const win = data.i.winRate(r);
            return { key: b.name, cells: [r.rank, <BoardCell key="b" name={b.name} data={data} />, r.points ?? '—', r.played ?? '—', r.won ?? '—', win === undefined ? '—' : `${Math.round(win * 100)}%`, <Move key="m" m={moves?.[data.b.boardSlug(b)]} loading={moves === undefined} />] };
          })}
        />
      </div>
      <p className="mt-3 text-xs text-smoke">{MOVE_NOTE}</p>
    </>
  );
}

function CreditRankings({ data }: { data: Data }) {
  const rows = ranked(
    data.b.boards.filter((b) => data.i.creditsOf(b) !== undefined),
    (b) => data.i.creditsOf(b)!,
    (b) => b.name,
  );
  const moves = useMoves(rankingId.credits());
  return (
    <>
      <Table head={[{ label: 'Rank' }, { label: 'Board' }, { label: 'Credits', right: true }, { label: 'Move', right: true }]} rows={rows.map((b) => ({ key: b.name, cells: [b.rank, <BoardCell key="b" name={b.name} data={data} />, data.i.creditsOf(b)!.toLocaleString('en-IN'), <Move key="m" m={moves?.[data.b.boardSlug(b)]} loading={moves === undefined} />] }))} />
      <p className="mt-3 text-xs text-smoke">{MOVE_NOTE}</p>
    </>
  );
}

function SeriesRankings({ data }: { data: Data }) {
  const [list, setList] = useState<SeriesResult[] | null>(null);
  const [format, setFormat] = useState('all');
  const moves = useMoves(rankingId.series(format));
  useEffect(() => {
    loadSeriesResults().then(setList, () => setList([]));
  }, []);
  if (!list) return <Loading />;
  const present = FORMAT_ORDER.filter((f) => list.some((s) => seriesTable([s], { format: f }).length));
  const table = seriesTable(list.map((s) => ({ boards: s.boards, winner: s.winner, format: s.format })), { format }).filter((r) => data.b.boards.some((b) => data.b.boardSlug(b) === r.slug));
  const rows = rankRows(table.map((r) => ({ ...r, name: data.b.boards.find((b) => data.b.boardSlug(b) === r.slug)!.name })), (r) => r.won * 1000 + r.winPct);
  return (
    <>
      <Pills value={format} options={[{ id: 'all', label: 'All formats' }, ...present.map((f) => ({ id: f, label: FORMAT_LABEL[f] as string }))]} onPick={setFormat} label="Format" />
      <p className="mt-3 text-xs text-smoke">{list.length} finished series: the earlier series from the IOCF records and the ones announced on the site. Ranked by series won, then win %. A series with no format counts in “All formats” only.</p>
      <div className="mt-4">
        <Table
          head={[{ label: 'Rank' }, { label: 'Board' }, { label: 'Played', right: true }, { label: 'Won', right: true }, { label: 'Lost', right: true }, { label: 'Drawn', right: true }, { label: 'Win %', right: true }, { label: 'Move', right: true }]}
          rows={rows.map((r) => ({ key: r.slug, cells: [r.rank, <BoardCell key="b" name={r.name} slug={r.slug} data={data} />, r.played, r.won, r.lost, r.drawn || '—', `${r.winPct}%`, <Move key="m" m={moves?.[r.slug]} loading={moves === undefined} />] }))}
        />
      </div>
      <p className="mt-3 text-xs text-smoke">{MOVE_NOTE}</p>
    </>
  );
}

const KIND_COLS: Record<string, { label: string; get: (t: Record<string, number | string | null>) => string | number }[]> = {
  batting: [{ label: 'M', get: (t) => t.matches as number }, { label: 'Inn', get: (t) => t.batInn as number }, { label: 'Runs', get: (t) => t.runs as number }, { label: 'HS', get: (t) => (t.hs === null ? '—' : `${t.hs}${t.hsNotOut ? '*' : ''}`) }, { label: 'Avg', get: (t) => (t.batInn ? (t.avg as number).toFixed(1) : '—') }, { label: 'SR', get: (t) => ((t.balls as number) ? (t.sr as number).toFixed(1) : '—') }],
  bowling: [{ label: 'M', get: (t) => t.matches as number }, { label: 'Wkts', get: (t) => t.wickets as number }, { label: 'Best', get: (t) => (t.best as string) || '—' }, { label: 'Econ', get: (t) => ((t.ballsBowled as number) ? (t.economy as number).toFixed(1) : '—') }, { label: 'Avg', get: (t) => ((t.wickets as number) ? (t.bowlAvg as number).toFixed(1) : '—') }],
  fielding: [{ label: 'M', get: (t) => t.matches as number }, { label: 'Ct', get: (t) => t.catches as number }, { label: 'St', get: (t) => t.stumpings as number }, { label: 'RO', get: (t) => t.runOuts as number }],
  awards: [{ label: 'M', get: (t) => t.matches as number }, { label: 'POM', get: (t) => t.pom as number }],
};

function PlayerRankings({ kind }: { kind: 'batting' | 'bowling' | 'fielding' | 'awards' }) {
  const cats = CATEGORIES[kind] as Category[];
  const [scope, setScope] = useState<PlayerScope>('overall');
  const [cat, setCat] = useState(cats[0].id);
  const [format, setFormat] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const [people, setPeople] = useState<Record<string, Person[]>>({});
  const [error, setError] = useState(false);
  useEffect(() => {
    if (people[scope]) return;
    loadPeople(scope).then((p) => setPeople((s) => ({ ...s, [scope]: p })), () => setError(true));
  }, [scope, people]);
  const list = people[scope];
  const category = cats.find((c) => c.id === cat) ?? cats[0];
  const withFormats = scope !== 'overall' && scope !== 'franchise';
  const present = useMemo(() => (list ? FORMAT_ORDER.filter((f) => list.some((p) => p.lines.some((l: { format: string | null }) => l.format === f))) : []), [list]);
  const rows: RankedPlayer[] = useMemo(() => (list ? rankPlayers(list, category, withFormats ? format : 'all') : []), [list, category, format, withFormats]);
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.boardName.toLowerCase().includes(q)) : rows;
  const cols = KIND_COLS[kind];
  const moves = useMoves(rankingId.players(scope, kind, category.id, withFormats ? format : 'all'));

  if (error) return <Notice tone="error">The statistics could not be loaded. Please refresh the page to try again.</Notice>;
  return (
    <>
      <div className="space-y-3">
        <Pills value={scope} options={PLAYER_SCOPES.map((o) => ({ id: o.id, label: o.label }))} onPick={(v) => { setScope(v as PlayerScope); setFormat('all'); setLimit(50); }} label="Statistics from" />
        <Pills value={category.id} options={cats.map((c) => ({ id: c.id, label: c.label }))} onPick={(v) => { setCat(v); setLimit(50); }} label="Ranked by" />
        {withFormats && present.length > 0 && <Pills value={format} options={[{ id: 'all', label: 'All formats' }, ...present.map((f) => ({ id: f, label: FORMAT_LABEL[f] as string }))]} onPick={(v) => { setFormat(v); setLimit(50); }} label="Format" />}
        <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(50); }} placeholder="Search a player or board" aria-label="Search a player or board" className={searchInput} />
      </div>
      <p className="mt-3 text-xs text-smoke">
        {PLAYER_SCOPES.find((o) => o.id === scope)?.note}
        {category.note ? ` · ${category.note}` : ''} · {rows.length} ranked.
      </p>
      <div className="mt-4">
        {!list ? (
          <Loading />
        ) : (
          <Table
            head={[{ label: 'Rank' }, { label: 'Player' }, ...cols.map((c) => ({ label: c.label, right: true })), { label: category.label, right: true }, { label: 'Move', right: true }]}
            empty={q ? 'No player matches.' : 'Nobody is ranked here yet.'}
            rows={shown.slice(0, limit).map((r) => ({
              key: r.key,
              cells: [r.rank, <span key="p" className="block"><span className="font-medium">{r.name}</span><span className="block text-[11px] text-smoke">{r.boardName}</span></span>, ...cols.map((c) => c.get(r.totals)), <b key="v" style={{ color: GOLD }}>{r.display}</b>, <Move key="m" m={moves?.[r.key]} loading={moves === undefined} />],
            }))}
          />
        )}
      </div>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 50)} className="mt-4 text-xs font-semibold tracking-[0.2em] hover:underline" style={{ color: GOLD }}>
          SHOW 50 MORE ({shown.length - limit} LEFT)
        </button>
      )}
      <p className="mt-3 text-xs text-smoke">{MOVE_NOTE} Moves are tracked for the top 100 of each ranking.</p>
    </>
  );
}

function UmpireRankings({ data }: { data: Data }) {
  const rows = ranked(
    store.umpires.filter((u) => u.performance?.points !== undefined),
    (u) => Number(u.performance!.points),
    (u) => u.name,
  );
  const board = (slug?: string) => data.b.boards.find((b) => data.b.boardSlug(b) === slug)?.name ?? '—';
  const moves = useMoves(rankingId.umpires());
  return (
    <>
      <Table
        head={[{ label: 'Rank' }, { label: 'Umpire' }, { label: 'Board' }, { label: 'Matches', right: true }, { label: 'Credits', right: true }, { label: 'Points', right: true }, { label: 'Move', right: true }]}
        rows={rows.map((u) => ({ key: u.id, cells: [u.rank, u.name, board(u.boardId), u.career?.total ?? '—', u.performance?.credits?.toLocaleString('en-IN') ?? '—', <b key="p" style={{ color: GOLD }}>{u.performance!.points}</b>, <Move key="m" m={moves?.[u.id]} loading={moves === undefined} />] }))}
      />
      <p className="mt-3 text-xs text-smoke">{MOVE_NOTE}</p>
    </>
  );
}

function LeagueTables({ data }: { data: Data }) {
  const leagues = store.leagues.filter((l) => l.matches.length > 0);
  const [id, setId] = useState(leagues[0]?.id ?? '');
  const league = leagues.find((l) => l.id === id);
  const moves = useMoves(rankingId.league(id));
  if (!league) return <Notice tone="info">No franchise league has results yet.</Notice>;
  const rows = ranked(data.l.standings(league), (r) => r.won * 1000 - r.lost, (r) => r.team);
  return (
    <>
      <Pills value={id} options={leagues.map((l) => ({ id: l.id, label: l.shortName ?? l.name }))} onPick={setId} label="League" />
      <h2 className="mt-5 font-display text-2xl tracking-wide text-bone">{league.name.toUpperCase()}</h2>
      <p className="mt-1 text-sm text-mist">
        {[league.champions && `Champions: ${league.champions}`, league.runnersUp && `Runners-up: ${league.runnersUp}`, league.fairPlay && `Fair play: ${league.fairPlay}`, league.status].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-4">
        <Table
          head={[{ label: 'Rank' }, { label: 'Team' }, { label: 'Played', right: true }, { label: 'Won', right: true }, { label: 'Lost', right: true }, { label: 'Move', right: true }]}
          rows={rows.map((r) => ({ key: r.id, cells: [r.rank, <span key="t" className={r.team === league.champions ? 'font-semibold' : ''} style={r.team === league.champions ? { color: GOLD } : undefined}>{r.team}{r.team === league.champions ? ' 🏆' : ''}</span>, r.played, r.won, r.lost, <Move key="m" m={moves?.[`${league.id}:${r.id}`]} loading={moves === undefined} />] }))}
        />
      </div>
      <p className="mt-3 text-xs text-smoke">League-stage matches only, ranked by wins. {MOVE_NOTE}</p>
    </>
  );
}

function MajorTitles({ data }: { data: Data }) {
  const names = data.b.boards.map((b) => b.name);
  const tally = names.map((name) => {
    let titles = 0;
    let runnersUp = 0;
    for (const t of store.info.tournaments) {
      if (boardsIn(t.champions ?? '', [name]).length) titles += 1;
      if (boardsIn(t.runnersUp ?? '', [name]).length) runnersUp += 1;
    }
    return { name, titles, runnersUp };
  }).filter((r) => r.titles + r.runnersUp > 0);
  const rows = ranked(tally, (r) => r.titles * 1000 + r.runnersUp, (r) => r.name);
  const moves = useMoves(rankingId.majors());
  return (
    <>
      <h2 className="font-display text-2xl tracking-wide text-bone">BOARDS BY TITLES</h2>
      <div className="mt-3">
        <Table head={[{ label: 'Rank' }, { label: 'Board' }, { label: 'Titles', right: true }, { label: 'Runners-up', right: true }, { label: 'Move', right: true }]} rows={rows.map((r) => ({ key: r.name, cells: [r.rank, <BoardCell key="b" name={r.name} data={data} />, r.titles, r.runnersUp, <Move key="m" m={moves?.[r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')]} loading={moves === undefined} />] }))} />
        <p className="mt-3 text-xs text-smoke">{MOVE_NOTE}</p>
      </div>
      <h2 className="mt-10 font-display text-2xl tracking-wide text-bone">EVERY MAJOR TOURNAMENT</h2>
      <div className="mt-3">
        <Table
          head={[{ label: '#' }, { label: 'Tournament' }, { label: 'Champions' }, { label: 'Runners-up' }]}
          rows={store.info.tournaments.map((t, i) => ({ key: t.name, cells: [i + 1, <span key="n"><b className="font-medium">{t.name}</b><span className="block text-[11px] text-smoke">{t.kind}</span></span>, t.champions ?? '—', t.runnersUp ?? '—'] }))}
        />
      </div>
    </>
  );
}

function HallOfFame() {
  const cards = store.info.hallOfFame;
  if (!cards.length) return <Notice tone="info">The Hall of Fame has no cards yet.</Notice>;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {cards.map((c) => (
        <li key={c.card} className="rounded-2xl border border-white/10 bg-ink-2 p-6">
          <p className="font-display text-2xl tracking-wide text-bone">{c.card.toUpperCase()}</p>
          <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: GOLD }}>{c.period.toUpperCase()}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="text-[10px] font-semibold tracking-[0.2em] text-smoke">BEST BATSMAN</dt><dd className="text-bone">{c.batsman ?? '—'}</dd></div>
            <div><dt className="text-[10px] font-semibold tracking-[0.2em] text-smoke">BEST BOWLER</dt><dd className="text-bone">{c.bowler ?? '—'}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Councils({ data }: { data: Data }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {store.info.councils.map((c) => (
        <li key={c.name} className="rounded-2xl border border-white/10 bg-ink-2 p-6">
          <p className="font-display text-2xl tracking-wide text-bone">{c.name.toUpperCase()}</p>
          <p className="text-xs text-smoke">{c.members.length} {c.members.length === 1 ? 'board' : 'boards'}</p>
          {c.members.length ? (
            <ol className="mt-3 space-y-2">
              {c.members.map((m, i) => (
                <li key={m} className="flex items-center gap-3 text-sm text-bone">
                  <span className="w-5 text-smoke">{i + 1}</span>
                  <BoardCell name={m} data={data} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-mist">No boards in this council yet.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
