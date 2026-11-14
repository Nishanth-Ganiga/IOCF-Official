import { useMemo, useState } from 'react';
import { api, ApiError, type Series, type SeriesOverview, type SeriesStatsDetail, type SeriesStatsSummary } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';
import { boardLabel, boardsOf, isWarmup, keyOf, resultText, statsKeyOf, seriesRecords, withoutSiteDuplicates, type SeriesRecord } from '../../data/seriesRecords';
import { withPresentBoard } from '../../data/presentBoard';
import StatsTable from './StatsTable';

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A series from either source, in one shape for display. */
/** What the administrator has added to the series: formats of earlier series, and which series have player statistics. */
export type Extras = { meta: Record<string, string>; stats: SeriesStatsSummary[] };
export const NO_EXTRAS: Extras = { meta: {}, stats: [] };

export type Item = {
  key: string;
  /** Where its player statistics are stored. */
  statsKey: string;
  /** The statistics are in a file that covers several series (the ODI World Cup warm-up games). */
  combinedStats?: boolean;
  source: 'site' | 'record';
  name: string;
  host: string;
  opponents: string[];
  /** Board slugs in the series (a team that is not one of the 27 boards has none). */
  boards: string[];
  dates: string | null;
  winner: { name: string; slug: string | null } | null;
  runnerUp: string | null;
  drawn: boolean;
  result: string | null;
  lines: string[] | null;
  bet: number | null;
  format: string | null;
  month: string | null;
};

const dayText = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

export function fromSite(s: Series): Item {
  const dates = s.fixtures.filter((f) => f.date).map((f) => f.date!) .sort();
  const winner = s.result?.winner ?? null;
  return {
    key: `site-${s.id}`,
    statsKey: `site-${s.id}`,
    source: 'site',
    name: s.name,
    host: s.host.name,
    opponents: s.opponents.map((o) => o.name),
    boards: [s.host.slug, ...s.opponents.map((o) => o.slug)],
    dates: dates.length ? (dates.length > 1 && dates[0] !== dates[dates.length - 1] ? `${dayText(dates[0])} – ${dayText(dates[dates.length - 1])}` : dayText(dates[0])) : null,
    winner,
    runnerUp: null,
    drawn: Boolean(s.result && !s.result.winner),
    result: s.result?.note ?? null,
    lines: null,
    bet: s.bet,
    format: s.clubFormat ? `Club · ${s.clubFormat}` : s.format,
    month: null,
  };
}

export function fromRecord(r: SeriesRecord, meta: Record<string, string> = {}): Item {
  const statsKey = statsKeyOf(r);
  return {
    key: `rec-${r.name}-${r.host.name}-${r.dates}`,
    statsKey,
    source: 'record',
    name: r.name,
    host: boardLabel(r.host),
    combinedStats: isWarmup(r),
    opponents: r.opponents.map(boardLabel),
    boards: boardsOf(r).map((b) => b.slug).filter((x): x is string => Boolean(x)),
    dates: r.dates,
    winner: r.winner ? { ...r.winner, name: boardLabel(r.winner) } : null,
    runnerUp: r.runnerUp ? boardLabel(r.runnerUp) : null,
    drawn: false,
    result: resultText(r),
    lines: r.resultLines,
    bet: r.bet,
    format: meta[keyOf(r)] ?? r.format,
    month: r.month,
  };
}

/** The earlier series (the IOCF sheet's records) that are not duplicates of a series announced on the site. */
export function recordItems(kind: 'completed' | 'upcoming', data: SeriesOverview, meta: Record<string, string> = {}): Item[] {
  const site = [...data.announced, ...data.upcoming, ...(data.completed ?? [])];
  return withoutSiteDuplicates(seriesRecords()[kind], site).map((r) => fromRecord(r, meta));
}

