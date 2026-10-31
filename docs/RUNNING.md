# Running the app

Requires **Node.js 20.19 or newer** (developed on Node 22). Check with `node -v`. Rebuilding the Bookshop data (`npm run prep:bookshop`) also needs **Python 3.9 or newer** (`python3 --version`), with no extra packages; running the app doesn't.

## Start it

```
npm install
npm run dev
```

`npm run dev` starts a local server and opens the app in your browser (usually at http://localhost:5173). It loads with the Bookshop demo data (56,350 fictional book sales, dated in the year 2193) and the "Store owner" persona. Loading takes about a second: the whole file is parsed and profiled when the page opens.

Stop the server with `Ctrl+C` in the terminal.

## What you see

The layout follows `docs/wireframe-phase4.svg`:

- **Top bar:** the dataset, the persona chip (its color and initial; click to switch or build your own), Load CSV, Use demo data (after loading your own file), and back/forward.
- **Map**, under the top bar: collapsed to one line showing the path to the current question and how many questions you've explored. "Expand" shows the whole tree; click any box to go back to it.
- **Menu rail**, on the left: the questions for the current slice of the data, the highlighted one first with its reason, then "Ask your own question" (needs an API key) and "Build my own chart" at the bottom.
- **Card**, on the right: the question, its chart (the group the headline is about in orange; click a bar to go deeper into that group), then Key talking points, Caution around these, If they ask, and What this data can't tell you. Every line is editable: click it, type, click away. Your words stay, even if you switch persona or come back later.

On the first screen, and right after going deeper, no question is picked yet: the card shows a **Preview** of the highlighted question with "Use this question".

## The AI highlight: with or without an API key

The app works either way.

**Without a key** (the default): rules pick the highlighted question, and one quiet line under the menu says "AI highlighting is off (no API key), so rules picked this." The card uses its standard wording, with a similar line at the bottom.

**With a key:**

1. Get an API key from the Anthropic Console (console.anthropic.com).
2. In the project folder, copy `.env.example` to a new file named `.env`:
   ```
   cp .env.example .env
   ```
3. Open `.env` and replace `your-anthropic-api-key-here` with your key. Optionally set `ANTHROPIC_MODEL` (default: `claude-haiku-5-5`).
4. Restart `npm run dev`. The dev server reads `.env` only when it starts.

The AI then picks the highlight among the questions that passed the checks and writes the one-line reason, marked **AI**. It may also reword the card's talking points and questions for your persona, marked **AI**; the cautions and the can't-tell line always keep their standard wording. If its answer fails a check (a question that isn't eligible, a digit in the reason, a reason over 140 characters), or the call fails, rules pick and the notice says why.

**Where the key lives:** only in `.env` (gitignored, never committed) and in the server-side handlers in `api/`. The browser never sees it: it calls `/api/highlight` and `/api/card` on the dev server, which call Anthropic. Each request sends only the data profile (column names, types, ranges, top values, missing counts), the persona, and either the eligible questions with their caveats or the card's wording templates and the facts they use. It never sends rows.

**Ask your own question** (with a key): type a question and press Ask. The AI translates it into a chart; code checks it and shows it in plain words with Use this / Cancel. Nothing is added to the map until you click Use this. Questions about causes or the future are reframed to what the data can show; questions the data can't answer are declined with the reason.

**Cost:** one small highlight request per dataset, persona, and slice, one small card request per question you open (per persona), and one small request per typed question. Going back, jumping in the map, and revisiting reuse the cached answers.

`npm run preview` and the plain `dist/` build have no server behind `/api`, so they always use the rules. The handlers are written as Vercel serverless functions (`api/`), but nothing is deployed yet.

## Run the tests

```
npm test
```

This runs every `*.test.ts` file once with Vitest. The main ones:

- `src/flow.test.ts`: the tree: branching keeps every node, back/forward follow visit order, a persona switch keeps the view, go deeper adds one filter and stops at 3.
- `src/mapLayout.test.ts`: map positions per depth, the current path never folded, "+N" counts.
- `src/options.test.ts`, `src/highlight.test.ts`: the menu (for the whole data and for a slice), repairs, the highlight per persona, every AI fallback, the cache.
- `src/checks.test.ts`, `src/checks.fixtures.test.ts`: every check on the Bookshop data and on synthetic fixtures.
- `src/generality.test.ts`: invariants on 200 generated datasets plus degenerate ones.
- `src/noBookshop.test.ts`: no Bookshop column names or values in app code.
- `src/profile.test.ts`, `src/chartRules.test.ts`, `src/paths.test.ts`: parsing, chart rules, filtered charts.
- `src/card.test.ts`, `src/cardAi.test.ts`: the card's routing, the four Bookshop cards, the headline rule on generated datasets, and every AI fallback.
- `src/ask.test.ts`: every eval case's faked AI reply through code's validation and guard, the guard words, every invalid chart, unreadable replies, and what the AI is sent.
- `api/highlight.test.ts`, `api/card.test.ts`, `api/ask.test.ts`: the server handlers, with the Anthropic API faked.

No test calls the real API.

`npm run test:watch` reruns the tests whenever a file changes.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-checks everything, then builds a production version into `dist/` |
| `npm run preview` | Serves the `dist/` build locally, to check the production version |
| `npm run prep:bookshop` | Rebuilds `src/data/bookshop-sales.csv` from `data/raw/Bookshop.xlsx` (see below) |
| `npm run options:bookshop` | Prints the Bookshop options menu (each option's question, findings, and whether it is eligible) and each persona's highlight and reason, using the rules (no API key needed), then every sentence the rules can produce (each purpose × kind × facet, the repair lines, and "best place to start") filled in with Bookshop values |
| `npm run cards:bookshop` | Prints Bookshop cards as text (every menu question, plus one inside a slice), with the standard wording, for reading it all at once |
| `npm run eval:ask` | Runs the 26 typed-question cases in `docs/eval/ask-cases.json` against the real model and prints a pass rate and every miss. Needs `ANTHROPIC_API_KEY` in `.env`; costs about 20 small calls per run, so it is not part of `npm test` |
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

It reads Sales Q1–Q4 and joins each sale to Edition (by ISBN), Book (by BookID), Info (by BookID1 + BookID2, since that sheet splits the ID across two columns), Author (by AuthID), Publisher (by PubID), and Series (by Info's SeriesID, when the book has one). It also reads the Award sheet's titles. It writes `src/data/bookshop-sales.csv` with one row per item sold: sale date (ISO), title, genre, format, publisher, author country, price, discount (empty = 0), revenue = price × (1 − discount), rounded to the cent, author (first + last name), award winner (`yes` if the title is in the Award sheet, else `no`), series (empty if the book isn't in one), and book id.

It also writes `src/data/bookshop-sales.roles.json`, the dataset contract: what one row is called ("item sold" / "items sold"), and for each column a role (money, price, rate, date, category, entity, flag, or id) plus, for category and entity columns, an optional facet (offering, source, or place). The checks can use it; the app doesn't pass it to them yet.

It checks as it goes and stops with an error if any join doesn't match (including an Award title not in Book, or a SeriesID not in Series), a lookup key appears twice, an author has no first or last name, a price or discount is invalid, the roles don't name exactly the CSV's columns, or the total isn't the expected 56,350 rows. Empty series values are reported on their own line, since they mean "not in a series". The Publisher sheet's Marketing Spend and the Ratings sheet are not included; the reason is in the comment at the top of the script. It prints row counts for each quarter. It also lists two ItemIDs that each appear on two different orders; those rows are kept (see DECISIONS D-048). Running it twice gives an identical file. Every step is documented in the comment at the top of `scripts/prepare-bookshop.py`.
