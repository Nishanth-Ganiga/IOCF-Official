// Parses the franchise league sheets (teams, squads, matches, awards) and the Champions League squads.
import { isNum, norm, s, slug, stripEmoji, titleCase } from './helpers.mjs';

const SHEETS = [
  ['PSL 2026', 'psl', 'PSL'],
  ['BBL 2026', 'bbl', 'BBL'],
  ['BPL 2026', 'bpl', 'BPL'],
  ['IPL 2026', 'ipl', 'IPL'],
  ['CPL 2026', 'cpl', 'CPL'],
  ['SPL 2026', 'spl', 'SPL'],
  ['KCL 2026', 'kcl', 'KCL'],
  ['QECL', 'qecl', 'QECL'],
  ['100 2026', 'hundred', 'THE 100'],
];

const BC = {
  ita: 'Italy', sco: 'Scotland', neth: 'Netherlands', sri: 'Sri Lanka', ban: 'Bangladesh', ne: 'Nepal', ind: 'India', nz: 'New Zealand', scot: 'Scotland', eng: 'England', aus: 'Australia', pak: 'Pakistan',
  wi: 'West Indies', sa: 'South Africa', sl: 'Sri Lanka', bd: 'Bangladesh', nd: 'Netherlands', ned: 'Netherlands', qatar: 'Qatar', italy: 'Italy', afg: 'Afghanistan', uae: 'UAE', can: 'Canada',
  zim: 'Zimbabwe', ire: 'Ireland', uga: 'Uganda', usa: 'USA', png: 'Papua New Guinea', nep: 'Nepal', por: 'Portugal', jpn: 'Japan', japan: 'Japan', ken: 'Kenya', spain: 'Spain', india: 'India',
  srilanka: 'Sri Lanka', nepal: 'Nepal',
};
const ROLE = { c: 'Captain', m: 'Marquee', ds: 'DS' };

function parsePrice(x) {
  const pm = /^(\d+(?:\.\d+)?)\s*([kKlL])?\s*(?:\(\s*(.*?)\s*\))?$/.exec(x.replace(/,/g, '').trim());
  if (!pm) return [null, null];
  const mult = { k: 1000, l: 100000 }[(pm[2] ?? '').toLowerCase()] ?? 1;
  return [Math.round(parseFloat(pm[1]) * mult), pm[3] || null];
}

function parsePlayer(txt) {
  let t = s(txt) ?? '';
  t = t.replace(/^\d+\s*[.)]\s*/, '');
  const segs = t.split(/\s+-\s+/).map((x) => x.trim());
  const head = segs[0];
  const extras = segs.slice(1);
  const fixed = [];
  for (const e of extras) {
    const m = /^([A-Za-z]+)\s+(\d[\d.,]*\s*[kKlL]?.*)$/.exec(e);
    if (m && norm(m[1]) in BC) fixed.push(m[1], m[2]);
    else fixed.push(e);
  }
  let price = null;
  let note = null;
  let role = null;
  let board = null;
  for (let e of fixed) {
    e = e.replace(/^[ )]+|[ )]+$/g, '');
    const [pr, pn] = parsePrice(e);
    if (pr !== null) {
      price = pr;
      if (pn) note = pn;
    } else if (norm(e) in BC) board = BC[norm(e)];
    else if (e) note = (note ? `${note}; ` : '') + e;
  }
  const tags = [...head.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const name = head.replace(/\s*\([^)]*\)/g, '').replace(/^[ -)]+|[ -)]+$/g, '');
  for (let tg of tags) {
    tg = tg.trim();
    const m2 = /^(C|M|DS)\s*-\s*(.+)$/i.exec(tg);
    if (m2) {
      role = ROLE[m2[1].toLowerCase()];
      board = BC[norm(m2[2])] ?? m2[2];
    } else if (norm(tg) in BC) board = BC[norm(tg)];
  }
  return { name, role, board, price, note };
}

function levenshteinRatio(a, b) {
  // similarity in [0,1], comparable to difflib's cutoff use
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[m][n] / Math.max(m, n);
}

