import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runChecks, type CheckId, type Severity } from './checks';
import { parseCsv } from './loadCsv';
import { profileDataset } from './profile';
import { parseRoles, UNKNOWN_ROLES } from './roles';

// Each check against a synthetic CSV where it must fire, and a clean control where it must
// stay quiet. The hand arithmetic for every file is in src/fixtures/synthetic-checks/README.md.

function fixture(name: string, withRoles = true) {
  const dir = new URL(`./fixtures/synthetic-checks/`, import.meta.url);
  const loaded = parseCsv(readFileSync(new URL(`${name}.csv`, dir), 'utf8'), name, true);
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  const { columns, rows } = loaded.dataset;
  let roles = UNKNOWN_ROLES;
  if (withRoles) {
    const parsed = parseRoles(JSON.parse(readFileSync(new URL(`${name}.roles.json`, dir), 'utf8')), columns);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    roles = parsed.roles;
  }
  // Every fixture is charted as its first column by its money column, summed.
  const view = { fields: [columns[0], 'revenue'], aggregate: 'sum' as const, filters: [] };
  return runChecks(view, profileDataset(columns, rows), rows, roles);
}

const severityOf = (name: string, id: CheckId) => fixture(name).findings.find((f) => f.id === id)?.severity;

describe('each check fires on its planted fixture, with the expected severity', () => {
  it.each<[string, CheckId, Severity]>([
    ['mix-misleading', 'mix', 'misleading'],
    ['mix-caveat', 'mix', 'caveat'],
    ['small-misleading', 'small', 'misleading'],
    ['small-caveat', 'small', 'caveat'],
    ['concentration-caveat', 'concentration', 'caveat'],
    ['entity-misleading', 'entity', 'misleading'],
    ['entity-caveat', 'entity', 'caveat'],
    ['fragile-lead-caveat', 'fragile', 'caveat'],
    ['fragile-lead-flip', 'fragile', 'caveat'],
  ])('%s → %s, %s', (name, id, severity) => {
    expect(severityOf(name, id)).toBe(severity);
  });
});

describe('each check stays quiet on its clean control', () => {
  it.each<[string, CheckId]>([
    ['mix-control', 'mix'],
    ['small-control', 'small'],
    ['concentration-control', 'concentration'],
    ['entity-control', 'entity'],
    ['fragile-lead-flip', 'entity'], // a 37.5% author flips first place: not "driven by"
    ['fragile-lead-control', 'fragile'], // 1.20
    ['fragile-lead-boundary', 'fragile'], // exactly 1.10: "less than" means quiet
  ])('%s → no %s finding, and it ran (not skipped)', (name, id) => {
    const run = fixture(name);
    expect(run.findings.map((f) => f.id)).not.toContain(id);
    expect(run.skipped.map((s) => s.id)).not.toContain(id);
  });
});

describe('the entity fixtures, by the numbers', () => {
  it('misleading: Ann is 97% of SciFi, which ranks 2nd without her', () => {
    const f = fixture('entity-misleading').findings.find((x) => x.id === 'entity')!;
    expect(f.text).toBe('Ann accounts for 97% of revenue in SciFi. Without that author, SciFi ranks 2nd.');
    expect(f.evidence).toMatchObject({ entity: 'Ann', entityValue: 300, groupValue: 310, rankWithout: 2 });
  });

  it('caveat: Ann is 60% of SciFi, which stays 1st', () => {
    const f = fixture('entity-caveat').findings.find((x) => x.id === 'entity')!;
    expect(f.text).toBe('Ann accounts for 60% of revenue in SciFi.');
    expect(f.evidence).toMatchObject({ share: 0.6, rankWithout: 1 });
  });
});

describe('an uploaded CSV with no roles file', () => {
  it('skips the role-dependent checks and says why, while the name-based ones still run', () => {
    const run = fixture('entity-misleading', false);
    expect(run.skipped).toEqual([{ id: 'entity', reason: 'roles are unknown (no roles file), so no column is known to be an entity' }]);
    // Mix falls back to the name guess: "revenue" looks like money, so it ran.
    expect(run.skipped.map((s) => s.id)).not.toContain('mix');
  });
});

describe('the fragile-lead fixtures, by the numbers', () => {
  it('a narrow gap: 105 vs 100 is 5.0% ahead, shown with one decimal', () => {
    const f = fixture('fragile-lead-caveat').findings.find((x) => x.id === 'fragile')!;
    expect(f.text).toBe('A is only 5.0% ahead of B, a lead small enough that ordinary changes could erase it.');
    expect(f.evidence).toMatchObject({ ratio: 1.05, narrow: true, flip: null, top: { label: 'A', value: 105 }, second: { label: 'B', value: 100 } });
  });

  it('a clear gap that one smaller author tips: SciFi 80 vs Mystery 65, 2nd without Ann', () => {
    const f = fixture('fragile-lead-flip').findings.find((x) => x.id === 'fragile')!;
    expect(f.text).toBe('SciFi leads Mystery by 23%, but without Ann (one author), SciFi ranks 2nd.');
    expect(f.evidence).toMatchObject({ narrow: false, flip: { column: 'author', entity: 'Ann', share: 0.375, rankWithout: 2 } });
  });

  it('an exact tie reads "tied with"', () => {
    const rows = [
      { store: 'A', revenue: '50' },
      { store: 'B', revenue: '50' },
    ];
    const run = runChecks({ fields: ['store', 'revenue'], aggregate: 'sum', filters: [] }, profileDataset(['store', 'revenue'], rows), rows);
    expect(run.findings.find((x) => x.id === 'fragile')!.text).toBe('A is tied with B, so ordinary changes could decide first place.');
  });

  it('skips when the second group is zero, since the ratio means nothing', () => {
    const rows = [
      { store: 'A', revenue: '50' },
      { store: 'B', revenue: '0' },
    ];
    const run = runChecks({ fields: ['store', 'revenue'], aggregate: 'sum', filters: [] }, profileDataset(['store', 'revenue'], rows), rows);
    expect(run.skipped).toContainEqual({ id: 'fragile', reason: "the second group's value is zero or less, so top ÷ second means nothing" });
  });
});
