import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, ApiError, type CcUser, type DashboardInfo } from '../../data/commandApi';
import { MODULES, paletteOf, themeOf, type BoardTheme, type ModuleDef } from '../../data/commandCenter/boardConfig';
import { store } from '../../data/store';
import { EASE } from '../fx';
import Mascot, { BoardFlag, ModuleIcon } from './Mascot';
import SceneBackground from './SceneBackground';

type Nav = (...parts: string[]) => void;

/** One board's area. The server decides whether this account may see it; a refusal is shown as "no access". */
export default function BoardView({ slug, moduleId, user, nav }: { slug: string; moduleId?: string; user: CcUser; nav: Nav }) {
  const theme = themeOf(slug);
  const [state, setState] = useState<{ data?: DashboardInfo; error?: ApiError }>({});
  const admin = user.role === 'admin';
  const base = admin ? ['board', slug] : [];

  useEffect(() => {
    setState({});
    if (!theme) return;
    let live = true;
    api.dashboard(slug).then(
      (data) => live && setState({ data }),
      (e) => live && setState({ error: e instanceof ApiError ? e : new ApiError(0, 'error', 'Something went wrong.') }),
    );
    return () => {
      live = false;
    };
  }, [slug, theme]);

  if (!theme) return <Notice title="Board not found" text="That board does not exist." action={admin ? 'Back to the administrator dashboard' : 'Back to my dashboard'} onAction={() => nav()} />;
  if (state.error?.status === 403 || state.error?.status === 401)
    return <Notice title="No access" text="You do not have access to this board's workspace." action={admin ? 'Back to the administrator dashboard' : 'Back to my dashboard'} onAction={() => nav()} />;
  if (state.error) return <Notice title="Could not load the dashboard" text={state.error.message} action="Try again" onAction={() => setState({})} />;
  if (!state.data) return <div className="gutter pt-40 text-center text-sm text-smoke" aria-busy="true">Loading…</div>;

  const pal = paletteOf(theme);
  const chairman = state.data.chairmanName ?? store.boards.find((b) => b.name === theme.name)?.chairman ?? null;
  const module = MODULES.find((m) => m.id === moduleId);

  return (
    <section className="relative min-h-[100svh] overflow-hidden" style={{ ['--hl' as string]: pal.highlight }}>
      <SceneBackground theme={theme} />
      <div className="relative z-10 pb-24 pt-24">
        {admin && (
          <div role="status" className="gutter mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a24b]/60 bg-black/70 px-4 py-3 backdrop-blur">
              <p className="text-xs font-semibold tracking-[0.2em] text-[#c9a24b]">ADMINISTRATOR PREVIEW · VIEWING THE {theme.name.toUpperCase()} BOARD AS MASTER ADMINISTRATOR</p>
              <button type="button" onClick={() => nav()} className="rounded-full border border-white/25 px-4 py-1.5 text-[11px] font-semibold tracking-[0.2em] text-bone transition hover:border-[#c9a24b] hover:text-[#c9a24b]">
                ← BACK TO ADMIN DASHBOARD
              </button>
            </div>
          </div>
        )}

        {moduleId ? (
          <ModulePage theme={theme} module={module} enabled={state.data.modules.includes(moduleId)} onBack={() => nav(...base)} />
        ) : (
          <Dashboard theme={theme} data={state.data} chairman={chairman} onOpen={(id) => nav(...base, id)} />
        )}
      </div>
    </section>
  );
}

