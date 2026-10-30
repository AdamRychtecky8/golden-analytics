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
