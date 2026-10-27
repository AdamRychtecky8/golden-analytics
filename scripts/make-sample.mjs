// Generates src/data/sample-sales-synthetic.csv: 200 rows of SYNTHETIC retail sales.
// Seeded, so running it again produces the exact same file (npm run sample).
//
// Patterns built in on purpose, so later phases have something real to find:
// - Outdoor sells more units in summer (May–August).
// - Electronics spikes in November–December.
// - The West region sells about 30% more units than the others.
// Everything else is uniform noise.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROWS = 200;
const SEED = 511;

// mulberry32: a tiny, well-known seeded random number generator (returns 0..1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const pick = (list) => list[Math.floor(rand() * list.length)];

const regions = ['North', 'South', 'East', 'West'];
const basePrice = { Apparel: 35, Home: 60, Electronics: 180, Outdoor: 90 };
const categories = Object.keys(basePrice);

const start = Date.UTC(2025, 0, 1);
const days = 365;

const rows = [];
for (let i = 0; i < ROWS; i++) {
  const date = new Date(start + Math.floor(rand() * days) * 86_400_000);
  const month = date.getUTCMonth(); // 0 = January
  const region = pick(regions);
  const category = pick(categories);

  let units = 1 + Math.floor(rand() * 20);
  if (category === 'Outdoor' && month >= 4 && month <= 7) units = Math.round(units * 1.8);
  if (category === 'Electronics' && month >= 10) units = Math.round(units * 2.2);
  if (region === 'West') units = Math.round(units * 1.3);

  // Price varies ±15% around the category's base price.
  const price = basePrice[category] * (0.85 + rand() * 0.3);
  const revenue = (units * price).toFixed(2);

  rows.push({ date: date.toISOString().slice(0, 10), region, category, units, revenue });
}

rows.sort((a, b) => a.date.localeCompare(b.date));

const header = 'date,region,category,units,revenue';
const lines = rows.map((r) => [r.date, r.region, r.category, r.units, r.revenue].join(','));
const out = fileURLToPath(new URL('../src/data/sample-sales-synthetic.csv', import.meta.url));
writeFileSync(out, [header, ...lines].join('\n') + '\n');
console.log(`Wrote ${rows.length} rows to ${out}`);
