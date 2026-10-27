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
