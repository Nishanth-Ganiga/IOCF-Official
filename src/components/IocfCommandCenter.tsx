import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { api, ApiError, type CcUser, type Role } from '../data/commandApi';
import type { ProfileId } from '../data/portfolio';
import { useSmoothScroll } from '../hooks/smoothScroll';
import AdminDashboard from './command-center/AdminDashboard';
import BoardAccounts from './command-center/BoardAccounts';
import BoardView from './command-center/BoardView';
import { EASE } from './fx';
import { IocfHeader, LOGO } from './IocfHome';
import SiteFooter from './SiteFooter';

const ROUTE = '#/command-center';

const ROLES: { id: Role; title: string; blurb: string }[] = [
  { id: 'admin', title: 'Admin Login', blurb: 'Full federation control' },
  { id: 'board', title: 'Board Login', blurb: 'Individual board access' },
];

function readRoute() {
  const h = window.location.hash;
  if (!h.startsWith(ROUTE)) return [] as string[];
  return h.slice(ROUTE.length).split('/').filter(Boolean).map(decodeURIComponent);
}
function useRoute() {
  const [parts, setParts] = useState<string[]>(readRoute);
  useEffect(() => {
    const on = () => setParts(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}
const navigate = (...parts: string[]) => {
  window.location.hash = [ROUTE, ...parts].join('/');
};

/**
 * The Command Center: a locked profile. The server holds the session (an HttpOnly cookie) and decides what each account may
 * see; this component only shows the result. Login → the administrator's dashboard, or the signed-in board's own dashboard.
 */
export default function IocfCommandCenter({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const parts = useRoute();
  // undefined = still asking the server whether a session exists
  const [user, setUser] = useState<CcUser | null | undefined>(undefined);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.me().then(setUser, (e: unknown) => {
      setUser(null);
      if (e instanceof ApiError && e.status !== 401) setNotice(e.message);
    });
  }, []);
  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [parts.join('/'), user?.accountId, scrollTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* the cookie is cleared by the server; if it could not be reached the session still ends when it expires */
    }
    setUser(null);
    navigate();
  };
  const go = () => scrollTo(0, { offset: 0 });
  const links = [{ id: 'top', label: 'Command Center' }];

  let body;
  if (user === undefined) body = <p className="gutter pt-40 text-center text-sm text-smoke" aria-busy="true">Loading…</p>;
  else if (!user)
    body = (
      <Login
        notice={notice}
        onDone={(u) => {
          setUser(u);
          navigate();
        }}
      />
    );
  else if (user.role === 'admin') {
    body =
      parts[0] === 'board' && parts[1] ? (
        <BoardView slug={parts[1]} moduleId={parts[2]} user={user} nav={navigate} />
      ) : parts[0] === 'accounts' ? (
        <BoardAccounts focus={parts[1]} nav={navigate} />
      ) : (
        <AdminDashboard user={user} nav={navigate} onSignOut={signOut} />
      );
  } else {
    // a board account always lands on its own board; a link to another board is passed to the server, which refuses it
    const other = parts[0] === 'board';
    body = <BoardView slug={other ? (parts[1] ?? '') : (user.board ?? '')} moduleId={other ? parts[2] : parts[0]} user={user} nav={navigate} />;
  }

  const showBar = user && !(user.role === 'admin' && parts[0] !== 'accounts' && !(parts[0] === 'board' && parts[1]));
  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      {showBar && (
        <div className="fixed right-3 top-[4.6rem] z-[60] flex items-center gap-3 rounded-full border border-white/15 bg-black/70 py-1 pl-4 pr-1 text-[11px] text-mist backdrop-blur">
          <span>
            <span className="text-smoke">Signed in · </span>
            {user.username}
          </span>
          <button type="button" onClick={() => void signOut()} className="rounded-full border border-white/20 px-3 py-1 font-semibold tracking-[0.16em] hover:border-[#c9a24b] hover:text-[#c9a24b]">
            SIGN OUT
          </button>
        </div>
      )}
      <main className="min-h-[100svh]">
        {body}
        <SiteFooter />
      </main>
    </>
  );
}

/* ---------- login (the design is unchanged; the check now happens on the server) ---------- */

function Login({ onDone, notice }: { onDone: (u: CcUser) => void; notice: string }) {
  const [role, setRole] = useState<Role>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const user = useRef<HTMLInputElement>(null);

  // counts down while the server is refusing attempts
  const waiting = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (waiting <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [waiting]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || waiting > 0) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onDone(await api.login(role, username, password));
      return;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 && err.retryAfter) {
          setNow(Date.now());
          setUntil(Date.now() + err.retryAfter * 1000);
        } else setError(err.message);
      } else setError('Something went wrong. Please try again.');
    }
    setBusy(false);
    setPassword('');
    user.current?.focus();
  };

  const switchRole = (r: Role) => {
    setRole(r);
    setError('');
  };

  const field = 'mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-4 py-3 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b]';

  return (
    <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-4 pb-16 pt-28">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_50%_30%,rgba(201,162,75,0.10),transparent_70%)]" />
      <motion.div
        className="relative z-[2] w-full max-w-md"
        initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <div className="flex flex-col items-center text-center">
          <img src={LOGO.src} srcSet={LOGO.srcSet} sizes="96px" alt={LOGO.alt} className="h-20 w-20 object-contain drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)]" />
          <h1 className="mt-4 font-display text-4xl leading-none tracking-[0.04em] text-bone sm:text-5xl">IOCF COMMAND CENTER</h1>
          <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <rect x="5" y="11" width="14" height="9.5" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            AUTHORIZED ACCESS ONLY
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-2 p-5 sm:p-6">
          <div role="tablist" aria-label="Login type" className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                id={`tab-${r.id}`}
                aria-selected={role === r.id}
                aria-controls="login-panel"
                onClick={() => switchRole(r.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${role === r.id ? 'border-[#c9a24b] bg-[#c9a24b]/10' : 'border-white/10 hover:border-white/30'}`}
              >
                <span className={`block text-sm font-semibold ${role === r.id ? 'text-[#c9a24b]' : 'text-bone'}`}>{r.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-smoke">{r.blurb}</span>
              </button>
            ))}
          </div>

          <form id="login-panel" role="tabpanel" aria-labelledby={`tab-${role}`} onSubmit={submit} className="mt-5" noValidate>
            <label className="block text-xs font-semibold tracking-[0.18em] text-mist">
              USERNAME
              <input ref={user} type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" autoComplete="username" autoCapitalize="none" spellCheck={false} className={field} />
            </label>
            <label className="mt-4 block text-xs font-semibold tracking-[0.18em] text-mist">
              PASSWORD
              <span className="relative block">
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" className={`${field} pr-16`} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-[11px] font-semibold tracking-wider text-smoke hover:text-bone">
                  {show ? 'HIDE' : 'SHOW'}
                </button>
              </span>
            </label>

            <p role="alert" aria-live="polite" className={`mt-3 min-h-[1.25rem] text-[13px] ${error || waiting > 0 || notice ? 'text-crimson-2' : ''}`}>
              {waiting > 0 ? `Too many attempts. Try again in ${waiting} s.` : error || notice}
            </p>

            <button
              type="submit"
              disabled={busy || waiting > 0}
              className="mt-2 w-full rounded-lg bg-[#c9a24b] px-4 py-3 text-sm font-bold tracking-[0.2em] text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'SIGNING IN…' : 'SECURE SIGN IN'}
            </button>
          </form>
        </div>
      </motion.div>
    </section>
  );
}
