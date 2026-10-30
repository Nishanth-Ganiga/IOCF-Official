import type { BoardTheme } from '../../data/commandCenter/boardConfig';

/** A stylised kiwi (New Zealand's mascot), drawn so it needs no image file. */
function Kiwi({ color, accent }: { color: string; accent: string }) {
  return (
    <svg viewBox="0 0 200 160" className="h-full w-full" aria-hidden>
      <g fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round">
        <path d="M92 128 l-6 22 m-6 0 h14" />
        <path d="M118 128 l2 22 m-6 0 h14" />
      </g>
      <ellipse cx="108" cy="92" rx="62" ry="44" fill={color} stroke={accent} strokeWidth="3" />
      <path d="M62 78 C70 60 92 54 110 56" fill="none" stroke={accent} strokeWidth="2" opacity="0.5" />
      <path d="M72 96 C84 84 104 82 124 90" fill="none" stroke={accent} strokeWidth="2" opacity="0.4" />
      <path d="M84 110 C98 100 118 100 138 108" fill="none" stroke={accent} strokeWidth="2" opacity="0.4" />
      <circle cx="52" cy="70" r="19" fill={color} stroke={accent} strokeWidth="3" />
      <circle cx="48" cy="66" r="2.6" fill={accent} />
      <path d="M36 74 C20 80 8 96 6 118" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** The mascot of a board: an emoji, a photo if one is configured, or the drawn kiwi. */
export default function Mascot({ theme, highlight, className = '' }: { theme: BoardTheme; highlight: string; className?: string }) {
  const m = theme.mascot;
  return (
    <div className={className} role="img" aria-label={`${theme.name} mascot: ${m.name}`}>
      {m.image === 'kiwi' ? (
        <Kiwi color={theme.colors.primary === '#111114' ? '#26262c' : theme.colors.primary} accent={highlight} />
      ) : m.image ? (
        <img src={m.image} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[min(9rem,22vw)] leading-none">{m.emoji}</span>
      )}
    </div>
  );
}

/** The flag of a board: its emoji, or a badge where none exists (West Indies). */
export function BoardFlag({ theme, className = 'text-4xl' }: { theme: BoardTheme; className?: string }) {
  return theme.flag ? (
    <span role="img" aria-label={`${theme.name} flag`} className={`leading-none ${className}`}>
      {theme.flag}
    </span>
  ) : (
    <span role="img" aria-label={`${theme.name} board badge`} className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold tracking-wider" style={{ background: theme.colors.primary, color: theme.colors.secondary }}>
      {theme.name
        .split(' ')
        .map((w) => w[0])
        .join('')}
    </span>
  );
}

const ICONS: Record<string, string> = {
  announcement: 'M4 10v4l12 5V5L4 10zm12-5 4-1.5v15L16 19M6 15l1.5 5h3L9 16',
  calendar: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4',
  squad: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7 1a2.5 2.5 0 1 0 0-5M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 14c2.8 0 5 2.2 5 5',
  register: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  credits: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v10M9.5 9.5c.5-1 1.5-1.5 2.5-1.5 1.4 0 2.5.8 2.5 2s-1 1.7-2.5 2-2.5.8-2.5 2 1.1 2 2.5 2c1 0 2-.5 2.5-1.5',
  report: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3',
};

export function ModuleIcon({ icon, className = 'h-7 w-7' }: { icon: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[icon] ?? ICONS.report} />
    </svg>
  );
}
