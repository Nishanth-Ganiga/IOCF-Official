import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { currentSession, signIn, signOut, type Role, type Session } from '../data/access';
import type { ProfileId } from '../data/portfolio';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { IocfHeader, LOGO } from './IocfHome';
import SiteFooter from './SiteFooter';

const MAX_TRIES = 5;
const LOCK_SECONDS = 30;
const LOCK_KEY = 'iocf-command-center-lock';

const ROLES: { id: Role; title: string; blurb: string }[] = [
  { id: 'admin', title: 'Admin Login', blurb: 'Full federation control' },
  { id: 'board', title: 'Board Login', blurb: 'Individual board access' },
];

/** The Command Center: a locked profile. A login screen first; what opens behind it is added section by section. */
export default function IocfCommandCenter({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const [session, setSession] = useState<Session | null>(currentSession);
  const go = () => scrollTo(0, { offset: 0 });
  const links = [{ id: 'top', label: 'Command Center' }];

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      <main className="min-h-[100svh]">
        {session ? (
          <Dashboard
            session={session}
            onSignOut={() => {
              signOut();
              setSession(null);
            }}
          />
        ) : (
          <Login onDone={setSession} />
        )}
        <SiteFooter />
      </main>
    </>
  );
}

/* ---------- login ---------- */

function readLock(): { fails: number; until: number } {
  try {
    return JSON.parse(sessionStorage.getItem(LOCK_KEY) ?? '') as { fails: number; until: number };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function Login({ onDone }: { onDone: (s: Session) => void }) {
  const [role, setRole] = useState<Role>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const lock = useRef(readLock());
  const user = useRef<HTMLInputElement>(null);

  // counts down a temporary lock-out after too many wrong attempts
  const waiting = Math.max(0, Math.ceil((lock.current.until - now) / 1000));
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
    let session: Session | null = null;
    try {
      session = await signIn(role, username, password);
    } catch {
      setError('Sign-in is not available in this browser. Please use a current browser over a secure (https) connection.');
      setBusy(false);
      return;
    }
    setBusy(false);
    if (session) {
      lock.current = { fails: 0, until: 0 };
      try {
        sessionStorage.removeItem(LOCK_KEY);
      } catch {
        /* nothing to clear */
      }
      onDone(session);
      return;
    }
    const fails = lock.current.fails + 1;
    lock.current = fails >= MAX_TRIES ? { fails: 0, until: Date.now() + LOCK_SECONDS * 1000 } : { fails, until: 0 };
    try {
      sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock.current));
    } catch {
      /* the counter just resets on reload */
    }
    setNow(Date.now());
    setPassword('');
    setError(fails >= MAX_TRIES ? `Too many attempts. Try again in ${LOCK_SECONDS} seconds.` : 'Incorrect username or password.');
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

            <p role="alert" aria-live="polite" className={`mt-3 min-h-[1.25rem] text-[13px] ${error || waiting > 0 ? 'text-crimson-2' : ''}`}>
              {waiting > 0 ? `Too many attempts. Try again in ${waiting} s.` : error}
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

/* ---------- after sign-in ---------- */

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const admin = session.role === 'admin';
  return (
    <div className="gutter pb-16 pt-28">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">{admin ? 'ADMIN · FULL FEDERATION CONTROL' : `BOARD ACCESS · ${(session.board ?? 'BOARD').toUpperCase()}`}</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">COMMAND CENTER</h1>
          <p className="mt-3 text-sm text-mist">
            Signed in as <span className="font-semibold text-bone">{session.username}</span>
          </p>
        </div>
        <button type="button" onClick={onSignOut} className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold tracking-[0.2em] text-mist transition hover:border-[#c9a24b] hover:text-[#c9a24b]">
          SIGN OUT
        </button>
      </header>

      <div className="mt-8 rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
        <p className="text-sm text-bone">You are signed in. Nothing has been added to the Command Center yet.</p>
        <p className="mt-1 text-xs text-smoke">New sections will appear here.</p>
      </div>
    </div>
  );
}
