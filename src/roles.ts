import bookshopRolesJson from './data/bookshop-sales.roles.json';
import type { DataProfile } from './profile';

// The dataset contract: what each column is, declared by whoever prepared the data (for
// Bookshop, the prep script; in production, an upstream classifier), so app code is keyed
// to roles and data shape, never to column names. A CSV the user uploads has no contract:
// its roles are "unknown", and any check that needs a role skips.
//
// File shape:
//   { "rowNoun": { "one": "item sold", "many": "items sold" },   (optional)
//     "columns": { "genre": { "role": "category", "facet": "offering" }, "price": { "role": "price" }, … } }

export const ROLES = ['money', 'price', 'rate', 'date', 'category', 'entity', 'flag', 'id'] as const;
export type Role = (typeof ROLES)[number];

// What kind of thing a category is: what the business offers, who supplies or creates it,
// or where. Only category and entity columns can have one.
export const FACETS = ['offering', 'source', 'place'] as const;
export type Facet = (typeof FACETS)[number];
const FACET_ROLES: Role[] = ['category', 'entity'];

/** What one row is called, in both forms, so code-written sentences read naturally. */
export interface RowNoun {
  one: string;
  many: string;
}
export const DEFAULT_ROW_NOUN: RowNoun = { one: 'record', many: 'records' };

export type Roles =
  | { known: true; byColumn: Record<string, Role>; facets: Record<string, Facet>; rowNoun: RowNoun }
  | { known: false };

export const UNKNOWN_ROLES: Roles = { known: false };

export type RolesResult = { ok: true; roles: Roles } | { ok: false; errors: string[] };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';

/**
 * Checks a contract against a dataset's columns: every column exactly one known role, a
 * facet only on category or entity columns and only a known one, and a row noun (if given)
 * with both forms. Lists every problem, not just the first.
 */
export function parseRoles(json: unknown, columns: string[]): RolesResult {
  if (!isObject(json) || !isObject(json.columns)) {
    return { ok: false, errors: ['The roles file must be an object with a "columns" object of column name → { role, facet? }.'] };
  }
  const errors: string[] = [];
  const byColumn: Record<string, Role> = {};
  const facets: Record<string, Facet> = {};

  for (const [column, entry] of Object.entries(json.columns)) {
    if (!columns.includes(column)) errors.push(`"${column}" has a role but isn't a column in the data.`);
    if (!isObject(entry)) {
      errors.push(`"${column}" must be an object like { "role": "category" }.`);
      continue;
    }
    const { role, facet } = entry;
    if (!ROLES.includes(role as Role)) {
      errors.push(`"${column}" has an unknown role ${JSON.stringify(role)}. Known roles: ${ROLES.join(', ')}.`);
      continue;
    }
    byColumn[column] = role as Role;
    if (facet === undefined) continue;
    if (!FACETS.includes(facet as Facet)) {
      errors.push(`"${column}" has an unknown facet ${JSON.stringify(facet)}. Known facets: ${FACETS.join(', ')}.`);
    } else if (!FACET_ROLES.includes(role as Role)) {
      errors.push(`"${column}" has a facet, but only ${FACET_ROLES.join(' or ')} columns can have one (its role is ${role}).`);
    } else {
      facets[column] = facet as Facet;
    }
  }
  for (const column of columns) {
    if (!(column in json.columns)) errors.push(`"${column}" has no role.`);
  }

  let rowNoun = DEFAULT_ROW_NOUN;
  if (json.rowNoun !== undefined) {
    const n = json.rowNoun;
    if (isObject(n) && isText(n.one) && isText(n.many)) rowNoun = { one: n.one, many: n.many };
    else errors.push('"rowNoun" must be { "one": "…", "many": "…" } with both forms filled in.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, roles: { known: true, byColumn, facets, rowNoun } };
}

/** A column's role, or null when roles are unknown. */
export function roleOf(roles: Roles, column: string): Role | null {
  return roles.known ? roles.byColumn[column] : null;
}

/** A column's facet, or null when it has none or roles are unknown. */
export function facetOf(roles: Roles, column: string): Facet | null {
  return roles.known ? (roles.facets[column] ?? null) : null;
}

/** What one row is called: the contract's noun, or record/records without one. */
export function rowNounOf(roles: Roles): RowNoun {
  return roles.known ? roles.rowNoun : DEFAULT_ROW_NOUN;
}

/**
 * The profile with each number column's measure kind decided by its role when roles are
 * known: "money" can be summed; every other role (price, rate, id, …) is average-only, since
 * a mean is always a true statement and a wrong sum is not. Without roles, the name-based
 * guess in profile.ts stands.
 */
export function withRoleMeasures(profile: DataProfile, roles: Roles): DataProfile {
  if (!roles.known) return profile;
  return {
    ...profile,
    columns: profile.columns.map((c) =>
      c.type === 'quantitative' && c.name in roles.byColumn ? { ...c, measure: roles.byColumn[c.name] === 'money' ? 'additive' : 'average' } : c,
    ),
  };
}

/**
 * The Bookshop demo data's contract. The prep script writes the file and checks it covers
 * the CSV's columns; this parses it again against the column list the app will see.
 */
export function bookshopRoles(columns: string[]): Roles {
  const result = parseRoles(bookshopRolesJson, columns);
  if (!result.ok) throw new Error(`Bundled Bookshop roles don't match the data: ${result.errors.join('; ')}`);
  return result.roles;
}
