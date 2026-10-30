# SPEC — "Before you present it"

> Draft written by the review chat from Adam's decisions on Oct 30, 2026. Adam edits this; Claude Code builds from it. Anything marked TODO(adam) is undecided.

## The problem
Non-technical users rarely fail at making a chart. They fail at the next step: drawing a conclusion and saying it to someone. The naive reading of a chart is often wrong in predictable ways (a big total that is really one author, a top seller that is really just expensive). Most tools stop at the chart. This one stops at the meeting.

Thesis: TODO(adam) (one sentence, in your words)

## Who it's for
Smart, motivated business users with real questions and no data training. They may arrive with a question, or with none (directed vs. exploratory, DATA 511).

## The flow
1. **Choose.** Code generates basic options from the data's columns and roles. The AI highlights one as most important for the user's persona, with a one-line reason. The user can pick any option, the highlight, or prompt a different path.
2. **Check (invisible).** Checks run in the background on every flow. The user sees nothing unless a check catches something.
3. **Build.** Code picks the chart (existing rules) and computes every number.
4. **Present (the main screen).** One card, the chart as hero:
   - **Say this:** headline (AI-phrased, numbers from code) + 2–3 verified talking points
   - **Don't say this:** the tempting claims a check caught, each with a one-line reason and its evidence
   - **If they ask:** 1–2 anticipated questions with answers
   - **What this data can't tell you:** always present, one line (e.g., cause)
   All text editable; AI-written text marked as AI.
5. **Explore.** Every flow is kept as a node in a tree. The user can go back to any earlier idea and branch from it without losing anything.

## The boundary (enforced in code)
Code decides what is true and how it is drawn. The AI decides what is relevant and how it is said.
- The AI sees the data profile and persona, never raw rows (D-011).
- The AI never writes a digit (facts and slots, D-052).
- The app works fully without an API key (rules fallback for the highlight and the wording).

## The highlight: what "most important" means
Code measures, the AI judges among real candidates, code verifies the AI returned a real candidate ID.
**Decision:** the highlight favors robust findings (paths that survive the checks). Trap paths still appear as ordinary options. In the demo, picking one shows the checker catching it; the rejected design ("highlight the trap because it demos better") is documented as a decision.

**How it's chosen: gates, then rank. No weights** (a weighted score was rejected: its weights would be numbers no one could defend, and it would multiply an AI opinion by a coefficient).
1. **Eligible (code):** no *misleading* finding, and enough records per group. *Caveat* findings don't disqualify.
2. **Most relevant (AI):** picks one eligible option for the persona's decision; returns its ID plus a one-line reason with no digits. Code rejects any ID not in the eligible set and falls back to rules. No key: a fixed table maps the persona's purpose to preferred kinds (e.g., "deciding where to invest" → comparison, then trend).
3. **Tie-break (code, fallback only):** preferred facet for the persona's purpose (see Generality), then effect size within the preferred kind, then fixed option order. The same data and persona always give the same highlight.
The highlight is cached per dataset + persona, so it doesn't change on revisit.

