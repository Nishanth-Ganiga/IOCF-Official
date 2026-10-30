import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Series } from '../../data/commandApi';
import { Facts } from './SeriesAnnouncement';

type Nav = (...parts: string[]) => void;
type Filter = 'all' | 'pending' | 'accepted' | 'declined';

const BADGE: Record<Series['status'], { text: string; color: string }> = {
  pending: { text: 'WAITING FOR ACCEPTANCE', color: '#c9a24b' },
  accepted: { text: 'ACCEPTED', color: '#6fcf8e' },
  declined: { text: 'DECLINED (DEADLINE PASSED)', color: '#e07a7a' },
};

/** Administrator: every series of every board, with all details, and the power to delete any of them. */
export default function AdminSeries({ nav }: { nav: Nav }) {
  const [list, setList] = useState<Series[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

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
  }, [load]);

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((s) => (filter === 'all' || s.status === filter) && (!q || s.name.toLowerCase().includes(q) || s.host.name.toLowerCase().includes(q) || s.opponents.some((o) => o.name.toLowerCase().includes(q))));
  }, [list, filter, query]);
  const count = (f: Filter) => (list ?? []).filter((s) => f === 'all' || s.status === f).length;

  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ← BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">ANNOUNCED SERIES</h1>
        <p className="mt-3 max-w-2xl text-sm text-mist">Every series announced by any board, with its full details. Deleting a series removes it for good for every board, and cannot be undone.</p>
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
        {(['all', 'pending', 'accepted', 'declined'] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-semibold tracking-[0.14em] transition ${filter === f ? 'border-[#c9a24b] bg-[#c9a24b]/10 text-[#c9a24b]' : 'border-white/15 text-mist hover:border-white/40'}`}>
            {f === 'pending' ? 'WAITING' : f.toUpperCase()} · {count(f)}
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search series or board" aria-label="Search series or board" className="ml-auto w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:w-64" />
      </div>
      <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${flash ? (flash.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {flash?.text}
      </p>

      {!list ? (
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
                  {BADGE[s.status].text}
                </span>
              </div>
              <Facts s={s} you="administrator" full />
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
