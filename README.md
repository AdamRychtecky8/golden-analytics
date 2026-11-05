# Golden Standard: before you present it

**Try it:** [live demo](https://golden-analytics-ten.vercel.app/)

**Run it locally:**

```bash
npm install
npm run dev
```

## Why I built this

Tests, the AI eval, and setup details: [docs/RUNNING.md](docs/RUNNING.md)

Most people that will be using this tool are smart as well as experienced in their domain, and that's exactly what puts them at risk: when you know your business, a confident reading often feels right even when the data doesn't actually back it up. As people are given more information (experience), their confidence rises even though their accuracy often does not (Oskamp, 1965). That confidence can often lead to mistakes through improper biases such as reading a total as a fact about everything inside it. For example, the bookshop owner's database shows Sci-Fi as the best genre, and by revenue it is, but one author accounts for a third of the revenue. Without her, it drops to fourth, which could lead to an improper decision such as stocking more Sci-Fi from other authors, whose books actually sell less than other genres.

This frustrates me all the time, having to dig into the data before saying an idea aloud to make sure it isn't filled with little potholes like the one above. So I wanted to build a tool to free up this cognitive load and allow the user to ask questions and explore ideas without having to worry about this part of storytelling. Not only does it give the user a visualization and key talking points, it also points out what they might be tempted to say and why it wouldn't hold up. This takes the tedious part out of analytics, leaving only the fun brainstorming, allowing the user to quickly cycle through ideas, and check them with confidence that will hold up in front of a room of skeptics.

## What it does

The user starts with a dataset they have questions about. This tool assumes the data has been cleaned and transformed to fit its criteria (more on this in the With more time section). Once the data is loaded, code builds a menu of questions based on each column’s role and runs every check on each option. Then the options that pass are handed off to AI (Claude Haiku for now), which picks one based on the user's persona and highlights it. Without an API key, built-in rules pick instead. The user still has full control, being able to move to a different option or go deeper into the highlighted one. The main idea is that code writes every number on the card, and AI rewords the talking points for a protected, smooth flow.

The checks always run quietly, only flagging something when one catches it. There are six checks as of now, looking for the common ways a true chart leads to a wrong claim, like one author carrying the whole genre. A finding is either misleading (the obvious reading is wrong) or a caveat (true but needs context), and is only shown if it could have turned out otherwise.

Once a user chooses a card or picks the AI option by clicking “Use this question,” the full card is created, adding 4 sections: “Key talking points” headline plus a few points, “Caution around these” only when a check found something misleading or fragile, “If they ask” when there's a likely follow-up question, and “What this data can’t tell you” so the user knows the limits of what they can claim, like cause. The visualization itself is also interactive. For example, clicking a single bar in a bar chart goes deeper into that group, rebuilding the menu around that slice. Additionally, the card goes back to a preview until the user picks a question inside that slice, where the process continues. 

For easier navigation, there is also a map feature at the top of the page, which starts collapsed. While collapsed, it shows one line of the path to the current user card. When opened, it shows a tree of user interactions and created cards. Clicking any node jumps to that respective card and menu, and a back/forward retrace is provided for navigating in the order of cards visited. Using the persona picker in the top bar, the user is able to change the angle from which they are analyzing, which is tracked on the map in color-coded format. 

Lastly, users can type their own question with “Ask your own question” in the menu rail, the only feature that needs an API key. The AI only translates the question into a chart request; code checks it against the data, and a separate check catches causal and forecasting questions even if the AI misses them. A panel then shows what the AI understood in plain words, and nothing is built until the user clicks “Use this.” If the data can’t honestly answer the question, like what caused something, the app says so and offers the closest question it can answer. It then becomes a node with its own card, marked “You asked: …”. For now, I deliberately kept this feature narrow, one chart per question, and learning how to properly flesh it out would be one of the first things I’d do with more time.

More detail: [docs/DESIGN.md](docs/DESIGN.md)

## How I used AI

I used AI for this project the way I have for any technical, creative one. I first grounded my Claude chat in a Claude project with documents like the project instructions and notes on the company I'm building it for. Then I began brainstorming ideas with guidelines: I wanted to focus on storytelling as that is the most fun part, and on a cognitive angle, since that is my interest outside of data science. I treated the AI's opinions as routes that I could adjust, inspiration for ways to go, and ideas to synthesize with my own vision. This led me to my first idea of the slider, because learning how to integrate humans with AI, rather than one or the other doing all the work, is my passion. However, I realized the method of the slider was impractical, so I dropped the idea, learning from my failure, and began further brainstorming. Through prompting, thinking through real user experience, and questioning, I finally arrived at the idea presented here.

For the building, I set up the project locally where Claude Code would live via VS Code, initialized git, and gave it a first prompt to catch it up to speed, grounding it in the rules and ideals I have, and ensuring important decisions were always asked about before being built. From there, I cycled through the same loop for each phase of my plan until the working piece was finished:

1. Chat with Claude to shape the next step
2. Build a prompt for Claude Code
3. Receive its build plan and go through it with Claude chat
4. Prompt Claude Code with my adjustments to the plan

This is my current method of building. I set up the two agents to rigor-check each other, and they often catch mistakes that slip by either individually. I always review and make the final call, ensuring I understand what is being built and how it will affect the project. I love learning how to make this process even more efficient, and looking back, it's astonishing how fast the models and I have improved in this process. Seeing the growth only excites me for what's to come and to keep learning from people who work in this environment every day. 

The full story, including the AI's mistakes I caught: [docs/AI_PROCESS.md](docs/AI_PROCESS.md)

## With more time

The number of little ideas or paths to take while building this piece is almost endless. I feel like I could work on this idea for a month if not more. The first thing I would tackle is making sure the input part of this pipeline works. I would build a data-prep tool so that when users input any type of dataset, it gets cleaned, transformed, and labeled properly with the contracts my current checks rely on: which columns are money, dates, categories, etc., and this list would only grow. Second, I'd add more checks and run the app on diverse datasets to catch where the mechanisms break. Every rule as of now was only found when the Bookshop data exposed the failure. More datasets means more failures found, leading to more mechanisms that would hold up against any dataset with a similar failure. Third, I'd widen what users can ask and how they ask it. I would add better prompting to AI as well as follow-up questions on a card, like "why is Mystery second?" producing the chart, guidance, and caution like it does now but for more specific questions. Finally, what excites me most is figuring out how to have the app learn the user. It would learn their goals, what kinds of questions they ask, what pitfalls they most commonly end up in, and always say why when the profile influences a feature. Of course, privacy, visibility of this profiling, and the ability to turn it off are an absolute must. With each new idea, a path for so many more opens up, so I'll stop here for now.

## More

- [Design](docs/DESIGN.md): how it works
- [Decisions](docs/DECISIONS.md): the 15 calls and what I rejected
- [AI process](docs/AI_PROCESS.md): how I guided the AI
- [Prompts](docs/PROMPTS.md): the three prompts that shaped the project
- [Running](docs/RUNNING.md): setup, tests, eval