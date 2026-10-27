// Parses the board sheets and federation-wide sheets of the IOCF workbook into boards, players, umpires and info.
import { BOARD_SHEETS, boardName, cleanName, fmtn, isNum, norm, s, slug, stripEmoji, titleCase, trimChars } from './helpers.mjs';

/* ---------------- extraction (raw rows) ---------------- */

function extractBoard(book, sheetName, name) {
  const ws = book.sheet(sheetName);
  const b = { name, roster: [], umpires: [], awards: [] };
  for (let r = 1; r <= 7; r++) {
    const v = s(ws.get(r, 1)) ?? '';
    if (/^chairman\s*:/i.test(v)) {
      const parts = v.split('|').map((p) => p.trim());
      b.chairman = parts[0].replace(/^chairman\s*:\s*/i, '').trim();
      for (const p of parts.slice(1)) {
        const m = /^ceo\s*:\s*(.*)$/i.exec(p);
        if (m && trimChars(m[1], ' -').length) b.ceo = m[1].trim();
      }
    }
    const sp = /^([a-z ]*sponsors?)\s*:\s*(.+)$/i.exec(v);
    if (sp) (b.sponsors ??= []).push(`${titleCase(sp[1])}: ${sp[2].trim()}`);
    if (v.toLowerCase().startsWith('credits left')) {
      for (let rr = r; rr < r + 5; rr++) {
        const x = ws.get(rr, 1);
        if (isNum(x)) {
          b.credits = fmtn(x);
          break;
        }
      }
    }
  }
  let hdr = null;
  for (let r = 1; r < 15; r++) {
    if (/^players:?$/.test((s(ws.get(r, 1)) ?? '').toLowerCase())) {
      hdr = r;
      break;
    }
  }
  const seen = new Set();
  if (hdr) {
    for (let r = hdr + 1; r <= ws.maxRow; r++) {
      const v = ws.get(r, 1);
      if (typeof v !== 'string') continue;
      if (/^\s*all franchise|^\s*franchise/i.test(v)) break;
      if (/^\s*\d+\s*[.)]\s*(\S.*)$/.test(v)) {
        const nm = cleanName(v);
        if (norm(nm) && !seen.has(norm(nm))) {
          seen.add(norm(nm));
          b.roster.push(nm);
        }
      }
    }
  }
  const heading = (c) => {
    for (let cc = c; cc >= 1; cc--) {
      let v = hdr ? s(ws.get(hdr, cc)) : null;
      if (v) {
        v = stripEmoji(v);
        if (v.includes(':')) v = v.replace(/\s*:.*$/, '');
        return trimChars(v.replace(/\s+/g, ' ').trim(), ' :(');
      }
    }
    return 'Tournament';
  };
  // player award blocks: an "Award" | "Credits" header pair, player names in the column to the left
  for (let r = 1; r <= Math.min(ws.maxRow, 80); r++) {
    for (let c = 2; c < ws.maxCol - 1; c++) {
      if (!(s(ws.get(r, c)) === 'Award' && s(ws.get(r, c + 1)) === 'Credits')) continue;
      const pc = c - 1;
      const tour = heading(pc);
      let cur = null;
      let blank = 0;
      for (let rr = r + 1; rr <= ws.maxRow; rr++) {
        const a = s(ws.get(rr, pc));
        const aw = s(ws.get(rr, pc + 1));
        const cr = ws.get(rr, pc + 2);
        if (!a && !aw && (cr === null || cr === undefined)) {
          blank++;
          if (blank >= 3) break;
          continue;
        }
        blank = 0;
        if (a) cur = /^\d+\s*[.)]/.test(a) ? cleanName(a) : null;
        if (cur && aw) {
          const m = /^(.*?)\s*(?:\((\d+)\))?\s*:\s*(\d+)\s*(?:\((\d+)\))?$/.exec(aw);
          let title;
          let count = null;
          let each = null;
          if (m) {
            title = trimChars(m[1].trim(), ' -');
            count = Number(m[3]);
            each = m[2] || m[4] || null;
          } else title = aw;
          b.awards.push({ player: cur, tournament: tour, title, count, each: each ? Number(each) : null });
        }
      }
    }
  }
  // umpire table
  for (let r = 1; r < 40; r++) {
    for (let c = 1; c < ws.maxCol - 3; c++) {
      if (!((s(ws.get(r, c)) ?? '').toLowerCase() === 'umpire' && (s(ws.get(r, c + 1)) ?? '').toLowerCase() === 'details')) continue;
      let cur = null;
      let cat = null;
      let blank = 0;
      for (let rr = r + 1; rr <= ws.maxRow; rr++) {
        const a = s(ws.get(rr, c));
        const d = s(ws.get(rr, c + 1));
        const m = ws.get(rr, c + 2);
        const cr = ws.get(rr, c + 3);
        const pt = ws.get(rr, c + 4);
        const empty = (x) => x === null || x === undefined;
        if (!a && !d && empty(m) && empty(cr) && empty(pt)) {
          blank++;
          if (blank >= 3) break;
          continue;
        }
        blank = 0;
        if (a && /^\d+\s*[.)]/.test(a)) {
          cur = { name: cleanName(a), rows: [], credits: null, points: null };
          b.umpires.push(cur);
          cat = null;
        }
        if (!cur) continue;
        if (d && d.toLowerCase().startsWith('total')) {
          cur.credits = isNum(cr) ? cr : null;
          cur.points = isNum(pt) ? pt : null;
          continue;
        }
        if (d) {
          if (empty(m) && empty(cr) && empty(pt)) cat = d;
          else cur.rows.push({ cat, details: d, matches: isNum(m) ? m : null, credits: isNum(cr) ? cr : null, points: isNum(pt) ? pt : null });
        }
      }
    }
  }
  return b;
}

