import boardsJson from './boards.json';
import modulesJson from './modules.json';

/**
 * One configuration for all 26 boards (boards.json) drives every board dashboard — there is no per-board component.
 * To restyle a board, edit its entry: colours, the background scene, the mascot. To use a real photo instead of the drawn
 * scene, add `"backgroundImage": "/command-center/<slug>.jpg"` to its entry and put the file in public/command-center/.
 * The same file is read by the server (server/command/handler.mjs) for the official list of boards.
 */

export type SceneId = 'alps' | 'hills' | 'highlands' | 'delta' | 'coast' | 'desert' | 'outback' | 'skyline' | 'savanna' | 'forest' | 'historic' | 'palace' | 'fuji' | 'polder' | 'tableau';

export type BoardTheme = {
  slug: string;
  name: string;
  /** Flag emoji; West Indies has none (a badge is shown instead). */
  flag: string | null;
  colors: { primary: string; secondary: string; accent: string };
  scene: SceneId;
  /** Optional photograph used instead of the drawn scene. */
  backgroundImage?: string;
  mascot: { name: string; emoji?: string; image?: string };
};

export const BOARD_THEMES = boardsJson as BoardTheme[];
export const themeOf = (slug: string | null | undefined) => BOARD_THEMES.find((b) => b.slug === slug);

export type ModuleDef = { id: string; title: string; description: string; status: 'active' | 'coming-soon'; icon: string };
export const MODULES = modulesJson as ModuleDef[];

/* ---------- colour helpers ---------- */

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = ([r, g, b]: number[]) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** `a` mixed with `b`: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function luminance(hex: string) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Lightens a colour until it reads clearly on a dark background. */
export function lift(hex: string, minLum = 0.22) {
  let c = hex;
  for (let i = 0; i < 12 && luminance(c) < minLum; i++) c = mix(c, '#ffffff', 0.12);
  return c;
}

/** The derived palette a board dashboard is painted with. */
export function paletteOf(t: BoardTheme) {
  const ink = '#08080b';
  return {
    /** Page background: the board's main colour, taken most of the way to black so the premium dark look holds. */
    base: mix(t.colors.primary, ink, luminance(t.colors.primary) < 0.04 ? 0.15 : 0.84),
    deep: mix(t.colors.primary, ink, 0.94),
    /** Readable highlight (borders, badges, headings). */
    highlight: lift(t.colors.accent),
    strong: lift(t.colors.secondary, 0.3),
    stripe: [t.colors.primary, t.colors.secondary, t.colors.accent],
    far: mix(t.colors.secondary, ink, 0.8),
    mid: mix(t.colors.primary, ink, 0.7),
    near: mix(t.colors.primary, ink, 0.9),
  };
}
