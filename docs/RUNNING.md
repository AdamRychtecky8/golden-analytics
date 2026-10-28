# Running the app

Requires **Node.js 20.19 or newer** (developed on Node 22). Check with `node -v`. Rebuilding the Bookshop data (`npm run prep:bookshop`) also needs **Python 3.9 or newer** (`python3 --version`), with no extra packages; running the app doesn't.

## Start it

```
npm install
npm run dev
```

`npm run dev` starts a local server and opens the app in your browser (usually at http://localhost:5173). It loads with the Bookshop demo data (56,350 fictional book sales, dated in the year 2193) and the "Store owner" persona, at Level 2. Loading takes about a second: the whole file is parsed and profiled when the page opens.

Stop the server with `Ctrl+C` in the terminal.

## AI suggestions (Level 2): with or without an API key

Level 2 works either way.

**Without a key** (the default): Level 2 shows three paths suggested by rules, each tagged **Rules**, with one quiet line saying "AI suggestions are off (no API key)". Everything else, including go deeper, the breadcrumb, "Use this", and back/forward, works the same.

**With a key:**

1. Get an API key from the Anthropic Console (console.anthropic.com).
2. In the project folder, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
3. Open `.env` and replace `your-anthropic-api-key-here` with your key. Optionally set `ANTHROPIC_MODEL` (default: `claude-haiku-5-5`).
4. Restart `npm run dev`. The dev server reads `.env` only when it starts.

Level 2 then opens with paths tagged **AI**. If some AI paths fail the checks, rules fill the gaps and a notice says so. If the call fails (bad key, no network, timeout), the paths come from rules and the notice says the AI couldn't be reached.

**Where the key lives:** only in `.env` (gitignored, never committed) and in the server-side handler `api/suggest.ts`. The browser never sees it: it calls `/api/suggest` on the dev server, which calls Anthropic. Each AI request sends only the data profile (column names, types, ranges, top values, missing counts), the persona, and the parent path. It never sends rows.

**Cost:** one request each time the app opens, when you switch persona, and when you go deeper on a new path. Revisiting a branch, back/forward, and moving the slider reuse cached answers.

`npm run preview` and the plain `dist/` build have no server behind `/api`, so they always show rule-based paths. The handler is written as a Vercel serverless function (`api/`), but nothing is deployed yet.

## Run the tests

```
npm test
```

This runs every `*.test.ts` file once with Vitest:

- `src/profile.test.ts`: number and date parsing, type detection, missing counts, ranges, bins, and CSV loading errors.
- `src/chartRules.test.ts`: which chart each field combination gets, the numbers each chart would draw (sums, means, counts, empty periods, "Other" grouping), and a check that every chart renders in Vega.
- `src/state.test.ts`: back/forward history, the two-field limit, that the user's text is never overwritten, and Level 2's go deeper, breadcrumb jumps, "use this", and persona changes.
- `src/paths.test.ts`: the path validator (bad fields, bad filters, duplicate kinds, repeats of the parent), row filtering, filtered charts, and what is sent to the AI.
- `src/fallbackPaths.test.ts`: the rule-based paths for every persona, the outlier finder, and go deeper two levels down.
- `src/suggest.test.ts`: how the browser combines AI and rule paths, with the network faked (no key, errors, invalid answers).
- `api/suggest.test.ts`: the server handler, with the Anthropic API faked.

No test calls the real API.

`npm run test:watch` reruns the tests whenever a file changes.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-checks everything, then builds a production version into `dist/` |
| `npm run preview` | Serves the `dist/` build locally, to check the production version |
| `npm run prep:bookshop` | Rebuilds `src/data/bookshop-sales.csv` from `data/raw/Bookshop.xlsx` (see below) |
| `npm run sample` | Regenerates `src/data/sample-sales-synthetic.csv` from `scripts/make-sample.mjs`. It's seeded, so the output is identical every time. The tests use this file; the app no longer shows it |

The build warns that one file is larger than 500 kB. That's the Vega charting library; it's expected and harmless for now.

## Loading your own data

Click **Load CSV** in the top bar. The file must be a clean, typed CSV (D-010):

- one header row, with unique, non-empty column names
- one row per record, every row with the same number of fields
- numbers written plainly (`1234.5`, not `$1,234.50`)
- dates in ISO format (`2025-03-14`, optionally with a time)

Empty cells are fine; they're counted as missing and reported under any chart that skips them. A file that breaks the structure rules is rejected with a message naming the lines at fault. Click **Use demo data** to go back to the Bookshop data.

## The Bookshop demo data: how it's made

The raw workbook is `data/raw/Bookshop.xlsx` (fictional data: a bookshop's editions, books, authors, publishers, and four sheets of sales). The app needs one clean CSV, so a prep script joins it once:

```
npm run prep:bookshop
```

It reads Sales Q1–Q4 and joins each sale to Edition (by ISBN), Book (by BookID), Info (by BookID1 + BookID2, since that sheet splits the ID across two columns), Author (by AuthID), and Publisher (by PubID). It writes `src/data/bookshop-sales.csv` with one row per item sold: sale date (ISO), title, genre, format, publisher, author country, price, discount (empty = 0), revenue = price × (1 − discount), rounded to the cent.

It checks as it goes and stops with an error if any join doesn't match, a lookup key appears twice, a price or discount is invalid, or the total isn't the expected 56,350 rows. It prints row counts for each quarter. It also lists two ItemIDs that each appear on two different orders; those rows are kept (see DECISIONS D-048). Running it twice gives an identical file. Every step is documented in the comment at the top of `scripts/prepare-bookshop.py`.
