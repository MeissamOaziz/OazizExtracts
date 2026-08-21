export const frCalculatricesIndex = {
  title: 'Calculatrices',
  backLink: '← Retour au tableau de bord',
  subtitle: 'Outils internes de calcul de coûts et de prix.',
} as const;

export type CalculatricesIndexDict = typeof frCalculatricesIndex;

export const enCalculatricesIndex: Partial<Record<keyof CalculatricesIndexDict, string>> = {
  title: 'Calculators',
  backLink: '← Back to dashboard',
  subtitle: 'Internal tools for cost and price calculations.',
};
