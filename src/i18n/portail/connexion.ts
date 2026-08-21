export const frConnexion = {
  title: 'Connexion',
  subtitle: "Portail interne — réservé au personnel d'Oaziz Extracts.",
  email: 'Courriel',
  password: 'Mot de passe',
  submit: 'Se connecter',
  firstTime: 'Première connexion ou mot de passe oublié',
  inviteEmail: 'Adresse courriel Oaziz',
  inviteHint: 'Vous recevrez un lien pour définir (ou réinitialiser) votre mot de passe.',
  inviteSubmit: 'Envoyer le lien',

  'error.invalid': 'Mot de passe invalide.',
  'error.missing': 'Veuillez remplir les deux champs.',
  'error.unknown': 'Une erreur inattendue est survenue. Réessayez.',
  'error.not_staff': "Cette adresse n'est pas dans la liste du personnel.",
  'error.inactive': 'Ce compte a été désactivé.',
  'error.no_account': "Aucun mot de passe défini pour ce compte. Créez-le d'abord (voir instructions ci-dessous).",
  'error.db': 'Impossible de joindre la base de données. Réessayez dans un instant.',

  'info.invite_sent': 'Si votre adresse est reconnue, une invitation vous a été envoyée par courriel.',
  'info.logged_out': 'Vous êtes déconnecté.',
} as const;

export type ConnexionDict = typeof frConnexion;

export const enConnexion: Partial<Record<keyof ConnexionDict, string>> = {
  title: 'Log in',
  subtitle: 'Internal portal — Oaziz Extracts staff only.',
  email: 'Email',
  password: 'Password',
  submit: 'Log in',
  firstTime: 'First time logging in or forgot password',
  inviteEmail: 'Oaziz email address',
  inviteHint: 'You will receive a link to set (or reset) your password.',
  inviteSubmit: 'Send link',

  'error.invalid': 'Invalid password.',
  'error.missing': 'Please fill in both fields.',
  'error.unknown': 'An unexpected error occurred. Try again.',
  'error.not_staff': 'This address is not on the staff list.',
  'error.inactive': 'This account has been deactivated.',
  'error.no_account': 'No password set for this account yet. Set one first (see instructions below).',
  'error.db': 'Could not reach the database. Try again in a moment.',

  'info.invite_sent': 'If your address is recognized, an invitation has been sent by email.',
  'info.logged_out': 'You are logged out.',
};
