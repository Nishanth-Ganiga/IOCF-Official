// Lines of a scorer export that the uploaded tournament file does not contain, added to that tournament's statistics.
// Each entry adds to the player's row in the tournament (or makes the row if he has none); the same numbers then show on the tournament
// page, his profile and the rankings. Plain code with no imports, used by the browser, the server, the rankings and the mirror sheet.
//
//   tournament: the tournament id (src/data/tournamentStats.ts: "world-test-championship", "asia-cup", …)
//   name, team: as the scorer writes them (the team is the board's name in capitals)
//   add:        the fields to add (any of the scorer's number fields: runs, wickets, matches, …)
//
// If a newer export of that tournament already contains these numbers, remove the entry here, or they would count twice.
export const STAT_CORRECTIONS = [{ tournament: 'world-test-championship', name: 'Hizbullah Sahito', team: 'PAKISTAN', add: { runs: 21, wickets: 2 } }];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The rows of a tournament with the corrections for it added (the rows given are not changed). fields: the column names of the rows. */
export function applyCorrections(id, fields, rows, list = STAT_CORRECTIONS) {
  const mine = list.filter((c) => c.tournament === id);
  if (!mine.length || !Array.isArray(rows) || !rows.length || !Array.isArray(fields)) return rows;
  const ni = fields.indexOf('name');
  const ti = fields.indexOf('team');
  if (ni < 0) return rows;
  const out = rows.map((r) => [...r]);
  for (const c of mine) {
    let row = out.find((r) => norm(r[ni]) === norm(c.name) && (!c.team || ti < 0 || norm(r[ti]) === norm(c.team)));
    if (!row) {
      row = fields.map((f) => (f === 'name' ? c.name : f === 'team' ? c.team : null));
      out.push(row);
    }
    for (const [k, v] of Object.entries(c.add)) {
      const i = fields.indexOf(k);
      if (i >= 0) row[i] = (Number(row[i]) || 0) + v;
    }
  }
  return out;
}
