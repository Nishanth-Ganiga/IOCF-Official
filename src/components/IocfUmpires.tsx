import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Board } from '../data/boards';
import type { ProfileId } from '../data/portfolio';
import type { Umpire } from '../data/umpires';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { EASE } from './fx';
import { Flag } from './IocfChairmen';
import { IocfHeader, LOGO } from './IocfHome';
import { Avatar, BackButton, Breadcrumb, Card, EntryList, Fact, Loading, MISSING, Notice, StatGrid, searchInput } from './IocfPlayers';

type BoardsModule = typeof import('../data/boards');
type UmpiresModule = typeof import('../data/umpires');

const ROUTE = '#/umpires';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

/** Routes: `#/umpires`, `#/umpires/board/<boardId>`, `#/umpires/u/<umpireId>`. */
type Route = { kind: 'home' } | { kind: 'board'; id: string } | { kind: 'umpire'; id: string };

function readRoute(): Route {
  const h = window.location.hash;
  if (!h.startsWith(ROUTE)) return { kind: 'home' };
  const [kind, id] = h.slice(ROUTE.length).split('/').filter(Boolean).map(decodeURIComponent);
  if (kind === 'board' && id) return { kind: 'board', id };
  if (kind === 'u' && id) return { kind: 'umpire', id };
  return { kind: 'home' };
}

function useRoute() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Counts in-app navigations so "back" can use real history when there is some, and a fallback otherwise. */
let inAppNavs = 0;
const navigate = (...parts: string[]) => {
  inAppNavs += 1;
  window.location.hash = [ROUTE, ...parts].join('/');
};
const goBack = (fallback: () => void) => {
  if (inAppNavs > 0) {
    inAppNavs -= 1;
    history.back();
  } else fallback();
};

function useData() {
  const [data, setData] = useState<{ b: BoardsModule; u: UmpiresModule; umpires: Umpire[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/umpires')])
      .then(async ([b, u]) => setData({ b, u, umpires: await u.loadUmpires() }))
      .catch(() => setFailed(true));
  }, []);
  return { data, failed };
}
type Data = NonNullable<ReturnType<typeof useData>['data']>;

export default function IocfUmpires({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const route = useRoute();
  const routeKey = route.kind === 'home' ? 'home' : `${route.kind}:${route.id}`;

  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [routeKey, scrollTo]);

  const go = (id: string) => {
    const scroll = () => scrollTo(id === 'top' ? 0 : `#${id}`, { offset: id === 'top' ? 0 : -72 });
    if (route.kind !== 'home') {
      navigate();
      window.setTimeout(scroll, 150);
    } else scroll();
  };
  const links = [
    { id: 'top', label: 'Home' },
    { id: 'rankings', label: 'Top 30' },
    { id: 'boards', label: 'Boards' },
  ];

  let body;
  if (failed) body = <Notice tone="error">The Umpire Centre could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (route.kind === 'home') body = <Home data={data} />;
  else if (route.kind === 'board') {
    const board = data.b.boards.find((b) => data.b.boardSlug(b) === route.id);
    body = board ? <BoardList board={board} data={data} /> : <NotFound what="board" />;
  } else {
    const umpire = data.umpires.find((u) => u.id === route.id);
    body = umpire ? <Profile umpire={umpire} data={data} /> : <NotFound what="umpire" />;
  }

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      <main className="min-h-[100svh]">
        {body}
        <footer className="gutter border-t border-white/5 py-10 text-center text-xs text-smoke">One Federation. Four Roles. One Cricketing Vision.</footer>
      </main>
    </>
  );
}

function NotFound({ what }: { what: string }) {
  return (
    <div className="gutter pt-32 text-center">
      <p className="text-sm text-mist">That {what} could not be found.</p>
      <button type="button" onClick={() => navigate()} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
        BACK TO UMPIRE CENTRE
      </button>
    </div>
  );
}

