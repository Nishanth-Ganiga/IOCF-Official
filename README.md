# IOCF — International Online Cricket Federation

The official app of the **International Online Cricket Federation**: boards, chairmen, players, umpires, franchise leagues and major tournaments, all driven by one Google Sheet. It runs as a website and as an Android / iOS app.

**Live site: https://iocf-official.vercel.app/**

Open it to explore everything in the app: the federation overview, all 26 boards and their chairpersons, players and umpires, the franchise leagues with full player statistics, and the major tournaments with their results, awards and player statistics. It is updated from the IOCF Google Sheet, so it always shows the latest data.

## Profiles

After the opening sequence, visitors choose who is watching. Each profile is its own section of the app.

| Profile | What it holds |
| --- | --- |
| **IOCF Main** | The federation overview, recent results, tournaments, Hall of Fame, councils and the IOCF Instagram link |
| **Chairman** | The 26 board chairpersons: profiles, contributions, councils, sponsors and a side-by-side compare |
| **Board** | Every board: rankings, credits, sponsors, councils, leadership, squads, compare, and a link to each board's Instagram page |
| **Player** | The player directory and individual player profiles |
| **Umpire** | Umpires and their match assignments |
| **Franchise Leagues** | League → Season → Team → Player, with results, awards, standings and full player statistics |
| **Major Tournaments** | T20 World Cup, Euro Cup, Oceania Cup, Asia Cup, Associate Nations Cup, ODI World Cup, World Test Championship, Emerging Talents League, Women's Global League and IOCF Lone Warrior — each with a 2026 edition: every table from its sheet, plus Board → Player statistics |
| **Command Center** | Locked. 27 real accounts (1 Master Administrator, 26 board chairmen), signed in on the server. Admin Login opens the administrator dashboard; Board Login opens that chairman's own themed board dashboard |

Global search and favourites work across profiles.

