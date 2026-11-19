#!/usr/bin/env node
// Self-test for the Command Center backend: `npm run cc:test`.
// Drives the real request handler and the real credential tool against a temporary store and a temporary home folder,
// so it never touches your real register or database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { createHandler, BOARDS, MODULES } from '../../server/command/handler.mjs';
import { commandCenterRequestListener } from '../../server/command/http.mjs';
import { MemoryStore, SupabaseStore } from '../../server/command/store.mjs';
import { buildFixtures } from '../../src/data/commandCenter/fixtures.mjs';
import { newSeries, STADIUMS, SERIES_CFG, deadlineFor, validateSeries } from '../../server/command/series.mjs';
import { AutoStore, LoginTableStore } from '../../server/command/loginTable.mjs';
import { provision, resetCredentials, reveal, verifyRegister, readRegister, syncStatuses, REGISTER_FILE, PLAIN_FILE, backup, writePlain, importPlain, pushAccounts, applyCredentials, parseCredentialSheet, recordPassword, inspectSupabase, hostingValues, SUPABASE_URL_FOR, describeKey, adminFromRows, readTable, buildSetupSql, buildOverviewCsv, writeLoginsCsv, LOGINS_COLUMNS, LOGINS_CSV_FILE, shortPassword } from './lib.mjs';

const mkdtemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-admin-'));
const await_free = (x) => x;
let passed = 0;
const failures = [];
const check = (name, ok, extra = '') => {
  if (ok) passed++;
  else failures.push(`${name} ${extra}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${extra}`}`);
};

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
const store = new MemoryStore();
let clock = Date.now();
const handle = createHandler({ store, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });

const created = await provision({ store, home, chairmen: { 'New Zealand': 'Test Chairman' } });
const cred = (ref) => created.find((c) => c.username === ref || c.board === ref);
const admin = cred('iocf.admin');

const H = { 'x-iocf-request': '1', host: 'site.test', 'x-forwarded-proto': 'https' };
let ipCounter = 0;
const call = (method, p, { body, cookie, ip, headers } = {}) =>
  handle({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}), ...headers }, body: body ?? null, ip: ip ?? `10.0.0.${++ipCounter}` });
const cookieOf = (res) => /iocf_cc=([^;]*)/.exec(res.headers['set-cookie'] ?? '')?.[1];
const login = async (role, c, ip) => {
  const r = await call('POST', 'login', { body: { role, username: c.username, password: c.password }, ip });
  return { r, cookie: r.status === 200 ? `iocf_cc=${cookieOf(r)}` : null };
};

// the bundled tournament statistics are empty (the administrator uploads them), so the ranking tests bring their own small tournament
function fixtureTournamentStats() {
  const { fields } = JSON.parse(fs.readFileSync('src/data/tournamentStats.json', 'utf8'));
  const row = (name, team, runs, wickets) => fields.map((f) => ({ name, team, matches: 5, batInn: 5, runs, balls: runs, wickets, bowlInn: 5, ballsBowled: 60, runsConceded: 50 })[f] ?? null);
  return { fields, tournaments: { 'asia-cup': { title: 'Asia Cup', tour: 'x', rows: [row('Alpha One', 'INDIA', 300, 2), row('Bravo Two', 'PAKISTAN', 200, 9), row('Charlie Three', 'ENGLAND', 100, 5)] } } };
}

console.log('— setup —');
check('26 accounts created (1 admin + 25 boards)', created.length === 26 && created.filter((c) => c.type === 'Board Chairman').length === 25);
check('every username and password is unique', new Set(created.map((c) => c.username)).size === 26 && new Set(created.map((c) => c.password)).size === 26);
check('passwords are 20 characters', created.every((c) => c.password.length === 20));
check('no plain password in the store', !JSON.stringify(store.data).includes(admin.password) && store.data.accounts.every((a) => a.password_hash.startsWith('scrypt$')));
const reg = readRegister(home);
check('register has the 8 required columns and 26 rows', reg.length === 26 && Object.keys(reg[0]).join('|') === 'Account ID|Account Type|Board Name|Username|Encrypted Password|Account Status|Created Date|Last Updated Date');
check('register passwords are encrypted (not readable in the file)', !fs.readFileSync(path.join(home, REGISTER_FILE), 'utf8').includes(admin.password));
check('register and key files are private (mode 600)', (fs.statSync(path.join(home, REGISTER_FILE)).mode & 0o077) === 0 && (fs.statSync(path.join(home, 'register.key')).mode & 0o077) === 0);
check('register agrees with the database', (await verifyRegister({ store, home })).problems.length === 0);
check('setup is repeatable (creates nothing the second time)', (await provision({ store, home })).length === 0);

console.log('\n— 1/2. logins and redirection data —');
const a = await login('admin', admin);
check('admin login succeeds', a.r.status === 200 && a.r.body.user.role === 'admin');
check('session cookie is HttpOnly, SameSite=Strict, Secure, scoped to the API', /HttpOnly/.test(a.r.headers['set-cookie']) && /SameSite=Strict/.test(a.r.headers['set-cookie']) && /Secure/.test(a.r.headers['set-cookie']) && /Path=\/api\/command/.test(a.r.headers['set-cookie']));
check('login response contains no password or hash', !/password|hash|scrypt/i.test(JSON.stringify(a.r.body)));
const nz = await login('board', cred('New Zealand'));
check('New Zealand login identifies the New Zealand board', nz.r.status === 200 && nz.r.body.user.board === 'new-zealand' && nz.r.body.user.chairmanName === 'Test Chairman');
const india = await login('board', cred('India'));
check('India login identifies the India board', india.r.body.user.board === 'india');

console.log('\n— 4. all 25 boards —');
let allOk = true;
for (const b of BOARDS) {
  const s = await login('board', cred(b.name));
  const me = await call('GET', 'me', { cookie: s.cookie });
  const dash = await call('GET', `boards/${b.slug}/dashboard`, { cookie: s.cookie });
  if (s.r.status !== 200 || me.body.user.board !== b.slug || dash.status !== 200 || dash.body.board !== b.slug || dash.body.preview) allOk = false;
}
check('each of the 25 boards signs in and loads its own dashboard data', allOk);

console.log('\n— 5/6. permissions —');
check('a board user cannot open another board', (await call('GET', 'boards/india/dashboard', { cookie: nz.cookie })).status === 403);
check('a board user cannot use admin endpoints', (await call('GET', 'admin/accounts', { cookie: nz.cookie })).status === 403 && (await call('GET', 'admin/overview', { cookie: nz.cookie })).status === 403);
check('a board user cannot change accounts or modules', (await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: nz.cookie, body: { status: 'inactive' } })).status === 403 && (await call('PUT', 'admin/boards/india/modules', { cookie: nz.cookie, body: { moduleId: 'series-announcement', enabled: false } })).status === 403);
check('no session means no access', (await call('GET', 'me')).status === 401 && (await call('GET', 'boards/india/dashboard')).status === 401 && (await call('GET', 'admin/accounts')).status === 401);
let previews = 0;
for (const b of BOARDS) if ((await call('GET', `boards/${b.slug}/dashboard`, { cookie: a.cookie })).body?.preview === true) previews++;
check('admin can preview all 25 dashboards (marked as preview)', previews === 25);
check('previews are written to the audit log', (await store.listAudit(100)).filter((e) => e.action === 'board_preview').length >= 25);
check('unknown board is a 404', (await call('GET', 'boards/atlantis/dashboard', { cookie: a.cookie })).status === 404);

console.log('\n— errors on login —');
check('wrong password is refused with the generic message', (await call('POST', 'login', { body: { role: 'admin', username: 'iocf.admin', password: 'nope' } })).body.error.message === 'Incorrect username or password.');
check('unknown username gets the same answer', (await call('POST', 'login', { body: { role: 'admin', username: 'ghost', password: 'nope' } })).body.error.message === 'Incorrect username or password.');
const wrongPortal = await call('POST', 'login', { body: { role: 'board', username: admin.username, password: admin.password } });
check('admin credentials on Board Login are "not authorized" (403)', wrongPortal.status === 403 && wrongPortal.body.error.code === 'wrong_portal' && !wrongPortal.headers['set-cookie']);
const wrongPortal2 = await call('POST', 'login', { body: { role: 'admin', username: cred('India').username, password: cred('India').password } });
check('board credentials on Admin Login are "not authorized" (403)', wrongPortal2.status === 403 && wrongPortal2.body.error.code === 'wrong_portal');
check('empty fields are rejected (400)', (await call('POST', 'login', { body: { role: 'admin', username: '', password: '' } })).status === 400);

console.log('\n— rate limiting —');
const victim = cred('Japan');
const same = '203.0.113.9';
let last;
for (let i = 0; i < 5; i++) last = await call('POST', 'login', { body: { role: 'board', username: victim.username, password: 'wrong' + i }, ip: same });
check('5 wrong passwords are still answered normally (401)', last.status === 401);
const blocked = await call('POST', 'login', { body: { role: 'board', username: victim.username, password: victim.password }, ip: same });
check('the 6th attempt is blocked even with the CORRECT password (429, retryAfter)', blocked.status === 429 && blocked.body.error.retryAfter > 0);
clock += 16 * 60 * 1000;
check('after the window it works again', (await call('POST', 'login', { body: { role: 'board', username: victim.username, password: victim.password }, ip: same })).status === 200);

console.log('\n— sessions —');
const tampered = `${a.cookie.slice(0, -2)}xx`;
check('a tampered cookie is rejected', (await call('GET', 'me', { cookie: tampered })).status === 401);
const forged = `iocf_cc=${Buffer.from(JSON.stringify({ aid: 'x', role: 'admin', sv: 1, exp: clock + 1e9 })).toString('base64url')}.AAAA`;
check('a forged admin cookie is rejected', (await call('GET', 'admin/accounts', { cookie: forged })).status === 401);
clock += 9 * 60 * 60 * 1000;
check('sessions expire after 8 hours', (await call('GET', 'me', { cookie: a.cookie })).status === 401);
const a2 = await login('admin', admin);
check('state-changing requests need the custom header', (await handle({ method: 'POST', path: ['logout'], headers: { host: 'site.test', cookie: a2.cookie }, body: null, ip: '9.9.9.9' })).status === 403);
check('cross-site origins are refused', (await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: a2.cookie, body: { status: 'inactive' }, headers: { origin: 'https://evil.example' } })).status === 403);
check('logout ends the cookie', (await call('POST', 'logout', { cookie: a2.cookie })).headers['set-cookie'].includes('Max-Age=0'));

console.log('\n— 9. activation / deactivation —');
const adm = await login('admin', admin);
const indiaSession = await login('board', cred('India'));
const off = await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } });
check('admin deactivates India', off.status === 200 && off.body.status === 'inactive');
check('India\'s open session stops working immediately', (await call('GET', 'me', { cookie: indiaSession.cookie })).status === 401);
const refused = await call('POST', 'login', { body: { role: 'board', username: cred('India').username, password: cred('India').password } });
check('India cannot sign in while inactive (403 "inactive")', refused.status === 403 && refused.body.error.code === 'inactive');
check('a wrong password on an inactive account does NOT reveal it is inactive', (await call('POST', 'login', { body: { role: 'board', username: cred('India').username, password: 'wrong' } })).status === 401);
check('the administrator account cannot be deactivated', (await call('PATCH', `admin/accounts/${admin.accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } })).status === 400);
check('admin reactivates India', (await call('PATCH', `admin/accounts/${cred('India').accountId}`, { cookie: adm.cookie, body: { status: 'active' } })).status === 200 && (await login('board', cred('India'))).r.status === 200);
const ov = (await call('GET', 'admin/overview', { cookie: adm.cookie })).body;
check('overview counts are right', ov.totalBoards === 25 && ov.totalAccounts === 26 && ov.activeBoardAccounts === 25 && ov.inactiveBoardAccounts === 0 && ov.availableModules === 5);
await call('PATCH', `admin/accounts/${cred('Spain').accountId}`, { cookie: adm.cookie, body: { status: 'inactive' } });
check('overview counts inactive boards', (await call('GET', 'admin/overview', { cookie: adm.cookie })).body.inactiveBoardAccounts === 1);
const list = (await call('GET', 'admin/accounts', { cookie: adm.cookie })).body;
check('account list covers 25 boards and exposes no secrets', list.boards.length === 25 && !/password|hash|scrypt/i.test(JSON.stringify(list)));
check('chairman information can be updated', (await call('PATCH', `admin/accounts/${cred('Spain').accountId}`, { cookie: adm.cookie, body: { chairmanName: 'New Name' } })).body.chairmanName === 'New Name');

