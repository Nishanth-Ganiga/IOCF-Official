import { useEffect, useState } from 'react';
import { api, ApiError, type CreditsInfo } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';
import { store } from '../../data/store';

export const rupees = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;
export const signed = (n: number) => `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN')}`;
export const stamp = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** The "Available credits" the IOCF Google Sheet currently shows for a board (the site reads the sheet live), or null. */
export function sheetCreditsOf(boardName: string): number | null {
  const board = store.boards.find((b) => b.name === boardName) as { facts?: { label: string; value: string }[] } | undefined;
  const raw = board?.facts?.find((f) => /available credits/i.test(f.label))?.value;
  const n = raw ? Number(raw.replace(/[^\d-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Board Credits & Finance, as the board sees it: the sheet's credits, what is pending on top, and the history. Read-only. */
export default function CreditsPanel({ theme }: { theme: BoardTheme }) {
  const pal = paletteOf(theme);
  const [data, setData] = useState<CreditsInfo | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    api.credits(theme.slug).then(setData, (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong.'));
  };
  useEffect(() => {
    setData(null);
    load();
  }, [theme.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <p role="alert" className="mt-8 rounded-xl border border-crimson/40 bg-black/70 px-5 py-4 text-sm text-mist">
        {error}{' '}
        <button type="button" onClick={load} className="font-semibold underline" style={{ color: pal.highlight }}>
          Try again
        </button>
      </p>
    );
  if (!data) return <p className="mt-8 text-sm text-smoke" aria-busy="true">Loading…</p>;

  const sheet = sheetCreditsOf(theme.name);
  const total = (sheet ?? 0) + data.pending;
  return (
    <div className="mt-8">
      <section aria-label="Balance" className="rounded-2xl border bg-black/60 p-6 backdrop-blur-sm" style={{ borderColor: `${pal.highlight}66` }}>
        <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
          {theme.name.toUpperCase()} BOARD · CURRENT BALANCE
        </p>
        <p className={`mt-2 font-display text-[clamp(2.6rem,8vw,5rem)] leading-none ${total < 0 ? 'text-crimson-2' : 'text-bone'}`}>{rupees(total)}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-[11px] font-semibold tracking-[0.18em] text-smoke">IN THE IOCF SHEET</dt>
          <dd className="text-bone">{sheet === null ? 'not listed in the sheet' : rupees(sheet)}</dd>
          <dt className="text-[11px] font-semibold tracking-[0.18em] text-smoke">PENDING</dt>
          <dd className="text-bone">
            {data.pending === 0 ? '—' : signed(data.pending)} <span className="text-smoke">· series results recorded here that the sheet does not include yet</span>
          </dd>
        </dl>
      </section>

      <details open className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-sm">
        <summary className="cursor-pointer text-xs font-semibold tracking-[0.2em]" style={{ color: pal.highlight }}>
          HOW CREDITS WORK
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-mist">
          <li>Your credits come from the IOCF sheet, which the administrator keeps up to date. Whenever the sheet changes, this page changes with it.</li>
          <li>When the administrator records the winner of a series, its bet is settled and shows here as <b className="text-bone">pending</b> straight away, so your balance is already right before the sheet is updated.</li>
          <li>
            The winner gains the bet and the loser loses it. <b className="text-bone">If the home (hosting) board wins, the bet is doubled</b> — for a ₹5,000 bet a home win is worth ₹10,000, an away win ₹5,000. In a trilateral or quadrilateral series every other board pays the winner. A drawn series changes nothing.
          </li>
          <li>Once the administrator has entered a change in the sheet, it is marked <b className="text-bone">in the sheet</b> and stops counting as pending (the sheet then includes it).</li>
        </ul>
      </details>

      <h2 className="mt-8 text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
        HISTORY
      </h2>
      {!data.entries.length ? (
        <p className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-6 text-center text-sm text-mist backdrop-blur-sm">No series results yet. They appear here once a series involving {theme.name} has a recorded winner.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
              <span>
                <span className="block text-sm text-bone">{e.kind === 'series' ? e.text : `Adjustment by the administrator: ${e.text}`}</span>
                <span className="text-xs text-smoke">
                  {e.series ? `${e.series} · ` : ''}
                  {stamp(e.at)} · <span style={{ color: e.entered ? '#6fcf8e' : pal.highlight }}>{e.entered ? 'IN THE SHEET' : 'PENDING'}</span>
                </span>
              </span>
              <span className="font-display text-xl tracking-wide" style={{ color: e.delta < 0 ? '#e07a7a' : '#6fcf8e' }}>
                {signed(e.delta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
