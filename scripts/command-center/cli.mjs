#!/usr/bin/env node
// IOCF Command Center — credential tool. Run on the President's own computer.
//
//   npm run cc -- setup [--show]           create the Master Administrator and the 26 chairman accounts (safe to re-run)
//   npm run cc -- export                   (re)write the readable credentials file, IOCF_CREDENTIALS_PLAIN.csv
//   npm run cc -- import                   apply your edits from that file (usernames, passwords, active / inactive)
//   npm run cc -- sync-sheet [--dry-run]   read the logins from your private credentials sheet and apply them (creates / updates)
//   npm run cc -- reveal [board|--all]     show passwords from the encrypted register on the terminal
//   npm run cc -- reset <board|username>   new random password for one account (add --username <new> to rename it too)
//   npm run cc -- record <board|username>  note a login you set in the browser (Board Accounts) in your register
//   npm run cc -- connect [--project <ref>] connect your Supabase project (asks for the secret key, hidden), test it, then upload the accounts
//   npm run cc -- vercel                   print the three values to paste into Vercel's Environment Variables (this terminal only)
//   npm run cc -- push                     upload the accounts to Supabase (once it is set up)
//   npm run cc -- verify                   check that the register and the database agree
//   npm run cc -- status [--sync]          list the accounts (no secrets); --sync copies online status changes into the register
//   npm run cc -- backup --out <folder>    write an encrypted backup of the register
//
// Without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY it works on a local store in ~/.iocf-command-center/, so you can create
// the accounts and the credentials file before Supabase exists, then `push`.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { applyCredentials, backup, homeDir, hostingValues, describeKey, inspectSupabase, saveEnv, SUPABASE_URL_FOR, importPlain, parseCredentialSheet, loadEnvFile, localStorePath, PLAIN_FILE, provision, pushAccounts, readRegister, recordPassword, resetCredentials, reveal, syncStatuses, verifyRegister, writePlain } from './lib.mjs';
import { FileStore, SupabaseStore } from '../../server/command/store.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(n);
const opt = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : undefined);
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && ['--out', '--username'].includes(rest[i - 1])));

const home = homeDir();
loadEnvFile(home);

function table(rows) {
  if (!rows.length) return console.log('(none)');
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '));
}

const remote = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const localStore = () => new FileStore(localStorePath(home));

