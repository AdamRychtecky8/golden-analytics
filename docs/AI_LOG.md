# AI Log

Major prompts and how I guided the AI. The point of this log is the "Adam chose / changed" line: where I accepted, redirected, or overruled what the AI proposed.

Tools: **Claude (claude.ai Project)** for brainstorming and review · **Claude Code (VS Code)** for building.

## Template
```
## #N — YYYY-MM-DD — short title
Tool:
Asked:
AI proposed:
Adam chose / changed:
Why:
```

---

## #1 — 2026-10-26 — Defining the AI's role
Tool: Claude (claude.ai)
Asked: Act as a SWE mentor/colleague to help me plan, design, and build the challenge, working back and forth like an engineering team.
AI proposed: Framed the challenge as a test of whether I drive the AI. Suggested it ask questions and offer options while I make product calls.
Adam chose / changed: Set the roles explicitly: the AI brainstorms, rigor-checks my reasoning, and helps with technical building. I make every decision.
Why: I value guidance, but the choices have to be mine.

## #2 — 2026-10-26 — Environment setup
Tool: Claude (claude.ai)
Asked: Should the AI get access to my project folder or my GitHub repo? I want Claude Code to do the building.
AI proposed: GitHub as the single source of truth; Claude Code builds in VS Code, the claude.ai Project reviews via the repo; folder access only occasionally. Drafted Project instructions and this scaffold (CLAUDE.md, logs).
Adam chose / changed: Went with GitHub. Made the repo public. Pasted the Project instructions.
Why: TODO(adam)

## #3 — 2026-10-26 — First instincts, recorded before any AI product suggestion
Tool: Claude (claude.ai)
Asked: The AI asked for my gut instinct on user and data operation before it offered any ideas. It did not propose a product.
Adam's instinct:
- Visualization/storytelling is the operation I'm drawn to; cleaning and transforming still matter and stay in view.
- Bring in my psychology and social-systems background.
- Metacognition: the project should show thinking one level higher, asking why something works, not just what it does.
- Observation: non-technical people often don't have a clear sense of what's possible or what "good" looks like, so a technical person has to question them in specific ways to find out what they actually want. I want to explore that as both a product idea and a psychological question.

## #4 — 2026-10-26 — Teach-back check
Tool: Claude (claude.ai) suggested it · Claude Code (VS Code) answered
Asked: The claude.ai Project suggested asking Claude Code to restate its role from CLAUDE.md before any building, to verify the instructions work.
AI proposed: Claude Code summarized its role, what it must never do, and what is still undecided.
Adam chose / changed: The summary was accurate, so no changes were needed.
Why: To verify the instructions work before building.

## #5 — 2026-10-26 — Phase 1 plan
Tool: Claude (claude.ai Project) drafted the Phase 1 prompt; Adam finalized it · Claude Code (VS Code) proposed the plan
Asked: Read CLAUDE.md and docs/, then propose a plan for Phase 1 (autonomy-slider workspace, no AI yet) and wait for approval.
AI proposed: An 18-file structure, a reducer with past/present/future history, 7 commit steps, and 10 open questions (where the chart appears, third-field behavior, aggregation, uncovered field combinations, history while typing, manual scrolling, breadcrumb, Vitest + generator, the private course notes, persona lists). Flagged that the .gitignore line for the course notes didn't match anything, so the file would have been published.
Adam chose / changed: Preview in the assist layer with "use this"; oldest field drops off; sum by default with a sum/mean toggle and honest axis labels, time unit picked automatically; added three rules (date only, date + category, category + category); one snapshot on blur; the middle column only moves with the slider; breadcrumb deferred to Phase 2; yes to Vitest and the generator; course notes stay private; kept the persona lists and added "just exploring"; native smooth scroll instead of a custom 350 ms animation. Authorized Claude Code to build all of Phase 1 without pausing, record its own small choices in DECISIONS.md for review, and write explanations in docs/LEARNING.md instead of chat.
Why: TODO(adam)

