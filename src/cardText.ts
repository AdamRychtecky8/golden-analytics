// Every sentence the card can show, in one place for review (Adam approves the wording).
// Each is a template: {slot} names a fact code computed (facts.ts, card.ts), so every
// number on a card is traceable. Rules from Adam's review: no possessives on group names
// ("of {measure} in {group}"), "accounts for", never a pluralized column name, "a few more
// {many}" rather than "sales", "leads in {measure}". Money amounts carry the contract's
// currency, or read "{value} in {measure}" without one.

export const SECTION_TITLES = {
  talk: 'Key talking points',
  caution: 'Caution around these',
  ask: 'If they ask',
  cannot: "What this data can't tell you",
} as const;

/** Cautions: the tempting claim, why it misleads, what to say instead. */
export const CAUTIONS = {
  // Price/mix, when the #1 by value isn't the #1 by count.
  mixTop: {
    claim: '{mix_top} is our best-selling {field}.',
    why: 'It leads in {measure} because each {one} is worth more; {mix_most} has more {many} ({mix_most_records} vs {mix_top_records}).',
    instead: '{mix_top} brings in the most {measure}, but {mix_most} has the most {many}.',
  },
  // Driven by one entity.
  entity: {
    claim: '{entity_group} is our strongest {field}.',
    why: 'One {entity_column}, {entity_name}, accounts for {entity_share} of {measure} in {entity_group}; without that {entity_column}, {entity_group} would rank {entity_rank}.',
    // When the dataset line above the sections already names the entity.
    whyDataset: 'The {entity_column} noted above accounts for {entity_share} of {measure} in {entity_group}; without that {entity_column}, {entity_group} would rank {entity_rank}.',
    instead: '{entity_group} leads in {measure}, but mostly because of one {entity_column}, {entity_name}.',
  },
  // Small group, when it's the one ranked first.
  small: {
    claim: '{small_top} is our top {field}.',
    why: 'It has only {small_records} {many}; a few more {many} could change the order.',
    instead: '{small_top} is on top for now, from only {small_records} {many}.',
  },
  // The same, on a chart over time: the group is a period, so the claim names its unit.
  smallPeriod: {
    claim: '{small_top} was our best {unit}.',
    why: 'It has only {small_records} {many}; a few more {many} could change the order.',
    instead: '{small_top} is on top for now, from only {small_records} {many}.',
  },
  // Fragile lead: softer wording. Narrow gap, or one entity tips it.
  fragileNarrow: {
    claim: '{fragile_top} is clearly ahead of {fragile_second}.',
    why: "They're neck and neck: {fragile_top} is only {fragile_gap} ahead.",
    instead: '{fragile_top} and {fragile_second} are neck and neck.',
  },
  fragileFlip: {
    claim: '{fragile_top} is clearly ahead of {fragile_second}.',
    why: 'The lead rests on one {flip_column}: without {flip_entity}, {fragile_top} would rank {flip_rank}.',
    instead: '{fragile_top} leads {fragile_second}, but the lead rests on {flip_entity}.',
  },
};

/** Key talking points: the headline and up to three points. */
export const TALK = {
  headlineMoney: '{top_item} brings in the most {measure}.',
  headlineCount: '{top_item} has the most {many}.',
  headlineMean: '{top_item} has the highest {measure}.',
  headlineTrend: '{measure} {direction} from {first_period} to {last_period} ({change_pct}).',
  // A single-cycle trend can't show growth, so its headline describes shape only.
  headlineTrendShape: '{measure} peaked in {peak_period} and was lowest in {low_period}.',
  pointTop: '{top_item}: {top_share} of all {measure} ({top_value}).',
  pointTopMean: '{top_item}: {top_value}; next is {second_item} at {second_value}.',
  pointRunnerUp: 'Next is {second_item} at {second_amount}.',
  pointConcentration: '{conc_group} alone accounts for {conc_share} of {measure}; the other {conc_others} share the rest.',
  // With only two groups, "the other 1 share" reads wrong.
  pointConcentrationTwo: '{conc_group} alone accounts for {conc_share} of {measure}; {conc_other} has the rest.',
  pointEntity: '{entity_name} accounts for {entity_share} of {measure} in {entity_group}.',
  pointPeak: 'It peaked at {peak_amount} in {peak_period}.',
  pointLow: 'Its lowest was {low_amount} in {low_period}.',
  // Charts from "Build my own chart" that aren't rankings or trends.
  headlineSpread: 'Most {measure} values fall between {p25} and {p75}.',
  pointSpread: '{measure} ranges from {min_value} to {max_value}, with a median of {median_value}.',
  headlineScatter: '{y_field} and {x_field}: {strength} relationship.',
  pointScatter: 'Across {record_count} {many}, their correlation is {correlation} ({strength}).',
  headlineHeatmap: '{top_cell} is the most common combination.',
  pointHeatmap: '{top_cell} accounts for {top_cell_count} of {record_count} {many}.',
};

/** If they ask: anticipated questions and their answers. */
export const ASK = {
  repairQ: 'What about {many}?',
  repairA: 'By {many}, {mix_most} leads with {mix_most_records}; {mix_top} has {mix_top_records}.',
  entityQ: 'How much of this is {entity_name}?',
  entityA: '{entity_name} accounts for {entity_share} of {measure} in {entity_group}.',
  entityDatasetA: '{entity_name} accounts for {entity_share} of {measure} in {entity_group} and {ds_share} of all {ds_measure}.',
  // Price/mix when only a lower group moves: true, but worth explaining if asked.
  moverQ: 'Why does {mover} rank {mover_direction} by {measure} than by {many}?',
  moverA: 'It ranks {mover_value_rank} by {measure} but {mover_count_rank} by {many}: its {mover_prices} prices move it.',
  smallQ: 'Can we compare {smallest}?',
  smallOneA: 'Not reliably: {smallest} has only {smallest_records} {many}.',
  smallManyA: 'Not reliably: {small_count} groups have fewer than {small_threshold} {many}; the smallest is {smallest}, with {smallest_records}.',
};

/** What this data can't tell you: always one line, plus the slice when there is one. */
export const CANNOT = {
  cycle: "These dates cover one year or less ({cycle_first} to {cycle_last}), so seasonal swings can't be told apart from growth or decline.",
  comparison: 'This shows which {field} has the most {measure}, not why.',
  comparisonMean: 'This shows which {field} has the highest {measure}, not why.',
  trend: 'This shows how {measure} changed over time, not what caused it.',
  spread: 'This shows how {measure} values spread, not what drives them.',
  scatter: "{x_field} and {y_field} moving together doesn't mean one causes the other.",
  heatmap: 'This shows which pairs are common, not why.',
  general: 'This shows what the data contains, not why.',
  scope: 'It covers only the {many} where {scope_where}.',
};

/** Shown once above the sections when this chart is one the entity shapes. */
export const DATASET_LINE = 'One {ds_column}, {ds_entity}, accounts for {ds_share} of all {ds_measure} in this data and shapes several of these charts.';
