import { motion } from 'framer-motion';
import { EASE } from './fx';

const GOLD = '#c9a24b';
const NAME = 'Nishanth Ganiga Byndoor';
const ROLE = 'Founder of IOCF';
const PHOTO = {
  src: '/assets/founder-800.webp',
  srcSet: '/assets/founder-480.webp 480w, /assets/founder-800.webp 800w, /assets/founder-1100.webp 1100w',
  alt: `${NAME}, Founder of the International Online Cricket Federation`,
};

/** The message, as paragraphs. Edit the words here. */
const MESSAGE = [
  'Welcome to the International Online Cricket Federation.',
  'The IOCF began with one simple belief: that the love of cricket does not need a stadium, a border or a time zone. Every day, people from every corner of the world pick up the game online, with the same passion, the same pride and the same dream as any player who has walked out in front of a crowd. The IOCF exists to give that passion a home — a proper stage, with proper rules, where every player and every board is treated as a part of one federation.',
  'Today that home is made of boards from across the world, each led by its chairman and its CEO, each carrying the colours of its country with honour. Around them stand the players who give the game its heart, the umpires who protect its fairness, and the scorers and organisers who work quietly so that every match counts. Together they have built the tournaments, the franchise leagues, the series, the rankings, the Hall of Fame and the records that tell the story of online cricket — and every one of those stories belongs to the people who wrote it.',
  'What we stand for is simple. Fair play, before every result. Respect, for opponents, officials and fellow boards. Honesty, in every score, every ranking and every credit. Opportunity, so that a new player on a young board has the same chance to be remembered as a champion from the oldest. And unity — because the strength of the IOCF has never been in any one board, but in all of them playing together.',
  'To the chairmen and CEOs who lead their boards with such dedication: thank you for your time, your patience and your belief in this federation. To every player: thank you for the runs, the wickets, the catches and the sportsmanship; you are the reason this game lives. To our umpires, scorers and volunteers: thank you for the work nobody sees, and without which nothing could be played. And to everyone who follows the IOCF, checks the rankings, shares a result or simply cheers from a distance: you are part of this family.',
  'We are only at the beginning. IOCF 2.0, new tournaments and leagues, stronger boards, fairer rankings and new ways to play and connect are all on the road ahead, and this website will keep growing with them. Our goal is a federation that every board is proud to belong to and every player is proud to represent.',
  'If you love cricket, you have a place in the IOCF. Play hard, play fair, and play for something bigger than yourself.',
  'One Federation. Many Roles. One Cricketing Vision.',
];

/** The Founder's message on the IOCF Main profile: portrait, name, title and the full message. */
export default function FoundersMessage() {
  const [intro, ...rest] = MESSAGE;
  const closing = rest[rest.length - 1];
  const body = rest.slice(0, -1);
  return (
    <section id="founder" aria-labelledby="founder-title" className="gutter border-t border-white/5 py-16 sm:py-24">
      <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: GOLD }}>
        FROM THE FOUNDER
      </p>
      <h2 id="founder-title" className="mt-2 font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.9] tracking-wide text-bone">
        FOUNDER’S MESSAGE
      </h2>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-12">
        <motion.figure
          className="mx-auto w-full max-w-sm lg:mx-0"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <div className="overflow-hidden rounded-2xl border border-[#c9a24b]/40 bg-ink-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <img src={PHOTO.src} srcSet={PHOTO.srcSet} sizes="(max-width: 1024px) 90vw, 22rem" alt={PHOTO.alt} loading="lazy" decoding="async" className="aspect-[1204/1306] w-full object-cover object-top" />
          </div>
          <figcaption className="mt-4 text-center lg:text-left">
            <span className="block font-display text-3xl tracking-wide text-bone">{NAME.toUpperCase()}</span>
            <span className="mt-1 block text-xs font-semibold tracking-[0.28em]" style={{ color: GOLD }}>
              {ROLE.toUpperCase()}
            </span>
          </figcaption>
        </motion.figure>

        <motion.blockquote
          className="relative rounded-2xl border border-white/10 bg-ink-2 p-6 sm:p-9"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
        >
          <span aria-hidden className="absolute right-6 top-2 font-display text-8xl leading-none opacity-20" style={{ color: GOLD }}>
            ”
          </span>
          <p className="font-display text-2xl leading-snug tracking-wide text-bone sm:text-3xl">{intro}</p>
          <div className="mt-5 space-y-4">
            {body.map((t) => (
              <p key={t.slice(0, 40)} className="text-[15px] leading-relaxed text-mist">
                {t}
              </p>
            ))}
          </div>
          <p className="mt-6 border-l-2 pl-4 font-display text-xl tracking-wide" style={{ borderColor: GOLD, color: GOLD }}>
            {closing}
          </p>
          <footer className="mt-7 border-t border-white/10 pt-5">
            <cite className="not-italic">
              <span className="block text-base font-semibold text-bone">{NAME}</span>
              <span className="block text-[11px] font-semibold tracking-[0.24em]" style={{ color: GOLD }}>
                {ROLE.toUpperCase()}
              </span>
            </cite>
          </footer>
        </motion.blockquote>
      </div>
    </section>
  );
}
