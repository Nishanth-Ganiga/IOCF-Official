import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Series, type SeriesStatsSummary } from '../../data/commandApi';
import { RecordsManager, StatsControl, readFile } from './AdminStats';
import { Facts } from './SeriesAnnouncement';

type Nav = (...parts: string[]) => void;
type Filter = 'active' | 'completed' | 'declined' | 'all' | 'records';

const BADGE: Record<Series['status'], { text: string; color: string }> = {
  pending: { text: 'WAITING FOR ACCEPTANCE', color: '#c9a24b' },
  accepted: { text: 'ACCEPTED', color: '#6fcf8e' },
  completed: { text: 'COMPLETED', color: '#8fb4ff' },
  declined: { text: 'DECLINED', color: '#e07a7a' },
};

/** The Active view holds series still waiting or accepted; a series moves to Completed when its result is recorded. */
const inFilter = (s: Series, f: Filter) => (f === 'all' || f === 'records' ? true : f === 'active' ? s.status === 'pending' || s.status === 'accepted' : s.status === f);

/** Administrator: every series of every board, with all details, and the power to delete any of them. */
export default function AdminSeries({ nav }: { nav: Nav }) {
  const [list, setList] = useState<Series[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState('');
  const [winner, setWinner] = useState('');
  const [note, setNote] = useState('');
  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [extras, setExtras] = useState<{ meta: Record<string, string>; choices: string[]; stats: SeriesStatsSummary[]; ready: boolean }>({ meta: {}, choices: [], stats: [], ready: false });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  // formats of earlier series and the statistics already uploaded (empty if their tables are not set up yet)
  const loadExtras = useCallback(async () => {
    const [m, s] = await Promise.allSettled([api.seriesMeta(), api.seriesStatsList()]);
    setExtras({ meta: m.status === 'fulfilled' ? m.value.meta : {}, choices: m.status === 'fulfilled' ? m.value.choices : [], stats: s.status === 'fulfilled' ? s.value : [], ready: m.status === 'fulfilled' && s.status === 'fulfilled' });
  }, []);
  const load = useCallback(async () => {
    try {
      setList(await api.adminSeries());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }, []);
  useEffect(() => {
    void load();
    void loadExtras();
  }, [load, loadExtras]);

  const remove = async (s: Series) => {
    setBusy(s.id);
    setFlash(null);
    try {
      await api.deleteSeries(s.id);
      setConfirm('');
      await load();
      setFlash({ ok: true, text: `“${s.name}” was deleted.` });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };

  const openResult = (s: Series) => {
    setEditing(s.id);
    setStatsFile(null);
    setWinner(s.result ? (s.result.winner?.slug ?? 'draw') : '');
    setNote(s.result?.note ?? '');
    setConfirm('');
    setFlash(null);
  };
  const saveResult = async (s: Series) => {
    setBusy(s.id);
    setFlash(null);
    try {
      await api.setSeriesResult(s.id, { winner, note });
      setEditing('');
      await load();
      let extra = '';
      if (statsFile) {
        try {
          const r = await api.uploadSeriesStats(`site-${s.id}`, await readFile(statsFile), s.name);
          extra = ` Statistics saved for ${r.players} players.${r.warnings.length ? ` Note: ${r.warnings.join(' ')}` : ''}`;
        } catch (e) {
          extra = ` The statistics file was not saved: ${e instanceof ApiError ? e.message : 'something went wrong'} You can upload it again below.`;
        }
        await loadExtras();
      }
      setStatsFile(null);
      setFlash({ ok: true, text: `Result saved for “${s.name}”. It has moved to Completed.${extra}` });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };
  const clearResult = async (s: Series) => {
    setBusy(s.id);
    setFlash(null);
    try {
      await api.clearSeriesResult(s.id);
      await load();
      setFlash({ ok: true, text: `Result cleared for “${s.name}”. It is back under Active.` });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((s) => inFilter(s, filter) && (!q || s.name.toLowerCase().includes(q) || s.host.name.toLowerCase().includes(q) || s.opponents.some((o) => o.name.toLowerCase().includes(q))));
  }, [list, filter, query]);
  const count = (f: Filter) => (list ?? []).filter((s) => inFilter(s, f)).length;

  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ← BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">ANNOUNCED SERIES</h1>
        <p className="mt-3 max-w-2xl text-sm text-mist">Series that are waiting or accepted are under Active. When you record a result, the series moves to Completed, so this list stays short. Every series announced by any board, with its full details. Deleting a series removes it for good for every board, and cannot be undone.</p>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-crimson/40 bg-ink-2 px-5 py-4 text-sm text-mist">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold text-[#c9a24b] hover:underline">
            Try again
          </button>
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(['active', 'completed', 'declined', 'all', 'records'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-semibold tracking-[0.14em] transition ${filter === f ? 'border-[#c9a24b] bg-[#c9a24b]/10 text-[#c9a24b]' : 'border-white/15 text-mist hover:border-white/40'}`}>
            {f === 'records' ? 'IOCF RECORDS' : f.toUpperCase()}{f === 'records' ? '' : ` · ${count(f)}`}
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search series or board" aria-label="Search series or board" className="ml-auto w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:w-64" />
      </div>
      <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${flash ? (flash.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {flash?.text}
      </p>

      {filter === 'records' ? (
        <>
          {!extras.ready && <p role="alert" className="mt-6 rounded-xl border border-crimson/40 bg-ink-2 px-5 py-4 text-sm text-mist">Formats and statistics are not set up yet: run the statistics SQL (CREATE_SERIES_STATS_TABLES.sql) in Supabase, then reload this page.</p>}
          <RecordsManager meta={extras.meta} choices={extras.choices} stats={extras.stats} onChanged={loadExtras} site={list ?? []} />
        </>
      ) : !list ? (
        !error && <p className="mt-6 text-sm text-smoke">Loading series…</p>
      ) : !rows.length ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-ink-2 p-6 text-center text-sm text-mist">{list.length ? 'No series match.' : 'No series have been announced yet.'}</p>
      ) : (
        <ul className="mt-2 grid gap-4 lg:grid-cols-2">
          {rows.map((s) => (
            <li key={s.id} className="rounded-2xl border border-white/10 bg-ink-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-2xl tracking-wide text-bone">{s.name.toUpperCase()}</p>
                <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.16em]" style={{ borderColor: BADGE[s.status].color, color: BADGE[s.status].color }}>
                  {s.status === 'declined' ? (s.declinedBy ? `DECLINED BY ${s.declinedBy.name.toUpperCase()}` : 'DECLINED (DEADLINE PASSED)') : BADGE[s.status].text}
                </span>
              </div>
              <Facts s={s} you="administrator" full />
              {(s.status === 'accepted' || s.status === 'completed') && (
                <div className="mt-4 rounded-lg border border-white/10 p-3">
                  {editing === s.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (winner) void saveResult(s);
                      }}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist">
                        SERIES WINNER
                        <select value={winner} onChange={(e) => setWinner(e.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none focus:border-[#c9a24b]">
                          <option value="">Select the winner</option>
                          {[s.host, ...s.opponents].map((b) => (
                            <option key={b.slug} value={b.slug}>
                              {b.name}
                            </option>
                          ))}
                          <option value="draw">Series drawn (no winner)</option>
                        </select>
                      </label>
                      <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist">
                        RESULT NOTE (OPTIONAL)
                        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. won 2–1" className="mt-1 w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b]" />
                      </label>
                      <label className="block text-[11px] font-semibold tracking-[0.18em] text-mist sm:col-span-2">
                        PLAYER STATISTICS CSV (OPTIONAL — THE SCORER&apos;S EXPORT FOR THIS SERIES)
                        <input type="file" accept=".csv,text/csv" onChange={(e) => setStatsFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-mist file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-bone" />
                        <span className="mt-1 block text-[11px] font-normal text-smoke">{statsFile ? `Selected: ${statsFile.name}` : 'Upload it now so every player of the series is counted, or later from the card.'}</span>
                      </label>
                      <div className="flex items-center gap-3 sm:col-span-2">
                        <button type="submit" disabled={!winner || busy === s.id} className="rounded-lg bg-[#c9a24b] px-5 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:opacity-40">
                          {busy === s.id ? 'SAVING…' : 'SAVE RESULT'}
                        </button>
                        <button type="button" onClick={() => setEditing('')} className="text-xs font-semibold tracking-[0.18em] text-mist hover:text-bone">
                          CANCEL
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-bone">{s.result ? `Result: ${s.result.winner ? `${s.result.winner.name} won` : 'drawn'}${s.result.note ? ` · ${s.result.note}` : ''}` : 'No result recorded yet.'}</span>
                      <button type="button" onClick={() => openResult(s)} className="rounded-lg border border-[#c9a24b] px-4 py-1.5 text-xs font-bold tracking-[0.18em] text-[#c9a24b] transition hover:bg-[#c9a24b]/10">
                        {s.result ? 'EDIT RESULT' : 'RECORD RESULT'}
                      </button>
                      {s.result && (
                        <button type="button" onClick={() => void clearResult(s)} disabled={busy === s.id} className="text-xs font-semibold tracking-[0.18em] text-mist hover:text-bone disabled:opacity-50">
                          CLEAR
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {(s.status === 'accepted' || s.status === 'completed') && <StatsControl statsKey={`site-${s.id}`} name={s.name} summary={extras.stats.find((x) => x.key === `site-${s.id}`)} onChanged={loadExtras} />}
              <div className="mt-4">
                {confirm === s.id ? (
                  <div role="alertdialog" aria-label={`Delete ${s.name}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-crimson/50 px-4 py-3">
                    <span className="text-sm text-bone">Delete “{s.name}” for every board?</span>
                    <button type="button" onClick={() => void remove(s)} disabled={busy === s.id} className="rounded-lg bg-crimson px-4 py-2 text-xs font-bold tracking-[0.18em] text-white transition hover:brightness-110 disabled:opacity-50">
                      {busy === s.id ? 'DELETING…' : 'YES, DELETE'}
                    </button>
                    <button type="button" onClick={() => setConfirm('')} className="text-xs font-semibold tracking-[0.18em] text-mist hover:text-bone">
                      CANCEL
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirm(s.id)} className="rounded-lg border border-crimson/60 px-5 py-2 text-xs font-bold tracking-[0.2em] text-crimson-2 transition hover:bg-crimson/10">
                    DELETE SERIES
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
