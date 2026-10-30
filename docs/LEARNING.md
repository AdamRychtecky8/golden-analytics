# LEARNING.md: reading the code

A study guide for the code Claude Code wrote in Phases 1–3. The goal is reading literacy: enough to explain and defend every file. Read top to bottom the first time; after that, use it as a map. Phase 2 (Level 2, the AI) has its own architecture section (§2); Phase 3 (measures, checks, Level 3) has §3. Each phase has its own pattern list in §5.

Links point to the first place each idea appears. Line numbers are as of the commit that added them and may drift.

---

## 1. Architecture: how a CSV becomes a story card

```
 CSV text
    │  loadCsv.ts      parseCsv(): Papa Parse → rows of strings, or a list of errors
    ▼
 Dataset { columns, rows }                       (lives in App's useState, not in history)
    │  profile.ts      profileDataset(): type, range, missing, bins for each column
    ▼
 DataProfile                                      (recomputed only when the dataset changes)
    │  chartRules.ts   chooseRule(field types) → which chart
    │                  buildChart(fields, rows, options) → computed numbers + Vega-Lite spec
    ▼
 ChartResult { title, spec, notes }
    │  Chart.tsx       hands the spec to Vega, which draws it as SVG
    ▼
 Pixels on screen
```

Underneath all of this, **`aggregate.ts`** does the low-level math: parsing numbers and dates, binning, time buckets, sum/mean. Every number on screen comes from those functions, never from inside Vega (D-019). That's why the tests can check the exact sums a chart will show.

**State is separate from data.** `state.ts` holds what the user has done: slider level, selected fields, sum/mean, persona, story card. Each user action becomes an `Action` object, the reducer turns it into a new `Snapshot`, and the old snapshot goes onto the `past` stack. Back/forward just move snapshots between stacks.

**The UI is a tree of components** that receive state as props and report clicks by calling callbacks that `dispatch` actions:

```
App                       owns: history (useReducer), dataset (useState), profile (useMemo)
├── TopBar                Load CSV · Use demo data · PersonaPicker · Back/Forward
├── Slider                level 0–3 → dispatch setLevel
├── AssistLayer           scrolls to the current level's panel
│   ├── StoryLevel (3)    the drafted story, facts used, Try another angle · Use draft (Phase 3, see §3)
│   ├── SuggestLevel (2)  persona · breadcrumb · 3 path cards (Phase 2, see §2)
│   ├── MapLevel (1)      FieldCards · chart ideas · ChartPreview
│   └── ExploreLevel (0)  field chips · ChartPreview
└── StoryCard             title · Chart (clickable) · takeaway
```

Data only flows **down** (as props) and events only flow **up** (as callbacks). No component changes state directly; they all go through `dispatch`, so every change passes through one function and can be undone.

**Why the logic files have no React in them:** `aggregate`, `profile`, `chartRules`, `state`, and `personas` are plain functions: input in, output out, nothing else touched. That makes them testable without a browser, and in Phase 2 the AI can plug in by *choosing* fields and questions, then handing them to the same `buildChart`. The numbers still come from code.

---

## 2. The AI architecture (Phase 2)

The rule from D-011, in one line: **the AI chooses what to look at; code computes what is shown.** Here is one Level 2 request, start to finish:

```
 Browser                                   Server (dev server now, Vercel later)       Anthropic
 ───────                                   ─────────────────────────────────────       ─────────
 useSuggestions: is this branch cached?
   no → loadSuggestions()
          buildRequest(): profile summary,
          persona, parent path. NO rows.
          POST /api/suggest  ───────────►  suggest(): key set? request well-formed?
                                           copy only known fields into the prompt
                                           messages.create (JSON schema)  ──────────►  picks 3 questions
                                           ◄──────────────────────────────────────────  {"paths": [...]}
                                           parse JSON; any failure → error response
          ◄───────────────────────────────  { ok, paths } or { ok: false, reason }
          validatePaths(AI paths)          (code checks every field against the real data)
          validatePaths(rule paths, top-up) (same checks; kinds already shown are skipped)
          finishPaths(): ids p1, p1.2 …, source 'ai' | 'rules'
   cache it under dataset|persona|parent
 SuggestLevel draws each path:
   chartForView() → filterRows() → buildChart()   ← the same function Levels 0/1 use
```

Four things make this trustworthy:

