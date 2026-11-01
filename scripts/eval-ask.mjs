// Runs the "Ask your own question" evaluation set (docs/eval/ask-cases.json) against the real
// model and prints a pass rate and every miss (npm run eval:ask). It calls the API once per
// case, so it needs ANTHROPIC_API_KEY in .env and costs a little; it is not part of npm test.
// The logic is TypeScript in src/, so this asks Vite (already installed) to load it.
// Each run is also saved to .eval-runs/ (gitignored), so results outlive the terminal.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { runAskEval } = await server.ssrLoadModule('/src/askEvalRun.ts');
  const report = await runAskEval();
  console.log(report);
  mkdirSync('.eval-runs', { recursive: true });
  const file = `.eval-runs/ask-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  writeFileSync(file, report + '\n');
  console.log(`Saved to ${file}`);
} finally {
  await server.close();
}
