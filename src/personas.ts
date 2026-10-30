// Who the user is and why they're here (D-014). Phase 1 only stores and displays it;
// Phase 2 sends it to the AI with the data profile to tailor suggested questions.

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
