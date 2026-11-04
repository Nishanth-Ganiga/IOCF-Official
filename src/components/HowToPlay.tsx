import { useEffect, useRef, useState } from 'react';
import { ordinal, parseDigits, playOver, randomDigits, sumText } from '../data/funCricket.mjs';
import { store } from '../data/store';

type Msg = { id: number; from: 'them' | 'me'; text: string };
const GOLD = '#c9a24b';
const STADIUM = 'IOCF Training space';

const pick = (names: string[], fallback: string) => (names.length ? names[Math.floor(Math.random() * names.length)] : fallback);
/** A random umpire and a random player from the IOCF lists, different for every visitor and every game. */
function drawNames() {
  return {
    umpire: pick(store.umpires.map((u) => u.name.trim()).filter(Boolean), 'IOCF Umpire'),
    player: pick(store.players.map((p) => p.name.trim()).filter(Boolean), 'IOCF Player'),
  };
}
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** A chat window in the style of an Instagram direct message. */
function Chat({ title, name, msgs, typing, onSend, hint }: { title: string; name: string; msgs: Msg[]; typing: boolean; onSend?: (text: string) => string | null; hint?: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, typing]);
  const submit = () => {
    if (!onSend) return;
    const problem = onSend(text);
    setError(problem ?? '');
    if (!problem) setText('');
  };
  return (
    <div className="flex h-[30rem] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-[2px]" style={{ background: 'linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)' }} aria-hidden>
          <span className="flex h-full w-full items-center justify-center rounded-full bg-[#1c1c1e] text-xs font-bold text-white">{initials(name)}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{title}</span>
          <span className="block truncate text-[11px] text-[#a8a8a8]">{name}</span>
        </span>
      </div>
      <div ref={box} role="log" aria-live="polite" aria-label={`Chat with ${name}`} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            <p
              className={`max-w-[82%] whitespace-pre-line rounded-3xl px-4 py-2 text-[14px] leading-snug text-white ${m.from === 'me' ? '' : 'bg-[#262626]'}`}
              style={m.from === 'me' ? { background: 'linear-gradient(135deg,#6a4cff,#b13cff 60%,#d63aa8)' } : undefined}
            >
              {m.text}
            </p>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start" aria-label={`${name} is typing`}>
            <span className="flex gap-1 rounded-3xl bg-[#262626] px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a8a8a8]" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </span>
          </div>
        )}
      </div>
      {onSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border-t border-white/10 p-3"
        >
          <div className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
              inputMode="numeric"
              autoComplete="off"
              aria-label="Your six digits"
              placeholder="Message… six digits, each 0 to 6"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-[#8e8e8e]"
            />
            <button type="submit" className="text-sm font-semibold text-[#3797f0] disabled:opacity-40" disabled={!text.trim()}>
              Send
            </button>
          </div>
          <p role="alert" className="mt-1.5 min-h-[1rem] px-2 text-[11px] text-[#ff6b6b]">
            {error || (hint ?? '')}
          </p>
        </form>
      ) : (
        <p className="border-t border-white/10 px-4 py-3 text-center text-[11px] text-[#8e8e8e]">{hint ?? 'Messages from this player appear here'}</p>
      )}
    </div>
  );
}

const BAD = 'Send exactly six digits, each from 0 to 6 — for example 634251.';

/** Delayed replies (so it feels like a chat), cleaned up if the visitor leaves. */
function useTimers() {
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  return (fn: () => void, ms: number) => void timers.current.push(window.setTimeout(fn, ms));
}