function extractFederation(book) {
  // available credits + tournament awards (credits sheet)
  const cs = book.sheet('All Board Credits & Important U');
  const credits = {};
  for (let r = 3; r <= cs.maxRow; r++) {
    const raw = cs.get(r, 1);
    const n = raw ? boardName(raw) : null;
    const v = cs.get(r, 2);
    if (n && isNum(v) && r < 30) credits[n] = fmtn(v);
  }
  const tawards = [];
  let tour = null;
  let started = false;
  for (let r = 1; r <= cs.maxRow; r++) {
    if (s(cs.get(r, 1)) === 'Tournament Name') {
      started = true;
      continue;
    }
    if (!started) continue;
    const [a, bb, cc, dd] = [1, 2, 3, 4].map((i) => s(cs.get(r, i)));
    if (a) tour = a;
    if (!bb && !cc) continue;
    if (!tour) continue;
    tawards.push({ tournament: tour, award: bb, winner: cc, board: dd });
  }
  // board rankings
  const br = book.sheet('Board Rankings');
  const rankings = {};
  let fmt = null;
  for (let r = 1; r <= br.maxRow; r++) {
    const a = s(br.get(r, 1)) ?? '';
    const m = /^(.*?)\s*ranking$/i.exec(a);
    if (m && r > 13) {
      fmt = m[1].replace('Format', '').trim();
      rankings[fmt] = [];
      continue;
    }
    if (fmt && boardName(a)) {
      const row = [2, 3, 4, 5, 6, 7, 8].map((i) => br.get(r, i));
      const pts = row[6];
      rankings[fmt].push({
        board: boardName(a),
        played: isNum(row[0]) ? fmtn(row[0]) : null,
        won: isNum(row[1]) ? fmtn(row[1]) : null,
        points: isNum(pts) ? Math.round(pts * 10) / 10 : null,
      });
    }
  }
  // councils (IOCF 2.0)
  const c2 = book.sheet('IOCF 2.0');
  const council = {};
  const councilNames = [];
  for (let c = 1; c <= c2.maxCol; c++) {
    const h = s(c2.get(1, c));
    if (!h) continue;
    councilNames.push(h);
    for (let r = 2; r <= c2.maxRow; r++) {
      const v = c2.get(r, c);
      const n = v ? boardName(cleanName(v)) : null;
      if (n) council[n] = h;
    }
  }
  // Hall of Fame cards
  const hof = [];
  const cards = book.sheet('IOCF Cards');
  let card = null;
  let desc = null;
  for (let r = 1; r <= cards.maxRow; r++) {
    const a = s(cards.get(r, 1)) ?? '';
    if (a.toLowerCase().startsWith('card name')) {
      card = a.split(':').slice(1).join(':').trim();
      desc = null;
      continue;
    }
    if (card && a.toLowerCase().startsWith('best players')) {
      desc = a;
      continue;
    }
    if (card && boardName(cards.get(r, 2) ?? '') && a.toLowerCase() !== 'player name') {
      hof.push({ card, period: desc, player: a, board: boardName(cards.get(r, 2)), award: s(cards.get(r, 3)), achievement: s(cards.get(r, 4)) });
    }
  }
  // all-time player records
  const atr = book.sheet('All Time Records');
  const records = [];
  let rf = null;
  for (let r = 1; r <= atr.maxRow; r++) {
    const a = s(atr.get(r, 1)) ?? '';
    const m = /^(\w+)\s+Format$/.exec(a);
    if (m) {
      rf = m[1].toUpperCase();
      continue;
    }
    if (rf && a.toLowerCase().startsWith('highest score by a player')) {
      const nm = s(atr.get(r, 2));
      const bd = boardName(atr.get(r, 3) ?? '');
      const v = atr.get(r, 4);
      if (nm && bd && isNum(v)) records.push({ format: rf, player: nm, board: bd, highestScore: fmtn(v) });
    }
  }
  return { credits, tawards, rankings, council, councilNames, hof, records };
}

