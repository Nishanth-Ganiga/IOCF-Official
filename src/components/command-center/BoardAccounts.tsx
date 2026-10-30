import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type AccountsInfo, type BoardAccount } from '../../data/commandApi';
import { themeOf } from '../../data/commandCenter/boardConfig';
import { BoardFlag } from './Mascot';

type Nav = (...parts: string[]) => void;

/** A strong password the administrator can copy; made in the browser and only ever sent when Save is pressed. */
function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Board Accounts: one row per board — set its username and password and press Save. Creates the login if the board has none.
 * Passwords are never displayed back: leave the password empty to keep the current one.
 */
export default function BoardAccounts({ focus, nav }: { focus?: string; nav: Nav }) {
  const [data, setData] = useState<AccountsInfo | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      setData(await api.accounts());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ← BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">BOARD ACCOUNTS</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist">
          Set the username and password for each board&apos;s chairman, then press Save. Leave the password empty to keep the current one. Saving a new password signs that chairman out everywhere. Passwords are never shown again, so note them before you save.
        </p>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-crimson/40 bg-ink-2 px-5 py-4 text-sm text-mist">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold text-[#c9a24b] hover:underline">
            Try again
          </button>
        </p>
      )}

      {!data ? (
        !error && <p className="mt-8 text-sm text-smoke">Loading boards…</p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-3">
          {data.boards.map((b) => (
            <li key={b.slug}>
              <Row b={b} focused={focus === b.slug} onSaved={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Row({ b, focused, onSaved }: { b: BoardAccount; focused: boolean; onSaved: () => Promise<void> }) {
  const theme = themeOf(b.slug)!;
  const [username, setUsername] = useState(b.username ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = 'w-full rounded-lg border border-white/15 bg-ink px-3 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b]';

  useEffect(() => {
    if (focused) box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focused]);
  useEffect(() => {
    setUsername(b.username ?? '');
  }, [b.username]);

  const changed = (username.trim() !== (b.username ?? '') && username.trim() !== '') || password !== '';
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.setBoardLogin(b.slug, { username: username.trim(), ...(password ? { password } : {}) });
      setPassword('');
      setShow(false);
      await onSaved();
      setMessage({ ok: true, text: r.created ? 'Login created.' : 'Saved.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' });
    }
    setBusy(false);
  };

  return (
    <div ref={box} id={`acct-${b.slug}`} className={`rounded-2xl border bg-ink-2 p-4 ${focused ? 'border-[#c9a24b]' : 'border-white/10'}`}>
      <div className="grid items-end gap-3 lg:grid-cols-[14rem_1fr_1fr_auto]">
        <div className="flex items-center gap-3">
          <BoardFlag theme={theme} className="text-3xl" />
          <div>
            <p className="font-display text-xl tracking-wide text-bone">{b.name.toUpperCase()}</p>
            <p className={`text-[11px] font-semibold tracking-[0.16em] ${b.status === 'active' ? 'text-[#6fcf8e]' : b.status === 'inactive' ? 'text-crimson-2' : 'text-smoke'}`}>{b.status === 'none' ? 'NO LOGIN YET' : b.status.toUpperCase()}</p>
          </div>
        </div>
        <label className="block text-[10px] font-semibold tracking-[0.2em] text-smoke">
          USERNAME
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. india.chairman" autoCapitalize="none" spellCheck={false} autoComplete="off" className={`${field} mt-1`} />
        </label>
        <label className="block text-[10px] font-semibold tracking-[0.2em] text-smoke">
          {b.status === 'none' ? 'PASSWORD' : 'NEW PASSWORD (EMPTY = KEEP)'}
          <span className="relative mt-1 block">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={b.status === 'none' ? 'Choose a password' : '••••••••'} autoComplete="new-password" className={`${field} pr-24`} />
            <span className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-2 text-[11px] font-semibold tracking-wider">
              <button type="button" onClick={() => { setPassword(generatePassword()); setShow(true); }} className="text-[#c9a24b] hover:underline">
                GENERATE
              </button>
              <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="text-smoke hover:text-bone">
                {show ? 'HIDE' : 'SHOW'}
              </button>
            </span>
          </span>
        </label>
        <button type="button" onClick={() => void save()} disabled={busy || !changed} className="rounded-lg bg-[#c9a24b] px-6 py-2.5 text-xs font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? 'SAVING…' : 'SAVE'}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2 min-h-[1.1rem] text-[12px] ${message ? (message.ok ? 'text-[#6fcf8e]' : 'text-crimson-2') : ''}`}>
        {message?.text}
      </p>
    </div>
  );
}
