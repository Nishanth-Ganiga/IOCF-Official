import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../data/commandApi';
import { COUNCILS, inr, requestStatusLabel } from '../../data/commandCenter/psp.mjs';

export const GOLD = '#c9a24b';
export const NAVY = '#14213d';
export const councilColor = (id: string) => COUNCILS.find((c) => c.id === id)?.color ?? GOLD;
export const councilShort = (id: string) => COUNCILS.find((c) => c.id === id)?.short ?? id;

/** Whole credits as Indian-style digits: 1200000 → "12,00,000". */
export const cr = (n: number | null | undefined) => (n === null || n === undefined ? '—' : inr(n));
export const stamp = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST' : '—');
export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
export const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Loads something and reloads on demand; shows nothing until it is there. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const run = useCallback(async () => {
    try {
      setData(await load());
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null);
    void run();
  }, [run]);
  return { data, error, reload: run, setData };
}

const TONES: Record<string, string> = {
  not_started: '#8a8a95', active: '#2f9e6b', submission_open: '#2f9e6b', under_review: '#d99a2b', approved: '#3b7dd8', completed: '#3b7dd8', closed: '#8a8a95',
  draft: '#8a8a95', submitted: '#d99a2b', rejected: '#d9534f', credited: '#2f9e6b', not_submitted: '#8a8a95',
};
/** A coloured status pill. */
export function Badge({ status, label }: { status: string; label?: string }) {
  const c = TONES[status] ?? GOLD;
  return (
    <span className="inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em]" style={{ borderColor: c, color: c, background: `${c}1f` }}>
      {(label ?? requestStatusLabel(status)).toUpperCase()}
    </span>
  );
}

export function CouncilTag({ id }: { id: string }) {
  const c = councilColor(id);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em]" style={{ borderColor: c, color: '#f4f2ee', background: `${c}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {councilShort(id).toUpperCase()}
    </span>
  );
}

export function Panel({ title, right, children, accent }: { title?: string; right?: ReactNode; children: ReactNode; accent?: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-ink-2 p-5" style={accent ? { borderTop: `3px solid ${accent}` } : undefined}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: accent ?? GOLD }}>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok' | 'warn'; children: ReactNode }) {
  const c = { info: GOLD, error: '#d9534f', ok: '#2f9e6b', warn: '#d99a2b' }[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className="rounded-xl border px-4 py-3 text-sm text-bone" style={{ borderColor: `${c}88`, background: `${c}14` }}>
      {children}
    </p>
  );
}

export const btn = 'rounded-lg px-5 py-2.5 text-xs font-bold tracking-[0.18em] transition hover:brightness-110 disabled:opacity-50';
export const btnGold = { background: GOLD, color: '#0b0b0f' };
export const btnGhost = 'rounded-lg border border-white/25 px-5 py-2.5 text-xs font-bold tracking-[0.18em] text-bone transition hover:border-white/60 disabled:opacity-50';
export const field = 'w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none focus:border-[#c9a24b] disabled:opacity-60';
export const th = 'px-3 py-2 text-left text-[10px] font-semibold tracking-[0.14em] text-smoke';
export const td = 'px-3 py-2.5 text-sm text-bone';

/** A stat tile. */
export function Tile({ label, value, sub, color }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink-2 px-4 py-4" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <p className="text-[10px] font-semibold tracking-[0.2em] text-smoke">{label.toUpperCase()}</p>
      <p className="mt-1 font-display text-3xl leading-tight text-bone">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-mist">{sub}</p>}
    </div>
  );
}

/** A small confirm box: asks, then runs. */
export function Confirm({ text, yes, onYes, onNo, busy, danger }: { text: string; yes: string; onYes: () => void; onNo: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <div role="alertdialog" aria-label={text} className="mt-3 rounded-xl border px-4 py-3" style={{ borderColor: danger ? '#d9534f99' : `${GOLD}99`, background: 'rgba(0,0,0,0.35)' }}>
      <p className="text-sm text-bone">{text}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={onYes} className={btn} style={danger ? { background: '#d9534f', color: '#fff' } : btnGold}>{busy ? 'WORKING…' : yes}</button>
        <button type="button" onClick={onNo} className="text-xs font-semibold tracking-[0.16em] text-mist hover:text-bone">CANCEL</button>
      </div>
    </div>
  );
}
