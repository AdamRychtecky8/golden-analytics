# Golden Standard: design

## The problem

Non-technical users rarely fail at making a chart. They fail at the next step: drawing a conclusion and saying it to someone. The naive reading of a chart is often wrong in predictable ways: a top genre that is really one author, a top format that is really just expensive. Most tools stop at the chart. Golden Standard stops at the meeting: before you present it, it tells you what you can say, what you shouldn't, and what the data can't tell you ([decision 1](DECISIONS.md#1-pivot-from-the-autonomy-slider-to-before-you-present-it)).

## The flow

1. **Choose.** Code builds a menu of questions from the data's columns and roles. One is highlighted for the user's persona, with a one-line reason. The user can pick any question, ask their own, or build a chart by hand.
2. **Check.** Six checks run on every chart. The user sees nothing unless one catches something ([decision 10](DECISIONS.md#10-checks-run-invisibly-what-this-data-cant-tell-you-is-always-shown)).
3. **Build.** Code picks the chart type from the field types and computes every number ([decision 2](DECISIONS.md#2-code-decides-whats-true-the-ai-decides-whats-relevant-and-how-its-said)).
4. **Present.** One card, with the chart as hero: Key talking points, Caution around these, If they ask, and What this data can't tell you. Every line is editable.
5. **Explore.** Every question is a node in a tree: click a bar to go deeper into that group, switch persona, or branch from any earlier node. Nothing is deleted; back/forward follow the visit order like a browser ([decision 12](DECISIONS.md#12-a-tree-of-flows-instead-of-linear-history)).

## The boundary between code and AI

Code decides what is true and how it is drawn. The AI decides what is relevant and how it is said. Enforced in code, not in prompts ([decision 2](DECISIONS.md#2-code-decides-whats-true-the-ai-decides-whats-relevant-and-how-its-said)):

- The AI sees a profile summary and the persona, never rows.
- The AI never writes a digit. Card text is templates with slots filled from computed facts; AI-written text with a digit of its own is rejected.
- Every AI reply is checked before use: a highlight must name an eligible option, a reworded block must use exactly the code's slots, a typed question must become a valid chart.
- The app works fully without an API key. Only typed questions need one.

## Checks

Each check declares preconditions (and skips with a logged reason when they fail), a severity, and evidence. *Misleading* means the naive reading is wrong, and keeps a question from being highlighted; *caveat* means true but worth saying ([decision 5](DECISIONS.md#5-checks-rate-each-finding-as-misleading-or-caveat-only-misleading-disqualifies)). A finding must be able to have been otherwise: "one author is 100% of a series only she wrote" is not reported ([decision 6](DECISIONS.md#6-a-finding-must-be-able-to-have-been-otherwise)). Each check has a planted fixture where it must fire and a control where it must not.

| Check | Catches (Bookshop) | Card section |
|---|---|---|
| Price/mix | "Hardcover is our top format": first by revenue, far behind by items sold | Caution (if the #1 changes); If they ask (a lower group moves) |
| Driven by one entity | "SciFi/Fantasy is our best genre": one author is 79% of it; without her it ranks 4th | Caution (misleading); talking point (caveat) |
| Small group | a top group with under 30 records | Caution (ranked first); If they ask (in the tail) |
| Fragile lead | first place under 10% ahead, or tipped by a smaller entity | Caution, softer wording |
| Concentration | one group holding 40% or more | Talking point |
| Single cycle | "Sales are growing" from one year of dates | What this data can't tell you |

When one entity shapes several charts, the card says so once, above its sections.

## The highlight

Gates, then rank; no weighted score ([decision 9](DECISIONS.md#9-gates-then-rank-no-weighted-score)). Code makes an option eligible (no misleading finding). With a key, the AI picks one eligible option for the persona and gives a reason with no digits; code rejects any other answer and falls back to rules. Without a key, rules rank by the persona's purpose: kind first (comparison or trend), then facet (offering, source, place), then fewer caveats, then effect size, then menu order. If nothing is eligible, the least-flagged option is shown as "Best place to start". The highlight favors robust questions; trap questions stay on the menu, where picking one shows the checks at work ([decision 8](DECISIONS.md#8-the-highlight-favors-robust-options-trap-questions-stay-in-the-menu)).

## The card

Code builds every block from facts, so the card works with no AI and every number traces to rows. Cautions read "Tempting to say" → "Why to be careful" → "Say instead" ([decision 7](DECISIONS.md#7-cautions-reveal-what-the-chart-hides-each-finding-is-routed-to-the-section-where-it-helps)). The headline may never assert what a caution warns against or what the data can't tell; when a caution applies, the headline is its "Say instead", locked from AI rewording, and property tests check the rule on generated datasets ([decision 11](DECISIONS.md#11-the-headline-is-locked-and-safety-text-is-never-sent-to-the-ai)). With a key, the AI may reword only the talking points and questions, with the same slots; cautions and the can't-tell line are never sent. A user's edit always wins.

## Asking your own question

The most regulated AI piece ([decision 13](DECISIONS.md#13-typed-questions-structured-output-code-validation-an-independent-word-guard-and-confirmation-before-building)). The AI translates the question into structured JSON only: build, clarify (an ambiguous word), reframe (causal, forecasting, a meaningless total, loaded framing), or refuse (not in the data, unrelated). Code validates every chart against the data ([decision 14](DECISIONS.md#14-the-measure-gets-its-own-required-slot-the-fix-from-the-live-eval)), and an independent word guard turns any causal or forecasting question into a reframe whatever the AI said. Every message the user reads is a code template. Nothing is added to the tree until the user confirms the chart, shown in plain words. An eval set of 32 cases runs offline against faked replies (including deliberately wrong ones) and, with `npm run eval:ask`, against the real model: 19 of 20 on each of three runs; 20 of 20 counting one reading I accepted (sales as revenue or items sold).

## Generality

Bookshop is the test case, not the target. App code is keyed to roles, facets, and data shape, never to column names or values; a test fails if a Bookshop name or value appears in app code. A dataset contract declares each column's role, facet, and what a row is called ([decision 4](DECISIONS.md#4-generality-through-a-dataset-contract-roles-facets-row-noun-never-column-names)). Every fix found on Bookshop became a general mechanism (a tie-break that can't reward what a check penalizes, dataset-level findings, the fragile lead), and property tests check the invariants on 200 generated datasets.

## Data

Real Bookshop sales (fictional data, dated 2193), one row per item sold, joined from the raw workbook by a prep script that checks every join. Nothing is planted in it: planted effects exist only in the test fixtures ([decision 3](DECISIONS.md#3-real-data-only-planted-effects-live-only-in-test-fixtures)). Marketing spend, ratings, and library holdings are left out (reason: TODO(adam)).

## Limits

- An uploaded CSV has no contract, so checks that need roles skip and summable measures are guessed from column names (English words).
- The checks look at one chart at a time, except the dataset-level entity line.
- Bookshop covers one year, so every trend carries the single-cycle caveat.
- Deployed at https://golden-analytics-ten.vercel.app/ with an API key set. The Bookshop CSV ships inside the app's JavaScript, so the first load is about 660 KB compressed (9 MB unpacked).
- No automated end-to-end browser tests; the UI was checked in a headless browser by hand.

## With more time

- An upstream classifier that writes the dataset contract for any upload.
- A contract flag to never send a column's values to the AI (e.g. customer names).
- Editing a typed question's filters in "Build my own chart".
- The ratings and library tables (holdings, not sales).
- Parse each row once for all checks (the remaining cost on large data) ([decision 15](DECISIONS.md#15-measure-before-optimizing-the-cleanup-had-to-leave-output-byte-identical)).
- A second dataset through the same flow.
- An offline AI judge for the AI's wording quality.
