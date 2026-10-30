// Who the user is and why they're here (D-014). The purpose decides the highlight's kind
// order and preferred facets (highlight.ts); the AI sees domain, role, and purpose.

// `as const` makes TypeScript treat each list as a fixed set of exact strings, so the
// types below can be derived from the lists instead of written out twice.
export const DOMAINS = ['retail', 'business', 'science', 'nonprofit', 'other'] as const;
export const ROLES = ['owner', 'analyst', 'researcher', 'manager'] as const;
export const PURPOSES = [
  'deciding where to invest',
  'reporting results upward',
  'testing whether a pattern is real',
  'finding problems to fix',
  'getting a feel for the data',
] as const;

export type Domain = (typeof DOMAINS)[number];
export type Role = (typeof ROLES)[number];
export type Purpose = (typeof PURPOSES)[number];

export interface Persona {
  id: string;
  name: string;
  domain: Domain;
  role: Role;
  purpose: Purpose;
  custom: boolean;
}

export const PRESETS: Persona[] = [
  { id: 'store-owner', name: 'Store owner', domain: 'retail', role: 'owner', purpose: 'deciding where to invest', custom: false },
  { id: 'marketing-analyst', name: 'Marketing analyst', domain: 'business', role: 'analyst', purpose: 'reporting results upward', custom: false },
  { id: 'researcher', name: 'Researcher', domain: 'science', role: 'researcher', purpose: 'testing whether a pattern is real', custom: false },
  { id: 'program-manager', name: 'Program manager', domain: 'nonprofit', role: 'manager', purpose: 'finding problems to fix', custom: false },
];

// The Store owner matches the bundled retail sample, so the app is useful on first load.
export const DEFAULT_PERSONA = PRESETS[0];

export function customPersona(domain: Domain, role: Role, purpose: Purpose, name?: string): Persona {
  const trimmed = name?.trim();
  return {
    id: 'custom',
    // With no name given, describe the persona by its parts, e.g. "Retail analyst".
    name: trimmed || `${domain[0].toUpperCase()}${domain.slice(1)} ${role}`,
    domain,
    role,
    purpose,
    custom: true,
  };
}

/** One line for display: "Store owner · retail · deciding where to invest". */
export function describePersona(p: Persona): string {
  return `${p.name} · ${p.domain} · ${p.purpose}`;
}

// Persona colors (Adam's choice): muted tints, never the accent orange, red, or green, so a
// persona can't be mistaken for data emphasis or a warning. They appear only in the map and
// the persona chip, never in charts, and always with the persona's initial, so color is
// never the only signal. A built-your-own persona is neutral grey.
const PERSONA_COLORS: Record<string, { color: string; tint: string }> = {
  'store-owner': { color: '#5b7aa8', tint: '#e3e9f2' }, // slate blue
  'marketing-analyst': { color: '#9a6a8f', tint: '#efe5ec' }, // plum
  researcher: { color: '#a08a5c', tint: '#f1ece1' }, // sand
  'program-manager': { color: '#4f8a8b', tint: '#e1eded' }, // muted teal
};
const CUSTOM_COLOR = { color: '#8a8a8a', tint: '#ecebe6' };

export function personaColor(p: Persona): { color: string; tint: string } {
  return p.custom ? CUSTOM_COLOR : (PERSONA_COLORS[p.id] ?? CUSTOM_COLOR);
}

/** The letter shown in every map node and on the chip: "S" for Store owner. */
export const personaInitial = (p: Persona) => p.name.trim().charAt(0).toUpperCase() || '?';
