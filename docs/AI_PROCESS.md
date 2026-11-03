# How I used AI on this project

## The setup

I used two AIs with two different jobs. A Claude chat was my review partner: I brainstormed with it, and its job was to rigor-check my reasoning and push back. Claude Code was the builder, working in my repo.

I set the rules before any code existed. I make every product decision; the AI offers options and tradeoffs. For anything non-trivial, Claude Code posts a plan and waits for my OK. When I ask to see something before it's committed, it waits, even if the result looks right. Those rules live in `CLAUDE.md`, so they apply to every session, not just the ones I remembered to repeat them in.

I also wrote down my own instincts before asking the AI for any product ideas: visualization and storytelling, psychology, and the observation that non-technical people often don't know what's possible. That way I could check later whether the direction was still mine.

## The biggest decision: throwing out my first concept

My first version was built around an "autonomy slider": four levels, from "I explore myself" up to "the AI writes the story." It was working, and I scrapped it.

The reason: a control nobody moves isn't really a control. Most people would leave it on the AI setting, and anyone skilled enough to use the bottom levels doesn't need this tool anyway.

When I looked at where users actually get hurt, it wasn't making a chart. It was the next step: reading the chart and saying the conclusion out loud in a meeting. The data in this project shows how easy that is to get wrong. "Sci-Fi is our best genre" is true, but one author, Bianca Thompson, is a third of all revenue, and without her Sci-Fi drops from first to fourth. So the product became Golden Standard: pick a question, and before you present it, the app tells you what you can safely say, what to be careful with, and what the data can't tell you.

I tagged the old version in git (`slider-concept`) so the pivot is visible in the history.

## The line between code and AI

The rule I designed around: **code decides what's true and how it's drawn; the AI decides what's relevant and how it's said.** I did this because I have not worked much with industry level chat bots and ensuring safety checks around them. Therefore, for now I wanted the code to be the final check to ensure nothing malicious slips through in either direction.

In practice:
- **Code** builds the question menu, computes every number, and runs every check.
- **The AI** picks one question to highlight for the user and writes a one-line reason. It can only return an ID from a list of options code has already verified, so it can't recommend a chart that a check flagged as misleading.
- **The AI never sees raw rows**, only a summary of the columns. It never writes a digit: numbers go into sentences through named slots that code fills in, and any AI text containing a digit is rejected.
- **Safety text is never sent to the AI at all.** The cautions and the "what this data can't tell you" line are always code templates. I can't reliably check whether the AI softened a warning, so I don't give it the chance.
- **The app works completely without an API key.** Every AI feature has a rules fallback.

The typed-question box is the most tightly controlled part, because it's the closest thing to a chat interface. The AI only returns a small structured object (a chart spec, or a reason it can't be answered), and code writes every sentence the user sees. Code also scans the user's own text for causal words like "cause" or "why," independently of the AI. If the AI says "build" for a causal question, the code overrides it and explains that the data can show a difference, not a cause. Refusing a user out right can be frustrating so instead I offered alternative choices to both keep it in good practice and not frustrating.

## Where I redirected the AI

Some moments where my judgment changed the direction:

- **The highlight should favor sturdy findings, not flashy ones.** The trap charts would demo better, but recommending them would undercut the whole point. They stay in the menu so I can pick one on purpose and show the app catching it.
- **No weighted scoring for the highlight.** Weights would be numbers nobody could defend. I chose a fixed order instead: is it sturdy, does the type of question fit your goal, does the column fit, then ties. This would most certainly be an area to go back to with more time.
- **The tool can't be tailored to this dataset.** I used Bookshop to discover failure modes, but every fix had to work on any data. A test now fails if any Bookshop column name or value appears in the app's code. This is to ensure the mechanism is not based on one dataset, but is robust to many as is the purpose of the tool.
- **Cautions have to be non-trivial.** When I clicked through, some "Don't say this" items were true, just obvious. I set the rule that a caution has to reveal something the chart hides, and renamed the sections to sound less like a correction: "Key talking points" and "Caution around these."
- **"Why" questions still get a chart.** Instead of blocking them, the app shows the comparison and says plainly that it's connected, not proven to cause anything.
- **A grammar-checking AI idea, moved offline.** I asked whether an AI should check the template wording. It wouldn't run when the AI is down, which is exactly when templates are used. So I read every possible template sentence once instead. An AI judge belongs in evaluation, not in the product.

## A bug I caught by using it