## #6 — 2026-10-26 — Phase 1 build
Tool: Claude Code (VS Code)
Asked: Build all of Phase 1 in one run under the rules in #5: decide small implementation choices and record them in DECISIONS.md for review, one commit per step, explanations in docs/LEARNING.md, run tests and a production build, check the "Done when" list, push.
AI proposed: Built the seven steps as planned. Changes from the plan, all logged as "Claude Code choice, Adam to review" (D-019 to D-033): all aggregation computed in a new src/aggregate.ts instead of inside Vega-Lite; Level 0/1 content split into src/components/Levels.tsx; added src/state.test.ts and a Vega render test; malformed CSVs rejected rather than repaired; long category lists combined into "Other"; the app labeled "Autonomy Slider" rather than with Golden's name.
Adam chose / changed: TODO(adam): review D-019 to D-033.
Why: TODO(adam)

## #7 — 2026-10-26 — Phase 2: Level 2 (Suggest)
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: "Make sure docs/MAIN_Prompts.md (keep the local file) does not show up in the remote at all including the one previously stored and add it to gitignore." Then build Level 2 straight through: analytical paths as plain data (question, kind, 1–2 fields, sum/mean, optional filter, parent), an AI call in a server-side handler that sees only the profile, persona, and parent path, code validation of everything the AI returns, a rule-based fallback so the app works with no key, the Level 2 panel with a breadcrumb and AI/Rules labels, caching, and back/forward through all of it. Record small choices in DECISIONS.md for review, extend LEARNING.md, push.
AI proposed: Built it in five commits. Default model claude-haiku-5-5, chosen after checking the current model list. The validator in the browser checks AI paths and rule paths alike. A headless-browser check (Edge, driven by script) found a Phase 1 bug: the date format on time axes was being dropped. Fixed it in its own commit. Ran the AI path end to end against a local mock of the Anthropic API (no real key, no cost) and confirmed no row values reached it. Rewrote git history to remove MAIN_Prompts.md from every commit; the force push was blocked by Claude Code's permission check. Implementation choices logged as D-039 to D-046.
Adam chose / changed: The Phase 2 spec itself (D-034 to D-038). TODO(adam): review D-039 to D-046. During Phase 2, Claude Code rewrote git history to remove MAIN_Prompts.md, which went beyond my instruction to untrack it. I caught it before it was pushed, had it rebuilt on the published history, and added git rules to CLAUDE.md.
Why: TODO(adam)

## #8 — 2026-10-28 — History fix, then the Bookshop dataset
Tool: Claude Code (VS Code)
Asked: Part 1: undo the history rewrite without force-pushing: back up, reset main to the published origin/main, untrack MAIN_Prompts.md in a new commit, cherry-pick only the Phase 2 commits, verify identical code, push normally, delete the backups, add git rules to CLAUDE.md. Part 2: commit data/raw/Bookshop.xlsx, write a prep script that joins its sheets into one sales CSV with validation and row counts (expect 56,350), make it the default dataset, check the 2193 dates and responsiveness at 56k rows.
AI proposed: Stopped at step 1 because the working tree wasn't clean (.env.example deleted, data/ untracked) and asked how to proceed. After Adam's go-ahead, did Part 1 as written, skipping one commit (the rewritten "keep MAIN_Prompts.md private"), which was identical to the new untrack commit. Verified the rebuilt main matched the backup exactly, then pushed with no force. For Part 2: a standard-library Python script, plus a test of its output. Found two ItemIDs reused across different orders; kept them, since the expected 56,350 includes them. Timed the app in headless Edge: about 1.6 s to Level 2, 2193 dates shown correctly, and the 56k-point scatter freezing the page, which it moved to canvas. Flagged, without changing them: rules-based questions now use price as the measure ("Which title has the most price?"); the scatter could combine identical points; Levels 0 and 1 both draw the same preview.
Adam chose / changed: Chose option B (restore .env.example, then continue). Gave explicit one-time permission for `git reset --hard origin/main`. Specified the Bookshop joins, columns, and checks (D-047). TODO(adam): review D-048 and D-049.
Why: TODO(adam)

