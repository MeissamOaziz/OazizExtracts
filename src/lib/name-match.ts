// Company-name matching shared by supplier recognition (invoice → portal
// supplier) and QuickBooks vendor matching. Tolerates the usual differences:
// spacing ("GrowerIQ" vs "Grower IQ"), names that hold two names ("Grower IQ /
// WILCOMPUTE SYSTEMS", "X (Y)", "X d.b.a. Y"), accents, punctuation and legal
// suffixes (Inc, Ltd, Group…). Still whole-word: "bis" never matches "cannabis".
// A numbered company ("9454-1901 Québec inc.") matches on its number alone, and
// generic words (Québec, Canada…) never make a match by themselves — otherwise
// "9454-1901 Québec inc." would match "CANNARA BIOTECH (QUÉBEC) INC".

const SUFFIXES = new Set([
  'inc', 'incorporated', 'ltd', 'ltee', 'limited', 'limitee', 'corp', 'corporation', 'co', 'company', 'cie',
  'enr', 'llc', 'lp', 'sencrl', 'srl', 'group', 'groupe', 'the', 'and', 'et', 'de', 'du', 'des', 'la', 'le', 'les',
]);
// Words that say where or what kind of company, not which one.
const GENERIC = new Set([
  'quebec', 'qc', 'canada', 'canadian', 'ontario', 'on', 'bc', 'alberta', 'montreal', 'laval', 'toronto',
  'international', 'global', 'north', 'america', 'american', 'national', 'services', 'solutions',
]);

/** Lower-case, no accents, punctuation → spaces, legal suffixes dropped. */
export function normName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter((w) => w && !SUFFIXES.has(w)).join(' ');
}

/** Québec numbered company (9454-1901) or federal number (14550005), if present. */
export function companyNumber(s: string | null | undefined): string | null {
  const t = String(s ?? '');
  const qc = /\b(\d{4})[-\s]?(\d{4})\b/.exec(t);
  if (qc) return `${qc[1]}${qc[2]}`;
  const fed = /\b(\d{7,10})\b/.exec(t);
  return fed ? fed[1] : null;
}

/** The name itself plus each name it contains ("A / B", "A (B)", "A d.b.a. B", "A o/a B"). */
export function nameVariants(s: string | null | undefined): string[] {
  const raw = String(s ?? '');
  const parts = raw.split(/\s*\/\s*|\s*[()]\s*|\s+d\.?\s?b\.?\s?a\.?\s+|\s+o\/a\s+|\s+aka\s+/i);
  return [...new Set([raw, ...parts].map(normName))]
    // A part made only of generic words ("(QUÉBEC)") is not a name of its own.
    .filter((v) => v.length >= 2 && v.split(' ').some((w) => !GENERIC.has(w)));
}

const words = (t: string) => new Set(t.split(' ').filter((w) => w.length > 1 && !GENERIC.has(w)));

/** 0..1 similarity between two company names, best over their variants. */
export function nameScore(a: string | null | undefined, b: string | null | undefined): number {
  const na = companyNumber(a), nb = companyNumber(b);
  if (na && nb && na === nb) return 0.95;
  let best = 0;
  for (const x of nameVariants(a)) {
    for (const y of nameVariants(b)) {
      const cx = x.replace(/ /g, ''), cy = y.replace(/ /g, '');
      if (x === y || cx === cy) return 1;
      // Joined words: "SelectcomTelecom" starts with "Selectcom" (only for a distinctive start, 5+ letters).
      const [short, long] = cx.length <= cy.length ? [cx, cy] : [cy, cx];
      if (short.length >= 5 && long.startsWith(short) && !GENERIC.has(short)) best = Math.max(best, 0.85);
      const wx = words(x), wy = words(y);
      if (!wx.size || !wy.size) continue;
      // Whole-word containment ("ccx" inside "ccx canada"; not "bis" inside "cannabis").
      if ([...wx].every((w) => wy.has(w)) || [...wy].every((w) => wx.has(w))) best = Math.max(best, 0.85);
      const inter = [...wx].filter((w) => wy.has(w)).length;
      best = Math.max(best, inter / (new Set([...wx, ...wy]).size || 1));
    }
  }
  return best;
}
