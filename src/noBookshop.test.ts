import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './loadCsv';

// Generality rule (SPEC "Generality"): app code is keyed to roles, facets, and data shape,
// never to column names or values. This test fails if a string literal in app code exactly
// equals a Bookshop column name or category/entity/flag value (ignoring case), unless it is on
// the allowlist below with a reason. Comments don't run, so Bookshop examples in comments are
// reported, not failed.
//
// Scope: .ts and .tsx files under src/, excluding src/data, src/fixtures, and tests.
// Limitation: it reads string literals only, so a value typed as plain JSX text would slip by.

const ALLOWED: { file: string; literal: string; reason: string }[] = [
  { file: 'src/checks.ts', literal: 'revenue', reason: 'MONEY_WORDS: generic money vocabulary for guessing from names when a dataset has no roles' },
  { file: 'src/checks.ts', literal: 'price', reason: 'MONEY_WORDS: generic money vocabulary for guessing from names when a dataset has no roles' },
  { file: 'src/profile.ts', literal: 'revenue', reason: 'measure classifier word list (D-054): generic vocabulary, used only without roles' },
  { file: 'src/profile.ts', literal: 'price', reason: 'measure classifier word list (D-054): generic vocabulary, used only without roles' },
  { file: 'src/profile.ts', literal: 'discount', reason: 'measure classifier word list (D-054): generic vocabulary, used only without roles' },
  { file: 'src/roles.ts', literal: 'price', reason: 'the role named "price" in the contract vocabulary, not the column' },
];

const SRC = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(SRC, '..');
const LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`/g;

function appFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'data' || name === 'fixtures' ? [] : appFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every Bookshop column name and category/entity/flag value, lower-cased, mapped to its original. */
function bookshopTerms(): Map<string, string> {
  const loaded = parseCsv(readFileSync(join(SRC, 'data', 'bookshop-sales.csv'), 'utf8'), 'bookshop', true);
  if (!loaded.ok) throw new Error('bookshop failed to parse');
  const contract = JSON.parse(readFileSync(join(SRC, 'data', 'bookshop-sales.roles.json'), 'utf8'));
  const labelled = loaded.dataset.columns.filter((c) => ['category', 'entity', 'flag'].includes(contract.columns[c].role));
  const terms = new Map(loaded.dataset.columns.map((c) => [c.toLowerCase(), c]));
  for (const row of loaded.dataset.rows) for (const c of labelled) if (row[c].trim()) terms.set(row[c].trim().toLowerCase(), row[c].trim());
  return terms;
}

function scan() {
  const terms = bookshopTerms();
  const literals: { file: string; line: number; literal: string }[] = [];
  const comments: { file: string; line: number; term: string }[] = [];
  for (const path of appFiles(SRC)) {
    const file = relative(ROOT, path).split(sep).join('/');
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        const trimmed = text.trim();
        const commentLine = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
        const cut = commentLine ? 0 : text.indexOf('//');
        const code = commentLine ? '' : cut >= 0 ? text.slice(0, cut) : text;
        const comment = commentLine ? text : cut >= 0 ? text.slice(cut) : '';
        for (const m of code.matchAll(LITERAL)) {
          const value = m[1] ?? m[2] ?? m[3];
          if (terms.has(value.toLowerCase())) literals.push({ file, line: i + 1, literal: value });
        }
        // Comments: report values long enough to mean something (not "yes", "no").
        for (const term of terms.values()) {
          if (term.length > 3 && term !== term.toLowerCase() && new RegExp(`(?<![A-Za-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(comment)) {
            comments.push({ file, line: i + 1, term });
          }
        }
      });
  }
  return { literals, comments };
}

describe('no Bookshop names or values in app code', () => {
  const { literals, comments } = scan();
  const allowed = (h: { file: string; literal: string }) => ALLOWED.some((a) => a.file === h.file && a.literal.toLowerCase() === h.literal.toLowerCase());

  it('has no string literal equal to a Bookshop column name or value, except the allowlist', () => {
    expect(literals.filter((h) => !allowed(h)).map((h) => `${h.file}:${h.line} '${h.literal}'`)).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const stale = ALLOWED.filter((a) => !literals.some((h) => h.file === a.file && h.literal.toLowerCase() === a.literal.toLowerCase()));
    expect(stale).toEqual([]);
  });

  it('reports Bookshop examples in comments (not a failure)', () => {
    if (comments.length > 0) console.info(`Bookshop values in comments:\n${comments.map((c) => `  ${c.file}:${c.line} ${c.term}`).join('\n')}`);
    expect(Array.isArray(comments)).toBe(true);
  });
});