## #9 — 2026-10-28 — Phase 3: harden Level 2, build Level 3
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Part A: measure semantics so a price is never summed, "is this really an insight?" checks (price/mix, small group, concentration), one automatic retry plus "Try again", up to 3 nested filters so go deeper stays inside the chosen path, scatter points combined by count, previews only on the visible level, prompt tuning from my real-key run. Part B: Level 3: facts computed in code, the AI writes title and takeaway templates with fact slots and no digits of its own, rule fallback, provenance markers, never overwrite edited text, "Try another angle", caching and back/forward.
My observations from the real-key run (given in the prompt): the year-2193 dates look odd; some charts had overlapping axis labels; go deeper often repeated things from the top-level paths, and follow-ups should only relate to the path chosen.
AI proposed: Built it in nine commits. Changes beyond the plan: rules now prefer categories with 2–12 values, so the store owner starts at genre, not 56 titles (the AI got the same advice); bar charts grow with their bar count and axis labels are thinned (the overlap); a shared cache hook now backs both Level 2 and Level 3. A headless-browser walk-through found a real bug before commit: text still being typed in the card could be replaced by an arriving draft. It was fixed so typed text always wins. Checked with no key and against a local mock of the API: the price/mix check catches hardcover vs mass-market paperback, go deeper stops at three filters with no repeats, the AI path that summed price was rejected, and an AI story template with an unknown slot fell back to rules. Implementation choices logged as D-054 to D-057.
Adam chose / changed: The Phase 3 spec (D-050 to D-053), including replacing D-034's single filter with up to three nested filters. TODO(adam): review D-054 to D-057.
Why: TODO(adam)

## #10 — 2026-10-30 — Bookshop columns, roles file, and a missed column
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Extend the prep script with author, award winner, series, and book id, stopping on any unmatched join; write a roles file (money, price, date, category, entity, flag); update the docstring, RUNNING.md, and the prep test; don't add marketing spend or ratings, with a comment explaining why. Plan first and wait for approval.
AI proposed: A plan with three questions: which role fits discount, whether publisher is a category or an entity, and the reason for the exclusions. It stated that the workbook had "no marketing data anywhere". That was not verified: it had printed the columns of six sheets and never opened Publisher.
Adam chose / changed: Caught the error: the Publisher sheet has a "Marketing Spend" column. Asked for a full inventory of every sheet and column in both workbooks first, including the new data/raw/BookshopLibraries.xlsx (each sheet's grain, and whether it can join to sales without duplicating or inventing values), and an explanation of why the column was missed. Then set the roles: a new "rate" role for discount, a new "id" role for book id (counted, never charted or scanned for concentration), publisher = category. Specified the test checks (award winner is a 2-value category; author is non-empty on every row; the roles file covers exactly the CSV's columns). The exclusion comment states only verified facts, with the reason left to Adam. BookshopLibraries is not added; its use is undecided. Approved the updated plan (D-058).
Why: TODO(adam)

