# Decisions

Short records of product and technical calls. Newest at the bottom.

## Template
```
## D-NNN — YYYY-MM-DD — title
Decision:
Options considered:
Why:
Status: decided | tentative | revisited (see D-NNN)
```

---

## D-001 — 2026-10-26 — GitHub repo is the source of truth
Decision: Claude Code builds in VS Code and pushes here. A claude.ai Project is the brainstorming/review partner and reads the repo on GitHub. I decide.
Options considered: give the chat AI direct folder access; GitHub only; both.
Why: TODO(adam)
Status: decided

## D-002 — 2026-10-26 — Public repo
Decision: The repo is public.
Why: TODO(adam)
Status: decided

## D-003 — 2026-10-26 — Primary data operation: visualization / storytelling
Decision: Focus on visualization and storytelling, keeping cleaning and transformation in view.
Why: It's the operation I find most fun, and it's where my psychology and social-systems background can show.
Status: decided; the product is chosen in D-005

## D-004 — 2026-10-26 — Stack
Decision: Vite + React + TypeScript. CSV parsing with Papa Parse. Charts with Vega-Lite via vega-embed. Plain CSS. Vitest for tests.
Why: TODO(adam)
Status: decided

## D-005 — 2026-10-26 — Product: an analytics workspace built around an autonomy slider
Decision: The user loads a dataset; a vertical slider controls how much the AI helps. Level 0 Explore (all fields, free building, no guidance) · Level 1 Map (field cards + rule-based chart ideas, no AI) · Level 2 Suggest (analytical paths: questions with charts, forming a tree; AI chooses questions, code computes numbers) · Level 3 Story (AI-generated story card, marked as AI and editable). The output is a story card. The slider can be moved at any time. Suggestions are tailored to a persona.
Why: TODO(adam)
Status: decided

## D-006 — 2026-10-26 — Default level is 2 (Suggest)
Decision: The app opens at Level 2.
Why: TODO(adam)
Status: decided

## D-007 — 2026-10-26 — Slider layout and motion
Decision: Vertical, on the left edge, Level 3 at the top, Level 0 at the bottom. Moving it scrolls the assist layer to that level, snapping to whole levels, respecting prefers-reduced-motion. The slider, top bar, and story card stay pinned. Native smooth scrolling is fine (no custom 350 ms animation). The middle column only moves when the slider moves; panels may scroll internally if their content overflows.
Why: TODO(adam)
Status: decided

## D-008 — 2026-10-26 — Slider rule
Decision: Moving up adds AI layers, moving down hides them, and the user's own work is never overwritten. Selections carry across levels.
Why: TODO(adam)
Status: decided

## D-009 — 2026-10-26 — History
Decision: Back/forward through state snapshots. Every user action (including persona and slider changes) saves a snapshot. Story card text saves one snapshot when the field loses focus. A breadcrumb for the path tree is planned but left out until Phase 2.
Why: TODO(adam)
Status: decided

## D-010 — 2026-10-26 — Input is a clean, typed CSV
Decision: One header row, one row per record, consistent column types. Data cleaning and classification are out of scope; they belong to an upstream tool.
Why: TODO(adam)
Status: decided

## D-011 — 2026-10-26 — Hybrid architecture
Decision: Code computes every number. The AI (Phase 2) only chooses and phrases, sees only the data profile and the persona (never raw rows), and the app must fully work without AI.
Why: TODO(adam)
Status: decided

## D-012 — 2026-10-26 — Deterministic, rule-based chart choice
Decision: Chart choice is rule-based code. No chart explanations in the UI; the reasoning lives in code comments, citing DATA511-viz-principles.md by name (the file itself stays private, see D-017). Rules: temporal + number → line; category + number → sorted bars; number + number → scatter; one number → histogram; one category → bar of counts; date only → count over time (line); date + category → count over time per category (line, colored by category); category + category → count heatmap. Maximum 2 fields; selecting a third drops the oldest.
Why: TODO(adam)
Status: decided

## D-013 — 2026-10-26 — Aggregation
Decision: Sum by default with a sum/mean toggle. Axes are labeled honestly (e.g., "Sum of revenue"). The time unit is picked automatically from the date range.
Why: TODO(adam)
Status: decided

## D-014 — 2026-10-26 — Persona
Decision: A picker in the top bar with presets plus "build your own." Presets: Store owner (retail, deciding where to invest; default), Marketing analyst (business, reporting results upward), Researcher (science, testing whether a pattern is real), Program manager (nonprofit, finding problems to fix). "Build your own" picks domain, role, and purpose from short lists (purpose includes "just exploring") with an optional name. Stored as a context object (domain, role, purpose) for Phase 2. Changing the persona never resets the user's work.
Why: In production this would come from upstream user classification and history; here the user picks it.
Status: decided