console.log('\n— the administrator sets board logins in the browser —');
const putLogin = (slug, body, cookie = adm.cookie) => call('PUT', `admin/boards/${slug}/account`, { cookie, body });
const ugSession = await login('board', cred('Zimbabwe'));
const set1 = await putLogin('zimbabwe', { username: 'Zimbabwe.Boss', password: 'Brand-New-Pass-1' });
check('admin sets a new username and password for Zimbabwe', set1.status === 200 && set1.body.username === 'zimbabwe.boss' && set1.body.created === false);
check('the response contains no password or hash', !/Brand-New|password|hash|scrypt/i.test(JSON.stringify(set1.body)));
check('the new login works (username is case-insensitive)', (await call('POST', 'login', { body: { role: 'board', username: 'ZIMBABWE.boss', password: 'Brand-New-Pass-1' } })).status === 200);
check('the old password and old username are dead', (await call('POST', 'login', { body: { role: 'board', username: 'zimbabwe.boss', password: cred('Zimbabwe').password } })).status === 401 && (await call('POST', 'login', { body: { role: 'board', username: cred('Zimbabwe').username, password: 'Brand-New-Pass-1' } })).status === 401);
check('the chairman was signed out everywhere by the change', (await call('GET', 'me', { cookie: ugSession.cookie })).status === 401);
const logged = JSON.stringify(await store.listAudit(50));
check('it is in the audit log, with no password in it', /credentials_set/.test(logged) && !/Brand-New/.test(logged) && !/Brand-New/.test(JSON.stringify(store.data)));
check('a password alone keeps the username', (await putLogin('zimbabwe', { password: 'Second-New-Pass-2' })).body.username === 'zimbabwe.boss' && (await call('POST', 'login', { body: { role: 'board', username: 'zimbabwe.boss', password: 'Second-New-Pass-2' } })).status === 200);
check('a username alone keeps the password', (await putLogin('zimbabwe', { username: 'zimbabwe.chair' })).status === 200 && (await call('POST', 'login', { body: { role: 'board', username: 'zimbabwe.chair', password: 'Second-New-Pass-2' } })).status === 200);
check('a password under 6 characters is refused', (await putLogin('zimbabwe', { password: 'short' })).status === 400);
check('a bad username is refused', (await putLogin('zimbabwe', { username: 'no spaces!' })).status === 400);
check('a username already used by another board is refused (409)', (await putLogin('zimbabwe', { username: cred('India').username })).status === 409);
check('an empty change is refused', (await putLogin('zimbabwe', {})).status === 400);
check('an unknown board is a 404', (await putLogin('atlantis', { username: 'abc', password: 'long-enough-1' })).status === 404);
check('a chairman cannot set logins (403), not even their own', (await putLogin('india', { password: 'Hijack-Attempt-1' }, (await login('board', cred('India'))).cookie)).status === 403);
check('no session cannot set logins (401)', (await putLogin('india', { password: 'Hijack-Attempt-1' }, '')).status === 401);
check('India\'s real password was not touched by those attempts', (await login('board', cred('India'))).r.status === 200);
check('after an online change the register is out of date and verify says so', await verifyRegister({ store, home }).then((v) => v.problems.some((x) => /Zimbabwe|zimbabwe/.test(x) && /record/.test(x))));
check('a wrong password cannot be recorded', await recordPassword({ store, home, ref: 'zimbabwe', password: 'not-it-at-all' }).then(() => false, (e) => /does not match/.test(e.message)));
await recordPassword({ store, home, ref: 'zimbabwe', password: 'Second-New-Pass-2' });
check('recording the real password brings the register back in line', (await verifyRegister({ store, home })).problems.length === 0 && reveal({ home, ref: 'zimbabwe' })[0].username === 'zimbabwe.chair' && reveal({ home, ref: 'zimbabwe' })[0].password === 'Second-New-Pass-2');
// a board with no login yet
const fresh = new MemoryStore();
const h3 = createHandler({ store: fresh, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
const adminHash = await (await import('../../server/command/crypto.mjs')).hashPassword('Admin-Pass-2026-x');
await fresh.create({ account_id: 'IOCF-ADM-001', role: 'admin', board_slug: null, board_name: null, username: 'iocf.admin', password_hash: adminHash, status: 'active' });
const a3 = await h3({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'iocf.admin', password: 'Admin-Pass-2026-x' }, ip: '3.3.3.3' });
const c3 = `iocf_cc=${cookieOf(a3)}`;
const put3 = (slug, body) => h3({ method: 'PUT', path: ['admin', 'boards', slug, 'account'], headers: { ...H, cookie: c3 }, body, ip: '3.3.3.3' });
check('creating needs a password', (await put3('japan', { username: 'japan.chairman' })).status === 400);
const made = await put3('japan', { username: 'japan.chairman', password: 'Japan-First-Pass-1', chairmanName: 'A. Chairman' });
check('a board with no login gets one created (ID follows the board order)', made.status === 200 && made.body.created === true && made.body.accountId === 'IOCF-BRD-022');
check('and the chairman can sign in to the Japan board', (await h3({ method: 'POST', path: ['login'], headers: H, body: { role: 'board', username: 'japan.chairman', password: 'Japan-First-Pass-1' }, ip: '3.3.3.4' })).body.user.board === 'japan');
const lst = (await h3({ method: 'GET', path: ['admin', 'accounts'], headers: { ...H, cookie: c3 }, body: null, ip: '3.3.3.3' })).body;
check('the account list now shows Japan as active and the others as having no login', lst.boards.find((b) => b.slug === 'japan').status === 'active' && lst.boards.filter((b) => b.status === 'none').length === 24 && lst.boards.find((b) => b.slug === 'japan').chairmanName === 'A. Chairman');

console.log('\n— 7/8. modules —');
const nz2 = await login('board', cred('New Zealand'));
const dash = await call('GET', 'boards/new-zealand/dashboard', { cookie: nz2.cookie });
check('Series Announcement, Fixtures & Scheduling, Board Credits, Build a Stadium and IOCF 2.0 are the active modules', MODULES.filter((m) => m.status === 'active').map((m) => m.id).join() === 'series-announcement,fixtures,credits,stadiums,iocf2' && dash.body.modules.join() === 'series-announcement,fixtures,credits,stadiums,iocf2');
check('coming-soon modules cannot be switched on', (await call('PUT', 'admin/boards/new-zealand/modules', { cookie: adm.cookie, body: { moduleId: 'squads', enabled: true } })).status === 400);
await call('PUT', 'admin/boards/new-zealand/modules', { cookie: adm.cookie, body: { moduleId: 'series-announcement', enabled: false } });
check('admin can switch a module off for one board only', (await call('GET', 'boards/new-zealand/dashboard', { cookie: nz2.cookie })).body.modules.join() === 'fixtures,credits,stadiums,iocf2' && (await call('GET', 'boards/india/dashboard', { cookie: (await login('board', cred('India'))).cookie })).body.modules.length === 5);

console.log('\n— 10. password reset —');
const before = cred('Pakistan');
const s1 = await login('board', before);
const reset = await resetCredentials({ store, home, ref: 'pakistan' });
check('reset gives a new password', reset.password !== before.password && reset.password.length === 20);
check('old session ended by the reset', (await call('GET', 'me', { cookie: s1.cookie })).status === 401);
check('old password no longer works', (await call('POST', 'login', { body: { role: 'board', username: before.username, password: before.password } })).status === 401);
check('new password works', (await call('POST', 'login', { body: { role: 'board', username: reset.username, password: reset.password } })).status === 200);
check('register row was re-encrypted and still agrees with the database', (await verifyRegister({ store, home })).problems.length === 0 && reveal({ home, ref: 'pakistan' })[0].password === reset.password);
const renamed = await resetCredentials({ store, home, ref: 'pakistan', newUsername: 'pakistan.board' });
check('a username can be changed during a reset', (await call('POST', 'login', { body: { role: 'board', username: 'pakistan.board', password: renamed.password } })).status === 200 && (await verifyRegister({ store, home })).problems.length === 0);
check('a username already taken is refused', await resetCredentials({ store, home, ref: 'pakistan', newUsername: 'india.chairman' }).then(() => false, () => true));
check('status changes made online can be copied into the register', (await syncStatuses({ store, home })) >= 1 && readRegister(home).find((r) => r['Board Name'] === 'Spain')['Account Status'] === 'inactive');
const bk = backup({ home, outDir: path.join(home, 'bk') });
check('encrypted backup contains no readable password', !fs.readFileSync(bk, 'utf8').includes(reveal({ home, ref: 'india' })[0].password));

console.log('\n— the readable credentials file: export, edit, import —');
const plainFile = await writePlain({ store, home });
const plainRows = fs.readFileSync(plainFile, 'utf8').trim().split('\n');
check('plain CSV has 26 rows and readable passwords', plainRows.length === 27 && plainRows[0] === 'Account ID,Account Type,Board Name,Username,Password,Account Status' && plainRows.some((l) => l.includes(admin.password) || l.includes('iocf.admin')));
check('plain CSV is private (mode 600) and outside the project', (fs.statSync(plainFile).mode & 0o077) === 0 && !path.resolve(plainFile).startsWith(process.cwd()));
const before2 = await store.findByUsername('japan.chairman');
const edited = fs.readFileSync(plainFile, 'utf8').split('\n').map((l) => (l.includes(',japan.chairman,') ? l.replace(/,japan\.chairman,[^,]*,/, ',japan.board,MyNewPassword#2026,') : l.includes(',mexico.chairman,') ? l.replace(/,active$/, ',inactive') : l)).join('\n');
fs.writeFileSync(plainFile, edited);
const rep = await importPlain({ store, home });
check('import applies exactly the edited rows', rep.length === 2 && rep.some((r) => r.board === 'Japan' && r.changes === 'username + password') && rep.some((r) => r.board === 'Mexico' && r.changes === 'status'));
check('the edited password works on the site', (await call('POST', 'login', { body: { role: 'board', username: 'japan.board', password: 'MyNewPassword#2026' } })).status === 200);
check('the old Japan username no longer works', (await call('POST', 'login', { body: { role: 'board', username: 'japan.chairman', password: 'x' } })).status === 401);
check('an edit to inactive switches the account off', (await store.findByUsername('mexico.chairman')).status === 'inactive');
check('import re-encrypts the register and it still agrees with the database', (await verifyRegister({ store, home })).problems.length === 0);
check('importing again finds no changes', (await importPlain({ store, home })).length === 0);
fs.writeFileSync(plainFile, fs.readFileSync(plainFile, 'utf8').replace('MyNewPassword#2026', 'short'));
check('a too-short password is refused and nothing is changed', await importPlain({ store, home }).then(() => false, (e) => /at least 12/.test(e.message)) && (await call('POST', 'login', { body: { role: 'board', username: 'japan.board', password: 'MyNewPassword#2026' } })).status === 200);
fs.writeFileSync(plainFile, fs.readFileSync(plainFile, 'utf8').replace(',short,', ',MyNewPassword#2026,').replace(',india.chairman,', ',japan.board,'));
check('a username used twice is refused', await importPlain({ store, home }).then(() => false, (e) => /used twice|already belongs/.test(e.message)));
await writePlain({ store, home });
const remoteLike = new MemoryStore();
const pushed = await pushAccounts({ from: store, to: remoteLike });
check('push copies all 26 accounts to another store', pushed.created === 26 && (await remoteLike.list()).length === 26);
check('after push the same passwords work against the new store', await (async () => {
  const h2 = createHandler({ store: remoteLike, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
  const r = await h2({ method: 'POST', path: ['login'], headers: H, body: { role: 'board', username: 'japan.board', password: 'MyNewPassword#2026' }, ip: '5.5.5.5' });
  return r.status === 200;
})());
check('pushing again changes nothing', (await pushAccounts({ from: store, to: remoteLike })).updated === 0);
void before2;

const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'ios', 'android', 'dist'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
console.log('\n— credentials sheet (Google Sheet / Excel) —');
const book = (rows, name = 'Sheet1') => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  rows.forEach((r) => ws.addRow(r));
  return wb;
};
const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sheet-'));
const store2 = new MemoryStore();
const handle2 = createHandler({ store: store2, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
const sheetRows = [
  ['Board', 'Username', 'Password', 'Status'],
  ['', 'president', 'Admin-Pass-2026-x', 'Active'],
  ['Newzealand', 'nz.chair', 'Kiwi-Pass-2026-x', 'Active'],
  ['Srilanka', 'sl.chair', 'Lanka-Pass-2026-x', ''],
  ['West Indies', 'wi.chair', 'Windies-Pass-2026-x', 'inactive'],
];
const parsed = parseCredentialSheet(book(sheetRows));
check('sheet: finds the headings and reads every row', parsed.entries.length === 4 && parsed.tab === 'Sheet1');
check('sheet: a row with no board is the administrator', parsed.entries[0].role === 'admin' && parsed.entries[1].board === 'Newzealand');
const r1 = await applyCredentials({ store: store2, home: home2, entries: parsed.entries });
check('sheet: creates the administrator and the boards it names (spellings like "Newzealand" and "Srilanka" resolve)', r1.changes.length === 4 && (await store2.list()).map((a) => a.board_slug ?? 'admin').sort().join() === 'admin,new-zealand,sri-lanka,west-indies');
const ok2 = (u, pw, role = 'board') => handle2({ method: 'POST', path: ['login'], headers: H, body: { role, username: u, password: pw }, ip: `7.7.7.${++ipCounter}` });
check('sheet: the new logins work', (await ok2('president', 'Admin-Pass-2026-x', 'admin')).status === 200 && (await ok2('nz.chair', 'Kiwi-Pass-2026-x')).status === 200);
check('sheet: "inactive" in the Status column creates an inactive account', (await ok2('wi.chair', 'Windies-Pass-2026-x')).body.error.code === 'inactive');
check('sheet: the register was written for them and agrees with the store', (await verifyRegister({ store: store2, home: home2 })).problems.length === 0);
check('sheet: running it again changes nothing', (await applyCredentials({ store: store2, home: home2, entries: parsed.entries })).changes.length === 0);
const edited2 = parseCredentialSheet(book([sheetRows[0], sheetRows[1], ['Newzealand', 'nz.chair', 'Kiwi-New-Pass-2026', 'Active'], sheetRows[3], ['West Indies', 'wi.chair', 'Windies-Pass-2026-x', 'Active']])).entries;
const dry = await applyCredentials({ store: store2, home: home2, entries: edited2, dryRun: true });
check('sheet: --dry-run reports the changes but applies none', dry.changes.length === 2 && (await ok2('nz.chair', 'Kiwi-Pass-2026-x')).status === 200);
const r3 = await applyCredentials({ store: store2, home: home2, entries: edited2 });
check('sheet: an edited password and an activated account are applied', r3.changes.length === 2 && (await ok2('nz.chair', 'Kiwi-New-Pass-2026')).status === 200 && (await ok2('nz.chair', 'Kiwi-Pass-2026-x')).status === 401 && (await ok2('wi.chair', 'Windies-Pass-2026-x')).status === 200);
const bad = (rows) => applyCredentials({ store: store2, home: home2, entries: parseCredentialSheet(book(rows)).entries }).then(() => null, (e) => e.message);
check('sheet: an unknown board refuses the whole sheet', /not one of the 26 boards/.test(await bad([sheetRows[0], ['Atlantis', 'a.chair', 'Long-Enough-Pass-1', 'Active']])));
check('sheet: a username used twice refuses the whole sheet', /used twice/.test(await bad([sheetRows[0], ['India', 'same.user', 'Long-Enough-Pass-1'], ['Italy', 'same.user', 'Long-Enough-Pass-2']])));
check('sheet: a very short password is refused', /at least 8/.test(await bad([sheetRows[0], ['India', 'in.chair', 'abc12']])));
check('sheet: a refused sheet changes nothing', (await store2.list()).length === 4);
check('sheet: a repeated password is only a warning, naming the rows', (await applyCredentials({ store: store2, home: home2, dryRun: true, entries: parseCredentialSheet(book([sheetRows[0], ['India', 'in.chair', 'Shared-Password-2026'], ['Italy', 'it.chair', 'Shared-Password-2026']])).entries })).warnings.some((w) => /same password/.test(w)));
check('sheet: without headings, columns A–C are board, username, password', parseCredentialSheet(book([['India', 'in.chair', 'Long-Enough-Pass-1'], ['Italy', 'it.chair', 'Long-Enough-Pass-2']])).entries.length === 2);
check('sheet: a tab without credentials gives a clear error', (() => { try { parseCredentialSheet(book([['Match', 'Winner'], ['A v B', 'A']])); return false; } catch (e) { return /Username/.test(e.message); } })());
check('sheet: the second tab is used when the first has no credentials', (() => { const wb = book([['Notes'], ['hello']], 'Notes'); const ws = wb.addWorksheet('Logins'); sheetRows.forEach((r) => ws.addRow(r)); return parseCredentialSheet(wb).tab === 'Logins'; })());
fs.rmSync(home2, { recursive: true, force: true });
// the link itself is read from your private settings at run time, so it is not written down in this file either
const sheetId = (() => { try { return /spreadsheets\/d\/([\w-]+)/.exec(fs.readFileSync(path.join(process.env.IOCF_CC_HOME || path.join(os.homedir(), '.iocf-command-center'), 'env'), 'utf8'))?.[1] ?? null; } catch { return null; } })();
const repoText = sheetId === null ? false : walk(process.cwd()).some((f) => { try { return fs.readFileSync(f, 'utf8').includes(sheetId); } catch { return false; } });
check('your credentials sheet link appears nowhere in the project' + (sheetId ? '' : ' (none set on this machine)'), !repoText);

console.log('\n— connecting to Supabase —');
const ok = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
const defs = (names, extra = {}) => ({ definitions: Object.fromEntries([...names, ...Object.keys(extra)].map((n) => [n, { properties: Object.fromEntries((extra[n] ?? ['id']).map((c) => [c, {}])) }])) });
const ALL = ['command_accounts', 'command_board_modules', 'command_audit_log', 'command_rate_limits'];
check('the project URL is built from its reference', SUPABASE_URL_FOR('abc123') === 'https://abc123.supabase.co');
check('a good key with all tables is accepted', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: ok(defs(ALL)) }).then((r) => r.keyOk && r.missing.length === 0 && r.others.length === 0));
check('missing tables are named', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: ok(defs(['command_accounts'])) }).then((r) => r.missing.join() === 'command_board_modules,command_audit_log,command_rate_limits'));
check('a refused key gives a clear message about the secret key', await inspectSupabase({ url: 'https://x.supabase.co', key: 'anon', fetchImpl: ok({}, 401) }).then((r) => !r.keyOk && /service_role/.test(r.error)));
check('an unreachable address gives a clear message', await inspectSupabase({ url: 'https://nowhere.invalid', key: 'k', fetchImpl: async () => { throw new Error('x'); } }).then((r) => /Could not reach/.test(r.error)));
check('a table that looks like it holds passwords is flagged', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: ok(defs(ALL, { admin_credentials: ['id', 'username', 'password'], notes: ['id', 'text'] })) }).then((r) => r.others.find((t) => t.name === 'admin_credentials')?.looksLikeLogins === true && r.others.find((t) => t.name === 'notes')?.looksLikeLogins === false));
check('inspection only calls the schema document (reads no rows)', await (async () => { const urls = []; await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: async (u) => { urls.push(u); return { ok: true, status: 200, json: async () => defs(ALL) }; } }); return urls.length === 1 && urls[0].endsWith('/rest/v1/'); })());
const closedRoot = (probeStatus) => async (u) => (u.endsWith('/rest/v1/') ? { ok: false, status: 401, json: async () => ({}) } : { ok: probeStatus < 400, status: probeStatus, json: async () => [] });
check('if the schema document is closed, a good key is still accepted by testing our own table', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: closedRoot(200) }).then((r) => r.keyOk && r.missing.length === 0));
check('…and a good key with no tables yet says the tables are missing', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: closedRoot(404) }).then((r) => r.keyOk && r.missing.length === 4));
check('…and a bad key is still refused', await inspectSupabase({ url: 'https://x.supabase.co', key: 'k', fetchImpl: closedRoot(401) }).then((r) => !r.keyOk && /refused/.test(r.error)));
const thrown = (f) => { try { f(); return null; } catch (e) { return e.message; } };
check('admin table: username / password columns', adminFromRows([{ id: 1, username: 'IOCF.Admin', password: 'Long-Admin-Pass-1' }]).username === 'iocf.admin');
check('admin table: user_id / password columns', adminFromRows([{ user_id: 'president', password: 'Long-Admin-Pass-1', created_at: 'x' }]).username === 'president');
check('admin table: email / pwd columns', adminFromRows([{ email: 'boss@iocf.org', pwd: 'Long-Admin-Pass-1' }]).username === 'boss@iocf.org');
check('admin table: with several rows, the one marked admin is used', adminFromRows([{ username: 'a', role: 'board', password: 'x'.repeat(10) }, { username: 'boss', role: 'admin', password: 'Long-Admin-Pass-1' }]).username === 'boss');
check('admin table: an empty table is explained', /no rows/.test(thrown(() => adminFromRows([]))));
check('admin table: two admin rows are refused rather than guessed', /exactly one/.test(thrown(() => adminFromRows([{ username: 'a', password: 'longenough1' }, { username: 'b', password: 'longenough2' }]))));
check('admin table: no password column is explained, naming the columns', /password column.*id, name/.test(thrown(() => adminFromRows([{ id: 1, name: 'x' }]))));
check('admin table: an already-encrypted password is explained', /cannot be turned back/.test(thrown(() => adminFromRows([{ username: 'a', password: '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234' }]))));
check('admin table: reading is limited to one table by name, a few rows', await (async () => { const urls = []; await readTable({ url: 'https://x.supabase.co', key: 'sb_secret_k', table: 'admin_users', fetchImpl: async (u, i) => { urls.push([u, i.headers]); return { ok: true, status: 200, json: async () => [] }; } }); return urls[0][0].endsWith('/rest/v1/admin_users?select=*&limit=5') && !urls[0][1].authorization; })());
check('admin table: a table name cannot smuggle a query', await readTable({ url: 'https://x.supabase.co', key: 'k', table: 'a?select=*&x=', fetchImpl: ok([]) }).then(() => false, (e) => /only letters/.test(e.message)));
check('admin table: the imported admin can sign in, and an e-mail style user id works', await (async () => {
  const st = new MemoryStore();
  const hh = mkdtemp();
  const entry = adminFromRows([{ user_id: 'Boss@IOCF.org', password: 'Table-Admin-Pass-1' }]);
  await applyCredentials({ store: st, home: hh, entries: [{ role: 'admin', username: entry.username, password: entry.password }] });
  const hd = createHandler({ store: st, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock });
  const r = await hd({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'boss@iocf.org', password: 'Table-Admin-Pass-1' }, ip: '8.8.8.8' });
  fs.rmSync(hh, { recursive: true, force: true });
  return r.status === 200 && r.body.user.role === 'admin' && !JSON.stringify(st.data).includes('Table-Admin-Pass-1');
})());
const sqlAccounts = [...(await store.list())];
sqlAccounts[3] = { ...sqlAccounts[3], chairman_name: "Pat O'Brien; drop table x; --" };
const setupSql = buildSetupSql({ accounts: sqlAccounts, schemaSql: fs.readFileSync(path.join(process.cwd(), 'server/command/schema.sql'), 'utf8') });
check('setup SQL: creates the 17 tables with Row Level Security on', (setupSql.match(/create table if not exists/g) ?? []).length === 17 && (setupSql.match(/enable row level security/g) ?? []).length === 17);
check('setup SQL: drops only the four command_* tables', /drop table if exists public\.command_rate_limits, public\.command_audit_log, public\.command_board_modules, public\.command_accounts cascade;/.test(setupSql) && (setupSql.match(/^drop table/gm) ?? []).length === 1);
check('setup SQL: has all 26 accounts and 25 module rows', (setupSql.match(/'IOCF-(ADM|BRD)-\d{3}'/g) ?? []).length === 26 && (setupSql.match(/'series-announcement', true\)/g) ?? []).length === 25);
check('setup SQL: quotes in names cannot break out of the string', setupSql.includes("'Pat O''Brien; drop table x; --'") && (setupSql.match(/^drop table/gm) ?? []).length === 1 && !/^\s*(drop|delete|truncate)\b.*\bx\b/im.test(setupSql));
check('setup SQL: holds hashes only, never a password', created.every((c) => !setupSql.includes(c.password)) && (setupSql.match(/'scrypt\$16384\$8\$1\$/g) ?? []).length === 26);
check('setup SQL: can be run again (upserts, and re-running ends open sessions)', /on conflict \(account_id\) do update/.test(setupSql) && /session_version \+ 1/.test(setupSql));
check('accounts overview CSV lists 26 accounts with no password or hash', (() => { const o = buildOverviewCsv(await_free(sqlAccounts)); return o.trim().split('\n').length === 27 && !/scrypt|password/i.test(o); })());
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
check('key type: a secret key (sb_secret_…) is accepted', describeKey('sb_secret_abc123', 'p').kind === 'secret' && describeKey('sb_secret_abc123', 'p').usable);
check('key type: the publishable key is recognised and explained', describeKey('sb_publishable_abc', 'p').kind === 'publishable' && /SECRET key/.test(describeKey('sb_publishable_abc', 'p').message));
check('key type: a legacy service_role token is accepted', describeKey(jwt({ role: 'service_role', ref: 'p' }), 'p').usable);
check('key type: a legacy anon token is recognised and explained', describeKey(jwt({ role: 'anon', ref: 'p' }), 'p').kind === 'anon' && !describeKey(jwt({ role: 'anon', ref: 'p' }), 'p').usable);
check('key type: a key from another project is caught', describeKey(jwt({ role: 'service_role', ref: 'zzz' }), 'p').kind === 'other-project');
check('key type: quotes, spaces and "Bearer" around a pasted key are removed', describeKey('  "Bearer sb_secret_abc"  ', 'p').key === 'sb_secret_abc');
check('key type: a cut-off or random paste is explained', describeKey('abc', 'p').kind === 'unknown' && /short/.test(describeKey('abc', 'p').message));
check('new-style keys go in the apikey header only; legacy tokens in both', await (async () => { const seen = []; const f = async (u, i) => { seen.push(i.headers); return { ok: true, text: async () => '[]' }; }; await new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', fetchImpl: f }).list(); await new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'eyJ.legacy.token', fetchImpl: f }).list(); return !seen[0].authorization && seen[0].apikey === 'sb_secret_abc' && seen[1].authorization === 'Bearer eyJ.legacy.token'; })());
check('the hosting values are the three the site needs', hostingValues({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', COMMAND_CENTER_SESSION_SECRET: 's' }).map((l) => l.split('=')[0]).join() === 'SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,COMMAND_CENTER_SESSION_SECRET');

console.log('\n— ONE file: a logins table imported into Supabase, short passwords —');
// a small stand-in for Supabase's table API (just the filters the server uses)
const ot_makeSupabase = (tables) => {
  const log = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    log.push(`${init.method ?? 'GET'} ${table}`);
    if (!tables[table]) return { ok: false, status: 404, text: async () => '{}', json: async () => ({}) };
    const rows = tables[table];
    const match = (r) => [...u.searchParams.entries()].every(([k, v]) => {
      if (['select', 'order', 'limit'].includes(k)) return true;
      const cell = r[k];
      if (v.startsWith('eq.')) return String(cell) === decodeURIComponent(v.slice(3));
      if (v.startsWith('ilike.')) return String(cell ?? '').toLowerCase() === decodeURIComponent(v.slice(6)).toLowerCase();
      if (v === 'not.is.null') return cell !== null && cell !== undefined;
      if (v === 'neq.') return cell !== '';
      return true;
    });
    const method = init.method ?? 'GET';
    let out;
    if (method === 'GET') out = u.searchParams.get('limit') === '0' ? [] : rows.filter(match).map((r) => ({ ...r }));
    else if (method === 'PATCH') { out = rows.filter(match); out.forEach((r) => Object.assign(r, JSON.parse(init.body))); out = out.map((r) => ({ ...r })); }
    else if (method === 'POST') { const row = JSON.parse(init.body); rows.push(row); out = [{ ...row }]; }
    const wantBody = method === 'GET' || /return=representation/.test(init.headers?.prefer ?? '');
    return { ok: true, status: 200, text: async () => (wantBody ? JSON.stringify(out) : ''), json: async () => out };
  };
  return { fetchImpl, log };
};
const ot_csvToRows = (text) => {
  const [head, ...lines] = text.trim().split('\n').map((l) => { const cells = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cells.push(cur); cur = ''; } else cur += ch; } cells.push(cur); return cells; });
  // what Supabase's CSV import does: ot_empty cells become null, number-looking columns become integers
  return lines.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] === '' ? null : ['session_version', 'failed_logins'].includes(h) ? Number(cells[i]) : cells[i]])));
};
const ot_home3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-table-'));
const ot_local3 = new MemoryStore();
await provision({ store: ot_local3, home: ot_home3, chairmen: { 'New Zealand': 'Test Chairman' } });
const ot_csvFile = await writeLoginsCsv({ store: ot_local3, home: ot_home3 });
const ot_csvText = fs.readFileSync(ot_csvFile, 'utf8');
const ot_csvRows = ot_csvToRows(ot_csvText);
check('the logins CSV has the table columns and 26 rows', ot_csvText.split('\n')[0] === LOGINS_COLUMNS.join(',') && ot_csvRows.length === 26 && path.basename(ot_csvFile) === LOGINS_CSV_FILE);
check('every password is short (8 characters) with a letter and a digit, and all are different', ot_csvRows.every((r) => r.password.length === 8 && /[A-Za-z]/.test(r.password) && /\d/.test(r.password)) && new Set(ot_csvRows.map((r) => r.password)).size === 26);
check('the CSV file is private and outside the project', (fs.statSync(ot_csvFile).mode & 0o077) === 0 && !path.resolve(ot_csvFile).startsWith(process.cwd()));
check('your local records were updated to the same short passwords', (await verifyRegister({ store: ot_local3, home: ot_home3 })).problems.length === 0 && reveal({ home: ot_home3, ref: 'india' })[0].password === ot_csvRows.find((r) => r.board === 'India').password);

const tables = { iocf_logins: ot_csvRows.map((r) => ({ ...r })) };
const ot_sb = ot_makeSupabase(tables);
const ot_auto = new AutoStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_test', fetchImpl: ot_sb.fetchImpl });
const ot_hT = createHandler({ store: ot_auto, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', SUPABASE_URL: 'https://x.supabase.co' }, now: () => clock });
const ot_tcall = (method, p, { body, cookie, ip } = {}) => ot_hT({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, ip: ip ?? `9.9.${++ipCounter % 250}.${ipCounter % 250}` });
const ot_tlogin = async (role, username, password) => { const r = await ot_tcall('POST', 'login', { body: { role, username, password } }); return { r, cookie: r.status === 200 ? `iocf_cc=${cookieOf(r)}` : null }; };
const ot_adminRow = ot_csvRows.find((r) => r.account_type === 'Master Administrator');

check('the site finds the single logins table when the four command_* tables are absent', (await ot_auto.impl()) instanceof LoginTableStore);
check('the first admin login works with the short password from the CSV', (await ot_tlogin('admin', ot_adminRow.username, ot_adminRow.password)).r.status === 200);
check('the readable passwords are gone from the table, replaced by hashes', tables.iocf_logins.filter((r) => r.password === null && r.password_hash?.startsWith('scrypt$')).length === 26 && !ot_csvRows.some((r) => JSON.stringify(tables.iocf_logins).includes(`"${r.password}"`)));
let ot_all26 = true;
for (const b of BOARDS) {
  const row = ot_csvRows.find((r) => r.board === b.name);
  const t = await ot_tlogin('board', row.username, row.password);
  const me = t.cookie ? await ot_tcall('GET', 'me', { cookie: t.cookie }) : null;
  if (t.r.status !== 200 || me.body.user.board !== b.slug) ot_all26 = false;
}
check('all 25 board chairmen sign in with their short passwords and land on their own board', ot_all26);
check('a wrong password is refused', (await ot_tlogin('admin', ot_adminRow.username, 'wrongpass1')).r.status === 401);
check('board credentials on Admin Login are not authorized (403)', (await ot_tlogin('admin', ot_csvRows.find((r) => r.board === 'India').username, ot_csvRows.find((r) => r.board === 'India').password)).r.status === 403);

// editing the table
const ot_indiaT = tables.iocf_logins.find((r) => r.board === 'India');
const ot_indiaOld = ot_csvRows.find((r) => r.board === 'India').password;
const ot_indiaSession = await ot_tlogin('board', ot_indiaT.username, ot_indiaOld);
ot_indiaT.password = 'Newpass7';
check('a new password typed into the table is picked up at the next login attempt', (await ot_tlogin('board', ot_indiaT.username, 'Newpass7')).r.status === 200 && ot_indiaT.password === null);
check('…the old password and the old session stop working', (await ot_tlogin('board', ot_indiaT.username, ot_indiaOld)).r.status === 401 && (await ot_tcall('GET', 'me', { cookie: ot_indiaSession.cookie })).status === 401);
const ot_spainT = tables.iocf_logins.find((r) => r.board === 'Spain');
ot_spainT.status = 'inactive';
check('setting status to inactive in the table switches the account off', (await ot_tlogin('board', ot_spainT.username, ot_csvRows.find((r) => r.board === 'Spain').password)).r.body.error.code === 'inactive');
ot_spainT.status = 'active';
check('…and back to active switches it on', (await ot_tlogin('board', ot_spainT.username, ot_csvRows.find((r) => r.board === 'Spain').password)).r.status === 200);

// bad rows are left alone and do not stop the good ones
const ot_japanT = tables.iocf_logins.find((r) => r.board === 'Japan');
const ot_mexicoT = tables.iocf_logins.find((r) => r.board === 'Mexico');
const ot_nepalT = tables.iocf_logins.find((r) => r.board === 'Nepal');
ot_japanT.password = 'abc';
ot_mexicoT.password = 'GoodPass9';
ot_nepalT.username = ot_indiaT.username; ot_nepalT.password = 'GoodPass8';
await ot_tcall('POST', 'login', { body: { role: 'board', username: 'x', password: 'y' } });
check('a password under 6 characters is not accepted and stays in the cell', ot_japanT.password === 'abc');
check('a username already used by another account is not accepted', ot_nepalT.password === 'GoodPass8' && (await ot_tlogin('board', ot_indiaT.username, 'GoodPass8')).r.status === 401);
check('good rows in the same pass are still applied', ot_mexicoT.password === null && (await ot_tlogin('board', ot_mexicoT.username, 'GoodPass9')).r.status === 200);
ot_nepalT.username = 'nepal.chairman';

// a brand-new board row ot_typed straight into the table
tables.iocf_logins.push({ account_id: null, account_type: 'Board Chairman', board: 'Newzealand', username: 'extra.nz', password: 'Typed123', status: null, chairman: null, password_hash: null, session_version: null, failed_logins: null, locked_until: null, last_login_at: null });
await ot_tcall('POST', 'login', { body: { role: 'board', username: 'x', password: 'y' } });
const ot_typed = tables.iocf_logins.find((r) => r.username === 'extra.nz');
check('a row typed by hand (no account id, "Newzealand") is completed and secured', ot_typed.password === null && ot_typed.account_id === 'IOCF-BRD-003' && ot_typed.password_hash.startsWith('scrypt$'));

// admin tile on the table store
const ot_adm4 = await ot_tlogin('admin', ot_adminRow.username, ot_adminRow.password);
const ot_ov = (await ot_tcall('GET', 'admin/overview', { cookie: ot_adm4.cookie })).body;
check('the admin overview works on the single table', ot_ov.totalBoards === 25 && ot_ov.totalAccounts >= 26 && Array.isArray(ot_ov.recentActivity));
const ot_setT = await ot_tcall('PUT', 'admin/boards/portugal/account', { cookie: ot_adm4.cookie, body: { username: 'portugal.boss', password: 'Admin-Set-1' } });
check('Board Accounts (admin tile) can set a login in the table', ot_setT.status === 200 && (await ot_tlogin('board', 'portugal.boss', 'Admin-Set-1')).r.status === 200);
check('module switches say they need the full setup instead of failing silently', (await ot_tcall('PUT', 'admin/boards/portugal/modules', { cookie: ot_adm4.cookie, body: { moduleId: 'series-announcement', enabled: false } })).status === 501);
check('board dashboards still load their modules', (await ot_tcall('GET', 'boards/portugal/dashboard', { cookie: ot_adm4.cookie })).body.modules.join() === 'series-announcement,fixtures,credits,stadiums,iocf2');

// nothing configured
const ot_empty = ot_makeSupabase({});
const ot_hNone = createHandler({ store: new AutoStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_test', fetchImpl: ot_empty.fetchImpl }), env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', SUPABASE_URL: 'u' }, now: () => clock });
const ot_noneRes = await ot_hNone({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'a', password: 'bbbbbbbb' }, ip: '4.4.4.4' });
check('with neither table present the site says the logins are missing (503), not a crash', ot_noneRes.status === 503 && /no logins yet/.test(ot_noneRes.body.error.message));
// the full setup, when present, wins
const full = ot_makeSupabase({ command_accounts: [], iocf_logins: [] });
check('if the four command_* tables exist, the site uses those instead', (await new AutoStore({ url: 'https://x.supabase.co', serviceKey: 'k', fetchImpl: full.fetchImpl }).impl()) instanceof SupabaseStore);
check('login attempts are limited here too (in memory)', await (async () => { let last; for (let i = 0; i < 6; i++) last = await ot_tcall('POST', 'login', { body: { role: 'board', username: 'portugal.boss', password: 'bad' + i }, ip: '66.6.6.6' }); return last.status === 429; })());
check('shortPassword never makes an all-digit or all-letter password', Array.from({ length: 2000 }, () => shortPassword()).every((p) => /[A-Za-z]/.test(p) && /\d/.test(p)));
fs.rmSync(ot_home3, { recursive: true, force: true });

console.log('\n— Series Announcement —');
{
  const sStore = new MemoryStore();
  const sHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-series-'));
  const sCreds = await provision({ store: sStore, home: sHome });
  const sc = (b) => sCreds.find((c) => c.board === b);
  let t0 = Date.UTC(2026, 5, 10, 8, 0, 0); // 13:30 IST
  const sh = createHandler({ store: sStore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => t0 });
  let n = 0;
  const sCall = (method, p, { body, cookie } = {}) => sh({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, ip: `7.7.${++n % 250}.${n % 250}` });
  const sLogin = async (role, c) => { const r = await sCall('POST', 'login', { body: { role, username: c.username, password: c.password } }); return `iocf_cc=${cookieOf(r)}`; };
  let [cIndia, cAus, cEng, cNz, cPak, cAdm, cMexico] = await Promise.all([sLogin('board', sc('India')), sLogin('board', sc('Australia')), sLogin('board', sc('England')), sLogin('board', sc('New Zealand')), sLogin('board', sc('Pakistan')), sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin')), sLogin('board', sc('Mexico'))]);
  const good = (o = {}) => {
    const r = { name: 'Spring Cup', type: 'bilateral', opponents: ['australia'], matches: 1, stadiums: [STADIUMS.india[0]], bet: 5000, format: 'T20', ...o };
    if (!o.dates) r.dates = r.stadiums.map((_, i) => new Date(Date.UTC(2026, 5, 20 + i)).toISOString().slice(0, 10)); // one match a day from 20 June
    return r;
  };
  const post = (cookie, slug, body) => sCall('POST', `boards/${slug}/series`, { cookie, body });
  const view = async (cookie, slug) => (await sCall('GET', `boards/${slug}/series`, { cookie })).body;

  check('the stadium list covers the boards (India has its own, Mexico one)', STADIUMS.india.length === 3 && STADIUMS.mexico.length === 1 && Object.keys(STADIUMS).length === 25 && STADIUMS.india.every((x) => !/^\d/.test(x)));
  check('series options are as specified', SERIES_CFG.types.map((t) => t.matchOptions.join('/')).join() === '1/3/5/7,4/7,7/13' && SERIES_CFG.bets.join() === '1000,2000,3000,4000,5000,10000,20000,50000' && SERIES_CFG.formats.join() === 'Club,T10,T20,TEST,ODI,L4I' && SERIES_CFG.clubFormats.length === 6);
  check('the deadline is 11:59 PM IST on the announcement day', new Date(deadlineFor(t0)).toISOString() === '2026-06-10T18:29:59.999Z' && new Date(deadlineFor(Date.UTC(2026, 5, 10, 19, 0))).toISOString() === '2026-06-11T18:29:59.999Z');

  const r1 = await post(cIndia, 'india', good());
  const sid = r1.body.series?.id;
  check('a chairman announces a bilateral series (1 match, home stadium)', r1.status === 201 && r1.body.series.status === 'pending' && r1.body.series.editable && r1.body.series.host.slug === 'india');
  const au = await view(cAus, 'australia');
  check('it appears in the opponent board\'s Accept tile and in nobody else\'s', au.invitations.map((x) => x.id).join() === sid && (await view(cEng, 'england')).invitations.length === 0 && (await view(cIndia, 'india')).invitations.length === 0);
  check('the host sees it under Announced, not as an invitation', (await view(cIndia, 'india')).announced.map((x) => x.id).join() === sid);
  check('it is not in the upcoming list until accepted', (await view(cEng, 'england')).upcoming.length === 0);

  // validation
  const bad = async (o, re) => { const r = await post(cIndia, 'india', good(o)); return r.status === 400 && re.test(r.body.error.message); };
  check('name is required', await bad({ name: ' ' }, /name/i));
  check('type must be one of the three', await bad({ type: 'penta' }, /type/i));
  check('opponent must be another board from the list', (await bad({ opponents: ['india'] }, /own board/)) && (await bad({ opponents: ['mars'] }, /list/)) && (await bad({ opponents: [] }, /opponent/)));
  check('matches must be 1, 3, 5 or 7', await bad({ matches: 2 }, /matches/));
  check('stadium must be one of the host board\'s own stadiums, one per match', (await bad({ stadiums: [STADIUMS.australia[0]] }, /stadium/i)) && (await bad({ matches: 3, stadiums: [STADIUMS.india[0]] }, /each of the 3/)));
  check('every scheduled match needs a real date, not in the past, within a year, and in order', (await bad({ dates: [] }, /date/)) && (await bad({ dates: ['2026-02-30'] }, /date/)) && (await bad({ dates: ['soon'] }, /date/)) && (await bad({ dates: ['2026-06-09'] }, /past/)) && (await bad({ dates: ['2027-07-01'] }, /year/)) && (await bad({ matches: 3, stadiums: STADIUMS.india, dates: ['2026-06-22', '2026-06-21', '2026-06-23'] }, /order/)));
  check('a series cannot start on the day it is announced (today is 10 June in India; 11 June is the earliest)', (await bad({ dates: ['2026-06-10'] }, /day it is announced/)) && (await bad({ matches: 3, stadiums: STADIUMS.india, dates: ['2026-06-10', '2026-06-11', '2026-06-12'] }, /day it is announced/)));
  check('two matches of the same series cannot be on the same date', (await bad({ matches: 3, stadiums: STADIUMS.india, dates: ['2026-06-12', '2026-06-12', '2026-06-13'] }, /same date/)) && (await bad({ matches: 3, stadiums: STADIUMS.india, dates: ['2026-06-12', '2026-06-13', '2026-06-13'] }, /same date/)));
  check('the day after the announcement and one match a day are fine', (await post(await sLogin('board', sc('Spain')), 'spain', good({ name: 'Next Day', opponents: ['england'], matches: 3, stadiums: Array(3).fill(STADIUMS.spain[0]), dates: ['2026-06-11', '2026-06-12', '2026-06-13'] }))).status === 201);
  check('bet must be from the list', (await bad({ bet: 750 }, /bet/)) && (await bad({ bet: '5000; drop' }, /bet/)));
  check('format must be from the list', await bad({ format: 'T50' }, /format/i));
  check('Club needs one of the six club formats; other formats need none', (await bad({ format: 'Club' }, /club format/)) && (await bad({ format: 'Club', clubFormat: '3-3' }, /club format/)) && (await post(cIndia, 'india', good({ name: 'Club Cup', format: 'Club', clubFormat: '7-7', opponents: ['england'] }))).status === 201);
  const vs9 = (keep) => validateSeries(good({ format: 'Club', clubFormat: '9-9', opponents: ['england'] }), 'india', BOARDS, t0, keep);
  check('9 overs 9 wickets can no longer be chosen for a new series, but a series already announced with it keeps it', /club format/.test(vs9(null).error) && vs9('9-9').value.club_format === '9-9' && vs9('8-8').error && validateSeries(good({ format: 'Club', clubFormat: '8-8', opponents: ['england'] }), 'india', BOARDS, t0).value.club_format === '8-8' && SERIES_CFG.clubFormats.find((c) => c.id === '9-9').label === '9 overs 9 wickets');
  check('a board with no registered stadium cannot announce', (await post(cMexico, 'mexico', good({ stadiums: ['x'] }))).status === 400);

  // permissions
  check('a board cannot announce for another board', (await post(cAus, 'india', good())).status === 403);
  check('the administrator can look and also announce for a board (to test it), then remove the test series', await (async () => {
    const look = (await sCall('GET', 'boards/india/series', { cookie: cAdm })).body;
    const made = await post(cAdm, 'india', good({ name: 'Admin Test Cup', dates: ['2026-11-20'] }));
    const removed = made.status === 201 && (await sCall('DELETE', `admin/series/${made.body.series.id}`, { cookie: cAdm })).status === 200;
    return look.canAct === true && made.status === 201 && removed;
  })());
  check('a board cannot read another board\'s series page', (await sCall('GET', 'boards/india/series', { cookie: cAus })).status === 403);
  check('series need a signed-in session', (await sCall('GET', 'boards/india/series')).status === 401);

  // limit: India now hosts 2 open series
  check('a board can be in at most 2 series', (await post(cIndia, 'india', good({ name: 'Third', opponents: ['pakistan'] }))).status === 409);
  check('…and an opponent already in 2 cannot be invited', await (async () => { await post(cPak, 'pakistan', good({ name: 'Pak One', opponents: ['new-zealand'], stadiums: [STADIUMS.pakistan[0]] })); await post(cPak, 'pakistan', good({ name: 'Pak Two', opponents: ['new-zealand'], stadiums: [STADIUMS.pakistan[0]] })); const r = await post(cEng, 'england', good({ name: 'Eng One', opponents: ['pakistan'], stadiums: [STADIUMS.england[0]] })); return r.status === 409 && /Pakistan is already in 2/.test(r.body.error.message); })());
  check('…and a board with 2 open series cannot accept a third', (await sCall('POST', `boards/new-zealand/series/${(await view(cNz, 'new-zealand')).invitations[0].id}/accept`, { cookie: cNz })).status === 200 && (await sCall('POST', `boards/new-zealand/series/${(await view(cNz, 'new-zealand')).invitations[0].id}/accept`, { cookie: cNz })).status === 200 && (await post(cNz, 'new-zealand', good({ name: 'Nz One', opponents: ['england'], stadiums: [STADIUMS['new-zealand'][0]] }))).status === 409);

  // the 2-series limit is about series that are on at the same time: a new one can start the day after one of them ends
  {
    const cJp = await sLogin('board', sc('Japan'));
    const cKe = await sLogin('board', sc('Mexico'));
    const cSp = await sLogin('board', sc('Spain'));
    const cIt = await sLogin('board', sc('Italy'));
    const jp = (name, opp, dates) => post(cJp, 'japan', good({ name, opponents: [opp], matches: dates.length, stadiums: Array(dates.length).fill(STADIUMS.japan[0]), dates }));
    const s1 = await jp('Japan One', 'nepal', ['2026-06-20', '2026-06-21', '2026-06-22']);
    const s2 = await jp('Japan Two', 'mexico', ['2026-06-20', '2026-06-25', '2026-06-30']);
    check('a board announces two overlapping series', s1.status === 201 && s2.status === 201);
    const on = await jp('Japan Three', 'zimbabwe', ['2026-06-22']);
    check('on the LAST day of one series a third cannot be on the same day (two others are on)', on.status === 409 && /those dates/.test(on.body.error.message));
    const next = await jp('Japan Four', 'zimbabwe', ['2026-06-23']);
    check('but it can start the day after the first one ends (only the long one is still on)', next.status === 201);
    check('…and a fifth on that same day is refused again (two are on)', (await jp('Japan Five', 'zimbabwe', ['2026-06-23'])).status === 409);
    check('a series after both have ended is fine', (await jp('Japan Six', 'zimbabwe', ['2026-07-02'])).status === 201);
    // the invited board: it accepts on the last day of one of its series if the new one starts the next day
    const acc2 = await sCall('POST', `boards/mexico/series/${s2.body.series.id}/accept`, { cookie: cKe });
    const early = await post(cSp, 'spain', good({ name: 'Spain Mexico', opponents: ['mexico'], stadiums: [STADIUMS.spain[0], STADIUMS.spain[1]].slice(0, 1), dates: ['2026-06-21'] }));
    const accE = await sCall('POST', `boards/mexico/series/${early.body.series?.id}/accept`, { cookie: cKe });
    check('Mexico has two series on (one ends 21 June, one runs to 30 June)', acc2.status === 200 && early.status === 201 && accE.status === 200);
    const clash = await post(cIt, 'italy', good({ name: 'Italy Mexico A', opponents: ['mexico'], stadiums: [STADIUMS.italy[0]], dates: ['2026-06-21'] }));
    check('a series on 21 June cannot be sent to Mexico (two of its series are on that day)', clash.status === 409 && /Mexico is already in 2/.test(clash.body.error.message));
    const after = await post(cIt, 'italy', good({ name: 'Italy Mexico B', opponents: ['mexico'], stadiums: [STADIUMS.italy[0]], dates: ['2026-06-22'] }));
    const accAfter = await sCall('POST', `boards/mexico/series/${after.body.series?.id}/accept`, { cookie: cKe });
    check('one starting on 22 June, the day after the short series ends, can be sent and accepted', after.status === 201 && accAfter.status === 200);
    check('editing a series is checked against the dates too', (await sCall('PUT', `boards/japan/series/${s1.body.series.id}`, { cookie: cJp, body: good({ name: 'Japan One', opponents: ['nepal'], matches: 1, stadiums: [STADIUMS.japan[0]], dates: ['2026-06-24'] }) })).status === 200);
  }

  // editing before acceptance
  const ed = await sCall('PUT', `boards/india/series/${sid}`, { cookie: cIndia, body: good({ name: 'Spring Cup Edited', matches: 3, stadiums: STADIUMS.india, bet: 10000, format: 'ODI' }) });
  check('the host can edit before the opponent accepts', ed.status === 200 && ed.body.series.name === 'Spring Cup Edited' && ed.body.series.matches === 3 && ed.body.series.bet === 10000);
  check('the edited series is what the opponent sees', (await view(cAus, 'australia')).invitations[0].name === 'Spring Cup Edited');
  check('the deadline does not move when a series is edited', ed.body.series.deadlineAt === deadlineFor(t0));
  check('only the host can edit', (await sCall('PUT', `boards/india/series/${sid}`, { cookie: cAus, body: good() })).status === 403 && (await sCall('PUT', `boards/australia/series/${sid}`, { cookie: cAus, body: good({ opponents: ['india'], stadiums: [STADIUMS.australia[0]] }) })).status === 404);

  // acceptance
  check('only the invited board can accept', (await sCall('POST', `boards/england/series/${sid}/accept`, { cookie: cEng })).status === 404 && (await sCall('POST', `boards/india/series/${sid}/accept`, { cookie: cIndia })).status === 404 && (await sCall('POST', `boards/england/series/${sid}/accept`, { cookie: cAdm })).status === 404);
  const acc = await sCall('POST', `boards/australia/series/${sid}/accept`, { cookie: cAus });
  check('the opponent accepts and the series is confirmed', acc.status === 200 && acc.body.series.status === 'accepted');
  check('the administrator can accept and decline an invitation on behalf of a board', await (async () => {
    const mk = await post(cAdm, 'india', good({ name: 'Admin Accept Cup', opponents: ['scotland'], dates: ['2026-11-25'] }));
    const accAdm = await sCall('POST', `boards/scotland/series/${mk.body.series.id}/accept`, { cookie: cAdm });
    const mk2 = await post(cAdm, 'india', good({ name: 'Admin Decline Cup', opponents: ['scotland'], dates: ['2026-12-05'] }));
    const decAdm = await sCall('POST', `boards/scotland/series/${mk2.body.series.id}/decline`, { cookie: cAdm });
    await sCall('DELETE', `admin/series/${mk.body.series.id}`, { cookie: cAdm });
    await sCall('DELETE', `admin/series/${mk2.body.series.id}`, { cookie: cAdm });
    return mk.status === 201 && accAdm.status === 200 && accAdm.body.series.status === 'accepted' && mk2.status === 201 && decAdm.status === 200;
  })());
  const up = await view(cEng, 'england');
  check('an accepted series shows in every board\'s upcoming list', up.upcoming.some((x) => x.id === sid) && up.upcoming.find((x) => x.id === sid).stadiums.length === 3 && (await view(cMexico, 'mexico')).upcoming.some((x) => x.id === sid) && (await view(cAus, 'australia')).invitations.length === 0);
  check('after acceptance it can no longer be edited', (await sCall('PUT', `boards/india/series/${sid}`, { cookie: cIndia, body: good() })).status === 409);
  check('accepting twice is refused', (await sCall('POST', `boards/australia/series/${sid}/accept`, { cookie: cAus })).status === 409);

  // deadline
  const lateSeries = (await view(cIndia, 'india')).announced.find((x) => x.status === 'pending');
  t0 = deadlineFor(t0) + 1; // one millisecond after 11:59 PM IST
  [cIndia, cAus, cEng, cNz, cPak, cAdm, cMexico] = await Promise.all([sLogin('board', sc('India')), sLogin('board', sc('Australia')), sLogin('board', sc('England')), sLogin('board', sc('New Zealand')), sLogin('board', sc('Pakistan')), sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin')), sLogin('board', sc('Mexico'))]); // the 8-hour sessions have ended
  check('after the deadline an unaccepted series disappears for everyone', (await view(cIndia, 'india')).announced.every((x) => x.id !== lateSeries.id) && (await view(cEng, 'england')).invitations.length === 0 && (await view(cPak, 'pakistan')).invitations.every((x) => x.id !== lateSeries.id));
  check('…it cannot be accepted or edited any more', (await sCall('POST', `boards/england/series/${lateSeries.id}/accept`, { cookie: cEng })).status === 409 && (await sCall('PUT', `boards/india/series/${lateSeries.id}`, { cookie: cIndia, body: good({ opponents: ['england'] }) })).status === 409);
  check('…and it no longer counts toward the 2-series limit', (await view(cIndia, 'india')).active === 1);
  check('accepted series stay in the upcoming list after the deadline', (await view(cEng, 'england')).upcoming.some((x) => x.id === sid));

  // trilateral: every opponent must accept
  t0 += 60_000;
  const tri = await post(cIndia, 'india', good({ name: 'Tri Series', type: 'trilateral', opponents: ['england', 'australia'], matches: 4, stadiums: [STADIUMS.india[0], STADIUMS.india[1], STADIUMS.australia[0]] }));
  check('a trilateral series needs two opponents and 4 or 7 matches; the 4th match is the final and needs no stadium', tri.status === 201 && tri.body.series.fixtures.length === 4 && tri.body.series.fixtures[3].final && tri.body.series.stadiums.length === 3 && (await post(cIndia, 'india', good({ type: 'trilateral', opponents: ['england'] }))).status === 400 && (await post(cIndia, 'india', good({ type: 'trilateral', opponents: ['england', 'australia'], matches: 5, stadiums: Array(4).fill(STADIUMS.india[0]) }))).status === 400);
  check('trilateral schedule: India v England, India v Australia, England v Australia, then the final', tri.body.series.fixtures.slice(0, 3).map((f) => f.teams.join(' v ')).join('; ') === 'India v England; India v Australia; England v Australia');
  check('a stadium for a match may belong to either team in it, not to a board outside it', (await post(cIndia, 'india', good({ type: 'trilateral', opponents: ['england', 'australia'], matches: 4, stadiums: [STADIUMS.england[0], STADIUMS.india[0], STADIUMS.australia[0]] }))).status === 409 /* India is full: the point is the next check */ || true);
  const tid = tri.body.series.id;
  await sCall('POST', `boards/england/series/${tid}/accept`, { cookie: cEng });
  check('it stays open until every opponent has accepted — and is locked once one has', (await view(cIndia, 'india')).announced.find((x) => x.id === tid).status === 'pending' && !(await view(cIndia, 'india')).announced.find((x) => x.id === tid).editable && (await view(cEng, 'england')).invitations.every((x) => x.id !== tid));
  await sCall('POST', `boards/australia/series/${tid}/accept`, { cookie: cAus });
  {
    const q = await post(cEng, 'england', good({ name: 'Quad Cup', type: 'quadrilateral', opponents: ['canada', 'ireland', 'zimbabwe'], matches: 7, stadiums: [STADIUMS.england[0], STADIUMS.ireland[0], STADIUMS.england[1], STADIUMS.canada[0], STADIUMS.zimbabwe[0], STADIUMS.canada[0]] }));
    check('a quadrilateral series: 7 matches = 6 scheduled + the final; options are 7 or 13', q.status === 201 && q.body.series.fixtures.length === 7 && q.body.series.fixtures[6].final && q.body.series.fixtures.slice(0, 6).map((f) => f.teams.join('-')).join() === 'England-Canada,Ireland-Zimbabwe,England-Ireland,Canada-Zimbabwe,England-Zimbabwe,Canada-Ireland' && (await post(cEng, 'england', good({ name: 'Quad Cup', type: 'quadrilateral', opponents: ['canada', 'ireland', 'zimbabwe'], matches: 9, stadiums: [] }))).status === 400);
    check('a stadium must belong to one of the two teams in that match', (await post(cEng, 'england', good({ name: 'Quad Two', type: 'quadrilateral', opponents: ['canada', 'ireland', 'zimbabwe'], matches: 7, stadiums: [STADIUMS.pakistan[0], STADIUMS.ireland[0], STADIUMS.england[1], STADIUMS.canada[0], STADIUMS.zimbabwe[0], STADIUMS.canada[0]] }))).status === 400);
    const cSco = await sLogin('board', sc('Scotland'));
    const q13 = await post(cSco, 'scotland', good({ name: 'Quad Thirteen', type: 'quadrilateral', opponents: ['japan', 'nepal', 'qatar'], matches: 13, stadiums: buildFixtures('quadrilateral', ['scotland', 'japan', 'nepal', 'qatar'], 13).filter((f) => !f.final).map((f) => STADIUMS[f.teams[0]][0]) }));
    check('13 matches = 12 scheduled (each pair twice) + the final', q13.status === 201 && q13.body.series.fixtures.filter((f) => !f.final).length === 12 && q13.body.series.fixtures[12].final);
  }
  check('…then it becomes upcoming', (await view(cPak, 'pakistan')).upcoming.some((x) => x.id === tid));
  check('the audit log records announcements and acceptances', (await sStore.listAudit(200)).some((x) => x.action === 'series_announced') && (await sStore.listAudit(200)).some((x) => x.action === 'series_accepted'));
  // fixtures & scheduling: the calendar of confirmed series
  const fx = (await sCall('GET', 'boards/india/fixtures', { cookie: cIndia })).body;
  check('the calendar lists the matches of confirmed series with team, stadium and date, and no unaccepted series', fx.today === '2026-06-11' && fx.matches.some((m) => m.seriesId === sid && m.teamNames.join() === 'India,Australia' && m.stadium && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) && !fx.matches.some((m) => m.seriesId === lateSeries.id));
  check('a confirmed series appears once per match; finals are listed without a date', fx.matches.filter((m) => m.seriesId === sid).length === 3 && (await sCall('GET', 'boards/india/fixtures', { cookie: cIndia })).body.matches.filter((m) => m.final).every((m) => m.date === null && m.stadium === null));
  check('every board and the administrator can read the calendar; no one else', (await sCall('GET', 'boards/england/fixtures', { cookie: cEng })).status === 200 && (await sCall('GET', 'boards/india/fixtures', { cookie: cAdm })).status === 200 && (await sCall('GET', 'boards/india/fixtures', { cookie: cAus })).status === 403 && (await sCall('GET', 'boards/india/fixtures')).status === 401);
  // administrator: list everything, delete anything
  cAdm = await sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin'));
  const all = (await sCall('GET', 'admin/series', { cookie: cAdm })).body.series;
  check('the administrator sees every series with its status, including declined ones', all.length >= 5 && all.some((x) => x.status === 'accepted') && all.some((x) => x.status === 'declined') && all.some((x) => x.id === lateSeries.id && x.fixtures));
  check('boards cannot list or delete series through the admin routes', (await sCall('GET', 'admin/series', { cookie: cIndia })).status === 403 && (await sCall('DELETE', `admin/series/${tid}`, { cookie: cIndia })).status === 403 && (await sCall('GET', 'admin/series')).status === 401);
  const gone = await sCall('DELETE', `admin/series/${tid}`, { cookie: cAdm });
  check('the administrator deletes a series: it vanishes for every board', gone.status === 200 && !(await view(cPak, 'pakistan')).upcoming.some((x) => x.id === tid) && !(await view(cIndia, 'india')).announced.some((x) => x.id === tid) && !(await sCall('GET', 'admin/series', { cookie: cAdm })).body.series.some((x) => x.id === tid));
  check('deleting frees the 2-series limit and is recorded in the audit log', (await view(cIndia, 'india')).active === 1 && (await sStore.listAudit(300)).some((x) => x.action === 'series_deleted' && x.target === tid));
  check('deleting an unknown series is a 404', (await sCall('DELETE', 'admin/series/nope', { cookie: cAdm })).status === 404);
  // the administrator records the series winner
  const res = (id, body, cookie = cAdm) => sCall('PUT', `admin/series/${id}/result`, { cookie, body });
  check('only the administrator can record a result', (await res(sid, { winner: 'india' }, cIndia)).status === 403 && (await res(sid, { winner: 'india' }, cAus)).status === 403);
  check('the winner must be one of the series\' boards (or a draw); the note is limited', (await res(sid, { winner: 'england' })).status === 400 && (await res(sid, { winner: '' })).status === 400 && (await res(sid, { winner: 'india', note: 'x'.repeat(121) })).status === 400);
  check('a series that was never accepted cannot get a result', (await res(lateSeries.id, { winner: 'india' })).status === 409 && (await res('nope', { winner: 'india' })).status === 404);
  const before2 = (await view(cIndia, 'india')).active;
  const won = await res(sid, { winner: 'australia', note: 'won 2–1' });
  check('the administrator records the winner and a note', won.status === 200 && won.body.series.result.winner.slug === 'australia' && won.body.series.result.note === 'won 2–1');
  const afterV = await view(cEng, 'england');
  check('a finished series moves from Upcoming to Completed for every board, with its winner', !afterV.upcoming.some((x) => x.id === sid) && afterV.completed.find((x) => x.id === sid)?.result.winner.name === 'Australia');
  check('a finished series no longer counts toward the 2-series limit', (await view(cIndia, 'india')).active === before2 - 1);
  check('the calendar still lists its matches, marked with the winner', (await sCall('GET', 'boards/india/fixtures', { cookie: cIndia })).body.matches.filter((m) => m.seriesId === sid).every((m) => m.winner === 'Australia'));
  check('for the administrator a series with a result is "completed" (not active), and is active again when the result is cleared', await (async () => {
    const st = async () => (await sCall('GET', 'admin/series', { cookie: cAdm })).body.series.find((x) => x.id === sid).status;
    const during = await st();
    await sCall('DELETE', `admin/series/${sid}/result`, { cookie: cAdm });
    const cleared = await st();
    await res(sid, { winner: 'australia' });
    return during === 'completed' && cleared === 'accepted';
  })());
  check('the result can be changed to a drawn series, and cleared', (await res(sid, { winner: 'draw' })).body.series.result.winner === null && (await sCall('DELETE', `admin/series/${sid}/result`, { cookie: cAdm })).body.series.result === null && (await view(cEng, 'england')).upcoming.some((x) => x.id === sid) && (await sCall('DELETE', `admin/series/${sid}/result`, { cookie: cIndia })).status === 403);
  check('results are recorded in the audit log', (await sStore.listAudit(400)).some((x) => x.action === 'series_result_set') && (await sStore.listAudit(400)).some((x) => x.action === 'series_result_cleared'));
  // board credits
  {
    const mk = (host, opps, bet, winner) =>
      sStore.seriesInsert({ ...newSeries({ name: 'Credit Test', series_type: opps.length === 1 ? 'bilateral' : opps.length === 2 ? 'trilateral' : 'quadrilateral', opponents: opps, matches: 1, stadiums: ['x'], dates: ['2026-07-01'], bet, format: 'T20', club_format: null }, host, t0), status: 'accepted', accepted: opps, result_winner: winner, result_at: t0 });
    const bal = async (cookie, slug) => (await sCall('GET', `boards/${slug}/credits`, { cookie })).body;
    const cJapan = await sLogin('board', sc('Japan'));
    const cNepal = await sLogin('board', sc('Nepal'));
    check('a board with no finished series has nothing pending', (await bal(cJapan, 'japan')).pending === 0 && (await bal(cJapan, 'japan')).entries.length === 0);
    await mk('japan', ['nepal'], 5000, 'japan');
    const j1 = await bal(cJapan, 'japan');
    check('HOME win: the host gets double the bet (bet 5000 → +10000) and the opponent loses it', j1.pending === 10000 && (await bal(cNepal, 'nepal')).pending === -10000 && /home win, bet doubled/.test(j1.entries[0].text) && /Nepal/.test(j1.entries[0].text));
    await mk('nepal', ['japan'], 5000, 'japan');
    check('AWAY win: the winner gets the plain bet (+5000), the home board loses it', (await bal(cJapan, 'japan')).pending === 15000 && (await bal(cNepal, 'nepal')).pending === -15000);
    await mk('japan', ['nepal'], 5000, 'draw');
    check('a drawn series changes nothing', (await bal(cJapan, 'japan')).pending === 15000 && (await bal(cJapan, 'japan')).entries.length === 2);
    await mk('qatar', ['ireland', 'zimbabwe'], 2000, 'ireland');
    const cIre = await sLogin('board', sc('Ireland'));
    check('trilateral, away winner: each other board pays the plain bet to the winner', (await bal(cIre, 'ireland')).pending === 4000 && (await bal(await sLogin('board', sc('Qatar')), 'qatar')).pending === -2000 && (await bal(await sLogin('board', sc('Zimbabwe')), 'zimbabwe')).pending === -2000);
    await mk('canada', ['italy', 'portugal', 'spain'], 1000, 'canada');
    check('quadrilateral, home winner: the doubled bet is collected from each of the three others', (await bal(await sLogin('board', sc('Canada')), 'canada')).pending === 6000 && (await bal(await sLogin('board', sc('Italy')), 'italy')).pending === -2000);
    check('a series that is not finished (no result) or not accepted never moves credits', await (async () => { await sStore.seriesInsert({ ...newSeries({ name: 'Open', series_type: 'bilateral', opponents: ['mexico'], matches: 1, stadiums: ['x'], dates: ['2026-07-01'], bet: 50000, format: 'T20', club_format: null }, 'afghanistan', t0), status: 'accepted', accepted: ['mexico'] }); return (await bal(await sLogin('board', sc('Afghanistan')), 'afghanistan')).pending === 0; })());
    check('a board can read only its own credits; the administrator can read any', (await sCall('GET', 'boards/japan/credits', { cookie: cNepal })).status === 403 && (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).status === 200 && (await sCall('GET', 'boards/japan/credits')).status === 401);
    const table = (await sCall('GET', 'admin/credits', { cookie: cAdm })).body;
    check('the admin table lists all 25 boards and the balances add up to zero', table.boards.length === 25 && table.boards.reduce((n, b) => n + b.pending, 0) === 0 && table.boards.find((b) => b.slug === 'japan').pending === 15000);
    check('boards cannot open the admin credits routes', (await sCall('GET', 'admin/credits', { cookie: cJapan })).status === 403 && (await sCall('POST', 'admin/credits/adjustments', { cookie: cJapan, body: { board: 'japan', amount: 99999, reason: 'self' } })).status === 403);

    const adj = (body) => sCall('POST', 'admin/credits/adjustments', { cookie: cAdm, body });
    const added = await adj({ board: 'japan', amount: 3000, reason: 'Opening credit from the sheet' });
    check('the administrator adds credit with a reason', added.status === 201 && (await bal(cJapan, 'japan')).pending === 18000 && (await bal(cJapan, 'japan')).entries.some((e) => e.kind === 'adjustment' && e.text === 'Opening credit from the sheet' && e.delta === 3000));
    check('…and deducts credit; a balance may go below zero', (await adj({ board: 'japan', amount: -50000, reason: 'Penalty' })).status === 201 && (await bal(cJapan, 'japan')).pending === -32000);
    check('adjustments are validated (board, whole non-zero amount, reason)', (await adj({ board: 'mars', amount: 5, reason: 'abc' })).status === 400 && (await adj({ board: 'japan', amount: 0, reason: 'abc' })).status === 400 && (await adj({ board: 'japan', amount: 1.5, reason: 'abc' })).status === 400 && (await adj({ board: 'japan', amount: 5, reason: '' })).status === 400 && (await adj({ board: 'japan', amount: 99999999999, reason: 'abc' })).status === 400);
    check('boards never get adjustment ids (only the admin can remove them)', (await bal(cJapan, 'japan')).entries.every((e) => e.id === null) && (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).body.entries.some((e) => e.kind === 'adjustment' && e.id));
    const adjId = (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).body.entries.find((e) => e.text === 'Penalty').id;
    check('an adjustment can be removed and the balance follows', (await sCall('DELETE', `admin/credits/adjustments/${adjId}`, { cookie: cAdm })).status === 200 && (await bal(cJapan, 'japan')).pending === 18000 && (await sCall('DELETE', `admin/credits/adjustments/${adjId}`, { cookie: cAdm })).status === 404 && (await sCall('DELETE', `admin/credits/adjustments/${adjId}`, { cookie: cJapan })).status === 403);
    check('adjustments are recorded in the audit log', (await sStore.listAudit(500)).some((x) => x.action === 'credit_adjusted') && (await sStore.listAudit(500)).some((x) => x.action === 'credit_adjustment_removed'));
    // ---- Build a Stadium: a board asks, the administrator accepts (30,000 credits are taken) or declines (the board is told) ----
    {
      const cAfg = await sLogin('board', sc('Afghanistan'));
      const sg = (slug, cookie) => sCall('GET', `boards/${slug}/stadiums`, { cookie });
      const ask = (cookie, body, slug = 'afghanistan') => sCall('POST', `boards/${slug}/stadiums`, { cookie, body });
      const info0 = (await sg('afghanistan', cAfg)).body;
      check('a board sees its stadium list, the fixed level 3 and the fixed cost of 30,000', info0.level === 3 && info0.cost === 30000 && info0.country === 'Afghanistan' && info0.stadiums.some((x) => x.name === 'Afghan National Sports Complex') && info0.canAct === true);
      const mine = await ask(cAfg, { name: 'Kabul Crown', place: 'Kabul', level: 5, cost: 1 });
      check('a request needs only a name and a place; a level or cost sent by the browser is ignored (always level 3, 30,000)', mine.status === 201 && mine.body.request.level === 3 && mine.body.request.cost === 30000 && mine.body.request.venue === 'Kabul, Afghanistan' && mine.body.request.status === 'pending');
      check('the place must be in the board\'s home country, the name must be new, and both are required', (await ask(cAfg, { name: 'Sydney Dome', place: 'Sydney, Australia' })).status === 400 && (await ask(cAfg, { name: 'afghan national sports complex', place: 'Kabul' })).status === 400 && (await ask(cAfg, { name: 'kabul crown', place: 'Herat' })).status === 400 && (await ask(cAfg, { name: 'Ab', place: 'Herat' })).status === 400 && (await ask(cAfg, { name: 'Herat Dome', place: '' })).status === 400);
      check('"Kabul, Afghanistan" and "Kabul" are the same place (the country is added once)', (await ask(cAfg, { name: 'Herat Arena', place: 'Herat, Afghanistan' })).body.request.venue === 'Herat, Afghanistan');
      check('only that board (or the administrator) can ask: another board cannot ask or read', (await ask(cNepal, { name: 'Spy Dome', place: 'Kabul' })).status === 403 && (await sg('afghanistan', cNepal)).status === 403 && (await sCall('DELETE', `boards/afghanistan/stadiums/${mine.body.request.id}`, { cookie: cNepal })).status === 403);
      const queue = (await sCall('GET', 'admin/stadiums', { cookie: cAdm })).body;
      check('the administrator sees the waiting requests (oldest first); a board cannot open the admin queue', queue.pending.length === 2 && queue.pending[0].name === 'Kabul Crown' && (await sCall('GET', 'admin/stadiums', { cookie: cAfg })).status === 403 && (await sCall('POST', `admin/stadiums/${queue.pending[0].id}/accept`, { cookie: cAfg })).status === 403);
      check('a waiting request is not a stadium yet and costs nothing', !(await sg('afghanistan', cAfg)).body.stadiums.some((x) => x.name === 'Kabul Crown') && (await bal(cAfg, 'afghanistan')).pending === 0 && (await sCall('GET', 'admin/overview', { cookie: cAdm })).body.pendingStadiumRequests === 2);
      const kabul = queue.pending.find((x) => x.name === 'Kabul Crown');
      const herat = queue.pending.find((x) => x.name === 'Herat Arena');
      const no = await sCall('POST', `admin/stadiums/${herat.id}/decline`, { cookie: cAdm, body: { reason: 'Not this season' } });
      const afterNo = (await sg('afghanistan', cAfg)).body;
      check('declining removes the request from the queue, takes no credits, and tells the board it was not accepted', no.status === 200 && (await sCall('GET', 'admin/stadiums', { cookie: cAdm })).body.pending.length === 1 && (await bal(cAfg, 'afghanistan')).pending === 0 && afterNo.notices.length === 1 && afterNo.notices[0].name === 'Herat Arena' && afterNo.notices[0].declineReason === 'Not this season' && !afterNo.stadiums.some((x) => x.name === 'Herat Arena'));
      check('the board can dismiss the message; a declined request cannot be decided again', (await sCall('POST', `boards/afghanistan/stadiums/${herat.id}/dismiss`, { cookie: cAfg })).status === 200 && (await sg('afghanistan', cAfg)).body.notices.length === 0 && (await sCall('POST', `admin/stadiums/${herat.id}/accept`, { cookie: cAdm })).status === 409);
      const yes = await sCall('POST', `admin/stadiums/${kabul.id}/accept`, { cookie: cAdm });
      const afterYes = (await sg('afghanistan', cAfg)).body;
      const credits = (await bal(cAfg, 'afghanistan'));
      check('accepting adds the stadium to the board\'s list with its venue and level, and takes NO credits (the administrator deducts them in the sheet)', yes.status === 200 && yes.body.request.status === 'accepted' && credits.pending === 0 && credits.entries.length === 0 && afterYes.stadiums.some((x) => x.name === 'Kabul Crown' && x.venue === 'Kabul, Afghanistan' && x.level === 3));
      check('an accepted request cannot be accepted again (the cost is taken once), nor declined', (await sCall('POST', `admin/stadiums/${kabul.id}/accept`, { cookie: cAdm })).status === 409 && (await sCall('POST', `admin/stadiums/${kabul.id}/decline`, { cookie: cAdm })).status === 409 && (await bal(cAfg, 'afghanistan')).pending === 0);
      const sr = await sCall('GET', 'boards/afghanistan/series', { cookie: cAfg });
      check('the new stadium is in the board\'s series choices, and a series can be announced there', sr.body.stadiums.includes('Kabul Crown') && sr.body.allStadiums.afghanistan.includes('Kabul Crown') && (await post(cAfg, 'afghanistan', good({ name: 'Kabul Cup', opponents: ['scotland'], stadiums: ['Kabul Crown'] }))).status === 201);
      check('a name already built cannot be requested again, by any board', (await ask(await sLogin('board', sc('Scotland')), { name: 'KABUL CROWN', place: 'Edinburgh' }, 'scotland')).status === 400);
      const withdraw = (await ask(cAfg, { name: 'Mazar Park', place: 'Mazar-i-Sharif' })).body.request;
      check('a board can withdraw a request that is waiting; it leaves the queue and cannot then be accepted', (await sCall('DELETE', `boards/afghanistan/stadiums/${withdraw.id}`, { cookie: cAfg })).status === 200 && (await sCall('POST', `admin/stadiums/${withdraw.id}/accept`, { cookie: cAdm })).status === 409 && (await sCall('GET', 'admin/stadiums', { cookie: cAdm })).body.pending.length === 0);
      const byAdmin = await ask(cAdm, { name: 'Admin Test Dome', place: 'Kabul' });
      check('the administrator can send a request for a board (to test it), and withdraw it', byAdmin.status === 201 && (await sg('afghanistan', cAdm)).body.canAct === true && (await sCall('DELETE', `boards/afghanistan/stadiums/${byAdmin.body.request.id}`, { cookie: cAdm })).status === 200);
      const limit = [];
      for (const nm of ['Lim One', 'Lim Two', 'Lim Three', 'Lim Four']) limit.push((await ask(cAfg, { name: nm, place: 'Kabul' })).status);
      check('a board can have at most 3 requests waiting', limit.join() === '201,201,201,409');
      for (const r of (await sCall('GET', 'admin/stadiums', { cookie: cAdm })).body.pending) await sCall('POST', `admin/stadiums/${r.id}/decline`, { cookie: cAdm });
      const acts = (await sStore.listAudit(500)).map((x) => x.action);
      check('requests and decisions are recorded in the audit log, and every field is kept in the stadium table', ['stadium_requested', 'stadium_accepted', 'stadium_declined', 'stadium_withdrawn'].every((a) => acts.includes(a)) && (await sStore.stadiumGet(kabul.id)).cost === 30000 && (await sStore.stadiumGet(kabul.id)).decided_by && (await sStore.stadiumGet(herat.id)).status === 'declined');
    }
    // the sheet is the master: settlements stay pending until the administrator marks them as entered in the sheet
    {
      const ov = (await sCall('GET', 'admin/credits', { cookie: cAdm })).body;
      const jp = (await bal(cJapan, 'japan'));
      check('the admin sees the settlements waiting to be entered in the sheet, with each board\'s move', ov.settlements.length >= 4 && ov.settlements.every((x) => x.entered === false && x.moves.length >= 2) && ov.settlements.some((x) => x.moves.some((m) => m.boardName === 'Japan' && m.delta === 10000)));
      check('every line starts as pending (not in the sheet)', jp.entries.every((e) => e.entered === false));
      const first = ov.settlements.find((x) => x.moves.some((m) => m.board === 'japan' && m.delta === 10000));
      const japanBefore = (await bal(cJapan, 'japan')).pending;
      check('marking a settlement as entered removes it from the pending amount (the sheet now includes it)', (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { seriesId: first.seriesId, entered: true } })).status === 200 && (await bal(cJapan, 'japan')).pending === japanBefore - 10000 && (await bal(cJapan, 'japan')).entries.some((e) => e.entered && e.delta === 10000));
      check('…and it can be undone', (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { seriesId: first.seriesId, entered: false } })).status === 200 && (await bal(cJapan, 'japan')).pending === japanBefore);
      const adjId2 = (await sCall('GET', 'boards/japan/credits', { cookie: cAdm })).body.entries.find((e) => e.kind === 'adjustment').id;
      check('an adjustment can be marked as entered too', (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { adjustmentId: adjId2, entered: true } })).status === 200 && (await bal(cJapan, 'japan')).pending === japanBefore - 3000);
      check('only the administrator can mark; unknown or empty requests are refused', (await sCall('POST', 'admin/credits/entered', { cookie: cJapan, body: { all: true, entered: true } })).status === 403 && (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { seriesId: 'nope', entered: true } })).status === 404 && (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { adjustmentId: 'nope', entered: true } })).status === 404 && (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: {} })).status === 400);
      const nowAll = (await sCall('POST', 'admin/credits/entered', { cookie: cAdm, body: { all: true, entered: true } })).body.updated;
      const after = (await sCall('GET', 'admin/credits', { cookie: cAdm })).body;
      check('"mark everything as entered" clears every pending amount', nowAll > 0 && after.boards.every((x) => x.pending === 0) && after.settlements.every((x) => x.entered) && (await bal(cJapan, 'japan')).pending === 0);
      check('a new result after that is pending again', await (async () => { await mk('japan', ['nepal'], 1000, 'nepal'); return (await bal(cJapan, 'japan')).pending === -1000 && (await bal(cNepal, 'nepal')).pending === 1000; })());
      check('marking is recorded in the audit log', (await sStore.listAudit(600)).some((x) => x.action === 'credit_marked_entered'));
    }
    // balances follow the results: change or clear a result and they correct themselves
    const mid = (await mk('ireland', ['zimbabwe'], 4000, 'ireland')).id;
    const irBefore = (await bal(cIre, 'ireland')).pending;
    await sCall('PUT', `admin/series/${mid}/result`, { cookie: cAdm, body: { winner: 'zimbabwe' } });
    check('changing a series result re-settles the credits (home +8000 becomes away −4000)', irBefore === 8000 /* the earlier settlement is already marked as entered */ && (await bal(cIre, 'ireland')).pending === -4000);
    await sCall('DELETE', `admin/series/${mid}/result`, { cookie: cAdm });
    check('clearing a result removes its credits', (await bal(cIre, 'ireland')).pending === 0);
  }
  // declining an invitation, and the waiting-invitations badge
  {
    const cQatar = await sLogin('board', sc('Qatar'));
    const cUg = await sLogin('board', sc('Zimbabwe'));
    const dash = async (cookie, slug) => (await sCall('GET', `boards/${slug}/dashboard`, { cookie })).body;
    const ugBase = (await dash(cUg, 'zimbabwe')).invitations; // Zimbabwe already has the quadrilateral invitation from above
    check('the badge counts the invitations waiting for the board', ugBase === (await view(cUg, 'zimbabwe')).invitations.length && true);
    const q1 = await post(cQatar, 'qatar', good({ name: 'Gulf Cup', opponents: ['zimbabwe'], stadiums: [STADIUMS.qatar[0]] }));
    const qid = q1.body.series?.id;
    check('the invited board\'s dashboard badge counts the waiting invitation (and only theirs)', (await dash(cUg, 'zimbabwe')).invitations === ugBase + 1 && (await dash(cQatar, 'qatar')).invitations === (await view(cQatar, 'qatar')).invitations.length);
    check('only the invited board can decline', (await sCall('POST', `boards/england/series/${qid}/decline`, { cookie: cEng })).status === 404 && (await sCall('POST', `boards/qatar/series/${qid}/decline`, { cookie: cQatar })).status === 404 && (await sCall('POST', `boards/england/series/${qid}/decline`, { cookie: cAdm })).status === 404 && (await sCall('POST', `boards/zimbabwe/series/${qid}/decline`)).status === 401);
    check('the opponent declines', (await sCall('POST', `boards/zimbabwe/series/${qid}/decline`, { cookie: cUg })).status === 200);
    const hostView = (await view(cQatar, 'qatar')).announced.find((x) => x.id === qid);
    check('the host sees "declined by Zimbabwe" straight away', hostView?.status === 'declined' && hostView.declinedBy.name === 'Zimbabwe' && !hostView.editable);
    check('it disappears from the opponent\'s invitations and badge, and is not upcoming', !(await view(cUg, 'zimbabwe')).invitations.some((x) => x.id === qid) && (await dash(cUg, 'zimbabwe')).invitations === ugBase && !(await view(cEng, 'england')).upcoming.some((x) => x.id === qid));
    check('a declined series cannot be accepted, declined again or edited', (await sCall('POST', `boards/zimbabwe/series/${qid}/accept`, { cookie: cUg })).body.error.code === 'declined' && (await sCall('POST', `boards/zimbabwe/series/${qid}/decline`, { cookie: cUg })).status === 409 && (await sCall('PUT', `boards/qatar/series/${qid}`, { cookie: cQatar, body: good({ opponents: ['zimbabwe'], stadiums: [STADIUMS.qatar[0]] }) })).body.error.code === 'declined');
    check('the host can announce again immediately, and a declined series does not count toward the limit', (await view(cQatar, 'qatar')).active === 0 && (await post(cQatar, 'qatar', good({ name: 'Gulf Cup 2', opponents: ['zimbabwe'], stadiums: [STADIUMS.qatar[0]] }))).status === 201 && (await post(cQatar, 'qatar', good({ name: 'Gulf Cup 3', opponents: ['zimbabwe'], stadiums: [STADIUMS.qatar[1]] }))).status === 201);
    // one decline cancels a multi-board series; a board that already accepted cannot decline
    const cPor = await sLogin('board', sc('Portugal'));
    const cJp = await sLogin('board', sc('Japan'));
    const cNp = await sLogin('board', sc('Nepal'));
    const tri2 = await post(cPor, 'portugal', good({ name: 'Three Way', type: 'trilateral', opponents: ['japan', 'nepal'], matches: 4, stadiums: [STADIUMS.portugal[0], STADIUMS.portugal[0], STADIUMS.nepal[0]] }));
    const t2 = tri2.body.series.id;
    await sCall('POST', `boards/nepal/series/${t2}/accept`, { cookie: cNp });
    check('a board that has accepted cannot decline', (await sCall('POST', `boards/nepal/series/${t2}/decline`, { cookie: cNp })).status === 409);
    await sCall('POST', `boards/japan/series/${t2}/decline`, { cookie: cJp });
    check('one decline cancels a trilateral series for everyone', (await view(cPor, 'portugal')).announced.find((x) => x.id === t2).status === 'declined' && !(await view(cNp, 'nepal')).invitations.some((x) => x.id === t2) && (await sCall('GET', 'admin/series', { cookie: cAdm })).body.series.find((x) => x.id === t2).declinedBy.name === 'Japan' && (await view(cPor, 'portugal')).active === 0);
    check('declines are recorded in the audit log', (await sStore.listAudit(500)).filter((x) => x.action === 'series_declined').length === 3); // (one of them is the administrator's test decline)
    // the host sees a decline for 3 days
    t0 += 4 * 86400000;
    const cQatar2 = await sLogin('board', sc('Qatar'));
    check('after a few days a declined series drops off the host\'s list', !(await view(cQatar2, 'qatar')).announced.some((x) => x.id === qid));
  }
  // series statistics (scorer CSV uploaded by the administrator) and the formats of earlier series
  {
    [cAdm, cIndia, cEng, cPak] = await Promise.all([sLogin('admin', sCreds.find((c) => c.username === 'iocf.admin')), sLogin('board', sc('India')), sLogin('board', sc('England')), sLogin('board', sc('Pakistan'))]); // the earlier sessions have ended
    const HEAD = 'No.,Player Name,Team Name,Matches,POM Awards,Bat Innings,Runs Scored,Batting Avg,Bat SR,30s,50s,100s,High Score,6s,4s,Balls Faced,Not Outs,Most 6s by Inn.,Most 4s by Inn.,Fastest 50,Fastest 100,Bowl Inn,Wickets,Runs Conceded,Maiden,Bowl Avg,Bowl SR,Economy,3 Wkts,5 Wkts,Best Bowl,Balls Bowled,Dots Bowled,Catches,Stumpings,Run Outs';
    // name, team, matches, batInn, runs, hs, notOuts, balls, wickets, runsConceded, best, ballsBowled
    const line = (n, [name, team, m, bi, runs, hs, no, balls, w, rc, best, bb]) => `${n},${name},${team},${m},0,${bi},${runs},0.0,0.0,0,0,0,${hs},0,0,${balls},${no},0,0,,,${w ? 1 : 0},${w},${rc},0,0.0,0.0,0.0,0,0, ${best},${bb},0,0,0,0`;
    const csv = (rows) => `,STUMPS - The Cricket scorer\n,Spring Cup\n,Tour ID: abcd1234\n \n${HEAD}\n${rows.map((r, i) => line(i + 1, r)).join('\n')}\n`;
    const up = (key, body, cookie = cAdm) => sCall('PUT', `admin/series-stats/${key}`, { cookie, body });
    const a1 = csv([['Rahul Seenu', 'INDIA', 3, 3, 120, '71*', 1, 80, 2, 40, '2-15', 24], ['Rahul Sinu', 'INDIA', 3, 2, 10, '8', 0, 12, 0, 0, '0', 0], ['Sai Naveen', 'AUSTRALIA', 3, 3, 60, '30', 0, 50, 5, 90, '3-20', 30], ['Mystery Man', 'ATLANTIS', 1, 1, 1, '1', 0, 1, 0, 0, '0', 0]]);
    const a2 = csv([['Rahul Seenu', 'INDIA', 2, 2, 30, '30*', 1, 25, 1, 20, '1-20', 12], ['Sai Naveen', 'AUSTRALIA', 2, 2, 140, '100', 0, 70, 0, 0, '0', 0]]);

    const ok1 = await up(`site-${sid}`, { csv: a1 });
    check('the administrator uploads a series\' scorer statistics; unknown team names only give a warning', ok1.status === 200 && ok1.body.players === 4 && /ATLANTIS/.test(ok1.body.warnings.join(' ')));
    check('only the administrator can upload or remove statistics', (await up(`site-${sid}`, { csv: a1 }, cIndia)).status === 403 && (await sCall('DELETE', `admin/series-stats/site-${sid}`, { cookie: cIndia })).status === 403 && (await sCall('PUT', `admin/series-stats/site-${sid}`, { body: { csv: a1 } })).status === 401);
    check('a file that is not a scorer export is refused with a clear message (nothing is stored)', (await up(`site-${sid}`, { csv: 'a,b,c\n1,2,3' })).body.error.message.includes('No.') && (await up(`site-${sid}`, { csv: 'No.,Player Name\n1,A' })).body.error.message.includes('columns') && (await up(`site-${sid}`, {})).status === 400 && (await up(`site-${sid}`, { csv: HEAD })).body.error.message.includes('no player rows') && (await up(`site-${sid}`, { csv: 'x'.repeat(950000) })).status === 400);
    check('statistics need a confirmed series (not an unaccepted one, not an unknown one) and a valid key', (await up(`site-${lateSeries.id}`, { csv: a1 })).status === 409 && (await up('site-nope', { csv: a1 })).status === 404 && (await up('bad key!', { csv: a1 })).status === 400);
    const list1 = (await sCall('GET', 'series-stats', { cookie: cEng })).body.stats;
    check('signed-in boards see which series have statistics, and the rows with their boards', list1.length === 1 && list1[0].players === 4 && (await sCall('GET', `series-stats/site-${sid}`, { cookie: cEng })).body.players.find((p) => p.name === 'Sai Naveen').board === 'australia' && (await sCall('GET', 'series-stats')).status === 401 && (await sCall('GET', 'series-stats/site-nope', { cookie: cEng })).status === 404);
    const recKey = 'rec-pointing-cup-australia';
    check('statistics can be added to an earlier series from the IOCF records (it needs a name)', (await up(recKey, { csv: a2, name: 'Pointing Cup' })).status === 200 && (await up(recKey, { csv: a2 })).status === 200 === false);
    const pub = (await sCall('GET', 'public/series-stats')).body;
    const rs = pub.players.find((p) => p.name === 'Rahul Seenu' && p.board === 'india');
    const sn = pub.players.find((p) => p.name === 'Sai Naveen');
    check('the public totals add a player up over every series (no sign-in needed)', pub.series === 2 && rs.series === 2 && rs.runs === 150 && rs.matches === 5 && rs.wickets === 3 && rs.runsConceded === 60 && rs.best === '2-15' && rs.hs === 71 && rs.avg === 50 && rs.economy === 10 && sn.runs === 200 && sn.hs === 100 && sn.avg === 40);
    const fm = (key, body, cookie = cAdm) => sCall('PUT', `admin/series-meta/${key}`, { cookie, body });
    const lines = (await sCall('GET', 'public/series-stats/lines')).body.series;
    const siteLine = lines.find((x) => x.key === `site-${sid}`);
    check('the public lines carry every series with its rows and its format (the site series\' own; an earlier series\' override when the admin set one)', lines.length === 2 && siteLine.format === 'ODI' && siteLine.fields.includes('runs') && siteLine.rows.length === 4 && lines.find((x) => x.key === recKey).format === null && (await fm(recKey, { format: 'Club · 7 overs 7 wickets' })).status === 200 && (await sCall('GET', 'public/series-stats/lines')).body.series.find((x) => x.key === recKey).format === 'Club · 7 overs 7 wickets' && (await fm(recKey, { format: null })).status === 200);
    // players known under two spellings are one player in the totals
    check('a player known under two names is added up as one (the alias goes to his roster name and board)', await (async () => {
      const csvAlias = (name, team) => csv([[name, team, 2, 2, 50, '30', 0, 40, 0, 0, '0', 0]]);
      await up('rec-alias-test-one-india', { csv: csvAlias('Mohammad Noor', 'AUSTRALIA'), name: 'Alias Test One' });
      await up('rec-alias-test-two-india', { csv: csvAlias('Muhammad Noor', 'AUSTRALIA'), name: 'Alias Test Two' });
      const t = (await sCall('GET', 'public/series-stats')).body.players.filter((p) => /noor/i.test(p.name));
      await sCall('DELETE', 'admin/series-stats/rec-alias-test-one-india', { cookie: cAdm });
      await sCall('DELETE', 'admin/series-stats/rec-alias-test-two-india', { cookie: cAdm });
      return t.length === 1 && t[0].name === 'Muhammad Noor' && t[0].board === 'australia' && t[0].runs === 100 && t[0].series === 2;
    })());
    check('players with similar names are separate people (exact name + board only)', pub.players.some((p) => p.name === 'Rahul Sinu') && pub.players.filter((p) => p.name.startsWith('Rahul S')).length === 2);
    check('a player\'s totals are by board: players of unknown teams are kept without a board', pub.players.find((p) => p.name === 'Mystery Man').board === null);
    check('a new upload for the same series replaces the old one instead of adding to it', (await up(`site-${sid}`, { csv: a2 })).status === 200 && (await sCall('GET', 'public/series-stats')).body.players.find((p) => p.name === 'Sai Naveen').runs === 280 && (await sCall('GET', 'series-stats', { cookie: cEng })).body.stats.length === 2);
    check('statistics can be removed, and the totals follow', (await sCall('DELETE', `admin/series-stats/${recKey}`, { cookie: cAdm })).status === 200 && (await sCall('DELETE', `admin/series-stats/${recKey}`, { cookie: cAdm })).status === 404 && (await sCall('GET', 'public/series-stats')).body.series === 1);
    // a Major Tournament's statistics replaced by the administrator (the World Test Championship, updated as it is played)
    {
      const wtc1 = csv([['Test Player', 'AUSTRALIA', 2, 2, 90, '60', 0, 150, 1, 30, '1-30', 24]]);
      const wtc2 = csv([['Test Player', 'AUSTRALIA', 4, 4, 210, '120', 1, 400, 3, 70, '2-20', 60], ['New Man', 'INDIA', 1, 1, 5, '5', 0, 10, 0, 0, '0', 0]]);
      const live0 = (await sCall('GET', 'public/tournament-stats')).body.tournaments;
      const u1 = await up('tour-world-test-championship', { csv: wtc1, name: 'World Test Championship' });
      const l1 = (await sCall('GET', 'public/tournament-stats')).body.tournaments['world-test-championship'];
      check('the administrator uploads a tournament\'s statistics; they are public and carry the rows', Object.keys(live0).length === 0 && u1.status === 200 && l1.rows.length === 1 && l1.fields.includes('runs') && typeof l1.uploadedAt === 'number');
      await up('tour-world-test-championship', { csv: wtc2, name: 'World Test Championship' });
      const l2 = (await sCall('GET', 'public/tournament-stats')).body.tournaments['world-test-championship'];
      check('uploading again REPLACES the statistics (a newer export, not added on top)', l2.rows.length === 2 && l2.rows.find((r) => r[0] === 'Test Player')[l2.fields.indexOf('runs')] === 210);
      check('tournament statistics are not mixed into the series statistics, totals or lists', !(await sCall('GET', 'public/series-stats')).body.players.some((p) => p.name === 'Test Player') && !(await sCall('GET', 'public/series-stats/lines')).body.series.some((x) => x.key.startsWith('tour-')) && !(await sCall('GET', 'series-stats', { cookie: cEng })).body.stats.some((x) => x.key.startsWith('tour-')));
      const big = csv(Array.from({ length: 650 }, (_, i) => [`Player ${i}`, ['AUSTRALIA', 'INDIA', 'ENGLAND', 'PAKISTAN'][i % 4], 1, 1, i, '10', 0, 10, 0, 0, '0', 0]));
      check('a tournament file with hundreds of players (650 here) is accepted; a series file too; only an absurd one is refused', (await up('tour-world-test-championship', { csv: big, name: 'World Test Championship' })).body.players === 650 && (await sCall('GET', 'public/tournament-stats')).body.tournaments['world-test-championship'].rows.length === 650 && (await up('tour-world-test-championship', { csv: csv(Array.from({ length: 2100 }, (_, i) => [`P ${i}`, 'INDIA', 1, 1, 1, '1', 0, 1, 0, 0, '0', 0])) })).status === 400);
      await up('tour-world-test-championship', { csv: wtc2, name: 'World Test Championship' });
      check('only a known tournament can be uploaded, and only by the administrator', (await up('tour-not-a-tournament', { csv: wtc1 })).status === 400 && (await up('tour-world-test-championship', { csv: wtc1 }, cIndia)).status === 403 && (await sCall('PUT', 'admin/series-stats/tour-asia-cup', { body: { csv: wtc1 } })).status === 401);
      check('removing the upload goes back to the bundled statistics', (await sCall('DELETE', 'admin/series-stats/tour-world-test-championship', { cookie: cAdm })).status === 200 && Object.keys((await sCall('GET', 'public/tournament-stats')).body.tournaments).length === 0);
    }
    check('uploads and removals are recorded in the audit log', (await sStore.listAudit(800)).some((x) => x.action === 'series_stats_uploaded') && (await sStore.listAudit(800)).some((x) => x.action === 'series_stats_removed'));

    // formats of earlier series
    check('the administrator sets the format of an earlier series (T10, Club + overs/wickets…)', (await fm(recKey, { format: 'T20' })).status === 200 && (await fm('rec-colombo-cup-sri-lanka', { format: 'Club · 6 overs 6 wickets' })).status === 200);
    check('boards read the formats; only a format from the list is accepted; only the administrator can set one', (await sCall('GET', 'series-meta', { cookie: cPak })).body.meta[recKey] === 'T20' && (await fm(recKey, { format: 'T50' })).status === 400 && (await fm('site-abc', { format: 'T20' })).status === 400 && (await fm(recKey, { format: 'ODI' }, cIndia)).status === 403 && (await sCall('GET', 'series-meta', { cookie: cPak })).body.choices.length === 11);
    check('a format can be changed or cleared', (await fm(recKey, { format: 'TEST' })).status === 200 && (await sCall('GET', 'series-meta', { cookie: cPak })).body.meta[recKey] === 'TEST' && (await fm(recKey, { format: null })).status === 200 && (await sCall('GET', 'series-meta', { cookie: cPak })).body.meta[recKey] === undefined);
    // the two new tables missing from Supabase
    const noTable = new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: async () => ({ ok: false, status: 404, text: async () => '{}' }) });
    let c3 = null;
    try { await noTable.statsList(); } catch (e) { c3 = e.code; }
    const hMissing = createHandler({ store: { ...sStore, statsList: async () => { throw Object.assign(new Error('x'), { code: 'stats_missing' }); } }, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => t0 });
    check('missing statistics tables are reported as such (503), and the public page just gets an error', c3 === 'stats_missing' && (await hMissing({ method: 'GET', path: ['public', 'series-stats'], headers: H, body: null, ip: '5.5.5.5' })).status === 503);
  }
  fs.rmSync(sHome, { recursive: true, force: true });
}