**Check severity** (each check declares one):
- *Misleading*: the naive reading is wrong (mix when the #1 changes; driven by one entity; small group when it's the one ranked first). Disqualifies.
- *Caveat*: true but worth saying (concentration within the chart; small groups in the tail; a fragile lead). Doesn't disqualify.

**Effect size per kind** (a tie-breaker only, compared within one kind, never across kinds):
| Kind | Effect size |
|---|---|
| comparison | effective number of groups, 1 ÷ Σ(share²): how many genuine contenders there are. Higher is better. (Top ÷ second was rejected as a tie-break: it rewards dominance, which the concentration check penalizes.) |
| trend | peak period ÷ trough period (periods with records) |
| outlier | most extreme group ÷ median group |
| distribution | 90th percentile ÷ 10th percentile |
| driver | absolute correlation, \|r\| |
If the denominator is zero or missing, the option gets no effect size and sorts last within its kind.

**If nothing is eligible** (code only, no AI pick): highlight the least-flagged option, ordered by fewest misleading findings → fewest caveats → larger effect → fixed order. Shown gently, as a different frame rather than a warning:
- Label: "Best place to start" (instead of the normal highlight label)
- One line, framed as insider knowledge: "Every option in this data has a catch. This one's is the easiest to work around, and we'll show you how." (draft copy: TODO(adam) final wording)
- No red, no warning icon; the details appear on the present card under "Don't say this," where they belong.

## Checks
Each check is a pure function: (view, data, roles) → finding | null. Each declares its preconditions and skips visibly in logs (not UI) when unmet. Each has a planted-bias fixture where it must fire and a clean control where it must not.
| Check | Exists? | Catches |
|---|---|---|
| Mix (totals vs. units) | yes (checks.ts) | "Hardcover is our top format" (38% of revenue, 21% of units) |
| Small group | yes | "Mystery performs best per title" (3 titles) |
| Concentration (within the chart) | yes | one group dominating the chart |
| Driven by one entity | yes (D-060) | "Sci-Fi is our best genre" (one author is 33% of all revenue; without her, Sci-Fi is #4). Misleading only when removing the entity drops the group from first **and** the entity holds ≥ 50% of the group; a flip from a smaller entity is a fragile lead, not "driven by" |
| Fragile lead | yes (D-061) | "Hardcover is our top format": first place is less than 10% ahead of second (top ÷ second < 1.10), **or** (roles known) removing the single largest entity in the top group flips first place while that entity is under half the group (half or more is "driven by"). Caveat. The 1.10 is practical significance, not statistical: the data is every sale, so the gap is real, but ordinary changes would erase it |
| Can't verify | always | cause, trend vs. season in one year of data |

**Dataset-level findings:** when the same entity drives findings in several options, the engine reports it once as a fact about the whole dataset ("One author drives a third of all revenue"), so the UI can say it once instead of on every card. Detected in Phase 3a (D-063); displayed in Phase 5.

## Prompt-a-path (the most regulated AI piece)
1. AI sees the user's text + the profile. Returns only structure: a path spec, or a refusal with a category. Never prose answers or numbers.
2. Code validates the spec (fields exist, aggregate legal, groups large enough). The AI can't approve its own output.
3. Undefensible requests are told back with the nearest defensible alternative. Categories: not in the data, causal, meaningless operation, too few cases, beyond the data (forecasting), loaded framing. Final list: TODO(adam)
4. The user confirms the structured path before it's built; labeled "AI translated your request."
5. An evaluation set of ~20 prompts with expected outcomes (build / reframe / refuse), run as tests.

## Generality: Bookshop is the test case, not the target
Bookshop reveals failure modes; every fix must work on any dataset. Rule: **app code is keyed to roles, facets, and data shape, never to column names or values.**
- **The dataset contract** (the roles file, written by hand here and by an upstream classifier in production) declares each column's role, an optional facet, and the dataset's `rowNoun`.
- **Facets** say what kind of thing a category is: *offering* (what the business sells or does), *source* (who supplies or creates it), *place* (where). Only category and entity columns have one; a yes/no column is a flag, with no facet. The persona's purpose prefers facets (e.g., "deciding where to invest" → offering, then place). No facets → kind order + effect only.
- **rowNoun** names one row in both forms ("item sold" / "items sold"), so code-written questions read naturally; default "record" / "records".
- **Invariant:** a tie-breaker may never reward a property a check penalizes.
- **Evidence:** (1) property-based tests on generated datasets, including degenerate ones; (2) a test that fails if Bookshop column names or values appear in app code; (3) a second dataset run through the same flow (after the core flow works).

| What Bookshop showed | General mechanism |
|---|---|
| Top ÷ second rewarded dominance | Comparison tie-break = effective number of groups; the invariant above |
| One author in finding after finding | Dataset-level findings |
| Author on a title chart always fires | Functional-dependency guard |
| 5–12% leads flip when anything is removed | Fragile-lead caveat (< 1.10, or a smaller entity tips first place) |
| "Records" reads badly | rowNoun |
| Guessing money from names | Roles first, names as fallback (roles also decide what can be summed) |

## Data
Bookshop sales (fictional, 2193), one row per item sold, joined by `scripts/prepare-bookshop.py`, with a roles file declaring each column's role (date, money, price, rate, category, entity, flag, id), facet (offering: genre, format, series; source: publisher, author; place: author country; award winner is a flag with no facet), and rowNoun ("item sold" / "items sold"). Real values only: planted effects exist only in test fixtures.
Excluded: marketing spend and ratings (reason: TODO(adam)); BookshopLibraries (holdings, not sales; future work).

## Out of scope (future work)
Arbitrary datasets (needs an upstream semantic classifier to write the roles file), learning the user over time, ratings and library tables, a drawn tree map (stretch).

## Build phases
0. This spec + DECISIONS entry for the pivot. Tag `slider-concept` before removing anything.
1. Dataset columns + roles file. (done, D-058)
2. Check engine: registry, roles, new entity check, fixtures. No UI. (done, D-059, D-060)
3a. Generality: contract with facets + rowNoun, fragile-lead check, entity share rule, dataset-level findings, property tests, no-Bookshop test. No UI. (done, D-061 to D-063)
3b. Options + highlight: one comparison per readable category (by the money measure, or by count with none) plus one trend; code-written questions; AI picks an eligible ID + no-digit reason; rules fallback.
4. Flow tree + remove slider and levels.
5. Present card.
6. Prompt-a-path + eval set.
7. User testing, video, README (README by Adam).