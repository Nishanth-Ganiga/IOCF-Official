import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { viewerProfiles, type ProfileId } from '../data/portfolio';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { ProfileAvatar } from './ProfileSelector';
import { EASE } from './fx';

export const LOGO = {
  src: '/assets/portrait-720.webp',
  srcSet: '/assets/portrait-420.webp 420w, /assets/portrait-720.webp 720w, /assets/portrait-1100.webp 1100w',
  alt: 'International Online Cricket Federation emblem',
};

const GOLD = '#c9a24b';

/** Android installer served from public/downloads/. Set IOS_URL to the TestFlight / App Store link once published. */
const APK_URL = '/downloads/IOCF.apk';
const IOS_URL = '';

function AppDownload() {
  if (Capacitor.isNativePlatform()) return null;
  const btn = 'inline-flex items-center gap-2 rounded border border-[#c9a24b]/50 px-5 py-2.5 text-xs font-semibold tracking-[0.18em] text-[#c9a24b] transition hover:bg-[#c9a24b] hover:text-black';
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <span className="text-[0.7rem] font-semibold tracking-[0.25em] text-mist">GET THE IOCF APP</span>
      <div className="flex flex-wrap justify-center gap-3">
        <a href={APK_URL} download="IOCF.apk" className={btn}>⬇ DOWNLOAD FOR ANDROID</a>
        {IOS_URL ? <a href={IOS_URL} target="_blank" rel="noreferrer" className={btn}>⬇ GET IT ON iOS</a> : null}
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: 'boards', label: 'Boards', blurb: 'Explore national boards and their cricketing identities.' },
  { id: 'tournaments', label: 'Tournaments', blurb: 'Discover international cups, leagues and championships.' },
  { id: 'rankings', label: 'Rankings', blurb: 'Follow board and player rankings across formats.' },
  { id: 'players', label: 'Players', blurb: 'Meet the players competing across the federation.' },
  { id: 'councils', label: 'Councils', blurb: 'Governance councils and committees of the federation.' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['id'];

const CARD_ICONS: Record<Exclude<SectionKey, 'councils'>, ReactNode> = {
  boards: (
    <>
      <path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10" />
      <path d="m3 10 9-6 9 6z" />
    </>
  ),
  tournaments: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  rankings: <path d="M4 20V12h4v8M10 20V5h4v15M16 20v-9h4v9" />,
  players: (
    <>
      <path d="m14 4 6 6-9 9-3.2.6a1 1 0 0 1-1.2-1.2L7.4 15z" />
      <path d="m8 16-3.5 3.5" />
      <circle cx="6" cy="6" r="2.2" />
    </>
  ),
};

const HIGHLIGHTS = [
  { kicker: 'Global Network', title: 'International Boards', text: 'A growing network of cricket boards', pos: 'left-[0%] top-[26%]' },
  { kicker: 'Competition', title: 'Global Tournaments', text: 'International and franchise competitions', pos: 'right-[0%] top-[14%]' },
  { kicker: 'Rankings', title: 'Official Rankings', text: 'Boards, players and format-based rankings', pos: 'right-[2%] bottom-[18%]' },
];

import { aboutIntro, councilNote, formats, getCouncils, getHallOfFame, getTournamentAwards, getTournaments, howItWorks, otherCompetitions, playersIntro, rankingIntro, rankingRules } from '../data/iocfInfo';
import { DataStamp } from './SiteFooter';
import GlobalSearch from './GlobalSearch';
import MyIocf from './MyIocf';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

const INSTAGRAM_URL = 'https://www.instagram.com/iocf_official/';

export default function IocfHome({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const mine = hash === '#/my';
  const go = (id: string) => {
    if (id === 'my') {
      window.location.hash = '#/my';
      scrollTo(0, { offset: 0 });
      return;
    }
    const scroll = () => scrollTo(id === 'top' ? 0 : `#${id}`, { offset: id === 'top' ? 0 : -72 });
    if (mine) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setHash('');
      window.setTimeout(scroll, 150);
    } else scroll();
  };

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={[{ id: 'top', label: 'Home' }, ...SECTIONS.map((s) => ({ id: s.id as string, label: s.label as string })), { id: 'my', label: 'My IOCF' }]} />
      {mine ? (
        <main className="min-h-[100svh]">
          <MyIocf onSwitch={onSwitch} />
          <footer className="gutter border-t border-white/5 py-10 text-center text-xs text-smoke">
            International Online Cricket Federation — One Federation. Many Roles. One Cricketing Vision.
            <DataStamp />
          </footer>
        </main>
      ) : (
      <main>
        <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_75%_45%,rgba(201,162,75,0.10),transparent_70%)]" />
          <div className="gutter relative z-[2] grid w-full items-center gap-10 pb-16 pt-28 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <motion.div variants={container} initial="hidden" animate="show" className="order-2 lg:order-1">
              <motion.p variants={item} className="font-sans text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b] sm:text-xs">
                INTERNATIONAL ONLINE CRICKET FEDERATION
              </motion.p>
              <motion.h1 variants={item} className="mt-3 font-display leading-[0.85] tracking-[0.02em] text-bone" style={{ fontSize: 'clamp(4.5rem, 13vw, 11rem)' }}>
                IOCF
              </motion.h1>
              <motion.p variants={item} className="mt-2 font-sans text-sm font-bold tracking-[0.4em] text-bone sm:text-base">
                THE WORLD OF ONLINE CRICKET
              </motion.p>
              <motion.p variants={item} className="mt-5 max-w-xl text-[15px] leading-relaxed text-bone/75 sm:text-base">
                A global cricketing community bringing boards, players and competitions together through international tournaments, rankings and a shared passion for the game.
              </motion.p>
              <motion.p variants={item} className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-mist sm:text-xs sm:tracking-[0.3em]">
                GLOBAL GOVERNING BODY &nbsp;•&nbsp; INTERNATIONAL BOARDS &nbsp;•&nbsp; COMPETITIVE CRICKET
              </motion.p>
              <motion.div variants={item} className="mt-7">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#c9a24b] px-5 py-2.5 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition hover:bg-[#c9a24b] hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  VISIT OUR INSTAGRAM
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </motion.div>
            </motion.div>

            <motion.div
              className="relative order-1 mx-auto aspect-square w-[min(78vw,30rem)] lg:order-2 lg:w-full lg:max-w-[34rem]"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, ease: EASE }}
            >
              <img src={LOGO.src} srcSet={LOGO.srcSet} sizes="(max-width: 1024px) 78vw, 34rem" alt={LOGO.alt} className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
              {HIGHLIGHTS.map((h, i) => (
                <motion.div
                  key={h.title}
                  className={`glass absolute hidden w-52 rounded-xl px-4 py-3 xl:block ${h.pos}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 1 + i * 0.18, ease: EASE }}
                >
                  <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#c9a24b]">{h.kicker}</p>
                  <p className="mt-1 text-sm font-semibold text-bone">{h.title}</p>
                  <p className="text-[11px] leading-snug text-mist">{h.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* highlights for screens where the floating cards are hidden */}
        <ul className="gutter grid gap-3 pb-6 sm:grid-cols-3 xl:hidden">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title} className="glass rounded-xl px-4 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#c9a24b]">{h.kicker}</p>
              <p className="mt-1 text-sm font-semibold text-bone">{h.title}</p>
              <p className="text-[11px] leading-snug text-mist">{h.text}</p>
            </li>
          ))}
        </ul>

        <section aria-label="Explore the federation" className="gutter py-12 sm:py-16">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SECTIONS.filter((s) => s.id !== 'councils').map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  className="group flex h-full w-full flex-col items-start gap-4 rounded-2xl border border-white/10 bg-ink-2 p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#c9a24b]/60"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-9 w-9">
                    {CARD_ICONS[s.id as Exclude<SectionKey, 'councils'>]}
                  </svg>
                  <span className="font-display text-3xl tracking-wide text-bone">{s.label.toUpperCase()}</span>
                  <span className="text-sm leading-relaxed text-mist">{s.blurb}</span>
                  <span className="mt-auto text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">OPEN →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <RecentResults onSwitch={onSwitch} />
        <AboutIocf />
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="gutter border-t border-white/5 py-16 sm:py-24">
            <SectionHead label={s.label} blurb={s.blurb} />
            <SectionBody id={s.id} onSwitch={onSwitch} />
          </section>
        ))}

        <footer className="gutter border-t border-white/5 py-10 text-center text-xs text-smoke">
          International Online Cricket Federation — One Federation. Many Roles. One Cricketing Vision.
          <DataStamp />
          <AppDownload />
        </footer>
      </main>
      )}
    </>
  );
}

export function IocfHeader({ profileId, onSwitch, go, links, searchable = SECTIONS.map((s) => ({ id: s.id as string, label: s.label as string })) }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void; go: (id: string) => void; links: { id: string; label: string }[]; searchable?: { id: string; label: string }[] }) {
  const [menu, setMenu] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = viewerProfiles.find((p) => p.id === profileId)!;

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);


  return (
    <header className="fixed inset-x-0 top-0 z-[60]">
      <div className="gutter flex h-16 items-center justify-between gap-6 bg-ink/80 backdrop-blur-xl md:h-[72px]">
        <div className="flex items-center gap-8 lg:gap-10">
          <button type="button" onClick={() => go('top')} className="flex items-center gap-2.5" aria-label="IOCF home">
            <img src="/assets/portrait-420.webp" alt="" className="h-9 w-9 object-contain" />
            <span className="font-display text-2xl tracking-[0.08em] text-bone">IOCF</span>
          </button>
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Sections">
            {links.map((l) => (
              <button key={l.id} type="button" onClick={() => go(l.id)} className="text-[13px] font-medium text-mist transition hover:text-bone">
                {l.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <GlobalSearch profileId={profileId} onSwitch={onSwitch} go={go} pages={searchable} />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label={`Viewing as ${current.name}. Switch profile`}
              className="flex items-center gap-2 rounded-md p-1"
            >
              <ProfileAvatar id={profileId} size="sm" />
              <motion.span animate={{ rotate: menu ? 180 : 0 }} className="text-[10px] text-mist">
                ▼
              </motion.span>
            </button>
            <AnimatePresence>
              {menu && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="absolute right-0 top-12 w-64 origin-top-right rounded-xl border border-white/10 bg-ink-2/95 p-2 shadow-2xl backdrop-blur-xl"
                >
                  <p className="px-3 pb-2 pt-1 text-[10px] font-semibold tracking-[0.24em] text-smoke">CHOOSE YOUR IOCF IDENTITY</p>
                  {viewerProfiles.map((p) => (
                    <button
                      key={p.id}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        onSwitch(p.id);
                        setMenu(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5 ${p.id === profileId ? 'bg-white/[0.06]' : ''}`}
                    >
                      <ProfileAvatar id={p.id} size="sm" />
                      <span>
                        <span className="block text-sm text-bone">{p.name}</span>
                        <span className="block text-[11px] leading-snug text-smoke">{p.blurb}</span>
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
            aria-label={mobileNav ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav((v) => !v)}
          >
            <motion.span className="block h-0.5 w-5 bg-bone" animate={{ rotate: mobileNav ? 45 : 0, y: mobileNav ? 4 : 0 }} />
            <motion.span className="block h-0.5 w-5 bg-bone" animate={{ rotate: mobileNav ? -45 : 0, y: mobileNav ? -4 : 0 }} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileNav && (
          <motion.nav
            aria-label="Sections"
            className="gutter border-b border-white/5 bg-ink/95 pb-6 pt-2 backdrop-blur-xl lg:hidden"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {links.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setMobileNav(false);
                  go(l.id);
                }}
                className="block w-full py-3 text-left font-display text-3xl tracking-wide text-bone"
              >
                {l.label}
              </button>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ---------- descriptive content ---------- */

function SectionHead({ label, blurb }: { label: string; blurb: string }) {
  return (
    <>
      <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">IOCF</p>
      <h2 className="mt-2 font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.9] tracking-wide text-bone">{label.toUpperCase()}</h2>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mist">{blurb}</p>
    </>
  );
}

const panel = 'rounded-2xl border border-white/10 bg-ink-2 p-5';
const para = 'max-w-3xl text-[15px] leading-relaxed text-bone/80';

function AboutIocf() {
  return (
    <section id="about" className="gutter border-t border-white/5 py-16 sm:py-24">
      <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">IOCF</p>
      <h2 className="mt-2 font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.9] tracking-wide text-bone">ABOUT THE FEDERATION</h2>
      <div className="mt-5 space-y-3">
        {aboutIntro.map((t) => (
          <p key={t} className={para}>
            {t}
          </p>
        ))}
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {howItWorks.map((h) => (
          <li key={h.title} className={panel}>
            <h3 className="text-sm font-semibold text-bone">{h.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-mist">{h.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-mist">
        <span className="font-semibold text-bone">Formats played: </span>
        {formats.join(' • ')}
      </p>
    </section>
  );
}

const linkCls = 'text-bone underline decoration-[#c9a24b]/40 underline-offset-2 hover:text-[#c9a24b]';

/** Board names in a result line, each opening that board in the Board profile when it matches. */
function BoardNames({ text, onSwitch }: { text?: string; onSwitch: (id: ProfileId) => void }) {
  const [boards, setBoards] = useState<import('../data/boards').Board[]>([]);
  useEffect(() => {
    import('../data/boards').then((m) => setBoards(m.boards));
  }, []);
  if (!text) return <span className="text-bone">not recorded</span>;
  const parts = text.split(/(\s*&\s*|\s*,\s*)/);
  return (
    <>
      {parts.map((part, i) => {
        const b = boards.find((x) => x.name === part.trim());
        return b ? (
          <button
            key={i}
            type="button"
            className={linkCls}
            onClick={() => {
              window.location.hash = `#/board/${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
              onSwitch('board');
            }}
          >
            {part.trim()}
          </button>
        ) : (
          <span key={i} className="text-bone">
            {part}
          </span>
        );
      })}
    </>
  );
}

/** "Name (Board)" from the Hall of Fame: links to the player's profile when that player is found. */
function PersonLink({ text, onSwitch }: { text?: string; onSwitch: (id: ProfileId) => void }) {
  const [hit, setHit] = useState<{ boardId: string; id: string } | null>(null);
  const m = text ? /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text) : null;
  useEffect(() => {
    if (!m) return;
    const [, name, board] = m;
    Promise.all([import('../data/players'), import('../data/boards')]).then(async ([p, b]) => {
      const bd = b.boards.find((x) => x.name === board.trim());
      const found = bd && (await p.loadPlayers()).find((x) => x.boardId === b.boardSlug(bd) && x.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (found) setHit({ boardId: found.boardId, id: found.id });
    });
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!text) return <span className="text-bone">—</span>;
  if (!hit) return <span className="text-bone">{text}</span>;
  return (
    <button
      type="button"
      className={linkCls}
      onClick={() => {
        window.location.hash = `#/players/${hit.boardId}/${hit.id}`;
        onSwitch('player');
      }}
    >
      {text}
    </button>
  );
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "4th April" -> a sortable number; matches carry no year, so only the day within the year is known. */
const dayOfYear = (d?: string) => {
  const m = d ? /(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3})/.exec(d) : null;
  const mo = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return m && mo >= 0 ? mo * 31 + Number(m[1]) : -1;
};

function RecentResults({ onSwitch }: { onSwitch: (id: ProfileId) => void }) {
  const [rows, setRows] = useState<{ league: import('../data/leagues').League; m: import('../data/leagues').LeagueMatch; at: number }[] | null>(null);
  useEffect(() => {
    import('../data/leagues').then(async (mod) => {
      const leagues = await mod.loadLeagues();
      const all = leagues.flatMap((league) => league.matches.map((m) => ({ league, m, at: dayOfYear(m.date) })));
      setRows(all.filter((x) => x.at >= 0 && x.m.winner).sort((a, b) => b.at - a.at).slice(0, 6));
    });
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <section aria-label="Recent results" className="gutter pb-6">
      <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">RECENT RESULTS</h2>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ league, m }, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                window.location.hash = `#/leagues/${league.id}`;
                onSwitch('leagues');
              }}
              className="flex h-full w-full flex-col gap-1 rounded-xl border border-white/10 bg-ink-2 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-[#c9a24b]/50"
            >
              <span className="text-[10px] font-semibold tracking-[0.2em] text-[#c9a24b]">{[league.shortName, m.stage, m.date].filter(Boolean).join(' · ').toUpperCase()}</span>
              <span className="text-sm font-semibold text-bone">
                {m.teams[0]} <span className="font-normal text-smoke">vs</span> {m.teams[1]}
              </span>
              <span className="text-[12px] text-mist">
                {m.winner} won{m.mom ? ` · Man of the Match: ${m.mom}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BoardsText() {
  const [list, setList] = useState<import('../data/boards').Board[] | null>(null);
  useEffect(() => {
    import('../data/boards').then((m) => setList(m.boards));
  }, []);
  return (
    <>
      <p className={`mt-6 ${para}`}>
        IOCF’s member boards each have their own leadership, squad and stadiums. The boards, in directory order, with their chairman and CEO:
      </p>
      {!list ? (
        <p className="mt-6 text-sm text-smoke">Loading boards…</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <li key={b.name} className="rounded-xl border border-white/10 bg-ink-2 px-4 py-3">
              <p className="text-sm font-semibold text-bone">
                {b.flag ? `${b.flag} ` : ''}
                {b.name}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-mist">
                {b.chairman ? `Chairman: ${b.chairman}` : 'Chairman: to be announced'}
                {b.ceo ? ` · CEO: ${b.ceo}` : ''}
              </p>
              {b.sponsors && b.sponsors.length > 0 && <p className="mt-1 text-[11px] leading-relaxed text-smoke">{b.sponsors.join(' · ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SectionBody({ id, onSwitch }: { id: string; onSwitch: (id: ProfileId) => void }) {
  if (id === 'boards') return <BoardsText />;
  if (id === 'tournaments')
    return (
      <>
        <p className={`mt-6 ${para}`}>Results of the 2026 season’s international competitions:</p>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {getTournaments().map((t) => (
            <li key={t.name} className={panel}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c9a24b]">{t.kind}</p>
              <h3 className="mt-1 text-base font-semibold text-bone">{t.name}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">
                Champions: <BoardNames text={t.champions} onSwitch={onSwitch} /> · Runners-up: <BoardNames text={t.runnersUp} onSwitch={onSwitch} />
                {t.fairPlay && (
                  <>
                    {' '}
                    · Fair Play: <BoardNames text={t.fairPlay} onSwitch={onSwitch} />
                  </>
                )}
              </p>
              {t.note && <p className="mt-2 text-[12px] leading-relaxed text-smoke">{t.note}</p>}
            </li>
          ))}
        </ul>
        <h3 className="mt-10 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">AWARDS PRESENTED AT WORLD TOURNAMENTS</h3>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-mist">{getTournamentAwards().join(' • ')}</p>
        <h3 className="mt-8 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">OTHER COMPETITIONS</h3>
        <ul className="mt-3 max-w-3xl list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-mist">
          {otherCompetitions.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </>
    );
  if (id === 'rankings')
    return (
      <>
        <p className={`mt-6 ${para}`}>{rankingIntro}</p>
        <h3 className="mt-8 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">HOW POINTS ARE CALCULATED</h3>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rankingRules.map((r) => (
            <li key={r.title} className={panel}>
              <h4 className="text-sm font-semibold text-bone">{r.title}</h4>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">{r.text}</p>
            </li>
          ))}
        </ul>
      </>
    );
  if (id === 'players')
    return (
      <>
        <div className="mt-6 space-y-3">
          {playersIntro.map((t) => (
            <p key={t} className={para}>
              {t}
            </p>
          ))}
        </div>
        <h3 className="mt-8 text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">HALL OF FAME CARDS</h3>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {getHallOfFame().map((h) => (
            <li key={h.card} className={panel}>
              <h4 className="font-display text-2xl tracking-wide text-bone">{h.card.toUpperCase()}</h4>
              <p className="text-[11px] text-smoke">{h.period}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-mist">
                Best Batsman: <PersonLink text={h.batsman} onSwitch={onSwitch} />
              </p>
              <p className="text-[13px] leading-relaxed text-mist">
                Best Bowler: <PersonLink text={h.bowler} onSwitch={onSwitch} />
              </p>
            </li>
          ))}
        </ul>
      </>
    );
  return (
    <>
      <p className={`mt-6 ${para}`}>{councilNote}</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {getCouncils().map((c) => (
          <li key={c.name} className={panel}>
            <h3 className="text-sm font-semibold text-bone">{c.name}</h3>
            {c.members.length > 0 ? (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-mist">
                {c.members.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[12px] text-smoke">Members to be announced</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
