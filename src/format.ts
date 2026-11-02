// How numbers and dates are written in every sentence code produces (card facts, check
// findings, the card itself), so the same number always reads the same way.

export const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const twoPlaces = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 0.4567 → "46%". */
export const percent = (x: number) => `${Math.round(x * 100)}%`;
/** 0.12 → "+12%", −0.12 → "−12%" (a real minus sign). */
export const signedPercent = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;
/** 1 → "1st", 12 → "12th", 23 → "23rd". */
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
/** A timestamp as its UTC day, "2025-03-14". */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
