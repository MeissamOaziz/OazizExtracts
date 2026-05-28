// UI + content string translations, keyed by locale.
// FR is the default locale (root paths). EN lives under /en/.
// Pages call: import { t } from '@/i18n/ui'; const T = t(lang);  then T('nav.home').

export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

type Dict = Record<string, string>;

const fr: Dict = {
  // Navigation
  'nav.home':            'Accueil',
  'nav.about':           'À Propos',
  'nav.brands':          'MARQUES',
  'nav.contact':         'Nous Joindre',
  'nav.lang.label':      'English',
  'nav.lang.aria':       'Switch to English',

  // Hero motto
  'hero.rinse':          'Rincer.',
  'hero.refine':         'Raffiner.',
  'hero.repeat':         'Répéter.',
  'hero.aria':           'Rincer · Raffiner · Répéter',

  // Intro
  'intro.title':         'Bienvenue chez Oaziz Extracts.',
  'intro.subheading':    'Votre Partenaire de Confiance en Extraits sans Solvant',
  'intro.tagline':       "Dites-nous ce qui vous amène aujourd'hui.",

  // Services
  'services.aria':       'Nos services',
  'services.bulk':       'Extraits en Vrac et Services de Marque Blanche',
  'services.b2b':        'Solutions B2B et Approvisionnement',
  'services.export':     "Sentier d'Exportation",

  // Bottom banner
  'banner.cta':          'Je suis intéressé par :',
  'banner.kief':         'Kief & IWE',
  'banner.hash':         'Hash',
  'banner.rosin':        'Rosine',
  'banner.trim':         'Trim',
  'banner.flower':       'Fleur',
  'banner.topicals':     'Topiques',
  'banner.export':       'Export',

  // Contact form
  'form.title':          'Nous Joindre',
  'form.leadIn':         'Dites-nous ce que vous recherchez : volumes potentiels, délais, spécifications et tout ce qui peut nous aider à mieux répondre à votre besoin.',
  'form.name':           'Nom',
  'form.email':          'Courriel',
  'form.subject':        'Je vous contacte concernant...',
  'form.subject.general': 'Demande générale',
  'form.subject.export':  'Exportation',
  'form.subject.sales':   'Ventes',
  'form.subject.qa':      'Assurance Qualité',
  'form.subject.finance': 'Finances',
  'form.message':        'Message',
  'form.submit':         'Envoyer le Message',
  'form.sending':        'Envoi en cours…',
  'form.success':        'Merci ! Votre message a bien été envoyé. Nous vous répondrons rapidement.',
  'form.error':          "Une erreur s'est produite. Veuillez réessayer ou nous écrire directement à info@oaziz.ca.",

  // Footer
  'footer.tagline':      'Raffineur de cannabis sans solvant, Montréal.',
  'footer.contact':      'Contact',
  'footer.products':     'Produits',
  'footer.company':      'Société',
  'footer.address':      '322 Port Royal Ouest\nMontréal, QC, Canada',
  'footer.copyright':    '© {year} Oaziz Extracts Inc. Tous droits réservés.',
  'footer.licensed':     'Licence Santé Canada — produit avec rigueur, sans solvant.',
  'footer.legalNotice':  'Mentions légales',
  'footer.privacy':      'Politique de confidentialité',

  // Age gate
  'age.title':           'Vous avez 18 ans ou plus ?',
  'age.body':            "Ce site contient des informations sur le cannabis destinées à des partenaires d'affaires adultes. Veuillez confirmer votre âge.",
  'age.yes':             "Oui, j'ai 18 ans ou plus",
  'age.no':              'Non',
  'age.finePrint':       'Conformément à la Loi sur le cannabis (Canada) et aux exigences provinciales.',

  // About
  'about.meta.title':    'À Propos — Oaziz Extracts',
  'about.meta.desc':     "Oaziz Extracts Inc. — raffineur privé de cannabis sans solvant, basé à Montréal. Notre histoire, notre équipe, notre licence Santé Canada depuis 2022.",
  'about.title':         'Notre Histoire',
  'about.spirit.title':  "L'Esprit du Raffineur",
  'about.spirit.p1':     "Oaziz Extracts Inc. (« Oaziz ») est une société privée de raffinage de cannabis basée à Montréal. Spécialisés dans les méthodes de raffinage traditionnelles et modernes sans solvant, nous maîtrisons des techniques telles que l'extraction à l'eau, le tamisage et la presse à chaud. Depuis l'obtention de notre licence de Santé Canada en 2022, nous nous consacrons à l'art de la purification.",
  'about.spirit.p2':     "Notre parcours a été rendu possible grâce à la confiance et au soutien de nos amis et de notre famille qui ont financé notre vision. Cette fondation fait de nous plus qu'une simple entreprise ; elle fait de nous une famille, immensément fière et reconnaissante de travailler quotidiennement avec notre passion commune pour le cannabis. Nous sommes très fiers d'avoir bâti une réputation de confiance et de fiabilité auprès de nos clients comme de nos fournisseurs.",
  'about.team.title':    'Notre Équipe',
  'about.team.intro':    "La direction d'Oaziz est composée d'un groupe diversifié d'individus possédant une vaste expérience en image de marque, formulation de produits, assurance qualité et financement. Par-dessus tout, nous sommes unis par une connaissance fondamentale et une expertise dans l'art et la science du cannabis.",
  'about.role.ceo':      'PDG',
  'about.role.paq':      "Directeur de l'Assurance Qualité et de la Conformité",
  'about.role.extractor':'Directeur de la Production et de la R&D',
  'about.role.sales':    'Directeur des Ventes et de la Commercialisation',
  'about.role.cfo':      'Directeur Financier',

  'about.mission.title': 'Mission',
  'about.mission.body':  "Chez Oaziz Extracts, notre raison d'être est de fournir à nos partenaires l'expertise, les infrastructures et les ressources nécessaires au développement de produits de cannabis de haute qualité, tout en respectant l'environnement et les communautés que nous desservons.",
  'about.vision.title':  'Vision',
  'about.vision.body':   "Être le gardien de confiance du raffinement du cannabis tout en établissant les normes de qualité, d'innovation, de durabilité et de gestion responsable dans l'industrie du cannabis.",

  // Brands
  'brands.meta.title':   'Nos Marques — Oaziz Extracts',
  'brands.meta.desc':    'Découvrez les marques Oaziz Extracts : CannonFire, Curado, Canolio, Hashtisan, Hazo, Xaman. Hash, rosine, ice water extract, fleur et plus.',
  'brands.title':        'Nos Marques',
  'brands.tag.cannonfire':'',
  'brands.tag.curado':   'HASH Ice Water Extract',
  'brands.tag.canolio':  'Sirop de Rosine',
  'brands.tag.xaman':    'TOPIQUES',
  'brands.tag.hashtisan':'HASH Dry Sift',
  'brands.tag.hazo':     'FLEUR',
  'brands.medical.title':'Nos Produits Disponibles sur Plateformes Médicales',
  'brands.availableAt':  'Disponible chez :',

  // Hash page
  'hash.meta.title':     'Hashish Pressé et Hash IWE — Oaziz Extracts',
  'hash.meta.desc':      "Sélection de hashish Oaziz : pressage traditionnel et extraction à l'eau glacée (Ice Water Extract). Saveurs, textures et puissances variées pour connaisseurs B2B.",
  'hash.h1':             'Hashish Pressé et Hash « Ice Water Extract »',
  'hash.desc':           "Explorez notre sélection de hashish, allant des méthodes de pressage traditionnelles aux techniques modernes d'extraction à l'eau glacée. Nous proposons des produits aux profils de saveurs, textures et puissances variés pour satisfaire les connaisseurs.",
  'hash.sub.pressed':    'Hashish Pressé',
  'hash.sub.iwe':        'Hash « Ice Water Extract »',
  'hash.ctx':            'Hash inquiry',

  // Rosin page
  'rosin.meta.title':    'Rosines Cured et Live — Oaziz Extracts',
  'rosin.meta.desc':     'Rosines artisanales Oaziz : Cured Rosin riche et complexe, Live Rosin au profil terpénique frais. Production sans solvant à Montréal.',
  'rosin.h1':            'Rosines « Cured » et « Live »',
  'rosin.desc':          "Découvrez le summum de l'extraction sans solvant avec notre collection de rosines. Nous offrons à la fois de la « Cured Rosin », connue pour ses saveurs riches et complexes, et de la « Live Rosin », célébrée pour son profil terpénique vibrant et frais.",
  'rosin.ctx':           'Rosin inquiry',

  // Kief page
  'kief.meta.title':     'Kief Tamisé et Kief IWE — Oaziz Extracts',
  'kief.meta.desc':      'Kief Oaziz : tamisé traditionnel et Ice Water Extract haut de gamme. Plusieurs grades de pureté et puissance, disponibles en vrac pour producteurs licenciés.',
  'kief.h1':             'Kief Tamisé et Kief « Ice Water Extract »',
  'kief.desc':           "Nous offrons deux types distincts de kief pour répondre à tous les besoins du marché. Chaque type est disponible en plusieurs grades de qualité et de puissance, avec une variété de gammes de couleurs pour satisfaire les spécifications précises de nos clients. Notre Kief IWE (Ice Water Extract) est généralement plus puissant et pur, idéal pour les produits hauts de gamme.",
  'kief.sub.dry':        'Kief Tamisé (Tumbled Kief)',
  'kief.sub.iwe':        'Kief « Ice Water Extract » (IWE)',
  'kief.ctx':            'Kief & IWE inquiry',

  // Stub product pages
  'flower.meta.title':   'Fleur — Oaziz Extracts',
  'flower.meta.desc':    'Fleur de cannabis GMP, disponible pour producteurs et exportateurs. Demandez vos volumes, délais et spécifications.',
  'flower.formTitle':    "Demande d'Information — Fleur",
  'flower.ctx':          'Flower inquiry',

  'trim.meta.title':     'Trim — Oaziz Extracts',
  'trim.meta.desc':      'Trim de cannabis en vrac pour extraction et produits dérivés. Volumes flexibles et délais courts.',
  'trim.formTitle':      "Demande d'Information — Trim",
  'trim.ctx':            'Trim inquiry',

  'topicals.meta.title': 'Topiques — Oaziz Extracts',
  'topicals.meta.desc':  'Topiques de cannabis pour marques privées et formulations sur mesure. Production sous licence Santé Canada.',
  'topicals.formTitle':  "Demande d'Information — Topiques",
  'topicals.ctx':        'Topicals inquiry',

  'export.meta.title':   'Exportation — Oaziz Extracts',
  'export.meta.desc':    "Exportation internationale de produits de cannabis sous licence Santé Canada. Conformité réglementaire, logistique douanière, partenaires de confiance.",
  'export.formTitle':    "Demande d'Information — Exportation",
  'export.ctx':          'Export inquiry',

  'bulk.meta.title':     'Extraits en Vrac & Marque Blanche — Oaziz Extracts',
  'bulk.meta.desc':      'Extraits sans solvant en vrac et services de marque blanche pour producteurs licenciés.',
  'bulk.h1':             'Extraits en Vrac & Marque Blanche',
  'bulk.desc':           "Nous offrons des extraits sans solvant en vrac — hash pressé, kief, IWE, rosine — ainsi que des services de marque blanche complets pour les producteurs licenciés. Notre équipe vous accompagne du concept à la livraison.",
  'bulk.ctx':            'Bulk / White-label inquiry',

  'whitelabel.meta.title':'Services B2B — Oaziz Extracts',
  'whitelabel.meta.desc': 'Services B2B Oaziz : marque blanche, formulation, contrôle qualité, logistique. Solution complète pour producteurs et distributeurs.',
  'whitelabel.h1':       'Services B2B',
  'whitelabel.desc':     "De la formulation à la mise en marché, Oaziz Extracts offre des services complets de transformation, conditionnement et accompagnement réglementaire pour ses partenaires B2B.",
  'whitelabel.ctx':      'B2B / White-label inquiry',

  // Cannonfire brand
  'cf.meta.title':       'CannonFire — Oaziz Extracts',
  'cf.meta.desc':        'Vapes de rosine sans solvant CannonFire — disponibles à la SQDC et sur les plateformes médicales canadiennes.',
  'cf.intro':            'Découvrez nos Vapes disponibles sur le marché Canadien',
  'cf.aube.title':       'AUBE',
  'cf.aube.blurb':       "La rosine la plus pure de CannonFire, pour une expérience douce et complète.",
  'cf.aube.b1':          'Rosine sans solvant de qualité supérieure',
  'cf.aube.b2':          "Format 510 prêt à l'emploi",
  'cf.aube.b3':          'Profil de terpènes complet et fidèle à la fleur',
  'cf.aube.cta':         'Voir le Produit',
  'cf.med.bcp':          'Black Cherry Punch Rosin Vape',
  'cf.med.3bk':          '3 Blue Kings Rosin Vape',
  'cf.med.mc':           'Mandarin Cookies Rosin Vape',
  'cf.med.fl':           'Flawless Victory Rosin Vape',
  'cf.med.sapphire':     'Sapphire Scout Rosin Vape',

  // Curado brand
  'curado.meta.title':   'CURADO — Oaziz Extracts',
  'curado.meta.desc':    "CURADO Hash Ice Water Extract et vapes premium — disponibles à l'OCS et sur les plateformes médicales canadiennes.",
  'curado.intro':        'Découvrez nos Hashish disponibles sur le marché Canadien',
  'curado.pbb.title':    'Peanut Butter Breath Temple Ball',
  'curado.pbb.blurb':    'Temple ball 1,5 g à spectre complet — hybride Peanut Butter Breath (Do-Si-Dos × Mendo Breath).',
  'curado.pbb.b1':       'Hybride · Do-Si-Dos × Mendo Breath',
  'curado.pbb.b2':       'THC 54,1 % · Terpènes 2,82 %',
  'curado.pbb.b3':       'Profil noisette, terreux, gazeux',
  'curado.pbb.b4':       'Effets profonds, enveloppants',

  'curado.cb.title':     'Cali Biscotti Temple Ball',
  'curado.cb.blurb':     'Temple ball 1,5 g vieilli 3-4 mois — teneur en terpènes exceptionnelle (5,91 %).',
  'curado.cb.b1':        'Vieillissement signature Curado · 3-4 mois',
  'curado.cb.b2':        'THC 59,8 % · Terpènes 5,91 %',
  'curado.cb.b3':        "Profil crémeux, zeste d'agrumes, orange",
  'curado.cb.b4':        'Effets relaxants distinctifs',

  'curado.cj.title':     'Cap Junky Temple Ball',
  'curado.cj.blurb':     'Temple ball 1,5 g à spectre complet — hybride Cap Junky (Alien Cookies × Kush Mints #11).',
  'curado.cj.b1':        'Hybride · Alien Cookies × Kush Mints #11',
  'curado.cj.b2':        'THC 59,98 % · Terpènes 2,37 %',
  'curado.cj.b3':        'Profil gaz/diesel, menthe sucrée, agrumes',
  'curado.cj.b4':        'β-Linalool, β-Caryophyllène, Bisabolol',

  'curado.royal.title':  'Royal (M-39) Temple Ball',
  'curado.royal.blurb':  'Le légendaire M-39 québécois — temple ball 1,5 g vieilli 3-4 mois.',
  'curado.royal.b1':     'Hybride · cultivar M-39 (héritage québécois)',
  'curado.royal.b2':     'THC 54,7 % · Terpènes 2,81 %',
  'curado.royal.b3':     'Profil terreux, épicé, herbacé',
  'curado.royal.b4':     'Caryophyllène, Myrcène, Bisabolol',

  'curado.fruit.title':  'Fruit Temple Ball',
  'curado.fruit.blurb':  'Temple ball 1,5 g roulé à la main — hash 100 % pur, sans additifs.',
  'curado.fruit.b1':     'Indica dominant · arômes naturellement fruités',
  'curado.fruit.b2':     'THC 55-65 % · CBD 0-8 %',
  'curado.fruit.b3':     'Sans huiles, distillats ni terpènes ajoutés',
  'curado.fruit.b4':     'Petits lots boutique · se bonifie avec le temps',

  // Canolio brand
  'canolio.meta.title':  'CANOLIO — Oaziz Extracts',
  'canolio.meta.desc':   'Sirops de Rosine CANOLIO développés avec Canolio Gourmet pour vos recettes de comestibles infusés au cannabis.',
  'canolio.intro.before':'Découvrez nos Sirops de Rosine développés en partenariat avec',
  'canolio.intro.partner':'Canolio Gourmet',
  'canolio.intro.after': ", spécifiquement conçus pour vos recettes de produits comestibles au cannabis.",
  'canolio.med.3bk':     'Canolio 3 Blue Kings Rosin Syrup',
  'canolio.med.bcp':     'Canolio Black Cherry Punch Rosin Syrup',
  'canolio.med.sapphire':'Canolio Sapphire Scout Rosin Syrup',

  // Hashtisan brand
  'ht.meta.title':       'HASHTISAN — Oaziz Extracts',
  'ht.meta.desc':        'Hash artisanal Hashtisan : GEM, Hashgar, Minigar, Bon Matin, Import Hash. Disponible sur les plateformes médicales canadiennes.',
  'ht.intro':            'Découvrez notre collection de hashish artisanal de qualité supérieure, disponible exclusivement sur les plateformes médicales.',
  'ht.gem.title':        'Hashtisan — GEM',
  'ht.gem.desc':         'Hash infusé de diamants avec une puissance de plus de 80%',
  'ht.hashgar.title':    'Hashtisan — Hashgar',
  'ht.hashgar.desc':     'Preroll de 1,5g enveloppé dans 1,5g de notre feuille de hash importé — embout en verre — fait à la main en lots limités',
  'ht.minigar.title':    'Hashtisan — Minigar',
  'ht.minigar.desc':     'Version compacte de 1,5g — embout de papier — la même qualité artisanale en format réduit',
  'ht.bm.title':         'Hashtisan — Bon Matin',
  'ht.bm.desc':          'Notre offre unique de hash en format 7g',
  'ht.import.title':     'Hashtisan — Import Hash',
  'ht.import.desc':      'Hash pressé de style marocain',

  // Hazo brand
  'hazo.meta.title':     'HAZO — Oaziz Extracts',
  'hazo.meta.desc':      "HAZO — vapes CBD et prerolls fleur. Disponibles à l'OCS et sur les plateformes médicales canadiennes.",
  'hazo.intro':          "Une approche moderne du bien-être, offrant des produits de haute qualité conçus pour s'intégrer parfaitement à votre style de vie.",
  'hazo.ocs.section':    'Disponible sur OCS',
  'hazo.med.section':    'Disponible sur Plateformes Médicales',
  'hazo.cbd.title':      'Hazo — CBD Vape',
  'hazo.cbd.ocsDesc':    'Formule premium riche en CBD pour une expérience apaisante et équilibrée.',
  'hazo.cbd.medDesc':    'Qualité médicale supérieure, idéal pour une utilisation quotidienne contrôlée.',
  'hazo.bb.title':       'Blueberry Muffins',
  'hazo.bb.desc':        'Format pratique de 3 × 0,5g. Des prerolls artisanaux aux arômes de baies sucrées.',

  // Xaman brand
  'xaman.meta.title':    'Xaman — Oaziz Extracts',
  'xaman.meta.desc':     'Xaman — gamme de topiques au cannabis Oaziz Extracts. Page complète à venir.',
  'xaman.intro':         'Notre gamme de topiques au cannabis — page complète à venir.',
  'xaman.formTitle':     "Demande d'Information — Xaman",
  'xaman.ctx':           'Xaman inquiry',

  // Aube brand
  'aube.meta.title':     'AUBE — Vape de Rosine CannonFire — Oaziz Extracts',
  'aube.meta.desc':      "AUBE par CannonFire — rosine pure sans solvant, format 510, profil de terpènes fidèle à la fleur. Disponible à la SQDC.",
  'aube.intro':          "La rosine la plus pure de CannonFire, dans un format 510 prêt à l'emploi — disponible à la SQDC.",
  'aube.product.title':  'AUBE — Vape de Rosine',
  'aube.product.blurb':  "L'expression la plus pure de la fleur, sans solvant, dans un format de poche.",
  'aube.b1':             'Rosine sans solvant de qualité supérieure',
  'aube.b2':             "Format 510 prêt à l'emploi",
  'aube.b3':             'Profil de terpènes complet',
  'aube.b4':             'Fabriqué à Montréal sous licence Santé Canada',
  'aube.gallery.title':  'Galerie AUBE',

  // 404
  '404.title':           'Page introuvable — Oaziz Extracts',
  '404.desc':            'La page demandée est introuvable.',
  '404.heading':         '404',
  '404.body':            "La page que vous cherchez n'existe pas, a été déplacée, ou n'est pas encore disponible.",
  '404.back':            "Retour à l'accueil",

  // Legal
  'legal.meta.title':    'Mentions Légales — Oaziz Extracts',
  'legal.meta.desc':     "Mentions légales d'Oaziz Extracts Inc., producteur sous licence Santé Canada.",
  'legal.title':         'Mentions Légales',
  'legal.updated':       'Dernière mise à jour :',
  'legal.publisher':     'Éditeur',
  'legal.email':         'Courriel :',
  'legal.license':       'Licence',
  'legal.license.body':  "Oaziz Extracts Inc. opère sous licence de Santé Canada depuis 2022, conformément à la Loi sur le cannabis et au Règlement sur le cannabis. Le numéro de licence complet est disponible sur demande pour partenaires commerciaux.",
  'legal.compliance':    'Conformité réglementaire',
  'legal.compliance.body':"Le contenu de ce site est destiné à un public adulte (18 ans et plus). Les communications relatives au cannabis présentées ici sont strictement informatives et destinées aux partenaires B2B (producteurs, distributeurs, plateformes médicales, exportateurs). Aucun produit n'est vendu directement au consommateur via ce site.",
  'legal.ip':            'Propriété intellectuelle',
  'legal.ip.body':       "L'ensemble du contenu (textes, images, marques, logos) est la propriété d'Oaziz Extracts Inc. ou de ses partenaires autorisés. Toute reproduction sans autorisation écrite préalable est interdite.",
  'legal.disclaimer':    'Avertissement',
  'legal.disclaimer.body':"Les informations présentées sur ce site sont fournies à titre indicatif. Oaziz Extracts Inc. décline toute responsabilité quant à l'usage qui pourrait en être fait en dehors du cadre prévu.",

  // Privacy
  'privacy.meta.title':  'Politique de Confidentialité — Oaziz Extracts',
  'privacy.meta.desc':   "Politique de confidentialité d'Oaziz Extracts Inc.",
  'privacy.title':       'Politique de Confidentialité',
  'privacy.h.collect':   'Données que nous recueillons',
  'privacy.collect':     "Lorsque vous utilisez notre formulaire de contact, nous recueillons les informations suivantes : nom, courriel, objet de la demande et contenu de votre message. Aucun cookie marketing n'est utilisé. Des cookies techniques de session peuvent être déposés par notre hébergeur (Vercel) à des fins d'optimisation et de mesure d'audience anonyme.",
  'privacy.h.use':       'Comment nous utilisons vos données',
  'privacy.use':         "Les informations transmises via le formulaire sont utilisées uniquement pour répondre à votre demande. Elles sont acheminées par courriel via notre prestataire d'envoi transactionnel (Resend) à notre équipe interne, et conservées dans nos boîtes courriel professionnelles.",
  'privacy.h.share':     'Partage de données',
  'privacy.share':       "Nous ne vendons, ne louons et ne partageons jamais vos données avec des tiers à des fins commerciales. Vos données peuvent être partagées avec des sous-traitants techniques (hébergement, courriel) strictement nécessaires à l'opération du site.",
  'privacy.h.rights':    'Vos droits (Loi 25 — Québec)',
  'privacy.rights':      "Conformément à la Loi sur la protection des renseignements personnels dans le secteur privé du Québec, vous avez le droit d'accéder à vos renseignements personnels, de les rectifier, d'en demander la suppression, et de retirer votre consentement à leur traitement. Pour toute demande, écrivez-nous à",
  'privacy.h.retention': 'Conservation',
  'privacy.retention':   "Vos messages sont conservés tant qu'ils sont utiles à la relation commerciale, puis archivés ou supprimés selon nos politiques internes (typiquement 36 mois après le dernier échange).",
  'privacy.h.contact':   'Contact',
  'privacy.contact':     'Pour toute question concernant cette politique :',

  // Meta
  'meta.defaultDescription': "Oaziz Extracts — raffineur de cannabis sans solvant basé à Montréal. Hash, rosine, kief IWE, fleur GMP, exportation B2B internationale.",
  'meta.homeTitle':      'Oaziz Extracts — Rincer. Raffiner. Répéter.',
};

