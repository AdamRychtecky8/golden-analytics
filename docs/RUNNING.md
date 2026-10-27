# Running the app

Requires **Node.js 20.19 or newer** (developed on Node 22). Check with `node -v`.

## Start it

```
npm install
npm run dev
```

`npm run dev` starts a local server and opens the app in your browser (usually at http://localhost:5173). It loads with the bundled synthetic sample and the "Store owner" persona, at Level 2.

Stop the server with `Ctrl+C` in the terminal.

## Run the tests

```
npm test
```

This runs every `*.test.ts` file once with Vitest:

- `src/profile.test.ts`: number and date parsing, type detection, missing counts, ranges, bins, and CSV loading errors.
- `src/chartRules.test.ts`: which chart each field combination gets, the numbers each chart would draw (sums, means, counts, empty periods, "Other" grouping), and a check that every chart renders in Vega.
- `src/state.test.ts`: back/forward history, the two-field limit, and that the user's text is never overwritten.

`npm run test:watch` reruns the tests whenever a file changes.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-checks everything, then builds a production version into `dist/` |
| `npm run preview` | Serves the `dist/` build locally, to check the production version |
| `npm run sample` | Regenerates `src/data/sample-sales-synthetic.csv` from `scripts/make-sample.mjs`. It's seeded, so the output is identical every time |

The build warns that one file is larger than 500 kB. That's the Vega charting library; it's expected and harmless for now.

## Loading your own data

Click **Load CSV** in the top bar. The file must be a clean, typed CSV (D-010):

- one header row, with unique, non-empty column names
- one row per record, every row with the same number of fields
- numbers written plainly (`1234.5`, not `$1,234.50`)
- dates in ISO format (`2025-03-14`, optionally with a time)

Empty cells are fine; they're counted as missing and reported under any chart that skips them. A file that breaks the structure rules is rejected with a message naming the lines at fault. Click **Use sample** to go back to the bundled data.