const val = (v: string | number | undefined) => (v === undefined ? MISSING : v);

/* ---------- home: hero + Top 30 + boards ---------- */

function Home({ data }: { data: Data }) {
  return (
    <>
      <section id="top" className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_45%,rgba(107,18,41,0.35),transparent_70%)]" />
        <div className="gutter relative z-[2] grid w-full items-center gap-8 pb-10 pt-24 lg:grid-cols-[1.15fr_1fr] lg:pt-28">
          <motion.div variants={container} initial="hidden" animate="show" className="order-2 lg:order-1">
            <motion.p variants={item} className="font-sans text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b] sm:text-xs">
              INTERNATIONAL ONLINE CRICKET FEDERATION
            </motion.p>
            <motion.h1 variants={item} className="mt-3 font-display leading-[0.9] tracking-[0.02em] text-bone" style={{ fontSize: 'clamp(2.8rem, 7vw, 6rem)' }}>
              IOCF UMPIRE CENTRE
            </motion.h1>
            <motion.p variants={item} className="mt-4 font-sans text-xs font-bold tracking-[0.3em] text-bone sm:text-sm">
              INTEGRITY • PRECISION • FAIR PLAY
            </motion.p>
            <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
              Meet the officials who uphold the spirit of cricket across IOCF. Explore umpire rankings, board representatives, officiating records and individual career statistics.
            </motion.p>
          </motion.div>
          <motion.div
            className="order-1 mx-auto aspect-square w-[min(48vw,18rem)] lg:order-2 lg:w-full lg:max-w-[22rem]"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: EASE }}
          >
            <img src={LOGO.src} srcSet={LOGO.srcSet} sizes="(max-width: 1024px) 48vw, 22rem" alt={LOGO.alt} className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
          </motion.div>
        </div>
      </section>
      <Top30 data={data} />
      <Boards data={data} />
    </>
  );
}

