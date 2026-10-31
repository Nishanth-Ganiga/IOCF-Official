import { useEffect, useState } from 'react';
import { api, ApiError, type CreditsInfo } from '../../data/commandApi';
import { paletteOf, type BoardTheme } from '../../data/commandCenter/boardConfig';

export const rupees = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;
export const signed = (n: number) => `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN')}`;
export const stamp = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** Board Credits & Finance, as the board sees it: its balance and every series it has won or lost. Read-only. */
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

  return (
    <div className="mt-8">
      <section aria-label="Balance" className="rounded-2xl border bg-black/60 p-6 backdrop-blur-sm" style={{ borderColor: `${pal.highlight}66` }}>
        <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
          {theme.name.toUpperCase()} BOARD · CURRENT BALANCE
        </p>
        <p className={`mt-2 font-display text-[clamp(2.6rem,8vw,5rem)] leading-none ${data.balance < 0 ? 'text-crimson-2' : 'text-bone'}`}>{rupees(data.balance)}</p>
      </section>

      <details open className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-sm">
        <summary className="cursor-pointer text-xs font-semibold tracking-[0.2em]" style={{ color: pal.highlight }}>
          HOW CREDITS WORK
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-mist">
          <li>When the administrator records the winner of a series, its bet amount is settled automatically.</li>
          <li>
            The winner gains the bet and the loser loses it. <b className="text-bone">If the home (hosting) board wins, the bet is doubled</b> — for a ₹5,000 bet a home win is worth ₹10,000, an away win ₹5,000.
          </li>
          <li>In a trilateral or quadrilateral series, every other board pays the winner. A drawn series changes nothing.</li>
          <li>The administrator can also add or deduct credit with a reason. A balance can go below zero.</li>
        </ul>
      </details>

      <h2 className="mt-8 text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
        HISTORY
      </h2>
      {!data.entries.length ? (
        <p className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-6 text-center text-sm text-mist backdrop-blur-sm">No credits yet. They appear here once a series involving {theme.name} has a recorded winner.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/55 px-4 py-3 backdrop-blur-sm">
              <span>
                <span className="block text-sm text-bone">{e.kind === 'series' ? e.text : `Adjustment by the administrator: ${e.text}`}</span>
                <span className="text-xs text-smoke">
                  {e.series ? `${e.series} · ` : ''}
                  {stamp(e.at)}
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
