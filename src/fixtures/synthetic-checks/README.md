# Synthetic check fixtures

**Every file in this folder is synthetic.** The numbers are invented to plant one effect each, small enough to check by hand. They are not Bookshop data and are never shown in the app. Tests: [checks.fixtures.test.ts](../../checks.fixtures.test.ts).

Each `name.csv` has a `name.roles.json` beside it. Rows are sorted in blocks of identical lines, so the arithmetic is just counting. Every chart is "first column by the money column, summed".

| File | Planted effect | Hand check | Expected |
|---|---|---|---|
| mix-misleading | The #1 by money is not the #1 by count | Hardcover 2 × 50 = 100 (2 records); Paperback 5 × 10 = 50 (5 records) | mix, misleading |
| mix-caveat | The #1 holds; a lower group moves 2 places | A 10 × 10 = 100; B 2 × 45 = 90; C 8 × 10 = 80; D 7 × 10 = 70. By count: A 10, C 8, D 7, B 2. B is 2nd by money, 4th by count | mix, caveat |
| mix-control | Money and count agree | A 30 (3), B 20 (2), C 10 (1) | no mix finding |
| small-misleading | The top group has under 30 records | A 5 × 100 = 500 (5 records); B 30 × 10 = 300 (30) | small, misleading |
| small-caveat | Only a lower group has under 30 records | A 30 × 10 = 300 (30); B 5 × 10 = 50 (5) | small, caveat |
| small-control | Every group has 30 records | A 30, B 30 | no small finding |
| concentration-caveat | One group holds 40% or more | A 30 of 50 = 60% | concentration, caveat |
| concentration-control | No group reaches 40% | A 30 of 100 = 30% | no concentration finding |
| entity-misleading | The top group's lead is one author | SciFi 310 (Ann 300 = 97%, Bob 10); Mystery 250. Without Ann: Mystery 250, SciFi 10 → SciFi 2nd | entity, misleading |
| entity-caveat | One author is half or more of the top group, which stays first | SciFi 500 (Ann 300 = 60%, Bob 200); Mystery 150. Without Ann: SciFi 200 > 150 → still 1st | entity, caveat |
| entity-control | No author reaches half, and the top group stays first | SciFi 500 (Ann 200 = 40%, Bob 200, Cal 100); Mystery 150. Without Ann: SciFi 300 → still 1st | no entity finding |
| fragile-lead-flip | A smaller author tips first place, with a clear gap | SciFi 80 (Ann 30 = 37.5%, Bob 25, Cal 25); Mystery 65 (Cy 35, Di 30). 80 ÷ 65 = 1.23. Without Ann: SciFi 50 < Mystery 65 → SciFi 2nd | fragile, caveat; no entity finding (under half) |
| fragile-lead-caveat | First place is barely ahead | A 105, B 100: 105 ÷ 100 = 1.05 | fragile, caveat |
| fragile-lead-control | First place is clearly ahead | A 120, B 100: 1.20 | no fragile finding |
| fragile-lead-boundary | Exactly at the line | A 110, B 100: 1.10, which is not less than 1.10 | no fragile finding |
| cycle-caveat | A trend over less than a year | 11 monthly rows, 2025-01-15 to 2025-11-15: 304 days | cycle, caveat |
| cycle-control | A trend over more than two years | 25 monthly rows, 2025-01-15 to 2027-01-15: 730 days | no cycle finding |