function Top30({ data }: { data: Data }) {
  const byId = useMemo(() => new Map(data.umpires.map((u) => [u.id, u])), [data]);
  const boardName = (id?: string) => data.b.boards.find((b) => data.b.boardSlug(b) === id);
  const rows = data.u.ranking.map((r) => ({ position: r.position, umpire: byId.get(r.umpireId) }));
  const awaiting = rows.every((r) => r.umpire?.performance?.points === undefined);

  return (
    <section id="rankings" aria-label="Top 30 umpires" className="gutter py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.9] tracking-wide text-bone">TOP 30 UMPIRES</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">Recognising excellence, consistency and professionalism in match officiating.</p>
          {!awaiting && <p className="mt-1 max-w-xl text-xs text-smoke">Ordered by points recorded in the IOCF ledger. This is not an official ranking.</p>}
        </div>
        {awaiting && <span className="rounded-full border border-[#c9a24b]/50 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-[#c9a24b]">AWAITING DATA</span>}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-ink-2">
        <div role="row" className="hidden grid-cols-[4rem_1fr_9rem_7rem_7rem_8rem] gap-3 border-b border-white/10 px-5 py-3 text-[10px] font-semibold tracking-[0.22em] text-smoke md:grid">
          <span>RANK</span>
          <span>UMPIRE</span>
          <span>BOARD</span>
          <span>MATCHES</span>
          <span>POINTS</span>
          <span />
        </div>
        <ol>
          {rows.map(({ position, umpire }) => {
            if (!umpire) return null;
            const board = boardName(umpire.boardId);
            return (
              <li key={position} className="border-b border-white/5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => navigate('u', umpire.id)}
                  aria-label={`Rank ${position}: view profile of ${umpire.name} (ID ${umpire.id})`}
                  className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] md:grid-cols-[4rem_1fr_9rem_7rem_7rem_8rem] md:px-5"
                >
                  <span className="font-display text-2xl text-[#c9a24b]">#{position}</span>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar player={umpire} size="h-10 w-10" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-bone">{umpire.name}</span>
                      <span className="block truncate text-[11px] text-smoke md:hidden">
                        {board?.name ?? MISSING} · {val(umpire.career?.total)} matches · {val(umpire.performance?.points)} pts
                      </span>
                    </span>
                  </span>
                  <span className="hidden items-center gap-2 text-sm text-mist md:flex">
                    {board ? (
                      <>
                        <Flag board={board} className="text-lg" />
                        <span className="truncate">{board.name}</span>
                      </>
                    ) : (
                      MISSING
                    )}
                  </span>
                  <span className="hidden text-sm text-mist md:block">{val(umpire.career?.total)}</span>
                  <span className="hidden text-sm text-mist md:block">{val(umpire.performance?.points)}</span>
                  <span className="text-right text-[11px] font-semibold tracking-[0.18em] text-[#c9a24b] transition group-hover:translate-x-0.5">
                    <span className="hidden md:inline">VIEW PROFILE →</span>
                    <span className="md:hidden">→</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Boards({ data }: { data: Data }) {
  const [query, setQuery] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    data.umpires.forEach((u) => u.boardId && m.set(u.boardId, (m.get(u.boardId) ?? 0) + 1));
    return m;
  }, [data]);
  const q = query.trim().toLowerCase();
  const visible = data.b.boards.filter((b) => !q || b.name.toLowerCase().includes(q));

  return (
    <section id="boards" aria-label="Umpires by board" className="gutter py-10 sm:py-14">
      <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] leading-[0.9] tracking-wide text-bone">UMPIRES BY BOARD</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">Explore the officiating teams representing every IOCF board.</p>

      <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search boards by name" aria-label="Search boards by name" className={searchInput} />
        <p role="status" aria-live="polite" className="text-xs text-smoke">
          Showing {visible.length} of {data.b.boards.length} boards
        </p>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
          <p className="text-sm text-bone">No boards match your search.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
            CLEAR SEARCH
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((b) => {
            const id = data.b.boardSlug(b);
            const count = counts.get(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => navigate('board', id)}
                  aria-label={`View umpires of ${b.name}`}
                  className="group flex h-full w-full flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-5 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-2xl leading-tight tracking-wide text-bone">{b.name.toUpperCase()}</span>
                    <Flag board={b} />
                  </span>
                  {count !== undefined && (
                    <span className="text-xs text-mist">
                      {count} {count === 1 ? 'umpire' : 'umpires'}
                    </span>
                  )}
                  <span className="mt-auto text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW UMPIRES →</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------- board umpire list ---------- */

function BoardList({ board, data }: { board: Board; data: Data }) {
  const boardId = data.b.boardSlug(board);
  const [query, setQuery] = useState('');
  const all = useMemo(() => data.umpires.filter((u) => u.boardId === boardId), [data, boardId]);
  const rankOf = useMemo(() => new Map(data.u.ranking.map((r) => [r.umpireId, r.position])), [data]);
  const q = query.trim().toLowerCase();
  const visible = all.filter((u) => !q || u.name.toLowerCase().includes(q));

  return (
    <div className="gutter pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Umpire Centre', onClick: () => navigate() }, { label: board.name }]} />
      <div className="mt-3">
        <BackButton onClick={() => goBack(() => navigate())}>BACK</BackButton>
      </div>
      <header className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">
            {all.length} {all.length === 1 ? 'UMPIRE' : 'UMPIRES'}
          </p>
          <h1 className="mt-1 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">{board.name.toUpperCase()}</h1>
        </div>
        <Flag board={board} className="text-5xl" />
      </header>

      <div className="mb-4 mt-8">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${board.name} umpires`} aria-label={`Search ${board.name} umpires`} className={searchInput} />
      </div>
      <p role="status" aria-live="polite" className="mb-4 text-xs text-smoke">
        Showing {visible.length} of {all.length} umpires
      </p>

      {all.length === 0 ? (
        <Notice tone="info">No umpires have been added for this board yet.</Notice>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-ink-2 px-5 py-12 text-center">
          <p className="text-sm text-bone">No umpires match your search.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
            CLEAR SEARCH
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => navigate('u', u.id)}
                aria-label={`View profile of ${u.name} (${board.name}, ID ${u.id})`}
                className="group flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-ink-2 p-4 text-left transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
              >
                <span className="flex items-center gap-4">
                  <Avatar player={u} size="h-16 w-16" />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-bone">{u.name}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-mist">
                      <Flag board={board} className="text-base" />
                      {board.name}
                    </span>
                  </span>
                </span>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-ink-3 px-3 py-2">
                    <dt className="text-[10px] text-smoke">Matches officiated</dt>
                    <dd className="mt-0.5 font-semibold text-bone">{val(u.career?.total)}</dd>
                  </div>
                  <div className="rounded-lg bg-ink-3 px-3 py-2">
                    <dt className="text-[10px] text-smoke">Current ranking</dt>
                    <dd className="mt-0.5 font-semibold text-bone">{rankOf.has(u.id) ? `#${rankOf.get(u.id)}` : MISSING}</dd>
                  </div>
                </dl>
                <span className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">VIEW PROFILE →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- individual profile ---------- */

function Profile({ umpire, data }: { umpire: Umpire; data: Data }) {
  const board = data.b.boards.find((b) => data.b.boardSlug(b) === umpire.boardId);
  const position = data.u.ranking.find((r) => r.umpireId === umpire.id)?.position;
  // ranking placeholders belong to the Top 30 list; board umpires to their board list
  const parent = board ? { label: board.name, to: () => navigate('board', umpire.boardId!) } : { label: 'Top 30 Umpires', to: () => navigate() };

  return (
    <div className="gutter mx-auto max-w-5xl pb-16 pt-28">
      <Breadcrumb items={[{ label: 'Umpire Centre', onClick: () => navigate() }, { label: parent.label, onClick: parent.to }, { label: `${umpire.name} (${umpire.id})` }]} />
      <div className="mt-3">
        <BackButton onClick={() => goBack(parent.to)}>BACK</BackButton>
      </div>

      <Card title="UMPIRE PROFILE" className="mt-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar player={umpire} size="h-32 w-32" />
          <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Umpire name" value={umpire.name} />
            <Fact label="Umpire ID" value={umpire.id} mono />
            <Fact label="Board">
              {board ? (
                <span className="flex items-center gap-2">
                  <Flag board={board} className="text-xl" />
                  {board.name}
                </span>
              ) : (
                MISSING
              )}
            </Fact>
            <Fact label="Current ranking" value={position !== undefined && umpire.performance?.points !== undefined ? `#${position}` : MISSING} />
            <Fact label="Official status" value={umpire.status ?? data.u.DEFAULT_STATUS} />
          </dl>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="CAREER OVERVIEW">
          <StatGrid fields={data.u.CAREER_FIELDS} values={umpire.career} />
        </Card>
        <Card title="PERFORMANCE STATISTICS">
          <StatGrid fields={data.u.PERFORMANCE_FIELDS} values={umpire.performance} />
          <h3 className="mb-3 mt-5 text-[10px] font-semibold tracking-[0.22em] text-smoke">AWARDS &amp; RECOGNITIONS</h3>
          <EntryList entries={umpire.awards} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="TOURNAMENT ASSIGNMENTS">
          <EntryList entries={umpire.assignments} />
        </Card>
        <Card title="RECENT MATCHES">
          <EntryList entries={umpire.recentMatches} />
        </Card>
        <Card title="MATCH-BY-MATCH RECORDS">
          <EntryList entries={umpire.matchRecords} />
        </Card>
        <Card title="CAREER MILESTONES">
          <EntryList entries={umpire.milestones} />
        </Card>
      </div>
    </div>
  );
}