## D-015 — 2026-10-26 — Chart preview, then "use this"
Decision: Charts preview in the assist layer; a "use this" action sends the chart to the story card.
Why: TODO(adam)
Status: decided

## D-016 — 2026-10-26 — Visual style
Decision: Golden Analytics' color palette, colors only (no logo, no brand assets; the app stays "Autonomy Slider"). Each color has one meaning: navy #181833 for all text and the top bar background (with off-white text); off-white #FAFAF7 for the page and white for cards; electric blue #2C5AFF for everything interactive (buttons, slider thumb and track, links, focus rings) and the thin hairline rules between sections; orange #FF7B2C for data emphasis only (highlighted marks, selected field cards, the selected path); amber #FFB30F for AI provenance only ("AI" tags and "AI draft" markers, as a light amber wash with navy text); grey for structure and non-highlighted marks. All text meets WCAG AA contrast; orange is never used for text, since it reaches only about 2.5:1 on off-white. Monospace uppercase letter-spaced labels, square corners, no gradients, shadows, or emoji, as before. (Updated 2026-10-28; first version: warm cream base, deep navy text, one orange accent.)
Why: The UI follows the same rules as good charts: grey for structure, one accent for meaning, no decoration that doesn't carry information. TODO(adam): why Golden's palette.
Status: decided

## D-017 — 2026-10-26 — Course notes stay private
Decision: docs/context/DATA511-viz-principles.md is gitignored; code comments cite it by name only.
Why: TODO(adam)
Status: decided

## D-018 — 2026-10-26 — Test runner and sample generator
Decision: Vitest for tests. The synthetic sample CSV is produced by a seeded generator script so it can be reproduced.
Why: TODO(adam)
Status: decided

## D-019 — 2026-10-26 — All aggregation happens in our code, not in Vega-Lite (Claude Code choice, Adam to review)
Decision: Sums, means, counts, histogram bins, and time buckets are computed in src/aggregate.ts and src/chartRules.ts. Vega-Lite only draws the finished numbers. This adds src/aggregate.ts, which wasn't in the planned file list.
Options considered: let Vega-Lite aggregate (less code); compute in our code (testable).
Why: Every number shown must be traceable and tested (CLAUDE.md, D-011). Vega's own date parsing also shifts date-only values by a day in US time zones; computing UTC buckets ourselves avoids that.
Status: tentative

## D-020 — 2026-10-26 — Type detection rules (Claude Code choice, Adam to review)
Decision: A value is missing only if it is empty after trimming. A column is quantitative only if every non-missing value is a plain number (no $ or thousands separators), temporal only if every value is an ISO 8601 date (2025-03-14, optionally with a time), otherwise nominal. Ordinal is not detected. Dates are handled in UTC.
Options considered: majority-vote typing; accepting US-style dates like 3/14/2025.
Why: All-or-nothing keeps types predictable and never silently drops a value from a sum. 3/4/2025 is ambiguous (March or April), and D-010 says input is already clean and typed.
Status: tentative

## D-021 — 2026-10-26 — Malformed CSVs are rejected, not repaired (Claude Code choice, Adam to review)
Decision: Rows with the wrong number of fields, empty or duplicate header names, or a header with no data rows reject the whole file, with up to five messages that name the line.
Options considered: drop bad rows and continue; pad short rows.
Why: Repairing is data cleaning, which is out of scope (D-010), and dropping rows silently breaks the precision rule.
Status: tentative

## D-022 — 2026-10-26 — How the sample is marked as synthetic (Claude Code choice, Adam to review)
Decision: The file is src/data/sample-sales-synthetic.csv (2025, 200 rows: date, region, category, units, revenue), generated by scripts/make-sample.mjs with seed 511. "Synthetic" appears in the filename and in the UI. The CSV itself has no comment line, so it stays a plain one-header CSV. The generator plants three patterns (Outdoor peaks in summer, Electronics in Nov–Dec, West sells ~30% more units) so Phase 2 has something real to find.
Why: A comment line would make the sample unlike the CSVs users upload.
Status: tentative

## D-023 — 2026-10-26 — Long category lists are combined into "Other" (Claude Code choice, Adam to review)
Decision: Bars show at most 20 categories, multi-series lines at most 8, heatmaps at most 12 per axis. Past that, the smallest groups are combined into one "Other (n values)" mark, always listed last, and the chart notes say so. Nothing is dropped: the Other bar's value is computed from all the remaining rows.
Options considered: show everything (unreadable for 1,000 names); show the top N only (silently drops data).
Why: Keeps charts readable without breaking the precision rule.
Status: tentative

