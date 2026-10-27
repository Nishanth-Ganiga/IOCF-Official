import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } };
const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
};

export default function IocfHome({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const go = (id: string) => scrollTo(`#${id}`, { offset: id === 'top' ? 0 : -72 });

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={[{ id: 'top', label: 'Home' }, ...SECTIONS.map((s) => ({ id: s.id as string, label: s.label as string }))]} />
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

        <AboutIocf />
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="gutter border-t border-white/5 py-16 sm:py-24">
            <SectionHead label={s.label} blurb={s.blurb} />
            <SectionBody id={s.id} />
          </section>
        ))}

        <footer className="gutter border-t border-white/5 py-10 text-center text-xs text-smoke">
          International Online Cricket Federation — One Federation. Four Roles. One Cricketing Vision.
        </footer>
      </main>
    </>
  );
}

export function IocfHeader({ profileId, onSwitch, go, links, searchable = SECTIONS.map((s) => ({ id: s.id as string, label: s.label as string })) }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void; go: (id: string) => void; links: { id: string; label: string }[]; searchable?: { id: string; label: string }[] }) {
  const [menu, setMenu] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
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


  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    const hit = searchable.find((s) => s.label.toLowerCase().includes(q));
    if (q && hit) {
      go(hit.id);
      setSearch(false);
      setQuery('');
    }
  };

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
          <form onSubmit={submit} className="flex items-center">
            <AnimatePresence initial={false}>
              {search && (
                <motion.input
                  key="q"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setSearch(false)}
                  placeholder="Search sections"
                  aria-label="Search sections"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 160, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="mr-2 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-xs text-bone outline-none placeholder:text-smoke focus:border-[#c9a24b]"
                />
              )}
            </AnimatePresence>
            <button type="button" onClick={() => setSearch((s) => !s)} aria-label="Search" aria-expanded={search} className="flex h-10 w-10 items-center justify-center text-mist transition hover:text-bone">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-5 w-5" aria-hidden>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
            </button>
          </form>

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

function SectionBody({ id }: { id: string }) {
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
                Champions: <span className="text-bone">{t.champions ?? 'not recorded'}</span> · Runners-up: <span className="text-bone">{t.runnersUp ?? 'not recorded'}</span>
                {t.fairPlay ? ` · Fair Play: ${t.fairPlay}` : ''}
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
                Best Batsman: <span className="text-bone">{h.batsman ?? '—'}</span>
              </p>
              <p className="text-[13px] leading-relaxed text-mist">
                Best Bowler: <span className="text-bone">{h.bowler ?? '—'}</span>
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
