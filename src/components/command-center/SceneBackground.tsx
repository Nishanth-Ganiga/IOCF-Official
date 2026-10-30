import { useMemo } from 'react';
import { mix, paletteOf, type BoardTheme, type SceneId } from '../../data/commandCenter/boardConfig';

/** Small seeded random numbers, so a board's landscape is the same every time it is drawn. */
function rng(seed: string) {
  let s = [...seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const W = 1200;
const H = 320;

/** A jagged mountain range as a closed polygon along the bottom. */
function range(r: () => number, peaks: number, base: number, min: number, max: number) {
  const pts: [number, number][] = [[0, H]];
  const step = W / peaks;
  for (let i = 0; i <= peaks; i++) {
    pts.push([i * step - step * 0.5 * r(), base - (min + (max - min) * r())]);
    pts.push([i * step + step * 0.5, base - (min + (max - min) * r()) * 0.35]);
  }
  pts.push([W, H]);
  return pts.map((p) => p.join(',')).join(' ');
}

/** A smooth rolling line as a closed path. */
function rolling(r: () => number, base: number, amp: number, waves: number) {
  let d = `M0,${H} L0,${base}`;
  const step = W / waves;
  for (let i = 0; i < waves; i++) {
    const y1 = base - amp * r();
    const y2 = base - amp * r();
    d += ` C${i * step + step * 0.33},${y1} ${i * step + step * 0.66},${y2} ${(i + 1) * step},${base - amp * 0.4 * r()}`;
  }
  return `${d} L${W},${H} Z`;
}

type Pal = ReturnType<typeof paletteOf>;
type Props = { theme: BoardTheme; pal: Pal };

const Sun = ({ x, y, rad, color }: { x: number; y: number; rad: number; color: string }) => <circle cx={x} cy={y} r={rad} fill={color} opacity={0.5} />;

function Alps({ theme, pal }: Props) {
  const r = rng(theme.slug);
  const far = range(r, 6, 250, 120, 210);
  const near = range(r, 9, 290, 60, 140);
  return (
    <>
      <polygon points={far} fill={pal.far} opacity={0.9} />
      {/* snow on the far range */}
      <polygon points={far} fill="url(#snow)" opacity={0.55} />
      <polygon points={near} fill={pal.near} />
    </>
  );
}

function Hills({ theme, pal, castle }: Props & { castle?: boolean }) {
  const r = rng(theme.slug);
  return (
    <>
      <path d={rolling(r, 230, 70, 4)} fill={pal.far} opacity={0.8} />
      {castle && (
        <g fill={pal.mid} opacity={0.95}>
          <rect x={820} y={150} width={130} height={80} />
          <rect x={812} y={128} width={24} height={102} />
          <rect x={934} y={128} width={24} height={102} />
          <polygon points="812,128 824,106 836,128" />
          <polygon points="934,128 946,106 958,128" />
          <rect x={868} y={110} width={30} height={40} />
        </g>
      )}
      <path d={rolling(r, 270, 50, 5)} fill={pal.mid} />
      <path d={rolling(r, 305, 28, 6)} fill={pal.near} />
    </>
  );
}

function Palms({ x, h, color }: { x: number; h: number; color: string }) {
  return (
    <g stroke={color} fill={color}>
      <path d={`M${x},${H} Q${x + 14},${H - h * 0.5} ${x + 4},${H - h}`} strokeWidth={5} fill="none" />
      {[-70, -35, 0, 35, 70].map((a) => (
        <path key={a} d={`M${x + 4},${H - h} q${a * 0.9},${-30 + Math.abs(a) * 0.25} ${a * 1.4},${12 + Math.abs(a) * 0.1}`} strokeWidth={4} fill="none" />
      ))}
    </g>
  );
}

function Coast({ theme, pal, delta }: Props & { delta?: boolean }) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={900} y={170} rad={46} color={pal.far} />
      <path d={rolling(r, 250, 8, 8)} fill={pal.far} opacity={0.7} />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M0,${262 + i * 14} Q300,${254 + i * 14} 600,${262 + i * 14} T1200,${262 + i * 14}`} stroke={pal.far} strokeWidth={2} fill="none" opacity={0.6 - i * 0.1} />
      ))}
      <path d={rolling(r, 300, 26, 5)} fill={pal.near} />
      {(delta ? [90, 190, 1010] : [70, 150, 1040, 1120]).map((x, i) => (
        <Palms key={x} x={x} h={110 + (i % 2) * 30} color={pal.near} />
      ))}
    </>
  );
}

function Desert({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={300} y={190} rad={54} color={pal.far} />
      <path d={rolling(r, 240, 50, 3)} fill={pal.far} opacity={0.85} />
      <path d={rolling(r, 280, 40, 4)} fill={pal.mid} />
      <path d={rolling(r, 312, 22, 5)} fill={pal.near} />
    </>
  );
}

function Outback({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={880} y={200} rad={86} color={pal.far} />
      <path d={rolling(r, 262, 24, 6)} fill={pal.mid} />
      <g fill={pal.near} stroke={pal.near}>
        <path d="M200,320 L204,240 L196,214 M204,240 L226,222" strokeWidth={5} fill="none" />
        <ellipse cx={196} cy={206} rx={30} ry={14} />
        <ellipse cx={228} cy={216} rx={22} ry={10} />
      </g>
      <path d={rolling(r, 308, 14, 7)} fill={pal.near} />
    </>
  );
}

function Skyline({ theme, pal }: Props) {
  const r = rng(theme.slug);
  const towers: { x: number; w: number; h: number }[] = [];
  for (let x = 0; x < W; x += 36 + r() * 30) towers.push({ x, w: 26 + r() * 40, h: 70 + r() * 150 });
  return (
    <>
      <g fill={pal.far} opacity={0.65}>
        {towers.filter((_, i) => i % 2).map((t) => (
          <rect key={`f${t.x}`} x={t.x + 14} y={H - t.h * 0.8} width={t.w} height={t.h * 0.8} />
        ))}
      </g>
      <g fill={pal.near}>
        {towers.map((t) => (
          <rect key={t.x} x={t.x} y={H - t.h} width={t.w} height={t.h} />
        ))}
        {/* one landmark spire */}
        <polygon points="640,320 650,120 660,320" />
        <rect x={646} y={96} width={8} height={30} />
      </g>
      <g fill={pal.mid} opacity={0.7}>
        {towers.slice(0, 18).map((t) => (
          <rect key={`w${t.x}`} x={t.x + 6} y={H - t.h + 10} width={4} height={4} />
        ))}
      </g>
    </>
  );
}

function Acacia({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <g fill={color} stroke={color}>
      <path d={`M${x},${y} L${x + 2 * s},${y - 40 * s} M${x + 2 * s},${y - 40 * s} L${x - 20 * s},${y - 56 * s} M${x + 2 * s},${y - 40 * s} L${x + 24 * s},${y - 58 * s}`} strokeWidth={4 * s} fill="none" />
      <ellipse cx={x + 2 * s} cy={y - 64 * s} rx={56 * s} ry={13 * s} />
    </g>
  );
}

function Savanna({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={820} y={240} rad={96} color={pal.far} />
      <path d={rolling(r, 276, 18, 6)} fill={pal.mid} />
      <Acacia x={210} y={300} s={1.5} color={pal.near} />
      <Acacia x={430} y={308} s={1} color={pal.near} />
      <Acacia x={1010} y={302} s={1.3} color={pal.near} />
      <path d={rolling(r, 312, 10, 8)} fill={pal.near} />
    </>
  );
}

function Forest({ theme, pal }: Props) {
  const r = rng(theme.slug);
  const row = (y: number, size: number, fill: string, opacity = 1) => {
    const trees = [];
    for (let x = -10; x < W + 20; x += size * 0.7 + r() * size * 0.4) {
      const h = size * (1.4 + r() * 0.9);
      trees.push(<polygon key={`${y}-${x}`} points={`${x},${y} ${x + size / 2},${y - h} ${x + size},${y}`} fill={fill} opacity={opacity} />);
    }
    return trees;
  };
  return (
    <>
      <polygon points={range(r, 7, 240, 80, 150)} fill={pal.far} opacity={0.7} />
      {row(300, 46, pal.mid, 0.9)}
      {row(330, 62, pal.near)}
    </>
  );
}

function Historic({ theme, pal }: Props) {
  const r = rng(theme.slug);
  const dome = (x: number, w: number, h: number, fill: string) => (
    <g fill={fill}>
      <rect x={x} y={H - h} width={w} height={h} />
      <path d={`M${x},${H - h} A${w / 2},${w / 2} 0 0 1 ${x + w},${H - h}`} />
      <rect x={x + w / 2 - 2} y={H - h - w / 2 - 22} width={4} height={22} />
    </g>
  );
  return (
    <>
      <path d={rolling(r, 250, 24, 5)} fill={pal.far} opacity={0.7} />
      {dome(180, 120, 110, pal.mid)}
      {dome(830, 150, 130, pal.mid)}
      <g fill={pal.mid}>
        <rect x={540} y={110} width={34} height={210} />
        <polygon points="536,110 557,66 578,110" />
      </g>
      <g fill={pal.near}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${60 + i * 170},${H} v-60 a30,30 0 0 1 60,0 v60 z`} />
        ))}
      </g>
      <path d={rolling(r, 312, 10, 7)} fill={pal.near} />
    </>
  );
}