## D-024 — 2026-10-26 — Empty time periods and missing values in charts (Claude Code choice, Adam to review)
Decision: Rows missing any selected field are left out of that chart, and a note under the chart says how many. Empty periods count as 0 for counts and sums (a sum of nothing is 0). For a mean, an empty period has no value, so it is left out of the line and the note says how many periods were skipped. Heatmaps list every combination, so a zero shows as a pale cell instead of a hole.
Why: A chart must never silently drop or invent data (CLAUDE.md).
Status: tentative

## D-025 — 2026-10-26 — Which field goes on which axis (Claude Code choice, Adam to review)
Decision: Time charts always put the date on x, and bars always put the category on the bar axis, whatever the click order. Scatter and heatmap use selection order (first selected → x). Bars are horizontal so long category names stay readable. Scatter axes don't force zero, since position, not length, carries the value. Bars and histograms always start at zero.
Status: tentative

## D-026 — 2026-10-26 — Level 1 chart ideas (Claude Code choice, Adam to review)
Decision: Nothing selected → one idea per field. One field selected → that field alone, plus that field paired with each other field. Two selected → the pair, plus each field alone. Only combinations a rule covers are listed. Titles are plain descriptions of what the chart shows ("Sum of revenue by region"), not explanations of why that chart was chosen.
Status: tentative

## D-027 — 2026-10-26 — Chart colors (Claude Code choice, Adam to review)
Decision: Marks are navy (#181833) by default. With a highlight, the highlighted mark (or series) is orange (#FF7B2C) and everything else is grey. Multi-series lines use a muted hue palette with orange, amber, and the interface blue left out, so each keeps its one meaning (D-016). Heatmaps use a light-grey-to-navy lightness ramp, with white cell borders. (Updated 2026-10-28 for the new palette.)
Why: One accent for meaning (D-016); lightness for ordered values, hue for categories (DATA511-viz-principles.md §4).
Status: tentative

## D-028 — 2026-10-26 — What a history step contains (Claude Code choice, Adam to review)
Decision: A snapshot holds the slider level, selected fields, sum/mean choice, persona, and story card (chart fields, highlight, title, takeaway). The dataset is not in snapshots. Actions that change nothing don't create a step. Loading a new dataset starts a fresh history (old steps name columns the new file may not have) but keeps the persona and slider level. Added src/state.test.ts, which wasn't in the planned file list, because back/forward is a "Done when" item.
Status: tentative

## D-029 — 2026-10-26 — Story card chart and highlighting (Claude Code choice, Adam to review)
Decision: "Use this" copies the previewed fields and sum/mean choice to the card and clears any highlight; it never changes the card's title or takeaway. Highlighting works on the story card's chart (click a mark to highlight, click it again to clear). The preview in the assist layer is not clickable. On a multi-series line, clicking any point highlights that whole series. A custom persona with no name is named from its parts (e.g. "Retail analyst").
Status: tentative

## D-030 — 2026-10-26 — Slider and assist-layer mechanics (Claude Code choice, Adam to review)
Decision: The slider is a native range input stood up with CSS (keyboard and screen readers work). Its labels are also buttons, and Levels 2–3 are tagged "AI" and 0–1 "NO AI". Each panel fills the column's height; panels the user can't see are made inert so tabbing can't scroll the column behind the slider's back. The page opens on Level 2 without animating, and the column snaps back to the current panel when the window is resized. Dragging the slider across several levels records one history step per level crossed.
Status: tentative

## D-031 — 2026-10-26 — Name shown in the top bar (Claude Code choice, Adam to review)
Decision: The app is labeled "Autonomy Slider", not "Golden Analytics", so it can't be mistaken for Golden's own product or branding (D-016).
Status: tentative

## D-032 — 2026-10-26 — Level 0 and Level 1 details (Claude Code choice, Adam to review)
Decision: Level 0 is a row of field chips showing each field's type, with a #1/#2 badge for selection order (so it's visible which field drops off next). Level 1 cards show type, range (or top value), distinct and missing counts, and an unlabeled mini distribution (bins for numbers and dates, top 3 values for categories). Clicking a chart idea selects its fields. Both levels show the same preview of the current selection with the sum/mean toggle (only for charts that aggregate) and "Use this →", which reads "Update card" when the card already shows those fields. Level 0/1 content lives in src/components/Levels.tsx rather than inside AssistLayer.tsx as planned, so each file stays readable.
Status: tentative

## D-033 — 2026-10-26 — Render test for every chart rule (Claude Code choice, Adam to review)
Decision: chartRules.test.ts also compiles every rule's spec with Vega-Lite and renders it to SVG in Node, with and without a highlight.
Why: The number tests can't catch a spec Vega rejects; this catches it before the browser does.
Status: tentative