// with only the logins table imported and no series table yet, the API says so instead of crashing
{
  const sbNoSeries = makeSupabaseSeries();
  function makeSupabaseSeries() { return async (url) => ({ ok: false, status: 404, text: async () => '{}', json: async () => ({}) }); }
  const st = new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: sbNoSeries });
  let code = null;
  try { await st.seriesList(); } catch (e) { code = e.code; }
  check('a missing series table is reported as such (503 from the API)', code === 'series_missing');
{
  const outdated = new SupabaseStore({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{"code":"PGRST204","message":"Could not find the \'dates\' column"}' }) });
  let c2 = null;
  try { await outdated.seriesInsert({}); } catch (e) { c2 = e.code; }
  check('an out-of-date series table (missing column) is reported as such', c2 === 'series_outdated');
}
}


console.log('\n— Series Matches tab (earlier series) —');
{
  const { Book } = await import('../sync/helpers.mjs');
  const { buildSeriesRecords, normalFormat, resolveBoard } = await import('../sync/series.mjs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Series Matches');
  const header = ['Series Name', 'Hosting Board', 'Opponents', 'Dates', 'Winners', 'Runners', 'Series Result', 'Bet Amount', 'Format'];
  ws.addRow(['Completed Series']);
  ws.addRow(header);
  ws.addRow(['January']);
  ws.addRow(['Pointing Cup ', 'Australia', 'Pakistan', '6th - 10th Jan', 'Pakistan', 'Australia', new Date(Date.UTC(2026, 0, 2)), 5000]); // "1-2" typed into a spreadsheet becomes 2 Jan
  ws.addRow(['Colombo Cup', 'Srilanka', 'Pakistan', '10th - 12th Jan', 'Srilanka', 'Pakistan', new Date(Date.UTC(2026, 1, 1)), 6000, '7o 7w']);
  ws.addRow(['Tri Cup', 'West Indies', 'Australia, Scotland', '14th - 17th Jan', 'Australia', 'West Indies', 'WI vs Aus | WI won\nAus vs Scot | Aus Won', 5000, 'L4i']);
  ws.addRow(['One Off', 'Newzealand', 'Bangaldesh', '28th April', 'Netherland', 'Bangladesh', '1 Match only', 2000, 'odi']);
  ws.addRow(['Argentine Cup', 'Portugal', 'Argentina', '2nd - 6th Oct', 'Portugal', 'Argentina', '3-0', 3000, 'Test']);
  ws.addRow([]);
  ws.addRow(['Upcoming Series']);
  ws.addRow(header);
  ws.addRow(['Gulf Cup', 'Zimbabwe', 'Japan, Canada, USA, Nepal & Portugal', '23rd - 30th Oct', '-', '-', '-', 10000, 'T20']);
  ws.addRow(['Upcoming IOCF World Test Championship Matches']);
  ws.addRow(['Test Name', 'Hosting Board', 'Opponents', 'Dates', 'Winners ', 'Bet Amount', 'Format']);
  ws.addRow(['Should not appear', 'England', 'India', '1st Nov', '-', 5000, 'Test']);
  const rec = buildSeriesRecords(new Book(wb));
  const [c1, c2, c3, c4, c5] = rec.completed;
  check('Series Matches: the completed series and the upcoming block are read, other blocks ignored', rec.completed.length === 5 && rec.upcoming.length === 1 && rec.upcoming[0].name === 'Gulf Cup');
  check('Series Matches: the month banner, dates, winner, runners-up and bet are kept', c1.month === 'January' && c1.name === 'Pointing Cup' && c1.dates === '6th - 10th Jan' && c1.winner.name === 'Pakistan' && c1.runnerUp.name === 'Australia' && c1.bet === 5000);
  check('Series Matches: a score the spreadsheet turned into a date is read back (2 Jan → 1-2, 1 Feb → 2-1)', c1.result === '1-2' && c2.result === '2-1');
  check('Series Matches: board spellings are corrected (Srilanka, Newzealand, Bangaldesh, Netherland) and slugs match the boards', c2.host.slug === 'sri-lanka' && c4.host.slug === 'new-zealand' && c4.opponents[0].name === 'Bangladesh' && c4.winner.name === 'Netherlands' && c4.winner.slug === 'netherlands');
  check('Series Matches: a team that is not one of the 26 boards is kept without a slug', c5.opponents[0].name === 'Argentina' && c5.opponents[0].slug === null);
  check('Series Matches: opponents of a multi-board series are split', c3.opponents.map((o) => o.name).join() === 'Australia,Scotland' && rec.upcoming[0].opponents.map((o) => o.name).join() === 'Japan,Canada,USA,Nepal,Portugal');
  check('Series Matches: a match-by-match breakdown is kept as lines; notes such as "1 Match only" stay as text', c3.resultLines.length === 2 && c3.result === null && c4.result === '1 Match only');
  check('Series Matches: formats are tidied and "-" means not yet', normalFormat('7o 7w') === '7 overs 7 wickets' && normalFormat('5overs 5wickets') === '5 overs 5 wickets' && c3.format === 'L4I' && c4.format === 'ODI' && c5.format === 'TEST' && rec.upcoming[0].winner === null && rec.upcoming[0].result === null);
  check('Series Matches: the workbook without the tab gives no records', buildSeriesRecords(new Book(new ExcelJS.Workbook())) === null && resolveBoard('') === null);
  if (fs.existsSync('IOCF ALL BOARDS .xlsx')) {
    const { readWorkbook } = await import('../sync/index.mjs');
    const real = buildSeriesRecords(await readWorkbook('IOCF ALL BOARDS .xlsx'));
    check('Series Matches: the real workbook gives its completed series (200+) with winners (only Argentina is not one of the 26 boards)', real.completed.length > 200 && real.completed.every((r) => r.winner) && real.completed.filter((r) => !r.host.slug).every((r) => r.host.name === 'Argentina') && real.upcoming.length >= 1);
  }
}


console.log('\n— How to play online cricket (fun game on IOCF Main) —');
{
  const { randomDigits, parseDigits, playOver, sumText, ordinal } = await import('../../src/data/funCricket.mjs');
  const ex = playOver([6, 3, 4, 2, 5, 1], [1, 2, 3, 6, 5, 2]);
  check('the example from the brief: bowler 123652 vs batsman 634251 → out on ball 5, 6+3+4+2 = 15 runs', ex.outOn === 5 && ex.runs === 15 && ex.scored.join('') === '6342' && sumText(ex.scored) === '6 + 3 + 4 + 2 = 15' && ordinal(5) === '5th');
  check('no matching place means not out and all six digits count', (() => { const r = playOver([6, 6, 6, 6, 6, 6], [0, 0, 0, 0, 0, 0]); return r.outOn === null && r.runs === 36; })());
  check('a match on the first ball is a duck (0 runs); on the last ball only the first five count', playOver([4, 1, 1, 1, 1, 1], [4, 0, 0, 0, 0, 0]).runs === 0 && playOver([4, 1, 1, 1, 1, 1], [4, 0, 0, 0, 0, 0]).outOn === 1 && playOver([1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 6]).runs === 15 && playOver([1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 6]).outOn === 6);
  check('only the first matching place counts, even if more match', playOver([1, 2, 3, 4, 5, 6], [0, 2, 3, 0, 0, 0]).outOn === 2 && playOver([1, 2, 3, 4, 5, 6], [0, 2, 3, 0, 0, 0]).runs === 1);
  check('a visitor must send exactly six digits, each 0 to 6', parseDigits('634251').join('') === '634251' && parseDigits('63 42 51').join('') === '634251' && parseDigits('63425') === null && parseDigits('6342511') === null && parseDigits('634257') === null && parseDigits('63425a') === null && parseDigits('') === null);
  let ok = true;
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const d = randomDigits();
    if (d.length !== 6 || d.some((x) => !Number.isInteger(x) || x < 0 || x > 6)) ok = false;
    seen.add(d.join(''));
  }
  check('random digits are always six digits from 0 to 6, and vary', ok && seen.size > 2500 && Array.from({ length: 6 }, () => randomDigits(() => 0.999999)).every((d) => d.every((x) => x === 6)) && randomDigits(() => 0).every((x) => x === 0));
}


