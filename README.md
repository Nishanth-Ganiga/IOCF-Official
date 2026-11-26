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
| **Major Tournaments** | T20 World Cup, Euro Cup, Oceania Cup, Asia Cup, Associate Nations Cup, ODI World Cup, World Test Championship, Emerging Talents League, Women's Global League, IOCF Origins Championship and IOCF Lone Warrior — each with a 2026 edition: every table from its sheet, plus Board → Player statistics |
| **Unlimited Fun** | Six games made from the live data, each in its own tile: Digit Cricket (batting, bowling and a Super Over with a streak), Guess the Player (clues from the real statistics; fewer clues, more points), Daily IOCF Quiz (five questions, the same for everyone each day, changing at midnight IST), Head-to-Head Duel (two boards or two players side by side), Higher or Lower (with a streak) and share cards. Best scores are kept only on the visitor's own device |
| **Rankings** | Twelve tiles, each with its own page: board rankings (Overall and every format, with movement), board credits, series rankings, batting, bowling, fielding and match-award rankings (board cricket and franchise leagues separately, by format), umpires, franchise league tables, Major Tournament titles, Hall of Fame and councils. Worked out from the live data each time, so they stay current |
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

**Series statistics.** When a series is finished the administrator uploads the scorer's player-statistics CSV (the same export used for the tournaments) from the Announced Series tile — while recording the result, or later; earlier series from the IOCF records have the same upload under *IOCF records*, where their format can also be set. A whole folder of exports can be matched to the earlier series and uploaded at once with `npm run cc -- series-stats [--dry-run]` (it reports anything it cannot match with certainty instead of guessing). Every player is then counted (exact name + board) in Series History, the Player Stats page and the player's profile.

**Earlier series** (before the Command Center) are read from the `Series Matches` tab: the `Completed Series` table (grouped under month rows) and the `Upcoming Series` table, found by their headings and column names (`Series Name`, `Hosting Board`, `Opponents`, `Dates`, `Winners`, `Runners`, `Series Result`, `Bet Amount`, `Format`). They appear in the Command Center under Series History and Upcoming Series, marked as IOCF records. New series are announced on the site only.

**Major Tournament tabs** are found by name (`T20 World Cup 2026`, `IOCF EURO CUP`, `IOCF OCEANIA CUP`, `IOCF ASIA CUP`, `IOCF Associate Nations Cup`, `IOCF ODI WORLD CUP`, `WTC Matches`, `Emerging Talent League`, `Womens Global League`, `IOCF Lone Warrior`, `IOCF Origins Championship`), or by a close match such as "Asia Cup 2026". Each tab is shown as the tables it contains, so no importer change is needed when rows or tables are added. The list is in `scripts/sync/tournaments.mjs`.

## Command Center (locked profile)

A locked profile with real server-side sign-in (one administrator, 26 board chairmen). Logins live in a private Supabase table; the site never holds a password. The maintainer's tooling is in `scripts/command-center/` (`npm run cc`); no credentials are ever stored in this repository.

**Build a Stadium.** A board chairman opens *Build a Stadium*, gives a stadium name and a place in the home country, and sends the request. The level (always 3) and the cost (30,000 credits) are fixed by the server: the form shows them but they cannot be changed, and anything the browser sends for them is ignored. The administrator sees the requests under *Stadium Requests*: **Accept** adds the stadium to the board's list, so it can be chosen for a series (the system does not touch credits: the administrator deducts the 30,000 in the sheet by hand); **Decline** removes the request from the queue and shows the board a "not accepted" message. Every request and decision is a row in the `command_stadiums` table in Supabase (`server/command/stadiums.sql`, also part of `schema.sql`; run it once in the SQL Editor). The old stadium sheet (`All Assests/All Stadiums`, built by `npm run stadiums`) is only the list from before this feature; new stadiums come from this process, not from a CSV.

## The private mirror sheet

A second Google Sheet that holds **everything on the website**, laid out like the IOCF workbook:
- an **Overview** tab (what the sheet is, the colour legend, a list of every tab with its size);
- **one tab per board** (Afghanistan, Australia, … Zimbabwe), each in that board's own colours (taken from its flag colours: dark banner, coloured section bars, light table headers, pale alternating rows) with the board's chairman, CEO and credits, its rankings and achievements, its players with their awards, its umpires with their assignments, its stadiums and stadium requests, its series (the IOCF records and the ones announced on the site), its franchise-league squad entries and its credit changes;
- then the **all-board tabs** in the workbook's purple, one row per record, for searching and filtering: boards, players and their achievements, umpires, franchise leagues and squads, tournament tables, series records, stadiums, credits, board accounts, the uploaded player statistics and the activity log. It is rewritten from the website's data, so it always matches the site; it is a backup and a place to look at the data, not an input (edit the IOCF sheet or the Command Center, not the mirror). Passwords and password hashes are never written.

It stays private: share it with **yourself and the robot account only** (never "anyone with the link").

