import { majorTournaments } from '../../data/tournaments';
import TournamentStatsUpload from './TournamentStatsUpload';

type Nav = (...parts: string[]) => void;

/** Administrator: replace the player statistics of any Major Tournament (the same control also sits on each tournament's page). */
export default function AdminTournamentStats({ nav }: { nav: Nav }) {
  const list = majorTournaments();
  return (
    <div className="gutter pb-20 pt-28">
      <button type="button" onClick={() => nav()} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ��� BACK TO ADMIN DASHBOARD
      </button>
      <header className="mt-6">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[#c9a24b]">MASTER ADMINISTRATOR</p>
        <h1 className="mt-1 font-display text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.9] tracking-wide text-bone">TOURNAMENT STATISTICS</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mist">Replace a Major Tournament&apos;s player statistics with the scorer&apos;s latest CSV, as often as you like — for example the World Test Championship while it is being played. The new file takes the place of the old one everywhere.</p>
      </header>
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {list.map((t) => (
          <li key={t.id} className="rounded-2xl border border-white/10 bg-ink-2 p-5">
            <p className="font-display text-2xl tracking-wide text-bone">{t.name.toUpperCase()}</p>
            <p className="text-xs text-smoke">{t.kind}</p>
            <TournamentStatsUpload id={t.id} name={t.name} />
          </li>
        ))}
      </ul>
    </div>
  );
}
