import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { viewerProfiles, type ProfileId } from '../data/portfolio';
import { EASE } from './fx';

const GOLD = '#c9a24b';

const EMBLEMS: Record<Exclude<ProfileId, 'main'>, ReactNode> = {
  // gavel on a block, framed by laurel strokes
  chairman: (
    <>
      <path d="M5 19h14" />
      <path d="M8 16h8" />
      <path d="m9.5 4.5 4 4" />
      <path d="m8 6 4-4 3.5 3.5-4 4z" />
      <path d="m11.5 9.5 5.5 5.5" />
      <path d="M3.5 9c0 4 1.5 7 4 8M20.5 9c0 4-1.5 7-4 8" opacity="0.6" />
    </>
  ),
  // federation shield with a star
  board: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
      <path d="m12 8.5 1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.3-2.3 1.3.5-2.5-1.8-1.7 2.5-.3z" opacity="0.7" />
    </>
  ),
  // bat and ball
  player: (
    <>
      <path d="m14 4 6 6-9 9-3.2.6a1 1 0 0 1-1.2-1.2L7.4 15z" />
      <path d="m8 16-3.5 3.5" />
      <circle cx="6" cy="6" r="2.2" />
    </>
  ),
  // trophy cup
  leagues: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  // padlock
  'command-center': (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.7" r="1.2" />
      <path d="M12 16.9v1.7" />
    </>
  ),
  // globe topped with a star
  tournaments: (
    <>
      <circle cx="12" cy="14" r="6.5" />
      <path d="M5.5 14h13M12 7.5c-2.2 2-2.2 11 0 13M12 7.5c2.2 2 2.2 11 0 13" opacity="0.7" />
      <path d="m12 1.8.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L9 4l2.1-.3z" />
    </>
  ),
  // stumps with bails, and a raised-finger "out" signal
  umpire: (
    <>
      <path d="M5 21V9M9 21V9M13 21V9" />
      <path d="M4.5 8h4M8.5 8h4" />
      <path d="M18 21v-8" />
      <path d="M16.5 13.5V10a1.5 1.5 0 0 1 3 0v3.5" />
      <path d="M16.5 13.5c0 3 .8 4.5 1.5 7.5M19.5 13.5c0 3-.8 4.5-1.5 7.5" opacity="0.6" />
    </>
  ),
};

export function ProfileAvatar({ id, size = 'lg' }: { id: ProfileId; size?: 'sm' | 'lg' }) {
  const p = viewerProfiles.find((v) => v.id === id)!;
  const box = size === 'lg' ? 'h-24 w-24 sm:h-32 sm:w-32 md:h-36 md:w-36 rounded-xl' : 'h-8 w-8 rounded-md';
  if (id === 'main') {
    return (
      <span className={`relative flex items-center justify-center overflow-hidden bg-[#0d0d12] ${box}`}>
        <img src="/assets/portrait-420.webp" alt="IOCF logo" className={`h-full w-full object-contain ${size === 'lg' ? 'p-2' : 'p-0.5'}`} />
      </span>
    );
  }
  return (
    <span
      className={`relative flex items-center justify-center overflow-hidden ${box}`}
      style={{ background: `linear-gradient(145deg, ${p.color}, #0b0b10 130%)` }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={GOLD}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={size === 'lg' ? 'h-14 w-14 sm:h-16 sm:w-16' : 'h-5 w-5'}
      >
        {EMBLEMS[id]}
      </svg>
    </span>
  );
}

export default function ProfileSelector({ onPick }: { onPick: (id: ProfileId) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPick('main');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPick]);

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-y-auto bg-ink px-4 py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(10px)' }}
      transition={{ duration: 0.7, ease: EASE }}
      role="dialog"
      aria-label="Choose your IOCF identity"
    >
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(229,19,43,0.14),transparent_70%)]" />
      <motion.h2
        className="relative mb-10 text-center font-sans text-3xl font-medium tracking-tight text-bone sm:text-5xl"
        initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        CHOOSE YOUR IOCF IDENTITY
      </motion.h2>
      <motion.ul
        className="relative grid grid-cols-2 gap-6 sm:flex sm:flex-wrap sm:justify-center sm:gap-8"
        initial="hidden"
        animate="show"
        transition={{ staggerChildren: 0.08, delayChildren: 0.2 }}
      >
        {viewerProfiles.map((p) => (
          <motion.li key={p.id} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}>
            <button type="button" onClick={() => onPick(p.id)} data-cursor="play" className="group flex flex-col items-center gap-3 text-center">
              <span className="relative rounded-xl ring-2 ring-transparent transition duration-300 group-hover:scale-105 group-hover:ring-bone group-focus-visible:ring-bone">
                <ProfileAvatar id={p.id} />
                {p.id === 'main' && (
                  <span className="absolute -right-2 -top-2 rounded-full bg-crimson px-2 py-0.5 text-[9px] font-bold tracking-[0.18em] text-white">MAIN</span>
                )}
                {p.id === 'command-center' && (
                  <span className="absolute -right-2 -top-2 rounded-full bg-[#c9a24b] px-2 py-0.5 text-[9px] font-bold tracking-[0.18em] text-ink">LOCKED</span>
                )}
              </span>
              <span className="font-sans text-sm font-medium text-mist transition group-hover:text-bone sm:text-base">{p.name}</span>
              <span className="max-w-[11rem] text-[11px] leading-snug text-smoke">{p.blurb}</span>
            </button>
          </motion.li>
        ))}
      </motion.ul>
      <p className="relative mt-12 max-w-md text-center text-xs leading-relaxed text-smoke">
        One Federation. Many Roles. One Cricketing Vision.
      </p>
    </motion.div>
  );
}
