// Every message the "Ask your own question" box can show, as code templates. The AI never
// writes an explanation: it returns a structured result, and code picks one of these
// (Adam approves the wording). {measure} is the spec's measure, or the row noun for counts.

export const ASK_TEXT = {
  label: 'AI translated your request',
  noKey: 'Typed questions need AI, which is off (no API key). Use the menu or “Build my own chart”.',
  youAsked: 'You asked: “{text}”',

  clarify: '“{term}” could mean more than one thing here. Which did you mean?',
  clarifyGeneric: 'That could mean more than one thing here. Which did you mean?',

  // Reframes: each is followed by the nearest defensible chart, in plain words.
  causal: "This data can show how {measure} differs between groups, not what causes it. Here's the comparison it can show:",
  forecast: "This data can't predict what comes next. Here's how {measure} has changed so far:",
  meaningless: "A total of {column} isn't meaningful, so this shows the average instead.",
  loaded: 'This compares every {field} without assuming the answer:',

  // Refusals.
  notInData: "This data doesn't include that. It has: {columns}.",
  unrelated: "That isn't a question about this data. Try one from the menu, or build your own chart.",
  unreadable: "The AI's answer couldn't be used. Try rephrasing it, or use the menu.",
  unreachable: "The AI couldn't be reached. Try again, or use the menu.",

  // Refusals with the code's reason, when the AI's chart isn't valid.
  unknownField: 'This data has no column called “{name}”.',
  unknownValue: 'There\'s no {field} called “{value}” in this data.',
  sumAverage: "A total of {field} isn't meaningful, so it can only be averaged.",
  idField: '{field} is an identifier; it can be counted, not charted.',
  noChart: "These columns can't be drawn together in one chart.",
  tooMany: 'A question here can use at most 2 columns and 3 filters.',
  filterNotCategory: '{field} can\'t be used as a filter here; only categories can.',
};

// The card's can't-tell line for a question code reframed (pending Adam's approval).
export const ASKED_CANNOT = {
  causal: 'You asked whether {column} affects {measure}. This shows that {measure} differs by {column}, not that {column} causes the difference: other differences between the groups could explain it.',
  forecast: "This shows how {measure} has changed so far; it can't say what comes next.",
};