function teamResolver(names) {
  const initials = (n) => (n.match(/[A-Za-z]+/g) ?? []).map((w) => w[0]).join('').toLowerCase();
  const over = { pbks: 'punjabkings', pkbs: 'punjabkings', srh: 'sunrisershyderabad' };
  return (tok) => {
    if (!tok) return null;
    let k = norm(stripEmoji(tok));
    k = over[k] ?? k;
    for (const n of names) if (norm(stripEmoji(n)) === k) return n;
    for (const n of names) if (initials(stripEmoji(n)) === k) return n;
    let c = names.filter((n) => norm(n).startsWith(k) || k.startsWith(norm(n)));
    if (c.length === 1) return c[0];
    c = names.filter((n) => k && norm(n).includes(k));
    if (c.length === 1) return c[0];
    let best = null;
    let bestScore = 0.78;
    for (const n of names) {
      const sc = levenshteinRatio(k, norm(n));
      if (sc >= bestScore) {
        best = n;
        bestScore = sc;
      }
    }
    return best;
  };
}

function findPlayer(team, name) {
  const k = norm(name);
  if (!k) return null;
  for (const p of team.players) if (norm(p.name) === k) return p;
  const toks = name.toLowerCase().split(/\s+/);
  let c = team.players.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === toks[0]);
  if (c.length === 1) return c[0];
  c = team.players.filter((p) => norm(p.name).startsWith(k) || k.startsWith(norm(p.name)));
  if (c.length === 1) return c[0];
  return null;
}

