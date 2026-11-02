# Decisions

The fifteen calls a reviewer is most likely to ask about. Each says what was decided, what was rejected, and why.

## 1. Pivot from the autonomy slider to "before you present it"
- **Decision:** Replace the four-level slider (explore yourself up to "the AI writes the story") with one flow that ends at the meeting: pick a question, then see what you can say, what to be careful with, and what the data can't tell you. The old app is tagged `slider-concept`.
- **Rejected:** Improving the slider; merging Levels 2–3 into AI paths; a standalone "bias checker" (audit framing); a "define your word" lens; a waterfall decomposition (Power BI already has one).
- **Why:** TODO(adam)

## 2. Code decides what's true; the AI decides what's relevant and how it's said
- **Decision:** Code builds the menu, computes every number, and runs every check; the AI only picks among options code made, rewords code's templates, or translates a typed question into a spec code validates. It sees a profile summary, never rows, and never writes a digit. The app works fully without a key.
- **Rejected:** The AI writing questions/paths with code validating afterward (my first design); the AI phrasing every block; a chat-with-your-data interface.
- **Why:** TODO(adam)

## 3. Real data only; planted effects live only in test fixtures
- **Decision:** The demo is the real Bookshop sales data, joined by a prep script that checks every join; nothing in it is edited or planted. Each check gets small synthetic fixtures instead: one where it must fire and a control where it must not.
- **Rejected:** Editing or planting values in the demo data to make pitfalls appear.
- **Why:** TODO(adam)

## 4. Generality through a dataset contract (roles, facets, row noun), never column names
- **Decision:** App code is keyed to roles, facets, and data shape. A contract file declares each column's role and facet and what a row is called; a test fails if a Bookshop column name or value appears in app code, and property tests run on 200 generated datasets.
- **Rejected:** Preferring Bookshop columns (format, genre) in code; roles guessed only from column names (kept only as the fallback for uploads).
- **Why:** TODO(adam)

## 5. Checks rate each finding as misleading or caveat; only misleading disqualifies
- **Decision:** Every finding is *misleading* (the naive reading is wrong: it keeps the option from being highlighted) or a *caveat* (true but worth saying: it stays eligible).
- **Rejected:** Any finding disqualifies an option (it would have ruled out items sold by format over a true concentration fact); a single severity level.
- **Why:** TODO(adam)

## 6. A finding must be able to have been otherwise
- **Decision:** A finding that is true by definition is not reported. The entity check needs at least two different entities in the group it describes, and a "without it" that leaves the group with records and a positive value; a property test checks this on generated data.
- **Rejected:** A column-level dependency guard only (it missed the one-author series).
- **Why:** TODO(adam)

## 7. Cautions reveal what the chart hides; each finding is routed to the section where it helps
- **Decision:** A caution is a claim that would be wrong or misleading, usually something the chart hides; a true fact the chart shows is a talking point. One routing table sends each check and severity to Key talking points, Caution around these, If they ask, or What this data can't tell you; cautions about one group merge into one entry.
- **Rejected:** Listing every finding under "Don't say this"; striking through the claim; three separate cautions about the same group (merged instead); capping at two.
- **Why:** TODO(adam)

## 8. The highlight favors robust options; trap questions stay in the menu
- **Decision:** Only options with no misleading finding can be highlighted. Questions a check flags stay in the menu as ordinary options, so picking one shows the checks at work.
- **Rejected:** Highlighting the trap because it demos better.
- **Why:** TODO(adam)

## 9. Gates, then rank: no weighted score
- **Decision:** Code gates (eligible or not); the AI picks among eligible options for the persona; without a key, rules rank by the persona's preferred kind, then facet, then fewer caveats, then effect size, then menu order.
- **Rejected:** A weighted score; letting the AI pick freely with the signals as context; top / second as the comparison tie-break (it rewards dominance, which the concentration check penalizes).
- **Why:** TODO(adam)

## 10. Checks run invisibly; "what this data can't tell you" is always shown
- **Decision:** The user sees a check only when it catches something. Every card still ends with what the data can't tell (cause; seasonality from one year), plus the slice when there is one.
- **Rejected:** A user-enabled "bias check" toggle; a visible list of every check passed; silence with no "can't tell" line (silence reads as approval).
- **Why:** TODO(adam)

## 11. The headline is locked, and safety text is never sent to the AI
- **Decision:** The headline may never assert what a caution warns against or what the data can't tell; with a caution, it is that caution's "Say instead", and the AI may not reword it. Cautions, the can't-tell line, and the dataset line are never sent to the AI; it may reword only talking points and questions, with the same slots.
- **Rejected:** Letting the AI rephrase every block; a runtime AI grammar checker on templates (moved to evaluation instead).
- **Why:** TODO(adam)

## 12. A tree of flows instead of linear history
- **Decision:** Every question is a node that stores only its spec. Picks, going deeper, persona switches, and typed questions add nodes; nothing is deleted; back/forward follow the visit order like a browser, and the map draws the tree.
- **Rejected:** Linear back/forward (branching loses earlier ideas); a flat list of saved flows.
- **Why:** TODO(adam)

## 13. Typed questions: structured output, code validation, an independent word guard, and confirmation before building
- **Decision:** The AI returns only build, clarify, reframe, or refuse, with chart specs. Code validates every spec against the data, a word guard on the user's text turns causal and forecasting questions into reframes whatever the AI said, every message is a code template, and nothing is added to the tree until the user confirms the chart, shown in plain words.
- **Rejected:** Answering typed questions in prose; refusing outright instead of reframing; AI-written refusal messages; "Change it" (it dropped filters; cut for now); a "too few cases" category (the small-group check already covers it); bare "will" in the forecasting guard.
- **Why:** TODO(adam)

## 14. The measure gets its own required slot (the fix from the live eval)
- **Decision:** The AI's spec names group_by and measure separately, and "count" must be written out. A total or average of "count", or a count that names a number, is a contradiction code refuses; it is never built as a count.
- **Rejected:** A prompt-only fix; tightening the validator alone without changing the schema.
- **Why:** TODO(adam)

## 15. Measure before optimizing; the cleanup had to leave output byte-identical
- **Decision:** Before the cleanup, both Bookshop text reports were saved from the tag `pre-cleanup`; every cleanup commit had to pass the tests, build, and reproduce them byte for byte. Speedups were timed before and after, and only measured gains were kept.
- **Rejected:** The largestEntity speedup (measured no gain, reverted); restructuring row parsing for a small gain.
- **Why:** TODO(adam)

---

The full decision log (D-001 to D-080) is at the tag `pre-cleanup`: [docs/DECISIONS.md](https://github.com/AdamRychtecky8/golden-analytics/blob/pre-cleanup/docs/DECISIONS.md); D-081 and D-082 are in the last version before this rewrite ([695b48d](https://github.com/AdamRychtecky8/golden-analytics/blob/695b48d/docs/DECISIONS.md)).