One-time setup:
1. Google Cloud Console → create a project → **APIs & Services → Enable APIs → Google Sheets API**.
2. **IAM & Admin → Service Accounts → Create** (any name, e.g. `iocf-mirror`; no roles needed) → open it → **Keys → Add key → JSON**. A key file downloads. Keep it secret; it is git-ignored (`*service-account*.json`).
3. Open the mirror sheet → **Share** → add the service account's e-mail (`…@….iam.gserviceaccount.com`) as **Editor**. Share it with nobody else.
4. Give the tool the key and the sheet:
   - on your computer: add these two lines to `~/.iocf-command-center/env` (then `npm run mirror`):
     `GOOGLE_SERVICE_ACCOUNT_JSON=<the whole key file on one line, or its base64>` and `MIRROR_SHEET_ID=<the sheet's link or id>`
   - for the live site's **Backup Sheet** button (Vercel) and the Fly server: add the same two as environment variables
   - for the automatic job (`docs/mirror-workflow.yml`, every 15 minutes and after every push; to switch it on, copy it to `.github/workflows/mirror.yml` using GitHub's website — a push from the command line needs a token with the `workflow` scope): add `GOOGLE_SERVICE_ACCOUNT_JSON`, `MIRROR_SHEET_ID`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repository secrets (Settings → Secrets and variables → Actions)

Updating it:
- automatically every 15 minutes (the GitHub job), and a minute after any change when the site runs on the Fly server;
- on demand: **Command Center → Backup Sheet → Update now**;
- from a terminal: `npm run mirror` (`-- --dry-run` shows what would be written without a Google key; `-- --csv <folder>` also saves every tab as a CSV).

**Squad Announcement (series).** When a board announces a series it also names its squad, one player at a time from its registered players; the **Send** button stays disabled until the squad is the right size. The board that accepts a series names its own squad too, and **Accept** stays disabled until it is complete (the server checks both). Sizes: Club 4 and 5 overs 7–8 players, Club 6, 7 and 8 overs 9–10, T10 11–12, T20 and 100 13–15, ODI 15–18, Test and L4I 15–20 (`src/data/commandCenter/squads.mjs`). The squads are kept on the series (`command_series.squads`; run the latest `series.sql` once) and shown on the series card. Each squad can also name a **captain** and a **vice-captain** (optional, two different squad players; the C / VC buttons beside each player), shown as (C) / (VC) on the card. A player already in the squad of another series that is on at the same time (live, no result yet, last match date not passed, and its dates overlap) is not offered and is refused by the server; a series on other days, or one that has ended, does not block him.

## IOCF 2.0 – Official Player Salary Program (PSP 2027)

A section of the Command Center (admin: **IOCF 2.0**; board: the **IOCF 2.0** module). Starting month: January 2027.

- **Admin** (Overview · Players Salary · Council & Board Assignment · Monthly Rankings · Salary Requests · Salary Records · Salary Settings): enables salary months (nothing can be submitted until the month is enabled), seats boards in the four councils by hand (never automatic), ranks each council's boards for a month and publishes the rankings (the board's allocation is the official funding of that council and rank), sets the salary distribution, reviews each board's request and approves or declines it, and sees every verified salary record.
- **Board chairman** (Players Salary · Monthly Salary History · Player Salary Records): sees the council, rank and allocation, chooses players in the six categories, sees the automatically calculated salaries, and submits to IOCF. A declined request is corrected and resubmitted (a new version; the old one is kept).
- **Money**: whole credits only. Council funding is the official table (1.20 crore a month, 14.40 crore a year) and cannot be edited by a board. IOCF has not set salaries per category, so there are none in the code: the administrator enters the **share of the allocation each category gets (it must total 100%)** in Salary Settings; players of a category share its part equally in multiples of 100; the rounding balance (and the part of a category with no players) goes to the Special Contract player so the whole allocation is used. Boards cannot submit until this is configured.
- **Approval** credits virtual salaries: one transaction and one verified record per player, each inserted once under a fixed reference (`PSP-202701-<board>-<player>`), so repeating the approval never credits twice, and approved records are never changed. Board Credits (the sheet) are not touched.
- **Data**: seven tables, `server/command/psp.sql` (also in `schema.sql`). Run it once in the Supabase SQL Editor. The rules are in `src/data/commandCenter/psp.mjs` (shared by server and browser), the server in `server/command/pspRoutes.mjs`.

## Player statistics (CSV exports)

Per-player statistics come from STUMPS scorer exports kept in `All Assests/`:

| Folder | Command | Writes | Used by |
| --- | --- | --- | --- |
| `All  Season 1 Franchise League Stats/` | `npm run league-stats` | `src/data/leagueStats.json` | Franchise Leagues → team → player |
| `All 2026 Major Tournaments Stats/` (empty: the administrator uploads these CSVs in the Command Center) | `npm run tournament-stats` | `src/data/tournamentStats.json` | Major Tournaments → 2026 → Player Statistics |

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
api/command-center.mjs       Vercel function: the Command Center API (logic in server/command/)
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

### Keeping the sign-in off the public website (optional)

Browsers' phishing checks can flag a public site that contains a username and password form. To avoid that, run two deployments of this repository: the public site built **without** the Command Center, and a separate staff site with it.

- **Public project:** set `VITE_COMMAND_CENTER` = `off` and `COMMAND_CENTER_SIGNIN` = `off` (Vercel → Settings → Environment Variables), then redeploy. The Command Center profile, its login page and the login endpoint do not exist there.
- **Staff project** (a second Vercel project from the same repository, e.g. `iocf-staff`): leave both unset, and give it the same `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `COMMAND_CENTER_SESSION_SECRET`. Chairmen and administrators sign in there.

With nothing set, everything works as before (one site, Command Center included).

### Rank movement

Every ranking in the Rankings profile has a **Move** column (▲ up, ▼ down, NEW). The server re-works out all rankings from the live data at most every 10 minutes (when someone opens a ranking), compares them with the last ranks it stored (table `command_rank_state`, created by `server/command/rank.sql`), and records when each entry's rank last changed. A move shows for **10 days** and then disappears. The first run only stores a baseline, so nothing shows as moved until something changes. Moves are tracked for the top 100 of each ranking.

