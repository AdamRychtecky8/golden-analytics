import demoText from './data/bookshop-sales.csv?raw';
import { REASONS, reasonFor, rulesHighlight } from './highlight';
import { parseCsv } from './loadCsv';
import { buildOptions, isEligible, type Option } from './options';
import { PRESETS, PURPOSES, customPersona } from './personas';
import { profileDataset } from './profile';
import { FACETS, bookshopRoles, facetOf, rowNounOf, type Facet } from './roles';

// A plain-text report of the Bookshop menu and each persona's highlight, for checking the
// options and highlight logic by eye (npm run options:bookshop). It uses the rules only, the
// same as the app with no API key. Not part of the app.

const fmt = (x: number | null) => (x === null ? 'none' : x.toFixed(2));

/** A rules reason as text, or which slots it is missing. */
const shown = (r: { text: string | null; missing: string[] }) => r.text ?? `(unrendered: ${r.missing.join(', ')})`;

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
  for (const persona of [...PRESETS, customPersona('retail', 'owner', 'getting a feel for the data', 'Getting a feel')]) {
    const h = rulesHighlight(options, persona, roles);
    out.push(`  ${persona.name} (${persona.purpose})`);
    if (!h) {
      out.push('      no options');
      continue;
    }
    const picked = options.find((o) => o.id === h.id)!;
    out.push(`      ${h.label === 'highlight' ? 'Highlight' : 'Best place to start'}: ${h.id}`, `      "${picked.question}"`, `      Reason: ${h.reason ?? `(unrendered: ${h.unrendered!.join(', ')})`}`);
  }

  // Every sentence the rules can produce, for reading them all at once. Each facet is filled
  // with the first Bookshop column that has it; "no facet" with the first option without one.
  out.push('', 'EVERY RULES REASON (purpose x kind x facet), filled with Bookshop values');
  const comparisons = options.filter((o) => o.kind === 'comparison' && !o.repairs);
  const columnFor = (facet: Facet | null) => comparisons.find((o) => facetOf(roles, o.column) === facet)?.column;
  const trend = options.find((o) => o.kind === 'trend');
  for (const purpose of PURPOSES) {
    out.push(`  ${purpose}`);
    for (const facet of [...FACETS, null]) {
      const column = columnFor(facet);
      if (column) out.push(`      comparison, ${facet ?? 'no facet'} (${column}): ${shown(reasonFor({ kind: 'comparison', facet, column }, purpose))}`);
    }
    if (trend) out.push(`      trend (${trend.column}): ${shown(reasonFor(trend, purpose))}`);
  }
  // The repair line, for each repair in the menu, and the best-place-to-start line.
  for (const o of options.filter((x) => x.repairs)) {
    const original = options.find((x) => x.id === o.repairs)!;
    out.push(`  repair (${o.id}): ${shown(reasonFor(o, 'deciding where to invest', { many: rowNounOf(roles).many, measure: original.measure!, column: original.column }))}`);
  }
  out.push(`  best place to start: ${REASONS.bestPlace}`);
  return out.join('\n');
}
