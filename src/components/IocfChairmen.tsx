import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Board } from '../data/boards';
import { councilGroups, councilOf, overallRank, sponsorsOf } from '../data/boardInsights';
import { announcementsFor } from '../data/chairmanContent';
import type { ProfileId } from '../data/portfolio';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { IocfHeader, LOGO } from './IocfHome';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

type Status = 'all' | 'available' | 'soon';
type BoardsModule = typeof import('../data/boards');

const FILTERS: { id: Status; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'soon', label: 'Coming Soon' },
];

const ROUTE = '#/chairmen/';

function useBoards() {
  const [mod, setMod] = useState<BoardsModule | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    import('../data/boards').then(setMod, () => setFailed(true));
  }, []);
  return { mod, failed };
}

function useSelectedSlug() {
  const read = () => (window.location.hash.startsWith(ROUTE) ? decodeURIComponent(window.location.hash.slice(ROUTE.length)) : null);
  const [slug, setSlug] = useState<string | null>(read);
  useEffect(() => {
    const on = () => setSlug(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return slug;
}

export default function IocfChairmen({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { mod, failed } = useBoards();
  const slug = useSelectedSlug();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');

  const go = (id: string) => {
    if (window.location.hash.startsWith(ROUTE)) history.replaceState(null, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    scrollTo(`#${id}`, { offset: id === 'top' ? 0 : -72 });
  };
  const links = [
    { id: 'top', label: 'Home' },
    { id: 'directory', label: 'Chairpersons' },
  ];

  const boards = mod?.boards;
  const visible = useMemo(() => {
    if (!mod) return [];
    const q = query.trim().toLowerCase();
    return mod.boards.filter((b) => {
      if (q && !b.name.toLowerCase().includes(q)) return false;
      if (status === 'available') return mod.isAvailable(b);
      if (status === 'soon') return !mod.isAvailable(b);
      return true;
    });
  }, [mod, query, status]);

  const selected = mod && slug ? mod.boards.find((b) => mod.boardSlug(b) === slug) : undefined;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (window.location.hash = '');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const overview = [
    { title: `${boards ? boards.length : '—'} BOARD CHAIRPERSONS`, text: 'Representing IOCF boards worldwide.' },
    { title: 'GLOBAL LEADERSHIP', text: 'One directory connecting all participating boards.' },
    { title: 'CONTRIBUTIONS & ACHIEVEMENTS', text: 'Dedicated profiles highlighting leadership impact.' },
  ];

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      <main>
        <section id="top" className="relative flex items-center overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_45%,rgba(107,18,41,0.35),transparent_70%)]" />
          <div className="gutter relative z-[2] grid w-full items-center gap-8 pb-10 pt-24 lg:grid-cols-[1.15fr_1fr] lg:pt-28">
            <motion.div variants={container} initial="hidden" animate="show" className="order-2 lg:order-1">
              <motion.p variants={item} className="font-sans text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b] sm:text-xs">
                INTERNATIONAL ONLINE CRICKET FEDERATION
              </motion.p>
              <motion.h1 variants={item} className="mt-3 font-display leading-[0.9] tracking-[0.02em] text-bone" style={{ fontSize: 'clamp(2.8rem, 7vw, 6rem)' }}>
                IOCF BOARD CHAIRPERSONS
              </motion.h1>
              <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
                LEADERSHIP • GOVERNANCE • GLOBAL CRICKET
              </motion.p>
              <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
                Meet the leaders representing IOCF&apos;s international boards. Explore their leadership profiles, contributions and vision for the future of online cricket.
              </motion.p>
            </motion.div>
            <motion.div
              className="order-1 mx-auto aspect-square w-[min(52vw,20rem)] lg:order-2 lg:w-full lg:max-w-[24rem]"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, ease: EASE }}
            >
              <img src={LOGO.src} srcSet={LOGO.srcSet} sizes="(max-width: 1024px) 52vw, 24rem" alt={LOGO.alt} className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
            </motion.div>
          </div>
        </section>

        <section aria-label="Leadership overview" className="gutter pb-4">
          <ul className="grid gap-3 sm:grid-cols-3">
            {overview.map((o) => (
              <li key={o.title} className="rounded-xl border border-white/10 bg-ink-2 px-5 py-4">
                <p className="text-[11px] font-semibold tracking-[0.22em] text-[#c9a24b]">{o.title}</p>
                <p className="mt-1.5 text-sm leading-snug text-mist">{o.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="directory" aria-label="Board chairpersons" className="gutter py-10 sm:py-14">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards by name"
              aria-label="Search boards by name"
              className="w-full rounded-lg border border-white/15 bg-ink-2 px-4 py-2.5 text-sm text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b] sm:max-w-sm"
            />
            <div role="group" aria-label="Filter by profile status" className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={status === f.id}
                  onClick={() => setStatus(f.id)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition ${
                    status === f.id ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {boards && (
            <p role="status" aria-live="polite" className="mb-4 text-xs text-smoke">
              Showing {visible.length} of {boards.length} boards
            </p>
          )}

          {failed ? (
            <p role="alert" className="rounded-xl border border-crimson/40 bg-ink-2 px-5 py-8 text-center text-sm text-mist">
              The board directory could not be loaded. Please refresh the page to try again.
            </p>
          ) : !mod ? (
            <ul aria-busy="true" aria-label="Loading boards" className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="h-72 animate-pulse rounded-2xl border border-white/5 bg-ink-2" />
              ))}
            </ul>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
              <p className="text-sm text-bone">No boards match your search.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                }}
                className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline"
              >
                CLEAR SEARCH &amp; FILTERS
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((b) => (
                <BoardCard key={b.name} board={b} mod={mod} />
              ))}
            </ul>
          )}
        </section>

        <footer className="gutter border-t border-white/5 py-10 text-center text-xs text-smoke">One Federation. Four Roles. One Cricketing Vision.</footer>
      </main>

      <AnimatePresence>{selected && mod && <BoardDetail key={selected.name} board={selected} mod={mod} />}</AnimatePresence>
    </>
  );
}

export function Flag({ board, className = 'text-3xl' }: { board: Board; className?: string }) {
  return board.flag ? (
    <span role="img" aria-label={`${board.name} flag`} className={`leading-none ${className}`}>
      {board.flag}
    </span>
  ) : (
    <span aria-label={`${board.name} board badge`} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6b1229] text-[10px] font-bold tracking-wider text-[#c9a24b]">
      WI
    </span>
  );
}

function Portrait({ board, size }: { board: Board; size: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-ink-3 ${size}`}>
      {board.portrait ? (
        <img src={board.portrait} alt={`${board.chairman ?? board.name} portrait`} className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="#6d6c75" strokeWidth="1.2" strokeLinecap="round" className="h-1/2 w-1/2" aria-hidden>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
        </svg>
      )}
    </div>
  );
}

/** Contributions list, or the COMING SOON placeholder when nothing has been added. Grows with content. */
function Contributions({ board, limit }: { board: Board; limit?: number }) {
  const all = board.achievements ?? [];
  const shown = limit ? all.slice(0, limit) : all;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">CONTRIBUTIONS &amp; ACHIEVEMENTS</p>
        {all.length === 0 && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] text-smoke">COMING SOON</span>}
      </div>
      {all.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-mist">
          This section will highlight the chairman&apos;s contributions to their national board, player development, tournament participation and the growth of IOCF.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {shown.map((a, i) => (
              <li key={`${a.title}-${i}`} className="border-l border-[#c9a24b]/40 pl-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-semibold text-bone">{a.title}</p>
                  {a.date && <p className="text-[11px] text-smoke">{a.date}</p>}
                </div>
                {(a.description ?? a.detail) && <p className="mt-1 text-[13px] leading-relaxed text-mist">{a.description ?? a.detail}</p>}
                {a.image && <img src={a.image} alt="" loading="lazy" className="mt-2 max-h-48 w-full rounded-lg object-cover" />}
              </li>
            ))}
          </ul>
          {limit && all.length > limit && <p className="mt-2 text-[11px] text-smoke">+ {all.length - limit} more in full profile</p>}
        </>
      )}
    </div>
  );
}

/** Board-level statistics from the IOCF workbook: CEO, sponsors, credits, council and format rankings. */
function BoardStats({ board, compact }: { board: Board; compact?: boolean }) {
  const facts = [
    ...(board.ceo ? [{ label: 'CEO', value: board.ceo }] : []),
    ...(board.facts ?? []),
  ];
  const rankings = board.rankings ?? [];
  if (facts.length === 0 && rankings.length === 0 && !board.sponsors?.length) return null;
  const shownRankings = compact ? rankings.filter((r) => r.format === 'Overall') : rankings;
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">BOARD STATISTICS</p>
      <dl className={`mt-2 grid gap-x-4 gap-y-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-[10px] text-smoke">{f.label}</dt>
            <dd className="text-[13px] font-semibold text-bone">{f.value}</dd>
          </div>
        ))}
        {shownRankings.map((r) => (
          <div key={r.format}>
            <dt className="text-[10px] text-smoke">{r.format} ranking</dt>
            <dd className="text-[13px] font-semibold text-bone">
              #{r.rank} <span className="font-normal text-smoke">· {r.points} pts</span>
            </dd>
          </div>
        ))}
      </dl>
      {!compact && board.sponsors && board.sponsors.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px] text-mist">
          {board.sponsors.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The council this board sits in, and its fellow members. */
function CouncilPanel({ board, mod }: { board: Board; mod: BoardsModule }) {
  const groups = useMemo(() => councilGroups(mod.boards), [mod]);
  const name = councilOf(board, groups);
  const members = (groups.find((g) => g.name === name)?.members ?? [])
    .map((n) => mod.boards.find((b) => b.name === n))
    .filter((b): b is Board => !!b)
    .sort((a, b) => (overallRank(a) ?? 999) - (overallRank(b) ?? 999));
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">COUNCIL</p>
      {name ? (
        <>
          <p className="mt-2 text-sm font-semibold text-bone">{name}</p>
          <ul className="mt-3 space-y-1.5">
            {members.map((m) => (
              <li key={m.name}>
                <button
                  type="button"
                  disabled={m.name === board.name}
                  onClick={() => {
                    window.location.hash = `${ROUTE}${mod.boardSlug(m)}`;
                  }}
                  className="flex w-full items-center gap-2 text-left text-[13px] text-mist enabled:hover:text-bone"
                >
                  <Flag board={m} className="text-base" />
                  <span className={m.name === board.name ? 'font-semibold text-[#c9a24b]' : ''}>{m.name}</span>
                  {overallRank(m) !== undefined && <span className="ml-auto text-[11px] text-smoke">#{overallRank(m)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-smoke">This board has not been placed in a council yet.</p>
      )}
    </div>
  );
}

function SponsorPanel({ board }: { board: Board }) {
  const sponsors = sponsorsOf(board);
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">SPONSORS</p>
      {sponsors.length ? (
        <ul className="mt-3 space-y-2.5">
          {sponsors.map((s) => (
            <li key={s.role + s.name} className="border-l border-[#c9a24b]/40 pl-3">
              <p className="text-[11px] text-smoke">{s.role}</p>
              <p className="text-sm font-semibold text-bone">{s.name}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-smoke">No sponsors announced yet.</p>
      )}
    </div>
  );
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Governance announcements for this board, plus federation-wide ones. */
function Announcements({ board, mod }: { board: Board; mod: BoardsModule }) {
  const items = announcementsFor(mod.boardSlug(board));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">GOVERNANCE ANNOUNCEMENTS</p>
        {items.length === 0 && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] text-smoke">NONE YET</span>}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-smoke">Council decisions and board updates will be posted here.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {items.map((a) => (
            <li key={a.id} className="border-l border-[#c9a24b]/40 pl-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-semibold text-bone">{a.title}</p>
                <p className="text-[11px] text-smoke">
                  {fmtDate(a.date)}
                  {!a.board && ' · Federation-wide'}
                </p>
              </div>
              {a.body && <p className="mt-1 text-[13px] leading-relaxed text-mist">{a.body}</p>}
              {a.link && (
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
                  READ MORE →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BoardCard({ board, mod }: { board: Board; mod: BoardsModule }) {
  const available = mod.isAvailable(board);
  const open = () => {
    window.location.hash = `${ROUTE}${mod.boardSlug(board)}`;
  };
  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: EASE }}
      className="flex flex-col rounded-2xl border border-white/10 bg-ink-2 p-5 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-wide text-bone">{board.name.toUpperCase()}</h2>
        <Flag board={board} />
      </header>

      <div className="mt-4 flex items-center gap-4">
        <Portrait board={board} size="h-20 w-20" />
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${board.chairman ? 'text-bone' : 'text-mist'}`}>{board.chairman ?? 'Chairman details coming soon'}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c9a24b]">Board Chairman</p>
        </div>
      </div>

      <div className="mt-5 space-y-4 border-t border-white/5 pt-4">
        <BoardStats board={board} compact />
        <Contributions board={board} limit={2} />
        <div>
          <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">VISION / MESSAGE</p>
          <p className="mt-1.5 text-[13px] italic leading-relaxed text-mist">{board.vision ?? 'Message will be shared soon.'}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={open}
        aria-label={`${available ? 'View profile' : 'Details (coming soon)'}: ${board.name}`}
        className={`mt-5 rounded-md border px-4 py-2.5 text-center text-xs font-semibold tracking-[0.2em] transition ${
          available ? 'border-[#c9a24b]/60 text-[#c9a24b] hover:bg-[#c9a24b] hover:text-ink' : 'border-white/10 text-smoke hover:border-white/30 hover:text-mist'
        }`}
      >
        {available ? 'VIEW PROFILE' : 'COMING SOON'}
      </button>
    </motion.li>
  );
}

function BoardDetail({ board, mod }: { board: Board; mod: BoardsModule }) {
  const available = mod.isAvailable(board);
  const close = () => {
    window.location.hash = '';
  };
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${board.name} board chairman`}
      className="fixed inset-0 z-[90] overflow-y-auto bg-ink"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(107,18,41,0.4),transparent_75%)]" />
      <div className="relative mx-auto max-w-3xl px-5 pb-20 pt-24 sm:px-8">
        <button type="button" onClick={close} autoFocus className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
          ← BACK TO DIRECTORY
        </button>

        <header className="mt-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">IOCF BOARD</p>
            <h1 className="mt-1 font-display text-[clamp(2.4rem,7vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{board.name.toUpperCase()}</h1>
          </div>
          <Flag board={board} className="text-5xl" />
        </header>

        <div className="mt-8 flex items-center gap-5 rounded-2xl border border-white/10 bg-ink-2 p-5">
          <Portrait board={board} size="h-28 w-28" />
          <div className="min-w-0">
            <p className={`text-lg font-semibold ${board.chairman ? 'text-bone' : 'text-mist'}`}>{board.chairman ?? 'Chairman details coming soon'}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c9a24b]">Board Chairman</p>
            {!available && <p className="mt-2 text-xs text-smoke">This profile has not been published yet.</p>}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-ink-2 p-5">
          <BoardStats board={board} />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-ink-2 p-5">
            <CouncilPanel board={board} mod={mod} />
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-2 p-5">
            <SponsorPanel board={board} />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-ink-2 p-5">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-smoke">VISION / MESSAGE</p>
          {board.vision ? (
            <p className="mt-2 border-l border-[#c9a24b]/40 pl-3 text-sm italic leading-relaxed text-mist">“{board.vision}”</p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-smoke">
              <span className="mr-2 rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em]">COMING SOON</span>
              {board.chairman ? `${board.chairman} has not shared a message yet.` : 'The chairman has not shared a message yet.'}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-ink-2 p-5">
          <Announcements board={board} mod={mod} />
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-ink-2 p-5">
          <Contributions board={board} />
        </div>
      </div>
    </motion.div>
  );
}
