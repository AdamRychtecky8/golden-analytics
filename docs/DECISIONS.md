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
Decision: Inspired by Golden Analytics' site, not copied (no logo, no brand assets): warm cream base, deep navy text, one orange accent reserved for what matters, monospace uppercase letter-spaced labels, hairline rules, square corners, no gradients, shadows, or emoji.
Why: The UI follows the same rules as good charts: grey for structure, one accent for meaning, no decoration that doesn't carry information.
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
Decision: Marks are navy by default. With a highlight, the highlighted mark (or series) is orange and everything else is grey. Multi-series lines use a muted hue palette with orange left out, so orange always means "highlighted." Heatmaps use a cream-to-navy lightness ramp.
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

---

## Parking lot (ideas not yet decided)
- **Requirements elicitation as the product problem.** Non-technical users often don't know what's possible or what "good" looks like, so a technical person has to question them to find out what they actually want. Explore as a product idea and a psychological question.
