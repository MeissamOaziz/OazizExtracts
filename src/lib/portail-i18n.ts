import type { AstroCookies } from 'astro';

// Portal-wide UI language. Independent from the public site's i18n (src/i18n/ui.ts)
// and from the document/PDF language, which is ALWAYS French regardless of this
// setting — see src/components/portail/Doc*.astro and src/lib/pdf.ts, neither of
// which should ever import or branch on this locale.
export type PortailLocale = 'fr' | 'en';
export const PORTAIL_LOCALE_COOKIE = 'portail_locale';

export function getPortailLocale(cookies: AstroCookies): PortailLocale {
  return cookies.get(PORTAIL_LOCALE_COOKIE)?.value === 'en' ? 'en' : 'fr';
}

/**
 * Builds a `T(key)` lookup bound to one page's FR/EN dictionaries. `fr` is the
 * source of truth for which keys exist; `en` may be a Partial (falls back to FR
 * for any key not yet translated) so a page never breaks mid-translation.
 */
export function makeT<D extends Record<string, string>>(
  locale: PortailLocale,
  fr: D,
  en: Partial<Record<keyof D, string>>
): (key: keyof D) => string {
  return (key: keyof D): string => (locale === 'en' ? en[key] ?? fr[key] : fr[key]);
}
