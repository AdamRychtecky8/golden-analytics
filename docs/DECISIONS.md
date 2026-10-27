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
Status: direction set; no product chosen yet

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

---

## Parking lot (ideas not yet decided)
- **Requirements elicitation as the product problem.** Non-technical users often don't know what's possible or what "good" looks like, so a technical person has to question them to find out what they actually want. Explore as a product idea and a psychological question.
