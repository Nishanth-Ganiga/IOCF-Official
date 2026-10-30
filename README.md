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
| **Command Center** | A locked profile: Admin Login (full federation control) and Board Login (individual board access). Sections are added after sign-in |

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
| Command Center logins | `npm run account -- admin <username>` or `npm run account -- board <username> "<Board name>"`, then paste the printed line into `src/data/accounts.ts`. Only a salted hash is stored. This lock runs in the browser: it keeps casual visitors out, but is not server-side security |
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
  components/
    IocfHome / IocfChairmen / IocfBoards / IocfPlayers /
    IocfUmpires / IocfLeagues / IocfTournaments   one file per profile
    GlobalSearch, MyIocf, SiteFooter, ProfileSelector, OpeningSequence
scripts/
  sync/                      turns the sheet into the dataset (boards, leagues, tournaments, …)
  build-*.mjs                images, chairman portraits, league and tournament statistics
api/iocf-data.mjs            Vercel function: the sheet as JSON
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