/* ---------------- assembly ---------------- */

const FM = { CLUB: 'club', T10: 't10', T20: 't20', ODI: 'odi', TEST: 'test' };
const FMT_MAP = [['club', 'club'], ['t10', 't10'], ['t20', 't20'], ['odi', 'odi'], ['test', 'test'], ['100', 'hundred']];
const numFix = (x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 100) / 100 : x);

export function buildLedger(book) {
  const B = {};
  for (const [sheet, name] of Object.entries(BOARD_SHEETS)) B[name] = extractBoard(book, sheet, name);
  const fed = extractFederation(book);

  const players = {};
  const index = {};
  const unmatched = [];
  const addPlayer = (board, name) => {
    const p = { name, ach: [], tour: new Map(), hl: [], formats: {} };
    (players[board] ??= []).push(p);
    (index[board] ??= new Map()).set(norm(name), p);
    return p;
  };
  for (const [board, b] of Object.entries(B)) for (const n of b.roster) addPlayer(board, n);

  const match = (board, name, create = true) => {
    const ix = (index[board] ??= new Map());
    const k = norm(name);
    if (!k) return null;
    if (ix.has(k)) return ix.get(k);
    const toks = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cands = [];
    for (const p of players[board] ?? []) {
      const pt = p.name.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (pt.length && toks.length && pt[0] === toks[0] && (pt.length === 1 || toks.length === 1 || pt[1][0] === toks[1][0])) cands.push(p);
    }
    if (cands.length === 1) {
      ix.set(k, cands[0]);
      return cands[0];
    }
    if (create) {
      const p = addPlayer(board, name);
      unmatched.push([board, name]);
      return p;
    }
    return null;
  };
  const push = (p, title, detail) => {
    const e = { title };
    if (detail) e.detail = detail;
    const kk = `${title.toLowerCase()}|${(detail ?? '').toLowerCase()}`;
    if (p.ach.some((x) => `${x.title.toLowerCase()}|${(x.detail ?? '').toLowerCase()}` === kk)) return;
    p.ach.push(e);
  };

  for (const [board, b] of Object.entries(B)) {
    const agg = new Map();
    const ids = new Map();
    for (const a of b.awards) {
      const p = match(board, a.player);
      if (!ids.has(p)) ids.set(p, ids.size);
      const key = `${ids.get(p)}|${a.tournament}|${a.title}`;
      if (!agg.has(key)) agg.set(key, [p, a.tournament, a.title, 0, a.each]);
      agg.get(key)[3] += a.count || 1;
      p.tour.set(a.tournament, (p.tour.get(a.tournament) ?? 0) + 1);
    }
    for (const [p, tour, title, cnt, each] of agg.values()) {
      push(p, title, tour + (cnt > 1 ? ` · ×${cnt}` : '') + (each ? ` · ${each} credits each` : ''));
    }
  }

  for (const t of fed.tawards) {
    const w = t.winner;
    const bd = t.board;
    if (!w || !bd) continue;
    const ws = w.split(/\s*&\s*/).map((x) => x.trim());
    const bs = bd.split(/\s*&\s*/).map((x) => x.trim());
    if (ws.length !== bs.length) continue;
    ws.forEach((wn, i) => {
      const bn = bs[i];
      const bn2 = Object.keys(B).find((k) => norm(k) === norm(bn) || (norm(k).startsWith(norm(bn).slice(0, 5)) && norm(bn).slice(0, 5) === norm(k).slice(0, 5)));
      if (!bn2) return;
      const p = match(bn2, wn);
      push(p, t.award, t.tournament);
      if (!p.tour.has(t.tournament)) p.tour.set(t.tournament, 0);
    });
  }
  for (const h of fed.hof) {
    const p = match(h.board, h.player);
    p.hl.push({ title: `${h.award} — ${h.achievement}`, detail: `${h.card} · ${h.period}` });
  }
  for (const r of fed.records) {
    const p = match(r.board, r.player);
    (p.formats[FM[r.format]] ??= {}).highestScore = r.highestScore;
    p.hl.push({ title: `All-time IOCF record: highest individual score in ${r.format === 'ODI' ? 'ODI' : r.format.charAt(0) + r.format.slice(1).toLowerCase()}`, detail: String(r.highestScore) });
  }

  // umpires
  const umps = {};
  for (const [board, b] of Object.entries(B)) {
    for (const u of b.umpires) {
      const career = {};
      let total = 0;
      let sumc = 0;
      let sump = 0;
      const ass = [];
      for (const r of u.rows) {
        const det = r.details;
        const comm = det.toLowerCase().includes('comment');
        const line = [];
        if (r.matches !== null) line.push(`${numFix(r.matches)} ${r.matches === 1 ? 'match' : 'matches'}`);
        if (r.credits !== null) line.push(`${numFix(r.credits)} credits`);
        if (r.points !== null) line.push(`${numFix(r.points)} points`);
        ass.push({ title: (r.cat ? `${r.cat} · ` : '') + det, detail: line.join(' · ') });
        if (r.matches !== null && !comm) {
          total += r.matches;
          const low = det.toLowerCase();
          for (const [key, f] of FMT_MAP) {
            if (low.startsWith(key)) {
              career[f] = numFix((career[f] ?? 0) + r.matches);
              break;
            }
          }
        }
        if (r.credits !== null) sumc += r.credits;
        if (r.points !== null) sump += r.points;
      }
      if (total) career.total = numFix(total);
      const perf = {};
      const cr = u.credits !== null ? u.credits : sumc || null;
      const pt = u.points !== null ? u.points : sump || null;
      if (cr !== null) perf.credits = numFix(cr);
      if (pt !== null) perf.points = numFix(pt);
      (umps[board] ??= []).push({ name: u.name, career, performance: perf, assignments: ass, awards: [] });
    }
  }
  for (const t of fed.tawards) {
    if ((t.award ?? '').toLowerCase().includes('umpire') && t.winner && t.board) {
      const bn = Object.keys(B).find((k) => norm(k) === norm(t.board));
      for (const u of umps[bn] ?? []) if (norm(u.name) === norm(t.winner)) u.awards.push({ title: t.award, detail: t.tournament });
    }
  }

  // boards
  const outBoards = [];
  for (const [board, b] of Object.entries(B)) {
    const facts = [];
    const credits = b.credits ?? null;
    if (credits !== null) facts.push({ label: 'Available credits', value: credits.toLocaleString('en-US') });
    if (fed.council[board]) facts.push({ label: 'Council', value: fed.council[board].replace('Council of ', '') });
    const rks = [];
    for (const [f, rows] of Object.entries(fed.rankings)) {
      const valid = rows.filter((r) => r.points && r.points > 0).sort((x, y) => y.points - x.points);
      valid.forEach((r, i) => {
        if (r.board === board) rks.push({ format: f.replace('Overall Board', 'Overall'), rank: i + 1, points: r.points, played: r.played, won: r.won });
      });
    }
    const ch = b.chairman;
    let ach = [];
    if (ch) {
      const p = match(board, ch, false);
      if (p) ach = [...p.ach];
    }
    const ob = { name: board, chairman: ch, ceo: b.ceo, sponsors: b.sponsors, facts, rankings: rks, achievements: ach };
    outBoards.push(Object.fromEntries(Object.entries(ob).filter(([, v]) => v !== undefined && v !== null)));
  }
  const outPlayers = [];
  for (const [board, pl] of Object.entries(players)) {
    pl.forEach((p, i) => {
      const o = { id: `${slug(board)}-${String(i + 1).padStart(2, '0')}`, boardId: slug(board), name: p.name };
      if (Object.keys(p.formats).length) o.formats = Object.fromEntries(Object.entries(p.formats).map(([k, v]) => [k, { batting: v }]));
      if (p.ach.length) o.achievements = p.ach;
      if (p.tour.size) o.tournaments = [...p.tour].map(([t, n]) => ({ title: t, detail: `${n} award${n > 1 ? 's' : ''} recorded` }));
      if (p.hl.length) o.highlights = p.hl;
      outPlayers.push(o);
    });
  }
  const outUmps = [];
  for (const [board, ul] of Object.entries(umps)) {
    ul.forEach((u, i) => {
      const o = { id: `${slug(board)}-${String(i + 1).padStart(2, '0')}`, boardId: slug(board), name: u.name };
      for (const k of ['career', 'performance', 'assignments', 'awards']) {
        const v = u[k];
        if (Array.isArray(v) ? v.length : Object.keys(v).length) o[k] = v;
      }
      outUmps.push(o);
    });
  }
  const ranked = outUmps
    .filter((u) => u.performance?.points !== undefined)
    .sort((a, b) => b.performance.points - a.performance.points || (b.career?.total ?? 0) - (a.career?.total ?? 0) || a.name.localeCompare(b.name))
    .map((u) => u.id);

  return { boards: outBoards, players: outPlayers, umpires: outUmps, umpireOrder: ranked, fed, unmatched: unmatched.length };
}
