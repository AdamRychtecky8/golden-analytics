import casesJson from '../docs/eval/ask-cases.json';
import { ask } from '../api/ask';
import { envFromProcess } from '../api/_shared';
import demoText from './data/bookshop-sales.csv?raw';
import { buildAskRequest, resolveAsk } from './ask';
import { missReason, type AskCase } from './askEval';
import { parseCsv } from './loadCsv';
import { DEFAULT_PERSONA } from './personas';
import { profileDataset } from './profile';
import { bookshopRoles } from './roles';

// npm run eval:ask: the evaluation set against the real model, through the same handler and
// the same code decisions as the app. Costs one small model call per case, so it is not part
// of npm test. Cases marked fakeOnly (deliberately wrong AI replies) are skipped.

export async function runAskEval(): Promise<string> {
  const env = envFromProcess();
  if (!env.apiKey) return 'No ANTHROPIC_API_KEY in .env: eval:ask calls the real model. Add a key (see docs/RUNNING.md) and run again.';
  const loaded = parseCsv(demoText, 'bookshop-sales.csv', true);
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  const { columns, rows } = loaded.dataset;
  const profile = profileDataset(columns, rows);
  const roles = bookshopRoles(columns);
  const cases = (casesJson.cases as AskCase[]).filter((c) => !c.fakeOnly);

  const lines: string[] = [];
  let passed = 0;
  for (const c of cases) {
    const request = buildAskRequest(c.prompt, profile, rows, roles, DEFAULT_PERSONA, c.scope ?? []);
    const reply = await ask(request, env);
    const result = reply.body.ok ? resolveAsk(reply.body.result, { text: c.prompt, profile, rows, roles }) : null;
    const miss = result ? missReason(c, result) : `no reply (${'message' in reply.body ? reply.body.message : 'error'})`;
    if (miss === null) passed++;
    lines.push(`${miss === null ? 'pass' : 'MISS'}  ${c.id}: "${c.prompt}"${miss ? `\n        ${miss}\n        model said: ${JSON.stringify(reply.body.ok ? reply.body.result : reply.body)}` : ''}`);
  }
  lines.push('', `Passed ${passed} of ${cases.length} (${Math.round((passed / cases.length) * 100)}%), model ${env.model || 'default'}.`);
  return lines.join('\n');
}
