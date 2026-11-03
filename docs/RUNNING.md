# Running Golden Standard

## Requirements

- **Node.js 20.19 or newer** (developed on Node 22): `node -v`
- **Python 3.9 or newer**, only to rebuild the demo data; no extra packages

## Install and run

```
npm install
npm run dev
```

The app opens at http://localhost:5173 with the Bookshop demo data (56,350 fictional book sales, dated 2193) and the Store owner persona. Stop it with `Ctrl+C`.

**Without an API key** (the default), everything works except typed questions: rules pick the highlighted question and the card uses its standard wording, each with one quiet line saying the AI is off.

**With a key:**

1. Copy `.env.example` to `.env`.
2. Set `ANTHROPIC_API_KEY`. `ANTHROPIC_MODEL` is optional (default `claude-haiku-5-5`).
3. Restart `npm run dev`; it reads `.env` only at start.

The AI then picks the highlight, may reword the card's talking points and questions (marked **AI**), and enables "Ask your own question". The key stays in `.env` (gitignored) and the server-side handlers in `api/`; the browser never sees it, and no request ever contains data rows. Answers are cached per dataset, persona, and slice, so revisiting costs nothing. `npm run preview` has no `/api` server and always uses the rules.

**Your own data:** Load CSV in the top bar. The file must be a clean CSV: one header row with unique names, numbers written plainly (`1234.5`), dates as ISO (`2025-03-14`). Empty cells are allowed and reported; a malformed file is rejected with the lines at fault. An upload has no dataset contract, so checks that need roles skip.

## Tests

```
npm test
```

Runs every `*.test.ts` with Vitest, including property tests on 200 generated datasets. No test calls the real API. `npm run build` type-checks and builds `dist/` (the warning about a file over 500 kB is expected: the Bookshop CSV, 7.9 MB, is bundled into the JavaScript, along with the Vega library).

## Evaluating typed questions

```
npm run eval:ask
```

Sends the cases in `docs/eval/ask-cases.json` (all but the offline-only ones, about 20) to the real model, one small request each, and prints a pass rate and every miss. It needs a key in `.env`, so it is not part of `npm test`. Each run is also saved to `.eval-runs/` (gitignored).

## Reports and data prep

| Command | What it does |
|---|---|
| `npm run cards:bookshop` | Prints every Bookshop menu card as text (rules only, no key) |
| `npm run options:bookshop` | Prints the menu, its findings, and each persona's highlight and reason |
| `npm run prep:bookshop` | Rebuilds `src/data/bookshop-sales.csv` and its contract `bookshop-sales.roles.json` from `data/raw/Bookshop.xlsx`, checking every join; how and why are in the comment at the top of `scripts/prepare-bookshop.py` |
| `npm run sample` | Regenerates the small synthetic CSV the tests use (seeded, identical every time) |

## Deploy

The repo deploys to Vercel as is; no `vercel.json` is needed. Vercel detects Vite, runs `npm run build`, serves `dist/`, and turns each file in `api/` into a function at `/api/<name>` (files starting with `_` are skipped, and `.vercelignore` leaves out the tests).

1. Import the GitHub repo as a new Vercel project. Keep the detected settings: framework Vite, build command `npm run build`, output directory `dist`.
2. Add `ANTHROPIC_API_KEY` under Environment Variables, either on the import screen or later in Settings (then redeploy; variables apply only to deployments made after they are added). Add `ANTHROPIC_MODEL` only if you want a different model.

Without a key, or with a wrong one, the deployed app behaves like the local one without a key: rules pick the highlight, the card keeps its standard wording, and typed questions show "AI is off" (no key) or "couldn't be reached" (a key the API rejects).
