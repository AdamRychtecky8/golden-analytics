## First build prompt

Read CLAUDE.md and everything in docs/ first. Then propose a plan for Phase 1 below and wait for my approval before writing any code.

## What we're building
An analytics workspace for non-technical users built around an "autonomy slider." The user loads a dataset, and a vertical slider controls how much the AI helps:
- Level 0 — Explore: all fields, free building, no guidance.
- Level 1 — Map: field cards plus rule-based chart ideas for the selected fields ("here's what you can show"). No AI.
- Level 2 — Suggest (the main focus): analytical paths. Each path is a question with a chart that answers it, and the user can go deeper on any path, forming a tree of questions. AI chooses the questions; code computes every number.
- Level 3 — Story: the AI generates a full story card (title, chart, one-line takeaway), clearly marked as AI and editable.
The output is a story card. The slider can be moved at any time.

Suggestions are tailored to a persona (who the user is and why they're here). A default persona is pre-selected so the user gets value immediately, and they can switch to another preset or build their own.

## Decisions already made (see docs/DECISIONS.md)
- Default level: 2 (Suggest).
- Slider: vertical, on the left edge, Level 3 at the top, Level 0 at the bottom. Moving it scrolls the assist layer vertically to that level (smooth, ~350 ms ease, snapping to whole levels, respecting prefers-reduced-motion). The slider, top bar, and story card stay pinned.
- Slider rule: moving up adds AI layers, moving down hides them, and the user's own work is never overwritten. Selections carry across levels.
- History: back/forward through states, plus a breadcrumb showing the current branch of the path tree.
- Input: a clean, typed CSV (one header row, one row per record, consistent column types). Data cleaning and classification are out of scope; they belong to an upstream tool.
- Hybrid architecture: code computes every number. The AI (Phase 2) only chooses and phrases, sees only the data profile and the persona (never raw rows), and the app must fully work without AI.
- Chart choice is deterministic and rule-based. No chart explanations in the UI; the reasoning lives in code comments.
- Persona: a picker in the top bar with a few presets plus "build your own." A default preset matching the sample data is pre-selected. The persona is stored in app state as a context object (domain, role, purpose) for Phase 2 suggestions to use. In production this would come from upstream user classification and history; here the user picks it.

## Visual style
Inspired by Golden Analytics' site, not copying it (no logo, no brand assets): warm cream/off-white base with deep navy text, one orange accent reserved for what matters (selected items, the highlighted data point), monospace uppercase letter-spaced labels, thin hairline rules as structure, square corners, no gradients, no drop shadows, no emoji. Principle: the UI follows the same rules as good charts (grey for structure, one accent for meaning, no decoration that doesn't carry information).

## Phase 1 scope: no AI yet
Stack: Vite + React + TypeScript. CSV parsing: Papa Parse. Charts: Vega-Lite (via vega-embed). Styling: plain CSS, readable over clever.

1. Load data: file upload, plus a bundled synthetic clean sample (~200 rows of retail-style sales: a date, two category columns, two number columns), clearly labeled as synthetic.
2. Profiler: detect each column's type (nominal, quantitative, temporal), range or top values, and missing count. Pure functions in their own module, with unit tests.
3. Persona picker in the top bar:
   - Presets (each with domain, role, purpose): Store owner (retail, deciding where to invest) as the default; Marketing analyst (business, reporting results upward); Researcher (science, testing whether a pattern is real); Program manager (nonprofit, finding problems to fix).
   - "Build your own": choose domain, role, and purpose from short lists, with an optional name.
   - Changing the persona never resets the user's work.
4. Layout: vertical slider on the left, the scrolling assist layer in the middle, the story card pinned on the right.
5. Level 0: plain field list; clicking fields builds a chart. Level 1: field cards (type, range, mini distribution) plus rule-based chart ideas for the current selection. Levels 2 and 3: placeholder panels ("arrives in Phase 2") that display the current persona, but the slider and scrolling must be fully functional.
6. Chart rules (code only, each commented with its reasoning from docs/context/DATA511-viz-principles.md): temporal + number → line; category + number → sorted bars; number + number → scatter; one number → histogram; one category → bar of counts. Maximum 2 fields selected in Phase 1.
7. Story card: editable title and takeaway (user-written in Phase 1). Clicking a bar or point highlights it in the accent color and greys out the rest.
8. History: every user action (including persona and slider changes) saves a state snapshot; back/forward buttons move through them.

Out of scope for Phase 1: AI calls, backend, deployment, data cleaning, the path tree's AI suggestions, learning about the user.

## Done when
- `npm install` then `npm run dev` opens the app with the sample data and default persona loaded
- I can move the slider and see the assist layer scroll smoothly, switch or build a persona, click fields, see the correct chart, highlight a mark, edit the story card, and go back/forward
- Profiler and chart-rule tests pass
- docs/RUNNING.md explains how to run the app and the tests
- docs/AI_LOG.md and docs/DECISIONS.md are updated

## Working style
- Keep the file structure small. Before coding, give me a one-line description of every file you plan to create.
- The first time each React/TypeScript pattern appears, explain it in 2–3 plain sentences.
- Commit after each working step. Before each commit, suggest the message and explain why it's worded that way, so I learn the conventions.

## Second Build Prompt