import { useEffect, useState } from 'react';
import { api, type StatLine } from '../data/commandApi';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
let cache: { at: number; promise: Promise<StatLine[]> } | null = null;
/** Every player's totals over the series whose statistics the administrator uploaded; one request is shared and kept for a minute. */
function totals(): Promise<StatLine[]> {
  if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), promise: api.seriesTotals().then((r) => r.players) };
  return cache.promise;
}

const Cell = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <dt className="text-[10px] font-semibold tracking-[0.22em] text-smoke">{label.toUpperCase()}</dt>
    <dd className="mt-1 text-lg font-semibold text-bone">{value}</dd>
  </div>
);

/** A player's totals over the series statistics, if the administrator has uploaded any with him in them. Shows nothing otherwise. */
export default function SeriesStatsCard({ name, boardId, className = '' }: { name: string; boardId: string; className?: string }) {
  const [line, setLine] = useState<StatLine | null>(null);
  useEffect(() => {
    let live = true;
    totals().then(
      (all) => live && setLine(all.find((p) => p.board === boardId && norm(p.name) === norm(name)) ?? null),
      () => cache && (cache = null), // the Command Center service is not reachable here (for example in the apps): show nothing
    );
    return () => {
      live = false;
    };
  }, [name, boardId]);
  if (!line) return null;
  const d = (n: number) => (n ? n.toFixed(1) : '—');
  return (
    <section className={`rounded-2xl border border-white/10 bg-ink-2 p-5 ${className}`} aria-label="Series statistics">
      <h2 className="mb-1 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">SERIES STATISTICS</h2>
      <p className="mb-4 text-xs text-smoke">Totals over {line.series} IOCF series whose scorer statistics are recorded.</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
        <Cell label="Series" value={line.series ?? 0} />
        <Cell label="Matches" value={line.matches} />
        <Cell label="Runs" value={line.batInn ? line.runs : '—'} />
        <Cell label="Highest score" value={line.hs === null ? '—' : `${line.hs}${line.hsNotOut ? '*' : ''}`} />
        <Cell label="Average" value={line.batInn ? d(line.avg) : '—'} />
        <Cell label="Strike rate" value={line.batInn ? d(line.sr) : '—'} />
        <Cell label="Fours" value={line.fours} />
        <Cell label="Sixes" value={line.sixes} />
        <Cell label="Wickets" value={line.bowlInn ? line.wickets : '—'} />
        <Cell label="Best figures" value={line.bowlInn && line.best ? line.best : '—'} />
        <Cell label="Economy" value={line.bowlInn ? d(line.economy) : '—'} />
        <Cell label="Catches" value={line.catches || '—'} />
      </dl>
    </section>
  );
}
