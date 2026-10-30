import bookshopRolesJson from './data/bookshop-sales.roles.json';

// What each column is, declared by whoever prepared the data (for Bookshop, the prep
// script), so checks don't have to guess from column names. A CSV the user uploads has no
// roles file: its roles are "unknown", and any check that needs a role skips.

export const ROLES = ['money', 'price', 'rate', 'date', 'category', 'entity', 'flag', 'id'] as const;
export type Role = (typeof ROLES)[number];

export type Roles = { known: true; byColumn: Record<string, Role> } | { known: false };

export const UNKNOWN_ROLES: Roles = { known: false };

export type RolesResult = { ok: true; roles: Roles } | { ok: false; errors: string[] };

/** Checks a roles file against a dataset's columns: every column exactly one known role. */
export function parseRoles(json: unknown, columns: string[]): RolesResult {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: ['The roles file must be an object of column name → role.'] };
  }
  const entries = Object.entries(json as Record<string, unknown>);
  const errors: string[] = [];
  for (const [column, role] of entries) {
    if (!columns.includes(column)) errors.push(`"${column}" has a role but isn't a column in the data.`);
    if (!ROLES.includes(role as Role)) errors.push(`"${column}" has an unknown role ${JSON.stringify(role)}. Known roles: ${ROLES.join(', ')}.`);
  }
  for (const column of columns) {
    if (!(column in (json as object))) errors.push(`"${column}" has no role.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, roles: { known: true, byColumn: Object.fromEntries(entries) as Record<string, Role> } };
}

/** A column's role, or null when roles are unknown. */
export function roleOf(roles: Roles, column: string): Role | null {
  return roles.known ? roles.byColumn[column] : null;
}

/**
 * The Bookshop demo data's roles. The prep script writes the file and checks it covers the
 * CSV's columns; this parses it again against the column list the app will see.
 */
export function bookshopRoles(columns: string[]): Roles {
  const result = parseRoles(bookshopRolesJson, columns);
  if (!result.ok) throw new Error(`Bundled Bookshop roles don't match the data: ${result.errors.join('; ')}`);
  return result.roles;
}