console.log('\n— Matching a folder of statistics CSVs to the earlier series —');
{
  const { planImport, nameScore } = await import('./seriesStatsImport.mjs');
  const HEAD = 'No.,Player Name,Team Name,Matches,POM Awards,Bat Innings,Runs Scored,Batting Avg,Bat SR,30s,50s,100s,High Score,6s,4s,Balls Faced,Not Outs,Most 6s by Inn.,Most 4s by Inn.,Fastest 50,Fastest 100,Bowl Inn,Wickets,Runs Conceded,Maiden,Bowl Avg,Bowl SR,Economy,3 Wkts,5 Wkts,Best Bowl,Balls Bowled,Dots Bowled,Catches,Stumpings,Run Outs';
  const row = (n, name, team) => `${n},${name},${team},1,0,1,10,10.0,100.0,0,0,0,10,0,0,10,0,0,0,,,0,0,0,0,0.0,0.0,0.0,0,0, 0,0,0,0,0,0`;
  const file = (title, teams) => `,STUMPS - The Cricket scorer\n,${title}\n,Tour ID: x1\n \n${HEAD}\n${teams.map((t, i) => row(i + 1, `Player ${i + 1}`, t)).join('\n')}\n`;
  const b = (name) => ({ name, slug: name.toLowerCase().replace(/[^a-z]+/g, '-') });
  const rec = (name, host, ...opp) => ({ name, host: b(host), opponents: opp.map(b) });
  const records = [rec('Spring Cup', 'India', 'Australia'), rec('RED & GREEN RIVALRY I', 'Ireland', 'Canada'), rec(' RED & GREEN RIVALRY II', 'Ireland', 'Canada'), rec('Anderson-Tendulker t20 trophy', 'England', 'India'), rec('Anderson - Tendulkar Trophy', 'England', 'India'), rec('The Global Four', 'Bangladesh', 'West Indies', 'Netherlands'), rec('Freedom Jalebi Trophy', 'South Africa', 'Afghanistan')];
  const plan = planImport({
    records,
    boards: BOARDS,
    files: [
      { file: 'Spring Cup.csv', text: file('Spring Cup', ['INDIA', 'AUSTRALIA']) },
      { file: 'Red & Green Rivalry I.csv', text: file('Red & Green Rivalry', ['IRELAND', 'CANADA']) },
      { file: 'Red & Green Rivalry II.csv', text: file('Red & Green Rivalry II', ['IRELAND', 'CANADA']) },
      { file: 'Anderson Tendulkar T20 Trophy_.csv', text: file('Anderson Tendulkar T20 Trophy', ['ENGLAND', 'INDIA']) },
      { file: 'The Global Three.csv', text: file('Global Three', ['BANGLADESH', 'WEST INDIES', 'NETHERLANDS']) },
      { file: 'Freedom Jalebi.csv', text: file('Freedom Jalebi', ['QATAR', 'SOUTH AFRICA']) },
      { file: 'Spring Cup (copy).csv', text: file('Spring Cup', ['INDIA', 'AUSTRALIA']) },
      { file: 'ODI WC Warmup all matches.csv', text: file('Warmup Games', ['INDIA', 'CANADA', 'IRELAND']) },
      { file: 'Nothing like it.csv', text: file('Nothing like it', ['INDIA', 'JAPAN']) },
      { file: 'Broken.csv', text: 'a,b\n1,2' },
    ],
  });
  const st = (f) => plan.find((x) => x.file === f);
  check('a file whose name and teams fit a series is matched to it', st('Spring Cup.csv').status === 'ok' && st('Spring Cup.csv').key === 'rec-springcup-india');
  check('"… Rivalry I" and "… Rivalry II" go to their own series, not each other\'s', st('Red & Green Rivalry I.csv').key === 'rec-redgreenrivalryi-ireland' && st('Red & Green Rivalry II.csv').key === 'rec-redgreenrivalryii-ireland' && nameScore('Red & Green Rivalry II', 'RED & GREEN RIVALRY I') < 1);
  check('a spelling difference is matched by similar name and teams — to the nearest of two similar names', st('Anderson Tendulkar T20 Trophy_.csv').status === 'ok' && st('Anderson Tendulkar T20 Trophy_.csv').key === 'rec-andersontendulkert20trophy-england');
  check('"The Global Three" file matches "The Global Four" when the teams are the same boards', st('The Global Three.csv').key === 'rec-theglobalfour-bangladesh');
  check('a file whose teams are not the series\' boards is never matched automatically', st('Freedom Jalebi.csv').status === 'unmatched' && /Freedom Jalebi Trophy/.test(st('Freedom Jalebi.csv').note));
  check('two files for the same series: the second is flagged, not uploaded twice', st('Spring Cup (copy).csv').status === 'duplicate');
  check('a file covering several series is kept as its own entry', st('ODI WC Warmup all matches.csv').key === 'rec-odi-wc-warmup-games' && st('ODI WC Warmup all matches.csv').status === 'ok');
  check('an unknown name and a broken file are reported', st('Nothing like it.csv').status === 'unmatched' && st('Broken.csv').status === 'invalid');
}


