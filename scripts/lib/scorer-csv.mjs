// Reads a STUMPS scorer export (one CSV per tournament) into compact rows. Shared by the franchise-league and the
// Major Tournaments stats builds. The parsing itself lives in src/data/commandCenter/scorerCsv.mjs (the Command Center server uses it too).
import { readFileSync } from 'node:fs';
import { FIELDS, FIELD_NAMES, parseCsv, parseScorerText } from '../../src/data/commandCenter/scorerCsv.mjs';

export { FIELDS, FIELD_NAMES, parseCsv };

/** One export file → { title, tour, rows } (rows without the "No." column). */
export function readScorerCsv(path) {
  return parseScorerText(readFileSync(path, 'utf8'), path);
}
