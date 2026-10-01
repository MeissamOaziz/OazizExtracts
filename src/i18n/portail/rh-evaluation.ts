export const frRhEvaluation = {
  title: 'Évaluation de rendement',
  backLink: '← Ressources humaines',
  subtitle: 'Document en anglais (gabarit officiel) — interface en français.',

  'section.info': '1. Employee & Evaluation Information',
  'label.employeeName': 'Employee name', 'label.hireDate': 'Hire date', 'label.jobTitle': 'Job title',
  'label.companyLocation': 'Company / location', 'label.reviewDate': 'Review date', 'label.periodCovered': 'Period covered',
  'label.reviewers': 'Reviewer(s)', 'label.evaluationType': 'Evaluation type',
  'type.3month': '3-Month (Probation)', 'type.6month': '6-Month', 'type.annual': '1-Year / Annual', 'type.followup': 'Follow-Up',
  'label.followupPreviousDate': 'If follow-up: date of previous evaluation',

  'section.competencies': '3. Core Competencies',
  'hint.competencies': 'Rate each competency and give concrete examples (what happened, when, and the impact).',
  'label.rating': 'Rating', 'label.comments': 'Comments & specific examples',
  'rating.1': '1 — Unsatisfactory', 'rating.2': '2 — Needs Improvement', 'rating.3': '3 — Meets Expectations',
  'rating.4': '4 — Exceeds Expectations', 'rating.na': 'N/A — Not assessed',
  'label.overallRating': 'OVERALL RATING', 'label.overallComments': 'Overall comments',

  'section.previousGoals': '4. Progress on Previous Goals',
  'hint.previousGoals': 'Complete for follow-up and later evaluations.',
  'label.goal': 'Goal from previous evaluation', 'label.status': 'Status',
  'status.met': 'Met', 'status.partly': 'Partly', 'status.not_met': 'Not met',

  'section.strengths': '5. Key Strengths & Contributions',
  'section.improvement': '6. Areas for Improvement',
  'hint.improvement': 'For each area: observation, examples, business impact, and expectation going forward.',
  'section.roleExpectations': '7. Role Expectations & Working Arrangements',

  'section.actionPlan': '8. Action Plan & Goals Until Next Review',
  'label.actionGoal': 'Goal / action', 'label.measure': 'How success is measured',
  'label.support': 'Support / check-in', 'label.due': 'Due',

  'section.employeeComments': '9. Employee Comments',
  'hint.employeeComments': 'The employee is invited to comment on this evaluation.',

  'section.outcome': '10. Outcome & Next Steps',
  'outcome.confirmed': 'Employment confirmed / probation successfully completed',
  'outcome.followup_scheduled': 'Follow-up evaluation scheduled',
  'outcome.pip': 'Formal performance improvement plan (PIP) required',
  'outcome.comp_review': 'Role / compensation review (annual evaluations only)',
  'label.interimCheckins': 'Interim check-ins', 'label.nextEvaluationDate': 'Next evaluation date',
  'label.nextEvaluationFocus': 'Focus of next evaluation',

  'section.signatures': '11. Signatures & Acknowledgement',
  'hint.signatures': 'Typed names — have the printed copy countersigned if required.',
  'label.employee': 'Employee', 'label.reviewer': 'Reviewer', 'label.secondReviewer': 'Second reviewer (optional)',
  'label.name': 'Name', 'label.date': 'Date',

  'label.recipients': 'Envoyer une copie par courriel (optionnel)',
  'hint.recipients': 'Courriels séparés par des virgules.',

  generateBtn: 'Générer le PDF',
  'error.missing': 'Veuillez remplir le nom et la date de révision.',
  'error.unknown': 'Une erreur est survenue.',
  'info.generated': 'Document généré.',
  downloadBtn: 'Télécharger le PDF',
} as const;

export type RhEvaluationDict = typeof frRhEvaluation;

export const enRhEvaluation: Partial<Record<keyof RhEvaluationDict, string>> = {
  title: 'Performance Evaluation',
  backLink: '← Human Resources',
  subtitle: 'English-language document (official template).',

  'label.recipients': 'Email a copy (optional)',
  'hint.recipients': 'Comma-separated emails.',
  generateBtn: 'Generate PDF',
  'error.missing': 'Please fill in the name and review date.',
  'error.unknown': 'An error occurred.',
  'info.generated': 'Document generated.',
  downloadBtn: 'Download PDF',
};