## Run it locally

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
npm run build      # type-check and build into dist/
npm run preview    # serve the production build
npm run start      # build, then serve with automatic sheet re-sync (see below)
```

## Live data from Google Sheets

Boards, players, umpires, franchise leagues, tournaments and the Main-page text all come from one Google Sheet.

**Set up**
1. In the sheet: Share → General access → *Anyone with the link* → *Viewer*.
2. Put the sheet link in `iocf.config.json` (`"sheetUrl"`), or set `IOCF_SHEET_URL`.

**Commands**
- `npm run sync` — download the sheet and write `public/iocf-data.json` (used by `npm run dev`) and `src/data/snapshot.json` (the bundled offline fallback). The output lists any Major Tournament without a matching tab.
- `npm run sync -- --file "IOCF ALL BOARDS .xlsx"` — sync from a local Excel copy instead.
- `npm run start` — build and serve. The server re-syncs on start-up and every `syncIntervalMinutes` (default 30). `GET /api/status` shows the last sync and any error.

**On the deployed site** the page asks `/api/iocf-data` first (it reads the sheet and is cached for a few minutes), then `/iocf-data.json`, then the bundled snapshot. If a sync fails, the previous good data stays live.

**Keep the sheet layout.** The importer finds things by their labels: the board tabs, `Chairman:`, `Players`, the `Umpire | Details` table, `All TEAMS` / `All Match Updates` / `AWARDS` in the league tabs, `Tournament Name`, `Board Rankings`, `IOCF Cards`, `All Time Records`, `IOCF 2.0`. Adding rows (players, matches, leagues) is fine; renaming those labels or tabs needs an importer update.

**Major Tournament tabs** are found by name (`T20 World Cup 2026`, `IOCF EURO CUP`, `IOCF OCEANIA CUP`, `IOCF ASIA CUP`, `IOCF Associate Nations Cup`, `IOCF ODI WORLD CUP`, `WTC Matches`, `Emerging Talent League`, `Womens Global League`, `IOCF Lone Warrior`), or by a close match such as "Asia Cup 2026". Each tab is shown as the tables it contains, so no importer change is needed when rows or tables are added. The list is in `scripts/sync/tournaments.mjs`.

## Command Center (locked profile)

Real, server-side sign-in. Passwords are stored only as salted scrypt hashes in a Postgres database (Supabase); a signed-in browser holds nothing but an HttpOnly session cookie, and **every** permission is checked on the server for every request.

- **Accounts:** `IOCF-ADM-001` (Master Administrator) and `IOCF-BRD-001…026` (one chairman per board). A board account is tied to its board, so a chairman lands on their own dashboard and cannot open another board or any admin function.
- **Board dashboards:** one reusable dashboard, themed from `src/data/commandCenter/boards.json` (flag, three colours, landscape scene, mascot). Modules are listed in `modules.json`; add a module there and it appears on every dashboard (only modules marked `active` can be switched on).
- **Administrator:** a **Board Accounts** tile to set (or create) the username and password of every board's chairman right in the browser — passwords are hashed on the server and never shown again; saving signs that chairman out everywhere. Plus overview, recent activity, and per-board management — open/preview any dashboard (clearly marked as an administrator preview), activate/deactivate, edit the chairman, switch modules. Passwords are never displayed.
- **Protection:** rate limiting per IP + username and per IP, account lock after repeated failures, 8-hour sessions, ended immediately on deactivation or reset, CSRF protection, an audit log.

### Your credentials (already generated)

`npm run cc -- setup` creates the Master Administrator and the 26 chairman accounts and writes two files into `~/.iocf-command-center/` — **outside the project**, both private (mode `600`), never committed, never deployed, never reachable from the website:

- `IOCF_CREDENTIALS_PLAIN.csv` — **readable**: Account ID, Account Type, Board Name, Username, Password, Account Status. Open it, hand out the logins, and edit it whenever you want (below).
- `IOCF_PRIVATE_CREDENTIAL_REGISTER.csv` — the encrypted master register (Account ID, Account Type, Board Name, Username, **Encrypted Password**, Account Status, Created Date, Last Updated Date); `register.key` is its AES-256 key.

Delete the readable file when you no longer need it (`npm run cc -- export` rebuilds it from the register at any time).

**Managing logins from a private Google Sheet (optional):** keep the logins in a sheet with the headings `Board` (or `Country`), `Username`, `Password` and, if you like, `Status` (a row with no board is the Master Administrator). Put the sheet's link in `~/.iocf-command-center/env` as `CC_CREDENTIALS_SHEET_URL=…` — **never in the project** — then:

```bash
npm run cc -- sync-sheet --dry-run   # shows what would change, changes nothing
npm run cc -- sync-sheet             # creates / updates the accounts, re-encrypts the register, refreshes the credentials file
```

Only your computer reads the sheet. It hashes the passwords and stores the hashes; the website, Vercel and git never see the sheet or its link. Every row is checked first (boards must be among the 26, usernames unique, passwords 8+ characters), and a bad sheet changes nothing. The sheet holds readable passwords, so share it with as few people as possible; after syncing you can delete its Password column if you prefer.

**To change a login:** the simplest way is the **Board Accounts** tile in the Command Center (administrator). Your local files do not see changes made there, so `npm run cc -- verify` will flag them and `npm run cc -- record <board>` brings your register back in line. Or edit the username, password (12+ characters) or status (`active` / `inactive`) in `IOCF_CREDENTIALS_PLAIN.csv`, save, then run `npm run cc -- import`. It checks every row first, applies the changes, signs those accounts out, and re-encrypts the register.

### Putting it online (one-time)

1. **Create the tables.** Copy the schema (`pbcopy < server/command/schema.sql`), then in Supabase open **SQL Editor → New query**, paste, **Run**. (Row Level Security is on with no policies, so only the server's service-role key can reach these tables.)
2. **Connect from your computer.** `npm run cc -- connect --project <your-project-ref>` asks for the **service_role (secret) key** (hidden), tests it, saves it to `~/.iocf-command-center/env` (mode `600`), warns about any table that looks like it holds passwords, and uploads your accounts so the passwords you already have work online. Check with `npm run cc -- verify`.
3. **Give the hosting the same settings.** `npm run cc -- vercel` prints the three values (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COMMAND_CENTER_SESSION_SECRET`) on your terminal. Paste them into Vercel → Settings → Environment Variables (Production) — for Fly: `fly secrets set …` — then redeploy.

Until then the accounts live in a local store, and `npm run dev` already signs in against it.

| Command | What it does |
| --- | --- |
| `npm run cc -- setup [--show]` | Creates any missing accounts (safe to re-run); `--show` prints the new credentials once |
| `npm run cc -- record <board or username>` | After setting a login in the browser, note it in your encrypted register and credentials file (you type the password; it is checked first) |
| `npm run cc -- sync-sheet [--dry-run]` | Applies the logins in your private credentials sheet |
| `npm run cc -- export` / `import` | Writes the readable credentials file / applies your edits from it |
| `npm run cc -- reveal <board or username>` / `--all` | Decrypts passwords from the register and prints them on your terminal |
| `npm run cc -- reset <board or username> [--username <new>]` | New random password for one account (ends its sessions, updates both files) |
| `npm run cc -- push` | Uploads the accounts to Supabase |
| `npm run cc -- verify` | Checks that the register and the database agree |
| `npm run cc -- status [--sync]` | Lists accounts; `--sync` copies online activate/deactivate changes into the register |
| `npm run cc -- backup --out <folder>` | Encrypted backup of the register (keep `register.key` somewhere separate) |

