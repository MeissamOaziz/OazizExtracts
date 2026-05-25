// UI string translations, keyed by locale.
// Phase 1 ships FR only (the existing site language); Phase 3 will fill in EN.
// Pages call: import { t } from '@/i18n/ui'; const T = t(lang);  then T('nav.home').

export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';

type Dict = Record<string, string>;

export const ui: Record<Locale, Dict> = {
  fr: {
    'nav.home': 'Accueil',
    'nav.about': 'À Propos',
    'nav.brands': 'MARQUES',
    'nav.contact': 'Nous Joindre',
    'nav.lang.switchTo': 'EN',

    'hero.rinse': 'Rincer.',
    'hero.refine': 'Raffiner.',
    'hero.repeat': 'Répéter.',

    'intro.title': 'Bienvenue chez Oaziz Extracts.',
    'intro.subheading': 'Votre Partenaire de Confiance en Extraits sans Solvant',
    'intro.tagline': "Dites-nous ce qui vous amène aujourd'hui.",

    'services.bulk': 'Extraits en Vrac & Marque Blanche',
    'services.b2b': 'Services B2B',
    'services.export': 'EXPORTATION',

    'banner.cta': 'Je suis intéressé par :',
    'banner.kief': 'Kief & IWE',
    'banner.hash': 'Hash',
    'banner.rosin': 'Rosine',
    'banner.trim': 'Trim',
    'banner.flower': 'Fleur',
    'banner.topicals': 'Topiques',
    'banner.export': 'Export',

    'form.title': 'Nous Joindre',
    'form.leadIn': 'Dites-nous ce que vous recherchez : volumes potentiels, délais, spécifications et tout ce qui peut nous aider à mieux répondre à votre besoin.',
    'form.name': 'Nom',
    'form.email': 'Courriel',
    'form.subject': 'Je vous contacte concernant...',
    'form.subject.general': 'Demande générale',
    'form.subject.export': 'Exportation',
    'form.subject.sales': 'Ventes',
    'form.subject.qa': 'Assurance Qualité',
    'form.subject.finance': 'Finances',
    'form.message': 'Message',
    'form.submit': 'Envoyer le Message',
    'form.sending': 'Envoi en cours…',
    'form.success': 'Merci ! Votre message a bien été envoyé. Nous vous répondrons rapidement.',
    'form.error': "Une erreur s'est produite. Veuillez réessayer ou nous écrire directement à info@oaziz.ca.",

    'footer.tagline': 'Raffineur de cannabis sans solvant, Montréal.',
    'footer.contact': 'Contact',
    'footer.products': 'Produits',
    'footer.company': 'Société',
    'footer.legal': 'Légal',
    'footer.address': '322 Port Royal Ouest\nMontréal, QC, Canada',
    'footer.copyright': '© {year} Oaziz Extracts Inc. Tous droits réservés.',
    'footer.licensed': 'Licence Santé Canada — produit avec rigueur, sans solvant.',
    'footer.legalNotice': 'Mentions légales',
    'footer.privacy': 'Politique de confidentialité',

    'age.title': "Vous avez 18 ans ou plus ?",
    'age.body': "Ce site contient des informations sur le cannabis destinées à des partenaires d'affaires adultes. Veuillez confirmer votre âge.",
    'age.yes': "Oui, j'ai 18 ans ou plus",
    'age.no': "Non",
    'age.finePrint': "Conformément à la Loi sur le cannabis (Canada) et aux exigences provinciales.",

    'about.title': 'Notre Histoire',
    'about.spiritTitle': 'L\'Esprit du Raffineur',
    'about.teamTitle': 'Notre Équipe',

    'brands.title': 'Nos Marques',

    'meta.defaultDescription': "Oaziz Extracts — raffineur de cannabis sans solvant basé à Montréal. Hash, rosine, kief IWE, fleur GMP, exportation B2B internationale.",
  },
  en: {
    // Phase 3 will populate this. Pages fall back to FR if a key is missing.
  },
};

export function t(lang: Locale) {
  return (key: string): string => {
    const dict = ui[lang] ?? ui[defaultLocale];
    return dict[key] ?? ui[defaultLocale][key] ?? key;
  };
}

// URL helpers — given the current locale, build a localized href.
// Default locale (fr) lives at root, EN at /en/...
export function localizeUrl(path: string, lang: Locale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLocale) return clean;
  return `/${lang}${clean === '/' ? '' : clean}`;
}