/** Supabase when it is configured, otherwise the local store in your private folder. */
function store() {
  if (remote()) return new SupabaseStore({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
  return localStore();
}
const where = () => (remote() ? 'Supabase' : `your local store (${localStorePath(home)})`);


/** Asks for a secret on the terminal without showing what is typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl.question(question, (answer) => {
      rl._writeToOutput = write;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) process.stdout.write(question);
    };
  });
}

function chairmen() {
  try {
    const d = JSON.parse(readFileSync('public/iocf-data.json', 'utf8'));
    return Object.fromEntries(d.boards.map((b) => [b.name, b.chairman ?? null]));
  } catch {
    return {};
  }
}

try {
  if (cmd === 'setup') {
    const st = store();
    const created = await provision({ store: st, home, chairmen: chairmen() });
    console.log(`Using ${where()}.`);
    console.log(created.length ? `Created ${created.length} account(s).` : 'Every account already exists. Nothing created.');
    const file = await writePlain({ store: st, home });
    console.log(`\nYour credentials file (readable, private, never committed):\n  ${file}\nThe encrypted register (the master copy):\n  ${path.join(home, 'IOCF_PRIVATE_CREDENTIAL_REGISTER.csv')}`);
    if (!remote()) console.log('\nSupabase is not configured yet, so the accounts are in your local store only. When Supabase is ready, run:  npm run cc -- push');
    if (created.length && flag('--show')) {
      console.log('\nCredentials — shown once, on this terminal only. Do not paste them anywhere public.\n');
      table(created.map((c) => ({ Account: c.accountId, Board: c.board ?? '—', Username: c.username, Password: c.password })));
    }
  } else if (cmd === 'reveal') {
    const ref = flag('--all') ? undefined : positional[0];
    if (!ref && !flag('--all')) throw new Error('Say which account: npm run cc -- reveal <board or username>   (or --all)');
    const rows = reveal({ home, ref });
    if (!rows.length) throw new Error('No matching account in the register.');
    console.log('Shown on this terminal only. Clear the screen afterwards.\n');
    table(rows.map((r) => ({ Account: r.accountId, Board: r.board || '—', Username: r.username, Password: r.password, Status: r.status })));
  } else if (cmd === 'reset') {
    if (!positional[0]) throw new Error('Say which account: npm run cc -- reset <board or username> [--username <new>]');
    const r = await resetCredentials({ store: store(), home, ref: positional[0], newUsername: opt('--username') });
    console.log(`New credentials for ${r.board ?? 'the Master Administrator'} (${r.accountId}). Its open sessions have ended and the register is updated.\n`);
    table([{ Username: r.username, Password: r.password }]);
  } else if (cmd === 'sync-sheet') {
    // The sheet's link lives only in ~/.iocf-command-center/env (CC_CREDENTIALS_SHEET_URL) — never in the project, and never printed.
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const file = opt('--file');
    if (file) {
      if (/\.csv$/i.test(file)) await wb.csv.readFile(file);
      else await wb.xlsx.readFile(file);
    } else {
      const url = process.env.CC_CREDENTIALS_SHEET_URL;
      if (!url) throw new Error('No credentials sheet is set. Add  CC_CREDENTIALS_SHEET_URL=<the sheet link>  to ' + path.join(home, 'env') + '  (or use --file <downloaded sheet>).');
      const { downloadWorkbook } = await import('../sync/sheet.mjs');
      await wb.xlsx.load(await downloadWorkbook(url));
    }
    const { tab, entries } = parseCredentialSheet(wb, { tab: opt('--tab') });
    console.log(`Read ${entries.length} login(s) from the "${tab}" tab. Applying to ${where()}${flag('--dry-run') ? ' (dry run: nothing will be changed)' : ''}.\n`);
    const res = await applyCredentials({ store: store(), home, entries, minLength: 8, dryRun: flag('--dry-run'), chairmen: chairmen() });
    res.warnings.forEach((w) => console.log(' !', w));
    if (res.warnings.length) console.log();
    if (!res.changes.length) console.log('Everything already matches the sheet. No changes.');
    else {
      table(res.changes.map((c) => ({ Account: c.accountId, Board: c.board, Change: c.changes })));
      if (!flag('--dry-run')) {
        await writePlain({ store: store(), home });
        console.log(`\nDone. The encrypted register and your credentials file are updated${remote() ? '' : '. These accounts are in your local store; run  npm run cc -- push  to put them online'}.`);
      }
    }
  } else if (cmd === 'record') {
    if (!positional[0]) throw new Error('Say which account: npm run cc -- record <board or username>');
    const r = await recordPassword({ store: store(), home, ref: positional[0], password: await askHidden('The password you set online for that account (not shown): ') });
    console.log(`Recorded the login for ${r.board} (${r.username}) in your encrypted register and credentials file.`);
  } else if (cmd === 'connect') {
    const ref = opt('--project');
    let url = process.env.SUPABASE_URL || (ref ? SUPABASE_URL_FOR(ref) : '');
    if (!url) url = (await askHidden('Supabase project URL (https://<ref>.supabase.co): ')).trim();
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) throw new Error('That is not a Supabase project URL. It looks like https://<project-ref>.supabase.co');
    console.log(`Project: ${url}`);
    const desc = describeKey(process.env.SUPABASE_SERVICE_ROLE_KEY || (await askHidden('Paste the secret key (sb_secret_… or service_role) — it is not shown: ')), url.match(/^https:\/\/([a-z0-9]+)\./)[1]);
    if (!desc.usable) throw new Error(desc.message);
    console.log(`Key type: ${desc.kind === 'secret' ? 'secret key (sb_secret_…)' : 'service_role key'} — ${desc.key.length} characters.`);
    const key = desc.key;
    const found = await inspectSupabase({ url, key });
    if (found.error) throw new Error(found.error);
    console.log('✓ The key works.');
    saveEnv(home, { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, ...(process.env.COMMAND_CENTER_SESSION_SECRET ? {} : { COMMAND_CENTER_SESSION_SECRET: randomBytes(36).toString('base64url') }) });
    console.log(`✓ Saved to ${path.join(home, 'env')} (private, mode 600).`);
    for (const t of found.others.filter((o) => o.looksLikeLogins)) {
      console.log(`\n⚠  The table "${t.name}" (columns: ${t.columns.join(', ')}) looks like it holds passwords.\n   The Command Center does not read it, and if it keeps readable passwords it is a risk: in the Supabase Table Editor, turn on\n   "Row Level Security" for it (no policies), or delete it once your accounts are uploaded.`);
    }
    if (found.missing.length) {
      console.log(`\n✗ These tables do not exist yet: ${found.missing.join(', ')}.\n  Create them once:  copy the schema with   pbcopy < server/command/schema.sql\n  then in Supabase open  SQL Editor → New query → paste → Run.  Afterwards run this command again.`);
    } else {
      process.env.SUPABASE_URL = url;
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
      const r = await pushAccounts({ from: localStore(), to: store() });
      console.log(`✓ Tables found. Accounts uploaded: ${r.created} created, ${r.updated} updated.\n\nLast step: give Vercel the same three values, then redeploy. Print them here with:  npm run cc -- vercel`);
    }
  } else if (cmd === 'vercel') {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.COMMAND_CENTER_SESSION_SECRET) throw new Error('Run  npm run cc -- connect  first.');
    console.log('Paste these into Vercel → your project → Settings → Environment Variables (Production), one by one, then redeploy.\nShown on this terminal only. Clear the screen afterwards.\n');
    console.log(hostingValues(process.env).join('\n'));
  } else if (cmd === 'export') {
    console.log(`Written: ${await writePlain({ store: store(), home })}\nOpen it, edit usernames / passwords / status if you wish, then run:  npm run cc -- import`);
  } else if (cmd === 'import') {
    const changes = await importPlain({ store: store(), home });
    if (!changes.length) console.log(`No changes found in ${PLAIN_FILE}.`);
    else {
      console.log(`Applied ${changes.length} change(s) to ${where()}; the encrypted register is updated and those accounts are signed out.\n`);
      table(changes.map((c) => ({ Account: c.accountId, Board: c.board, Changed: c.changes })));
      await writePlain({ store: store(), home });
    }
  } else if (cmd === 'push') {
    if (!remote()) throw new Error('Supabase is not configured. Put SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ' + path.join(home, 'env') + ' first.');
    const r = await pushAccounts({ from: localStore(), to: store() });
    console.log(`Supabase now has your accounts: ${r.created} created, ${r.updated} updated. The passwords in your credentials file work on the live site.\nCheck with:  npm run cc -- verify`);
  } else if (cmd === 'verify') {
    const v = await verifyRegister({ store: store(), home });
    console.log(`${v.accounts} accounts in the database, ${v.register} in the register.`);
    if (v.problems.length) (v.problems.forEach((p) => console.log(' ✗', p)), process.exit(2));
    else console.log('✓ The register and the database agree.');
  } else if (cmd === 'status') {
    const s = store();
    if (flag('--sync')) console.log(`Register statuses updated: ${await syncStatuses({ store: s, home })}`);
    table((await s.list()).map((a) => ({ Account: a.account_id, Board: a.board_name ?? '—', Username: a.username, Status: a.status, 'Last sign-in': a.last_login_at?.slice(0, 16).replace('T', ' ') ?? '—' })));
    console.log(`\nRegister rows: ${readRegister(home).length}`);
  } else if (cmd === 'backup') {
    const out = opt('--out');
    if (!out) throw new Error('Say where: npm run cc -- backup --out <folder>');
    console.log(`Encrypted backup written to ${backup({ home, outDir: path.resolve(out) })}\nKeep the key (${path.join(home, 'register.key')}) somewhere separate and safe: the backup cannot be read without it.`);
  } else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 19).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
}