function Palace({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={240} y={190} rad={50} color={pal.far} />
      <path d={rolling(r, 262, 16, 5)} fill={pal.far} opacity={0.7} />
      <g fill={pal.mid}>
        <rect x={430} y={170} width={340} height={150} />
        <path d="M530,170 a70,70 0 0 1 140,0 z" />
        <rect x={596} y={80} width={8} height={30} />
        {[420, 760].map((x) => (
          <g key={x}>
            <rect x={x} y={120} width={22} height={200} />
            <path d={`M${x - 4},120 a15,15 0 0 1 30,0 z`} />
          </g>
        ))}
        {[470, 700].map((x) => (
          <path key={x} d={`M${x},170 a24,24 0 0 1 48,0 z`} />
        ))}
      </g>
      <path d={rolling(r, 310, 14, 7)} fill={pal.near} />
    </>
  );
}

function Fuji({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={900} y={120} rad={62} color={pal.strong} />
      <polygon points="330,320 600,70 870,320" fill={pal.far} />
      <polygon points="535,130 600,70 665,130 640,118 612,136 590,116 560,138" fill="url(#snow)" opacity={0.9} />
      <path d={rolling(r, 290, 26, 5)} fill={pal.mid} />
      <g fill={pal.near}>
        <rect x={150} y={230} width={7} height={90} />
        <rect x={218} y={230} width={7} height={90} />
        <path d="M134,226 q58,-26 108,0 l-4,-12 q-50,-22 -100,0 z" />
        <rect x={150} y={246} width={75} height={6} />
      </g>
      <path d={rolling(r, 312, 10, 7)} fill={pal.near} />
    </>
  );
}