function parseLeague(book, sheet, lid) {
  const ws = book.sheet(sheet);
  const L = { id: lid, teams: [], matches: [], awards: [] };
  const rows = {};
  for (let r = 1; r <= ws.maxRow; r++) {
    const v = s(ws.get(r, 1)) ?? '';
    const low = v.toLowerCase();
    if (low.includes('all teams') && !rows.teams) rows.teams = r;
    else if (low === 'all match updates') rows.matches = r;
    else if (low.includes('awards') && low.startsWith('iocf')) {
      rows.awards = r;
      L.title = v.replace(/^iocf\s+/i, '').replace(/\s*awards\s*$/i, '').trim();
    } else if (low.includes('tournament cancelled')) L.status = 'Cancelled';
  }
  for (let r = 1; r < (rows.teams ?? 6); r++) {
    for (let c = 1; c <= ws.maxCol; c++) {
      const v = s(ws.get(r, c)) ?? '';
      const m = /^(.*?)\s*\(\s*home\s*\)\s*$/i.exec(v);
      if (m && !L.host) L.host = BC[norm(m[1])] ?? m[1].trim();
    }
  }
  if (!rows.teams) throw new Error(`${sheet}: could not find the "All TEAMS" section`);
  const hr = rows.teams + 1;
  const end = rows.matches ?? ws.maxRow + 1;
  for (let c = 1; c <= ws.maxCol; c++) {
    const raw = s(ws.get(hr, c));
    if (!raw) continue;
    const tn = stripEmoji(raw);
    const T = { name: tn === tn.toUpperCase() && /[A-Z]/.test(tn) ? titleCase(tn) : tn, players: [], notes: [] };
    for (let r = hr + 1; r < end; r++) {
      const v = s(ws.get(r, c));
      if (!v) continue;
      if (/^\d+\s*[.)]/.test(v)) {
        const { name, role, board, price, note } = parsePlayer(v);
        if (name) {
          const P = { name };
          if (role) P.role = role;
          if (board) P.board = board;
          if (price !== null) P.price = price;
          if (note) P.note = note;
          T.players.push(P);
        }
      } else T.notes.push(v);
    }
    L.teams.push(T);
  }
  const resolve = teamResolver(L.teams.map((t) => t.name));
  if (rows.matches) {
    const h = rows.matches + 1;
    const heads = {};
    for (let c = 1; c <= ws.maxCol; c++) if (s(ws.get(h, c))) heads[norm(s(ws.get(h, c)))] = c;
    const col = (...names) => names.map((n) => heads[n]).find((x) => x !== undefined);
    const cDate = col('date'), cVen = col('venue'), cWin = col('winner'), cUmp = col('umpire'), cMom = col('manofthematch'), cBat = col('bestbatsman'), cBowl = col('bestbowler');
    const stop = rows.awards ?? ws.maxRow + 1;
    for (let r = h + 1; r < Math.min(stop, ws.maxRow + 1); r++) {
      let sched = s(ws.get(r, 1));
      if (!sched) continue;
      if (sched.toLowerCase().includes('cancel')) {
        L.status = 'Cancelled';
        break;
      }
      let stage = null;
      const m = /^(Grand Final|Qualifier\s*\d|Eliminator|Finals?|Semi[- ]?finals?\s*\d?|Q\d|E|SF\d?)\s*:\s*(.*)$/i.exec(sched);
      if (m) {
        stage = m[1];
        sched = m[2];
      }
      const mm = /^[A-Za-z ]+\((.+)\)\s*$/.exec(sched);
      if (mm && / vs/i.test(mm[1])) {
        stage = sched.split('(')[0].trim();
        sched = mm[1];
      }
      const parts = sched.split(/\s+vs\.?\s+/i);
      if (parts.length !== 2) continue;
      const a = resolve(parts[0]);
      const b = resolve(parts[1]);
      const win = cWin ? s(ws.get(r, cWin)) : null;
      const w = win ? resolve(win) : null;
      const M = { teams: [a ?? parts[0], b ?? parts[1]] };
      if (stage) M.stage = stage;
      for (const [key, cc] of [['date', cDate], ['venue', cVen], ['umpire', cUmp]]) {
        const v = cc ? s(ws.get(r, cc)) : null;
        if (v) M[key] = v;
      }
      if (win) M.winner = w ?? win;
      for (const [key, cc] of [['mom', cMom], ['bat', cBat], ['bowl', cBowl]]) {
        const v = cc ? s(ws.get(r, cc)) : null;
        if (v) M[key] = v;
      }
      L.matches.push(M);
    }
  }
  if (rows.awards) {
    const h = rows.awards + 1;
    for (let r = h + 1; r <= ws.maxRow; r++) {
      const a = s(ws.get(r, 1));
      if (!a) {
        if (r > h + 14) break;
        continue;
      }
      const [B, , D] = [2, 3, 4].map((c) => s(ws.get(r, c)));
      let Cc = s(ws.get(r, 3));
      const c5 = ws.get(r, 5);
      const c3 = ws.get(r, 3);
      const cred = isNum(c5) ? c5 : isNum(c3) ? c3 : null;
      if (Cc && isNum(c3)) Cc = null;
      const A = { award: a };
      if (B) A.winner = B;
      if (Cc) A.team = Cc;
      if (D) A.board = D;
      if (cred !== null) A.credits = Math.trunc(cred);
      L.awards.push(A);
    }
  }
  if (lid === 'bpl' && !L.title) L.title = 'Bangladesh Premier League 2026';
  return L;
}

function parseChampionsLeague(book) {
  const ws = book.sheet('Champions league');
  const BN = { newzealand: 'New Zealand', srilanka: 'Sri Lanka', westindies: 'West Indies', southafrica: 'South Africa', png: 'Papua New Guinea' };
  const bn = (x) => {
    const t = (x ?? '').trim();
    if (!t || norm(t) === 'noboard') return null;
    return BN[norm(t)] ?? t;
  };
  let end = ws.maxRow + 1;
  for (let r = 2; r <= ws.maxRow; r++) {
    if ((s(ws.get(r, 1)) ?? '').toLowerCase().startsWith('champions league all conf')) {
      end = r;
      break;
    }
  }
  const CL = { id: 'champions-league', title: 'Champions League', teams: [], matches: [], awards: [], status: 'Squads announced' };
  for (let c = 1; c <= ws.maxCol; c++) {
    const head = s(ws.get(2, c));
    const tn0 = s(ws.get(3, c));
    if (!tn0) continue;
    const tn = stripEmoji(tn0);
    const T = { name: tn === tn.toUpperCase() && /[A-Z]/.test(tn) ? titleCase(tn) : tn, players: [], notes: head ? [head] : [] };
    for (let r = 4; r < end; r++) {
      let v = s(ws.get(r, c));
      if (!v || !/^\d+\s*[.)]/.test(v)) continue;
      v = v.replace(/^\d+\s*[.)]\s*/, '');
      let role = null;
      const m = /\((Captain|Marquee)\)/.exec(v);
      if (m) {
        role = m[1];
        v = v.replace(m[0], '');
      }
      const i = v.indexOf(' - ');
      const name = i >= 0 ? v.slice(0, i) : v;
      const b = bn(i >= 0 ? v.slice(i + 3) : '');
      const P = { name: name.trim() };
      if (role) P.role = role;
      if (b) P.board = b;
      T.players.push(P);
    }
    CL.teams.push(T);
  }
  return CL;
}

