export const frDefinirMotDePasse = {
  title: 'Définir votre mot de passe',

  'h1.first': 'Bienvenue sur le portail',
  'h1.reset': 'Définir un nouveau mot de passe',

  'subtitle.first': 'Bonjour {name}, choisissez le mot de passe que vous utiliserez pour vous connecter.',
  'subtitle.reset': 'Choisissez votre nouveau mot de passe.',

  'error.short': 'Le mot de passe doit contenir au moins 8 caractères.',
  'error.mismatch': 'Les deux mots de passe ne correspondent pas.',
  'error.weak': 'Ce mot de passe a été refusé (trop courant ou déjà compromis dans une fuite connue). Choisissez-en un autre — idéalement une phrase de 3 à 4 mots plus des chiffres.',
  'error.unknown': 'Une erreur est survenue.',
  'error.detailLabel': 'Détail :',

  'label.password': 'Nouveau mot de passe',
  'label.confirm': 'Confirmer',

  'hint.strong': 'Minimum 8 caractères.',
  'hint.rest': 'Les mots de passe très courants (ex. « 12345678 ») sont refusés — ils sont vérifiés contre une base de fuites connues.',
  'hint.tipPrefix': 'Astuce : une phrase de 3 mots + chiffres est facile à retenir et acceptée (ex. ',
  'hint.example': 'Rosin-Kief-2026',
  'hint.tipSuffix': ').',

  'submit.first': 'Définir mon mot de passe',
  'submit.reset': 'Enregistrer',
} as const;

export type DefinirMotDePasseDict = typeof frDefinirMotDePasse;

export const enDefinirMotDePasse: Partial<Record<keyof DefinirMotDePasseDict, string>> = {
  title: 'Set your password',

  'h1.first': 'Welcome to the portal',
  'h1.reset': 'Set a new password',

  'subtitle.first': "Hello {name}, choose the password you'll use to log in.",
  'subtitle.reset': 'Choose your new password.',

  'error.short': 'Password must be at least 8 characters long.',
  'error.mismatch': 'The two passwords do not match.',
  'error.weak': 'This password was rejected (too common, or already exposed in a known breach). Choose another — ideally a 3–4 word phrase plus numbers.',
  'error.unknown': 'An error occurred.',
  'error.detailLabel': 'Detail:',

  'label.password': 'New password',
  'label.confirm': 'Confirm',

  'hint.strong': 'Minimum 8 characters.',
  'hint.rest': 'Very common passwords (e.g. "12345678") are rejected — they are checked against a database of known breaches.',
  'hint.tipPrefix': 'Tip: a 3-word phrase plus numbers is easy to remember and accepted (e.g. ',
  'hint.example': 'Rosin-Kief-2026',
  'hint.tipSuffix': ').',

  'submit.first': 'Set my password',
  'submit.reset': 'Save',
};
