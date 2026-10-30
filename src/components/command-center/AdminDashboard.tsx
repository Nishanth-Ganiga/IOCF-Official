import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AccountsInfo, type BoardAccount, type CcUser, type Overview } from '../../data/commandApi';
import { MODULES, themeOf } from '../../data/commandCenter/boardConfig';
import { store } from '../../data/store';
import { BoardFlag } from './Mascot';

type Nav = (...parts: string[]) => void;
type Filter = 'all' | 'active' | 'inactive' | 'none';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmt = (n: number) => n.toLocaleString('en-US');

/** The Master Administrator's dashboard: the whole federation at a glance, and control of every board account. */
export default function AdminDashboard({ user, nav, onSignOut }: { user: CcUser; nav: Nav; onSignOut: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');
  const [guide, setGuide] = useState<{ title: string; command: string; note: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([api.overview(), api.accounts()]);
      setOverview(o);
      setAccounts(a);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setFlash('');
    try {
      await action();
      await load();
      setFlash(done);
    } catch (e) {
      setFlash(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
    setBusy('');
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (accounts?.boards ?? []).filter((b) => (filter === 'all' || b.status === filter) && (!q || b.name.toLowerCase().includes(q) || b.username?.includes(q) || b.chairmanName?.toLowerCase().includes(q)));
  }, [accounts, filter, query]);

  const card = 'rounded-2xl border border-white/10 bg-ink-2';

  return (
    <div className="gutter pb-20 pt-28">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1 bg-gradient-to-r from-[#8a6d2b] via-[#c9a24b] to-[#8a6d2b]" aria-hidden />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR · FULL FEDERATION CONTROL</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">COMMAND CENTER</h1>
          <p className="mt-3 text-sm text-mist">
            Signed in as <span className="font-semibold text-bone">{user.username}</span>
          </p>
        </div>
        <button type="button" onClick={onSignOut} className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold tracking-[0.2em] text-mist transition hover:border-[#c9a24b] hover:text-[#c9a24b]">
          SIGN OUT
        </button>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-crimson/40 bg-ink-2 px-5 py-4 text-sm text-mist">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold text-[#c9a24b] hover:underline">
            Try again
          </button>
        </p>
      )}

      {/* overview */}
      <section aria-label="Overview" className="mt-8">
        <h2 className="mb-3 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">OVERVIEW</h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[
            ['Total boards', overview?.totalBoards],
            ['Total accounts', overview?.totalAccounts],
            ['Active board accounts', overview?.activeBoardAccounts],
            ['Inactive board accounts', overview?.inactiveBoardAccounts],
            ['Available modules', overview?.availableModules],
          ].map(([label, value]) => (
            <div key={label as string} className={`${card} px-4 py-4`}>
              <dt className="text-[10px] font-semibold tracking-[0.2em] text-smoke">{(label as string).toUpperCase()}</dt>
              <dd className="mt-1 font-display text-4xl text-bone">{value === undefined ? '—' : fmt(value as number)}</dd>
            </div>
          ))}
        </dl>
        {overview && overview.boardsWithoutAccount > 0 && (
          <p className="mt-3 text-xs text-smoke">
            {overview.boardsWithoutAccount} board{overview.boardsWithoutAccount === 1 ? ' has' : 's have'} no account yet. Create them from your computer — see “Create” on the board.
          </p>
        )}

        <div className={`${card} mt-3 p-5`}>
          <h3 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">RECENT ACCOUNT ACTIVITY</h3>
          {!overview ? (
            <p className="mt-3 text-sm text-smoke">Loading…</p>
          ) : overview.recentActivity.length === 0 ? (
            <p className="mt-3 text-sm text-smoke">No activity yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {overview.recentActivity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <span className="text-bone">
                    {a.label}
                    {a.actor && <span className="text-mist"> · {a.actor}</span>}
                    {a.target && <span className="text-smoke"> · {a.target}</span>}
                  </span>
                  <span className="text-[11px] text-smoke">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* board management */}
      <section aria-label="Board management" className="mt-10">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">BOARD MANAGEMENT ({rows.length})</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search boards" aria-label="Search boards" className="w-full rounded-lg border border-white/15 bg-ink-2 px-4 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:w-64" />
            <div role="group" aria-label="Filter by account status" className="flex flex-wrap gap-2">
              {(['all', 'active', 'inactive', 'none'] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition ${filter === f ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`}>
                  {f === 'none' ? 'No account' : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p role="status" aria-live="polite" className="mb-3 min-h-[1.25rem] text-xs text-[#c9a24b]">
          {flash}
        </p>

        {!accounts ? (
          <p className="text-sm text-smoke">Loading boards…</p>
        ) : rows.length === 0 ? (
          <p className={`${card} px-5 py-10 text-center text-sm text-mist`}>No boards match.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {rows.map((b) => (
              <li key={b.slug}>
                <BoardCard b={b} busy={busy} nav={nav} onStatus={(s) => run(`s-${b.slug}`, () => api.setStatus(b.accountId!, s), `${b.name} account ${s === 'active' ? 'activated' : 'deactivated'}.`)} onChairman={(name) => run(`c-${b.slug}`, () => api.setChairman(b.accountId!, name), `${b.name} chairman updated.`)} onModule={(id, on) => run(`m-${b.slug}-${id}`, () => api.setModule(b.slug, id, on), `${b.name} modules updated.`)} onGuide={setGuide} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-xs leading-relaxed text-smoke">
        Passwords are never shown here. Usernames and passwords are created and reset from your own computer with the private credential tool, which also keeps the encrypted credential register up to date.
      </p>

      {guide && (
        <div role="dialog" aria-modal="true" aria-label={guide.title} className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4" onClick={() => setGuide(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-[#c9a24b]/50 bg-ink-2 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl tracking-wide text-bone">{guide.title.toUpperCase()}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">{guide.note}</p>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-ink px-4 py-3 text-[13px] text-[#c9a24b]">{guide.command}</pre>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => void navigator.clipboard?.writeText(guide.command)} className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-mist hover:border-[#c9a24b] hover:text-[#c9a24b]">
                COPY COMMAND
              </button>
              <button type="button" autoFocus onClick={() => setGuide(null)} className="rounded-full bg-[#c9a24b] px-5 py-2 text-xs font-bold tracking-[0.2em] text-ink">
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function BoardCard({ b, busy, nav, onStatus, onChairman, onModule, onGuide }: { b: BoardAccount; busy: string; nav: Nav; onStatus: (s: 'active' | 'inactive') => void; onChairman: (name: string) => void; onModule: (id: string, on: boolean) => void; onGuide: (g: { title: string; command: string; note: string }) => void }) {
  const theme = themeOf(b.slug)!;
  const [editing, setEditing] = useState(false);
  const [mods, setMods] = useState(false);
  const fromSite = store.boards.find((x) => x.name === b.name)?.chairman ?? null;
  const [draft, setDraft] = useState(b.chairmanName ?? fromSite ?? '');
  const chairman = b.chairmanName ?? fromSite;
  const none = b.status === 'none';
  const btn = 'rounded-full border border-white/20 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-mist transition hover:border-[#c9a24b] hover:text-[#c9a24b] disabled:opacity-40';

  return (
    <article className="flex h-full flex-col rounded-2xl border bg-ink-2 p-4" style={{ borderColor: `${theme.colors.secondary}40` }}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <BoardFlag theme={theme} className="text-4xl" />
          <div>
            <h3 className="font-display text-xl tracking-wide text-bone">{b.name.toUpperCase()}</h3>
            <p className="text-xs text-smoke">{b.accountId ?? 'No account'}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em] ${b.status === 'active' ? 'border-[#4ea66b]/60 text-[#6fcf8e]' : b.status === 'inactive' ? 'border-crimson/60 text-crimson-2' : 'border-white/20 text-smoke'}`}>
          {b.status === 'none' ? 'NO ACCOUNT' : b.status.toUpperCase()}
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-[10px] font-semibold tracking-[0.2em] text-smoke">CHAIRMAN</dt>
          <dd className="mt-0.5 text-bone">
            {editing ? (
              <span className="flex gap-2">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} aria-label={`${b.name} chairman name`} className="min-w-0 flex-1 rounded-md border border-white/20 bg-ink px-3 py-1.5 text-sm text-bone outline-none focus:border-[#c9a24b]" />
                <button type="button" disabled={busy.startsWith('c-')} onClick={() => { onChairman(draft); setEditing(false); }} className={btn}>
                  SAVE
                </button>
                <button type="button" onClick={() => setEditing(false)} className={btn}>
                  CANCEL
                </button>
              </span>
            ) : (
              chairman ?? <span className="text-smoke">Not recorded</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.2em] text-smoke">USERNAME</dt>
          <dd className="mt-0.5 break-all text-mist">{b.username ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold tracking-[0.2em] text-smoke">LAST SIGN-IN</dt>
          <dd className="mt-0.5 text-mist">{when(b.lastLoginAt)}</dd>
        </div>
      </dl>

      {mods && !none && (
        <ul className="mt-3 space-y-1.5 rounded-lg bg-ink px-3 py-2.5">
          {MODULES.filter((m) => m.status === 'active').map((m) => {
            const on = b.modules.find((x) => x.id === m.id)?.enabled ?? true;
            return (
              <li key={m.id}>
                <label className="flex items-center justify-between gap-3 text-sm text-mist">
                  {m.title}
                  <input type="checkbox" checked={on} disabled={busy === `m-${b.slug}-${m.id}`} onChange={(e) => onModule(m.id, e.target.checked)} className="h-4 w-4 accent-[#c9a24b]" />
                </label>
              </li>
            );
          })}
          <li className="pt-1 text-[11px] text-smoke">More modules appear here as they are released.</li>
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => nav('board', b.slug)} className="rounded-full bg-[#c9a24b] px-4 py-1.5 text-[11px] font-bold tracking-[0.16em] text-ink">
          OPEN DASHBOARD
        </button>
        {none ? (
          <button type="button" onClick={() => onGuide({ title: `Create ${b.name} account`, note: `The ${b.name} chairman account is created from your computer, so its password goes straight into your private encrypted register and is never shown on a web page. This also creates any other missing accounts.`, command: 'npm run cc -- setup' })} className={btn}>
            CREATE
          </button>
        ) : (
          <>
            <button type="button" disabled={busy === `s-${b.slug}`} onClick={() => onStatus(b.status === 'active' ? 'inactive' : 'active')} className={btn}>
              {b.status === 'active' ? 'DEACTIVATE' : 'ACTIVATE'}
            </button>
            <button type="button" onClick={() => { setDraft(chairman ?? ''); setEditing(true); }} className={btn}>
              EDIT CHAIRMAN
            </button>
            <button type="button" aria-expanded={mods} onClick={() => setMods((v) => !v)} className={btn}>
              MODULES
            </button>
            <button type="button" onClick={() => onGuide({ title: `Reset ${b.name} credentials`, note: `Run this on your own computer. It creates a new password (and, with --username, a new username), signs the chairman out everywhere, and updates your encrypted register. The new password is shown only on your terminal.`, command: `npm run cc -- reset ${b.slug}` })} className={btn}>
              RESET LOGIN
            </button>
          </>
        )}
      </div>
    </article>
  );
}
