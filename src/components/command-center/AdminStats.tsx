import { useMemo, useRef, useState } from 'react';
import { api, ApiError, type SeriesStatsSummary } from '../../data/commandApi';
import { WARMUP_KEY, boardLabel, isWarmup, keyOf, recordKey, seriesRecords, statsKeyOf, type SeriesRecord } from '../../data/seriesRecords';

const GOLD = '#c9a24b';
const when = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** Reads a chosen file as text. */
export const readFile = (file: File): Promise<string> => file.text();

/** Upload / replace / remove the scorer statistics of one series. `onChanged` reloads the list afterwards. */
export function StatsControl({ statsKey, name, summary, onChanged }: { statsKey: string; name: string; summary?: SeriesStatsSummary; onChanged: () => Promise<void> | void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.uploadSeriesStats(statsKey, await readFile(file), name);
      await onChanged();
      setMsg({ ok: true, text: `Statistics saved for ${r.players} players.${r.warnings.length ? ` Note: ${r.warnings.join(' ')}` : ''}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.removeSeriesStats(statsKey);
      await onChanged();
      setMsg({ ok: true, text: 'Statistics removed.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-bone">
          Player statistics:{' '}
          {summary ? (
            <span className="text-[#6fcf8e]">
              uploaded · {summary.players} players · {when(summary.uploadedAt)}
            </span>
          ) : (
            <span style={{ color: GOLD }}>not uploaded yet</span>
          )}
        </span>
        <input ref={input} type="file" accept=".csv,text/csv" aria-label={`Statistics CSV for ${name}`} className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-lg border px-4 py-1.5 text-xs font-bold tracking-[0.16em] transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: GOLD, color: GOLD }}>
          {busy ? 'WORKING…' : summary ? 'REPLACE CSV' : 'UPLOAD STATS CSV'}
        </button>
        {summary && (
          <button type="button" onClick={() => void remove()} disabled={busy} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-crimson-2 disabled:opacity-50">
            REMOVE
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={`mt-1 text-xs ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {msg?.text}
      </p>
    </div>
  );
}

type Row = { r: SeriesRecord; kind: 'completed' | 'upcoming'; key: string };

/**
 * The earlier series from the IOCF records (the sheet's Series Matches tab). The sheet is read-only here, so the administrator
 * gives each series its format (many have none) and uploads its statistics; both are stored separately and shown with the series.
 */
export function RecordsManager({ meta, choices, stats, onChanged, site }: { meta: Record<string, string>; choices: string[]; stats: SeriesStatsSummary[]; onChanged: () => Promise<void>; site: { name: string; host: { name: string } }[] }) {
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'noFormat' | 'noStats'>('noFormat');
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const has = useMemo(() => new Map(stats.map((s) => [s.key, s])), [stats]);

  const rows: Row[] = useMemo(() => {
    const dup = new Set(site.map((s) => recordKey(s.name, s.host.name)));
    const recs = seriesRecords();
    return [
      ...recs.upcoming.map((r) => ({ r, kind: 'upcoming' as const })),
      ...[...recs.completed].reverse().map((r) => ({ r, kind: 'completed' as const })),
    ]
      .map((x) => ({ ...x, key: keyOf(x.r) }))
      .filter((x) => !dup.has(x.key));
  }, [site]);

  const formatOf = (x: Row) => meta[x.key] ?? x.r.format ?? '';
  // the ODI World Cup warm-up games are covered by one combined statistics file: no separate upload, and not "missing"
  const covered = (x: Row) => isWarmup(x.r) && has.has(WARMUP_KEY);
  const needsStats = (x: Row) => x.kind === 'completed' && !has.has(statsKeyOf(x.r)) && !covered(x);
  const shown = rows.filter((x) => {
    const q = query.trim().toLowerCase();
    if (q && !x.r.name.toLowerCase().includes(q) && ![x.r.host, ...x.r.opponents].some((b) => b.name.toLowerCase().includes(q))) return false;
    if (only === 'noFormat') return !formatOf(x);
    if (only === 'noStats') return needsStats(x);
    return true;
  });
  const counts = { noFormat: rows.filter((x) => !formatOf(x)).length, noStats: rows.filter(needsStats).length };

  const setFormat = async (x: Row, format: string) => {
    setBusy(x.key);
    setFlash(null);
    try {
      await api.setSeriesFormat(x.key, format || null);
      await onChanged();
      setFlash({ ok: true, text: format ? `Format of “${x.r.name}” set to ${format}.` : `Format of “${x.r.name}” cleared.` });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };

  const chip = (active: boolean) => `rounded-full border px-4 py-1.5 text-xs font-semibold tracking-[0.14em] transition ${active ? 'border-[#c9a24b] bg-[#c9a24b]/10 text-[#c9a24b]' : 'border-white/15 text-mist hover:border-white/40'}`;
  return (
    <div className="mt-6">
      <p className="max-w-3xl text-sm leading-relaxed text-mist">
        These are the series from before the Command Center, read from the sheet&apos;s Series Matches tab. Many have no format: choose it here. For a finished series, upload its statistics CSV so its players&apos; numbers are counted.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={only === 'noFormat'} onClick={() => setOnly('noFormat')} className={chip(only === 'noFormat')}>
          NO FORMAT · {counts.noFormat}
        </button>
        <button type="button" aria-pressed={only === 'noStats'} onClick={() => setOnly('noStats')} className={chip(only === 'noStats')}>
          NO STATISTICS · {counts.noStats}
        </button>
        <button type="button" aria-pressed={only === 'all'} onClick={() => setOnly('all')} className={chip(only === 'all')}>
          ALL · {rows.length}
        </button>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a series or board" aria-label="Search a series or board" className="ml-auto w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:w-64" />
      </div>
      <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${flash ? (flash.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {flash?.text}
      </p>
      {!shown.length ? (
        <p className="mt-2 rounded-2xl border border-white/10 bg-ink-2 p-6 text-center text-sm text-mist">{only === 'noFormat' ? 'Every series has a format.' : only === 'noStats' ? 'Every completed series has statistics.' : 'No series match.'}</p>
      ) : (
        <ul className="mt-2 grid gap-3 lg:grid-cols-2">
          {shown.slice(0, 80).map((x) => (
            <li key={x.key} className="rounded-2xl border border-white/10 bg-ink-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-xl tracking-wide text-bone">{x.r.name.toUpperCase()}</p>
                <span className="shrink-0 rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-mist">{x.kind === 'completed' ? 'COMPLETED' : 'UPCOMING'}</span>
              </div>
              <p className="text-xs font-semibold tracking-[0.16em] text-[#c9a24b]">{[x.r.host, ...x.r.opponents].map(boardLabel).join(' vs ').toUpperCase()}</p>
              <p className="mt-1 text-xs text-smoke">
                {[x.r.dates, x.r.month, x.r.winner ? `won by ${x.r.winner.name}` : null].filter(Boolean).join(' · ')}
              </p>
              <label className="mt-3 block text-[11px] font-semibold tracking-[0.18em] text-mist">
                FORMAT
                <select value={formatOf(x)} disabled={busy === x.key} onChange={(e) => void setFormat(x, e.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none focus:border-[#c9a24b] disabled:opacity-50">
                  <option value="">{x.r.format ? `As in the sheet: ${x.r.format}` : 'Not set'}</option>
                  {choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {x.kind === 'completed' && covered(x) ? (
                <p className="mt-3 rounded-lg border border-[#6fcf8e]/40 p-3 text-sm text-[#6fcf8e]">Statistics counted: the ODI World Cup warm-up games were scored as one file (“ODI WC Warmup all matches”, {has.get(WARMUP_KEY)?.players} players), so this series needs no separate upload.</p>
              ) : (
                x.kind === 'completed' && <StatsControl statsKey={x.key} name={x.r.name} summary={has.get(x.key)} onChanged={onChanged} />
              )}
            </li>
          ))}
        </ul>
      )}
      {shown.length > 80 && <p className="mt-3 text-xs text-smoke">Showing the first 80 of {shown.length}. Use the search or the filters to narrow the list.</p>}
    </div>
  );
}
