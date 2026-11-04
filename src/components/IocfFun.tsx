import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatsIn, FORMAT_LABEL, sumLines } from '../data/careerStats.mjs';
import { CATEGORIES, rankPlayers, type Person } from '../data/rankingsCore.mjs';
import { cluesFor, dayKey, guessPoints, higherLowerRight, isGuess, makeQuiz, mulberry32, norm, pairFor, superOverStep, type GuessPlayer, type QuizQuestion } from '../data/funLogic.mjs';
import { ordinal, parseDigits, playOver, randomDigits } from '../data/funCricket.mjs';
import type { ProfileId } from '../data/portfolio';
import { loadBoardPeople } from '../data/rankingsData';
import { store } from '../data/store';
import { useSmoothScroll } from '../hooks/smoothScroll';
import { Batting, Bowling } from './HowToPlay';
import { IocfHeader } from './IocfHome';
import { BackButton, Loading, Notice } from './IocfPlayers';
import SiteFooter from './SiteFooter';

// NOT imported at the top: data/boards.ts copies the dataset when it is first loaded (see IocfRankings).
type BoardsModule = typeof import('../data/boards');
type InsightsModule = typeof import('../data/boardInsights');
const ROUTE = '#/fun';
const GOLD = '#c9a24b';

type TileId = 'digit' | 'guess' | 'quiz' | 'duel' | 'higher';
const TILES: { id: TileId; title: string; blurb: string }[] = [
  { id: 'digit', title: 'Digit Cricket', blurb: 'Bat, bowl or play a Super Over against an IOCF umpire and player.' },
  { id: 'guess', title: 'Guess the Player', blurb: 'Clues from real statistics, one at a time. The fewer you need, the more you score.' },
  { id: 'quiz', title: 'Daily IOCF Quiz', blurb: 'Five new questions every day, the same for everyone. Keep your streak going.' },
  { id: 'duel', title: 'Head-to-Head Duel', blurb: 'Put two boards or two players side by side and see who wins.' },
  { id: 'higher', title: 'Higher or Lower', blurb: 'Who has more runs, wickets or matches? Build the longest streak.' },
];

function readRoute(): TileId | null {
  const h = window.location.hash;
  if (!h.startsWith(ROUTE)) return null;
  const id = h.slice(ROUTE.length).split('/').filter(Boolean)[0];
  return TILES.some((t) => t.id === id) ? (id as TileId) : null;
}
const navigate = (id?: string) => {
  window.location.hash = id ? `${ROUTE}/${id}` : ROUTE;
};
function useRoute() {
  const [route, setRoute] = useState<TileId | null>(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/* ---------- scores: kept on the visitor's own device only ---------- */

function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(`iocf-fun-${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`iocf-fun-${key}`, JSON.stringify(value));
  } catch {
    /* private mode or full storage: the score just isn't kept */
  }
}

/** A share card as a picture: shared with the phone's share sheet where possible, otherwise downloaded. */
async function shareCard(title: string, lines: string[], file: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 1080;
  const g = c.getContext('2d');
  if (!g) return;
  const grad = g.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#0f5c6e');
  grad.addColorStop(1, '#10131a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1080);
  g.strokeStyle = GOLD;
  g.lineWidth = 6;
  g.strokeRect(40, 40, 1000, 1000);
  g.fillStyle = GOLD;
  g.font = '600 34px sans-serif';
  g.fillText('INTERNATIONAL ONLINE CRICKET FEDERATION', 90, 130);
  g.fillStyle = '#fff';
  g.font = '700 96px sans-serif';
  const words = title.toUpperCase().split(' ');
  let row = '';
  let y = 290;
  for (const w of words) {
    if (g.measureText(`${row} ${w}`.trim()).width > 900 && row) {
      g.fillText(row, 90, y);
      row = w;
      y += 110;
    } else row = `${row} ${w}`.trim();
  }
  g.fillText(row, 90, y);
  g.font = '500 54px sans-serif';
  g.fillStyle = '#e8e8e8';
  y += 120;
  for (const l of lines) {
    g.fillText(l, 90, y);
    y += 82;
  }
  g.fillStyle = GOLD;
  g.font = '600 36px sans-serif';
  g.fillText('Play on iocf-official.vercel.app → Unlimited Fun', 90, 985);
  const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const f = new File([blob], `${file}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [f] })) {
    try {
      await nav.share({ files: [f], title });
      return;
    } catch {
      /* cancelled: nothing more to do */
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${file}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function ShareButton({ title, lines, file }: { title: string; lines: string[]; file: string }) {
  return (
    <button type="button" onClick={() => void shareCard(title, lines, file)} className="rounded-full border px-5 py-2 text-xs font-bold tracking-[0.2em] transition hover:bg-white/5" style={{ borderColor: GOLD, color: GOLD }}>
      SHARE CARD
    </button>
  );
}

/* ---------- data ---------- */

type Stats = { name: string; boardName: string; matches: number; runs: number; wickets: number; pom: number; fifties: number; hundreds: number; hs: number; best: string | null; hsText: string; formats: string[] };
type Data = { b: BoardsModule; i: InsightsModule; people: Person[]; stats: Stats[] };

function useData() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([import('../data/boards'), import('../data/boardInsights'), loadBoardPeople()]).then(
      ([b, i, people]) => {
        const stats = people.map((p) => {
          const t = sumLines(p.lines) as Record<string, any>;
          return {
            name: p.name,
            boardName: p.boardName,
            matches: t.matches ?? 0,
            runs: t.runs ?? 0,
            wickets: t.wickets ?? 0,
            pom: t.pom ?? 0,
            fifties: t.fifties ?? 0,
            hundreds: t.hundreds ?? 0,
            hs: t.hs ?? 0,
            hsText: t.hs ? `${t.hs}${t.hsNotOut ? '*' : ''}` : '',
            best: t.best ?? null,
            formats: formatsIn(p.lines).map((f) => FORMAT_LABEL[f] ?? f),
          };
        });
        setData({ b, i, people, stats });
      },
      () => setFailed(true),
    );
  }, []);
  return { data, failed };
}