On "Which series brings in the most revenue?", the app warned that one author was 100% of the top series and that without her it would rank 6th. That's meaningless: a series has one author, and removing 100% leaves nothing, so "6th" just means "empty."

The existing guard missed it because it checked whole columns ("does series always determine author?" No: some series have several authors), while the problem lived in a single group. The fix moved the guard to the group level and made it a general rule: **a finding is only worth showing if it could have turned out otherwise.** A property test now checks that rule across generated datasets, and it found a third version of the bug I hadn't thought of, with negative values like refunds.

## Checking the AI's work

I didn't want to trust the code just because tests passed. I brainstormed with Claude chat and came up with some debugging and test cases. So:

- **Tests that can fail.** Claude Code deliberately broke the code (for example, removed the step that applies column roles) and confirmed the right tests went red.
- **Planted-bias fixtures.** Each check has a small synthetic dataset where it must fire and a clean one where it must stay quiet. Planted effects only exist in test data; the demo data is real.
- **A live evaluation of the typed-question box.** The first run passed 17 of 20. All three misses had the same cause: the model left out the measure (it returned "genre" instead of "genre and revenue"), and the result was still a valid chart, so the validator let it through. The confirmation step would have shown the user the wrong chart before building it, but I fixed the cause rather than the symptom: the schema now asks for the measure in its own required slot, so leaving it out is a contradiction code refuses. After that, three reruns each passed 19 of 20, and the one miss was the same every time: "sells the most" read as revenue instead of items sold. Since "sales" honestly means either in this data, I accepted it as a valid reading, which brings it to 20 of 20, and the user sees the chart in plain words before using it, so they can rephrase if they meant items sold. I report both numbers so the judgment call is visible.
- **A cleanup that couldn't change behavior.** Before refactoring, the text of every card and menu was saved, and every cleanup commit had to reproduce it byte for byte. That made a 28-file rename safe. Startup work dropped from about 2.8 seconds to 0.75. One planned speedup measured as no faster, so it was reverted instead of committed: I didn't want code that only looked like an optimization.

## When the AI got things wrong

The AI made mistakes, and catching them is part of the process:

- Claude Code said the workbook had no marketing data. It had only checked six of thirteen sheets. I knew the Publisher sheet had a marketing column, asked it to recheck, and it corrected itself.
- It once committed with a failing test, and once committed before I'd reviewed a change I had asked to see. Both were disclosed and logged, and I added "wait even if it matches" to the rules.
- It also caught things I accepted: a guard so "one author is 100% of their own title" can't fire, a gap where a narrow lead slipped between two checks (which became the "fragile lead" check), and a real bug during cleanup where the card and the checks used different versions of the column roles.
- The main idea is to constantly go back and forth between claude code who has access to the codebase and claude chat who is brainstorming and grounded in the project files. Having the two check each others work with me serving as the top level guidance is how I currently go about my work. I would love to learn new ways to keep my work more robust and become even more efficient.

## Log

The full log of every interaction is in the git history at the tag `pre-cleanup`: [docs/AI_LOG.md](https://github.com/AdamRychtecky8/golden-analytics/blob/pre-cleanup/docs/AI_LOG.md) (entries #1–#19); entries #20–#22 are in the last version before it was removed ([b5724a2](https://github.com/AdamRychtecky8/golden-analytics/blob/b5724a2/docs/AI_LOG.md)). New entries go below.

### 2026-11-02 — Preparing the Vercel deployment

- **Asked:** make the repo deployable on Vercel without deploying or installing anything: check the build and the four handlers as Vercel functions, add `vercel.json` only if required, report bundle size, confirm and test the no-key / bad-key fallback, add a Deploy section to RUNNING.md, update DESIGN.md's Limits line, and list the dashboard steps.
- **Found and fixed:** the handlers imported `./_shared.ts`, which Vercel's compiled output would not contain; changed to `./_shared.js` (verified by compiling `api/` to plain JS and calling each `POST` under Node). The `api/*.test.ts` files would have become endpoints; added `.vercelignore`. No `vercel.json` needed (Vite and `api/` are detected).
- **Reported, not changed:** the JS bundle is 9.0 MB (663 KB gzipped); the Bookshop CSV, inlined with `?raw`, is 7.9 MB of that (271 KB gzipped). Corrected RUNNING.md, which blamed the size warning on Vega alone.
- **Added:** `api/fallback.test.ts` (status without a key, a 401 through every handler, the typed-question "unreachable" message).
- **Adam chose:** no size optimization for now ("Don't optimize unless I ask"); he deploys from the dashboard himself. Why: TODO(adam)
