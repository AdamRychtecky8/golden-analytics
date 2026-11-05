# Major prompts

The brief asks to keep track of the major prompts and how I guided the AI. These are the three that shaped the project most. Each phase prompt was drafted in my review chat, edited by me, and sent to Claude Code, which posted a plan and waited for my OK before building. Under each prompt is what I changed once the plan came back. The full history of every interaction is in [AI_PROCESS.md](AI_PROCESS.md).

---

## 1. The original build (the slider concept, later scrapped)

The first prompt I gave Claude Code. This concept was later replaced; the code is tagged `slider-concept`.

```
Read CLAUDE.md and everything in docs/ first. Then propose a plan for Phase 1
below and wait for my approval before writing any code.

## What we're building
An analytics workspace for non-technical users built around an "autonomy
slider." The user loads a dataset, and a vertical slider controls how much the
AI helps:
- Level 0 — Explore: all fields, free building, no guidance.
- Level 1 — Map: field cards plus rule-based chart ideas for the selected
  fields ("here's what you can show"). No AI.
- Level 2 — Suggest (the main focus): analytical paths. Each path is a question
  with a chart that answers it, and the user can go deeper on any path, forming
  a tree of questions. AI chooses the questions; code computes every number.
- Level 3 — Story: the AI generates a full story card (title, chart, one-line
  takeaway), clearly marked as AI and editable.

## Decisions already made
- Default level: 2 (Suggest).
- Slider rule: moving up adds AI layers, moving down hides them, and the user's
  own work is never overwritten.
- Input: a clean, typed CSV. Data cleaning is out of scope; it belongs to an
  upstream tool.
- Hybrid architecture: code computes every number. The AI only chooses and
  phrases, sees only the data profile and the persona (never raw rows), and
  the app must fully work without AI.
- Chart choice is deterministic and rule-based.
- Persona: a picker with presets plus "build your own", stored as a context
  object (domain, role, purpose) for the AI to use.

## Phase 1 scope: no AI yet
Vite + React + TypeScript, Papa Parse, Vega-Lite, plain CSS. A profiler with
unit tests, the persona picker, the slider and its levels, rule-based charts
(each rule commented with its reasoning from my DATA 511 notes), an editable
story card, and back/forward history.

## Working style
- Before coding, give me a one-line description of every file you plan to create.
- The first time each React/TypeScript pattern appears, explain it in 2–3 plain
  sentences.
- Commit after each working step, and explain the commit message so I learn
  the conventions.
```

**What I changed:** I moved the default from Level 1 to Level 2, because Golden is about doing analytics with AI. Several phases later, I scrapped the slider itself: most users would leave it in one place, and anyone skilled enough to use the bottom levels wouldn't need the tool. What carried over was the rule that code computes every number and the AI only chooses and phrases.

---

## 2. After the pivot: the plan and the check engine

After the pivot, I wrote a spec for the new concept ("before you present it") and split the build into phases, each ending in tests and my review:

| Phase | What |
|---|---|
| 1 | Dataset: real Bookshop data, plus a contract describing each column |
| 2 | Check engine: pure-function checks with severities and planted-bias fixtures |
| 3 | Options and highlight: code builds the questions, the AI picks among the safe ones |
| 4 | The tree of flows and the new layout, replacing the slider |
| 5 | The present card |
| 6 | Ask your own question, with guards and an eval set |

The check engine came first because everything else depends on it:

```
Phase 2: turn src/checks.ts into the check engine described in docs/SPEC.md.
No UI changes in this phase. Read the spec, checks.ts, groups.ts, and
checks.test.ts first, then post a plan and wait for my OK.

1. Roles: load and validate a roles file against the dataset's columns. An
   uploaded CSV with no roles file gets "unknown" roles, and any check that
   needs a role skips. Use the "money" role instead of guessing from column
   names; keep the name guess only as the fallback. "id" columns are never
   scanned.
2. Registry: each check declares an id, its preconditions (returning a skip
   reason or null), and a run function. runChecks returns { findings, skipped };
   skipped is for tests and logs only, never shown in the UI.
3. Findings: add severity, "misleading" or "caveat", and structured evidence
   (the numbers behind the finding) so later phases can phrase findings with
   facts and slots. Keep every existing text string unchanged.
4. New check, driven by one entity: within the top group, find the single
   entity holding the largest share of its value. Misleading if removing it
   drops the group out of first place; caveat if the group stays first but the
   entity holds at least X%. Propose X with your reasoning; I decide.
5. Tests: for each check, a small synthetic fixture where it must fire with the
   expected severity and a clean control where it must stay quiet. On the real
   data: revenue by genre gives a misleading entity finding naming Bianca
   Thompson, with SciFi/Fantasy falling to 4th without her.

Rules: thresholds are named constants with a comment giving the reasoning.
Update LEARNING.md, DECISIONS.md (Why: TODO(adam)), and AI_LOG.md. Commit in
small steps and push.
```

**What I changed after the plan came back:** I set X to 50%. I chose to remove the entity's rows from the whole dataset before re-ranking, not just from the top group, so the question becomes "if this author weren't in the data, would this group still lead?" I kept the UI unchanged, since Phase 4 was replacing it anyway. I accepted Claude Code's proposed guard against "one author is 100% of their own title." I also added a test for the award-winner finding I planned to use in the video.

---

## 3. Ask your own question (the most regulated AI feature)

```
Phase 6: prompt-a-path. Post a plan and wait for my OK. This is the most
regulated AI piece in the app.

1. An "Ask your own question" box in the menu rail. With no API key, it's
   disabled with one quiet line pointing to the menu.
2. The AI sees the user's text plus the profile summary and the dataset
   contract, never raw rows. It returns only structured JSON, one of four
   outcomes: build (a chart spec), clarify (2-3 candidate specs for an
   ambiguous term), reframe (a category plus the nearest defensible spec), or
   refuse. No prose answers, no numbers.
3. Categories: not in the data, causal, meaningless operation, forecasting,
   loaded framing, ambiguous term, unrelated. "Too few cases" is NOT a
   category: the small-group check handles it after the chart is built.
4. Code validates everything; the AI can't approve its own output. Every field
   and filter value must exist, the aggregate must be legal for the column's
   role. An independent guard on the user's own text catches causal and
   forecasting words: if it fires, the outcome can't be a plain build. All
   user-facing messages are code templates; the AI never writes the
   explanation.
5. Before anything is built, show the structured request in plain words,
   labeled "AI translated your request", with Use this / Cancel. Only on "Use
   this" does it become a node in the tree.
6. Evaluation: about 20 prompts with expected outcomes, covering every category,
   typos, a prompt-injection attempt, and a value that doesn't exist. Unit tests
   run them against faked AI replies, including deliberately wrong ones; a
   separate script runs them against the real model and prints a pass rate.
```

**What I changed:**
- **The guard words:** I dropped bare "will," which would have flagged "Will you show revenue by genre?" as a forecast, and added words like "affect" and "impact." I kept "why" in the guard on purpose, even though it's strict.
- **Placement:** an asked question stays inside the user's current slice.
- **"Change it":** I cut it for now, because it would have silently dropped the asked filters.
- **The card:** a causal question's card now says plainly that the data shows a connection, not a cause.

After the feature shipped, the live eval passed 17 of 20. All three misses had one cause: the model left out the measure, and the result was still a valid chart. I fixed the request format rather than the prompt, which brought it to 20 of 20, counting one reading of "sales" I decided was fair.
