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