/* ---------- page ---------- */

export default function IocfFun({ profileId, onSwitch }: { profileId: ProfileId; onSwitch: (id: ProfileId) => void }) {
  const { scrollTo } = useSmoothScroll();
  const { data, failed } = useData();
  const route = useRoute();
  useEffect(() => {
    scrollTo(0, { offset: 0 });
  }, [route, scrollTo]);
  const links = [{ id: 'top', label: 'Unlimited Fun' }];
  const go = () => (route ? navigate() : scrollTo(0, { offset: 0 }));

  let body: ReactNode;
  if (failed) body = <Notice tone="error">The games could not be loaded. Please refresh the page to try again.</Notice>;
  else if (!data) body = <Loading />;
  else if (!route) body = <Home />;
  else body = <Page id={route} data={data} />;

  return (
    <>
      <IocfHeader profileId={profileId} onSwitch={onSwitch} go={go} links={links} searchable={links} />
      <main className="min-h-[100svh]">
        {body}
        <SiteFooter />
      </main>
    </>
  );
}

function Home() {
  return (
    <>
      <section id="top" className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_60%_at_78%_45%,rgba(15,92,110,0.45),transparent_70%)]" />
        <div className="gutter relative z-[2] pb-8 pt-28">
          <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: GOLD }}>
            INTERNATIONAL ONLINE CRICKET FEDERATION
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,8vw,6rem)] leading-[0.9] tracking-wide text-bone">UNLIMITED FUN</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mist">Games made from the real IOCF data — its players, boards and statistics. Your best scores are kept on your own device only; nothing is sent anywhere.</p>
        </div>
      </section>
      <section aria-label="Games" className="gutter pb-20">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => navigate(t.id)} className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-white/10 bg-ink-2 p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#c9a24b]/60">
                <span className="font-display text-2xl tracking-wide text-bone">{t.title.toUpperCase()}</span>
                <span className="text-sm leading-relaxed text-mist">{t.blurb}</span>
                <span className="mt-auto text-xs font-semibold tracking-[0.2em] transition group-hover:translate-x-1" style={{ color: GOLD }}>
                  PLAY →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Frame({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  return (
    <div className="gutter pb-20 pt-28">
      <BackButton onClick={() => navigate()}>BACK TO ALL GAMES</BackButton>
      <h1 className="mt-5 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.92] tracking-wide text-bone">{title.toUpperCase()}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">{blurb}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

const pill = (active: boolean) => `rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition ${active ? 'border-[#c9a24b] bg-[#c9a24b] text-ink' : 'border-white/15 text-mist hover:border-white/40 hover:text-bone'}`;
const btn = 'rounded-full border px-5 py-2 text-xs font-bold tracking-[0.2em] transition hover:bg-white/5 disabled:opacity-40';
const card = 'rounded-2xl border border-white/10 bg-ink-2 p-5';

function Page({ id, data }: { id: TileId; data: Data }) {
  const t = TILES.find((x) => x.id === id)!;
  return (
    <Frame title={t.title} blurb={t.blurb}>
      {id === 'digit' ? <Digit /> : id === 'guess' ? <Guess data={data} /> : id === 'quiz' ? <Quiz data={data} /> : id === 'duel' ? <Duel data={data} /> : <HigherLower data={data} />}
    </Frame>
  );
}

/* ---------- Digit Cricket ---------- */

type Mode = 'batting' | 'bowling' | 'super' | null;
function Digit() {
  const [mode, setMode] = useState<Mode>(null);
  if (mode === 'batting') return <Batting onBack={() => setMode(null)} />;
  if (mode === 'bowling') return <Bowling onBack={() => setMode(null)} />;
  if (mode === 'super') return <SuperOver onBack={() => setMode(null)} />;
  const cards: { id: Exclude<Mode, null>; title: string; text: string }[] = [
    { id: 'batting', title: 'Batting', text: 'Send six digits and survive the over. The umpire sends the bowler’s digits back.' },
    { id: 'bowling', title: 'Bowling', text: 'Send your six bowling digits, then watch the batsman try to get past them.' },
    { id: 'super', title: 'Super Over', text: 'Chase a target in 3 overs with 2 wickets. Win to build a streak.' },
  ];
  return (
    <>
      <ul className="grid max-w-4xl gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setMode(c.id)} className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-white/10 bg-ink-2 p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#c9a24b]/60">
              <span className="font-display text-3xl tracking-wide text-bone">{c.title.toUpperCase()}</span>
              <span className="text-sm leading-relaxed text-mist">{c.text}</span>
              <span className="mt-auto text-xs font-semibold tracking-[0.2em] transition group-hover:translate-x-1" style={{ color: GOLD }}>
                PLAY →
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className={`${card} mt-8 max-w-4xl`}>
        <h3 className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: GOLD }}>
          THE RULES
        </h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-mist">
          <li>An over is six digits, each from <b className="text-bone">0 to 6</b> — the runs of that ball.</li>
          <li>The batsman’s and bowler’s digits are compared place by place. The first place with the <b className="text-bone">same digit</b> is where the batsman is out.</li>
          <li>The runs are the batsman’s digits <b className="text-bone">before</b> that ball; if nothing matches, all six count.</li>
          <li>Super Over: three overs, two wickets. Each over you send six digits; the bowler’s are drawn at random. Beat the target to win.</li>
        </ul>
      </div>
    </>
  );
}

type SoLog = { over: number; bowl: number[]; outOn: number | null; runs: number };
function SuperOver({ onBack }: { onBack: () => void }) {
  const newTarget = () => 12 + Math.floor(Math.random() * 19);
  const [target, setTarget] = useState(newTarget);
  const [state, setState] = useState({ runs: 0, wickets: 0, over: 0 });
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<SoLog[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [rec, setRec] = useState(() => loadJson('superover', { streak: 0, best: 0 }));
  const finished = done;
  const won = state.runs >= target;

  const send = () => {
    const bat = parseDigits(text);
    if (!bat) return setError('Send exactly six digits, each from 0 to 6 — for example 634251.');
    setError('');
    const bowl = randomDigits();
    const r = playOver(bat, bowl);
    const next = superOverStep(state, r);
    setLog((l) => [...l, { over: state.over + 1, bowl, outOn: r.outOn, runs: r.runs }]);
    setState(next);
    setText('');
    if (next.runs >= target || next.done) {
      setDone(true);
      const w = next.runs >= target;
      const nextRec = { streak: w ? rec.streak + 1 : 0, best: Math.max(rec.best, w ? rec.streak + 1 : 0) };
      setRec(nextRec);
      saveJson('superover', nextRec);
    }
  };
  const again = () => {
    setTarget(newTarget());
    setState({ runs: 0, wickets: 0, over: 0 });
    setLog([]);
    setDone(false);
    setText('');
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <BackButton onClick={onBack}>BACK</BackButton>
        <p className="text-xs text-mist">Streak <b className="text-bone">{rec.streak}</b> · Best <b className="text-bone">{rec.best}</b></p>
      </div>
      <div className={card}>
        <p className="font-display text-3xl tracking-wide text-bone">
          {state.runs}/{state.wickets} <span className="text-base text-mist">· target {target} · over {Math.min(state.over + 1, 3)} of 3</span>
        </p>
        <ul className="mt-4 space-y-2 text-sm text-mist">
          {log.map((l) => (
            <li key={l.over}>
              Over {l.over}: bowler {l.bowl.join('')} — {l.outOn ? `OUT on the ${ordinal(l.outOn)} ball` : 'not out'}, {l.runs} run{l.runs === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
        {finished ? (
          <div className="mt-5">
            <p className="font-display text-2xl tracking-wide" style={{ color: won ? GOLD : '#ff6b6b' }}>
              {won ? `YOU WON — ${state.runs} FOR ${state.wickets}` : `YOU FELL SHORT — ${state.runs} FOR ${state.wickets}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={again} className={btn} style={{ borderColor: GOLD, color: GOLD }}>
                PLAY AGAIN
              </button>
              <ShareButton title="Super Over" lines={[won ? 'I won the chase!' : 'I fell short.', `${state.runs}/${state.wickets} chasing ${target}`, `Win streak: ${rec.streak}`]} file="iocf-super-over" />
            </div>
          </div>
        ) : (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5">
              <input value={text} onChange={(e) => setText(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))} inputMode="numeric" autoComplete="off" aria-label="Your six digits" placeholder="Over digits, six from 0 to 6" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-bone outline-none placeholder:text-smoke" />
              <button type="submit" className="text-sm font-semibold disabled:opacity-40" style={{ color: GOLD }} disabled={!text.trim()}>
                Bat
              </button>
            </div>
            <p role="alert" className="mt-1.5 min-h-[1rem] px-2 text-[11px] text-[#ff6b6b]">
              {error}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------- Guess the Player ---------- */

const toGuess = (s: Stats): GuessPlayer => ({ name: s.name, boardName: s.boardName, matches: s.matches, runs: s.runs, wickets: s.wickets, hs: s.hsText || null, best: s.best, pom: s.pom, fifties: s.fifties, hundreds: s.hundreds, formats: s.formats });

function Guess({ data }: { data: Data }) {
  const pool = useMemo(() => data.stats.filter((s) => s.matches >= 3 && s.boardName && s.boardName !== '—'), [data]);
  const names = useMemo(() => [...new Set(data.stats.map((s) => s.name))].sort(), [data]);
  const draw = () => pool[Math.floor(Math.random() * pool.length)];
  const [target, setTarget] = useState<Stats | undefined>(draw);
  const [shown, setShown] = useState(1);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState<null | { won: boolean; points: number }>(null);
  const [wrong, setWrong] = useState(false);
  const [score, setScore] = useState(() => loadJson('guess', { total: 0, best: 0, rounds: 0 }));
  const clues = useMemo(() => (target ? cluesFor(toGuess(target)) : []), [target]);
  if (!target) return <Notice tone="info">There are not enough player statistics yet to play this.</Notice>;

  const finish = (won: boolean) => {
    const points = won ? guessPoints(shown, clues.length) : 0;
    setResult({ won, points });
    const next = { total: score.total + points, best: Math.max(score.best, points), rounds: score.rounds + 1 };
    setScore(next);
    saveJson('guess', next);
  };
  const submit = () => {
    if (isGuess(guess, target.name)) finish(true);
    else {
      setWrong(true);
      if (shown < clues.length) setShown(shown + 1);
      else finish(false);
    }
    setGuess('');
  };
  const again = () => {
    setTarget(draw());
    setShown(1);
    setResult(null);
    setWrong(false);
    setGuess('');
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-xs text-mist">Total <b className="text-bone">{score.total}</b> points · {score.rounds} rounds · best round <b className="text-bone">{score.best}</b></p>
      <div className={card}>
        <ol className="space-y-2 text-sm text-bone">
          {clues.slice(0, shown).map((c, i) => (
            <li key={i} className="rounded-xl bg-white/5 px-4 py-2.5">
              <span className="mr-2 text-[10px] font-semibold tracking-[0.2em]" style={{ color: GOLD }}>CLUE {i + 1}</span>
              {c}
            </li>
          ))}
        </ol>
        {result ? (
          <div className="mt-5">
            <p className="font-display text-2xl tracking-wide" style={{ color: result.won ? GOLD : '#ff6b6b' }}>
              {result.won ? `CORRECT — ${result.points} POINT${result.points === 1 ? '' : 'S'}` : 'OUT OF CLUES'}
            </p>
            <p className="mt-1 text-sm text-mist">It was <b className="text-bone">{target.name}</b> of {target.boardName}.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={again} className={btn} style={{ borderColor: GOLD, color: GOLD }}>
                NEXT PLAYER
              </button>
              <ShareButton title="Guess the Player" lines={[result.won ? `I got it with ${shown} clue${shown === 1 ? '' : 's'}!` : 'This one beat me.', `Round: ${result.points} points`, `Total: ${score.total} points`]} file="iocf-guess-the-player" />
            </div>
          </div>
        ) : (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (guess.trim()) submit();
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5">
              <input list="fun-players" value={guess} onChange={(e) => setGuess(e.target.value)} autoComplete="off" aria-label="Your guess" placeholder="Type a player’s name" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-bone outline-none placeholder:text-smoke" />
              <button type="submit" className="text-sm font-semibold disabled:opacity-40" style={{ color: GOLD }} disabled={!guess.trim()}>
                Guess
              </button>
            </div>
            <datalist id="fun-players">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p role="alert" className="mt-1.5 min-h-[1rem] px-2 text-[11px] text-[#ff6b6b]">
              {wrong ? 'Not him — here is another clue.' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button type="button" disabled={shown >= clues.length} onClick={() => setShown(shown + 1)} className={btn} style={{ borderColor: GOLD, color: GOLD }}>
                NEXT CLUE (−1 POINT)
              </button>
              <button type="button" onClick={() => finish(false)} className={`${btn} border-white/15 text-mist`}>
                GIVE UP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---------- Daily Quiz ---------- */

type QuizRecord = { day: string; score: number; streak: number; lastDay: string; best: number };
function Quiz({ data }: { data: Data }) {
  const day = dayKey();
  const quiz: QuizQuestion[] = useMemo(() => {
    const boards = data.b.boards;
    const bd = boards.map((b) => ({ name: b.name, overallRank: data.i.overallRank(b), credits: data.i.creditsOf(b), chairman: b.chairman }));
    const top = (cat: 'batting' | 'bowling', cid: string) => rankPlayers(data.people, CATEGORIES[cat].find((c) => c.id === cid)!).slice(0, 12).map((r) => r.name);
    const byTitles = [...boards].sort((a, b) => data.i.titlesOf(b) - data.i.titlesOf(a));
    const clearLeader = byTitles[0] && data.i.titlesOf(byTitles[0]) > (byTitles[1] ? data.i.titlesOf(byTitles[1]) : 0);
    return makeQuiz(day, { boards: bd, runs: top('batting', 'runs'), wickets: top('bowling', 'wickets'), titles: clearLeader ? [byTitles[0].name] : [], series: [] });
  }, [data, day]);
  const [rec, setRec] = useState<QuizRecord | null>(() => loadJson<QuizRecord | null>('quiz', null));
  const playedToday = rec?.day === day;
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  if (!quiz.length) return <Notice tone="info">There is not enough data for a quiz yet.</Notice>;
  if (playedToday && rec) return <QuizResult rec={rec} total={quiz.length} />;

  const q = quiz[i];
  const next = () => {
    if (i + 1 < quiz.length) {
      setI(i + 1);
      setPicked(null);
      return;
    }
    const yesterday = dayKey(Date.now() - 86400000);
    const streak = rec?.lastDay === yesterday ? rec.streak + 1 : 1;
    const nextRec: QuizRecord = { day, score, streak, lastDay: day, best: Math.max(rec?.best ?? 0, score) };
    saveJson('quiz', nextRec);
    setRec(nextRec);
  };
  const choose = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    if (n === q.answer) setScore((s) => s + 1);
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-xs text-mist">Question {i + 1} of {quiz.length} · score <b className="text-bone">{score}</b></p>
      <div className={card}>
        <p className="text-lg font-semibold text-bone">{q.q}</p>
        <ul className="mt-4 grid gap-2">
          {q.options.map((o, n) => {
            const state = picked === null ? '' : n === q.answer ? 'border-emerald-400 bg-emerald-400/10' : n === picked ? 'border-red-400 bg-red-400/10' : 'opacity-50';
            return (
              <li key={o}>
                <button type="button" disabled={picked !== null} onClick={() => choose(n)} className={`w-full rounded-xl border px-4 py-3 text-left text-sm text-bone transition ${state || 'border-white/15 hover:border-[#c9a24b]'}`}>
                  {o}
                </button>
              </li>
            );
          })}
        </ul>
        {picked !== null && (
          <div className="mt-4">
            <p className="text-sm text-mist">{picked === q.answer ? 'Correct! ' : 'Not quite. '}{q.why}</p>
            <button type="button" onClick={next} className={`${btn} mt-3`} style={{ borderColor: GOLD, color: GOLD }}>
              {i + 1 < quiz.length ? 'NEXT QUESTION' : 'FINISH'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizResult({ rec, total }: { rec: QuizRecord; total: number }) {
  return (
    <div className={`${card} max-w-2xl`}>
      <p className="text-[11px] font-semibold tracking-[0.24em]" style={{ color: GOLD }}>TODAY’S QUIZ · {rec.day}</p>
      <p className="mt-2 font-display text-5xl tracking-wide text-bone">{rec.score} / {total}</p>
      <p className="mt-2 text-sm text-mist">Daily streak <b className="text-bone">{rec.streak}</b> · best score <b className="text-bone">{rec.best}</b>. Come back tomorrow for five new questions.</p>
      <div className="mt-4">
        <ShareButton title="Daily IOCF Quiz" lines={[`I scored ${rec.score} / ${total} today`, `Daily streak: ${rec.streak}`, rec.day]} file="iocf-daily-quiz" />
      </div>
    </div>
  );
}

/* ---------- Head-to-Head Duel ---------- */

function Duel({ data }: { data: Data }) {
  const [kind, setKind] = useState<'boards' | 'players'>('boards');
  return (
    <>
      <div role="group" aria-label="Compare" className="mb-5 flex gap-2">
        <button type="button" aria-pressed={kind === 'boards'} onClick={() => setKind('boards')} className={pill(kind === 'boards')}>Boards</button>
        <button type="button" aria-pressed={kind === 'players'} onClick={() => setKind('players')} className={pill(kind === 'players')}>Players</button>
      </div>
      {kind === 'boards' ? <BoardDuel data={data} /> : <PlayerDuel data={data} />}
    </>
  );
}

type Row = { label: string; a: number | undefined; b: number | undefined; low?: boolean; show?: (n: number) => string };
function Versus({ left, right, rows }: { left: string; right: string; rows: Row[] }) {
  let l = 0;
  let r = 0;
  const cells = rows.map((row) => {
    const both = row.a !== undefined && row.b !== undefined && row.a !== row.b;
    const aWins = both && (row.low ? row.a! < row.b! : row.a! > row.b!);
    const bWins = both && !aWins;
    if (aWins) l++;
    if (bWins) r++;
    const fmt = (n: number | undefined) => (n === undefined ? '—' : row.show ? row.show(n) : n.toLocaleString('en-IN'));
    return { ...row, aWins, bWins, fa: fmt(row.a), fb: fmt(row.b) };
  });
  const verdict = l === r ? 'A DRAW' : `${(l > r ? left : right).toUpperCase()} WINS`;
  return (
    <div className={`${card} max-w-2xl`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <p className="font-display text-2xl text-bone">{left}</p>
        <p className="text-xs text-smoke">VS</p>
        <p className="font-display text-2xl text-bone">{right}</p>
      </div>
      <ul className="mt-4 divide-y divide-white/5">
        {cells.map((c) => (
          <li key={c.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 text-center text-sm">
            <span className={c.aWins ? 'font-bold' : 'text-mist'} style={c.aWins ? { color: GOLD } : undefined}>{c.fa}</span>
            <span className="w-32 text-[10px] font-semibold tracking-[0.16em] text-smoke">{c.label.toUpperCase()}</span>
            <span className={c.bWins ? 'font-bold' : 'text-mist'} style={c.bWins ? { color: GOLD } : undefined}>{c.fb}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-2xl tracking-wide" style={{ color: GOLD }}>{verdict} · {l}–{r}</p>
        <ShareButton title={`${left} vs ${right}`} lines={[verdict, `${l} – ${r} on ${rows.length} stats`, ...cells.slice(0, 3).map((c) => `${c.label}: ${c.fa} v ${c.fb}`)]} file="iocf-duel" />
      </div>
    </div>
  );
}

function Select({ label, value, options, onPick }: { label: string; value: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <label className="block text-xs text-mist">
      {label}
      <select value={value} onChange={(e) => onPick(e.target.value)} className="mt-1 block w-full rounded-xl border border-white/15 bg-ink-2 px-3 py-2 text-sm text-bone">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function BoardDuel({ data }: { data: Data }) {
  const names = useMemo(() => data.b.boards.map((b) => b.name).sort(), [data]);
  const [a, setA] = useState(names[0] ?? '');
  const [b, setB] = useState(names[1] ?? names[0] ?? '');
  const find = (n: string) => data.b.boards.find((x) => x.name === n)!;
  const rowsFor = (n: string) => {
    const board = find(n);
    const slug = slugOf(n);
    return {
      rank: data.i.overallRank(board),
      credits: data.i.creditsOf(board),
      titles: data.i.titlesOf(board),
      players: store.players.filter((p) => p.boardId === slug).length,
      runs: data.stats.filter((s) => slugOf(s.boardName) === slug).reduce((t, s) => t + s.runs, 0),
      wickets: data.stats.filter((s) => slugOf(s.boardName) === slug).reduce((t, s) => t + s.wickets, 0),
    };
  };
  const x = rowsFor(a);
  const y = rowsFor(b);
  return (
    <>
      <div className="mb-5 grid max-w-2xl grid-cols-2 gap-3">
        <Select label="First board" value={a} options={names} onPick={setA} />
        <Select label="Second board" value={b} options={names} onPick={setB} />
      </div>
      <Versus left={a} right={b} rows={[
        { label: 'Overall rank', a: x.rank, b: y.rank, low: true, show: (n) => `#${n}` },
        { label: 'Credits', a: x.credits, b: y.credits },
        { label: 'Major titles', a: x.titles, b: y.titles },
        { label: 'Players', a: x.players, b: y.players },
        { label: 'Total runs', a: x.runs, b: y.runs },
        { label: 'Total wickets', a: x.wickets, b: y.wickets },
      ]} />
    </>
  );
}

function PlayerDuel({ data }: { data: Data }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const names = useMemo(() => [...new Set(data.stats.filter((s) => s.matches > 0).map((s) => s.name))].sort(), [data]);
  const find = (n: string) => data.stats.find((s) => norm(s.name) === norm(n));
  const x = find(a);
  const y = find(b);
  return (
    <>
      <datalist id="fun-duel-players">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="mb-5 grid max-w-2xl grid-cols-2 gap-3">
        {([['First player', a, setA], ['Second player', b, setB]] as const).map(([label, v, set]) => (
          <label key={label} className="block text-xs text-mist">
            {label}
            <input list="fun-duel-players" value={v} onChange={(e) => set(e.target.value)} autoComplete="off" placeholder="Type a name" className="mt-1 block w-full rounded-xl border border-white/15 bg-ink-2 px-3 py-2 text-sm text-bone placeholder:text-smoke" />
          </label>
        ))}
      </div>
      {x && y && x !== y ? (
        <Versus left={x.name} right={y.name} rows={[
          { label: 'Matches', a: x.matches, b: y.matches },
          { label: 'Runs', a: x.runs, b: y.runs },
          { label: 'Highest score', a: x.hs, b: y.hs, show: (n) => String(n) },
          { label: 'Fifties', a: x.fifties, b: y.fifties },
          { label: 'Hundreds', a: x.hundreds, b: y.hundreds },
          { label: 'Wickets', a: x.wickets, b: y.wickets },
          { label: 'Player of the Match', a: x.pom, b: y.pom },
        ]} />
      ) : (
        <p className="max-w-2xl text-sm text-mist">Pick two different players who have played matches — start typing a name and choose from the list.</p>
      )}
    </>
  );
}

/* ---------- Higher or Lower ---------- */

const STATS = [
  { id: 'runs' as const, label: 'Runs' },
  { id: 'wickets' as const, label: 'Wickets' },
  { id: 'matches' as const, label: 'Matches' },
];
function HigherLower({ data }: { data: Data }) {
  const [stat, setStat] = useState<(typeof STATS)[number]['id']>('runs');
  const rng = useRef(mulberry32((Date.now() ^ 0x9e3779b9) >>> 0));
  const draw = (s = stat) => pairFor(data.stats, s, rng.current);
  const [pair, setPair] = useState(() => draw());
  const [answer, setAnswer] = useState<null | boolean>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => loadJson<number>('higher', 0));
  const label = STATS.find((s) => s.id === stat)!.label.toLowerCase();

  if (!pair) return <Notice tone="info">There are not enough player statistics yet to play this.</Notice>;
  const pick = (higher: boolean) => {
    const right = higherLowerRight(pair.a[stat], pair.b[stat], higher);
    setAnswer(right);
    if (right) {
      setStreak(streak + 1);
      if (streak + 1 > best) {
        setBest(streak + 1);
        saveJson('higher', streak + 1);
      }
    }
  };
  const next = (s = stat, reset = false) => {
    setPair(draw(s));
    setAnswer(null);
    if (reset) setStreak(0);
  };
  const reveal = answer !== null;

  return (
    <div className="max-w-2xl">
      <div role="group" aria-label="Statistic" className="mb-4 flex flex-wrap gap-2">
        {STATS.map((s) => (
          <button key={s.id} type="button" aria-pressed={stat === s.id} onClick={() => { setStat(s.id); next(s.id, true); }} className={pill(stat === s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-mist">Streak <b className="text-bone">{streak}</b> · best <b className="text-bone">{best}</b></p>
      <div className={card}>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="font-display text-2xl text-bone">{pair.a.name}</p>
            <p className="text-xs text-smoke">{pair.a.boardName}</p>
            <p className="mt-3 font-display text-5xl" style={{ color: GOLD }}>{pair.a[stat]}</p>
            <p className="text-xs text-mist">{label}</p>
          </div>
          <div>
            <p className="font-display text-2xl text-bone">{pair.b.name}</p>
            <p className="text-xs text-smoke">{pair.b.boardName}</p>
            <p className="mt-3 font-display text-5xl" style={{ color: GOLD }}>{reveal ? pair.b[stat] : '?'}</p>
            <p className="text-xs text-mist">{label}</p>
          </div>
        </div>
        {reveal ? (
          <div className="mt-5">
            <p className="font-display text-2xl tracking-wide" style={{ color: answer ? GOLD : '#ff6b6b' }}>{answer ? 'RIGHT!' : 'WRONG — STREAK ENDS'}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => next(stat, !answer)} className={btn} style={{ borderColor: GOLD, color: GOLD }}>
                {answer ? 'NEXT' : 'TRY AGAIN'}
              </button>
              {!answer && <ShareButton title="Higher or Lower" lines={[`Streak: ${streak}`, `Best: ${best}`, `Stat: ${label}`]} file="iocf-higher-or-lower" />}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => pick(true)} className={btn} style={{ borderColor: GOLD, color: GOLD }}>
              {pair.b.name.split(' ')[0].toUpperCase()} HAS MORE ▲
            </button>
            <button type="button" onClick={() => pick(false)} className={`${btn} border-white/25 text-bone`}>
              FEWER ▼
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