export function buildLeagues(book) {
  const raw = SHEETS.map(([sheet, id]) => parseLeague(book, sheet, id));
  raw.push(parseChampionsLeague(book));
  const short = Object.fromEntries(SHEETS.map(([, id, sh]) => [id, sh]));
  short['champions-league'] = 'CL';
  const cleanTitle = (t) => {
    const x = (t ?? '').replace(/\s*2026\s*$/, '').trim();
    return x === x.toUpperCase() && /[A-Z]/.test(x) ? titleCase(x) : x;
  };
  const out = [];
  let unmatched = 0;
  for (const L of raw) {
    const names = L.teams.map((t) => t.name);
    const res = teamResolver(names);
    const teams = Object.fromEntries(L.teams.map((t) => [t.name, t]));
    for (const t of L.teams) {
      t.id = slug(t.name).replace(/^-+|-+$/g, '');
      t.players.forEach((p, i) => (p.id = `${L.id}-${t.id}-${String(i + 1).padStart(2, '0')}`));
    }
    let champs = null;
    let runners = null;
    let fair = null;
    for (const a of L.awards) {
      const low = a.award.toLowerCase();
      const w = a.winner;
      if (low.startsWith('champion')) champs = res(w) ?? w;
      else if (low.startsWith('runner')) runners = res(w) ?? w;
      else if (low.startsWith('fair')) fair = res(w) ?? w;
      else {
        const ws = (w ?? '').split(/\s*&\s*/).map((x) => x.trim());
        const ts = (a.team ?? '').split(/\s*&\s*/).map((x) => x.trim());
        ws.forEach((wn, i) => {
          const tn = res(i < ts.length ? ts[i] : ts[0]);
          if (tn) {
            const p = findPlayer(teams[tn], wn);
            if (p) (p.honours ??= []).push({ title: a.award, ...(a.credits !== undefined ? { credits: a.credits } : {}) });
            else unmatched++;
          }
        });
      }
    }
    for (const m of L.matches) {
      for (const [key, fld] of [['mom', 'mom'], ['bat', 'bat'], ['bowl', 'bowl']]) {
        const v = m[key];
        if (!v) continue;
        for (const part of v.split(/\s*&\s*|\s*\/\s*/)) {
          const mm = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(part.trim());
          const nm = mm ? mm[1] : part.trim();
          const code = mm ? mm[2] : null;
          const tn = code ? res(code) : null;
          const tl = tn ? [tn] : m.teams;
          let hit = null;
          for (const t of tl) {
            if (teams[t]) {
              const p = findPlayer(teams[t], nm);
              if (p) {
                hit = p;
                break;
              }
            }
          }
          if (hit) hit[fld] = (hit[fld] ?? 0) + 1;
          else unmatched++;
        }
      }
    }
    const o = { id: L.id, name: cleanTitle(L.title), shortName: short[L.id], status: L.status || 'Completed' };
    if (L.host) o.host = L.host;
    if (champs) o.champions = champs;
    if (runners) o.runnersUp = runners;
    if (fair) o.fairPlay = fair;
    o.teams = L.teams.map((t) => {
      const x = { id: t.id, name: t.name };
      if (t.notes.length) x.notes = t.notes;
      x.players = t.players;
      return x;
    });
    o.matches = L.matches;
    o.awards = L.awards.filter((a) => !/^(champion|runner|fair)/i.test(a.award));
    out.push(o);
  }
  return { leagues: out, unmatched };
}