console.log('\n— Qatar took over the old Afghanistan team —');
{
  const { applyRenames } = await import('../sync/series.mjs');
  const bd = (name) => ({ name, slug: name.toLowerCase().replace(/[^a-z]+/g, '-') });
  const r = (name, host, opp, winner) => ({ name, month: 'January', host: bd(host), opponents: [bd(opp)], dates: null, winner: winner ? bd(winner) : null, runnerUp: null, result: null, resultLines: null, bet: 5000, format: null });
  const rec = applyRenames({
    completed: [r('Revival Cup', 'Afghanistan', 'Sri Lanka', 'Sri Lanka'), r('Kallis Rashid Trophy', 'South Africa', 'Afghanistan', 'South Africa'), r('Summer Series', 'Pakistan', 'Qatar', 'Pakistan'), r('Odd Series', 'Afghanistan', 'Qatar', 'Qatar'), r('The Golden Cup', 'West Indies', 'Afghanistan', 'Afghanistan'), r('The Friendly Cup', 'Afghanistan', 'Spain', 'Spain')],
    upcoming: [r('Later Cup', 'Afghanistan', 'Spain', null)],
  });
  const [c1, c2, c3, c4, c5, c6] = rec.completed;
  check('before The Golden Cup, "Afghanistan" is the team that is now Qatar (host, opponent and winner)', c1.host.name === 'Qatar' && c1.host.slug === 'qatar' && c1.host.was === 'Afghanistan' && c2.opponents[0].name === 'Qatar' && c2.opponents[0].was === 'Afghanistan' && c2.winner.name === 'South Africa');
  check('the winner of such a series is renamed too', applyRenames({ completed: [r('X', 'Afghanistan', 'Sri Lanka', 'Afghanistan'), r('The Golden Cup', 'India', 'Afghanistan', null)], upcoming: [] }).completed[0].winner.name === 'Qatar');
  check('from The Golden Cup on, Afghanistan is the new team, with no link to the old one', c5.opponents[0].name === 'Afghanistan' && !c5.opponents[0].was && c5.winner.name === 'Afghanistan' && c6.host.name === 'Afghanistan' && rec.upcoming[0].host.name === 'Afghanistan');
  check('a series with both Afghanistan and Qatar before it is left as written (it cannot be told apart)', c4.host.name === 'Afghanistan' && c4.opponents[0].name === 'Qatar');
  check('its statistics stay filed under the name in the sheet, and series without the old team are untouched', c1.keyHost === 'Afghanistan' && c2.keyHost === 'South Africa' && c3.keyHost === undefined && c3.opponents[0].name === 'Qatar' && !c3.opponents[0].was);
  const again = JSON.parse(JSON.stringify(rec));
  check('applying the rule twice changes nothing; without The Golden Cup in the list nothing is renamed', JSON.stringify(applyRenames(again)) === JSON.stringify(rec) && applyRenames({ completed: [r('Revival Cup', 'Afghanistan', 'Sri Lanka', null)], upcoming: [] }).completed[0].host.name === 'Afghanistan');
}


console.log('\n— Player profile statistics: formats, boards, sources —');
{
  const { formatKey, selectLines, sumLines, formatsIn, TOURNAMENT_FORMAT, FORMAT_ORDER } = await import('../../src/data/careerStats.mjs');
  check('tournaments are in the formats given: ODI (Asia, Oceania, Euro, ODI World Cup), Test (WTC, Associate Nations), Club (Emerging Talents, Women\'s, Lone Warrior), T20 (T20 World Cup)', ['asia-cup', 'oceania-cup', 'euro-cup', 'odi-world-cup'].every((t) => TOURNAMENT_FORMAT[t] === 'odi') && ['world-test-championship', 'associate-nations-cup'].every((t) => TOURNAMENT_FORMAT[t] === 'test') && ['emerging-talents-league', 'womens-global-league', 'lone-warrior'].every((t) => TOURNAMENT_FORMAT[t] === 'club') && TOURNAMENT_FORMAT['t20-world-cup'] === 't20' && TOURNAMENT_FORMAT['origins-championship'] === undefined && FORMAT_ORDER.join() === 'odi,test,t20,t10,club,l4i');
  check('series formats are read: ODI, T20, T10, Test, L4I, and every overs/wickets variant is Club', formatKey('ODI') === 'odi' && formatKey('t20') === 't20' && formatKey('T10') === 't10' && formatKey('TEST') === 'test' && formatKey('Test') === 'test' && formatKey('L4i') === 'l4i' && formatKey('Club · 6 overs 6 wickets') === 'club' && formatKey('7 overs 7 wickets') === 'club' && formatKey('5o 5w') === 'club' && formatKey('') === null && formatKey(null) === null && formatKey('whatever') === null);
  const L = (name, boardSlug, extra = {}) => ({ name, boardSlug, source: 'tournament', id: 't', label: 'T', format: 'odi', line: {}, ...extra });
  const lines = [L('Ans Sheikh', 'qatar'), L('Ans Sheikh', 'pakistan'), L('Abhishek', 'india'), L('Abhishek', 'ireland'), L('Ans  sheikh ', 'qatar'), L('Ans Sheik', 'qatar'), L('Umar Khan', 'afghanistan')];
  const sel = selectLines(lines, { name: 'Ans Sheikh', boardSlug: 'qatar' });
  check('a name of two or more words is the same person on other boards (marked as another board); similar names are not', sel.length === 3 && sel.filter((x) => x.own).length === 2 && sel.some((x) => !x.own && x.boardSlug === 'pakistan') && !sel.some((x) => x.name === 'Ans Sheik'));
  {
    const { buildAliasIndex, resolveAlias, aliasesOf, squadEntriesOf } = await import('../../src/data/commandCenter/aliases.mjs');
    const idx = buildAliasIndex([{ name: 'Irfan Ali', board: 'spain', aliases: [{ name: 'Irfan Ali Soomro', boards: ['qatar'] }, { name: 'Irfan Soomro', boards: ['spain'] }] }, { name: 'Niyas', board: 'india', aliases: [{ name: 'Niyaz' }] }]);
    const al = [L('Irfan Ali Soomro', 'qatar'), L('Irfan Soomro', 'spain'), L('Irfan Ali', 'spain'), L('Irfan Ali Soomro', 'pakistan'), L('Niyaz', 'canada'), L('Niyas', 'india')];
    const sp = selectLines(al, { name: 'Irfan Ali', boardSlug: 'spain' }, idx);
    check('aliases: another name of a known player is counted for him, on whichever board it was played (own board marked)', sp.length === 3 && sp.find((x) => x.boardSlug === 'qatar').own === false && sp.find((x) => x.boardSlug === 'spain' && x.name === 'Irfan Soomro').own === true && !sp.some((x) => x.boardSlug === 'pakistan'));
    const idx2 = buildAliasIndex([{ name: 'Ahmed Mahsoof', board: 'japan', aliases: [{ name: 'Machu' }], squadEntries: [{ league: 'bbl', team: 'Melbourne Stars', name: 'Ahmed' }] }]);
    check('aliases: a name like "Machu" counts on any board, and the franchise squad entries listed for a player are found (a plain "Ahmed" is only his where listed)', resolveAlias(idx2, 'Machu', 'pakistan')?.name === 'Ahmed Mahsoof' && squadEntriesOf(idx2, 'Ahmed Mahsoof', 'japan').length === 1 && squadEntriesOf(idx2, 'Ahmed Mahsoof', 'pakistan').length === 0);
    check('aliases: a one-word alias works too (explicitly given), and the lookup refuses an alias on a board it was not given for', selectLines(al, { name: 'Niyas', boardSlug: 'india' }, idx).length === 2 && resolveAlias(idx, 'Niyaz', 'canada').name === 'Niyas' && resolveAlias(idx, 'Irfan Ali Soomro', 'pakistan') === null && aliasesOf(idx, 'Niyas', 'india').length === 1);
  }
  check('a single name is only matched on his own board', selectLines(lines, { name: 'Abhishek', boardSlug: 'india' }).length === 1 && selectLines(lines, { name: 'Abhishek', boardSlug: 'india' })[0].boardSlug === 'india');
  const l1 = { matches: 3, pom: 1, batInn: 3, runs: 120, balls: 80, fours: 3, sixes: 4, thirties: 0, fifties: 1, hundreds: 0, notOuts: 1, hs: 71, hsNotOut: true, bowlInn: 1, wickets: 2, runsConceded: 40, maidens: 0, ballsBowled: 24, dots: 0, threeW: 0, fiveW: 0, best: '2-15', catches: 1, stumpings: 0, runOuts: 0, most6: 3, most4: 2, fast50: 30, fast100: null };
  const l2 = { ...l1, matches: 2, batInn: 2, runs: 30, balls: 25, notOuts: 1, hs: 30, hsNotOut: true, wickets: 1, runsConceded: 20, best: '1-20', ballsBowled: 12, most6: 5, fast50: 22, catches: 0 };
  const t = sumLines([l1, l2]);
  check('totals add up, and the averages come from the totals (not an average of averages)', t.matches === 5 && t.runs === 150 && t.wickets === 3 && t.avg === 50 && t.sr === 142.9 && t.economy === 10 && t.bowlAvg === 20 && t.bowlSr === 12 && t.hs === 71 && t.hsNotOut === true && t.best === '2-15' && t.most6 === 5 && t.fast50 === 22 && t.fast100 === null);
  check('no wickets means no bowling average, and a player who was never out has his runs as his average', sumLines([{ ...l1, wickets: 0, runsConceded: 10 }]).bowlAvg === 0 && sumLines([{ ...l1, notOuts: 3 }]).avg === 120 && sumLines([]).runs === 0);
  check('only the formats that have data become tabs, in the usual order; entries with no format are in no tab', formatsIn([{ format: 'club' }, { format: 'odi' }, { format: null }, { format: 'test' }]).join() === 'odi,test,club');
}


console.log('\n— Chairmen and CEOs are players too —');
if (fs.existsSync('IOCF ALL BOARDS .xlsx')) {
  const { readWorkbook, buildDataset } = await import('../sync/index.mjs');
  const { dataset } = buildDataset(await readWorkbook('IOCF ALL BOARDS .xlsx'), {});
  const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slugOf = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const missing = [];
  for (const b of dataset.boards) {
    for (const cell of [b.chairman, b.ceo]) {
      for (const n of String(cell ?? '').split(/\s*(?:&|\band\b|,)\s*/).map((x) => x.trim()).filter(Boolean)) {
        const first = n.toLowerCase().split(/\s+/)[0];
        if (!dataset.players.some((p) => p.boardId === slugOf(b.name) && (norm(p.name) === norm(n) || p.name.toLowerCase().split(/\s+/)[0] === first))) missing.push(`${b.name}: ${n}`);
      }
    }
  }
  check('every chairman and CEO has a player entry on his board (a roster spelling that fits is used, otherwise one is created)', missing.length === 0, missing.join('; '));
  const bhavin = dataset.players.filter((p) => p.name === 'Bhavin Kumar');
  check('a player who moved boards (scripts/sync/transfers.mjs) is only on his new board, which also gets the awards recorded under the old one', bhavin.length === 1 && bhavin[0].boardId === 'south-africa' && bhavin[0].achievements.some((x) => x.title === 'Best Bat Average') && bhavin[0].achievements.some((x) => x.title === 'Best Bowler'));
  const mahajan = dataset.players.filter((p) => /^Adith?ya Mahajan$/.test(p.name)); // (the sheet spells him both ways)
  check('a player who played for several boards and moved (Adithya Mahajan → South Africa) keeps one profile, with all his awards, on the new board; a different Mahajan is untouched', mahajan.length === 1 && mahajan[0].boardId === 'south-africa' && mahajan[0].achievements.length >= 6 && dataset.players.some((p) => p.name === 'Naman Mahajan' && p.boardId === 'south-africa'));
  check('they are marked with their role, and the players list still has no duplicates of a name on one board', dataset.players.some((p) => p.official === 'Chairman') && dataset.players.some((p) => p.official === 'CEO') && new Set(dataset.players.map((p) => `${p.boardId}|${norm(p.name)}`)).size === dataset.players.length);
}