## D-034 — 2026-10-26 — Level 2 paths: the AI picks questions, code builds charts
Decision: Level 2 shows analytical paths. A path is plain data: a short question, a kind (trend, comparison, outlier, distribution, driver), 1–2 fields, sum or mean, an optional filter (a category column and one of its actual values), and its parent path. Code filters the rows and calls the existing buildChart; the AI never writes chart specs or numbers. "Go deeper" produces follow-up paths under a path, forming a tree.
Why: TODO(adam)
Status: revisited (see D-051: up to three filters)

## D-035 — 2026-10-26 — The AI call runs on the server
Decision: A serverless handler (api/suggest.ts, Vercel-style) holds the API key; the Vite dev server serves the same handler locally. Anthropic TypeScript SDK; model name from an env var with a fast, inexpensive default. It sends only the data profile, the persona (domain, role, purpose), and the parent path for "go deeper", never raw rows. It asks for exactly 3 paths of different kinds, tailored to the persona's purpose. Small token limits and timeouts; errors never crash the app. Not deployed yet.
Why: TODO(adam)
Status: decided

## D-036 — 2026-10-26 — Code validates every AI answer, and rules fill the gaps
Decision: Every field must exist and fit a chart rule; a filter must be on a category column with a value that occurs; the 3 paths must be different kinds; no path may repeat its parent. Invalid paths are dropped and rule-based paths top up the set. With no key, a failed call, or invalid output, a deterministic rule-based generator supplies the paths, labeled "Rules", with a quiet one-line notice. The app is fully usable without a key.
Why: TODO(adam)
Status: decided

## D-037 — 2026-10-26 — Level 2 UI and state rules
Decision: The panel shows the persona with a link to change it, a breadcrumb of the current branch (this is the breadcrumb D-009 deferred), and 3 path cards: kind chip, AI/Rules tag, question, small chart, "Go deeper" and "Use this →". "Use this" sends the chart to the story card with a "Suggested by AI/rules" label; the title and takeaway stay user-written. A quiet skeleton shows while loading. Suggestions are cached by dataset + persona + parent path, so back/forward and revisiting never re-call the AI. Changing the persona fetches fresh top-level paths but never resets the card or the Level 0/1 selection. Level 2 actions don't change the Level 0/1 selection; leaving Level 2 and coming back restores the branch. Back/forward covers going deeper, breadcrumb jumps, and "use this". Level 3 stays a placeholder.
Why: TODO(adam)
Status: decided

