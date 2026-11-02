import { useMemo, useState } from 'react';
import type { StatLine } from '../../data/commandApi';

type Col = { id: string; label: string; get: (p: StatLine) => number | string | null; num?: boolean; title?: string };

const hsText = (p: StatLine) => (p.hs === null || p.hs === '' ? '—' : typeof p.hs === 'number' ? `${p.hs}${p.hsNotOut ? '*' : ''}` : p.hs);
const dec = (n: number, d = 1) => (n ? n.toFixed(d) : '—');

const COLS: Col[] = [
  { id: 'matches', label: 'M', title: 'Matches', get: (p) => p.matches, num: true },
  { id: 'batInn', label: 'Inn', title: 'Batting innings', get: (p) => p.batInn, num: true },
  { id: 'runs', label: 'Runs', get: (p) => p.runs, num: true },
  { id: 'hs', label: 'HS', title: 'Highest score', get: (p) => (typeof p.hs === 'number' ? p.hs : p.hs ? parseInt(String(p.hs), 10) : null), num: true },
  { id: 'avg', label: 'Avg', title: 'Batting average', get: (p) => p.avg, num: true },
  { id: 'sr', label: 'SR', title: 'Strike rate', get: (p) => p.sr, num: true },
  { id: 'fours', label: '4s', get: (p) => p.fours, num: true },
  { id: 'sixes', label: '6s', get: (p) => p.sixes, num: true },
  { id: 'wickets', label: 'Wkts', title: 'Wickets', get: (p) => p.wickets, num: true },
  { id: 'best', label: 'Best', title: 'Best bowling', get: (p) => p.best, num: false },
  { id: 'economy', label: 'Econ', title: 'Economy', get: (p) => p.economy, num: true },
  { id: 'catches', label: 'Ct', title: 'Catches', get: (p) => p.catches, num: true },
];

/** A player-statistics table with sortable columns. `showSeries` adds the number of series (for totals). */
export default function StatsTable({ rows, showSeries = false, hl, initialSort = 'runs' }: { rows: StatLine[]; showSeries?: boolean; hl: string; initialSort?: string }) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.id === sort);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      if (typeof x === 'number' || typeof y === 'number') return (Number(y) || 0) - (Number(x) || 0);
      return String(y ?? '').localeCompare(String(x ?? ''));
    });
  }, [rows, sort]);
  const th = 'px-2 py-2 text-right text-[10px] font-semibold tracking-[0.14em]';
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-black/50 text-smoke">
          <tr>
            <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold tracking-[0.14em]">
              PLAYER
            </th>
            {showSeries && (
              <th scope="col" className={th} title="Series played">
                SER
              </th>
            )}
            {COLS.map((c) => (
              <th key={c.id} scope="col" className={th} title={c.title} aria-sort={sort === c.id ? 'descending' : 'none'}>
                <button type="button" onClick={() => setSort(c.id)} className="tracking-[0.14em] transition hover:text-bone" style={sort === c.id ? { color: hl } : undefined}>
                  {c.label.toUpperCase()}
                  {sort === c.id ? ' ↓' : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-bone">
          {sorted.map((p, i) => (
            <tr key={`${p.name}-${p.board ?? p.boardName}-${i}`}>
              <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                {p.name}
                <span className="block text-[11px] font-normal text-smoke">{p.boardName}</span>
              </th>
              {showSeries && <td className="px-2 py-2 text-right text-mist">{p.series ?? '—'}</td>}
              <td className="px-2 py-2 text-right text-mist">{p.matches || '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.batInn || '—'}</td>
              <td className="px-2 py-2 text-right font-semibold">{p.batInn ? p.runs : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{hsText(p)}</td>
              <td className="px-2 py-2 text-right text-mist">{p.batInn ? dec(p.avg) : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.batInn ? dec(p.sr) : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.batInn ? p.fours : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.batInn ? p.sixes : '—'}</td>
              <td className="px-2 py-2 text-right font-semibold">{p.bowlInn ? p.wickets : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.bowlInn && p.best ? p.best : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.bowlInn ? dec(p.economy) : '—'}</td>
              <td className="px-2 py-2 text-right text-mist">{p.catches || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
