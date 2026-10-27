# CLAUDE.md — Golden Analytics technical challenge

## What this project is
Adam Rychtecky's submission for the Golden Analytics Software Engineer Intern (Summer 2027) technical challenge. Due **Nov 9, 2026**.
- The brief: `docs/context/brief.md`
- Company context and values: `docs/context/company.md`

The brief says the reviewers want proof that Adam guided the AI to build what *he* wanted, not what the AI wanted. Every rule below serves that.

## Roles
- **Adam** makes every product and design decision.
- **You (Claude Code)** are the builder. You write code, explain it, and keep the logs current.
- A separate Claude chat (a claude.ai Project) is Adam's brainstorming and review partner. It reads this repo on GitHub, so commit and push work you want reviewed.

## How to work with Adam
- **Product or design question?** Offer 2–3 options with tradeoffs, give a recommendation only if asked, then wait for his choice. Never silently pick a product direction, add features he didn't ask for, or swap libraries.
- **Non-trivial change?** Post a short plan first and wait for his OK.
- **Stack:** not decided yet (React + TypeScript is expected by the role). Do not scaffold an app until Adam decides.
- **Commits:** small and frequent, with plain messages that say what changed and why.
- **When you finish a task,** tell him exactly what to look at or click to verify it.

## Teaching (important)
Adam reads React/TypeScript through AI; he does not write it from memory. The goal is reading literacy: enough to understand and defend every file in an interview.
- The first time a new pattern appears (a hook, prop types, a generic, a reducer, an effect…), explain it in 2–3 plain sentences: what it does and why it is here instead of the alternative.
- Prefer simple, readable code over clever code. If something must be clever, comment why.
- When asked "why does this work," answer the mechanism, not just the behavior.

## Product values to respect
Golden's: the human controls how much the AI does, and the AI's work stays visible (the "Slider of Autonomy"); AI removes drudgery while humans keep judgment; **no chat-with-your-data bot** as the core interface; speed to value for non-technical users; storytelling and design; precision and validation.
Adam's: metacognition (show the *why*, one level above the *what*); psychology and social systems; visualization and storytelling, without neglecting cleaning and transformation.

## Data precision
Any number shown to a user must be traceable to how it was computed. Validate inputs, handle missing or malformed values explicitly, and never let a chart silently drop or invent data.

## Logs — keep these current
- **`docs/AI_LOG.md`** — After any major interaction (a new feature, a design proposal, any time Adam redirects or overrules you), append an entry using the template at the top of the file. Record his redirections faithfully; they are evidence for the submission. Do not write his reasoning for him: if he didn't state a reason, put `Why: TODO(adam)`.
- **`docs/DECISIONS.md`** — When Adam makes a product or technical call, add a short record.
- **`README.md`** is written by Adam, not AI. Do not create or edit it. Run instructions go in `docs/RUNNING.md`.

## Secrets
Never commit API keys. Use `.env` (gitignored) and keep a `.env.example` with placeholder names only.