export function Dashboard({ theme, data, chairman, onOpen }: { theme: BoardTheme; data: DashboardInfo; chairman: string | null; onOpen: (id: string) => void }) {
  const pal = paletteOf(theme);
  const name = theme.name.toUpperCase();
  return (
    <div className="gutter">
      <motion.div className="grid items-center gap-8 pb-12 pt-6 md:grid-cols-[1fr_auto]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
        <div>
          <div className="flex items-center gap-4">
            <BoardFlag theme={theme} className="text-5xl sm:text-6xl" />
            <span className="h-10 w-px bg-white/20" aria-hidden />
            <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: pal.highlight }}>
              INTERNATIONAL ONLINE CRICKET FEDERATION
            </p>
          </div>
          <h1 className="mt-6 font-display leading-[0.92] tracking-[0.02em] text-bone" style={{ fontSize: 'clamp(2.2rem, 6.4vw, 5.2rem)' }}>
            WELCOME, {name} CHAIRMAN
          </h1>
          <p className="mt-4 font-display text-2xl tracking-[0.12em] sm:text-3xl" style={{ color: pal.strong }}>
            {name} BOARD
          </p>
          <p className="mt-2 text-sm text-bone/75 sm:text-base">International Online Cricket Federation</p>
          {chairman && (
            <p className="mt-5 text-sm text-mist">
              Chairman · <span className="font-semibold text-bone">{chairman}</span>
            </p>
          )}
        </div>
        <div className="mx-auto flex flex-col items-center gap-2 md:mx-0">
          <Mascot theme={theme} highlight={pal.highlight} className="h-36 w-36 sm:h-48 sm:w-48" />
          <p className="text-[10px] font-semibold tracking-[0.24em] text-smoke">{theme.mascot.name.toUpperCase()}</p>
        </div>
      </motion.div>

      <h2 className="mb-4 text-[11px] font-semibold tracking-[0.24em]" style={{ color: pal.highlight }}>
        BOARD MODULES
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => (
          <li key={m.id}>
            <ModuleTile theme={theme} m={m} enabled={data.modules.includes(m.id)} onOpen={() => onOpen(m.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModuleTile({ theme, m, enabled, onOpen }: { theme: BoardTheme; m: ModuleDef; enabled: boolean; onOpen: () => void }) {
  const pal = paletteOf(theme);
  const active = m.status === 'active' && enabled;
  const badge = active ? 'ACTIVE' : m.status === 'active' ? 'NOT ENABLED' : 'COMING SOON';
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border" style={{ borderColor: active ? pal.highlight : 'rgba(255,255,255,0.12)', color: active ? pal.highlight : '#6d6c75' }}>
          <ModuleIcon icon={m.icon} />
        </span>
        <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.18em]" style={{ borderColor: active ? pal.highlight : 'rgba(255,255,255,0.15)', color: active ? pal.highlight : '#8b8a93' }}>
          {active && <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: pal.highlight }} />}
          {badge}
        </span>
      </span>
      <span className={`mt-4 block font-display text-2xl tracking-wide ${active ? 'text-bone' : 'text-bone/50'}`}>{m.title.toUpperCase()}</span>
      <span className={`mt-1.5 block text-sm leading-relaxed ${active ? 'text-mist' : 'text-smoke'}`}>{m.description}</span>
      {active && (
        <span className="mt-4 block text-xs font-semibold tracking-[0.2em] transition group-hover:translate-x-1" style={{ color: pal.highlight }}>
          OPEN →
        </span>
      )}
    </>
  );
  const base = 'block h-full w-full rounded-2xl border bg-black/55 p-5 text-left backdrop-blur-sm';
  return active ? (
    <button type="button" onClick={onOpen} aria-label={`Open ${m.title}`} className={`group ${base} transition-[transform,border-color] duration-300 hover:-translate-y-0.5`} style={{ borderColor: `${pal.highlight}66` }}>
      {body}
    </button>
  ) : (
    <div aria-disabled="true" className={`${base} cursor-not-allowed border-white/10 opacity-80`}>
      {body}
    </div>
  );
}

/** Where a module opens. The module's own functionality arrives in a later phase; this is its page and its navigation. */
export function ModulePage({ theme, module, enabled, onBack }: { theme: BoardTheme; module?: ModuleDef; enabled: boolean; onBack: () => void }) {
  const pal = paletteOf(theme);
  const ok = module && module.status === 'active' && enabled;
  return (
    <div className="gutter">
      <button type="button" onClick={onBack} className="text-xs font-semibold tracking-[0.2em] text-mist transition hover:text-bone">
        ← BACK TO {theme.name.toUpperCase()} DASHBOARD
      </button>
      {!ok ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-black/60 px-6 py-12 text-center backdrop-blur-sm">
          <p className="text-sm text-bone">This module is not available for the {theme.name} board.</p>
        </div>
      ) : (
        <>
          <header className="mt-8 flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl border" style={{ borderColor: pal.highlight, color: pal.highlight }}>
              <ModuleIcon icon={module.icon} className="h-8 w-8" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.3em]" style={{ color: pal.highlight }}>
                {theme.name.toUpperCase()} BOARD
              </p>
              <h1 className="font-display text-[clamp(2rem,5vw,3.6rem)] leading-[0.95] tracking-wide text-bone">{module.title.toUpperCase()}</h1>
            </div>
          </header>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-bone/80">{module.description}</p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/60 px-6 py-14 text-center backdrop-blur-sm">
            <p className="text-sm text-bone">The {module.title} page is ready and waiting for its content.</p>
            <p className="mt-1 text-xs text-smoke">Its features will appear here in the next phase.</p>
          </div>
        </>
      )}
    </div>
  );
}

function Notice({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="gutter pt-36 text-center">
      <p className="font-display text-3xl tracking-wide text-bone">{title.toUpperCase()}</p>
      <p className="mt-2 text-sm text-mist">{text}</p>
      <button type="button" onClick={onAction} className="mt-5 text-xs font-semibold tracking-[0.2em] text-[#c9a24b] hover:underline">
        {action.toUpperCase()}
      </button>
    </div>
  );
}
