import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type TotalsResponse } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';
import StatsTable from './StatsTable';

/** Every player's totals over all the series whose statistics the administrator has uploaded. */
export default function SeriesPlayerStats({ theme }: { theme: BoardTheme }) {
  const pal = paletteOf(theme);
  const [data, setData] = useState<TotalsResponse | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState<'mine' | 'all'>('mine');
  useEffect(() => {
    api.seriesTotals().then(setData, (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong.'));
  }, []);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.players ?? []).filter((p) => (board === 'all' || p.board === theme.slug) && (!q || p.name.toLowerCase().includes(q) || p.boardName.toLowerCase().includes(q)));
  }, [data, query, board, theme.slug]);
  const pill = (active: boolean) => (active ? { borderColor: pal.highlight, background: `${pal.highlight}22`, color: pal.highlight } : { borderColor: 'rgba(255,255,255,0.15)', color: '#d9d8de' });
  return (
    <div style={{ ['--hl' as string]: pal.highlight }}>
      <h2 className="font-display text-3xl tracking-wide text-bone">SERIES PLAYER STATISTICS</h2>
      <p className="mt-1 max-w-3xl text-sm text-mist">Each player&apos;s totals over every series whose scorer statistics the administrator has uploaded{data ? ` (${data.series} series so far)` : ''}. Click a column heading to sort.</p>
      {error && <p role="alert" className="mt-4 text-sm text-crimson-2">{error}</p>}
      {!data && !error && <p className="mt-4 text-sm text-smoke" aria-busy="true">Loading…</p>}
      {data && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {([['mine', `${theme.name} players`], ['all', 'All boards']] as ['mine' | 'all', string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={board === id} onClick={() => setBoard(id)} className="rounded-full border px-4 py-2 text-sm font-semibold transition" style={pill(board === id)}>
                {label}
              </button>
            ))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a player" aria-label="Search a player" className="ml-auto w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none placeholder:text-smoke focus:border-[var(--hl)] sm:w-64" />
          </div>
          <div className="mt-4">
            {rows.length ? <StatsTable rows={rows} showSeries hl={pal.highlight} /> : <p className="rounded-2xl border border-white/10 bg-black/60 p-6 text-center text-sm text-mist">{data.series ? 'No players match.' : 'No series statistics have been uploaded yet.'}</p>}
          </div>
        </>
      )}
    </div>
  );
}
