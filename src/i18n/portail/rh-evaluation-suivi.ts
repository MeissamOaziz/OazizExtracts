export const frRhEvaluationSuivi = {
  title: 'Suivi des évaluations',
  backLink: '← Ressources humaines',
  subtitle: 'Historique des évaluations de rendement par employé, et prochaines évaluations à planifier.',
  newEvaluationBtn: 'Nouvelle évaluation',

  'summary.employees': 'Employés évalués',
  'summary.overdue': 'En retard',
  'summary.dueSoon': 'À planifier (30 jours)',

  empty: "Aucune évaluation enregistrée pour le moment. Les évaluations générées depuis le portail apparaissent ici automatiquement.",

  'th.employee': 'Employé',
  'th.lastReview': 'Dernière évaluation',
  'th.type': 'Type',
  'th.rating': 'Résultat global',
  'th.next': 'Prochaine évaluation',
  'th.count': 'Total',
  'th.history': 'Historique',

  'type.3month': '3 mois (probation)',
  'type.6month': '6 mois',
  'type.annual': 'Annuelle',
  'type.followup': 'Suivi',

  'rating.1': '1 — Insatisfaisant',
  'rating.2': '2 — À améliorer',
  'rating.3': '3 — Répond aux attentes',
  'rating.4': '4 — Dépasse les attentes',

  'next.overdue': 'En retard',
  'next.dueSoon': 'Bientôt',
  'next.scheduled': 'Planifiée',
  'next.none': 'Non planifiée',

  download: 'PDF',
  none: '—',
} as const;

export type RhEvaluationSuiviDict = typeof frRhEvaluationSuivi;

export const enRhEvaluationSuivi: Partial<Record<keyof RhEvaluationSuiviDict, string>> = {
  title: 'Evaluation Tracker',
  backLink: '← Human Resources',
  subtitle: 'Performance evaluation history per employee, and upcoming reviews to schedule.',
  newEvaluationBtn: 'New evaluation',

  'summary.employees': 'Employees evaluated',
  'summary.overdue': 'Overdue',
  'summary.dueSoon': 'Due within 30 days',

  empty: 'No evaluations recorded yet. Evaluations generated from the portal show up here automatically.',

  'th.employee': 'Employee',
  'th.lastReview': 'Last review',
  'th.type': 'Type',
  'th.rating': 'Overall rating',
  'th.next': 'Next review',
  'th.count': 'Total',
  'th.history': 'History',

  'type.3month': '3-month (probation)',
  'type.6month': '6-month',
  'type.annual': 'Annual',
  'type.followup': 'Follow-up',

  'rating.1': '1 — Unsatisfactory',
  'rating.2': '2 — Needs improvement',
  'rating.3': '3 — Meets expectations',
  'rating.4': '4 — Exceeds expectations',

  'next.overdue': 'Overdue',
  'next.dueSoon': 'Soon',
  'next.scheduled': 'Scheduled',
  'next.none': 'Not scheduled',

  download: 'PDF',
  none: '—',
};
