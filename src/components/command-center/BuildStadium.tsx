import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type StadiumRequest, type StadiumsInfo } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';
import { rupees, sheetCreditsOf, stamp } from './CreditsPanel';

/**
 * Build a Stadium, as a board sees it. The chairman gives a name and a place in the home country and sends the request. The level (3) and
 * the cost (₹30,000) are shown but cannot be changed: the server sets them. The administrator accepts or declines; when it is accepted the
 * cost is taken from the board's credits and the stadium joins the board's list, so it can be chosen for a series.
 */
export default function BuildStadium({ theme }: { theme: BoardTheme }) {
  const pal = paletteOf(theme);
  const [data, setData] = useState<StadiumsInfo | null>(null);
  const [pendingCredits, setPendingCredits] = useState(0);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.stadiums(theme.slug), api.credits(theme.slug).catch(() => null)]);
      setData(s);
      setPendingCredits(c?.pending ?? 0);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }, [theme.slug]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !data) return;
    setBusy('send');
    setMsg(null);
    try {
      const r = await api.requestStadium(theme.slug, { name, place });
      setName('');
      setPlace('');
      await load();
      setMsg({ ok: true, text: `Your request for ${r.request.name} was sent to the administrator.` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
    setBusy('');
  };
  const act = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await action();
      await load();
      if (done) setMsg({ ok: true, text: done });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
    setBusy('');
  };

  if (error)
    return (
      <p role="alert" className="mt-8 rounded-xl border border-crimson/40 bg-black/70 px-5 py-4 text-sm text-mist">
        {error}{' '}
        <button type="button" onClick={() => void load()} className="font-semibold underline" style={{ color: pal.highlight }}>
          Try again
        </button>
      </p>
    );
  if (!data) return <p className="mt-8 text-sm text-smoke" aria-busy="true">Loading…</p>;

  const sheet = sheetCreditsOf(theme.name);
  const balance = sheet === null ? null : sheet + pendingCredits;
  const box = 'rounded-2xl border bg-black/60 p-6 backdrop-blur-sm';
  const field = 'mt-1 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2.5 text-sm text-bone outline-none focus:border-[var(--hl)] disabled:opacity-60';
  const label = 'block text-[11px] font-semibold tracking-[0.18em] text-mist';
  const full = data.pending.length >= data.maxPending;

  return (
    <div className="mt-8 space-y-8" style={{ ['--hl' as string]: pal.highlight }}>
      {data.notices.map((n: StadiumRequest) => (
        <div key={n.id} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 bg-black/70 px-5 py-4 backdrop-blur-sm" style={{ borderColor: '#e07a7a' }}>
          <p className="text-sm text-bone">
            <b>Your request for {n.name} was not accepted.</b>{' '}
            <span className="text-mist">
              {n.declineReason ? `Reason: ${n.declineReason}. ` : ''}No credits were taken. You can send a new request.
            </span>
          </p>
          <button type="button" disabled={busy === `d-${n.id}`} onClick={() => void act(`d-${n.id}`, () => api.dismissStadium(theme.slug, n.id))} className="rounded-lg border border-white/25 px-4 py-1.5 text-[11px] font-semibold tracking-[0.2em] text-bone transition hover:border-white/60 disabled:opacity-50">
            OK
          </button>
        </div>
      ))}

      <section aria-label="Build a stadium" className={box} style={{ borderColor: `${pal.highlight}66` }}>
        <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
          {theme.name.toUpperCase()} BOARD · BUILD A STADIUM
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mist">
          Ask the IOCF administrator to build a new stadium for {theme.name}. When the request is accepted, <b className="text-bone">{rupees(data.cost)}</b> is taken from your board&apos;s credits and the stadium is added to your list, so you can choose it for the series you host.
        </p>
        {data.canAct ? (
          <form onSubmit={send} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className={label}>
              STADIUM NAME
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. Harbour Cricket Ground" className={field} />
            </label>
            <label className={label}>
              STADIUM VENUE (PLACE IN {data.country.toUpperCase()})
              <span className="mt-1 flex items-stretch overflow-hidden rounded-lg border border-white/15 bg-black/60 focus-within:border-[var(--hl)]">
                <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={60} required placeholder="City or town" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-bone outline-none" />
                <span className="flex items-center border-l border-white/10 px-3 text-sm text-smoke" aria-label="Home country">, {data.country}</span>
              </span>
            </label>
            <label className={label}>
              STADIUM LEVEL
              <input value={`Level ${data.level}`} readOnly disabled aria-readonly className={field} />
              <span className="mt-1 block text-[11px] font-normal tracking-normal text-smoke">Every new stadium is level {data.level}. This cannot be changed.</span>
            </label>
            <label className={label}>
              COST
              <input value={`${rupees(data.cost)} in credits`} readOnly disabled aria-readonly className={field} />
              <span className="mt-1 block text-[11px] font-normal tracking-normal text-smoke">
                Taken from your credits only if the request is accepted.
                {balance !== null && ` Your balance now: ${rupees(balance)}.`}
                {balance !== null && balance < data.cost && <b className="text-crimson-2"> It is below the cost; accepting it takes your balance below zero.</b>}
              </span>
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={busy !== '' || full} className="rounded-lg px-6 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:opacity-50" style={{ background: pal.highlight }}>
                {busy === 'send' ? 'SENDING…' : 'SEND THE REQUEST'}
              </button>
              {full && <span className="ml-3 text-xs text-smoke">You already have {data.maxPending} requests waiting for the administrator.</span>}
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-smoke">Only the board chairman can send a request.</p>
        )}
        <p role="status" aria-live="polite" className={`mt-3 min-h-[1.2rem] text-sm ${msg ? (msg.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
          {msg?.text}
        </p>
      </section>

      {data.pending.length > 0 && (
        <section aria-label="Requests waiting">
          <h2 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
            WAITING FOR THE ADMINISTRATOR ({data.pending.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {data.pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
                <span>
                  <span className="block text-sm text-bone">{r.name}</span>
                  <span className="text-xs text-smoke">
                    {r.venue} · Level {r.level} · {rupees(r.cost)} · sent {stamp(r.requestedAt)}
                  </span>
                </span>
                {data.canAct && (
                  <button type="button" disabled={busy === `w-${r.id}`} onClick={() => void act(`w-${r.id}`, () => api.withdrawStadium(theme.slug, r.id), `The request for ${r.name} was withdrawn.`)} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-crimson-2 disabled:opacity-50">
                    WITHDRAW
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Your stadiums">
        <h2 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
          {theme.name.toUpperCase()} STADIUMS ({data.stadiums.length})
        </h2>
        {!data.stadiums.length ? (
          <p className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-6 text-center text-sm text-mist backdrop-blur-sm">No stadium yet. Send a request above to build the first one.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.stadiums.map((s) => (
              <li key={s.name} className="rounded-xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
                <span className="block text-sm text-bone">{s.name}</span>
                <span className="text-xs text-smoke">{s.venue ? `${s.venue} · Level ${s.level}` : 'Existing stadium'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
