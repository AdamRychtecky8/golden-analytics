import demoText from './data/bookshop-sales.csv?raw';
import { rulesHighlight } from './highlight';
import { parseCsv } from './loadCsv';
import { buildOptions, isEligible, type Option } from './options';
import { PRESETS, customPersona } from './personas';
import { profileDataset } from './profile';
import { bookshopRoles } from './roles';

// A plain-text report of the Bookshop menu and each persona's highlight, for checking the
// options and highlight logic by eye (npm run options:bookshop). It uses the rules only, the
// same as the app with no API key. Not part of the app.

const fmt = (x: number | null) => (x === null ? 'none' : x.toFixed(2));

export function bookshopReport(): string {
  const loaded = parseCsv(demoText, 'bookshop-sales.csv', true);
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  const { columns, rows } = loaded.dataset;
  const roles = bookshopRoles(columns);
  const options = buildOptions(profileDataset(columns, rows), rows, roles);
  const out: string[] = [`Bookshop: ${rows.length.toLocaleString('en-US')} rows, ${options.length} options (the menu is the same for every persona)`, ''];

  const line = (o: Option) => {
    const flags = o.findings.map((f) => `${f.id} (${f.severity})`).join(', ') || 'no findings';
    const tags = [o.kind, o.facet ?? 'no facet', `effect ${fmt(o.effect)}`, o.repairs ? `repairs ${o.repairs}` : ''].filter(Boolean).join(' · ');
    return [`  ${isEligible(o) ? 'eligible  ' : 'MISLEADING'}  ${o.id}`, `      "${o.question}"`, `      ${tags}`, `      findings: ${flags}`];
  };
  out.push('MENU', ...options.flatMap(line), '');

  out.push('HIGHLIGHT PER PERSONA (rules)');
  for (const persona of [...PRESETS, customPersona('retail', 'owner', 'just exploring', 'Explorer')]) {
    const h = rulesHighlight(options, persona, roles);
    out.push(`  ${persona.name} (${persona.purpose})`);
    if (!h) {
      out.push('      no options');
      continue;
    }
    const picked = options.find((o) => o.id === h.id)!;
    out.push(`      ${h.label === 'highlight' ? 'Highlight' : 'Best place to start'}: ${h.id}`, `      "${picked.question}"`, `      Reason: ${h.reason}`);
  }
  return out.join('\n');
}
