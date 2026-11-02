import { isoDay } from './format';
import type { Persona } from './personas';
import type { DataProfile, FieldType } from './profile';

// What the AI is allowed to see (D-011): a summary of the profile and who the user is, never
// raw rows. Every AI request starts from this; the server handlers import only its types.

export interface ColumnSummary {
  name: string;
  type: FieldType;
  missing: number;
  distinct: number;
  measure?: 'additive' | 'average'; // numbers only: whether a sum means anything (D-050)
  min?: number | string; // numbers as numbers, dates as ISO strings
  max?: number | string;
  topValues?: { value: string; count: number }[];
}

/** What every AI request starts with: the profile summary and who the user is. */
export interface AiContext {
  profile: { rowCount: number; columns: ColumnSummary[] };
  persona: Pick<Persona, 'domain' | 'role' | 'purpose'>;
}

/** Copies only the summary fields out of the profile. Bins and anything row-level stay home. */
export function summarizeProfile(profile: DataProfile): AiContext['profile'] {
  return {
    rowCount: profile.rowCount,
    columns: profile.columns.map((c) => {
      const base: ColumnSummary = { name: c.name, type: c.type, missing: c.missing, distinct: c.distinct };
      if (c.count === 0) return base;
      if (c.type === 'quantitative') return { ...base, measure: c.measure, min: c.min, max: c.max };
      if (c.type === 'temporal') return { ...base, min: isoDay(c.min!), max: isoDay(c.max!) };
      return { ...base, topValues: c.topValues };
    }),
  };
}