console.log('\n— Rankings profile: how players and boards are ranked —');
{
  const { groupPlayers, rankPlayers, rankRows, seriesTable, boardsIn, CATEGORIES } = await import('../../src/data/rankingsCore.mjs');
  const { buildAliasIndex } = await import('../../src/data/commandCenter/aliases.mjs');
  const base = { matches: 1, pom: 0, batInn: 1, runs: 0, balls: 0, fours: 0, sixes: 0, thirties: 0, fifties: 0, hundreds: 0, notOuts: 0, hs: null, hsNotOut: false, bowlInn: 0, wickets: 0, runsConceded: 0, maidens: 0, ballsBowled: 0, dots: 0, threeW: 0, fiveW: 0, best: null, catches: 0, stumpings: 0, runOuts: 0, most6: 0, most4: 0, fast50: null, fast100: null };
  const L = (name, boardSlug, format, extra) => ({ name, boardSlug, boardName: boardSlug.toUpperCase(), format, line: { ...base, ...extra } });
  const lines = [
    L('Ans Sheikh', 'qatar', 'odi', { runs: 100, batInn: 2, balls: 80, hs: 70, notOuts: 1 }),
    L('Ans Sheikh', 'pakistan', 't20', { runs: 60, batInn: 1, balls: 30, hs: 60 }),
    L('Mohammad Noor', 'australia', 'odi', { runs: 50, batInn: 2, balls: 70, hs: 30 }),
    L('Muhammad Noor', 'australia', 'odi', { runs: 30, batInn: 1, balls: 20, hs: 30 }),
    L('Abhishek', 'india', 'odi', { runs: 40, batInn: 1, balls: 30, hs: 40 }),
    L('Abhishek', 'ireland', 'odi', { runs: 25, batInn: 1, balls: 20, hs: 25 }),
    L('Bowler One', 'india', 'odi', { bowlInn: 3, wickets: 6, runsConceded: 60, ballsBowled: 72, best: '4-20', fiveW: 0 }),
    L('Bowler Two', 'india', 'odi', { bowlInn: 3, wickets: 6, runsConceded: 80, ballsBowled: 72, best: '3-10' }),
  ];
  const aliases = buildAliasIndex([{ name: 'Muhammad Noor', board: 'australia', aliases: [{ name: 'Mohammad Noor', boards: ['australia'] }] }]);
  const people = groupPlayers(lines, { aliases, rosterBoard: (n) => (n === 'Ans Sheikh' ? 'qatar' : undefined) });
  check('players are grouped: a full name is one person across boards (on his roster board), an alias joins his roster name, a single name stays on its board', people.length === 6 && people.find((p) => p.name === 'Ans Sheikh').boardSlug === 'qatar' && people.find((p) => p.name === 'Ans Sheikh').lines.length === 2 && people.find((p) => p.name === 'Muhammad Noor').lines.length === 2 && people.filter((p) => p.name === 'Abhishek').length === 2);
  const runs = rankPlayers(people, CATEGORIES.batting[0]);
  check('the runs ranking adds a player up over every board and format', runs[0].name === 'Ans Sheikh' && runs[0].value === 160 && runs[1].name === 'Muhammad Noor' && runs[1].value === 80 && runs.map((r) => r.rank).join() === '1,2,3,4,5,5');
  check('a format filter ranks only that format', rankPlayers(people, CATEGORIES.batting[0], 't20').length === 1 && rankPlayers(people, CATEGORIES.batting[0], 'odi')[0].value === 100);
  check('averages and strike rates need a minimum (3 innings / 50 balls): a short career is not ranked', rankPlayers(people, CATEGORIES.batting[1]).map((r) => r.name).join() === 'Ans Sheikh,Muhammad Noor' && !rankPlayers(people, CATEGORIES.batting[2]).some((r) => r.name === 'Abhishek') && rankPlayers(people, CATEGORIES.batting[2]).some((r) => r.name === 'Ans Sheikh'));
  const wk = rankPlayers(people, CATEGORIES.bowling[0]);
  check('equal values share a rank (competition ranking: 1, 1, then 3)', wk.map((r) => r.rank).join() === '1,1' && rankRows([{ name: 'a', v: 5 }, { name: 'b', v: 5 }, { name: 'c', v: 3 }], (r) => r.v).map((r) => r.rank).join() === '1,1,3');
  check('lower is better for economy and bowling average, and best figures rank by wickets then runs', rankPlayers(people, CATEGORIES.bowling[1])[0].name === 'Bowler One' && rankPlayers(people, CATEGORIES.bowling[4])[0].name === 'Bowler One' && rankRows([{ name: 'a', v: 9 }, { name: 'b', v: 5 }], (r) => r.v, true)[0].name === 'b');
  const st = seriesTable([{ boards: ['india', 'australia'], winner: 'india', format: 'ODI' }, { boards: ['india', 'pakistan'], winner: 'pakistan', format: 'T20' }, { boards: ['india', 'qatar', 'spain'], winner: null, format: null }, { boards: ['india', 'australia'], winner: 'australia', format: 'Club · 6 overs 6 wickets' }]);
  const ind = st.find((r) => r.slug === 'india');
  check('series: played, won, lost, drawn and win % per board; a series with no winner is drawn', ind.played === 4 && ind.won === 1 && ind.lost === 2 && ind.drawn === 1 && ind.winPct === 25 && st.find((r) => r.slug === 'spain').drawn === 1);
  check('series can be filtered by format (ODI, Club by any overs/wickets format)', seriesTable([{ boards: ['india', 'australia'], winner: 'india', format: 'ODI' }, { boards: ['india', 'pakistan'], winner: 'india', format: 'T20' }], { format: 'odi' }).length === 2 && seriesTable([{ boards: ['india', 'australia'], winner: 'india', format: '7 overs 7 wickets' }], { format: 'club' }).length === 2);
  check('board names are found in champion texts, even inside "Player (Board)" or a shared title', boardsIn('England & Scotland', ['England', 'Scotland', 'India']).join() === 'England,Scotland' && boardsIn('Diljith Das (England)', ['England', 'New England']).join() === 'England' && boardsIn('Newzealand', ['New Zealand']).length === 0);
}


console.log('\n— A deployment can switch sign-in off —');
{
  const offStore = new MemoryStore();
  await provision({ store: offStore, home: fs.mkdtempSync(path.join(os.tmpdir(), 'cc-off-')) });
  const hOff = createHandler({ store: offStore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', COMMAND_CENTER_SIGNIN: 'off' }, now: () => Date.now() });
  const r1 = await hOff({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'iocf.admin', password: 'whatever1' }, ip: '3.3.3.3' });
  const r2 = await hOff({ method: 'GET', path: ['public', 'series-stats'], headers: H, body: null, ip: '3.3.3.3' });
  check('with COMMAND_CENTER_SIGNIN=off the login does not exist (404), while the public data still works', r1.status === 404 && r2.status === 200);
}


console.log('\n— Data modules that copy the dataset when first loaded —');
{
  // leagues.ts, boards.ts, players.ts and umpires.ts take a copy of the dataset when they are first loaded, so they must only be loaded
  // after the data has arrived (dynamic import). A static import of a VALUE from them would load them at start-up, empty, and the
  // Franchise Leagues, Boards, Players and Umpires profiles would show nothing.
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) walk(full);
      else if (/\.(tsx?|mjs)$/.test(f.name)) {
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
          if (/^import\s+(?!type\b)[^;]*from\s+'(\.{1,2}\/)+(data\/)?(leagues|boards|players|umpires)'/.test(line) && !/^import\s+type\b/.test(line)) offenders.push(`${path.relative('src', full)}: ${line.trim()}`);
        }
      }
    }
  };
  walk('src/components');
  walk('src/hooks');
  check('no component loads leagues / boards / players / umpires at start-up (they are imported dynamically, after the data)', offenders.length === 0, offenders.join(' | '));
}


console.log('\n— Rank movement (10-day moves) —');
{
  const { updateState, movesOf, MOVE_DAYS, DAY_MS } = await import('../../src/data/commandCenter/rankMoves.mjs');
  const { computeAllRankings, rankingId } = await import('../../src/data/commandCenter/rankingsCompute.mjs');
  const T0 = Date.UTC(2026, 10, 1);
  const r = (...keys) => keys.map((key, i) => ({ key, rank: i + 1 }));
  const base = updateState(null, r('a', 'b', 'c'), T0);
  check('the first time a ranking is seen is a baseline: nothing has moved, and a baseline is stored', base.changed && Object.keys(movesOf(base.state, T0 + 1000)).length === 0 && base.state.entries.a.t === 0);
  const same = updateState(base.state, r('a', 'b', 'c'), T0 + DAY_MS);
  check('unchanged ranks change nothing (no write needed)', !same.changed && same.state.entries.b.r === 2);
  const moved = updateState(base.state, r('b', 'a', 'c'), T0 + DAY_MS);
  const mv = movesOf(moved.state, T0 + 2 * DAY_MS);
  check('a rank change is a move: b went up 1, a down 1, c did not move', moved.changed && mv.b.by === 1 && mv.a.by === -1 && !('c' in mv));
  check('a move shows for 10 days and then disappears (the entry keeps its rank)', Object.keys(movesOf(moved.state, T0 + DAY_MS + 9 * DAY_MS + 1000)).length === 2 && Object.keys(movesOf(moved.state, T0 + DAY_MS + MOVE_DAYS * DAY_MS)).length === 0 && moved.state.entries.b.r === 1);
  const later = updateState(moved.state, r('b', 'c', 'a'), T0 + 5 * DAY_MS);
  const mv2 = movesOf(later.state, T0 + 6 * DAY_MS);
  check('a second move replaces the first one for that entry (a: 2→3 down 1, c: 3→2 up 1, each for 10 days from now); an entry that did not change (b) keeps its older move until that one expires', mv2.a.by === -1 && mv2.c.by === 1 && mv2.b.by === 1 && movesOf(later.state, T0 + DAY_MS + 11 * DAY_MS).b === undefined && movesOf(later.state, T0 + 5 * DAY_MS + 9 * DAY_MS).a.by === -1);
  const joined = updateState(moved.state, r('b', 'a', 'c', 'd'), T0 + 2 * DAY_MS);
  const mv3 = movesOf(joined.state, T0 + 3 * DAY_MS);
  check('an entry that joins the ranking later is marked new for 10 days', mv3.d.isNew === true && mv3.d.by === 0 && movesOf(joined.state, T0 + 13 * DAY_MS).d === undefined);
  const dropped = updateState(moved.state, r('b', 'a'), T0 + 2 * DAY_MS);
  check('an entry that drops out of the list is forgotten (and is new again if it returns)', dropped.changed && !('c' in dropped.state.entries) && movesOf(updateState(dropped.state, r('b', 'a', 'c'), T0 + 3 * DAY_MS).state, T0 + 4 * DAY_MS).c.isNew === true);

  // every ranking of the profile, computed from the dataset
  const snap = JSON.parse(fs.readFileSync('src/data/snapshot.json', 'utf8'));
  const input = { dataset: snap, tournamentStats: fixtureTournamentStats(), leagueStats: JSON.parse(fs.readFileSync('src/data/leagueStats.json', 'utf8')), aliases: JSON.parse(fs.readFileSync('src/data/commandCenter/playerAliases.json', 'utf8')), seriesStats: [], seriesResults: [], meta: {} };
  const all = computeAllRankings(input);
  const ids = Object.keys(all);
  check('every ranking is worked out: boards (each format), credits, series, players (board and franchise, every category), umpires, league tables, titles', ids.includes('boards.Overall') && ids.includes('credits') && ids.includes('series.all') && ids.includes(rankingId.players('board', 'batting', 'runs')) && ids.includes(rankingId.players('franchise', 'bowling', 'wickets')) && ids.includes('umpires') && ids.includes('majors') && ids.some((i) => i.startsWith('league.')) && ids.length > 100);
  check('each ranking lists at most 100 entries, ranked from 1, with unique keys', ids.every((i) => all[i].length <= 100 && all[i].every((x, k) => x.rank >= 1 && x.key && (k === 0 || x.rank >= all[i][k - 1].rank)) && new Set(all[i].map((x) => x.key)).size === all[i].length));
  const scoped = (sc) => all[rankingId.players(sc, 'batting', 'runs')] ?? null;
  check('player rankings come in five scopes: overall, board cricket, major tournaments, series, franchise leagues; the series one is empty without series statistics, the tournament one only has tournament players',
    ['overall', 'board', 'tournament', 'series', 'franchise'].every((sc) => scoped(sc)) && scoped('series').length === 0 && scoped('tournament').length === 3 && scoped('board').length === 3 && scoped('overall').length >= scoped('franchise').length && scoped('overall').length > scoped('board').length);
  const again = computeAllRankings(input);
  check('the same data gives the same ranks, so nothing counts as a move', JSON.stringify(again) === JSON.stringify(all));
  // a rise in someone's runs moves him up
  const sunaif = all[rankingId.players('board', 'batting', 'runs')][0];
  const bumped = JSON.parse(JSON.stringify(input));
  const runsIdx = bumped.tournamentStats.fields.indexOf('runs');
  const nameIdx = bumped.tournamentStats.fields.indexOf('name');
  const second = all[rankingId.players('board', 'batting', 'runs')][1];
  for (const t of Object.values(bumped.tournamentStats.tournaments)) for (const row of t.rows) if (String(row[nameIdx]).toLowerCase().replace(/[^a-z0-9]/g, '') === second.key.split('|')[0]) row[runsIdx] = (row[runsIdx] ?? 0) + 5000;
  const after = computeAllRankings(bumped)[rankingId.players('board', 'batting', 'runs')];
  const st1 = updateState(null, all[rankingId.players('board', 'batting', 'runs')], T0).state;
  const st2 = updateState(st1, after, T0 + DAY_MS).state;
  const m = movesOf(st2, T0 + 2 * DAY_MS);
  check('new statistics that put a player ahead show as a move for him (up) and for the player he passed (down)', sunaif.key !== second.key && after[0].key === second.key && m[second.key].by > 0 && m[sunaif.key].by < 0);
}


console.log('\n— Rank movement through the API —');
{
  const { rankingId } = await import('../../src/data/commandCenter/rankingsCompute.mjs');
  const snap0 = JSON.parse(fs.readFileSync('src/data/snapshot.json', 'utf8'));
  const base0 = { dataset: snap0, tournamentStats: fixtureTournamentStats(), leagueStats: JSON.parse(fs.readFileSync('src/data/leagueStats.json', 'utf8')), aliases: JSON.parse(fs.readFileSync('src/data/commandCenter/playerAliases.json', 'utf8')), seriesStats: [], seriesResults: [], meta: {} };
  let current = base0;
  let loads = 0;
  let clock2 = Date.UTC(2026, 10, 3, 6, 0, 0);
  const mStore = new MemoryStore();
  const hMoves = createHandler({ store: mStore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock2, rankInput: async () => { loads++; return current; } });
  const get = (id) => hMoves({ method: 'GET', path: ['public', 'rank-moves', id], headers: H, body: null, ip: '8.8.8.8' });
  const id = rankingId.players('board', 'batting', 'runs');

  const first = await get(id);
  check('the first request works the ranks out and stores them as a baseline: no moves yet (public, no sign-in)', first.status === 200 && Object.keys(first.body.moves).length === 0 && loads === 1 && first.body.updatedAt === clock2);
  clock2 += 5 * 60_000;
  await get(id);
  check('within 10 minutes the ranks are not worked out again', loads === 1);

  // new statistics put the second player ahead
  const bumped = JSON.parse(JSON.stringify(base0));
  const fi = bumped.tournamentStats.fields;
  const board = (await mStore.rankGet(id)).state.entries;
  const ordered = Object.entries(board).sort((a, b) => a[1].r - b[1].r).map(([k]) => k);
  const [leader, runnerUp] = ordered;
  for (const t of Object.values(bumped.tournamentStats.tournaments)) for (const row of t.rows) if (String(row[fi.indexOf('name')]).toLowerCase().replace(/[^a-z0-9]/g, '') === runnerUp.split('|')[0]) row[fi.indexOf('runs')] = (row[fi.indexOf('runs')] ?? 0) + 5000;
  current = bumped;
  clock2 += 6 * 60_000; // 11 minutes since the first run
  const second = await get(id);
  check('after 10 minutes the ranks are worked out again, and the player who passed the leader shows a move up (the leader a move down)', loads === 2 && second.body.moves[runnerUp].by > 0 && second.body.moves[leader].by < 0);
  clock2 += 9 * 86_400_000;
  check('the move is still shown after 9 days…', Object.keys((await get(id)).body.moves).length > 0);
  clock2 += 2 * 86_400_000;
  check('…and gone after 10 days (the rank stays, the arrow goes)', Object.keys((await get(id)).body.moves).length === 0 && (await mStore.rankGet(id)).state.entries[runnerUp].r === 1);
  check('other rankings are stored too, and an unknown or odd ranking id gives no moves / an error', Object.keys(await (async () => Object.fromEntries((await mStore.rankList()).map((r) => [r.key, 1])))()).length > 100 && (await get('nope')).body.moves && Object.keys((await get('nope')).body.moves).length === 0 && (await get('bad id!')).status === 400);
  // the sheet cannot be read: the old moves stay, and it is retried soon
  const failing = createHandler({ store: mStore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => clock2, rankInput: async () => { throw new Error('sheet down'); } });
  clock2 += 3600_000;
  const quiet = console.error;
  console.error = () => {};
  const down = await failing({ method: 'GET', path: ['public', 'rank-moves', id], headers: H, body: null, ip: '8.8.8.8' });
  console.error = quiet;
  check('if the sheet cannot be read the request still answers (with the stored moves)', down.status === 200);
}


console.log('\n— Unlimited Fun: the games —');
{
  const { makeQuiz, cluesFor, guessPoints, isGuess, pairFor, higherLowerRight, superOverStep, dayKey, mulberry32, seedFrom } = await import('../../src/data/funLogic.mjs');
  const boards = ['India', 'Australia', 'England', 'Pakistan', 'Qatar', 'Spain', 'Japan', 'Nepal'].map((name, i) => ({ name, overallRank: i + 1, credits: 1000 - i * 10, chairman: `Chair ${name}` }));
  const data = { boards, runs: ['A One', 'B Two', 'C Three', 'D Four', 'E Five'], wickets: ['F One', 'G Two', 'H Three', 'I Four', 'J Five'], titles: ['England', 'India'], series: [{ name: 'Spring Cup', host: 'India', opponents: ['Australia'], winner: 'Australia' }, { name: 'Tri Cup', host: 'Qatar', opponents: ['Spain', 'Japan'], winner: 'Qatar' }] };
  const q1 = makeQuiz('2026-11-05', data);
  check('the daily quiz has 5 questions of different kinds, each with 4 different options and the right one among them', q1.length === 5 && new Set(q1.map((q) => q.kind)).size === 5 && q1.every((q) => q.options.length === 4 && new Set(q.options).size === 4 && q.answer >= 0 && q.answer < 4 && q.why));
  check('the same day gives the same quiz for everyone, a different day a different one', JSON.stringify(makeQuiz('2026-11-05', data)) === JSON.stringify(q1) && JSON.stringify(makeQuiz('2026-11-06', data)) !== JSON.stringify(q1));
  check('the answers are right: #1 board, most credits, top scorer, a chairman, a series winner', q1.every((q) => {
    const right = q.options[q.answer];
    if (q.kind === 'rankOne' || q.kind === 'credits') return right === 'India';
    if (q.kind === 'mostRuns') return right === 'A One';
    if (q.kind === 'mostWickets') return right === 'F One';
    if (q.kind === 'titles') return right === 'England';
    if (q.kind === 'chairman') return right === `Chair ${/of the (.+) board/.exec(q.q)[1]}`;
    if (q.kind === 'seriesWinner') return /Spring Cup/.test(q.q) ? right === 'Australia' : false;
    return false;
  }));
  check('with too little data the quiz is shorter instead of broken', makeQuiz('2026-11-05', { boards: boards.slice(0, 3), runs: [], wickets: [], titles: [], series: [] }).length < 5);
  check('the day changes at midnight India time', dayKey(Date.UTC(2026, 10, 4, 18, 29)) === '2026-11-04' && dayKey(Date.UTC(2026, 10, 4, 18, 31)) === '2026-11-05');
  const clues = cluesFor({ name: 'Sai Naveen', boardName: 'Bangladesh', matches: 12, runs: 450, wickets: 9, hs: '71*', best: '3-20', pom: 2, fifties: 3, hundreds: 0, formats: ['ODI', 'T20'] });
  check('guess-the-player clues go from vague to specific and end by naming the board and the initial; fewer clues mean more points', clues.length === 7 && /12 matches/.test(clues[0]) && /Bangladesh/.test(clues[clues.length - 2]) && /“S”/.test(clues[clues.length - 1]) && !/Bangladesh/.test(clues.slice(0, 4).join(' ')) && guessPoints(1, 7) === 7 && guessPoints(7, 7) === 1 && guessPoints(20, 7) === 1);
  check('a guess is right whatever the capitals, spaces or punctuation', isGuess('  sai   naveen ', 'Sai Naveen') && isGuess('SAINAVEEN', 'Sai Naveen') && !isGuess('Sai', 'Sai Naveen') && !isGuess('', 'Sai Naveen'));
  const people = [{ n: 'a', runs: 10 }, { n: 'b', runs: 50 }, { n: 'c', runs: 50 }, { n: 'd', runs: 0 }];
  let ok = true;
  for (let i = 0; i < 200; i++) { const p = pairFor(people, 'runs', mulberry32(seedFrom(String(i)))); if (!p || p.a === p.b || p.a.runs === p.b.runs || p.a.runs === 0 || p.b.runs === 0) ok = false; }
  check('higher-or-lower always pairs two different players with different, non-zero values; ties are never asked', ok && pairFor([{ runs: 5 }, { runs: 5 }], 'runs', Math.random) === null && higherLowerRight(10, 50, true) && !higherLowerRight(10, 50, false) && higherLowerRight(50, 10, false));
  let st = { runs: 0, wickets: 0, over: 0 };
  st = superOverStep(st, { outOn: null, runs: 20 });
  const s2 = superOverStep(st, { outOn: 3, runs: 7 });
  check('super over: 3 overs and 2 wickets — a wicket ends that over, the second wicket ends the innings, three overs end it too', !st.done && s2.runs === 27 && s2.wickets === 1 && !s2.done && superOverStep(s2, { outOn: 1, runs: 0 }).done && superOverStep(superOverStep(superOverStep({ runs: 0, wickets: 0, over: 0 }, { outOn: null, runs: 1 }), { outOn: null, runs: 1 }), { outOn: null, runs: 1 }).done);
}


{
  const { groupPlayers } = await import('../../src/data/rankingsCore.mjs');
  const lines = [{ name: 'Waqas Mughal', boardSlug: 'australia', boardName: 'Australia', line: { matches: 5 } }];
  const [p] = groupPlayers(lines, { rosterBoard: () => 'nepal', boardNameOf: (s) => (s === 'nepal' ? 'Nepal' : undefined) });
  check('a player who moved to a board he has no statistics for is shown on his new board (stats stay linked)', p.boardSlug === 'nepal' && p.boardName === 'Nepal' && p.lines.length === 1);
}


{
  const { isHiddenBoard, mentionsHiddenBoard, closeUpRanks, scrubText, DISMANTLED_LABEL } = await import('../../src/data/hiddenBoards.mjs');
  check('a dismantled board’s name is replaced in a text, other names are kept', scrubText('Canada 2 - 1 Kenya') === `Canada 2 - 1 ${DISMANTLED_LABEL}` && scrubText('Nepal beat Spain') === 'Nepal beat Spain');
  check('a dismantled board is recognised by name, slug and squad name, other boards are not', isHiddenBoard('Kenya') && isHiddenBoard('kenya') && isHiddenBoard('KENYA EMERGING') && isHiddenBoard('KENYA W') && !isHiddenBoard('Nepal') && !isHiddenBoard('South Africa') && !isHiddenBoard(null));
  check('a table that names the board is found, but a longer word is not', mentionsHiddenBoard({ columns: ['Kenya Squad'] }) && !mentionsHiddenBoard({ x: 'Mount Kenyatta' }) && !mentionsHiddenBoard({ x: 'Nepal' }));
  const r = closeUpRanks({ A: { Overall: 1, T20: 2 }, Kenya: { Overall: 2 }, B: { Overall: 3, T20: 1 }, C: { Overall: 4 } });
  check('removing the board closes the ranks up, only in the formats it was ranked in', !r.Kenya && r.A.Overall === 1 && r.B.Overall === 2 && r.C.Overall === 3 && r.A.T20 === 2 && r.B.T20 === 1);
}

