import { isMissing, parseNumber, type Row } from './aggregate';
import { runChecks, type CheckId } from './checks';
import type { ChartView } from './paths';
import type { DataProfile } from './profile';
import type { Roles } from './roles';

// Dataset-level findings: when the same entity drives findings in several charts, that's a
// fact about the whole dataset ("one author drives a third of all revenue"), so the UI can
// say it once instead of on every card. Engine only; nothing shows these yet.

// Once is one chart's story; twice or more is a pattern in the data.
export const DATASET_MIN_VIEWS = 2;

export interface DatasetFinding {
  column: string; // the entity column, e.g. "author"
  entity: string; // e.g. "Bianca Thompson"
  views: { view: ChartView; checks: CheckId[] }[]; // each chart it drives a finding in, and which checks
  // The entity's share of the whole dataset's total (no filters) for each measure those charts
  // use; measure null means the record count. share is null when the total is zero or less.
  shares: { measure: string | null; share: number | null }[];
}

/** The entity a finding names, if any: the entity check's, or a fragile lead's flip. */
function namedEntity(evidence: { check: string } & Record<string, unknown>): { column: string; entity: string } | null {
  if (evidence.check === 'entity') return { column: evidence.column as string, entity: evidence.entity as string };
  if (evidence.check === 'fragile' && evidence.flip) {
    const flip = evidence.flip as { column: string; entity: string };
    return { column: flip.column, entity: flip.entity };
  }
  return null;
}

/** The entity's part of the dataset's total for one measure (null: count rows). */
function shareOf(rows: Row[], column: string, entity: string, measure: string | null): number | null {
  let total = 0;
  let part = 0;
  for (const r of rows) {
    if (measure !== null && isMissing(r[measure])) continue;
    const v = measure === null ? 1 : parseNumber(r[measure]);
    if (v === null) continue;
    total += v;
    if (!isMissing(r[column]) && r[column].trim() === entity) part += v;
  }
  return total > 0 ? part / total : null;
}

/**
 * Runs the checks on every view and reports each entity that drives findings in at least
 * DATASET_MIN_VIEWS of them, most views first (then by column and name, so the order is fixed).
 */
export function datasetFindings(views: ChartView[], profile: DataProfile, rows: Row[], roles: Roles): DatasetFinding[] {
  const found = new Map<string, { column: string; entity: string; views: DatasetFinding['views']; measures: Set<string | null> }>();
  for (const view of views) {
    const run = runChecks(view, profile, rows, roles);
    const inThisView = new Map<string, CheckId[]>();
    for (const f of run.findings) {
      const named = namedEntity(f.evidence as { check: string } & Record<string, unknown>);
      if (!named) continue;
      const key = JSON.stringify([named.column, named.entity]);
      if (!found.has(key)) found.set(key, { ...named, views: [], measures: new Set() });
      inThisView.set(key, [...(inThisView.get(key) ?? []), f.id]);
      found.get(key)!.measures.add((f.evidence as { measure: string | null }).measure);
    }
    for (const [key, checks] of inThisView) found.get(key)!.views.push({ view, checks });
  }
  return [...found.values()]
    .filter((x) => x.views.length >= DATASET_MIN_VIEWS)
    .sort((a, b) => b.views.length - a.views.length || a.column.localeCompare(b.column) || a.entity.localeCompare(b.entity))
    .map(({ column, entity, views: vs, measures }) => ({
      column,
      entity,
      views: vs,
      // Named measures first, then the record count, so the order is fixed.
      shares: [...measures]
        .sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
        .map((measure) => ({ measure, share: shareOf(rows, column, entity, measure) })),
    }));
}
