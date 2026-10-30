import type { Row } from '../aggregate';
import { parseRoles, type Roles, UNKNOWN_ROLES } from '../roles';

// Synthetic datasets for the generality tests: random shapes from a seed, plus degenerate
// cases. Seeded, so a failure names a seed that rebuilds the exact same dataset. Everything
// here is invented; none of it is Bookshop.

/** mulberry32: a tiny, well-known seeded random number generator (returns 0..1), as in scripts/make-sample.mjs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Generated {
  name: string; // "seed 17" or the degenerate case's name
  columns: string[];
  rows: Row[];
  roles: Roles; // known for some datasets, unknown for others
}

// Number column names from all three of the measure classifier's groups: names that sound
// additive, names that sound like an average, and names that sound like nothing.
const NUMBER_NAMES = ['sales', 'units', 'amount', 'rating', 'score', 'unit_price', 'margin %', 'x', 'level'];
const CATEGORY_NAMES = ['region', 'team', 'kind', 'segment'];
const NUMBER_ROLES = ['money', 'price', 'rate'] as const;

/** A random dataset: 1–3 category columns, 1–2 number columns, maybe a date, 1–120 rows, some missing. */
export function randomDataset(seed: number): Generated {
  const rand = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const shuffled = <T>(xs: readonly T[]) => [...xs].sort(() => rand() - 0.5);

  const cats = shuffled(CATEGORY_NAMES).slice(0, 1 + Math.floor(rand() * 3));
  const nums = shuffled(NUMBER_NAMES).slice(0, 1 + Math.floor(rand() * 2));
  const hasDate = rand() < 0.5;
  const columns = [...(hasDate ? ['day'] : []), ...cats, ...nums];
  const groupsIn = Object.fromEntries(cats.map((c) => [c, 1 + Math.floor(rand() * 6)]));
  const missing = rand() * 0.2; // each cell's chance of being empty
  const n = 1 + Math.floor(rand() * 120);

  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const row: Row = {};
    if (hasDate) row.day = new Date(Date.UTC(2025, 0, 1 + Math.floor(rand() * 365))).toISOString().slice(0, 10);
    for (const c of cats) row[c] = rand() < missing ? '' : `${c}-${1 + Math.floor(rand() * groupsIn[c])}`;
    for (const c of nums) {
      const sign = rand() < 0.1 ? -1 : 1; // a few negatives, like refunds
      const value = rand() < 0.3 ? (rand() * 100).toFixed(2) : String(Math.floor(rand() * 1000));
      row[c] = rand() < missing ? '' : String(sign * Number(value));
    }
    rows.push(row);
  }

  let roles = UNKNOWN_ROLES;
  if (rand() < 0.5) {
    const entries: Record<string, { role: string }> = {};
    if (hasDate) entries.day = { role: 'date' };
    for (const c of cats) entries[c] = { role: rand() < 0.5 ? 'category' : 'entity' };
    for (const c of nums) entries[c] = { role: pick(NUMBER_ROLES) };
    const parsed = parseRoles({ columns: entries }, columns);
    if (!parsed.ok) throw new Error(`generator made an invalid contract: ${parsed.errors.join('; ')}`);
    roles = parsed.roles;
  }
  return { name: `seed ${seed}`, columns, rows, roles };
}

/** The edge cases a random generator rarely hits, each with roles known and unknown. */
export function degenerateDatasets(): Generated[] {
  const columns = ['team', 'owner', 'sales'];
  const make = (name: string, data: [string, string, string][]): Generated[] => {
    const rows = data.map(([team, owner, sales]) => ({ team, owner, sales }));
    const parsed = parseRoles({ columns: { team: { role: 'category' }, owner: { role: 'entity' }, sales: { role: 'money' } } }, columns);
    if (!parsed.ok) throw new Error();
    return [
      { name: `${name} (no roles)`, columns, rows, roles: UNKNOWN_ROLES },
      { name: `${name} (roles)`, columns, rows, roles: parsed.roles },
    ];
  };
  return [
    ...make('one group', [
      ['A', 'p', '5'],
      ['A', 'q', '7'],
    ]),
    ...make('all zeros', [
      ['A', 'p', '0'],
      ['B', 'q', '0'],
    ]),
    ...make('all missing', [
      ['', '', ''],
      ['', '', ''],
    ]),
    ...make('one row', [['A', 'p', '5']]),
    ...make('two groups tied exactly', [
      ['A', 'p', '50'],
      ['B', 'q', '50'],
    ]),
  ];
}