## D-038 — 2026-10-26 — Prompt file stays private
Decision: docs/MAIN_Prompts.md is untracked and gitignored; the local file is kept. Earlier commits still contain it: published history is not rewritten (see the git rules in CLAUDE.md). A history rewrite was made locally in Phase 2 and undone before it was pushed (AI_LOG #7).
Why: TODO(adam)
Status: decided

## D-039 — 2026-10-26 — Model and limits for the AI call (Claude Code choice, Adam to review)
Decision: Default model claude-haiku-5-5 (Anthropic's current fast, low-cost tier; checked against the current model list), overridable with ANTHROPIC_MODEL. Effort "low", max_tokens 1500, a 15-second server timeout with one retry, and a 20-second timeout in the browser. The reply format is enforced with the API's JSON-schema output option, written as a plain schema rather than with a schema library, so no new dependency besides the SDK.
Why: Three short paths are a quick task; speed matters more than depth here, and the validator is the real check either way.
Status: tentative

## D-040 — 2026-10-26 — Validation details (Claude Code choice, Adam to review)
Decision: Validation runs in the browser, because that's where the rows are (needed to check that a filter value occurs). A question over 20 words or 140 characters is dropped (the prompt asks for under 12). A filter may not be on a field the path also charts (it would leave one bar). "Repeats its parent" and "same chart as a sibling" both mean: same fields in any order, same filter, and the same sum/mean where the chart uses it. The server also copies only known fields out of each request before building the prompt, so nothing else the browser sends can reach the AI.
Status: tentative

## D-041 — 2026-10-26 — How the rule-based fallback picks paths (Claude Code choice, Adam to review)
Decision: Kind order by purpose: invest → comparison, outlier, trend, driver, distribution; reporting → trend, comparison, outlier, distribution, driver; testing a pattern → driver, distribution, outlier, trend, comparison; finding problems → outlier, trend, distribution, comparison, driver; exploring → trend, comparison, distribution, outlier, driver. The measure is the first number column. The outlier is the category value whose mean is furthest (relative to the rest) from the mean of the other groups' means, over every category × number pair, counting only groups of 5+ rows and columns with 3–50 groups. Go deeper filters to the parent's single top value (largest total of the parent's measure, or most rows) and then offers different kinds within that slice, so the three follow-ups stay different kinds. A parent that already has a filter keeps it (a path holds one filter), so third-level follow-ups can resemble their parent's siblings. If the data can't support three kinds (e.g. one number column), fewer paths are shown.
Status: tentative

## D-042 — 2026-10-26 — Mixing, notices, and the cache (Claude Code choice, Adam to review)
Decision: Valid AI paths come first, then rule paths top up. Three notices: no key ("AI suggestions are off…"), unreachable or error ("The AI couldn't be reached…"), partly invalid ("Some AI suggestions didn't pass the checks; rules filled the gaps."). Path ids come from tree position (p1, p1.2). The cache key is a dataset-load counter + the persona's domain, role, and purpose + the parent id; the persona's name is left out because it isn't sent to the AI. Top-level paths are requested as soon as the app opens, whatever the slider level. A key is requested once per session: if the AI call failed, that branch keeps its rule-based paths until the page is reloaded.
Status: tentative

## D-043 — 2026-10-26 — Level 2 in state and on the card (Claude Code choice, Adam to review)
Decision: A snapshot holds the branch as whole path objects (so the breadcrumb can be drawn from history alone). A persona change returns Level 2 to the top level. The story card stores the path's filter and source; "Use this" from Levels 0/1 clears both. A path already on the card shows a disabled "On the card" button. Any filter is named in the chart title ("· region = West") and in a note with its row count ("Only rows where region is West: 45 of 200.").
Status: tentative

## D-044 — 2026-10-26 — Level 2 visual details (Claude Code choice, Adam to review)
Decision: The AI tag is filled navy and the Rules tag outlined grey, so they read apart without using the orange accent (reserved for highlights). Path charts are 150 px tall. "Change" next to the persona focuses the top-bar picker and opens it where the browser allows, instead of a second picker. The Level 3 placeholder now says "Not built yet" (it said "Arrives in Phase 2").
Status: tentative

## D-045 — 2026-10-26 — Server code boundaries (Claude Code choice, Adam to review)
Decision: api/suggest.ts imports only types from src/, so the server never loads browser code and the browser bundle never contains the SDK (checked in the build output). The list of path kinds is therefore written twice, with `satisfies` and a test keeping them in sync. Server imports use explicit .ts extensions (Vite's upcoming config loader and Node's ES modules need them), and tsconfig now includes api/ and Node's types. The handler answers 503 (no key), 400 (bad request), or 502 (AI failed), always as JSON.
Status: tentative

## D-046 — 2026-10-26 — Fix: time axes lost their date format (Claude Code choice, Adam to review)
Decision: A headless-browser check showed Vega-Lite was dropping the axis date format (it rejects formatType 'utc' on axes and logs a warning), so axes fell back to default labels. The UTC scale already makes labels UTC, so the format is now set alone. A test checks that every time chart formats dates with utcFormat. This is a Phase 1 bug.
Status: tentative

## D-047 — 2026-10-28 — Bookshop sales as the default demo dataset
Decision: The app opens on Bookshop sales with the Store owner persona. The raw workbook (data/raw/Bookshop.xlsx, fictional data dated 2193) is committed, and scripts/prepare-bookshop joins Sales Q1–Q4 → Edition (ISBN) → Book → Info (BookID = BookID1 + BookID2) → Author and Publisher into src/data/bookshop-sales.csv: one row per item sold, with sale date (ISO), title, genre, format, publisher, author country, price, discount (missing = 0), and revenue = price × (1 − discount). The script fails on any unmatched join and prints row counts (56,350). It is the minimal upstream prep tool D-010 points to. The synthetic sample stays for tests.
Why: TODO(adam)
Status: decided

## D-048 — 2026-10-28 — How the Bookshop prep script works (Claude Code choice, Adam to review)
Decision: Python, standard library only: an .xlsx file is a zip of XML sheets, so it reads them with zipfile and xml.etree, and nothing has to be installed. Column names are exactly the words listed ("sale date", "author country", with spaces), so chart titles read naturally. Revenue is rounded to the cent. Besides unmatched joins, it also stops on duplicate lookup keys (an ambiguous join), a non-positive price, a discount outside 0–1, and a total other than 56,350. Two ItemIDs each appear on two different orders in Sales Q1 (107057-14-6001, 107057-88-4717, both with order 107057-2736 as the second). They look like ID collisions rather than copied rows, and the expected 56,350 counts both, so the rows are kept and the script lists them. A test checks the output: row count, types, the 2193 date range, and revenue on every row.
Status: tentative

## D-049 — 2026-10-28 — Demo data label and big charts (Claude Code choice, Adam to review)
Decision: The dataset flag `synthetic` is renamed `demo` (bundled demo data). Bookshop is fictional but not generated by us, so the tag reads "Fictional demo data" and the button "Use demo data". Charts with more than 5,000 data points are drawn on a canvas instead of SVG: the 56,350-point price × revenue scatter froze the page for about 3 s as SVG and about 1.7 s on canvas. The numbers and the clicks are unchanged.
Why: SVG adds one page element per mark.
Status: tentative

## D-050 — 2026-10-28 — Measure semantics: average-only numbers are never summed
Decision: The profiler classifies each number column as additive (can be summed: revenue, sales, amount, units, quantity, total) or average only (price, rating, discount, rate, percent, age, score, year), from its name. Average-only measures are never summed anywhere: rules, Level 1 ideas, the sum/mean toggle, AI paths (the validator rejects AI paths that sum one), and stories. Rules and suggestions prefer additive measures; a count of records is always available. Field cards show a quiet "average only" label. The AI receives each column's kind in the profile.
Why: TODO(adam)
Status: decided

## D-051 — 2026-10-28 — Insight checks, retry, and nested filters
Decision: Code runs three checks on every path's chart and shows them as quiet one-line notes labeled "Check", never as AI: a price/mix effect (a money ranking that differs from the count ranking, with an action to view the same comparison by count), small groups (under 30 records), and concentration (the top group holds 40% or more). They also become facts for Level 3. A failed AI call retries once by itself, then offers "Try again". A path holds up to 3 filters; a follow-up keeps its parent's filters and adds exactly one, so go deeper stays inside the chosen path (revisits D-034). Scatter plots combine identical points and size them by count, and only the visible level renders its previews.
Why: TODO(adam)
Status: decided

## D-052 — 2026-10-28 — Level 3: facts and slots
Decision: For any path, code computes a facts object (top item and value, share of total, gap to #2, first vs last period change, peak period, record count, check flags, …), each with an id and a display value. The AI, through a server-side handler like Level 2's that sees only the profile and the facts, returns a title and a one-line takeaway as templates referencing fact ids. Code validates and fills them: every slot must exist, and the AI's own text may contain no digits. Anything invalid falls back to rule templates from the same facts, labeled "Rules".
Why: TODO(adam)
Status: decided

## D-053 — 2026-10-28 — Level 3 behavior and provenance
Decision: If a Level 2 path is active, the story uses it; otherwise the AI picks the strongest top-level path (rules: the strongest check or largest change). One story card: title, chart, takeaway. "Try another angle" drafts from a different path. AI-drafted text shows an "AI draft" marker until the user edits it; once edited it is the user's. The chart keeps its source label. If the title or takeaway has been edited, Level 3 shows its draft beside the card with "Use draft" instead of replacing anything. Drafts are cached like suggestions; back/forward covers drafting, "Try another angle", and "Use draft".
Why: TODO(adam)
Status: decided

## D-054 — 2026-10-28 — How measures are classified (Claude Code choice, Adam to review)
Decision: The name is split into words ("unitPrice" → unit, price). Precedence: words that already mean an average or ratio (avg, mean, rate, percent, pct, share, %) → average only; then amount and count words (revenue, sales, amount, units, quantity, total, cost, profit, …) → additive, so "total_price" and "discount_amount" are sums of money; then per-record words (price, rating, discount, age, score, year, weight, …) → average only. "unit price" is average only. A name that matches nothing is average only: a mean is always a true statement, while a wrong sum looks confident and means nothing. A requested sum on an average-only measure is drawn as a mean everywhere, and the sum button is disabled with a tooltip.
Status: tentative

## D-055 — 2026-10-28 — Check definitions (Claude Code choice, Adam to review)
Decision: Price/mix runs on categories ranked by a sum of a money column (named revenue, sales, amount, cost, spend, profit, income, price, value). It fires if the #1 by money isn't the #1 by records, or a group in the top 5 moves 2+ places. "View by count" swaps that card's chart to the record count (card-local, not a history step); "Use this" then sends the count view. Small group counts categories and periods with records; empty periods already show as zeros. Concentration needs a total (sums and counts, not means) and only runs on categories. Check text includes its numbers, computed in code. All thresholds are named constants in src/checks.ts.
Status: tentative

## D-056 — 2026-10-28 — Level 3 details (Claude Code choice, Adam to review)
Decision: The "active" path is the one put on the card with Level 2's "Use this", else the one being explored with go deeper. Candidates are the active path, then the other paths Level 2 shows; "Try another angle" skips paths already drafted and starts over when all were used. Drafts are requested only while Level 3 is on screen. Filling an untouched card updates the current history step instead of adding one: back from Level 3 returns to before the slider moved. A card whose chart the user built in Level 0/1 counts as their work too, so it isn't filled. Text the user is still typing is never replaced; it becomes theirs on blur. Limits: title 14 words, takeaway 40, template 300 characters. Rule templates exist for rankings (with a price/mix sentence when present), averages, trends, spreads, two numbers, and category pairs; a filtered path's title ends with its slice, e.g. "(Fiction)". The panel says who picked the path (you, the AI, or rules) and lists the facts used.
Status: tentative

## D-057 — 2026-10-28 — Chart and suggestion details (Claude Code choice, Adam to review)
Decision: Scatter point area grows with the count (30–900 px²), with a note like "56350 records are shown as 58 points". Bars and heatmap rows get at least 17 px each, so a chart grows taller rather than overlapping labels, and axis labels that would touch are thinned. Rules prefer category columns with 2–12 values (genre before title), the same advice the AI gets. A follow-up's new filter is the parent's top value in a category it doesn't filter yet, ranked by the parent's measure only if it is additive. The AI prompt now says follow-ups must answer the parent's question and keep its measure, steer away from columns with many values unless filtered, and take the fictional dates as given. Failed calls wait 600 ms before the one retry; a missing key is never retried.
Status: tentative

## D-058 — 2026-10-30 — More Bookshop columns, a roles file, and what stays out
Decision: The prep script adds four columns after the existing nine, which stay unchanged: author (First Name + Last Name via Book.AuthID), award winner (yes/no: title is in the Award sheet), series (Series Name via Info.SeriesID, empty if none), book id. An Award title or SeriesID that doesn't match stops the script. It also writes src/data/bookshop-sales.roles.json with one role per column: sale date = date; title, author = entity; genre, format, publisher, author country, series = category; price = price; discount = rate; revenue = money; award winner = flag; book id = id (counted, never charted or scanned for concentration). The app doesn't read the roles yet. Publisher."Marketing Spend" (one value per publisher) and Ratings (one row per review) are not added. BookshopLibraries.xlsx (LibraryProfile: one row per library and staff type; Catalog: one row per library and ISBN with a copy count) is not joined; its use is undecided.
Why: TODO(adam)
Status: decided

## D-059 — 2026-10-30 — Check engine: registry, severity, evidence, roles
Decision: Each check declares an id, its preconditions (a skip reason or null), and a run function (a finding or null). runChecks returns { findings, skipped }; skipped is for tests and logs only, never the UI. Findings carry a severity: mix is misleading when the #1 changes, caveat when only a lower group moves; small is misleading when the group ranked first is small (for time charts, the highest-value period counts as ranked first), caveat otherwise; concentration is a caveat. Findings carry structured evidence next to their text; existing text strings are unchanged. Roles come from a validated roles file (every column exactly one known role); with roles, mix uses the "money" role, and the name guess is only the fallback for a CSV without roles. Charts on an "id" column are never checked. The app keeps unknown roles in this phase, so the UI is unchanged.
Why: TODO(adam)
Status: decided

## D-060 — 2026-10-30 — The "driven by one entity" check
Decision: For category charts summed or counted, with roles known: within the top group, find the single entity (any "entity" column except the chart's own field) with the largest share of the group's value. Misleading when removing that entity's rows everywhere and re-ranking drops the group out of first place; caveat when it stays first but the entity holds at least 50% (ENTITY_SHARE). Text: "{entity} accounts for {share} of {measure} in {group}." plus, when misleading, "Without that {column}, {group} ranks {rank}." Entity columns the chart field already determines (each group has one value, e.g. author on a chart of titles) are left out; that guard was Claude Code's catch, kept by Adam.
Why: TODO(adam)
Status: decided

## D-061 — 2026-10-30 — Fragile lead, and "driven by" needs half the group
Decision: The entity check reports only when the top group's largest entity holds at least 50% of it: misleading if removing its rows everywhere drops the group from first, caveat if not. Below 50% it says nothing. A new caveat check, fragile lead, covers category charts summed or counted: it fires when top ÷ second < 1.10 (NARROW_LEAD; practical, not statistical, significance: the data is the whole population, so the gap is real but small enough that ordinary changes erase it), or, with roles known, when removing the top group's largest entity (under 50%) flips first place. It skips when the second group's value is zero or less. Text: "{top} is only {gap} ahead of {second}, a lead small enough that ordinary changes could erase it." (gap with one decimal); an exact tie reads "{top} is tied with {second}, so ordinary changes could decide first place."; a flip with a clear gap reads "{top} leads {second} by {gap}, but without {entity} (one {column}), {top} ranks {rank}." (the last two are Claude Code's wording, for Adam to review). Bookshop: fires on revenue by title, award winner, and format (narrow) and count by award winner (Carolyn Segal flip).
Why: TODO(adam)
Status: decided

## D-062 — 2026-10-30 — The dataset contract: facets, rowNoun, roles decide summing
Decision: The roles file is { rowNoun: { one, many }, columns: { name: { role, facet? } } }. Facets are offering, source, place, allowed only on category and entity columns; no "attribute" facet, so a yes/no column is a flag with no facet. rowNoun stores both forms and defaults to record/records. Bookshop: "item sold"/"items sold"; genre, format, series = offering; publisher, author = source; author country = place. When roles are known they decide what can be summed: money is additive, every other role is average-only; the name-based guess is the fallback without roles.
Why: TODO(adam)
Status: decided

## D-063 — 2026-10-30 — Dataset-level findings and generality evidence
Decision: datasetFindings runs the checks over a list of views and reports each entity named by a finding (entity check or fragile-lead flip) in 2 or more views (DATASET_MIN_VIEWS), with the views, the checks, and its share of the whole dataset's total per measure. Engine only. Generality evidence: property tests on datasets from a small seeded generator (mulberry32, no new library), 200 seeds plus degenerate cases, with roles known and unknown; invariants: no check throws, an average-only measure is never summed, the same input gives the same findings. A test fails on any string literal in app code equal to a Bookshop column name or value unless it is on an allowlist with a reason; comments are reported, not failed.
Why: TODO(adam)
Status: decided

## D-064 — 2026-10-30 — Options are built by code; repairs come only from checks that know a sturdier view
Decision: The menu has one comparison per readable category, entity, or flag column (2 to 12 groups; without roles, any category column) and one trend over the date column, each by the money measure (the "money" role; without roles, the first number a sum makes sense of) or by count when there is none. Questions are templates with the row noun: "Which {column} brings in the most {measure}?", "Which {column} has the most {many}?", flags "How does {measure} split by {column}?" / "How do {many} split by {column}?", trends "How has {measure} changed over time?" / "How has the number of {many} changed over time?". Each option carries id, question, kind, view, facet, findings with severity, and its effect size (comparisons: effective number of groups, 1 ÷ Σ share²; trends: peak ÷ trough). When an option has a misleading finding whose check supplies a sturdier view (today only price/mix's count view), the repaired view is added as its own option linked by "repairs"; the original stays. Other checks produce no repairs.
Why: TODO(adam)
Status: decided

## D-065 — 2026-10-30 — Eligibility and the rules highlight
Decision: Eligible: no misleading finding; caveats don't disqualify. Rules rank eligible options by the purpose's kind order (KIND_ORDER), then its preferred facets, then effect size (only within one kind), then menu order. Preferred facets: deciding where to invest: offering, place; reporting results upward: offering; testing whether a pattern is real: none; finding problems to fix: source, place; just exploring: none. With nothing eligible, the least flagged option (fewest misleading, then fewest caveats, then effect, then menu order) is labelled "best place to start", with the spec's draft copy, and the AI is not asked. Rules reasons mention a check only when a check caught something. The facet, kind, and repair reason lines in code are Claude Code's stand-ins (TODO(adam)): Adam's approval left them as "[my wording]" placeholders. Bookshop with no key: store owner → format by items sold; the other presets and "just exploring" → revenue over time.
Why: TODO(adam)
Status: decided (reason wording pending)

## D-066 — 2026-10-30 — The AI picks the highlight
Decision: A new server handler, /api/highlight (api/suggest.ts stays until Phase 4), receives the eligible options only (id, question, kind, facet, findings as {check, severity}), the profile summary, and the persona, never rows, and returns { id, reason }. The browser accepts it only if the id is eligible and the reason is 1 to 140 characters with no digits; anything else, or no key, or no reply, falls back to the rules highlight with a quiet notice ("AI highlighting is off (no API key), so rules picked this." / "The AI couldn't be reached, so rules picked this." / "The AI's pick didn't pass the checks, so rules picked this."). The result is cached per dataset and persona.
Why: TODO(adam)
Status: decided

## D-067 — 2026-10-30 — Single-cycle caveat
Decision: A caveat on any chart over time whose dates span one year or less (SINGLE_CYCLE_DAYS = 366): with each season shown once, seasonality can't be separated from growth. Fixtures: 11 months fires, 25 months stays quiet. Every Bookshop trend gets it.
Why: TODO(adam)
Status: decided

---

## Parking lot (ideas not yet decided)
- **Requirements elicitation as the product problem.** Non-technical users often don't know what's possible or what "good" looks like, so a technical person has to question them to find out what they actually want. Explore as a product idea and a psychological question.
