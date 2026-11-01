// Every sentence the card can show, in one place for review (Adam approves the wording).
// Each is a template: {slot} names a fact code computed (facts.ts, card.ts), so every
// number on a card is traceable. Rules from Adam's review: no possessives on group names
// ("of {measure} in {group}"), "accounts for", never a pluralized column name, "a few more
// {many}" rather than "sales", "leads in {measure}". Money amounts carry the contract's
// currency, or read "{value} in {measure}" without one. "[is|are:slot]" picks the verb for that
// slot's group: plural when the contract names a flag's groups in the plural ("award winners").
// On a yes/no chart the claim never repeats the column after the group's name (*Flag lines).

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
    claimFlag: '{mix_top} [sells|sell:mix_top] the most.',
    why: '[It leads|They lead:mix_top] in {measure} because each {one} is worth more; {mix_most} [has|have:mix_most] more {many} ({mix_most_records} vs {mix_top_records}).',
    instead: '{mix_top} [brings|bring:mix_top] in the most {measure}, but {mix_most} [has|have:mix_most] the most {many}.',
  },
  // Driven by one entity.
  entity: {
    claim: '{entity_group} is our strongest {field}.',
    claimFlag: '{entity_group} [is|are:entity_group] the stronger group.',
    why: 'One {entity_column}, {entity_name}, accounts for {entity_share} of {measure} in {entity_group}; without that {entity_column}, {entity_group} would rank {entity_rank}.',
    // When the dataset line above the sections already names the entity.
    whyDataset: 'The {entity_column} noted above accounts for {entity_share} of {measure} in {entity_group}; without that {entity_column}, {entity_group} would rank {entity_rank}.',
    instead: '{entity_group} [leads|lead:entity_group] in {measure}, but mostly because of one {entity_column}, {entity_name}.',
  },
  // Small group, when it's the one ranked first.
  small: {
    claim: '{small_top} is our top {field}.',
    claimFlag: '{small_top} [is|are:small_top] on top.',
    why: '[It has|They have:small_top] only {small_records} {many}; a few more {many} could change the order.',
    instead: '{small_top} [is|are:small_top] on top for now, from only {small_records} {many}.',
  },
  // The same, on a chart over time: the group is a period, so the claim names its unit.
  smallPeriod: {
    claim: '{small_top} was our best {unit}.',
    why: 'It has only {small_records} {many}; a few more {many} could change the order.',
    instead: '{small_top} is on top for now, from only {small_records} {many}.',
  },
  // Fragile lead: softer wording. Narrow gap, or one entity tips it.
  fragileNarrow: {
    claim: '{fragile_top} [is|are:fragile_top] clearly ahead of {fragile_second}.',
    why: "They're neck and neck: {fragile_top} [is|are:fragile_top] only {fragile_gap} ahead.",
    instead: '{fragile_top} and {fragile_second} are neck and neck.',
  },
  fragileFlip: {
    claim: '{fragile_top} [is|are:fragile_top] clearly ahead of {fragile_second}.',
    why: 'The lead rests on one {flip_column}: without {flip_entity}, {fragile_top} would rank {flip_rank}.',
    instead: '{fragile_top} [leads|lead:fragile_top] {fragile_second}, but the lead rests on {flip_entity}.',
  },
};

/** Key talking points: the headline and up to three points. */
export const TALK = {
  headlineMoney: '{top_item} [brings|bring:top_item] in the most {measure}.',
  headlineCount: '{top_item} [has|have:top_item] the most {many}.',
  headlineMean: '{top_item} [has|have:top_item] the highest {measure}.',
  // A comparison with only one group (from Build my own chart or a typed question inside a
  // slice): there is nothing to rank, so no "most", no share, no runner-up.
  headlineOneGroup: 'All {many} here are {top_item}.',
  headlineTrend: '{measure} {direction} from {first_period} to {last_period} ({change_pct}).',
  // A single-cycle trend can't show growth, so its headline describes shape only.
  headlineTrendShape: '{measure} peaked in {peak_period} and was lowest in {low_period}.',
  pointTop: '{top_item}: {top_share} of all {measure} ({top_value}).',
  pointTopMean: '{top_item}: {top_value}; next [is|are:second_item] {second_item} at {second_value}.',
  pointRunnerUp: 'Next [is|are:second_item] {second_item} at {second_amount}.',
  pointConcentration: '{conc_group} alone [accounts|account:conc_group] for {conc_share} of {measure}; the other {conc_others} share the rest.',
  // With only two groups, "the other 1 share" reads wrong.
  pointConcentrationTwo: '{conc_group} alone [accounts|account:conc_group] for {conc_share} of {measure}; {conc_other} [has|have:conc_other] the rest.',
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
  repairA: 'By {many}, {mix_most} [leads|lead:mix_most] with {mix_most_records}; {mix_top} [has|have:mix_top] {mix_top_records}.',
  entityQ: 'How much of this is {entity_name}?',
  entityA: '{entity_name} accounts for {entity_share} of {measure} in {entity_group}.',
  entityDatasetA: '{entity_name} accounts for {entity_share} of {measure} in {entity_group} and {ds_share} of all {ds_measure}.',
  // Price/mix when only a lower group moves: true, but worth explaining if asked.
  moverQ: 'Why [does|do:mover] {mover} rank {mover_direction} by {measure} than by {many}?',
  moverA: '[It ranks|They rank:mover] {mover_value_rank} by {measure} but {mover_count_rank} by {many}: [its|their:mover] {mover_prices} prices move [it|them:mover].',
  smallQ: 'Can we compare {smallest}?',
  smallOneA: 'Not reliably: {smallest} [has|have:smallest] only {smallest_records} {many}.',
  smallManyA: 'Not reliably: {small_count} groups have fewer than {small_threshold} {many}; the smallest is {smallest}, with {smallest_records}.',
};

/** What this data can't tell you: always one line, plus the slice when there is one. */
export const CANNOT = {
  cycle: "These dates cover one year or less ({cycle_first} to {cycle_last}), so seasonal swings can't be told apart from growth or decline.",
  comparison: 'This shows which {field} has the most {measure}, not why.',
  // A yes/no chart: "which award winner has the most" reads wrong. No verb follows {measure},
  // which can be plural ("items sold").
  comparisonFlag: 'This shows the split of {measure} by {field}, not why.',
  comparisonMeanFlag: 'This shows how {measure} differs by {field}, not why.',
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