function Windmill({ x, s, color }: { x: number; s: number; color: string }) {
  const y = 310;
  return (
    <g fill={color} stroke={color}>
      <polygon points={`${x - 16 * s},${y} ${x - 8 * s},${y - 78 * s} ${x + 8 * s},${y - 78 * s} ${x + 16 * s},${y}`} stroke="none" />
      <g transform={`translate(${x} ${y - 82 * s})`} strokeWidth={5 * s}>
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1={0} y1={0} x2={0} y2={-64 * s} transform={`rotate(${a + 20})`} />
        ))}
      </g>
    </g>
  );
}

function Polder({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <Sun x={950} y={230} rad={64} color={pal.far} />
      <path d={rolling(r, 282, 10, 6)} fill={pal.mid} />
      <Windmill x={250} s={1.3} color={pal.near} />
      <Windmill x={720} s={1} color={pal.near} />
      <Windmill x={1030} s={1.5} color={pal.near} />
      <path d={rolling(r, 312, 8, 8)} fill={pal.near} />
    </>
  );
}

function Tableau({ theme, pal }: Props) {
  const r = rng(theme.slug);
  return (
    <>
      <polygon points="150,320 220,150 300,142 760,142 840,150 940,320" fill={pal.far} />
      <polygon points="0,320 0,230 200,200 380,260 520,320" fill={pal.mid} opacity={0.9} />
      <path d={rolling(r, 296, 22, 6)} fill={pal.near} />
    </>
  );
}

const SCENES: Record<SceneId, (p: Props) => React.ReactElement> = {
  alps: Alps,
  hills: Hills,
  highlands: (p) => <Hills {...p} castle />,
  delta: (p) => <Coast {...p} delta />,
  coast: Coast,
  desert: Desert,
  outback: Outback,
  skyline: Skyline,
  savanna: Savanna,
  forest: Forest,
  historic: Historic,
  palace: Palace,
  fuji: Fuji,
  polder: Polder,
  tableau: Tableau,
};

/**
 * The backdrop of a board dashboard: a dark wash in the board's colours with its national landscape drawn along the
 * bottom. A photograph (`backgroundImage` in boards.json) replaces the drawing when one is provided.
 */
export default function SceneBackground({ theme }: { theme: BoardTheme }) {
  const pal = useMemo(() => paletteOf(theme), [theme]);
  const Scene = SCENES[theme.scene];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(180deg, ${pal.deep} 0%, ${pal.base} 62%, ${mix(pal.base, '#000000', 0.35)} 100%)` }}>
      {theme.backgroundImage && <img src={theme.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[58%] w-full min-h-[220px]">
        <defs>
          <linearGradient id="snow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {!theme.backgroundImage && <Scene theme={theme} pal={pal} />}
      </svg>
      {/* the national colours as a thin band across the top */}
      <div className="absolute inset-x-0 top-0 flex h-1">
        {pal.stripe.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