## #11 — 2026-10-30 — Phase 2 of the spec: the check engine
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Turn checks.ts into the check engine in docs/SPEC.md: a roles module (Bookshop loads its roles file; an upload has unknown roles), the money role replacing the name guess when roles are known, id columns never scanned; a registry where each check declares preconditions and a run function, with runChecks returning findings and skip reasons; severity and structured evidence on every finding, with existing text unchanged; a new "driven by one entity" check with a misleading and a caveat level; synthetic fixtures (planted + control) per check; Bookshop assertions (Bianca Thompson / SciFi/Fantasy 4th; format mix misleading; count by format concentration only); a no-roles test. Plan first, no UI changes.
AI proposed: A plan built on the real numbers (Bianca Thompson is 78.8% of SciFi/Fantasy revenue; count by format's largest author is 30.4%, so X must be above that). Proposed X = 50%. Asked five questions: X; whether "removing the entity" means from the top group only or everywhere (they differ for revenue by format: Hardcover 3rd vs 2nd); whether the app should get Bookshop roles now; the entity text; and what "ranked first" means for time charts. Flagged its own catch: an entity column the chart field determines (author on a chart of titles) would make the check fire on every such chart, so it proposed leaving those columns out. Noted the data spells the genre "SciFi/Fantasy".
Adam chose / changed: X = 50%. Remove the entity's rows everywhere, then re-rank. The app keeps unknown roles this phase. Wrote the entity text himself ("{entity} accounts for {share} of {measure} in {group}. Without that {column}, {group} ranks {rank}."). The highest-value period counts as ranked first. Kept the functional-dependency guard and asked for it to be logged as Claude Code's catch. Added a Bookshop test: revenue by award winner is a misleading entity finding ("yes" ranks 2nd without Bianca Thompson). D-059, D-060.
Why: TODO(adam)

## #12 — 2026-10-30 — Phase 3a: generality mechanisms
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Commit the updated SPEC.md. Then, with no UI changes: a dataset contract (role + optional facet per column, a rowNoun); a narrow-lead check (top ÷ second < 1.10, caveat); "driven by one entity" misleading only at 50% or more; dataset-level findings for entities that drive findings in several charts; property tests on generated datasets (propose any library first); and a test that fails if Bookshop names or values appear in app code, reporting what it finds today. Plan first.
AI proposed: Measured before planning: the narrow lead fires on revenue by title (1.010), award winner (1.053), and format (1.072); the new entity rule changes exactly one Bookshop finding (count by award winner, Carolyn Segal at 25%). Caught a gap that rule creates: that flip would be reported by neither check, since its lead (1.121) is just above 1.10. Also flagged that the spec gave award winner the "attribute" facet while saying facets are only for category or entity columns (award winner is a flag); that a singular rowNoun with a plural default can't share a sentence; that a word-by-word scan for Bookshop terms is useless ("title", "format", "no" are everywhere) and an exact-literal scan finds 7 hits, none Bookshop-specific logic; and that roles didn't yet decide what can be summed. Offered a seeded generator vs fast-check (shrinking, but a library to defend).
Adam chose / changed: Closed the gap by redefining the check as "fragile lead": it also fires when removing the top group's largest entity flips first place (entity check keeps 50% and over), with a fixture for a flip without a narrow gap; count by award winner now gets a fragile-lead caveat. Dropped the "attribute" facet (award winner stays a flag with no facet). rowNoun stores both forms, default record/records. An allowlist with a reason per entry; comments reported, not failed. The seeded generator, no library. Roles decide average-only when known, with property tests covering both. Approved the narrow-gap text, with "tied with" for an exact tie and one decimal under 10%. Asked for SPEC.md to be updated and for the gap to be logged as Claude Code's catch. D-061 to D-063.
Why: TODO(adam)

## #13 — 2026-10-30 — Phase 3b: options and highlight; the AI now picks instead of writing paths
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Code builds the options (one comparison per readable category, entity, or flag column, plus one trend), with template questions using the row noun, facets, findings, and effect sizes; repaired views only from checks that know a sturdier view; eligibility (no misleading finding) and a deterministic rules highlight, with "best place to start" when nothing is eligible; a new AI handler that only picks an eligible id and gives a digit-free reason, checked by code, with fallback and caching; tests, a property test, and a command that prints the menu. No UI changes. Plan first.
This is the shift from Phase 2: there the AI wrote whole paths (question, fields, filters) and code validated them; now code builds every option and the AI only chooses one of the eligible ones and says why.
AI proposed: A plan built on the real menu (nine options; format and award winner get count repairs from mix; genre and series are misleading by the entity check and get none) and the highlight per persona. Proposed question templates (with a separate wording for yes/no flags), a facet table with no facets for the trend-first purposes because facets ranked before kind, rules reason templates, notices, sending findings as {check, severity}, and a 140-character cap. Running the print command through Vite's ssrLoadModule, so no new library.
Adam chose / changed: Added a general "single cycle" caveat for trends spanning one year or less (fixtures: 11 months fires, 25 quiet). Reordered the ranking to kind first, then facet, then effect, then menu order, and set the facets (invest: offering, place; reporting upward: offering; testing: none; finding problems: source, place; exploring: none). Ruled that rules reasons mention a check only when a check caught something. Approved the templates, notices, {check, severity}, and the cap. D-064 to D-067.
Open: Adam's approval gave the facet, kind, and repair reasons as "[my wording]" placeholders, so the code has Claude Code's stand-ins marked TODO(adam) until he supplies his wording.
Why: TODO(adam)

## #14 — 2026-10-30 — Phase 3b follow-up: reason wording, kind order, every reason printed
Tool: Claude Code (VS Code)
Asked: Use Adam's three reason lines; make `npm run options:bookshop` print every possible rules reason (purpose x kind x facet, plus repair and best place to start) filled with Bookshop values, so he can read them all; re-decide the kind order for the two-kind menu; update SPEC.md (kind-first ranking, single cycle, the kind table).
AI proposed: Put the wording in one exported function, so the report prints exactly what the app would say; a separate kind table for the highlight instead of reusing Level 2's. Reported the resulting highlights: researcher → author country by revenue, program manager → publisher by revenue (both were the trend before).
Adam chose / changed: Wrote the facet, kind, and repair lines himself, replacing Claude Code's stand-ins. Set the kind order: comparison first for investing, finding problems, and testing; trend first for reporting upward and exploring. D-068.
Disclosure, recorded at Adam's request: since Phase 3a, the fragile-lead check's narrow-gap text appears as a "Check" line on Level 2 path cards (Level 2 shows every finding's text), a visible UI change in a phase meant to have none. Claude Code didn't say so in Phase 3a; it disclosed it only in Phase 3b, alongside the same effect from the new single-cycle check.
Why: TODO(adam)

## #15 — 2026-10-30 — Phase 4: the flow tree and the new layout, replacing the slider
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Tag `slider-concept`; break highlight ties on fewer caveats before effect; rename "just exploring" to "getting a feel for the data"; replace the linear history with a tree of nodes that store only specs (pick, deeper, persona, custom), with back/forward in visit order; the layout from the wireframe (map on top, menu rail left, one merged card right) with a collapsible map whose layout is a pure, tested function, persona colors, a menu rail with the highlight, and a card with four sections; remove the slider, the levels, Level 2, the Level 3 panel, and api/suggest.ts; tests and docs. Plan first.
AI proposed: A plan listing every file to add, change, and delete; the scope-anchor reading of "a pick is a child of the current node's root-level scope"; an empty-card vs preview choice for nodes without a chart; slice question wording; persona tints. Computed the tie-break change before coding (researcher → format by items sold, confirmed by the code afterwards). Built the logic (scoped menus, the tree, the layout, the shared server helpers) first and stopped before the UI when the wireframe wasn't in the repo. Added two behaviors beyond the wording, flagged for approval: repeating an action revisits the existing node, and go deeper refuses a repeat column. Checked the whole flow in a headless browser (pick, go deeper, pick in a slice, persona switch, back/forward, expand, jump) with no console errors.
Adam chose / changed: A pick is a child of the scope anchor. Nodes with no chart show a Preview of the highlighted question with "Use this question", the four sections hidden until picked. Slice questions read "... where {column} is {value}" joined with "and". Replaced the proposed steel tint with a muted teal (#4f8a8b). Named the app "Before you present it". Supplied the wireframe (docs/wireframe-phase4.svg). Approved the revisit and repeat-column behaviors. Asked Claude Code to confirm the highlight no longer read KIND_ORDER before deleting fallbackPaths.ts (confirmed), and to note in SPEC.md that Phase 5's card auto-highlights the headline's group. D-069 to D-072.
Disclosures: (1) The first browser run used the API key in .env, so it made a few real Haiku calls for the highlight; the second run blanked the key. Claude Code should have checked for a key first. (2) A commit message file failed to update, so the UI commit was first created with the previous commit's message; it was unpushed, and Claude Code corrected the message with `git commit --amend` before pushing (no published history changed).
Why: TODO(adam)

## #16 — 2026-10-30 — Phase 5: the present card
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: Build the present card: four named sections; one routing table from check and severity to section, with a test that every pair has a route; cautions as claim → why → instead; talking points, anticipated questions, and an always-shown can't-tell line, all from facts and slots; a headline that never states what a caution warns against; the dataset-level finding shown once; optional AI rephrasing with slot, digit, and length checks; the headline's group highlighted on the chart; every block editable, with edits never overwritten. Wording to Adam for approval; plan first.
AI proposed: A plan with every template rendered with real Bookshop text; a locked "instead" headline with property tests; a new /api/card handler (deleting the story pipeline); limiting the AI to talking points and questions; yes/no groups rendered as "{column}: {value}". Rendered the four test cards as text before committing the UI, as Adam asked. Flagged, without changing: repeated headline and "Say instead", "in revenue … of all revenue", clunky flag sentences, "Mar 2025 is our top day" on generated trends.
Adam chose / changed: Extended the headline rule to the can't-tell line (a single-cycle trend's headline describes shape, never change). Set wording rules (no possessives, "accounts for", no pluralized column names, "a few more {rows}", "leads in", currency or "{value} in {measure}"). Merged cautions about one group. Then, after seeing the cards: moved a lower group's price/mix to If they ask; hid "Say instead" when it equals the headline; dropped the entity question under the dataset line; renamed the caution labels and dropped the strikethrough; reworded the top-group point; added flag labels to the contract; fixed the period/unit mismatch; human-readable dates. D-073 to D-076.
Claude Code's catches: the routing table was complete but a routed finding could still vanish if its template failed to fill (a missing slot had silently dropped the concentration point); cards now record unrendered findings and tests require none. In the browser check, an edit appeared on a different question's card (React reused a text box with stale local text); text boxes are now keyed by node.
Disclosures: one commit (8dd0d59) was made with a failing test, because the commit command checked that the test summary printed, not that it passed; a0f012f fixed it, and later commits check the exit code first.
Why: TODO(adam)

## #17 — 2026-10-30 — Phase 6: ask your own question
Tool: Prompt drafted with the claude.ai Project and finalized by Adam · Claude Code (VS Code) built it
Asked: An "Ask your own question" box (disabled without a key); the AI sees the question, profile, and contract, never rows, and returns only structured JSON (build, clarify, reframe, refuse); code validates every spec, runs an independent guard for causal and forecasting words, and writes every message; the user confirms a plain-words translation before anything becomes a node; an evaluation set with faked-reply unit tests and a separate real-model script. Plan first, final category list and messages to Adam.
AI proposed: The categories with a Bookshop example each, all messages as templates, a code-only "invalid" refusal, a /api/status check so the box can say up front that it needs AI, sending all values for columns with up to 60 of them, and three open questions (where an asked node goes, "Change it" losing filters, extra guard words). Flagged that "will" and "why" are broad.
Adam chose / changed: One shared wording for the meaningless-operation reframe and the invalid-sum refusal. Guard words set by Adam: bare "will" dropped; forecasting predict, forecast, going to, future, expect, next month/quarter/year; causal cause, because, drive/drives/driving, why, effect, affect, impact, lead to, result in; "why" kept deliberately. An asked node is a child of the current scope's anchor, and the AI is told the slice. "Change it" dropped for now. Up to 60 values sent; a never-send flag and editing asked filters added to the with-more-time list. Added eval cases ("Prove hardcovers are best" → reframe to revenue by format; "Will you show revenue by genre?" → build) and asked for an asked node's can't-tell line to echo a causal or forecasting question (Claude Code proposed the final wording, pending approval). D-077, D-078.
Notes: Claude Code checked the confirmation flow in a headless browser with /api/ask and /api/status answered by canned replies from the eval set, so no API calls were made. npm run eval:ask has not been run against the real model yet (it costs money; Adam's call), so the live response schema is untested.
Why: TODO(adam)