`npm run cc:test` runs the backend self-test (138 checks) against a temporary store; it never touches your real data.

**Limits:** this is for the website. The Android/iOS apps load the site from the device, so a cookie-based sign-in will not carry over to them.

## Player statistics (CSV exports)

Per-player statistics come from STUMPS scorer exports kept in `All Assests/`:

| Folder | Command | Writes | Used by |
| --- | --- | --- | --- |
| `All  Season 1 Franchise League Stats/` | `npm run league-stats` | `src/data/leagueStats.json` | Franchise Leagues → team → player |
| `All 2026 Major Tournaments Stats/` | `npm run tournament-stats` | `src/data/tournamentStats.json` | Major Tournaments → 2026 → Player Statistics |

Run the command again after replacing or adding a CSV. Related settings:
- `SQUAD_ALIASES` in `src/data/leagueStats.ts` — pairs a scorer's spelling of a name with the squad sheet's, where the automatic matching cannot.
- `TEAM_FIXES` in `src/data/tournamentStats.ts` — maps a team name in an export to the right board.
- `ONLY_RUNS_OR_WICKETS` in `scripts/build-tournament-stats.mjs` — tournaments where only players with runs or wickets are kept (Lone Warrior).

## Other things you can edit

| To change… | Edit |
| --- | --- |
| Chairman portraits | Put the photos in `Image Assests/Chairman Pictures/`, then `npm run chairmen` (writes `public/chairmen/<board>.webp`) |
| Board Instagram accounts | `src/data/social.ts` |
| The IOCF Instagram button on the Main page | `INSTAGRAM_URL` in `src/components/IocfHome.tsx` |
| A player the sheet's roster misses | `extraPlayers` in `src/data/players.ts` (steps aside once the sheet lists them) |
| Player photos | `src/data/photos.ts` |
| The list of profiles, their names and colours | `viewerProfiles` in `src/data/portfolio.ts` |
| Major Tournament descriptions | `ABOUT` in `src/components/IocfTournaments.tsx` |
| The IOCF logo | Replace `IOCF logo.png` (transparent PNG), then `npm run images` (rebuilds the WebP logos and the share image in `public/assets/`) |

## Project layout

```
src/
  App.tsx                    opening → profile choice → the chosen profile
  data/
    store.ts                 loads the live dataset (API → json → bundled snapshot)
    boards.ts, players.ts    boards and players (+ small manual additions)
    leagues.ts, leagueStats.ts, franchise.ts      franchise leagues and their statistics
    tournaments.ts, tournamentStats.ts            major tournaments and their statistics
    social.ts, photos.ts, chairmanContent.ts      Instagram links, photos, chairman text
    commandCenter/           the 26 board themes, the module list, colour helpers
    commandApi.ts            client for the Command Center API
  components/
    IocfHome / IocfChairmen / IocfBoards / IocfPlayers /
    IocfUmpires / IocfLeagues / IocfTournaments / IocfCommandCenter   one file per profile
    command-center/          board dashboard, administrator dashboard, landscapes, mascots
    GlobalSearch, MyIocf, SiteFooter, ProfileSelector, OpeningSequence
scripts/
  sync/                      turns the sheet into the dataset (boards, leagues, tournaments, …)
  build-*.mjs                images, chairman portraits, league and tournament statistics
api/iocf-data.mjs            Vercel function: the sheet as JSON
api/command/[...path].mjs    Vercel function: the Command Center API (logic in server/command/)
server/serve.mjs             Fly.io / Docker server with scheduled re-sync
android/, ios/               Capacitor projects
```

**Stack:** React 18, TypeScript, Vite 6, Tailwind CSS 4, Framer Motion 11, Lenis, ExcelJS, Capacitor 8.

## Deploying

- **Vercel:** static site plus the `api/iocf-data` function (`vercel.json`).
- **Fly.io / Docker:** `Dockerfile` and `fly.toml` run `server/serve.mjs`, which serves the build and re-syncs the sheet on a timer.
- **Android / iOS:** `npm run cap:sync` builds and copies the site into the native projects; `npm run cap:android` / `npm run cap:ios` open them. In the native apps the data address is the deployed site's, set in `src/data/store.ts` (`SITE`).

## Accessibility

- `prefers-reduced-motion` is respected: smooth scrolling, the custom cursor, tilt and other effects turn off.
- Hover effects only run on devices with a precise pointer; touch devices get tap interactions.
- Overlays and the profile picker close with Esc; the opening sequence can be skipped with Enter or Esc.
