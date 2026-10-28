import Papa from 'papaparse';
import type { Row } from './aggregate';

export interface Dataset {
  name: string;
  columns: string[];
  rows: Row[];
  demo: boolean; // bundled demo data (fictional), as opposed to a file the user loaded
}

// A discriminated union: the `ok` field tells TypeScript which shape the rest has.
export type LoadResult = { ok: true; dataset: Dataset } | { ok: false; errors: string[] };

const MAX_ERRORS_SHOWN = 5;

/**
 * Parses CSV text into a Dataset. The app expects a clean, typed CSV (D-010), so instead
 * of guessing or silently dropping bad rows, any structural problem rejects the file with
 * a message saying exactly which rows are wrong.
 */
export function parseCsv(text: string, name: string, demo = false): LoadResult {
  const result = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    // Keep every value as a string; profile.ts decides each column's type explicitly.
    dynamicTyping: false,
  });

  const columns = (result.meta.fields ?? []).map((c) => c.trim());
  const errors: string[] = [];

  if (columns.length === 0) errors.push('The file has no header row.');
  if (columns.some((c) => c === '')) errors.push('One or more columns has an empty name in the header row.');
  // Papa quietly renames a repeated header ("a, a" → "a, a_1") and records the original
  // in meta.renamedHeaders. A renamed column would be a column the user never named, so
  // we treat it as an error. The cast is needed because @types/papaparse omits this field.
  const renamed = (result.meta as { renamedHeaders?: Record<string, string> }).renamedHeaders ?? {};
  const duplicates = [...Object.values(renamed), ...columns.filter((c, i) => columns.indexOf(c) !== i)];
  if (duplicates.length > 0) errors.push(`Duplicate column names: ${[...new Set(duplicates)].join(', ')}.`);

  for (const e of result.errors) {
    // Papa's row index is 0-based over data rows; +2 gives the line number in the file
    // (1 for the header, 1 for 0-based counting).
    const line = e.row !== undefined ? ` (line ${e.row + 2})` : '';
    errors.push(`${e.message}${line}`);
  }

  if (errors.length === 0 && result.data.length === 0) errors.push('The file has a header row but no data rows.');

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS_SHOWN);
    if (errors.length > MAX_ERRORS_SHOWN) shown.push(`…and ${errors.length - MAX_ERRORS_SHOWN} more problems.`);
    return { ok: false, errors: shown };
  }

  // Re-key rows by trimmed column names so " revenue" and "revenue" can't diverge.
  const rawFields = result.meta.fields!;
  const rows = result.data.map((raw) => {
    const row: Row = {};
    rawFields.forEach((f, i) => (row[columns[i]] = raw[f] ?? ''));
    return row;
  });

  return { ok: true, dataset: { name, columns, rows, demo } };
}
