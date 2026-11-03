// Linking the scorer's players of a franchise team to that team's squad. Plain code shared by the browser (data/leagueStats.ts) and the
// server (the rankings' movement is worked out on the server from the same links).
const norm = (s) => s.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]/g, '');

/** CSV team names that are spelt differently in the IOCF dataset (normalised form → normalised dataset spelling). */
const TEAM_ALIASES = { lucknowsupergiants: 'lucknowsupergaints', southernbraves: 'southernbrave' };
export const teamKey = (name) => {
  const k = norm(name);
  return TEAM_ALIASES[k] ?? k;
};

/**
 * Pairs the scorer's name with the squad sheet's spelling where the pattern is clear but the automatic rules cannot
 * decide (shortened or differently transliterated names). Keyed `<league>/<normalised scorer team name>/<scorer name>`.
 */
const SQUAD_ALIASES = {
  'psl/karachikings/Anand Ajikumar': 'Anand Ajk',
  'psl/karachikings/Shibil': 'Shibili',
  'psl/pindiz/Hrushikesh Dinkar': 'Hrushikesh HD',
  'psl/quettagladiators/Suranjan Deepal': 'Suranja',
  'bbl/brisbaneheat/Hasan Musabbir': 'Hasan Mubashir',
  'bbl/sydneysixers/Anand Ajikumar': 'Anand Ajk',
  'bpl/barisalriverriders/Sai Naveen Chowdary': 'Sai Naveen',
  'bpl/chandpurillishtitans/Gopikrishnan Sv': 'Gopi',
  'bpl/mymensinghmavericks/Aditya Mahajan': 'Adithya',
  'bpl/mymensinghmavericks/Bishwajit Dutta': 'Biswajit',
  'ipl/chennaisuperkings/Marami Ahmed': 'Marami',
  'ipl/chennaisuperkings/Muhammad Ahmed Mughal': 'Ahmed',
  'ipl/lucknowsupergiants/Aditya Mahajan': 'Adithya',
  'ipl/lucknowsupergiants/Aashutosh Jha': 'Ashutosh',
  'ipl/royalchallengersbengaluru/Muhammad Ahmad': 'Ahmed',
  'cpl/guyanaamazonwarriors/Harikrishnan': 'Hari',
  'cpl/trinbagoknightriders/Gopikrishnan Sv': 'Gopi',
  'kcl/centralstags/Hrushikesh Dinkar': 'Hrushikesh HD',
  'kcl/queenstownroyals/Shib Asis': 'Shibasis Nayak',
  'hundred/southernbraves/Anand Ajikumar': 'Anand AKJ',
};

/** Squad names carry notes such as "Ashiqui Ashi (C", "Ans Sheikh: 600000" or "Harsh 1500". */
export const cleanSquadText = (s) => s.split(/[:(]/)[0].replace(/[\s-]*\d+\s*$/, '').trim();
const tokens = (s) => (cleanSquadText(s).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Matches the scorer's players of one team to that team's squad, by (1) the agreed aliases, (2) the same name,
 * (3) one name's words being all contained in the other's, (4) a one–two letter spelling difference in a long name.
 * A pair is taken only when each side has exactly one candidate; rules 3–4 repeat until nothing more resolves.
 * Returns scorer index → squad index.
 */
export function linkSquad(leagueId, scorerTeam, scorer, squad) {
  const out = new Map();
  const free = { c: new Set(scorer.keys()), s: new Set(squad.keys()) };
  const take = (i, j) => {
    out.set(i, j);
    free.c.delete(i);
    free.s.delete(j);
  };
  const ck = scorer.map((x) => norm(cleanSquadText(x)));
  const sk = squad.map((x) => norm(cleanSquadText(x)));

  for (const i of [...free.c]) {
    const alias = SQUAD_ALIASES[`${leagueId}/${norm(scorerTeam)}/${scorer[i]}`];
    const j = alias ? squad.findIndex((x, idx) => free.s.has(idx) && x === alias) : -1;
    if (j >= 0) take(i, j);
  }
  for (const i of [...free.c]) {
    const js = [...free.s].filter((j) => sk[j] === ck[i]);
    if (js.length === 1 && [...free.c].filter((k) => ck[k] === ck[i]).length === 1) take(i, js[0]);
  }

  const rules = [
    (i, j) => {
      const a = new Set(tokens(scorer[i]));
      const b = new Set(tokens(squad[j]));
      if (!a.size || !b.size) return false;
      const sub = (x, y) => [...x].every((t) => y.has(t));
      return sub(a, b) || sub(b, a);
    },
    (i, j) => ck[i].length >= 8 && sk[j].length >= 8 && distance(ck[i], sk[j]) <= 2,
  ];
  for (const rule of rules) {
    for (let progress = true; progress; ) {
      progress = false;
      const cand = new Map();
      const back = new Map();
      for (const i of free.c)
        for (const j of free.s)
          if (rule(i, j)) {
            cand.set(i, [...(cand.get(i) ?? []), j]);
            back.set(j, [...(back.get(j) ?? []), i]);
          }
      for (const [i, js] of cand) if (js.length === 1 && back.get(js[0])?.length === 1) {
        take(i, js[0]);
        progress = true;
      }
    }
  }
  return out;
}

