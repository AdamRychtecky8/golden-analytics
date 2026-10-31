import demoText from './data/bookshop-sales.csv?raw';
import { buildCard, type Card } from './card';
import { SECTION_TITLES } from './cardText';
import { datasetFindings } from './datasetFindings';
import { parseCsv } from './loadCsv';
import { buildOptions } from './options';
import type { ChartView } from './paths';
import { profileDataset } from './profile';
import { bookshopRoles } from './roles';

// Bookshop cards as plain text, for reading the wording (npm run cards:bookshop): one card
// per menu option, then one inside a slice (the first comparison's top group). Code text
// only, as with no API key. Not part of the app. No column is named here, so the generality
// test (no Bookshop names in app code) still holds.

export function cardsReport(): string {
  const loaded = parseCsv(demoText, 'bookshop-sales.csv', true);
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  const { columns, rows } = loaded.dataset;
  const profile = profileDataset(columns, rows);
  const roles = bookshopRoles(columns);
  const menu = buildOptions(profile, rows, roles);
  const dataset = datasetFindings(menu.map((o) => o.view), profile, rows, roles);
  const views = menu.map((o) => o.view);
  // A slice: the first comparison narrowed to its top group, seen through the next comparison.
  const first = menu.find((o) => o.kind === 'comparison');
  const top = first ? buildCard(first.view, profile, rows, roles, dataset).highlight : null;
  const next = menu.find((o) => o.kind === 'comparison' && first !== undefined && o.column !== first.column && !o.repairs);
  if (first && top && next) views.push({ ...next.view, filters: [{ field: first.column, value: top }] });
  return views.map((v) => render(v, buildCard(v, profile, rows, roles, dataset))).join('\n\n');
}

function render(view: ChartView, card: Card): string {
  const scope = view.filters.length > 0 ? ` (where ${view.filters.map((f) => `${f.field} is ${f.value}`).join(' and ')})` : '';
  const out = [`=== ${view.fields.join(' by ')}${scope}   [highlighted mark: ${card.highlight ?? 'none'}]`];
  if (card.datasetLine) out.push(`  ▸ ${card.datasetLine.text}`);
  out.push(`  ${SECTION_TITLES.talk.toUpperCase()}`, `    Headline${card.headline.locked ? ' (locked)' : ''}: ${card.headline.text}`, ...card.points.map((p) => `    • ${p.text}`));
  if (card.cautions.length > 0) {
    out.push(`  ${SECTION_TITLES.caution.toUpperCase()}`);
    for (const c of card.cautions) {
      out.push(`    Claim: "${c.claim.text}"   [${c.checks.join(' + ')}]`, ...c.whys.map((w) => `      Why: ${w.text}`), `      Instead: ${c.instead.text}`);
    }
  }
  if (card.asks.length > 0) {
    out.push(`  ${SECTION_TITLES.ask.toUpperCase()}`);
    for (const a of card.asks) out.push(`    Q: ${a.question.text}`, `    A: ${a.answer.text}`);
  }
  out.push(`  ${SECTION_TITLES.cannot.toUpperCase()}`, ...card.cannot.map((c) => `    ${c.text}`));
  return out.join('\n');
}
