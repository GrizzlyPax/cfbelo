/**
 * Protected rivalries, keyed on CFBD school names. A game between a listed
 * pair is classified 'rivalry' (I=30 in the fifa preset) instead of
 * conf/nonconf. First pass — curated, not exhaustive; tune per-config later.
 */
const PAIRS: Array<[string, string]> = [
  ['Michigan', 'Ohio State'],
  ['Alabama', 'Auburn'],
  ['Army', 'Navy'],
  ['Oklahoma', 'Texas'],
  ['Georgia', 'Florida'],
  ['USC', 'Notre Dame'],
  ['USC', 'UCLA'],
  ['Oregon', 'Oregon State'],
  ['Washington', 'Washington State'],
  ['Florida', 'Florida State'],
  ['Florida State', 'Miami'],
  ['Clemson', 'South Carolina'],
  ['Georgia', 'Georgia Tech'],
  ['Michigan State', 'Michigan'],
  ['Iowa', 'Iowa State'],
  ['Kansas', 'Kansas State'],
  ['Oklahoma', 'Oklahoma State'],
  ['Texas', 'Texas A&M'],
  ['Ole Miss', 'Mississippi State'],
  ['Alabama', 'Tennessee'],
  ['Utah', 'BYU'],
  ['Virginia', 'Virginia Tech'],
  ['North Carolina', 'NC State'],
  ['Purdue', 'Indiana'],
  ['Minnesota', 'Wisconsin'],
  ['Notre Dame', 'Stanford'],
  ['Cal', 'Stanford'],
  ['Arizona', 'Arizona State'],
  ['Colorado', 'Colorado State'],
  ['Pittsburgh', 'West Virginia'],
  ['Louisville', 'Kentucky'],
  ['TCU', 'Baylor'],
  ['Houston', 'Rice'],
  ['Cincinnati', 'Miami (OH)'],
  ['Boise State', 'Fresno State'],
];

const keyOf = (a: string, b: string) => (a < b ? `${a}||${b}` : `${b}||${a}`);
const RIVALRY_KEYS = new Set(PAIRS.map(([a, b]) => keyOf(a, b)));

export function isRivalry(schoolA: string, schoolB: string): boolean {
  return RIVALRY_KEYS.has(keyOf(schoolA, schoolB));
}