/** The note shown wherever the two sources meet. */
export function SourceNote({ hl }: { hl: string }) {
  return (
    <p className="mt-4 max-w-3xl rounded-xl border px-4 py-3 text-sm leading-relaxed text-mist" style={{ borderColor: `${hl}55` }}>
      <b className="text-bone">Please note:</b> series played so far were <b className="text-bone">announced manually</b> by the IOCF and are kept in the IOCF records (marked <span style={{ color: hl }}>IOCF RECORD</span>); a few were announced on this site (marked <span style={{ color: hl }}>ANNOUNCED ON THE SITE</span>). <b className="text-bone">From now on, every series is announced on this site only.</b>
    </p>
  );
}

/** The player statistics of one series, grouped by board; loaded when opened. */
function SeriesStatsPanel({ statsKey, hl, combined = false }: { statsKey: string; hl: string; combined?: boolean }) {
  const [state, setState] = useState<{ open: boolean; data?: SeriesStatsDetail; error?: string }>({ open: false });
  const toggle = () => {
    if (state.open) return setState({ ...state, open: false });
    setState({ ...state, open: true });
    if (!state.data) api.seriesStats(statsKey).then((data) => setState({ open: true, data: { ...data, players: withPresentBoard(data.players) } }), (e: unknown) => setState({ open: true, error: e instanceof ApiError ? e.message : 'Something went wrong.' }));
  };
  const groups = useMemo(() => {
    const m = new Map<string, SeriesStatsDetail['players']>();
    for (const p of state.data?.players ?? []) m.set(p.boardName, [...(m.get(p.boardName) ?? []), p]);
    return [...m.entries()];
  }, [state.data]);
  return (
    <div className="mt-4">
      <button type="button" onClick={toggle} aria-expanded={state.open} className="text-xs font-semibold tracking-[0.2em] hover:underline" style={{ color: hl }}>
        {state.open ? 'HIDE PLAYER STATISTICS' : combined ? 'PLAYER STATISTICS (ALL WARM-UP GAMES) →' : 'PLAYER STATISTICS →'}
      </button>
      {state.open && (
        <div className="mt-3 space-y-4">
          {state.error && <p className="text-sm text-crimson-2">{state.error}</p>}
          {!state.data && !state.error && <p className="text-sm text-smoke">Loading…</p>}
          {groups.map(([board, rows]) => (
            <section key={board} aria-label={`${board} players`}>
              <h4 className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-mist">{board.toUpperCase()}</h4>
              <StatsTable rows={rows} hl={hl} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function ItemCard({ it, hl, slug, hasStats = false }: { it: Item; hl: string; slug?: string; hasStats?: boolean }) {
  const mine = slug ? it.winner?.slug === slug : false;
  return (
    <li className="rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-2xl tracking-wide text-bone">{it.name.toUpperCase()}</p>
        <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.16em]" style={{ borderColor: it.source === 'site' ? hl : 'rgba(255,255,255,0.25)', color: it.source === 'site' ? hl : '#b4b3bb' }}>
          {it.source === 'site' ? 'ANNOUNCED ON THE SITE' : 'IOCF RECORD'}
        </span>
      </div>
      <p className="text-xs font-semibold tracking-[0.18em]" style={{ color: hl }}>
        {[it.host, ...it.opponents].join(' vs ').toUpperCase()}
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        {[
          ['Hosted by', it.host],
          ['Dates', it.dates],
          ['Winner', it.drawn ? 'Series drawn' : it.winner ? `${it.winner.name}${it.runnerUp ? ` (runners-up: ${it.runnerUp})` : ''}` : null],
          ['Result', it.result],
          ['Bet amount', it.bet ? money(it.bet) : null],
          ['Format', it.format],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k as string} className="contents">
              <dt className="text-[11px] font-semibold tracking-[0.18em] text-smoke">{(k as string).toUpperCase()}</dt>
              <dd className="text-bone" style={k === 'Winner' && mine ? { color: '#6fcf8e' } : undefined}>
                {v as string}
              </dd>
            </div>
          ))}
        {it.lines && (
          <div className="contents">
            <dt className="text-[11px] font-semibold tracking-[0.18em] text-smoke">MATCHES</dt>
            <dd>
              <ol className="space-y-0.5 text-bone">
                {it.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            </dd>
          </div>
        )}
      </dl>
      {hasStats && it.combinedStats && <p className="mt-3 text-xs text-smoke">The warm-up games were scored together, so their player statistics are one table for all the ODI World Cup warm-up matches.</p>}
      {hasStats && <SeriesStatsPanel statsKey={it.statsKey} hl={hl} combined={it.combinedStats} />}
    </li>
  );
}

/** Every completed series: the ones announced on the site with a recorded result, and the IOCF records from before. */
export default function SeriesHistory({ theme, data, extras }: { theme: BoardTheme; data: SeriesOverview; extras: Extras }) {
  const pal = paletteOf(theme);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [query, setQuery] = useState('');

  const { site, records } = useMemo(() => ({ site: data.completed.map(fromSite), records: recordItems('completed', data, extras.meta) }), [data, extras.meta]);
  const withStats = useMemo(() => new Set(extras.stats.map((x) => x.key)), [extras.stats]);
  const match = (it: Item) => {
    const q = query.trim().toLowerCase();
    return (scope === 'all' || it.boards.includes(theme.slug)) && (!q || it.name.toLowerCase().includes(q) || [it.host, ...it.opponents].some((b) => b.toLowerCase().includes(q)));
  };
  const siteShown = site.filter(match);
  const recShown = records.filter(match);
  const mineAll = [...site, ...records].filter((it) => it.boards.includes(theme.slug));
  const won = mineAll.filter((it) => it.winner?.slug === theme.slug).length;

  // records, newest month first (the sheet lists January first)
  const months = [...new Set(recShown.map((r) => r.month ?? ''))].sort((a, b) => MONTH_ORDER.indexOf(b) - MONTH_ORDER.indexOf(a));
  const pill = (active: boolean) => (active ? { borderColor: pal.highlight, background: `${pal.highlight}22`, color: pal.highlight } : { borderColor: 'rgba(255,255,255,0.15)', color: '#d9d8de' });

  return (
    <div style={{ ['--hl' as string]: pal.highlight }}>
      <h2 className="font-display text-3xl tracking-wide text-bone">SERIES HISTORY</h2>
      <p className="mt-1 text-sm text-mist">Every completed series: its dates, winner, result, bet amount and format.</p>
      <SourceNote hl={pal.highlight} />

      <p className="mt-5 text-sm text-mist">
        {theme.name} has played <b className="text-bone">{mineAll.length}</b> series and won <b className="text-bone">{won}</b>
        {mineAll.length ? ` (${Math.round((won / mineAll.length) * 100)}%)` : ''}.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {([['mine', `${theme.name} series`], ['all', 'All boards']] as ['mine' | 'all', string][]).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)} className="rounded-full border px-4 py-2 text-sm font-semibold transition" style={pill(scope === id)}>
            {label}
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a series or board" aria-label="Search a series or board" className="ml-auto w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none placeholder:text-smoke focus:border-[var(--hl)] sm:w-64" />
      </div>

      {!siteShown.length && !recShown.length && <p className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-6 text-center text-sm text-mist backdrop-blur-sm">No completed series match.</p>}

      {siteShown.length > 0 && (
        <>
          <h3 className="mt-8 text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
            ANNOUNCED ON THIS SITE
          </h3>
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {siteShown.map((it) => (
              <ItemCard key={it.key} it={it} hl={pal.highlight} slug={theme.slug} hasStats={withStats.has(it.statsKey)} />
            ))}
          </ul>
        </>
      )}

      {months.map((m) => (
        <section key={m || 'none'} aria-label={m || 'Earlier'}>
          <h3 className="mt-8 text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
            {(m || 'EARLIER').toUpperCase()} · IOCF RECORDS
          </h3>
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {recShown
              .filter((r) => (r.month ?? '') === m)
              .reverse()
              .map((it) => (
                <ItemCard key={it.key} it={it} hl={pal.highlight} slug={theme.slug} hasStats={withStats.has(it.statsKey)} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