1. **The key never reaches the browser.** It is read from `process.env` inside [api/suggest.ts](../api/suggest.ts), which only ever runs on a server. Vite exposes only `VITE_`-prefixed variables to browser code, and the build output was checked for SDK or key references (none).
2. **The AI never sees rows.** The browser sends a profile summary ([paths.ts:62](../src/paths.ts#L62)); the server then copies only named fields out of the request ([suggest.ts:109](../api/suggest.ts#L109)), so even a buggy browser couldn't smuggle rows into the prompt. Tests check both sides.
3. **Nothing the AI says is trusted until code checks it.** `validatePaths` takes `unknown` and drops anything that names a missing column, fits no chart rule, filters on a value that never occurs, repeats a kind, or repeats the parent ([paths.ts:161](../src/paths.ts#L161)).
4. **The AI is optional.** Every failure, from no key and network errors to timeouts, bad JSON, and invalid paths, ends with rule-based paths and one quiet notice. The fallback goes through the same validator, so it meets the same bar.

**Why the server and browser share types but not code.** `api/suggest.ts` uses `import type` from `src/paths.ts`. Type imports vanish when compiled, so the serverless function never loads browser code and the browser bundle never loads the SDK. The cost is that the five path kinds are written twice; `satisfies` plus a test keep the copies in sync.

**Where the persona matters.** The server adds one line of guidance per purpose ("finding problems to fix → lead with outliers"). The rule-based fallback follows the same idea as an exact order of kinds (`KIND_ORDER` in [fallbackPaths.ts:14](../src/fallbackPaths.ts#L14)). Same intent, but one is advice to a model and the other is a rule code follows exactly.

---

## 3. Measures, checks, and stories (Phase 3)

### Measure semantics: some numbers can't be added up

A sum is only meaningful for quantities that pile up: revenue, units, hours. Adding up the price of every sale gives a big, confident number that describes nothing; so does adding up discount rates or ages. The profiler now classifies every number column as **additive** or **average only**, from its name ([profile.ts:71](../src/profile.ts#L71); the word lists and their order of precedence are in the comments above it). An unknown name is average only, because a mean is always a true statement and a wrong sum isn't.

One function enforces it everywhere: `effectiveAggregate` ([chartRules.ts:105](../src/chartRules.ts#L105)) turns a requested sum of an average-only number into a mean. `buildChart` and `chartTitle` call it, so no chart or title can say "Sum of price". On top of that, the sum button is disabled, the validator rejects AI paths that sum one, the rules prefer additive measures, and the AI is told each column's kind.

### "Is this really an insight?" checks

A ranking can be true and still mislead. [checks.ts](../src/checks.ts) runs six checks on every path's chart and returns what they find as **findings**. The app shows them as notes labeled **Check**, never as AI:

| Check | Fires when | Why it matters |
|---|---|---|
| Price/mix | categories are ranked by a sum of money, and the #1 by money isn't the #1 by records (or a top group moves 2+ places) | Hardcover tops revenue with 11,720 sales; mass-market paperback sells 26,881. Price, not volume, made the ranking. "View by count" shows the other view. |
| Small group | a shown group has fewer than 30 records | A mean or share of a handful of records swings with each new one. |
| Concentration | the top group holds 40% or more of the total | The chart is mostly about one group; "the rest" may deserve its own look. |
| Driven by one entity | one author or title holds 50% or more of the top group (misleading if the group loses first place without it) | SciFi/Fantasy leads revenue, but Bianca Thompson is 79% of it; without her rows, SciFi/Fantasy ranks 4th. Needs a roles file (D-060, D-061). |
| Fragile lead | first place is less than 10% ahead of second, or a smaller entity (under half the group) tips it | Hardcover is only 7.2% ahead of mass-market paperback; "no" leads "yes" by 12% in items sold, but without Carolyn Segal it ranks 2nd (D-061). |
| Single cycle | a trend's dates span one year or less | Each season appears once, so a seasonal high can't be told apart from growth. Every Bookshop trend gets it (2193 only) (D-067). |

Every finding has a **severity**. *Misleading* means the naive reading is wrong: the #1 changes under mix, the top group is small, or the top group's lead is one entity. *Caveat* means it's true but worth saying. Each finding also carries **evidence**, the numbers behind its sentence (ranks, shares, record counts), so later phases can phrase it with facts and slots. A check whose preconditions aren't met is **skipped** with a reason, which tests and logs can read but the user never sees (D-059).

The roles file ([roles.ts](../src/roles.ts)) is the **dataset contract**: each column's role, a facet for categories (offering, source, place), and what one row is called (`rowNoun`, "item sold" / "items sold"). With roles, only a `money` column can be summed (`withRoleMeasures`), mix only runs on a column with the `money` role, the entity check knows which columns are authors or titles, and `id` columns are never checked. An uploaded CSV has no roles, so mix falls back to guessing money from the column name and the entity check skips. The app passes no roles yet (D-059).

The thresholds are named constants with their reasoning ([checks.ts:14](../src/checks.ts#L14)). The numbers behind both the checks and Level 3's facts come from one place, `groupView` ([groups.ts:32](../src/groups.ts#L32)), which groups rows exactly the way the chart does.

### Facts and slots: why the AI may not write digits

Level 3 drafts a story card's title and takeaway. The risk with any AI-written summary is a number that sounds right but was never computed: a rounded share, a remembered figure, a "nearly double". So the AI doesn't write numbers at all.

```
 rows ──► computeFacts()  ──►  facts: [{ id: "top_share", label: "Hardcover's share of all revenue", display: "38%" }, …]
                                  │
                                  ├──► sent to /api/story (with the profile; never rows)
                                  │       AI returns: title    "{top_item} leads {measure} by {group_field}"
                                  │                   takeaway "{top_item} brings in {top_share} of {measure}."
                                  ▼
 fillTemplate():  every {slot} must be a fact id · no digit anywhere outside a slot · word limits
                  pass → slots replaced by the facts' display values
                  fail → ruleStory(): rule templates over the same facts, labeled "Rules"
```

The digit rule ([templates.ts:25](../src/templates.ts#L25)) is what makes this trustworthy: once the slots are taken out, whatever is left is the AI's own wording, and if it contains a single digit the whole draft is rejected. Every number a reader sees is therefore a fact's display value, and each fact traces back to rows ([facts.ts:28](../src/facts.ts#L28)). The "Facts used" list under each draft shows which ones. Rule templates go through the same filler, so they meet the same bar.

### Level 3: who wrote what

- **Which path:** the one you chose in Level 2 (with "Use this", or by going deeper), else the AI picks the strongest of the paths Level 2 shows (rules: the strongest check, then the largest change). "Try another angle" moves to a path not drafted yet ([useStory.ts:15](../src/useStory.ts#L15)).
- **Provenance:** the card records who wrote each text, `titleFrom` and `takeawayFrom`: `'ai'`, `'rules'`, or `'user'`. A drafted text shows an "AI draft" / "Rules draft" marker; editing it makes it `'user'` ([state.ts:179](../src/state.ts#L179)).
- **Never overwrite:** a draft fills the card only if `canFill` ([state.ts:49](../src/state.ts#L49)): no user-written text and no chart you built yourself. Otherwise it waits beside the card with "Use draft". Text you're still typing is never replaced ([StoryCard.tsx:28](../src/components/StoryCard.tsx#L28)).

---

## 4. File by file

### Setup
| File | What it does | Why it exists / how it connects |
|---|---|---|
| [package.json](../package.json) | Lists dependencies and the `npm run …` scripts. | `npm install` reads it. `"type": "module"` means files use `import`/`export`. |
| [package-lock.json](../package-lock.json) | Exact installed version of every package. | Lets anyone reproduce the same install. Generated by npm; don't edit by hand. |
| [vite.config.ts](../vite.config.ts) | React plugin, Vitest's environment, and (Phase 2) a small plugin that serves `api/suggest.ts` at `/api/suggest` during `npm run dev`, plus loading `ANTHROPIC_*` settings from `.env`. | Vite is the dev server and bundler. Vitest reads the same file. |
| [.env.example](../.env.example) | Placeholder names for the settings: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`. | Copied to `.env` (gitignored) to turn the AI on. Never holds a real key. |
| [tsconfig.json](../tsconfig.json) | TypeScript settings. `strict: true` turns on the strongest checks. | `npm run build` runs `tsc --noEmit` first: type errors fail the build. |
| [index.html](../index.html) | The one HTML page. Has an empty `<div id="root">`. | React renders the whole app into that div. |
| [scripts/make-sample.mjs](../scripts/make-sample.mjs) | Generates the synthetic sample CSV with a seeded random generator. | Seeded means reproducible: the CSV's origin is traceable (D-018, D-022). The tests use it. |
| [scripts/prepare-bookshop.py](../scripts/prepare-bookshop.py) | Python, standard library only. Joins the raw Bookshop workbook's sheets into one sales CSV, checking every join. | The "upstream prep tool" (D-010, D-047): cleaning and joining happen once, outside the app, in a script anyone can rerun. |
| [data/raw/Bookshop.xlsx](../data/raw/Bookshop.xlsx) | The raw fictional bookshop workbook (13 sheets). | Committed so the prep step can be reproduced. |
| [src/data/bookshop-sales.csv](../src/data/bookshop-sales.csv) | 56,350 sales rows, the app's default demo data. | Generated; rerun the prep script instead of editing it. |
| [src/data/bookshop-sales.roles.json](../src/data/bookshop-sales.roles.json) | One role per CSV column: money, price, rate, date, category, entity, flag, or id. | Written by the prep script, which knows what each column means; the app can't safely guess that from names (D-058). Not read by the app yet. |
| [src/data/sample-sales-synthetic.csv](../src/data/sample-sales-synthetic.csv) | 200 synthetic sales rows. | Used by the tests: small and seeded, so expected numbers can be checked by hand. The app opens on the Bookshop data instead. |

### Logic (pure functions)
| File | What it does | Why it exists / how it connects |
|---|---|---|
| [src/aggregate.ts](../src/aggregate.ts) | Parses numbers and ISO dates; picks a time unit; bins numbers; sums/means. | The single home of "how a number is computed." Used by `profile.ts` and `chartRules.ts`. |
| [src/loadCsv.ts](../src/loadCsv.ts) | Wraps Papa Parse. Returns `{ ok: true, dataset }` or `{ ok: false, errors }`. | Rejects malformed files with line numbers instead of silently fixing them (D-021). |
| [src/profile.ts](../src/profile.ts) | Detects each column's type; computes counts, missing, range, top values, bins. | Feeds the field cards (Level 1) and tells `chartRules` each field's type. In Phase 2 the profile (not raw rows) is what the AI sees (D-011). |
| [src/chartRules.ts](../src/chartRules.ts) | `chooseRule` maps field types to a chart; `buildChart` computes the numbers and the spec; `chartIdeas` lists Level 1 suggestions. | The rule table, with the reasoning in comments (D-012). Owns the highlight logic and colors. |
| [src/personas.ts](../src/personas.ts) | The persona type, four presets, build-your-own lists, `customPersona()`. | Stored in state now; sent to the AI in Phase 2 (D-014). |
| [src/state.ts](../src/state.ts) | `Snapshot`, `Action`, and `historyReducer` (back/forward). | Every user action goes through here, which is how history covers everything (D-009). Phase 2 adds the Level 2 branch and three actions: `goDeeper`, `jumpTo`, `usePath`. |
| [src/paths.ts](../src/paths.ts) | The path model, what the AI is sent (`buildRequest`), row filtering, `chartForView`, and the validator. | The shared core of Level 2: AI paths and rule paths pass through the same checks. |
| [src/fallbackPaths.ts](../src/fallbackPaths.ts) | The rule-based path generator: kind order per purpose, the outlier finder, go-deeper follow-ups. | Makes the app fully usable with no key (D-036). Deterministic, so it's testable. |
| [src/suggest.ts](../src/suggest.ts) | `loadSuggestions`: calls `/api/suggest`, validates, tops up with rules, picks the notice. Never throws. | The one browser function that talks to the server. |
| [src/useSuggestions.ts](../src/useSuggestions.ts) | A custom hook: Level 2's paths, cached by dataset + persona + parent (via useAsyncCache). | Why back/forward never re-calls the AI (D-037). |
| [src/aiRequest.ts](../src/aiRequest.ts) | `askAi`: post to an AI handler, with a timeout and one automatic retry. Never throws. | Shared by Levels 2 and 3 (D-051). |
| [src/useAsyncCache.ts](../src/useAsyncCache.ts) | A generic hook: load a value once per key, remember it, `retry()` on demand. | The cache behind both Level 2 and Level 3. |
| [src/groups.ts](../src/groups.ts) | `groupView`: a chart's groups (bars or periods) with record counts and values. | One source of the numbers checks and facts use. |
| [src/roles.ts](../src/roles.ts) | The dataset contract: `parseRoles` validates roles, facets, and rowNoun against the columns; `facetOf`, `rowNounOf`, `withRoleMeasures`; `bookshopRoles`; `UNKNOWN_ROLES` for uploads. | Lets code use what a column *is* instead of guessing from its name (D-058, D-059, D-062). |
| [src/options.ts](../src/options.ts) | `buildOptions`: the menu. One comparison per readable category column and one trend, by money or count, with template questions, facets, findings, effect sizes, and repairs. | Code builds every option; the AI only picks among them (D-064). |
| [src/highlight.ts](../src/highlight.ts) | Eligibility, the rules ranking (kind, facet, effect, menu order), "best place to start", the AI pick and its checks, the notices, the cache. | The highlight: gates, then rank, no weights (D-065, D-066). |
| [src/optionsReport.ts](../src/optionsReport.ts) | The text report behind `npm run options:bookshop`. | For checking the menu and highlights by eye. Not part of the app. |
| [src/datasetFindings.ts](../src/datasetFindings.ts) | `datasetFindings`: runs the checks over many charts and reports an entity that drives findings in two or more, with its share of the whole dataset. | So the UI can say "one author drives a third of revenue" once, not on every card (D-063). Not shown yet. |
| [src/checks.ts](../src/checks.ts) | The check registry: six checks (mix, small, concentration, driven by one entity, fragile lead, single cycle), each with preconditions and a run function; `runChecks` returns findings with severity and evidence, plus skip reasons. | Quiet notes on path cards; facts for Level 3; the "Don't say this" section later (D-051, D-055, D-059, D-060). |
| [src/facts.ts](../src/facts.ts) | `computeFacts`: every fact a story may use, with ids and display values; `strength` for the rules' pick. | The only source of numbers in a story (D-052). |
| [src/templates.ts](../src/templates.ts) | `fillTemplate` (slots must exist, no digits outside them), `ruleStory` (the no-AI templates). | Where an AI draft is accepted or rejected. |
| [src/story.ts](../src/story.ts) | `loadStory`: facts per candidate, ask `/api/story`, check the pick and the templates, fall back to rules. | The browser half of Level 3. |
| [src/useStory.ts](../src/useStory.ts) | `storyCandidates` (which path, in which order) and the `useStory` hook. | Keeps App readable (D-056). |

### Server
| File | What it does | Why it exists / how it connects |
|---|---|---|
| [api/suggest.ts](../api/suggest.ts) | The Level 2 handler: checks the request, builds the prompt, calls Claude via the Anthropic SDK, returns `{ ok, paths }` or `{ ok: false, reason }`. Also exports the shared pieces (`callModel`, the request readers). | `POST` is the Vercel entry point; `suggest()` is the testable core. |
| [api/story.ts](../api/story.ts) | The Level 3 handler: profile, persona, and candidates with their facts in; a pick and two templates out. | Same pattern; never sees rows. |

### UI (React components)
| File | What it does | Why it exists / how it connects |
|---|---|---|
| [src/main.tsx](../src/main.tsx) | Finds `#root` and renders `<App />` into it. Imports the CSS. | The entry point `index.html` loads. |
| [src/App.tsx](../src/App.tsx) | Owns state; lays out the top bar and three columns; passes props down. | The only component that holds app state; every other component receives values and callbacks from it. |
| [src/components/TopBar.tsx](../src/components/TopBar.tsx) | Dataset name and Synthetic tag, Load CSV, Use sample, persona picker, Back/Forward. | `PersonaPicker` keeps unfinished choices in local state until Apply. |
| [src/components/Slider.tsx](../src/components/Slider.tsx) | The vertical 0–3 range input and its clickable labels. | Calls `onChange(level)`; knows nothing about scrolling. |
| [src/components/AssistLayer.tsx](../src/components/AssistLayer.tsx) | Stacks the four panels and scrolls to the current one. Holds the Level 2/3 placeholders. | Receives Level 0/1 content as props, so it only handles layout and motion. |
| [src/components/Levels.tsx](../src/components/Levels.tsx) | `ExploreLevel`, `MapLevel`, `FieldCard`, `MiniDistribution`, `ChartPreview`. | Both levels share one props shape and one preview, so selection carries across (D-008). |
| [src/components/SuggestLevel.tsx](../src/components/SuggestLevel.tsx) | Level 2: persona line, `Breadcrumb`, `PathCard`s (with check notes and "View by count"), `Skeleton`. | Receives the cached suggestions and the branch as props; reports clicks up as `goDeeper` / `jumpTo` / `usePath`. |
| [src/components/StoryLevel.tsx](../src/components/StoryLevel.tsx) | Level 3: who the path came from, the draft, facts used, "Try another angle", "Use draft". | Shows the draft; App decides whether it fills the card. |
| [src/components/Chart.tsx](../src/components/Chart.tsx) | Embeds a Vega-Lite spec; turns mark clicks into `onMarkClick(key)`. | The only file that talks to Vega. Also holds the chart theme. |
| [src/components/StoryCard.tsx](../src/components/StoryCard.tsx) | Editable title and takeaway, and the card's clickable chart. | Saves text on blur (one history step), highlights on click. |
| [src/styles.css](../src/styles.css) | All styling. Colors are CSS variables at the top. | Plain CSS, grouped by area of the page. |

### Tests
| File | What it checks |
|---|---|
| [src/profile.test.ts](../src/profile.test.ts) | Parsing, type detection, missing counts, bins, CSV errors, that the sample profiles as expected, and that the Bookshop CSV has 56,350 rows, 2193 dates, and correct revenue on every row. |
| [src/chartRules.test.ts](../src/chartRules.test.ts) | Every rule, the exact numbers each chart draws, honest labels, "Other" grouping, highlight colors, chart ideas, and that every spec renders in Vega. |
| [src/state.test.ts](../src/state.test.ts) | Back/forward, the two-field limit, no-op actions, that user text is never overwritten, and Level 2's history (go deeper, breadcrumb, use this, persona change). |
| [src/paths.test.ts](../src/paths.test.ts) | The validator (bad fields, bad filters, duplicate kinds, repeats of the parent), row filtering, filtered charts, and that no rows are in the AI request. |
| [src/fallbackPaths.test.ts](../src/fallbackPaths.test.ts) | Rule paths for every persona, the order by purpose, the outlier finder, go deeper two levels down. |
| [src/suggest.test.ts](../src/suggest.test.ts) | AI + rules mixing and the notices, with a fake network. |
| [api/suggest.test.ts](../api/suggest.test.ts) | The handler with a fake Anthropic client: no key, bad requests, success, errors, what is sent. |
| [src/checks.test.ts](../src/checks.test.ts) | Each check on the Bookshop data, including hardcover vs mass-market paperback, severities, skip reasons, the id rule, and the entity check (Bianca Thompson: genre and award winner); groups match the chart. |
| [src/checks.fixtures.test.ts](../src/checks.fixtures.test.ts) | Every check fires with the expected severity on its planted synthetic fixture and stays quiet on its control; a CSV without roles skips the entity check and says why. |
| [src/roles.test.ts](../src/roles.test.ts) | Roles files: accepted, rejected for missing/extra/unknown roles, Bookshop's loaded against its columns. |
| [src/datasetFindings.test.ts](../src/datasetFindings.test.ts) | Bianca Thompson across eight Bookshop charts with her shares computed from the rows; Carolyn Segal (one chart) left out; nothing without roles; a fragile-lead flip counts. |
| [src/generality.test.ts](../src/generality.test.ts) | Property tests: 200 seeded datasets plus degenerate ones, roles known and unknown; no check throws, average-only is never summed, same input gives same findings, and a guard that it isn't passing vacuously. |
| [src/noBookshop.test.ts](../src/noBookshop.test.ts) | Fails if a string literal in app code equals a Bookshop column name or value, unless allowlisted with a reason; prints Bookshop examples found in comments. |
| [src/fixtures/generateDataset.ts](../src/fixtures/generateDataset.ts) | The seeded generator (mulberry32) and the degenerate datasets for the property tests. Synthetic. |
| [src/fixtures/synthetic-checks/](../src/fixtures/synthetic-checks/) | Synthetic CSV + roles pairs, one planted and one control per check, with the hand arithmetic in its README. Invented numbers, never shown in the app. |
| [src/facts.test.ts](../src/facts.test.ts) | Facts computed from rows, the template filler (unknown slots, digits), rule stories. |
| [src/story.test.ts](../src/story.test.ts) | Level 3 with a fake network: AI templates filled, every fallback, the candidate order. |
| [api/story.test.ts](../api/story.test.ts) | The story handler with a fake client. |
| [api/highlight.test.ts](../api/highlight.test.ts) | The highlight handler with a fake client: no key, bad requests, pass-through, never rows or extra fields. |
| [src/options.test.ts](../src/options.test.ts) | The Bookshop menu, its questions, repairs (from mix only), facets, effect sizes; the no-roles menu. |
| [src/highlight.test.ts](../src/highlight.test.ts) | The store-owner highlight, each persona's, "best place to start", every AI fallback, what the AI is sent, the cache. |

---

## 5. Patterns, in the order you'll meet them

Each entry: what it is, why it's used here, and where to see it first.

### TypeScript

**Type aliases and interfaces.** `type Row = Record<string, string>` gives a name to a shape; `interface Bin { x0: number; … }` describes an object's fields. TypeScript checks every use against them, so a typo like `bin.xo` is caught before the code runs. *First seen:* [aggregate.ts:5](../src/aggregate.ts#L5), [aggregate.ts:85](../src/aggregate.ts#L85).

**`Record<K, V>`.** An object whose keys are type `K` and values type `V`. `Record<RuleId, Builder>` means "one builder for *every* rule id." If a new rule is added to `RuleId` without a builder, the code won't compile. *First seen:* [aggregate.ts:5](../src/aggregate.ts#L5); the exhaustive use is [chartRules.ts:260](../src/chartRules.ts#L260).

**String literal unions.** `type TimeUnit = 'day' | 'month' | 'year'` allows exactly those three strings. It's safer than `string`: `'mnth'` is a compile error. *First seen:* [aggregate.ts:46](../src/aggregate.ts#L46).

**Discriminated unions.** A union of object shapes that share one field telling them apart. `LoadResult` is either `{ ok: true; dataset }` or `{ ok: false; errors }`. After `if (result.ok)`, TypeScript knows `result.dataset` exists. It replaces "return null and hope the caller checks." `Action` in state.ts uses the same idea with a `type` field. *First seen:* [loadCsv.ts:12](../src/loadCsv.ts#L12), then [state.ts:43](../src/state.ts#L43).

**`??` and `?.`.** `a ?? b` means "a, unless it's null/undefined, then b." `a?.b` means "a.b, or undefined if a is missing" instead of crashing. *First seen:* [loadCsv.ts:29](../src/loadCsv.ts#L29), [TopBar.tsx:31](../src/components/TopBar.tsx#L31).

**Non-null assertion `!`.** `parseNumber(v)!` tells TypeScript "I know this isn't null." It's used only right after a check that proves it. In [profile.ts:73](../src/profile.ts#L73) the column was already confirmed all-numeric. Misused, it hides bugs, so each use should have a reason next to it.

**`import type`.** Imports only a type, which is erased when compiled, so it adds no code to the bundle and makes clear the file doesn't *call* the other module. *First seen:* [loadCsv.ts:2](../src/loadCsv.ts#L2).

**`as const` and deriving types from data.** `['retail', …] as const` keeps the exact strings instead of widening them to `string[]`. Then `(typeof DOMAINS)[number]` turns the list into the type `'retail' | 'business' | …`. The list and the type can't drift apart because one comes from the other. *First seen:* [personas.ts:6](../src/personas.ts#L6), [personas.ts:16](../src/personas.ts#L16).

**Generics.** `topWithOther<T>(groups: Map<string, T[]>, …)` works for any item type `T`, and TypeScript keeps track of which `T` you passed. It lets one function group rows for bars and for multi-series lines. *First seen:* [chartRules.ts:206](../src/chartRules.ts#L206).

**Type guards.** `.filter((idea): idea is ChartIdea => idea.title !== null)` tells TypeScript that after the filter, every item has a non-null title. Without it, the result type would still allow `null`. *First seen:* [chartRules.ts:514](../src/chartRules.ts#L514).

**`as unknown as T`.** A forced cast: "trust me, this is a `T`." It's used once, for Vega-Lite specs, whose types are huge; the builders return plain objects and the tests check them instead. Treat this as a known weak spot, not a habit. *First seen:* [chartRules.ts:191](../src/chartRules.ts#L191).

**Immutable updates with spread.** `{ ...s, level: action.level }` makes a *new* object copying `s` with one field changed. The old snapshot is untouched, which is what makes history possible: `past` keeps real, unchanged copies. *First seen:* [state.ts:70](../src/state.ts#L70).

### React

**Components and JSX.** A component is a function that returns JSX (HTML-like syntax that compiles to function calls). `<Slider level={2} />` calls `Slider({ level: 2 })`. *First seen:* [main.tsx](../src/main.tsx), [Slider.tsx:13](../src/components/Slider.tsx#L13).

**Props with a typed interface.** Props are a component's inputs. `interface SliderProps { level; onChange }` documents them and TypeScript enforces them at every call site. Destructuring `({ level, onChange })` pulls them out by name. *First seen:* [Slider.tsx:4](../src/components/Slider.tsx#L4).

**Callback props ("events flow up").** `onChange: (level: Level) => void` is a function passed down by the parent. The Slider doesn't know what happens on change; App decides (it dispatches `setLevel`). This keeps components reusable and state in one place. *First seen:* [Slider.tsx:4](../src/components/Slider.tsx#L4).

**Lists and `key`.** `LEVELS.map((l) => <button key={l.level} …>)` renders one element per item. `key` lets React match items between renders. It must be stable and unique, so it uses the level number, not the array index. *First seen:* [Slider.tsx:31](../src/components/Slider.tsx#L31).

**Inline style with a CSS custom property.** `style={{ '--pos': 0.33 }}` sets a CSS variable on one element; the CSS uses it to position the label. The `as CSSProperties` cast is needed because TypeScript doesn't know custom property names. *First seen:* [Slider.tsx:37](../src/components/Slider.tsx#L37).

**`useReducer`.** Like `useState`, but updates go through one function, `reducer(state, action) → newState`. It's the right fit when many different events change related state and you want one place to see all of them, which here is also what records history. The third argument (`initialHistory`) builds the starting state lazily. *First seen:* [App.tsx:22](../src/App.tsx#L22); the reducer is [state.ts:108](../src/state.ts#L108).

**`useState`.** One piece of state plus its setter; calling the setter re-renders the component. It's used for things that aren't history: the dataset, load errors, and draft text. *First seen:* [App.tsx:23](../src/App.tsx#L23).

**`useMemo`.** Caches a computed value until its inputs change. `useMemo(() => profileDataset(...), [dataset])` reprofiles only when the dataset changes, not on every click. It also matters for charts: a new spec object makes Vega redraw, so specs are memoized too. *First seen:* [App.tsx:26](../src/App.tsx#L26), [Levels.tsx:161](../src/components/Levels.tsx#L161).

**Conditional rendering.** `{cond && <X />}` renders X only if cond is true; `{cond ? <A /> : <B />}` picks one. *First seen:* [App.tsx:69](../src/App.tsx#L69), [StoryCard.tsx:50](../src/components/StoryCard.tsx#L50).

**`async` event handlers.** `handleFile` awaits `file.text()`, which reads the file without freezing the page, and then parses it. *First seen:* [App.tsx:49](../src/App.tsx#L49).

**Spreading props.** `<ExploreLevel {...levelProps} />` passes every field of `levelProps` as a prop. Both levels get identical props, which is how the selection is shared. *First seen:* [App.tsx:86](../src/App.tsx#L86).

**Typed event handlers.** `ChangeEvent<HTMLInputElement>` is the type of an input's change event, so `e.target.files` is known to exist. *First seen:* [TopBar.tsx:30](../src/components/TopBar.tsx#L30).

**Local UI state vs app state.** `PersonaPicker`'s form choices live in its own `useState` and only reach app state on Apply. That way half-finished choices don't create history steps. *First seen:* [TopBar.tsx:82](../src/components/TopBar.tsx#L82).

**`ReactNode` props (passing content in).** `AssistLayer` takes `explore` and `map` as ready-made JSX. It decides *where* they go, not *what* they are. The same idea is behind `children`. *First seen:* [AssistLayer.tsx:8](../src/components/AssistLayer.tsx#L8), `children` at [AssistLayer.tsx:83](../src/components/AssistLayer.tsx#L83).

**`useRef` for DOM elements.** `ref={containerRef}` gives code a handle on the real DOM node, needed to call `scrollTo`. Changing a ref doesn't re-render. *First seen:* [AssistLayer.tsx:18](../src/components/AssistLayer.tsx#L18).

**`useRef` for remembered values.** `shownLevel` remembers the last level scrolled to between renders, without causing a re-render when it changes. *First seen:* [AssistLayer.tsx:21](../src/components/AssistLayer.tsx#L21).

**Callback refs.** `ref={(el) => { panelRefs.current[l] = el; }}` collects many DOM nodes (one per panel) into one object, which a single `useRef` can't do directly. *First seen:* [AssistLayer.tsx:64](../src/components/AssistLayer.tsx#L64).

**`useEffect` and cleanup.** Runs code *after* React updates the screen. It's for side effects React doesn't manage, like scrolling or listening to window resize. The array `[level]` means "rerun when level changes." The returned function is cleanup: it removes the listener before the next run, or when the component goes away. Without it, listeners pile up. *First seen:* [AssistLayer.tsx:23](../src/components/AssistLayer.tsx#L23), cleanup at line 38.

**`inert`.** An HTML attribute that makes an element and everything inside it unclickable and unfocusable. Hidden panels are inert, so Tab can't land in them and drag the column. *First seen:* [AssistLayer.tsx:70](../src/components/AssistLayer.tsx#L70).

**Fragments `<>…</>`.** Groups elements without adding a wrapper `<div>` to the page. *First seen:* [Levels.tsx:30](../src/components/Levels.tsx#L30).

**Wrapping a non-React library.** React owns the `<div>`; Vega owns what's inside. An effect hands Vega the spec whenever it changes, and cleanup calls `finalize()` to remove the old view. The `cancelled` flag handles a race: if the spec changes while Vega is still drawing, the stale view is thrown away. *First seen:* [Chart.tsx:50](../src/components/Chart.tsx#L50).

**The "latest callback" ref.** `clickRef.current = onMarkClick` (inside an effect) lets Vega's click listener always call the newest handler without tearing down and redrawing the chart every render. *First seen:* [Chart.tsx:45](../src/components/Chart.tsx#L45).

**Controlled inputs.** `value={title}` plus `onChange={(e) => setTitle(e.target.value)}`: React state is the source of truth for what's in the box. *First seen:* [StoryCard.tsx:44](../src/components/StoryCard.tsx#L44).

**Drafts synced from props.** The card keeps a local draft while you type, then commits on blur. When back/forward changes `card.title`, an effect copies the restored value into the draft. *First seen:* [StoryCard.tsx:26](../src/components/StoryCard.tsx#L26).

**`StrictMode`.** In development only, React runs effects twice on mount to expose effects that don't clean up properly. That's why AssistLayer tracks `shownLevel` rather than a "first run" flag. *First seen:* [main.tsx](../src/main.tsx).

### Vite and testing

**`?raw` imports.** `import text from './file.csv?raw'` makes Vite inline the file's contents as a string at build time. No server is needed to load the sample. *First seen:* [App.tsx:2](../src/App.tsx#L2).

**Vitest basics.** `describe` groups tests, `it` is one test, `expect(x).toBe(y)` asserts. `it.each(table)` runs the same test for every row, which is how all eight chart rules are checked in one block. *First seen:* [profile.test.ts](../src/profile.test.ts); `it.each` in [chartRules.test.ts](../src/chartRules.test.ts).

### Phase 2 patterns

**`async` / `await` and Promises.** A Promise is a value that arrives later (a server reply). `await` pauses *this function* until it arrives, without freezing the page; other clicks still work. An `async` function always returns a Promise. *First seen:* [suggest.ts:37](../src/suggest.ts#L37).

**`fetch` with a timeout.** `fetch(url, { method: 'POST', body })` sends an HTTP request from the browser. `signal: AbortSignal.timeout(20_000)` cancels it after 20 seconds, so a hung server can't leave the panel loading forever. *First seen:* [suggest.ts:41](../src/suggest.ts#L41).

**`try` / `catch` and "never throws."** Code inside `try` that fails jumps to `catch` instead of crashing. `loadSuggestions` catches every failure (offline, timeout, a reply that isn't JSON) and turns it into rule-based paths plus a notice. Callers never need their own error handling, which is how "the app must work without AI" is enforced in one place. *First seen:* [suggest.ts:47](../src/suggest.ts#L47); the server does the same at [api/suggest.ts:88](../api/suggest.ts#L88).

**`unknown` and checking before trusting.** `unknown` means "could be anything." Unlike `any`, TypeScript won't let you use it until you check what it is (`typeof x === 'string'`, `Array.isArray(x)`). That's the right type for AI output: the compiler forces the validator to check every field. *First seen:* [paths.ts:187](../src/paths.ts#L187). A subtlety from the build: checking `typeof f.field === 'string'` doesn't narrow a property read off a loose object, so the value is copied into a local `const` first, then checked.

**Returning a reason instead of throwing.** `checkOne` returns either a clean path or a sentence explaining why it was dropped (`PathDraft | string`). Tests assert on the reason, and the reasons are logged to the browser console. *First seen:* [paths.ts:187](../src/paths.ts#L187).

**`satisfies`.** `[...] as const satisfies readonly PathKind[]` checks that a value fits a type *without* changing the value's own type. Here it makes sure the server's copy of the kinds list contains only real kinds. *First seen:* [api/suggest.ts:18](../api/suggest.ts#L18).

**Custom hooks.** A function whose name starts with `use` and that calls other hooks. `useSuggestions` bundles the cache state, the "already asked" ref, and the effect behind one call, so `App` reads like `const suggestions = useSuggestions(...)`. *First seen:* [useSuggestions.ts:19](../src/useSuggestions.ts#L19), used at [App.tsx:37](../src/App.tsx#L37).

**Fetching data in an effect.** Rendering must not start network requests (React may render more than once). So the request starts in `useEffect`, which runs after the screen updates, and the result goes into state, which re-renders with the paths. The `requested` ref stops a second request for the same key, including from StrictMode's double effect in development. *First seen:* [useSuggestions.ts:32](../src/useSuggestions.ts#L32).

**Functional state updates.** `setCache((c) => ({ ...c, [key]: result }))` passes a function instead of a value. React calls it with the *newest* cache, so two answers arriving close together both get kept. With `setCache({ ...cache, ... })` the second answer could overwrite the first. *First seen:* [useSuggestions.ts:39](../src/useSuggestions.ts#L39).

**Caching by key.** The key is a string built from everything the answer depends on: dataset load, persona domain/role/purpose, parent path id. Same key, same answer, no new request. That's why back/forward and the slider never re-call the AI. Leaving something out of the key would show stale answers; putting too much in would re-ask needlessly (which is why the persona's *name* is left out). *First seen:* [useSuggestions.ts:30](../src/useSuggestions.ts#L30).

**`Array.at(-1)`.** The last element of an array (`undefined` if empty). `state.branch.at(-1) ?? null` is "the path we're going deeper on, or none." *First seen:* [App.tsx:36](../src/App.tsx#L36).

**A serverless handler with standard `Request` / `Response`.** `export async function POST(request: Request): Promise<Response>` is a function a host (Vercel) calls once per request; there's no server process to keep running. It uses the web-standard `Request` and `Response` objects, the same ones `fetch` uses, so the code isn't tied to one host. *First seen:* [api/suggest.ts:37](../api/suggest.ts#L37).

**Splitting the HTTP shell from the logic.** `POST` only reads the body and env and turns the result into a `Response`. `suggest()` holds the logic and takes plain values: a body, settings, and a function that makes the client. Tests call `suggest()` directly with a fake client. That's **dependency injection**: pass in what a function depends on instead of creating it inside, so a test can pass a stand-in. *First seen:* [api/suggest.ts:56](../api/suggest.ts#L56) (`makeClient`); the browser side does the same with `fetcher` at [suggest.ts:32](../src/suggest.ts#L32).

**Dev-server middleware.** A Vite plugin's `configureServer` adds a handler for one URL. It reads Node's request body in chunks (`for await (const chunk of req)`, a loop over data that arrives piece by piece), wraps it in a standard `Request`, calls the same `POST` Vercel would call, and copies the `Response` back. One handler, two hosts. *First seen:* [vite.config.ts:14](../vite.config.ts#L14).

**Environment variables and the secret boundary.** `process.env.X` is a setting given to a program from outside its code. `loadEnv` reads `.env` into the dev server's environment ([vite.config.ts:38](../vite.config.ts#L38)). Only server code reads it; browser code can only see variables prefixed `VITE_`, and none exist.

**Structured output (JSON schema).** The request includes a JSON schema describing `{ "paths": [...] }`, and the API constrains the reply to match it. That makes the reply parseable, but not *correct*: a schema can't know which columns exist. That's why the validator still runs. *First seen:* [api/suggest.ts:78](../api/suggest.ts#L78).

**Typed SDK errors.** `error instanceof Anthropic.APIError` checks the error's class rather than matching message text, so a rate limit (429) or a bad key (401) is recognised reliably. Only the status is logged, never the key. *First seen:* [api/suggest.ts:88](../api/suggest.ts#L88).

**Type guards in `.filter`.** `.filter((c): c is ColumnProfile => c !== undefined)` removes the `undefined`s and tells TypeScript so. *First seen:* [fallbackPaths.ts:39](../src/fallbackPaths.ts#L39).

**Mocks with `vi.fn`.** `vi.fn(async () => …)` makes a fake function that records every call. Tests then check what it was called with (`create.mock.calls[0]`), for example that the request had no rows. *First seen:* [api/suggest.test.ts:24](../api/suggest.test.ts#L24).

**Canvas vs SVG.** Vega can draw a chart as SVG (one page element per mark: crisp, inspectable) or on a `<canvas>` (one bitmap: fast for many marks). [Chart.tsx](../src/components/Chart.tsx) switches to canvas above 5,000 data points, because a 56,350-point scatter as SVG froze the page. It's the same spec either way, so the numbers can't differ.

**Breadcrumb semantics.** The breadcrumb is a `<nav>` with an ordered list; earlier steps are buttons, and the current step is plain text marked `aria-current="location"`, so screen readers announce "current." *First seen:* [SuggestLevel.tsx:88](../src/components/SuggestLevel.tsx#L88).

### Phase 3 patterns

**Generics in a hook (`useAsyncCache<T>`).** The `<T>` says "this works for any type of value": Level 2 gets back `Suggestions`, Level 3 gets back a `Draft`, and TypeScript knows which. One cache, two uses, no copy-paste. *First seen:* [useAsyncCache.ts:12](../src/useAsyncCache.ts#L12).

**`useCallback`.** Keeps the same function object between renders until its inputs change. `retry` is passed down to the "Try again" link; a stable function means the child isn't handed a "new" prop every render. *First seen:* [useAsyncCache.ts:37](../src/useAsyncCache.ts#L37).

**Effects run in order.** `useAsyncCache` has two effects: the first stores the newest `load` function in a ref, the second uses it. React runs effects in the order they're declared, so the second always sees the newest one. *First seen:* [useAsyncCache.ts:25](../src/useAsyncCache.ts#L25).

**An effect that dispatches.** App watches for a finished draft on Level 3 and dispatches `fillDraft`. Effects that change state can loop, so this one stops itself: it returns early if the card already shows the draft or `canFill` says no. *First seen:* [App.tsx:60](../src/App.tsx#L60).

**Updating history in place.** Almost every action pushes the old snapshot onto `past`. `fillDraft` doesn't: it replaces `present` and keeps `past` and `future`. Filling the card is a consequence of arriving at Level 3, not a separate step; if it were a step, "back" would land on an unfilled Level 3 that fills itself again and wipes "forward". *First seen:* [state.ts:213](../src/state.ts#L213).

**Refs as "is the user typing?" flags.** `typedTitle` is set on every keystroke and cleared on commit. The effect that copies the card's title into the input checks it first, so an arriving draft can't replace half-typed text. A ref, not state, because the flag never changes what's drawn. *First seen:* [StoryCard.tsx:28](../src/components/StoryCard.tsx#L28).

**Regular expressions with a replace callback.** `SLOT = /\{([a-z][a-z0-9_]*)\}/g` finds every `{fact_id}`. `template.replace(SLOT, (_, id) => known.get(id))` swaps each match for the fact's value, and `template.replace(SLOT, ' ')` removes them all to inspect the AI's own words. *First seen:* [templates.ts:10](../src/templates.ts#L10), [templates.ts:29](../src/templates.ts#L29).

**Lists as sets with `every` / `some`.** A follow-up "keeps its parent's filters" when every parent filter has a matching child filter: `parent.every((p) => child.some((c) => …))`. Order doesn't matter, which is the point. *First seen:* [paths.ts:152](../src/paths.ts#L152).

**A lookup object instead of if/else.** `{ active: '…', ai: '…', rules: '…' }[draft.pickedBy]` picks a sentence by key; TypeScript checks that every key exists. *First seen:* [StoryLevel.tsx:62](../src/components/StoryLevel.tsx#L62).

**`Intl.NumberFormat`.** The browser's built-in number formatter: `new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(261964)` → "261,964". Facts use it so the same number always looks the same. *First seen:* [facts.ts](../src/facts.ts).

### Check engine patterns

**A registry of objects with functions in them.** Each check is a plain object: `{ id, preconditions, run }`, where the last two are functions. `CHECKS` is a list of them, and `runChecks` loops over it the same way for every check. Adding a check means adding one object to the list, not another `if` in `runChecks`. It's the same idea as a lookup object instead of if/else, but the values are behaviour, not text. *First seen:* `CheckDef` and `CHECKS` in [checks.ts](../src/checks.ts).

**Skipped is not the same as quiet.** `preconditions` returns a reason string (skip) or `null` (run). `run` returns a finding or `null` (ran, found nothing). Keeping the two apart is what lets a test say "the entity check didn't run *because roles are unknown*" instead of only "there was no entity finding", which could mean either.

**A default parameter.** `roles: Roles = UNKNOWN_ROLES` in `runChecks` means a caller that passes nothing gets unknown roles. That's why the app's two callers didn't have to change except to read `.findings`, and why the app behaves exactly as before. *First seen:* [checks.ts](../src/checks.ts).

**Importing JSON.** `import bookshopRolesJson from './data/bookshop-sales.roles.json'` makes Vite (and Vitest) include the parsed object at build time, like `?raw` does for the CSV. TypeScript types it from the file's contents, but `parseRoles` still treats it as `unknown` and checks it, because the file is data a script wrote, not code. *First seen:* [roles.ts](../src/roles.ts).

**Removing one entity and ranking again.** The entity check doesn't only ask "is Bianca a big share?". It also deletes her rows from the chart's rows and re-ranks every group the same way the chart does (largest first, ties by name). That's a counterfactual you can verify by hand: filter the CSV, re-sum, re-sort. *First seen:* the `entity` check in [checks.ts](../src/checks.ts).

### Options and highlight patterns (Phase 3b)

**Gates, then rank.** `isEligible` is a gate: an option with a misleading finding is out, whatever else is true of it. Only then are the eligible ones sorted. No score adds things up, so no weight has to be defended (SPEC "The highlight"). *See:* `rulesHighlight` in [highlight.ts](../src/highlight.ts).

**Sorting by several keys with `||`.** `rank(kinds, a.kind) - rank(kinds, b.kind) || rank(facets, a.facet) - … || byEffect(a, b) || order(a) - order(b)`. A comparator returns a negative number, zero, or a positive number. `||` moves to the next key only when the one before gives 0 (a tie), so this reads as "by kind, then by facet, then by effect, then by menu order". The last key never ties, which is what makes the result the same every time.

**The AI chooses; code checks the choice.** The AI is only sent the eligible options and can only answer with an id and a sentence. `checkAiPick` accepts the id only if it is in the eligible list, and the reason only if it has no digits and fits in 140 characters. Anything else is treated like no answer: rules pick, with a quiet notice. The AI can't add an option, approve itself, or put a number on screen.

**Caching a promise, not a value.** `loadHighlight` stores the *promise* in the cache before it finishes. A second call with the same key, even one that arrives while the first is still waiting on the AI, gets the same promise, so the AI is asked once per dataset and persona. *See:* `loadHighlight` in [highlight.ts](../src/highlight.ts).

**Running TypeScript from a script without a new tool.** `scripts/options-bookshop.mjs` starts Vite in "middleware mode" (no web server) and calls `ssrLoadModule`, which compiles and runs a `.ts` file the way the dev server would, including the `?raw` CSV import and the JSON import. Then it closes Vite.

### Generality patterns (Phase 3a)

**Computed once, on first use.** `ctx.largest()` finds the top group's largest entity and its rank without it. Two checks need that answer, and it means scanning every row, so `runChecks` wraps it in a function that remembers its result: the first call computes, later calls return the stored value. `undefined` means "not computed yet", which is why "no entity" is stored as `null`, a different value. *See:* `runChecks` in [checks.ts](../src/checks.ts).

**Property-based testing.** Instead of one example with one expected answer, the test generates hundreds of datasets and checks things that must be true of *every* answer: nothing throws, a price is never summed, the same input gives the same output. The datasets come from a seed, so a failure names a seed that rebuilds the exact case. *See:* [generality.test.ts](../src/generality.test.ts).

**Guarding against a test that passes on nothing.** An invariant like "an average-only measure is never summed" passes trivially if the generator never asks for such a sum. The coverage test counts that it does (hundreds of times) and that every check fires at every severity. To check the test can fail at all, the roles step was removed from `runChecks` once by hand: the invariant failed, then the line was restored. This kind of deliberate break is called a *mutation test*.

**An allowlist with reasons, and a stale-entry check.** The no-Bookshop test can't tell "keyed to Bookshop" from "uses the same ordinary word" (`'price'` is a role name and a Bookshop column). So each known exception is written down with why it's fine, and the test fails both on anything new and on an entry that no longer matches, so the list can't quietly grow stale. *See:* `ALLOWED` in [noBookshop.test.ts](../src/noBookshop.test.ts).

### The prep script (Python)

**Reading .xlsx without a library.** An .xlsx file is a zip archive of XML files: `xl/workbook.xml` lists the sheets, each sheet is `xl/worksheets/sheetN.xml`, and text cells hold an index into `xl/sharedStrings.xml`. The script opens the zip with `zipfile` and walks the rows with `xml.etree.ElementTree.iterparse`, which reads one row at a time instead of the whole 9 MB sheet. *See:* `Workbook` in [prepare-bookshop.py](../scripts/prepare-bookshop.py).

**Excel dates are day numbers.** Excel stores 2 January 2193 as 107020, the number of days since 30 December 1899 (its "1900 date system"). The script converts with `date(1899, 12, 30) + timedelta(days=n)`, and it refuses a workbook that uses the other (1904) system rather than shifting every date by four years.

**Joins as dictionary lookups.** Each lookup sheet becomes a dict from key to row (`index()`), which also checks the key is unique. A join is then `table.get(key)`. A miss is recorded, and after all rows are read the script stops and lists the first ten, so you see every problem at once instead of one per run.

**A set, not a lookup, for Award.** `index()` refuses duplicate keys because a join on a repeated key would be ambiguous. Award is only asked "is this title in here?", so it becomes a Python `set` of titles: "The Mallemaroking" winning two awards is two rows but one member of the set, and nothing is ambiguous. The script still checks every Award title matches a Book title.

**Empty is not the same as unmatched.** A book with no SeriesID isn't in a series, so its `series` cell is empty, and that's correct. A SeriesID that isn't in the Series sheet is a broken join, so the script stops. The output keeps the two apart: empty series values are counted on their own line, not under "Empty values".

**Fail loudly, print counts.** The script exits with an error (`sys.exit(1)`) for anything it can't explain, and otherwise prints what it did: rows per sheet, the total, repeated ItemIDs, empty values. A prep step that silently drops a row would break the precision rule before the app even starts.

---

## 6. Commit message conventions

Phase 1 commits follow **Conventional Commits**:

```
feat: add rule-based chart builder with tests
│     │
│     └─ summary: imperative mood, lowercase, no period, under ~72 characters
└─ type
```

- **Types used:** `feat` (a new capability), `fix` (a bug fix, like the date-format fix in Phase 2), `chore` (setup that adds no feature, like the scaffold or a gitignore change), `docs` (documentation only). Others you'll see elsewhere: `test`, `refactor` (restructure without changing behavior).
- **Imperative mood** ("add," not "added" or "adds"): read it as "If applied, this commit will *add rule-based chart builder*." Git's own messages ("Merge branch…") use the same style.
- **Why the type prefix:** you can scan `git log --oneline` and see at a glance what changed. Tools can also generate changelogs from it.
- **Body (optional):** a blank line after the summary, then *why* the change was made, if the summary doesn't say. The scaffold commit uses one.
- **`Co-Authored-By:` trailer:** the last line credits Claude as co-author. GitHub reads this trailer and shows both authors on the commit. It keeps the AI's contribution visible in the history, the same principle as the AI log.
- **One commit per working step:** each commit builds and passes its tests, so any commit can be checked out and run, and a bad step can be reverted on its own.
- **Untracking vs. rewriting history:** `git rm --cached file` plus a `.gitignore` line stops tracking a file from the next commit on; the file stays on disk, and old commits still contain it. Rewriting history (`git filter-branch`) removes it from every past commit, but that creates new commits with new ids, so it can only reach GitHub by force-pushing, which replaces the shared history. In Phase 2 Claude Code did the rewrite when only untracking was asked for; it was caught before the push and rebuilt with `git cherry-pick` (copying each commit onto the published history). The git rules in CLAUDE.md now forbid rewriting published history and force pushes.

---

## 7. "How would you defend this?"

Questions a reviewer might ask. Try answering each one aloud, then check the pointer.

1. **Why compute sums and bins yourself instead of letting Vega-Lite aggregate?** → D-019; `buildChart` in [chartRules.ts](../src/chartRules.ts). Think about testability, traceability, and the time-zone bug.
2. **A column has 999 numbers and one "n/a". What type is it, and why is that the right call?** → `detectType` in [profile.ts](../src/profile.ts), D-020. What would go wrong if it were treated as a number?
3. **Why does an empty month show as 0 for a sum but disappear for a mean?** → the `line` builder in [chartRules.ts](../src/chartRules.ts), D-024. What is the mean of nothing?
4. **How does back/forward work, and why doesn't the dataset live in the snapshots?** → `historyReducer` in [state.ts](../src/state.ts), D-028.
5. **Why does the highlight use one orange and turn everything else grey, instead of making the highlighted bar bigger or bold too?** → `markColor` in [chartRules.ts](../src/chartRules.ts); pre-attentive pop-out and conjunctions in your DATA511 notes, §4.
6. **What stops a chart from silently dropping data?** → the `notes` in `buildChart`, `topWithOther`'s "Other" bar, and the heatmap's zero cells. Where would a user see each?
7. **How would the AI plug into Level 2 without breaking the "code computes every number" rule?** → the AI returns field names and a question; `buildChart` does the rest. What exactly would you send it (D-011)?
8. **Why `useReducer` instead of several `useState`s?** → one place for every change means one place to record history and one place to test ([state.test.ts](../src/state.test.ts)).
9. **Why is the slider a native `<input type="range">` instead of a custom-drawn one?** → [Slider.tsx](../src/components/Slider.tsx), D-030. Think about keyboard use and screen readers.
10. **What's the weakest part of this code?** Honest candidates: the `as unknown as` cast on specs, no browser-level (end-to-end) tests of clicking and scrolling, one large Vega bundle, ISO-only dates.

**Phase 2**

11. **The AI returned a path that charts a column called "profit," which doesn't exist. Walk through what happens.** → `checkOne` in [paths.ts](../src/paths.ts), then the top-up in [suggest.ts](../src/suggest.ts). Where does the user see it?
12. **Why validate in the browser instead of on the server?** → D-040. Which check needs the rows, and where do the rows live?
13. **Prove the AI never sees a row.** → `buildRequest` and `readRequest`, and the tests that check for a middle value. Why test both the browser side *and* the server side?
14. **Why does structured output (a JSON schema) not make validation unnecessary?** → What can a schema check, and what can't it know about this dataset?
15. **Where does the API key live, and how do you know it isn't in the browser bundle?** → `.env`, `process.env` in [api/suggest.ts](../api/suggest.ts), Vite's `VITE_` rule, and the build-output check.
16. **What exactly is the suggestion cache keyed on, and what goes wrong if you drop each part?** → [useSuggestions.ts](../src/useSuggestions.ts), D-042. Try it for the dataset counter, then the parent id.
17. **Why is the rule-based fallback held to the same validator as the AI?** → [fallbackPaths.ts](../src/fallbackPaths.ts) produces candidates only. What would it mean if rules could skip the checks?
18. **How does "finding problems to fix" change what you see, with and without AI?** → `PURPOSE_GUIDANCE` (advice to a model) versus `KIND_ORDER` (a rule code follows). Why have both?
19. **The outlier finder said "Electronics is unusually high on revenue." Is that insight or artefact?** → `findStandout`, D-041. Electronics costs more per item, so a higher mean revenue is expected. What would a better outlier rule compare against? This is a good place to show judgment over the AI's (and the rules') output.
20. **Why is `suggest()` separate from `POST()`?** → Dependency injection; how [api/suggest.test.ts](../api/suggest.test.ts) tests the handler without the network or a key.
21. **What's the weakest part of Phase 2?** Honest candidates: one filter per path (third-level follow-ups can echo their parent's siblings), a failed AI call isn't retried until reload (D-042), field names used raw in rule questions ("How has units changed..."), and the real model is untested here (an end-to-end run used a local mock of the API).

**The Bookshop data: "How would you defend this?"**

22. **Why do the joins happen in a Python script instead of in the app?** → D-010, D-047. What would the app have to know about the workbook otherwise, and who would maintain that?
23. **Two ItemIDs appear twice. Why keep them?** → D-048. How would you check whether they are two sales or one sale copied, and what would change your decision?
24. **"Which title has the most price?" What went wrong, and whose call is the fix?** → `candidatesInScope` in [fallbackPaths.ts](../src/fallbackPaths.ts) picks the first number column. Summing list prices isn't revenue. Should the rules prefer a column by name, ask the user, or leave measures to the AI?
25. **The scatter shows 56,350 sales as about 70 dots. Is that honest?** → Overplotting: many identical (price, revenue) pairs sit on one spot. What would show how many are stacked there?

**Phase 3**

26. **Why is an unknown number column "average only" instead of "additive"?** → `classifyMeasure` in [profile.ts](../src/profile.ts), D-054. Which mistake is worse: a missing sum or a false one?
27. **Name three places that stop a price from being summed, and why one isn't enough.** → `effectiveAggregate`, the disabled toggle, the validator, the rules, the prompt. Which one is the real guarantee, and which are courtesy?
28. **Hardcover leads revenue. Is that an insight?** → the price/mix check in [checks.ts](../src/checks.ts). What does "View by count" show, and which chart would you put in front of a store owner deciding what to stock?
29. **Why 30 records and 40%? Defend or change the thresholds.** → the constants and comments at the top of [checks.ts](../src/checks.ts), D-055.
30. **Why may the AI not write a single digit, even a correct one?** → `fillTemplate` in [templates.ts](../src/templates.ts), D-052. How would you prove every number on a story card was computed?
31. **What stops a slot from being made up?** → the unknown-slot check, and what the fallback does with the AI's pick (D-056).
32. **When does Level 3 replace text, and when does it wait?** → `canFill` in [state.ts](../src/state.ts), the typing guard in [StoryCard.tsx](../src/components/StoryCard.tsx). Walk through: you edit the title, then click "Try another angle".
33. **Why doesn't filling the card add a history step?** → the `fillDraft` branch of `historyReducer`. What would "back" do if it did?
34. **How does go deeper avoid repeating the top-level paths now?** → the inherit-plus-one filter rule in `checkOne` ([paths.ts](../src/paths.ts)), D-051, and the prompt. Why enforce it in code when the prompt already asks?
35. **What's the weakest part of Phase 3?** Honest candidates: name-based measure classification (a column called "x" can't be summed, a column called "count_rate" is a guess); checks only look at one chart at a time; the money-word list is English; Level 3 was tested against a local mock of the API, not the real model.

**Bookshop columns and roles**

36. **Why is Marketing Spend not a column, when it's right there in the Publisher sheet?** → the exclusion comment at the top of [prepare-bookshop.py](../scripts/prepare-bookshop.py), D-058. What happens if you sum a per-publisher number that was copied onto 56,350 sale rows?
37. **Could the library workbook be joined to sales by ISBN?** → each ISBN has 1 to 5 Catalog rows. What does that do to the row count and to total revenue?
38. **Why write the roles in a separate file instead of letting the app guess from column names?** → compare D-054 (name-based measures). Who knows that `book id` is an identifier, the prep script or the app?

**Check engine**

39. **What's the difference between a misleading finding and a caveat, and why does it matter?** → `Severity` in [checks.ts](../src/checks.ts), the spec's "Check severity". Which one disqualifies a highlight?
40. **Revenue by genre: SciFi/Fantasy is first. Is it your best genre?** → the entity check, D-060. Why remove Bianca Thompson's rows everywhere instead of only from SciFi/Fantasy, and what changes for revenue by format?
41. **Why doesn't a chart of titles say "driven by one author"?** → `entityColumns` in [checks.ts](../src/checks.ts). What would happen on every title chart without that guard?
42. **Why 50% for the entity caveat?** → `ENTITY_SHARE` and its comment. Which Bookshop chart sits just under it, and which just over?
43. **An uploaded CSV has a column called "revenue". Which checks run?** → `measureIsMoney` and the no-roles test in [checks.fixtures.test.ts](../src/checks.fixtures.test.ts). What does "skipped" record, and who sees it?
44. **How do you know a check works, not just that it ran?** → the fixtures README: a planted effect where it must fire, a control where it must stay quiet, and arithmetic you can redo by hand.

**Generality (Phase 3a)**

45. **Hardcover leads by 7%. Is that a finding or noise?** → `NARROW_LEAD` in [checks.ts](../src/checks.ts), D-061. Why isn't this a significance test, when the data is every sale?
46. **Why two checks for "one author tips it"?** → `ENTITY_SHARE` and the fragile lead's flip. What does the 50% line separate, and which Bookshop chart sits on each side (Bianca Thompson at 79% vs Carolyn Segal at 25%)?
47. **A column called "x" has the money role. Can it be summed? And "amount" with the price role?** → `withRoleMeasures` in [roles.ts](../src/roles.ts), D-062.
48. **What does a property test prove that an example test can't, and what would make it worthless?** → [generality.test.ts](../src/generality.test.ts): the coverage test and the mutation check.
49. **Why is `'price'` allowed in app code, but `'Hardcover'` isn't?** → `ALLOWED` in [noBookshop.test.ts](../src/noBookshop.test.ts). What can't the test see (hint: JSX text)?
50. **Why report Bianca Thompson once for the dataset, and how is her share computed?** → `datasetFindings` and `shareOf` in [datasetFindings.ts](../src/datasetFindings.ts). Why the whole dataset, not a filtered chart?

**Options and highlight (Phase 3b)**

51. **Why does the AI pick from a menu instead of writing paths, as it did in Phase 2?** → [highlight.ts](../src/highlight.ts), D-064, D-066. What can go wrong when the AI writes a path, and what can't go wrong when it only returns an id?
52. **The store owner's highlight is "Which format has the most items sold?", not revenue. Why?** → the repair in `buildOptions` ([options.ts](../src/options.ts)). Why does only the mix check produce repairs?
53. **Why is the order kind, then facet, then effect, and not one score?** → `rulesHighlight`, the SPEC's "gates, then rank". What would a weight mean, and who would defend it?
54. **The AI answers with the id of a misleading option. What does the user see?** → `checkAiPick` and the notices. Where is this tested?
55. **Every Bookshop trend gets a "single cycle" caveat. Is the trend still worth showing?** → `SINGLE_CYCLE_DAYS` in [checks.ts](../src/checks.ts), D-067. What can one year of data say, and what can't it?
56. **Nothing is eligible. What happens, and why not just show nothing?** → "best place to start" in `rulesHighlight`; the SPEC's wording.
