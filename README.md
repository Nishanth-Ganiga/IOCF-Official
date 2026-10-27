# IOCF — International Online Cricket Federation

A cinematic, streaming-inspired portfolio for **IOCF**: Full-Stack Developer and B.Tech AI & ML student.
Every section is an episode, every project is an Original, and the whole site plays like a series.

> A personal portfolio with a fictional streaming-platform look. It is not affiliated with Netflix or any other streaming service and uses none of their logos.

## Run it locally

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Production build:

```bash
npm run build
npm run preview
```

The static site is written to `dist/` and can be deployed as-is to Vercel, Netlify, GitHub Pages or any static host.

## Updating the content

**All content lives in one file: [`src/data/portfolio.ts`](src/data/portfolio.ts).** It was generated from the resume, and every component reads from it.

| To change… | Edit |
| --- | --- |
| Name, intro, email, LinkedIn, GitHub | `profile` |
| A project, or a new one | `projects` (add an object; it appears in Originals, the overlay, the resume sheet and the counts) |
| Achievements / certifications | `achievements`, `certifications` |
| Skills and their "where it's used" notes | `skillCategories`, `skillEvidence` |
| Seasons and episodes (My Journey) | `seasons` |
| Top 10 row | `topPicks` |
| ▶ Play Intro highlight reel | `introSlides` |
| Profile order (Recruiter / Developer / Creative) | `viewerProfiles` |
| Opening studio card text | `profile.originalLabel` |

**Resume:** replace `public/assets/Sushmita_Dasari_Resume.pdf`.

**Photo:** replace `IOCF logo.png` (transparent PNG), then run:

```bash
npm run images
```

This rebuilds the responsive WebP portraits and the social share image in `public/assets/`.

## What's inside

```
src/
  data/portfolio.ts        ← single source of truth (from the resume)
  App.tsx                  ← stages: opening → profile select → home; overlays
  components/
    OpeningSequence        ← black → studio card → IOCF → THE SERIES → portrait → ▶ PLAY
    ProfileSelector        ← "Who's watching?" (changes section order only)
    Navbar                 ← hide-on-scroll nav, profile switcher, mobile menu
    Hero                   ← billboard: parallax portrait, particles, light streaks, floating chips
    PlayIntro              ← ▶ Play Intro: zoom into portrait → highlight reel (pause, ← →, tap zones)
    ContinueWatching       ← cards with real "watched" progress bars
    About                  ← The Pilot
    Seasons / EpisodeCard  ← My Journey as seasons and episodes
    Originals / ProjectCard← pinned horizontal sequence on desktop, swipe rail on touch
    ProjectModal           ← full-screen project overlay with a shared-element transition
    TopPicks               ← Top 10-style row
    Skills                 ← skill genres; each card shows where the skill appears
    Achievements           ← award-poster cards + certification rail (links to credentials)
    ResumeViewer/ResumeModal ← designed resume sheet, PDF viewer, download
    FinalCTA               ← TO BE CONTINUED… + contact links
    CustomCursor, fx.tsx   ← cursor states, magnetic buttons, 3D tilt, text reveals, particles
  hooks/                   ← Lenis smooth scroll + scroll lock, media queries, watch progress
scripts/build-images.mjs   ← portrait/share-image pipeline (sharp)
```

**Stack:** React 18, TypeScript, Vite 6, Tailwind CSS 4, Framer Motion 11, Lenis.

## Accessibility and performance

- `prefers-reduced-motion` is respected: smooth scroll, the custom cursor, tilt, particles, grain and the pinned horizontal scroll turn off, and the opening jumps straight to its final frame.
- Hover effects only run on devices with a precise pointer. Touch devices get tap interactions and native swipe rails.
- The custom cursor appears only with a mouse or trackpad.
- Overlays close with Esc, and the highlight reel supports Space and the ← → keys.
- Portraits are responsive WebP files (25–90 KB). Overlays are code-split, and particles pause when they're off screen.

## Keyboard shortcuts

- **Opening:** Enter or Esc skips it.
- **Play Intro:** Space pauses, ← and → change slides, Esc closes.
- **Project and resume overlays:** Esc closes.


## Live data from Google Sheets

All boards, players, umpires, franchise leagues and the Main page tournament/Hall of Fame/council text come from one Google Sheet.

**Set up**
1. In the sheet: Share → General access → *Anyone with the link* → *Viewer*.
2. Put the sheet link in `iocf.config.json` (`"sheetUrl"`), or set `IOCF_SHEET_URL`.

**Run it**
- `npm run sync` — download the sheet and write `public/iocf-data.json` (used by `npm run dev`) and `src/data/snapshot.json` (the bundled offline fallback).
- `npm run start` — build the site and serve it. The server re-syncs on start-up and every `syncIntervalMinutes` (default 30); visitors get the new data on their next page load. `GET /api/status` shows the last sync and any error.
- `npm run sync -- --file "IOCF ALL BOARDS .xlsx"` — sync from a local Excel copy instead.

If a sync fails (sheet unshared, tab renamed, wrong shape) the previous good data stays live and the error appears in `/api/status`.

**Keep the sheet layout** — the importer finds things by their labels (board tabs named as today, `Chairman:`, `Players`, the `Umpire | Details` table, `All TEAMS` / `All Match Updates` / `AWARDS` in the league tabs, the `Tournament Name` table, `Board Rankings`, `IOCF Cards`, `All Time Records`, `IOCF 2.0`). Adding players, matches or leagues' rows is fine; renaming those labels or tabs needs an importer update.