const en: Dict = {
  // Navigation
  'nav.home':            'Home',
  'nav.about':           'About',
  'nav.brands':          'BRANDS',
  'nav.contact':         'Contact Us',
  'nav.lang.label':      'Français',
  'nav.lang.aria':       'Passer en français',

  'hero.rinse':          'Rinse.',
  'hero.refine':         'Refine.',
  'hero.repeat':         'Repeat.',
  'hero.aria':           'Rinse · Refine · Repeat',

  'intro.title':         'Welcome to Oaziz Extracts.',
  'intro.subheading':    'Your Trusted Solvent-Free Extract Partner',
  'intro.tagline':       'Tell us what brings you here today.',

  'services.aria':       'Our services',
  'services.bulk':       'Bulk Extracts and White Label Services',
  'services.b2b':        'B2B and Procurement Solutions',
  'services.export':     'International Export Pathway',

  'banner.cta':          "I'm interested in:",
  'banner.kief':         'Kief & IWE',
  'banner.hash':         'Hash',
  'banner.rosin':        'Rosin',
  'banner.trim':         'Trim',
  'banner.flower':       'Flower',
  'banner.topicals':     'Topicals',
  'banner.export':       'Export',

  'form.title':          'Contact Us',
  'form.leadIn':         'Tell us what you need: potential volumes, timelines, specifications, and anything that helps us address your request more accurately.',
  'form.name':           'Name',
  'form.email':          'Email',
  'form.subject':        "I'm contacting you about...",
  'form.subject.general': 'General inquiry',
  'form.subject.export':  'Export',
  'form.subject.sales':   'Sales',
  'form.subject.qa':      'Quality Assurance',
  'form.subject.finance': 'Finance',
  'form.message':        'Message',
  'form.submit':         'Send Message',
  'form.sending':        'Sending…',
  'form.success':        "Thank you! Your message was sent. We'll get back to you shortly.",
  'form.error':          'Something went wrong. Please try again, or email us directly at info@oaziz.ca.',

  'footer.tagline':      'Solvent-free cannabis refiner, Montréal.',
  'footer.contact':      'Contact',
  'footer.products':     'Products',
  'footer.company':      'Company',
  'footer.address':      '322 Port Royal West\nMontréal, QC, Canada',
  'footer.copyright':    '© {year} Oaziz Extracts Inc. All rights reserved.',
  'footer.licensed':     'Health Canada licensed — crafted with rigor, solvent-free.',
  'footer.legalNotice':  'Legal Notice',
  'footer.privacy':      'Privacy Policy',

  'age.title':           'Are you 18 or older?',
  'age.body':            'This site contains cannabis information intended for adult business partners. Please confirm your age.',
  'age.yes':             "Yes, I'm 18 or older",
  'age.no':              'No',
  'age.finePrint':       'In compliance with the Cannabis Act (Canada) and provincial requirements.',

  'about.meta.title':    'About — Oaziz Extracts',
  'about.meta.desc':     'Oaziz Extracts Inc. — privately-held solvent-free cannabis refiner based in Montréal. Our story, our team, Health Canada licensed since 2022.',
  'about.title':         'Our Story',
  'about.spirit.title':  'The Spirit of the Refiner',
  'about.spirit.p1':     'Oaziz Extracts Inc. ("Oaziz") is a private cannabis refining company based in Montréal. Specializing in traditional and modern solvent-free refining methods, we master techniques such as ice-water extraction, sifting, and heat pressing. Since obtaining our Health Canada license in 2022, we have dedicated ourselves to the art of purification.',
  'about.spirit.p2':     "Our journey was made possible by the trust and support of our friends and family, who funded our vision. That foundation makes us more than just a company; it makes us a family — immensely proud and grateful to work every day with our shared passion for cannabis. We are especially proud of the reputation for trust and reliability we have built with our clients and suppliers alike.",
  'about.team.title':    'Our Team',
  'about.team.intro':    "Oaziz's leadership is a diverse group with deep experience across branding, product formulation, quality assurance, and finance. Above all, we are united by foundational expertise in the art and science of cannabis.",
  'about.role.ceo':      'CEO',
  'about.role.paq':      'Director of Quality Assurance and Compliance',
  'about.role.extractor':'Director of Production and R&D',
  'about.role.sales':    'Director of Sales and Commercialization',
  'about.role.cfo':      'Chief Financial Officer',

  'about.mission.title': 'Mission',
  'about.mission.body':  'At Oaziz Extracts, our purpose is to provide our partners with the expertise, infrastructure, and resources required to develop high-quality cannabis products while operating with respect for the environment and the communities we serve.',
  'about.vision.title':  'Vision',
  'about.vision.body':   'To be the trusted custodian of cannabis refinement, setting the standard for quality, innovation, sustainability, and responsible stewardship within the cannabis industry.',

  'brands.meta.title':   'Our Brands — Oaziz Extracts',
  'brands.meta.desc':    'Discover the Oaziz Extracts brands: CannonFire, Curado, Canolio, Hashtisan, Hazo, Xaman. Hash, rosin, ice water extract, flower and more.',
  'brands.title':        'Our Brands',
  'brands.tag.cannonfire':'',
  'brands.tag.curado':   'HASH Ice Water Extract',
  'brands.tag.canolio':  'Rosin Syrup',
  'brands.tag.xaman':    'TOPICALS',
  'brands.tag.hashtisan':'HASH Dry Sift',
  'brands.tag.hazo':     'FLOWER',
  'brands.medical.title':'Our Products on Medical Platforms',
  'brands.availableAt':  'Available at:',

  'hash.meta.title':     'Pressed Hashish and IWE Hash — Oaziz Extracts',
  'hash.meta.desc':      'Oaziz hashish selection: traditional pressing and modern Ice Water Extract techniques. Varied flavor profiles, textures, and potencies for B2B connoisseurs.',
  'hash.h1':             'Pressed Hashish and "Ice Water Extract" Hash',
  'hash.desc':           'Explore our hashish selection, from traditional pressing methods to modern ice-water extraction techniques. We offer products with varied flavor profiles, textures, and potencies to satisfy connoisseurs.',
  'hash.sub.pressed':    'Pressed Hashish',
  'hash.sub.iwe':        '"Ice Water Extract" Hash',
  'hash.ctx':            'Hash inquiry',

  'rosin.meta.title':    'Cured and Live Rosins — Oaziz Extracts',
  'rosin.meta.desc':     'Oaziz artisan rosins: Cured Rosin (rich and complex) and Live Rosin (fresh terpene profile). Solvent-free production in Montréal.',
  'rosin.h1':            '"Cured" and "Live" Rosins',
  'rosin.desc':          'Discover the pinnacle of solvent-free extraction with our rosin collection. We offer both "Cured Rosin," known for its rich, complex flavors, and "Live Rosin," celebrated for its vibrant, fresh terpene profile.',
  'rosin.ctx':           'Rosin inquiry',

  'kief.meta.title':     'Tumbled Kief and IWE Kief — Oaziz Extracts',
  'kief.meta.desc':      'Oaziz kief: traditional tumbled and premium Ice Water Extract. Multiple purity and potency grades, available in bulk for licensed producers.',
  'kief.h1':             'Tumbled Kief and "Ice Water Extract" Kief',
  'kief.desc':           'We offer two distinct types of kief to meet all market needs. Each type is available in multiple quality and potency grades, with a range of color profiles to satisfy our clients\' precise specifications. Our IWE (Ice Water Extract) Kief is typically more potent and purer, ideal for premium products.',
  'kief.sub.dry':        'Tumbled Kief',
  'kief.sub.iwe':        '"Ice Water Extract" (IWE) Kief',
  'kief.ctx':            'Kief & IWE inquiry',

  'flower.meta.title':   'Flower — Oaziz Extracts',
  'flower.meta.desc':    'GMP cannabis flower for producers and exporters. Request your volumes, timelines, and specifications.',
  'flower.formTitle':    'Information Request — Flower',
  'flower.ctx':          'Flower inquiry',

  'trim.meta.title':     'Trim — Oaziz Extracts',
  'trim.meta.desc':      'Bulk cannabis trim for extraction and derivative products. Flexible volumes and short lead times.',
  'trim.formTitle':      'Information Request — Trim',
  'trim.ctx':            'Trim inquiry',

  'topicals.meta.title': 'Topicals — Oaziz Extracts',
  'topicals.meta.desc':  'Cannabis topicals for private label and custom formulations. Produced under Health Canada license.',
  'topicals.formTitle':  'Information Request — Topicals',
  'topicals.ctx':        'Topicals inquiry',

  'export.meta.title':   'Export — Oaziz Extracts',
  'export.meta.desc':    'International export of cannabis products under Health Canada license. Regulatory compliance, customs logistics, trusted partners.',
  'export.formTitle':    'Information Request — Export',
  'export.ctx':          'Export inquiry',

  'bulk.meta.title':     'Bulk Extracts & White Label — Oaziz Extracts',
  'bulk.meta.desc':      'Solvent-free bulk extracts and white-label services for licensed producers.',
  'bulk.h1':             'Bulk Extracts & White Label',
  'bulk.desc':           'We offer solvent-free bulk extracts — pressed hash, kief, IWE, rosin — as well as complete white-label services for licensed producers. Our team supports you from concept to delivery.',
  'bulk.ctx':            'Bulk / White-label inquiry',

  'whitelabel.meta.title':'B2B Services — Oaziz Extracts',
  'whitelabel.meta.desc': 'Oaziz B2B services: white label, formulation, quality control, logistics. Complete solution for producers and distributors.',
  'whitelabel.h1':       'B2B Services',
  'whitelabel.desc':     'From formulation to market launch, Oaziz Extracts offers full processing, packaging, and regulatory support to its B2B partners.',
  'whitelabel.ctx':      'B2B / White-label inquiry',

  'cf.meta.title':       'CannonFire — Oaziz Extracts',
  'cf.meta.desc':        'CannonFire solvent-free rosin vapes — available at SQDC and on Canadian medical platforms.',
  'cf.intro':            'Discover our vapes available on the Canadian market',
  'cf.aube.title':       'AUBE',
  'cf.aube.blurb':       "CannonFire's purest rosin, for a smooth, full experience.",
  'cf.aube.b1':          'Premium solvent-free rosin',
  'cf.aube.b2':          'Ready-to-use 510 format',
  'cf.aube.b3':          'Full, flower-faithful terpene profile',
  'cf.aube.cta':         'View Product',
  'cf.med.bcp':          'Black Cherry Punch Rosin Vape',
  'cf.med.3bk':          '3 Blue Kings Rosin Vape',
  'cf.med.mc':           'Mandarin Cookies Rosin Vape',
  'cf.med.fl':           'Flawless Victory Rosin Vape',
  'cf.med.sapphire':     'Sapphire Scout Rosin Vape',

  'curado.meta.title':   'CURADO — Oaziz Extracts',
  'curado.meta.desc':    'CURADO Hash Ice Water Extract and premium vapes — available at OCS and on Canadian medical platforms.',
  'curado.intro':        'Discover our hashish available on the Canadian market',
  'curado.pbb.title':    'Peanut Butter Breath Temple Ball',
  'curado.pbb.blurb':    'Full-spectrum 1.5g temple ball from the Peanut Butter Breath hybrid (Do-Si-Dos × Mendo Breath).',
  'curado.pbb.b1':       'Hybrid · Do-Si-Dos × Mendo Breath',
  'curado.pbb.b2':       'THC 54.1% · Terpenes 2.82%',
  'curado.pbb.b3':       'Nutty, earthy, gassy profile',
  'curado.pbb.b4':       'Heavy-bodied, relaxing effects',

  'curado.cb.title':     'Cali Biscotti Temple Ball',
  'curado.cb.blurb':     'Aged 3-4 months · exceptional terpene content (5.91%). Creamy, citrusy, distinctively relaxing.',
  'curado.cb.b1':        "Curado's signature aging · 3-4 months",
  'curado.cb.b2':        'THC 59.8% · Terpenes 5.91%',
  'curado.cb.b3':        'Creamy, zesty citrus, tangy orange',
  'curado.cb.b4':        'Distinctive relaxing effects',

  'curado.cj.title':     'Cap Junky Temple Ball',
  'curado.cj.blurb':     'Full-spectrum 1.5g from the Cap Junky hybrid (Alien Cookies × Kush Mints #11). Sharp gas, sweet fruit.',
  'curado.cj.b1':        'Hybrid · Alien Cookies × Kush Mints #11',
  'curado.cj.b2':        'THC 59.98% · Terpenes 2.37%',
  'curado.cj.b3':        'Gas/diesel, sweet mint, citrus',
  'curado.cj.b4':        'β-Linalool, β-Caryophyllene, Bisabolol',

  'curado.royal.title':  'Royal (M-39) Temple Ball',
  'curado.royal.blurb':  'Legendary Quebec M-39 cultivar — 1.5g temple ball aged 3-4 months.',
  'curado.royal.b1':     "Hybrid · M-39 (Quebec's heritage cultivar)",
  'curado.royal.b2':     'THC 54.7% · Terpenes 2.81%',
  'curado.royal.b3':     'Earthy, spicy, herbal profile',
  'curado.royal.b4':     'Caryophyllene, Myrcene, Bisabolol',

  'curado.fruit.title':  'Fruit Temple Ball',
  'curado.fruit.blurb':  'Hand-rolled 1.5g temple ball · pure full-spectrum hash, no additives.',
  'curado.fruit.b1':     'Indica-dominant · naturally fruity aroma',
  'curado.fruit.b2':     'THC 55-65% · CBD 0-8%',
  'curado.fruit.b3':     'No added oils, distillates, or terpenes',
  'curado.fruit.b4':     'Small-batch boutique lots · ages gracefully',

  'canolio.meta.title':  'CANOLIO — Oaziz Extracts',
  'canolio.meta.desc':   'CANOLIO Rosin Syrups developed with Canolio Gourmet for your cannabis-infused edible recipes.',
  'canolio.intro.before':'Discover our Rosin Syrups developed in partnership with',
  'canolio.intro.partner':'Canolio Gourmet',
  'canolio.intro.after': ', specifically designed for your cannabis edible recipes.',
  'canolio.med.3bk':     'Canolio 3 Blue Kings Rosin Syrup',
  'canolio.med.bcp':     'Canolio Black Cherry Punch Rosin Syrup',
  'canolio.med.sapphire':'Canolio Sapphire Scout Rosin Syrup',

  'ht.meta.title':       'HASHTISAN — Oaziz Extracts',
  'ht.meta.desc':        'Hashtisan artisan hash: GEM, Hashgar, Minigar, Bon Matin, Import Hash. Available on Canadian medical platforms.',
  'ht.intro':            'Discover our collection of premium artisan hashish, available exclusively on medical platforms.',
  'ht.gem.title':        'Hashtisan — GEM',
  'ht.gem.desc':         'Diamond-infused hash with over 80% potency',
  'ht.hashgar.title':    'Hashtisan — Hashgar',
  'ht.hashgar.desc':     '1.5g preroll wrapped in 1.5g of our imported hash leaf — glass tip — handmade in limited batches',
  'ht.minigar.title':    'Hashtisan — Minigar',
  'ht.minigar.desc':     'Compact 1.5g version — paper tip — same artisan quality in a smaller format',
  'ht.bm.title':         'Hashtisan — Bon Matin',
  'ht.bm.desc':          'Our unique 7g hash offering',
  'ht.import.title':     'Hashtisan — Import Hash',
  'ht.import.desc':      'Moroccan-style pressed hash',

  'hazo.meta.title':     'HAZO — Oaziz Extracts',
  'hazo.meta.desc':      'HAZO — CBD vapes and flower prerolls. Available at OCS and on Canadian medical platforms.',
  'hazo.intro':          'A modern approach to wellness, offering high-quality products designed to fit seamlessly into your lifestyle.',
  'hazo.ocs.section':    'Available at OCS',
  'hazo.med.section':    'Available on Medical Platforms',
  'hazo.cbd.title':      'Hazo — CBD Vape',
  'hazo.cbd.ocsDesc':    'Premium CBD-rich formula for a calm, balanced experience.',
  'hazo.cbd.medDesc':    'Superior medical-grade quality, ideal for controlled daily use.',
  'hazo.bb.title':       'Blueberry Muffins',
  'hazo.bb.desc':        'Convenient 3 × 0.5g format. Artisan prerolls with sweet berry aromas.',

  'xaman.meta.title':    'Xaman — Oaziz Extracts',
  'xaman.meta.desc':     'Xaman — Oaziz Extracts cannabis topicals line. Full page coming soon.',
  'xaman.intro':         'Our cannabis topicals line — full page coming soon.',
  'xaman.formTitle':     'Information Request — Xaman',
  'xaman.ctx':           'Xaman inquiry',

  'aube.meta.title':     'AUBE — CannonFire Rosin Vape — Oaziz Extracts',
  'aube.meta.desc':      'AUBE by CannonFire — pure solvent-free rosin, 510 format, flower-faithful terpene profile. Available at SQDC.',
  'aube.intro':          "CannonFire's purest rosin, in a ready-to-use 510 format — available at SQDC.",
  'aube.product.title':  'AUBE — Rosin Vape',
  'aube.product.blurb':  "The purest expression of the flower, solvent-free, in a pocketable format.",
  'aube.b1':             'Premium solvent-free rosin',
  'aube.b2':             'Ready-to-use 510 format',
  'aube.b3':             'Full terpene profile',
  'aube.b4':             'Made in Montréal under Health Canada license',
  'aube.gallery.title':  'AUBE Gallery',

  '404.title':           'Page Not Found — Oaziz Extracts',
  '404.desc':            'The requested page could not be found.',
  '404.heading':         '404',
  '404.body':            "The page you are looking for doesn't exist, has moved, or isn't available yet.",
  '404.back':            'Back to home',

  'legal.meta.title':    'Legal Notice — Oaziz Extracts',
  'legal.meta.desc':     'Legal notice from Oaziz Extracts Inc., Health Canada licensed producer.',
  'legal.title':         'Legal Notice',
  'legal.updated':       'Last updated:',
  'legal.publisher':     'Publisher',
  'legal.email':         'Email:',
  'legal.license':       'License',
  'legal.license.body':  'Oaziz Extracts Inc. operates under a Health Canada license since 2022, in accordance with the Cannabis Act and the Cannabis Regulations. The full license number is available on request for business partners.',
  'legal.compliance':    'Regulatory compliance',
  'legal.compliance.body':'The content of this site is intended for an adult audience (18+). Cannabis-related communications presented here are strictly informational and intended for B2B partners (producers, distributors, medical platforms, exporters). No product is sold directly to consumers via this site.',
  'legal.ip':            'Intellectual property',
  'legal.ip.body':       'All content (text, images, marks, logos) is the property of Oaziz Extracts Inc. or its authorized partners. Reproduction without prior written authorization is prohibited.',
  'legal.disclaimer':    'Disclaimer',
  'legal.disclaimer.body':'Information presented on this site is provided for guidance only. Oaziz Extracts Inc. disclaims any liability for use beyond the intended scope.',

  'privacy.meta.title':  'Privacy Policy — Oaziz Extracts',
  'privacy.meta.desc':   'Privacy policy of Oaziz Extracts Inc.',
  'privacy.title':       'Privacy Policy',
  'privacy.h.collect':   'Data we collect',
  'privacy.collect':     'When you use our contact form we collect: your name, email, subject of inquiry, and the contents of your message. No marketing cookies are used. Technical session cookies may be set by our host (Vercel) for optimization and anonymous audience measurement.',
  'privacy.h.use':       'How we use your data',
  'privacy.use':         'Information sent via the form is used only to respond to your inquiry. It is routed by email via our transactional email provider (Resend) to our internal team, and stored in our professional mailboxes.',
  'privacy.h.share':     'Data sharing',
  'privacy.share':       'We never sell, rent, or share your data with third parties for commercial purposes. Your data may be shared with technical subprocessors (hosting, email) strictly necessary to operate the site.',
  'privacy.h.rights':    'Your rights (Loi 25 — Québec)',
  'privacy.rights':      "In accordance with Quebec's Act respecting the protection of personal information in the private sector, you have the right to access your personal information, to rectify it, to request its deletion, and to withdraw your consent to its processing. For any request, write to us at",
  'privacy.h.retention': 'Retention',
  'privacy.retention':   'Your messages are kept as long as they are useful to the commercial relationship, then archived or deleted per our internal policies (typically 36 months after the last exchange).',
  'privacy.h.contact':   'Contact',
  'privacy.contact':     'For any question regarding this policy:',

  'meta.defaultDescription': 'Oaziz Extracts — solvent-free cannabis refiner based in Montréal. Hash, rosin, IWE kief, GMP flower, international B2B export.',
  'meta.homeTitle':      'Oaziz Extracts — Rinse. Refine. Repeat.',
};

export const ui: Record<Locale, Dict> = { fr, en };

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

// For language toggle: given the current path, produce the equivalent in the other locale.
export function alternatePath(currentPath: string, currentLang: Locale): string {
  const altLang: Locale = currentLang === 'en' ? 'fr' : 'en';
  return pathInLocale(currentPath, altLang);
}

/** Equivalent of the current page in a specific target locale. */
export function pathInLocale(currentPath: string, targetLang: Locale): string {
  const stripped = currentPath.replace(/^\/fr(\/|$)/, '/');
  return targetLang === defaultLocale
    ? stripped
    : `/${targetLang}${stripped === '/' ? '' : stripped}`;
}