export function Batting({ onBack }: { onBack: () => void }) {
  const [names, setNames] = useState(drawNames);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState(false);
  const id = useRef(0);
  const later = useTimers();
  const add = (from: Msg['from'], text: string) => setMsgs((m) => [...m, { id: ++id.current, from, text }]);

  const start = (n = names) => {
    id.current = 0;
    setDone(false);
    setTyping(false);
    setMsgs([{ id: ++id.current, from: 'them', text: `Welcome to ${STADIUM}! I'm umpire ${n.umpire}.\nYou will bat 6 balls against ${n.player}.\nSend me six digits, each from 0 to 6 — the runs for each ball. For example: 634251` }]);
  };
  useEffect(() => start(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (text: string) => {
    const bat = parseDigits(text);
    if (!bat) return BAD;
    if (typing || done) return null;
    add('me', bat.join(''));
    const bowl = randomDigits();
    const r = playOver(bat, bowl);
    setTyping(true);
    later(() => {
      setTyping(false);
      add('them', `${names.player} bowls: ${bowl.join('')}`);
      setTyping(true);
      later(() => {
        setTyping(false);
        add(
          'them',
          r.outOn
            ? `Same digit in the same place at ball ${r.outOn} — OUT on the ${ordinal(r.outOn)} ball!\n${r.outOn === 1 ? 'No runs before that.' : `Runs before that: ${sumText(r.scored)}`}`
            : `No digit matched — NOT OUT!\nRuns: ${sumText(r.scored)}`,
        );
        later(() => {
          add('them', `🏏 You scored ${r.runs} run${r.runs === 1 ? '' : 's'}${r.outOn ? ` and got out on the ${ordinal(r.outOn)} ball` : ' and stayed not out'}.`);
          setDone(true);
        }, 600);
      }, 900);
    }, 900);
    return null;
  };

  const again = () => {
    const n = drawNames();
    setNames(n);
    start(n);
  };

  return (
    <GameFrame title="Batting" onBack={onBack} onAgain={done ? again : undefined}>
      <div className="mx-auto max-w-xl">
        <Chat title={STADIUM} name={`Umpire ${names.umpire}`} msgs={msgs} typing={typing} onSend={done ? undefined : send} hint={done ? 'Innings over — press Play again for a new umpire and bowler.' : 'You bat 6 balls against ' + names.player} />
      </div>
    </GameFrame>
  );
}

export function Bowling({ onBack }: { onBack: () => void }) {
  const [names, setNames] = useState(drawNames);
  const [umpMsgs, setUmpMsgs] = useState<Msg[]>([]);
  const [batMsgs, setBatMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState<'ump' | 'bat' | null>(null);
  const [done, setDone] = useState(false);
  const id = useRef(0);
  const later = useTimers();
  const addU = (from: Msg['from'], text: string) => setUmpMsgs((m) => [...m, { id: ++id.current, from, text }]);
  const addB = (text: string) => setBatMsgs((m) => [...m, { id: ++id.current, from: 'them', text }]);

  const start = (n = names) => {
    id.current = 0;
    setDone(false);
    setTyping(null);
    setBatMsgs([]);
    setUmpMsgs([{ id: ++id.current, from: 'them', text: `Welcome to ${STADIUM}! I'm umpire ${n.umpire}.\nPlease bowl 6 balls to ${n.player}.\nSend me six digits, each from 0 to 6 — one for each ball. For example: 123652` }]);
  };
  useEffect(() => start(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (text: string) => {
    const bowl = parseDigits(text);
    if (!bowl) return BAD;
    if (typing || done) return null;
    addU('me', bowl.join(''));
    setTyping('ump');
    later(() => {
      setTyping(null);
      addU('them', `Thank you. ${names.player}, please come on strike and bat your six balls.`);
      setTyping('bat');
      later(() => {
        setTyping(null);
        const bat = randomDigits();
        addB(`Ready! My six balls: ${bat.join('')}`);
        const r = playOver(bat, bowl);
        setTyping('ump');
        later(() => {
          setTyping(null);
          addU(
            'them',
            r.outOn
              ? `Same digit in the same place at ball ${r.outOn} — WICKET on the ${ordinal(r.outOn)} ball!\n${r.outOn === 1 ? 'No runs before that.' : `Runs before that: ${sumText(r.scored)}`}`
              : `No digit matched — NO WICKET!\nRuns: ${sumText(r.scored)}`,
          );
          later(() => {
            addU('them', `🎯 You conceded ${r.runs} run${r.runs === 1 ? '' : 's'}${r.outOn ? ' and took the wicket' : ' and took no wicket'}.`);
            setDone(true);
          }, 600);
        }, 1000);
      }, 1100);
    }, 900);
    return null;
  };

  const again = () => {
    const n = drawNames();
    setNames(n);
    start(n);
  };

  return (
    <GameFrame title="Bowling" onBack={onBack} onAgain={done ? again : undefined}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chat title={STADIUM} name={`Umpire ${names.umpire}`} msgs={umpMsgs} typing={typing === 'ump'} onSend={done ? undefined : send} hint={done ? 'Over complete — press Play again for a new umpire and batsman.' : 'You bowl 6 balls to ' + names.player} />
        <Chat title={STADIUM} name={names.player} msgs={batMsgs} typing={typing === 'bat'} hint={`${names.player} bats after you send your digits`} />
      </div>
    </GameFrame>
  );
}

function GameFrame({ title, onBack, onAgain, children }: { title: string; onBack: () => void; onAgain?: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
          ← BACK
        </button>
        <p className="font-display text-2xl tracking-wide text-bone">{title.toUpperCase()}</p>
        {onAgain ? (
          <button type="button" onClick={onAgain} className="rounded-full border px-5 py-2 text-xs font-bold tracking-[0.2em] transition hover:bg-white/5" style={{ borderColor: GOLD, color: GOLD }}>
            PLAY AGAIN
          </button>
        ) : (
          <span className="w-24" />
        )}
      </div>
      {children}
    </div>
  );
}

/** "How to play online cricket": a two-minute game of digits, played in a chat with an IOCF umpire. Just for fun. */
export default function HowToPlay() {
  const [mode, setMode] = useState<'batting' | 'bowling' | null>(null);
  const cards = [
    { id: 'batting' as const, title: 'Batting', text: 'Send six digits and survive the over. The umpire sends the bowler’s digits back.' },
    { id: 'bowling' as const, title: 'Bowling', text: 'Send your six bowling digits, then watch the batsman try to get past them.' },
  ];
  return (
    <section id="how-to-play" className="gutter border-t border-white/5 py-16 sm:py-24">
      <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">IOCF</p>
      <h2 className="mt-2 font-display text-[clamp(2.4rem,6vw,5rem)] leading-[0.9] tracking-wide text-bone">HOW TO PLAY ONLINE CRICKET</h2>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mist">
        Online cricket in the IOCF is played with numbers. Try an over for yourself in the {STADIUM} — with a real IOCF umpire and a real IOCF player. It is just for fun: nothing is saved and no result is counted.
      </p>

      {mode === null ? (
        <>
          <ul className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setMode(c.id)} className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-white/10 bg-ink-2 p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#c9a24b]/60">
                  <span className="font-display text-3xl tracking-wide text-bone">{c.title.toUpperCase()}</span>
                  <span className="text-sm leading-relaxed text-mist">{c.text}</span>
                  <span className="mt-auto text-xs font-semibold tracking-[0.2em] text-[#c9a24b] transition group-hover:translate-x-1">PLAY →</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-8 max-w-3xl rounded-2xl border border-white/10 bg-ink-2 p-5">
            <h3 className="text-[11px] font-semibold tracking-[0.24em] text-[#c9a24b]">THE RULES</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-mist">
              <li>An over is six digits, each from <b className="text-bone">0 to 6</b> — the runs of that ball.</li>
              <li>The batsman’s digits and the bowler’s digits are compared place by place. The first place where they are the <b className="text-bone">same digit</b> is where the batsman is out.</li>
              <li>The runs are the batsman’s digits <b className="text-bone">before</b> that ball. If nothing matches, all six count.</li>
              <li>
                Example: bowler <b className="text-bone">123652</b>, batsman <b className="text-bone">634251</b> → the 5th digits match, so he is out on the 5th ball, and 6 + 3 + 4 + 2 = <b className="text-bone">15 runs</b>.
              </li>
            </ul>
          </div>
        </>
      ) : mode === 'batting' ? (
        <Batting onBack={() => setMode(null)} />
      ) : (
        <Bowling onBack={() => setMode(null)} />
      )}
    </section>
  );
}
