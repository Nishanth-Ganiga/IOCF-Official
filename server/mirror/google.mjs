// A small Google Sheets client: signs in with a service account (a robot account that only has the access you give it) and writes tabs.
// No library: the sign-in is a signed token (RS256) exchanged for an access token, then plain REST calls to the Sheets API.
//
// The private mirror sheet is shared with the owner and with the service account's e-mail address only. Nothing here is public.
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const b64u = (x) => Buffer.from(x).toString('base64url');

/** The service account's key, from GOOGLE_SERVICE_ACCOUNT_JSON (the JSON itself, or the same JSON in base64). */
export function parseServiceAccount(raw) {
  const text = String(raw ?? '').trim();
  if (!text) throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set.'), { code: 'mirror_not_configured' });
  let json;
  try {
    json = JSON.parse(text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8'));
  } catch {
    throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (paste the whole key file, or its base64).'), { code: 'mirror_not_configured' });
  }
  if (!json.client_email || !json.private_key) throw Object.assign(new Error('The service account key has no client_email / private_key.'), { code: 'mirror_not_configured' });
  return { email: json.client_email, key: String(json.private_key).replace(/\\n/g, '\n') };
}

/** The id inside a Google Sheets link (or the id itself). */
export function sheetIdOf(linkOrId) {
  const s = String(linkOrId ?? '').trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  const id = m ? m[1] : s;
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) throw Object.assign(new Error('MIRROR_SHEET_ID is not set (or is not a Google Sheets link).'), { code: 'mirror_not_configured' });
  return id;
}

export class SheetsClient {
  constructor({ account, sheetId, fetchImpl = fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    this.sleep = sleep;
    this.account = account;
    this.sheetId = sheetId;
    this.fetch = fetchImpl;
    this.now = now;
    this.token = null;
  }

  async accessToken() {
    if (this.token && this.token.expires > this.now() + 60_000) return this.token.value;
    const iat = Math.floor(this.now() / 1000);
    const claim = { iss: this.account.email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
    const unsigned = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify(claim))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.account.key).toString('base64url');
    const res = await this.fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
    if (!res.ok) throw new Error(`Google refused the service account sign-in (${res.status}).`);
    const j = await res.json();
    this.token = { value: j.access_token, expires: this.now() + (Number(j.expires_in) || 3600) * 1000 };
    return this.token.value;
  }

  async call(method, url, body) {
    // Google limits how many writes a minute (60 for a service account): when it says "too many", wait and try again
    for (let attempt = 1; ; attempt++) {
      const token = await this.accessToken();
      const res = await this.fetch(url, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      if ((res.status === 429 || res.status === 503) && attempt < 6) {
        await this.sleep(20_000 * attempt);
        continue;
      }
      return this.answer(res);
    }
  }

  async answer(res) {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 403 || res.status === 404) throw Object.assign(new Error('The service account cannot open the mirror sheet. Share the sheet with the service account e-mail as Editor.'), { code: 'mirror_no_access' });
      throw new Error(`Google Sheets request failed (${res.status}) ${text.slice(0, 160)}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** The tabs the sheet has now: [{ sheetId, title }]. */
  async tabs() {
    const r = await this.call('GET', `${SHEETS}/${this.sheetId}?fields=sheets.properties(sheetId,title)`);
    return (r?.sheets ?? []).map((s) => s.properties);
  }

  /**
   * Makes the sheet hold exactly these tabs, in this order: new tabs are added, each tab is sized to its data and its header row is frozen
   * and in bold. A tab the mirror does not know (one you made yourself) is left alone.
   */
  async prepare(tabs) {
    let have = await this.tabs();
    const missing = tabs.filter((t) => !have.some((h) => h.title === t.name));
    const requests = missing.map((t) => ({ addSheet: { properties: { title: t.name, gridProperties: { rowCount: Math.max(2, t.rows.length + 1), columnCount: Math.max(1, t.header.length) } } } }));
    if (requests.length) await this.call('POST', `${SHEETS}/${this.sheetId}:batchUpdate`, { requests });
    have = await this.tabs();
    const fix = [];
    tabs.forEach((t, index) => {
      const id = have.find((h) => h.title === t.name)?.sheetId;
      if (id === undefined) return;
      fix.push({ updateSheetProperties: { properties: { sheetId: id, index, gridProperties: { rowCount: Math.max(2, t.rows.length + 1), columnCount: Math.max(1, t.header.length), frozenRowCount: 1 } }, fields: 'index,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount' } });
      fix.push({ repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } });
    });
    for (let i = 0; i < fix.length; i += 60) await this.call('POST', `${SHEETS}/${this.sheetId}:batchUpdate`, { requests: fix.slice(i, i + 60) });
  }

  /**
   * Replaces the contents of every tab (header + rows) in a handful of requests: one clear for all of them, then the values in groups.
   * Values are stored as given (RAW): a text that starts with "=" stays text.
   */
  async writeAll(tabs) {
    const a1 = (t, cell) => `'${t.name.replace(/'/g, "''")}'!${cell}`;
    await this.call('POST', `${SHEETS}/${this.sheetId}/values:batchClear`, { ranges: tabs.map((t) => a1(t, 'A1:ZZ')) });
    const ROWS = 4000; // rows per block
    const CELLS = 250_000; // cells per request, to keep each request small
    let data = [];
    let cells = 0;
    const flush = async () => {
      if (!data.length) return;
      await this.call('POST', `${SHEETS}/${this.sheetId}/values:batchUpdate`, { valueInputOption: 'RAW', data });
      data = [];
      cells = 0;
    };
    for (const t of tabs) {
      const all = [t.header, ...t.rows];
      for (let i = 0; i < all.length; i += ROWS) {
        const block = all.slice(i, i + ROWS);
        const size = block.length * Math.max(1, t.header.length);
        if (cells && cells + size > CELLS) await flush();
        data.push({ range: a1(t, `A${i + 1}`), majorDimension: 'ROWS', values: block });
        cells += size;
      }
    }
    await flush();
  }
}