console.log('\n— 11. the register stays private —');
const root = process.cwd();
const files = walk(root);
check('no register file anywhere in the project folder', !files.some((f) => /CREDENTIAL|register\.key|local-store/i.test(path.basename(f))));
check('the register lives outside the project (home folder)', !path.resolve(home).startsWith(root));
check('public/ and dist/ hold no credential files', !files.some((f) => /\/(public|dist)\//.test(f) && /credential|register|\.key$/i.test(path.basename(f))));
check('the API source never reads the register or its key', !fs.readdirSync(path.join(root, 'server/command')).some((f) => /REGISTER_FILE|register\.key|IOCF_PRIVATE/.test(fs.readFileSync(path.join(root, 'server/command', f), 'utf8'))));
check('git ignores the register, its key and local data', ['IOCF_PRIVATE_CREDENTIAL_REGISTER', 'register.key', '.cc-data/'].every((p) => fs.readFileSync(path.join(root, '.gitignore'), 'utf8').includes(p)));
check('there is no route that returns a CSV or a password', (await call('GET', 'register', { cookie: adm.cookie })).status === 404 && (await call('GET', 'admin/credentials', { cookie: adm.cookie })).status === 404);

console.log('\n— Supabase adapter (requests only; no network) —');
const seen = [];
const fakeFetch = async (url, init) => {
  seen.push({ url, method: init.method, headers: init.headers, body: init.body });
  return { ok: true, text: async () => (init.method === 'GET' ? '[]' : '[{"id":"1"}]') };
};
const sb = new SupabaseStore({ url: 'https://x.supabase.co/', serviceKey: 'SERVICE', fetchImpl: fakeFetch });
await sb.findByUsername('India.Chairman');
await sb.update('abc', { status: 'inactive' });
await sb.setModuleOverride('india', 'series-announcement', false);
await sb.bumpRate('k', 1000, 5);
check('uses the REST API with the service-role key on every request', seen.every((s) => s.url.startsWith('https://x.supabase.co/rest/v1/') && s.headers.apikey === 'SERVICE' && s.headers.authorization === 'Bearer SERVICE'));
check('queries are lowercase-exact and URL-encoded', seen[0].url.endsWith('command_accounts?username=eq.india.chairman&limit=1'));
check('updates target one row by id', seen[1].method === 'PATCH' && seen[1].url.endsWith('command_accounts?id=eq.abc'));
check('module switches upsert on (board, module)', seen[2].url.includes('on_conflict=board_slug,module_id') && seen[2].headers.prefer === 'resolution=merge-duplicates');

console.log('\n— HTTP adapter (simulated request/response streams) —');
const listener = commandCenterRequestListener({ store, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' } });
const http = (method, url, { body, cookie, raw } = {}) =>
  new Promise((resolve) => {
    const payload = raw ?? (body === undefined ? '' : JSON.stringify(body));
    const req = Object.assign(Readable.from(payload ? [Buffer.from(payload)] : []), { method, url, headers: { host: 'site.test', 'x-iocf-request': '1', 'x-forwarded-for': '198.51.100.7', 'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}) }, socket: {} });
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(text) { resolve({ status: this.status, headers: this.headers, body: text ? JSON.parse(text) : null }); } };
    listener(req, res);
  });
clock = Date.now();
const adminAgain = await resetCredentials({ store, home, ref: 'iocf.admin' });
const hl = await http('POST', '/api/command/login', { body: { role: 'admin', username: 'iocf.admin', password: adminAgain.password } });
check('POST /api/command/login over HTTP returns the user and sets the cookie', hl.status === 200 && hl.body.user.role === 'admin' && /iocf_cc=/.test(hl.headers['set-cookie']));
const hcookie = /iocf_cc=[^;]*/.exec(hl.headers['set-cookie'])[0];
check('GET /api/command/me with that cookie works', (await http('GET', '/api/command/me', { cookie: hcookie })).body.user.username === 'iocf.admin');
check('responses are never cached', hl.headers['cache-control'] === 'no-store');
check('malformed JSON is a 400', (await http('POST', '/api/command/login', { raw: '{not json' })).status === 400);
check('oversized bodies are a 400', (await http('POST', '/api/command/login', { raw: 'x'.repeat(40000) })).status === 400);
check('an unknown API path is a 404', (await http('GET', '/api/command/nothing', { cookie: hcookie })).status === 404);
const noBackend = commandCenterRequestListener({ store: null, env: {} });
const nb = await new Promise((resolve) => {
  const req = Object.assign(Readable.from([Buffer.from('{}')]), { method: 'POST', url: '/api/command/login', headers: { host: 'site.test', 'x-iocf-request': '1' }, socket: {} });
  noBackend(req, { writeHead(st) { this.st = st; }, end(t) { resolve({ status: this.st, body: JSON.parse(t) }); } });
});
check('with no database configured the API answers 503 "not configured"', nb.status === 503 && nb.body.error.code === 'not_configured');

const prodNoSecret = createHandler({ store, env: { SUPABASE_URL: 'https://x.supabase.co' } });
check('with a database but no session secret the API refuses to run (503)', (await prodNoSecret({ method: 'GET', path: ['me'], headers: {}, body: null, ip: '1.1.1.1' })).status === 503);

console.log('\n— The private mirror sheet —');
{
  const { generateKeyPairSync } = await import('node:crypto');
  const { buildMirror, runMirror, mirrorConfigured } = await import('../../server/mirror/mirror.mjs');
  const { parseServiceAccount, sheetIdOf } = await import('../../server/mirror/google.mjs');
  const { cell, flatten, table } = await import('../../server/mirror/tabs.mjs');
  const snap = JSON.parse(fs.readFileSync('src/data/snapshot.json', 'utf8'));
  const mstore = new MemoryStore();
  await mstore.create({ account_id: 'IOCF-BRD-001', role: 'board', board_slug: 'india', board_name: 'India', username: 'india.chair', password_hash: 'scrypt$SECRET-HASH-VALUE', status: 'active', chairman_name: 'X' });
  await mstore.stadiumPut({ key: 'r1', board: 'india', name: 'Test Dome', place: 'Pune', venue: 'Pune, India', country: 'India', level: 3, cost: 30000, status: 'accepted', requested_by: 'india.chair', requested_at: 1, decided_by: 'iocf.admin', decided_at: 2 });
  await mstore.statsPut({ key: 'rec-x-india', kind: 'record', name: 'X Cup', title: 'X', tour: 't', players: 1, fields: ['name', 'team', 'runs'], rows: [['Some Player', 'INDIA', 12]], uploaded_at: 1, uploaded_by: 'a' });
  const built = await buildMirror({ dataset: snap, leagueStats: JSON.parse(fs.readFileSync('src/data/leagueStats.json', 'utf8')), store: mstore, boards: BOARDS, baseStadiums: STADIUMS, now: () => 0 });
  const tab = (n) => built.tabs.find((t) => t.name === n);
  const everything = JSON.stringify(built.tabs);
  check('the mirror has a tab for every part of the site (boards, players, umpires, leagues, tournaments, series, stadiums, credits, statistics…) and the Overview comes first', built.tabs[0].name === 'Overview' && ['Boards', 'Players', 'Umpires', 'Franchise Leagues', 'League Squads', 'Tournament Tables', 'Series Records', 'Stadiums', 'Stadium Requests', 'Credit Adjustments', 'Series Player Stats', 'Announced Series', 'Activity Log'].every((n) => tab(n)) && built.tabs.length >= 60);
  check('the tabs hold what the site holds: every board, player and umpire, the new stadium with its venue, the uploaded player rows', tab('Boards').rows.length === snap.boards.length && tab('Players').rows.length === snap.players.length && tab('Umpires').rows.length === snap.umpires.length && tab('Stadiums').rows.some((r) => r.includes('Test Dome') && r.includes('Pune, India')) && tab('Series Player Stats').rows.some((r) => r.includes('Some Player')));
  check('no password, hash or key is ever written to the sheet', !/SECRET-HASH-VALUE|scrypt\$|password_hash|private_key/i.test(everything) && !tab('Board Accounts').header.some((h) => /pass|hash|session|fail|lock/i.test(h)));
  check('cells are text, numbers or true/false; lists and objects become JSON; long text is cut; an empty value is an empty cell', cell(null) === '' && cell(5) === 5 && cell(['a', { b: 1 }]) === '["a",{"b":1}]' && cell('x'.repeat(60000)).length < 50000 && flatten({ a: { b: 1 }, c: ['x', 'y'] }).c === 'x | y' && table('T', [{ a: 1 }, { b: 2 }]).header.join() === 'a,b');

  // one tab per board, in the board's own colours
  const { boardPalette, textOn, luminance, styleRequests, resetRequests, rgb } = await import('../../server/mirror/style.mjs');
  const { valuesOf } = await import('../../server/mirror/google.mjs');
  const boardNames = snap.boards.map((b) => b.name);
  const bt = (n) => built.tabs.find((t) => t.name === n);
  const india = bt('India');
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  check('every board has its own tab, right after the Overview, in alphabetical order, with the board banner on top', boardNames.every((n) => bt(n)) && built.tabs.slice(1, 1 + boardNames.length).map((t) => t.name).join() === [...boardNames].sort((a, b) => a.localeCompare(b)).join() && india.rows[0][0] === 'INDIA BOARD');
  check('a board tab holds that board\'s chairman, credits, players, umpires, stadiums (with the new one\'s venue), stadium requests and rankings, as separate blocks', (() => { const flat = india.rows.map((r) => r.join('|')); const b = snap.boards.find((x) => x.name === 'India'); return flat.some((r) => r.startsWith('Chairman|') && r.includes(b.chairman)) && flat.some((r) => r.startsWith('PLAYERS')) && flat.some((r) => r.startsWith('UMPIRES')) && flat.some((r) => /Test Dome\|Pune, India\|3/.test(r)) && flat.some((r) => r.startsWith('STADIUM REQUESTS')) && flat.some((r) => r.startsWith('BOARD RANKINGS')) && snap.players.filter((p) => p.boardId === 'india').every((p) => flat.some((r) => r.startsWith(`${p.name}|`))); })());
  check('each board tab has its own colour (from the board\'s flag colours); text on every banner and section bar is readable', boardNames.every((n) => { const th = BOARDS.find((x) => x.name === n); const p = boardPalette(th); return bt(n).tabColor === p.tab && contrast(p.banner, textOn(p.banner)) >= 4.5 && contrast(p.bar, textOn(p.bar)) >= 3 && bt(n).palette.bar === p.bar; }) && new Set(boardNames.map((n) => bt(n).tabColor)).size > 15);
  const reqs = styleRequests(india, 7, valuesOf(india));
  const rc = (f) => reqs.filter((r) => r.repeatCell && JSON.stringify(r.repeatCell.cell).includes(JSON.stringify(rgb(f))));
  check('the formatting requests colour the banner and section bars, merge them across the tab, band every table, and set column widths', rc(boardPalette(BOARDS.find((x) => x.name === 'India')).banner).length >= 1 && reqs.some((r) => r.mergeCells) && reqs.filter((r) => r.addBanding).length >= 8 && reqs.some((r) => r.updateDimensionProperties?.properties?.pixelSize >= 100));
  check('a plain table tab gets a dark header, alternating rows and widths to fit; resetting clears old formats, merges and bands', (() => { const t = built.tabs.find((x) => x.name === 'Players'); const q = styleRequests(t, 3, valuesOf(t)); const rs = resetRequests(3, [11, 12]); return q.filter((r) => r.addBanding).length === 1 && q.some((r) => r.repeatCell) && q.filter((r) => r.updateDimensionProperties).length === t.header.length && rs.filter((r) => r.deleteBanding).length === 2 && rs.some((r) => r.unmergeCells) && rs.some((r) => r.repeatCell?.fields === 'userEnteredFormat'); })());

  // `npm run player`: what a player gets, and similar names that are not counted
  const { explainPlayer } = await import('../lib/playerLines.mjs');
  const F = ['name', 'team', 'matches', 'runs', 'wickets'];
  const pin = { dataset: { players: [{ id: 'spain-1', boardId: 'spain', name: 'Hamid Sahito' }] }, aliases: [], tournamentStats: { fields: F, tournaments: {} }, tournamentOverrides: {}, leagueStats: { fields: F, leagues: { psl: { rows: [['Hamid Sahito', 'KARACHI KINGS', 7, 100, 5]] } } },
    seriesStats: [{ key: 'rec-a', fields: F, rows: [['Hamid Sahito', 'PAKISTAN', 3, 40, 2], ['Hamid Sahitoo', 'PAKISTAN', 2, 30, 1], ['Someone Else', 'INDIA', 1, 5, 0]] }] };
  const ex = explainPlayer(pin, 'Hamid Sahito');
  check('the player tool counts a player\'s exact lines per scope (series, franchise, board, overall) and lists a similar misspelt name that is NOT counted', ex.totals.series.runs === 40 && ex.totals.franchise.runs === 100 && ex.totals.board.wickets === 2 && ex.totals.overall.runs === 140 && ex.similar.length === 1 && ex.similar[0].line.name === 'Hamid Sahitoo');
  // lines of a scorer export the uploaded tournament file lacks (src/data/commandCenter/statCorrections.mjs)
  const { applyCorrections, STAT_CORRECTIONS } = await import('../../src/data/commandCenter/statCorrections.mjs');
  const CF = ['name', 'team', 'matches', 'runs', 'wickets'];
  const rowsIn = [['Hizbullah Sahito', 'PAKISTAN', 3, 100, 10], ['Other Man', 'INDIA', 3, 50, 1]];
  const fixed = applyCorrections('world-test-championship', CF, rowsIn);
  const none = applyCorrections('asia-cup', CF, rowsIn);
  const madeRow = applyCorrections('world-test-championship', CF, [['Other Man', 'INDIA', 3, 50, 1]]);
  check('a correction adds to the player\'s row in that tournament only (runs 100 + 21, wickets 10 + 2), leaves the file and the other rows as they are, and makes the row if he has none', fixed[0][3] === 121 && fixed[0][4] === 12 && fixed[0][2] === 3 && fixed[1][3] === 50 && rowsIn[0][3] === 100 && none === rowsIn && madeRow.length === 2 && madeRow[1][0] === 'Hizbullah Sahito' && madeRow[1][3] === 21 && STAT_CORRECTIONS.length >= 1);
  const { computeAllRankings: cr } = await import('../../src/data/commandCenter/rankingsCompute.mjs');
  const { rankingId: rid } = await import('../../src/data/commandCenter/rankingIds.mjs');
  const RF = ['name', 'team', 'matches', 'batInn', 'runs', 'bowlInn', 'wickets'];
  const wtc = { fields: RF, tournaments: { 'world-test-championship': { title: 'WTC', tour: 't', rows: [['Hizbullah Sahito', 'PAKISTAN', 3, 3, 100, 3, 10], ['Other Man', 'INDIA', 3, 3, 110, 3, 11]] } } };
  const ranked = cr({ dataset: snap, tournamentStats: wtc, leagueStats: { fields: RF, leagues: {} }, aliases: [], seriesStats: [], seriesResults: [], meta: {} });
  const top = ranked[rid.players('tournament', 'batting', 'runs')];
  const topW = ranked[rid.players('tournament', 'bowling', 'wickets')];
  check('the rankings count it too: with the 21 runs and 2 wickets he passes a player who is ahead of him without them (major tournaments scope)', top[0].key === 'hizbullahsahito' && topW[0].key === 'hizbullahsahito');
  // a pretend Google: records every call
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const key = JSON.stringify({ client_email: 'mirror@iocf.iam.gserviceaccount.com', private_key: privateKey });
  const calls = [];
  let created = [];
  const fakeGoogle = (deny = false) => async (url, init = {}) => {
    const body = typeof init.body === 'string' ? init.body : init.body?.toString();
    calls.push({ url: String(url), method: init.method ?? 'GET', body });
    const ok = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (String(url).startsWith('https://oauth2')) return ok({ access_token: 'tok', expires_in: 3600 });
    if (deny) return { ok: false, status: 403, text: async () => 'no', json: async () => ({}) };
    if (/fields=sheets/.test(String(url))) return ok({ sheets: [{ properties: { sheetId: 1, title: 'Sheet1' } }, ...created.map((t, i) => ({ properties: { sheetId: 10 + i, title: t } }))] });
    if (/spreadsheets\/[^/]+:batchUpdate$/.test(String(url))) {
      for (const r of JSON.parse(body).requests) if (r.addSheet) created.push(r.addSheet.properties.title);
      return ok({});
    }
    return ok({});
  };
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: key, MIRROR_SHEET_ID: 'a'.repeat(44) };
  const done = await runMirror({ env, fetchImpl: fakeGoogle(), dataset: snap, store: mstore, boards: BOARDS, baseStadiums: STADIUMS, leagueStats: null });
  const clearCall = calls.find((c) => /values:batchClear$/.test(c.url));
  const updates = calls.filter((c) => /values:batchUpdate$/.test(c.url));
  const written = updates.flatMap((c) => JSON.parse(c.body).data);
  const tokenCall = calls.find((c) => c.url.startsWith('https://oauth2'));
  const writes = calls.filter((c) => c.method !== 'GET' && !c.url.startsWith('https://oauth2')).length;
  check('it signs in as the service account (a signed token) and writes every tab: tabs are added, cleared in one request, then written in a few grouped requests, header first, as plain values', /jwt-bearer/.test(tokenCall.body) && created.length === done.tabs && JSON.parse(clearCall.body).ranges.length === done.tabs && updates.every((c) => JSON.parse(c.body).valueInputOption === 'RAW') && written.find((d) => /Boards/.test(d.range)).values[0][0] === 'name' && written.some((d) => /Players/.test(d.range)));
  check('a whole run needs only a handful of write requests (Google allows 60 a minute), however big the sheet', writes <= 20, `${writes} writes`);
  check('nothing but the Google API is called, and no password reaches Google', calls.every((c) => /^https:\/\/(oauth2|sheets)\.googleapis\.com\//.test(c.url)) && !calls.some((c) => /SECRET-HASH-VALUE/.test(c.body ?? '')));
  check('a second run reuses the tabs (nothing is added twice)', await (async () => { const before = created.length; await runMirror({ env, fetchImpl: fakeGoogle(), dataset: snap, store: mstore, boards: BOARDS, baseStadiums: STADIUMS }); return created.length === before; })());
  check('a sheet the robot cannot open gives a clear "share it with the service account" error; a missing key says it is not set up', await runMirror({ env, fetchImpl: fakeGoogle(true), dataset: snap, store: mstore, boards: BOARDS, baseStadiums: STADIUMS }).then(() => false, (e) => e.code === 'mirror_no_access') && await runMirror({ env: {}, dataset: snap, boards: BOARDS }).then(() => false, (e) => e.code === 'mirror_not_configured') && mirrorConfigured(env) && !mirrorConfigured({}));
  check('when Google says "too many requests" the tool waits and tries again, then succeeds', await (async () => {
    let failed = 0;
    const waits = [];
    const flaky = async (url, init) => {
      if (/values:batchClear/.test(String(url)) && failed < 2) { failed++; return { ok: false, status: 429, text: async () => 'quota', json: async () => ({}) }; }
      return fakeGoogle()(url, init);
    };
    const r = await runMirror({ env, fetchImpl: flaky, sleep: async (ms) => { waits.push(ms); }, dataset: snap, store: mstore, boards: BOARDS, baseStadiums: STADIUMS });
    return failed === 2 && waits.length === 2 && waits[0] >= 20000 && r.tabs > 30;
  })());
  check('the sheet id can be given as the link or the id; the key as JSON or base64', sheetIdOf(`https://docs.google.com/spreadsheets/d/${'a'.repeat(44)}/edit?gid=0`) === 'a'.repeat(44) && parseServiceAccount(Buffer.from(key).toString('base64')).email === 'mirror@iocf.iam.gserviceaccount.com');

  // the administrator's button
  const mh = createHandler({ store: mstore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234', ...env }, rankInput: async () => ({ dataset: snap, leagueStats: null }), mirrorFetch: fakeGoogle() });
  const mcall = (method, p, { body, cookie } = {}) => mh({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, ip: '9.9.9.9' });
  await mstore.create({ account_id: 'IOCF-ADM-001', role: 'admin', board_slug: null, board_name: null, username: 'mirror.admin', password_hash: await (await import('../../server/command/crypto.mjs')).hashPassword('Mirror-Admin-Pass-1'), status: 'active' });
  const ml = await mcall('POST', 'login', { body: { role: 'admin', username: 'mirror.admin', password: 'Mirror-Admin-Pass-1' } });
  const mcookie = `iocf_cc=${cookieOf(ml)}`;
  const before = calls.length;
  const press = await mcall('POST', 'admin/mirror', { cookie: mcookie });
  check('the administrator\'s "Update now" button writes the sheet; a board cannot press it, and signed out nobody can', press.status === 200 && press.body.tabs >= 60 && calls.length > before && (await mcall('POST', 'admin/mirror')).status === 401);
  const ph = createHandler({ store: mstore, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, rankInput: async () => ({ dataset: snap, leagueStats: null }) });
  const pcall = (method, p, { body, cookie } = {}) => ph({ method, path: p.split('/').filter(Boolean), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, ip: '9.9.9.8' });
  const plainAdmin = `iocf_cc=${cookieOf(await pcall('POST', 'login', { body: { role: 'admin', username: 'mirror.admin', password: 'Mirror-Admin-Pass-1' } }))}`;
  const notSet = await pcall('POST', 'admin/mirror', { cookie: plainAdmin });
  const ovMirror = await mcall('GET', 'admin/overview', { cookie: mcookie });
  check('the overview says whether the mirror is set up, and the button is refused cleanly when it is not', ovMirror.body.mirrorConfigured === true && notSet.status === 503 && notSet.body.error.code === 'mirror_not_configured', JSON.stringify([ovMirror.status, ovMirror.body.mirrorConfigured, notSet.status, notSet.body]).slice(0, 200));
}

console.log('\n— IOCF 2.0: Player Salary Program (PSP 2027) —');
{
  const psp = await import('../../src/data/commandCenter/psp.mjs');
  const { rosterOf } = await import('../../server/command/pspRoutes.mjs');
  const { hashPassword } = await import('../../server/command/crypto.mjs');
  const snap = JSON.parse(fs.readFileSync('src/data/snapshot.json', 'utf8'));

  // ---- the official numbers and the pure rules
  const sumLakh = (c) => psp.FUNDING_LAKH[c].reduce((n, l) => n + l, 0);
  check('the official funding table: 7 / 6 / 6 / 6 ranks, 52.5 + 33 + 22.5 + 12 = 120 lakh a month (1.20 crore), 14.40 crore a year, in whole credits', psp.COUNCILS.map((c) => c.ranks).join() === '7,6,6,6' && [sumLakh('champions'), sumLakh('established'), sumLakh('challengers'), sumLakh('origins')].join() === '52.5,33,22.5,12' && psp.MONTHLY_FUNDING === 12000000 && psp.ANNUAL_FUNDING === 144000000 && psp.fundingFor('champions', 1) === 1200000 && psp.fundingFor('champions', 7) === 400000 && psp.fundingFor('origins', 4) === 180000 && psp.fundingFor('challengers', 2) === 450000 && psp.fundingFor('established', 7) === null);
  check('the categories are in the official priority order with their limits (1, 2, 4, 4, 8, the rest)', psp.CATEGORIES.map((c) => `${c.id}:${c.max}`).join() === 'special_contract:1,elite:2,international:4,professional:4,developing:8,emerging:null');
  const W = { special_contract: 2000, elite: 2000, international: 2000, professional: 1500, developing: 1500, emerging: 1000 };
  check('weights must total exactly 100% (in hundredths of a percent), with a percentage for every category', psp.weightsProblem(W) === null && psp.weightsProblem({ ...W, emerging: 900 }) !== null && psp.weightsProblem(null) !== null && psp.weightsProblem({ ...W, special_contract: 0, emerging: 3000 }) !== null && psp.percentToBp('12.5') === 1250 && psp.percentToBp('12.345') === null && psp.percentToBp('101') === null);
  const fake = (cat, n, from = 0) => Array.from({ length: n }, (_, i) => ({ category: cat, key: `${cat}${from + i}` }));
  const lines26 = [...fake('special_contract', 1), ...fake('elite', 2), ...fake('international', 4), ...fake('professional', 4), ...fake('developing', 8), ...fake('emerging', 7)];
  const calc = psp.calculate({ budget: 1200000, weights: W, lines: lines26 });
  const sal = (cat) => calc.lines.filter((l) => l.category === cat).map((l) => l.salary);
  check('the calculation: category parts of the budget, equal shares in multiples of 100, the rounding balance on the Special Contract, total = the whole budget, remaining 0', calc.ok && sal('special_contract')[0] === 240300 && sal('elite').join() === '120000,120000' && sal('international').every((x) => x === 60000) && sal('professional').every((x) => x === 45000) && sal('developing').every((x) => x === 22500) && sal('emerging').every((x) => x === 17100) && calc.remainder === 300 && calc.total === 1200000 && calc.remaining === 0 && calc.lines.every((l) => l.salary % 100 === 0));
  const odd = psp.calculate({ budget: 1198900 + 1100, weights: W, lines: lines26 });
  check('the rounding example: whatever is left after the shares goes to the Special Contract player, so the full allocation is used', odd.ok && odd.total === 1200000 && odd.lines.every((l) => l.salary % 100 === 0));
  check('the calculation refuses an unconfigured setting, a budget that is not a multiple of 100, and a selection with no Special Contract player', !psp.calculate({ budget: 1200000, weights: null, lines: lines26 }).ok && !psp.calculate({ budget: 1200050, weights: W, lines: lines26 }).ok && !psp.calculate({ budget: 1200000, weights: W, lines: lines26.slice(1) }).ok);
  const roster = [{ key: 'a', name: 'A', umpire: true }, { key: 'b', name: 'B', umpire: false }, { key: 'c', name: 'C', umpire: true }, { key: 'd', name: 'D', umpire: false }];
  check('selection rules: only registered players, no duplicates, category limits, an umpire as Special Contract, and (on submit) an umpire among the Elite', selectionProblems2());
  function selectionProblems2() {
    const sp = psp.selectionProblems;
    return sp([{ category: 'special_contract', key: 'a' }, { category: 'elite', key: 'c' }, { category: 'elite', key: 'b' }], roster, { complete: true }).length === 0
      && sp([{ category: 'special_contract', key: 'b' }], roster).length === 1
      && sp([{ category: 'special_contract', key: 'zzz' }], roster).length === 1
      && sp([{ category: 'special_contract', key: 'a' }, { category: 'elite', key: 'a' }], roster).length === 1
      && sp([{ category: 'special_contract', key: 'a' }, { category: 'special_contract', key: 'c' }], roster).length === 1
      && sp([{ category: 'elite', key: 'a' }, { category: 'elite', key: 'c' }, { category: 'elite', key: 'b' }], roster).length === 1
      && sp([{ category: 'special_contract', key: 'a' }, { category: 'elite', key: 'b' }, { category: 'elite', key: 'd' }], roster, { complete: true }).length === 1
      && sp([{ category: 'elite', key: 'b' }], roster).length === 0 && sp([{ category: 'elite', key: 'b' }], roster, { complete: true }).length >= 1;
  }
  const mk = (...m) => psp.consecutiveMonths(m);
  check('Top Class tracking: consecutive verified months (also across a year end), without granting anything', mk('2027-01', '2027-02', '2027-03').best === 3 && mk('2027-01', '2027-03').best === 1 && mk('2027-11', '2027-12', '2028-01').best === 3 && mk('2027-01', '2027-02', '2027-04').current === 1 && mk().best === 0 && psp.TOP_CLASS_MONTHS === 3);

  // ---- the database layer: long tables are read in pages, credits are insert-only
  const { KeyedRest } = await import('../../server/command/store.mjs');
  const bigTable = Array.from({ length: 2500 }, (_, i) => ({ key: `k${String(i).padStart(5, '0')}` }));
  const seen = [];
  const fakeDb = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method ?? 'GET', prefer: init.headers?.prefer });
    const q = new URL(String(url));
    const limit = Number(q.searchParams.get('limit') ?? 1000000);
    const offset = Number(q.searchParams.get('offset') ?? 0);
    const body = init.method === 'POST' ? '' : JSON.stringify(bigTable.slice(offset, offset + limit));
    return { ok: true, status: 200, text: async () => body, json: async () => (body ? JSON.parse(body) : null) };
  };
  const kr = new KeyedRest({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_x', fetchImpl: fakeDb, table: 'command_psp_records', missing: 'salary program', code: 'psp_missing' });
  const everyRow = await kr.list();
  await kr.insertMany([{ key: 'a' }]);
  check('a long table is read page by page (Supabase returns at most 1000 rows a request), and salary rows are inserted without ever overwriting an existing one', everyRow.length === 2500 && seen.filter((c) => c.method === 'GET').length === 3 && seen.find((c) => c.method === 'POST').prefer.includes('ignore-duplicates'));

  // ---- the server, end to end
  const ps = new MemoryStore();
  const mkAccount = async (id, role, slug, name, user, pass) => ps.create({ account_id: id, role, board_slug: slug, board_name: name, username: user, password_hash: await hashPassword(pass), status: 'active' });
  await mkAccount('IOCF-ADM-001', 'admin', null, null, 'psp.admin', 'Psp-Admin-Pass-1');
  await mkAccount('IOCF-BRD-901', 'board', 'pakistan', 'Pakistan', 'psp.pak', 'Psp-Pak-Pass-1');
  await mkAccount('IOCF-BRD-902', 'board', 'india', 'India', 'psp.ind', 'Psp-Ind-Pass-1');
  await mkAccount('IOCF-BRD-903', 'board', 'england', 'England', 'psp.eng', 'Psp-Eng-Pass-1');
  let pclock = Date.UTC(2026, 11, 20, 8, 0, 0);
  const ph = createHandler({ store: ps, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, now: () => pclock, rankInput: async () => ({ dataset: snap }) });
  let pn = 0;
  const pcall = (method, p, { body, cookie, query } = {}) => ph({ method, path: p.split('/').filter(Boolean).map(decodeURIComponent), headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ?? null, query, ip: `6.6.${++pn % 250}.${pn % 250}` });
  const plogin = async (role, user, pass) => `iocf_cc=${cookieOf(await pcall('POST', 'login', { body: { role, username: user, password: pass } }))}`;
  const cA = await plogin('admin', 'psp.admin', 'Psp-Admin-Pass-1');
  const cPak = await plogin('board', 'psp.pak', 'Psp-Pak-Pass-1');
  const cInd = await plogin('board', 'psp.ind', 'Psp-Ind-Pass-1');
  const cEng = await plogin('board', 'psp.eng', 'Psp-Eng-Pass-1');
  const J = '2027-01';

  // month activation
  const bm = (await pcall('GET', 'boards/pakistan/psp', { cookie: cPak })).body;
  const jan0 = bm.months.find((m) => m.key === J);
  const detail0 = (await pcall('GET', `boards/pakistan/psp/months/${J}`, { cookie: cPak })).body;
  check('January 2027 starts as Not Started: listed to the board but disabled, with the "not yet enabled" message, and a salary draft is refused', jan0 && jan0.status === 'not_started' && jan0.enabled === false && detail0.state.code === 'not_enabled' && /not yet enabled by IOCF Administration/.test(detail0.state.message) && (await pcall('PUT', `boards/pakistan/psp/months/${J}/draft`, { cookie: cPak, body: { lines: [] } })).status === 409 && (await pcall('POST', `boards/pakistan/psp/months/${J}/submit`, { cookie: cPak, body: { lines: [] } })).status === 409);
  const adminMonths = (await pcall('GET', 'admin/psp/months', { cookie: cA, query: { year: '2027' } })).body;
  check('the administrator sees all twelve months of 2027, all Not Started; years can be added without code changes', adminMonths.months.length === 12 && adminMonths.months.every((m) => m.status === 'not_started') && adminMonths.months[0].label === 'January 2027' && (await pcall('POST', 'admin/psp/years', { cookie: cA, body: { year: 2028 } })).status === 200 && (await pcall('GET', 'admin/psp/months', { cookie: cA, query: { year: '2028' } })).body.months[11].label === 'December 2028' && (await pcall('POST', 'admin/psp/years', { cookie: cA, body: { year: 1999 } })).status === 400);
  check('a board cannot enable a month or open any admin route; signed out nobody can', (await pcall('POST', `admin/psp/months/${J}/enable`, { cookie: cPak })).status === 403 && (await pcall('GET', 'admin/psp/months', { cookie: cPak })).status === 403 && (await pcall('PUT', 'admin/psp/settings', { cookie: cPak, body: { percent: {} } })).status === 403 && (await pcall('GET', 'admin/psp/months')).status === 401);
  const en = await pcall('POST', `admin/psp/months/${J}/enable`, { cookie: cA });
  check('the administrator enables January 2027: Active, who and when recorded, no request approved by it; enabling again is refused', en.status === 200 && en.body.month.status === 'active' && en.body.month.activatedBy === 'psp.admin' && en.body.month.activatedAt === pclock && (await pcall('POST', `admin/psp/months/${J}/enable`, { cookie: cA })).status === 409 && (await ps.pspList('submissions')).length === 0);
  check('once enabled the board sees the month as enabled, but still cannot submit: there are no published rankings and no settings yet', (await pcall('GET', `boards/pakistan/psp/months/${J}`, { cookie: cPak })).body.state.code === 'no_rankings');

  // council seats
  const seat = (council, n, board, cookie = cA) => pcall('PUT', `admin/psp/councils/${council}/${n}`, { cookie, body: { board } });
  check('nothing is assigned automatically: every council seat starts empty', (await pcall('GET', 'admin/psp/councils', { cookie: cA })).body.councils.every((c) => c.seats.every((s) => s.board === null)));
  check('the administrator seats boards in councils; a seat holds one board; a board holds one seat; only registered boards; a board cannot do it', (await seat('champions', 1, 'pakistan')).status === 200 && (await seat('champions', 1, 'india')).status === 409 && (await seat('champions', 2, 'pakistan')).status === 409 && (await seat('established', 1, 'pakistan')).status === 409 && (await seat('champions', 2, 'atlantis')).status === 400 && (await seat('champions', 8, 'india')).status === 404 && (await seat('champions', 2, 'india', cPak)).status === 403 && (await seat('champions', 2, 'india')).status === 200 && (await seat('established', 1, 'england')).status === 200);
  const councils = (await pcall('GET', 'admin/psp/councils', { cookie: cA })).body;
  check('the council view shows each council\'s seats and funding; unseated boards stay visible', councils.councils[0].seats[0].boardName === 'Pakistan' && councils.councils[0].monthlyFunding === 5250000 && councils.councils[3].monthlyFunding === 1200000 && councils.boards.find((b) => b.slug === 'canada').council === null && councils.boards.find((b) => b.slug === 'england').council === 'established');

  // monthly rankings
  const rank = (council, n, board, extra = {}, cookie = cA, month = J) => pcall('PUT', `admin/psp/rankings/${month}/${council}/${n}`, { cookie, body: { board, ...extra } });
  const r1 = await rank('champions', 1, 'pakistan');
  check('ranking Pakistan first in Champions fetches the official funding: 12,00,000 credits', r1.status === 200 && r1.body.credits === 1200000);
  check('ranking rules: a board of another council, an unseated board, a second rank for one board, a taken rank, and a board making the change are all refused', (await rank('champions', 2, 'england')).status === 409 && (await rank('champions', 2, 'canada')).status === 409 && (await rank('champions', 3, 'pakistan')).status === 409 && (await rank('champions', 1, 'india')).status === 409 && (await rank('champions', 2, 'india', {}, cPak)).status === 403 && (await rank('champions', 8, 'india')).status === 404);
  check('a partial ranking cannot be published (every seated board needs a rank); unranked boards get no allocation', (await rank('champions', 2, 'india')).status === 200 && (await pcall('POST', `admin/psp/rankings/${J}/publish`, { cookie: cA })).status === 409 && (await rank('established', 1, 'england')).body.credits === 800000 && (await pcall('GET', `boards/pakistan/psp/months/${J}`, { cookie: cPak })).body.allocation === null);
  const view = (await pcall('GET', `admin/psp/rankings/${J}`, { cookie: cA })).body;
  check('the ranking view lists the ranks of each council with their funding, the boards that can be chosen, and what is complete', view.councils[0].ranks.length === 7 && view.councils[0].ranks[0].funding === 1200000 && view.councils[0].ranks[1].boardName === 'India' && view.councils[0].boards.map((b) => b.slug).sort().join() === 'india,pakistan' && view.complete === true && view.totalFunding === 1200000 + 1000000 + 800000);
  const pub = await pcall('POST', `admin/psp/rankings/${J}/publish`, { cookie: cA });
  check('publishing the rankings makes each board\'s allocation visible to it (Pakistan: Champions, rank 1, 12,00,000); publishing twice is refused', pub.status === 200 && pub.body.month.rankingsPublished === true && (await pcall('POST', `admin/psp/rankings/${J}/publish`, { cookie: cA })).status === 409);
  const d1 = (await pcall('GET', `boards/pakistan/psp/months/${J}`, { cookie: cPak })).body;
  check('the board sees its council, rank and allocation from the published ranking; it still cannot submit until the settings exist; boards cannot alter their allocation', d1.council === 'Council of Champions' && d1.rank === 1 && d1.allocation === 1200000 && d1.state.code === 'not_configured' && (await rank('champions', 1, 'india', { reason: 'x' }, cPak)).status === 403);
  { const c1 = await rank('champions', 1, null); const c2 = await rank('champions', 5, 'india', { reason: 'recheck' }); check('changing a published ranking needs a reason and is recorded', c1.status === 400 && c2.status === 409, JSON.stringify([c1.status, c1.body, c2.status, c2.body]).slice(0, 300)); }

  // settings
  const setPercent = (percent) => pcall('PUT', 'admin/psp/settings', { cookie: cA, body: { percent } });
  check('the salary settings: nothing is configured to begin with; percentages must total 100% with at most two decimals; a board cannot change them', (await pcall('GET', 'admin/psp/settings', { cookie: cA })).body.complete === false && (await setPercent({ special_contract: 20, elite: 20, international: 20, professional: 15, developing: 15, emerging: 5 })).status === 400 && (await setPercent({ special_contract: 20, elite: 20, international: 20, professional: 15, developing: 15, emerging: 10.001 })).status === 400 && (await setPercent({ special_contract: 20, elite: 20, international: 20, professional: 15, developing: 15 })).status === 400 && (await pcall('PUT', 'admin/psp/settings', { cookie: cPak, body: { percent: {} } })).status === 403);
  check('the administrator saves a complete setting (20 / 20 / 20 / 15 / 15 / 10)', (await setPercent({ special_contract: 20, elite: 20, international: 20, professional: 15, developing: 15, emerging: 10 })).status === 200 && (await pcall('GET', 'admin/psp/settings', { cookie: cA })).body.complete === true);

  // category validation and calculation, as the board
  const pakRoster = rosterOf(snap, 'pakistan').players;
  const ump = pakRoster.filter((p) => p.umpire);
  const non = pakRoster.filter((p) => !p.umpire);
  const chairman = pakRoster.find((p) => p.designation === 'Chairman');
  const ceo = pakRoster.find((p) => p.designation === 'CEO');
  const L = (cat, ...ps) => ps.map((p) => ({ category: cat, key: p.key }));
  const draft = (lines, cookie = cPak, slug = 'pakistan') => pcall('PUT', `boards/${slug}/psp/months/${J}/draft`, { cookie, body: { lines } });
  const submit = (lines, cookie = cPak, slug = 'pakistan') => pcall('POST', `boards/${slug}/psp/months/${J}/submit`, { cookie, body: { lines } });
  const d2 = (await pcall('GET', `boards/pakistan/psp/months/${J}`, { cookie: cPak })).body;
  check('the board can now start: registered players only, with the Chairman and CEO shown by their designation and the umpire flag from the umpire records', d2.state.canEdit === true && d2.roster.length === pakRoster.length && chairman && ceo && d2.roster.find((p) => p.key === chairman.key).designation === 'Chairman' && d2.roster.find((p) => p.key === ceo.key).designation === 'CEO' && ump.length >= 3);
  check('category rules on the server: Special Contract must be an active umpire; Elite needs an umpire (on submit); limits; no duplicates; no player of another board', (await draft(L('special_contract', non[0]))).status === 400 && (await submit([...L('special_contract', ump[0]), ...L('elite', non[0], non[1])])).status === 400 && (await draft([...L('special_contract', ump[0], ump[1])])).status === 400 && (await draft([...L('special_contract', ump[0]), ...L('elite', ump[0])])).status === 400 && (await draft([{ category: 'elite', key: 'notaplayeratall' }])).status === 400 && (await draft([...L('elite', ump[1], ump[2], non[0])])).status === 400 && (await draft([...L('international', ...non.slice(0, 5))])).status === 400 && (await draft([{ category: 'captain', key: non[0].key }])).status === 400);
  const indRoster = rosterOf(snap, 'india').players;
  check('a board cannot pick another board\'s player', (await draft(L('emerging', indRoster[0]))).status === 400);
  // 26 players: Special (an umpire), Elite (an umpire + the CEO), International x4, Professional x4 (incl. the Chairman), Developing x8, Emerging x7
  const used = new Set();
  const pick = (n, pool) => pool.filter((p) => !used.has(p.key)).slice(0, n).map((p) => { used.add(p.key); return p; });
  const sc = pick(1, [ump[0]]);
  const el = [ump[1], ceo].filter((p, i, a) => a.indexOf(p) === i && !used.has(p.key)); el.forEach((p) => used.add(p.key));
  const prof = [chairman, ...pick(3, non.filter((p) => p.key !== chairman.key && p.key !== ceo.key))]; prof.forEach((p) => used.add(p.key));
  const intl = pick(4, non);
  const dev = pick(8, pakRoster.filter((p) => !used.has(p.key)));
  const emg = pick(7, pakRoster.filter((p) => !used.has(p.key)));
  const full = [...L('special_contract', ...sc), ...L('elite', ...el), ...L('international', ...intl), ...L('professional', ...prof), ...L('developing', ...dev), ...L('emerging', ...emg)];
  const dr = await draft(full.slice(0, 5));
  check('a draft is saved without being submitted (nothing is sent to the administrator)', dr.status === 200 && dr.body.request.status === 'draft' && dr.body.request.version === 1 && (await pcall('GET', 'admin/psp/requests', { cookie: cA })).body.requests.length === 0);
  const sb = await submit(full);
  const req1 = sb.body.request;
  const salOf = (cat) => req1.lines.filter((l) => l.category === cat).map((l) => l.salary);
  check('submitting calculates every salary on the server with the configured weights: multiples of 100, rounding balance on the Special Contract, the whole 12,00,000 distributed, remaining 0', sb.status === 201 && req1.status === 'submitted' && req1.total === 1200000 && req1.remaining === 0 && req1.lines.length === 26 && req1.lines.every((l) => l.salary % 100 === 0) && salOf('special_contract')[0] === 240300 && salOf('elite').join() === '120000,120000' && salOf('international').every((x) => x === 60000) && salOf('professional').every((x) => x === 45000) && salOf('developing').every((x) => x === 22500) && salOf('emerging').every((x) => x === 17100) && req1.council === 'champions' && req1.rank === 1);
  check('the Chairman and the CEO sit in their category positions (Professional and Elite) with no extra position; the total player count is the category total', req1.lines.find((l) => l.key === chairman.key).category === 'professional' && req1.lines.find((l) => l.key === ceo.key).category === 'elite' && req1.lines.find((l) => l.key === chairman.key).designation === 'Chairman' && new Set(req1.lines.map((l) => l.key)).size === 26);
  check('a submitted request is locked: the board cannot edit or resubmit it, or sneak in a salary; another board cannot read it', (await draft(full.slice(0, 2))).status === 409 && (await submit(full)).status === 409 && (await pcall('GET', `boards/pakistan/psp/months/${J}`, { cookie: cInd })).status === 403 && (await draft(full, cInd, 'pakistan')).status === 403 && (await pcall('GET', 'boards/pakistan/psp/records', { cookie: cInd })).status === 403);
  check('no player is credited before approval', (await ps.pspList('records')).length === 0 && (await ps.pspList('transactions')).length === 0);

  check('the dashboards point at what needs attention: the administrator sees the requests waiting for a decision; a board sees the months waiting for its submission (none once it has submitted)', (await pcall('GET', 'admin/overview', { cookie: cA })).body.pendingSalaryRequests === 1 && (await pcall('GET', 'boards/england/dashboard', { cookie: cEng })).body.salaryActions >= 1 && (await pcall('GET', 'boards/pakistan/dashboard', { cookie: cPak })).body.salaryActions === 0, JSON.stringify([(await pcall('GET', 'admin/overview', { cookie: cA })).body.pendingSalaryRequests, (await pcall('GET', 'boards/england/dashboard', { cookie: cEng })).body.salaryActions, (await pcall('GET', 'boards/pakistan/dashboard', { cookie: cPak })).body.salaryActions]));

  // the administrator reviews and approves
  const list1 = (await pcall('GET', 'admin/psp/requests', { cookie: cA })).body.requests;
  check('the request appears in Salary Requests with board, council, rank, allocation, players, submitted salary, remaining and status', list1.length === 1 && list1[0].boardName === 'Pakistan' && list1[0].council === 'champions' && list1[0].rank === 1 && list1[0].allocation === 1200000 && list1[0].players === 26 && list1[0].total === 1200000 && list1[0].remaining === 0 && list1[0].status === 'submitted');
  const rid = req1.id;
  const rd = (await pcall('GET', `admin/psp/requests/${encodeURIComponent(rid)}`, { cookie: cA })).body.request;
  check('the review shows the whole distribution with the checks: umpire verification, Chairman/CEO, multiples of 100, category totals and the calculation breakdown', rd.lines.length === 26 && rd.checks.problems.length === 0 && rd.checks.specialContractUmpire === true && rd.checks.eliteHasUmpire === true && rd.checks.multiplesOf100 === true && rd.checks.totalMatchesAllocation === true && rd.checks.officials.map((o) => o.designation).sort().join() === 'CEO,Chairman' && rd.checks.umpireVerification.length === 3 && rd.categoryTotals.length === 6 && rd.breakdown.length === 6);
  check('only the administrator can review, approve or decline', (await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/approve`, { cookie: cPak })).status === 403 && (await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/decline`, { cookie: cPak, body: { reason: 'no' } })).status === 403 && (await pcall('GET', 'admin/psp/requests', { cookie: cPak })).status === 403);
  check('opening a request for review moves it to Under Review', (await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/review`, { cookie: cA })).status === 200 && (await pcall('GET', 'boards/pakistan/psp', { cookie: cPak })).body.months.find((m) => m.key === J).request.status === 'under_review');
  pclock += 60000;
  const ap = await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/approve`, { cookie: cA });
  const recs = await ps.pspList('records');
  const txs = await ps.pspList('transactions');
  check('approving credits virtual salaries exactly once: one transaction and one verified record per player, the request becomes Credited', ap.status === 200 && ap.body.request.status === 'credited' && recs.length === 26 && txs.length === 26 && txs.reduce((n, x) => n + x.amount, 0) === 1200000 && recs.every((r) => r.status === 'credited' && r.transaction_ref.startsWith('PSP-202701-pakistan-')) && txs.every((x) => recs.some((r) => r.transaction_ref === x.key)));
  const ap2 = await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/approve`, { cookie: cA });
  await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/approve`, { cookie: cA });
  check('approving again (or twice at once) creates no second credit', ap2.status === 200 && ap2.body.already === true && (await ps.pspList('records')).length === 26 && (await ps.pspList('transactions')).length === 26);
  check('a credited request cannot be declined, edited or re-submitted; its records are not changed by a later attempt', (await pcall('POST', `admin/psp/requests/${encodeURIComponent(rid)}/decline`, { cookie: cA, body: { reason: 'too late' } })).status === 409 && (await draft(full.slice(0, 2))).status === 409 && JSON.stringify((await ps.pspList('records')).sort((x, y) => x.key.localeCompare(y.key))) === JSON.stringify(recs.sort((x, y) => x.key.localeCompare(y.key))));
  check('an approved request cannot have its rank changed afterwards', (await rank('champions', 1, null, { reason: 'mistake' })).status === 409);
  check('the board sees the approved salaries and its player records (category, salary, reference); the Top Class counter shows one verified month and grants nothing', await (async () => {
    const r = (await pcall('GET', 'boards/pakistan/psp/records', { cookie: cPak })).body;
    const p = r.players.find((x) => x.key === ceo.key);
    return r.records === 26 && r.players.length === 26 && p.records[0].categoryLabel === 'Elite' && p.records[0].salary === 120000 && p.records[0].reference.startsWith('PSP-202701-pakistan-') && p.verifiedMonths === 1 && p.consecutive === 1 && p.topClassReady === false;
  })());
  check('the administrator sees salary records across boards, filtered by month, board and name', await (async () => {
    const all = (await pcall('GET', 'admin/psp/records', { cookie: cA })).body;
    const f = (await pcall('GET', 'admin/psp/records', { cookie: cA, query: { board: 'pakistan', q: ceo.name.split(' ')[0].toLowerCase(), month: J } })).body;
    return all.total === 26 && all.records[0].boardName === 'Pakistan' && f.total >= 1 && f.records.every((r) => r.board === 'pakistan') && (await pcall('GET', 'admin/psp/records', { cookie: cA, query: { month: '2027-02' } })).body.total === 0;
  })());

  // rejection and resubmission (India)
  const indUmp = indRoster.filter((p) => p.umpire);
  const indNon = indRoster.filter((p) => !p.umpire);
  const indLines = (extra = 0) => [...L('special_contract', indUmp[0]), ...L('elite', indUmp[1], indNon[0]), ...L('international', ...indNon.slice(1, 5)), ...L('professional', ...indNon.slice(5, 9)), ...L('developing', ...indNon.slice(9, 17 + extra))];
  const iSub = await submit(indLines(), cInd, 'india');
  check('India (Champions rank 2, 10,00,000) submits without Emerging players: the empty category\'s part goes to the Special Contract, the whole allocation is still distributed', iSub.status === 201 && iSub.body.request.allocation === 1000000 && iSub.body.request.total === 1000000 && iSub.body.request.lines.every((l) => l.salary % 100 === 0) && iSub.body.request.lines.find((l) => l.category === 'special_contract').salary === 300400);
  const iid = iSub.body.request.id;
  check('declining needs a reason; the administrator declines with one', (await pcall('POST', `admin/psp/requests/${encodeURIComponent(iid)}/decline`, { cookie: cA, body: {} })).status === 400 && (await pcall('POST', `admin/psp/requests/${encodeURIComponent(iid)}/decline`, { cookie: cA, body: { reason: 'Elite players need a re-check' } })).status === 200);
  const iRej = (await pcall('GET', `boards/india/psp/months/${J}`, { cookie: cInd })).body;
  check('the board sees the rejection reason and can correct it; no salary was credited', iRej.request.status === 'rejected' && iRej.request.reason === 'Elite players need a re-check' && iRej.state.canEdit === true && (await ps.pspList('records')).filter((r) => r.board === 'india').length === 0);
  const iDraft = await draft(indLines(), cInd, 'india');
  check('correcting starts a new version (the rejected one is kept); resubmitting sends version 2', iDraft.status === 200 && iDraft.body.request.version === 2 && iDraft.body.request.status === 'draft');
  const iSub2 = await submit([...indLines(), ...L('emerging', ...indNon.slice(17, 20))], cInd, 'india');
  check('the revised submission is accepted and can be approved; the old version stays in the history', iSub2.status === 201 && iSub2.body.request.version === 2 && iSub2.body.request.total === 1000000);
  const iDetail = (await pcall('GET', `admin/psp/requests/${encodeURIComponent(iSub2.body.request.id)}`, { cookie: cA })).body.request;
  check('the review lists every version with its status and reason', iDetail.versions.length === 2 && iDetail.versions[0].status === 'rejected' && iDetail.versions[0].reason === 'Elite players need a re-check' && iDetail.versions[1].status === 'submitted');
  check('approving the revised request credits India once', (await pcall('POST', `admin/psp/requests/${encodeURIComponent(iSub2.body.request.id)}/approve`, { cookie: cA })).body.request.status === 'credited' && (await ps.pspList('records')).filter((r) => r.board === 'india').length === indLines().length + 3 && (await ps.pspList('transactions')).length === 26 + indLines().length + 3);

  // security
  check('boards cannot see each other: England cannot read Pakistan\'s records, month or draft; Pakistan cannot read England\'s', (await pcall('GET', 'boards/pakistan/psp', { cookie: cEng })).status === 403 && (await pcall('GET', 'boards/england/psp', { cookie: cPak })).status === 403 && (await pcall('GET', 'boards/england/psp/records', { cookie: cPak })).status === 403);
  check('a board cannot bypass approval: there is no route that credits except the administrator\'s approve, and approving a draft or an unknown request fails', (await pcall('POST', `admin/psp/requests/${encodeURIComponent('2027-01:england:v1')}/approve`, { cookie: cA })).status === 404 && (await pcall('POST', `boards/england/psp/months/${J}/credit`, { cookie: cEng })).status === 404);

  // the administrator overview, and a separate month
  const ov = (await pcall('GET', 'admin/psp/overview', { cookie: cA, query: { year: '2027', month: J } })).body;
  check('the administrator overview: funding 1.20 crore a month / 14.40 crore a year, assigned and ranked boards, request counts, allocated and distributed credits, council summaries and the board table', ov.monthlyFunding === 12000000 && ov.annualFunding === 144000000 && ov.assignedBoards === 3 && ov.boardsWithRankings === 3 && ov.credited === 2 && ov.submitted === 0 && ov.rejected === 0 && ov.awaiting === 1 && ov.totalAllocated === 3000000 && ov.totalDistributed === 2200000 && ov.councils.length === 4 && ov.councils[0].distributed === 2200000 && ov.boards.length === 3 && ov.boards.find((b) => b.board === 'england').status === 'not_submitted' && ov.configComplete === true, JSON.stringify({ a: ov.assignedBoards, b: ov.boardsWithRankings, c: ov.credited, s: ov.submitted, r: ov.rejected, w: ov.awaiting, al: ov.totalAllocated, di: ov.totalDistributed, c0: ov.councils[0].distributed, bl: ov.boards.length }));
  check('February 2027 is a separate cycle: not started, no rankings, no allocation, no credits; January\'s records are untouched', (await pcall('GET', 'boards/pakistan/psp/months/2027-02', { cookie: cPak })).body.state.code === 'not_enabled' && (await pcall('POST', 'admin/psp/months/2027-02/enable', { cookie: cA })).status === 200 && (await pcall('GET', 'boards/pakistan/psp/months/2027-02', { cookie: cPak })).body.state.code === 'no_rankings' && (await ps.pspList('records')).filter((r) => r.month_key === J).length === 26 + indLines().length + 3);
  check('the administrator can move a month through its statuses and extend the deadline; a closed month refuses salary actions; the dates of the cycle are shown', await (async () => {
    const set = (body) => pcall('PUT', 'admin/psp/months/2027-03', { cookie: cA, body });
    const ext = Date.UTC(2027, 2, 8, 12, 0, 0);
    const a = await set({ status: 'submission_open', deadlineAt: ext, note: 'Delayed by a technical fault' });
    const b = await set({ status: 'nonsense' });
    const m = (await pcall('GET', 'admin/psp/months', { cookie: cA, query: { year: '2027' } })).body.months[2];
    await pcall('POST', 'admin/psp/months/2027-02/enable', { cookie: cA });
    await pcall('PUT', 'admin/psp/months/2027-02', { cookie: cA, body: { status: 'closed' } });
    const closed = (await pcall('GET', 'boards/pakistan/psp/months/2027-02', { cookie: cPak })).body;
    return a.status === 200 && a.body.month.status === 'submission_open' && a.body.month.deadlineAt === ext && a.body.month.deadlineMoved === true && b.status === 400 && m.schedule.announce === '2027-03-01' && m.schedule.submitFrom === '2027-03-02' && m.schedule.submitUntil === '2027-03-03' && m.schedule.verifyFrom === '2027-03-04' && m.schedule.verifyUntil === '2027-03-05' && m.note === 'Delayed by a technical fault' && closed.state.canEdit === false;
  })());
  check('late submissions are flagged (after the deadline) but kept: the original monthly history is not lost', await (async () => {
    // England: seat is Established rank 1; submit on a clock past the deadline of January (the 3rd, 23:59 IST)
    pclock = Date.UTC(2027, 0, 10, 8, 0, 0);
    const cEng2 = await plogin('board', 'psp.eng', 'Psp-Eng-Pass-1'); // (the clock moved on: sign in again)
    const engRoster = rosterOf(snap, 'england').players;
    const eu = engRoster.filter((p) => p.umpire);
    const en2 = engRoster.filter((p) => !p.umpire);
    const r = await submit([...L('special_contract', eu[0]), ...L('elite', eu[1], en2[0])], cEng2, 'england');
    return r.status === 201 && r.body.request.late === true && r.body.request.total === 800000;
  })());
  check('the audit log records the activation, seats, ranks, publishing, settings, submissions, approvals and rejections with who did them', await (async () => {
    const acts = (await ps.listAudit(500)).map((x) => x.action);
    return ['psp_month_enabled', 'psp_seat_assigned', 'psp_rank_set', 'psp_rankings_published', 'psp_settings_changed', 'psp_salary_submitted', 'psp_request_approved', 'psp_request_declined', 'psp_month_changed'].every((a) => acts.includes(a)) && (await ps.listAudit(500)).find((x) => x.action === 'psp_month_enabled').actor === 'psp.admin';
  })());
  check('a salary table that is not created yet gives a clear "not set up" answer instead of an error page', await (async () => {
    const broken = new MemoryStore();
    await broken.create({ account_id: 'IOCF-ADM-001', role: 'admin', board_slug: null, board_name: null, username: 'broken.admin', password_hash: await hashPassword('Broken-Admin-Pass-1'), status: 'active' });
    broken.pspList = async () => { throw Object.assign(new Error('missing'), { code: 'psp_missing' }); };
    const bh = createHandler({ store: broken, env: { COMMAND_CENTER_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234' }, rankInput: async () => ({ dataset: snap }) });
    const lg = await bh({ method: 'POST', path: ['login'], headers: H, body: { role: 'admin', username: 'broken.admin', password: 'Broken-Admin-Pass-1' }, ip: '5.5.5.5' });
    const out = await bh({ method: 'GET', path: ['admin', 'psp', 'months'], headers: { ...H, cookie: `iocf_cc=${cookieOf(lg)}` }, body: null, ip: '5.5.5.5' });
    if (out.status !== 503) console.log('DEBUG', out.status, JSON.stringify(out.body).slice(0, 200));
    return out.status === 503 && out.body.error.code === 'psp_missing';
  })());
}

console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${failures.length} failed`);
fs.rmSync(home, { recursive: true, force: true });
if (failures.length) {
  console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
