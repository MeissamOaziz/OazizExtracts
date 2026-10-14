// Company-name matching shared by supplier recognition (invoice → portal
// supplier) and QuickBooks vendor matching. Tolerates the usual differences:
// spacing ("GrowerIQ" vs "Grower IQ"), names that hold two names ("Grower IQ /
// WILCOMPUTE SYSTEMS", "X (Y)", "X d.b.a. Y"), accents, punctuation and legal
// suffixes (Inc, Ltd, Group…). Still whole-word: "bis" never matches "cannabis".

const SUFFIXES = new Set([
  'inc', 'incorporated', 'ltd', 'ltee', 'limited', 'limitee', 'corp', 'corporation', 'co', 'company', 'cie',
  'enr', 'llc', 'lp', 'sencrl', 'srl', 'group', 'groupe', 'the', 'and', 'et', 'de', 'du', 'des', 'la', 'le', 'les',
]);

/** Lower-case, no accents, punctuation → spaces, legal suffixes dropped. */
export function normName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter((w) => w && !SUFFIXES.has(w)).join(' ');
}

/** The name itself plus each name it contains ("A / B", "A (B)", "A d.b.a. B", "A o/a B"). */
export function nameVariants(s: string | null | undefined): string[] {
  const raw = String(s ?? '');
  const parts = raw.split(/\s*\/\s*|\s*[()]\s*|\s+d\.?\s?b\.?\s?a\.?\s+|\s+o\/a\s+|\s+aka\s+/i);
  return [...new Set([raw, ...parts].map(normName).filter((v) => v.length >= 2))];
}

const words = (t: string) => new Set(t.split(' ').filter((w) => w.length > 1));

/** 0..1 similarity between two company names, best over their variants. */
export function nameScore(a: string | null | undefined, b: string | null | undefined): number {
  let best = 0;
  for (const x of nameVariants(a)) {
    for (const y of nameVariants(b)) {
      if (x === y || x.replace(/ /g, '') === y.replace(/ /g, '')) return 1;
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
