// Atelier — the four planning views over one dataset.

export const frPlanning = {
  'title': 'Planification',
  'subtitle':
    'Les mêmes étapes, quatre questions. Où en est chaque commande, ce qui se passe cette semaine, ce qui va glisser, et si la salle est libre.',

  'view.kanban': 'Tableau',
  'view.calendar': 'Calendrier',
  'view.gantt': 'Gantt',
  'view.rooms': 'Salles',

  'view.kanban.q': 'Où en est chaque commande',
  'view.calendar.q': 'Ce qui se passe cette semaine',
  'view.gantt.q': 'Ce qui va glisser',
  'view.rooms.q': 'Si la salle est libre',

  'empty':
    'Aucune étape planifiée. Ouvrez une commande et créez son plan de production.',
  'emptyWindow': 'Aucune étape dans cette période.',

  'col.toPlan': 'À planifier',
  'col.done': 'Terminé',
  'legend.blocked': 'Bloquée',
  'legend.atRisk': 'En retard',
  'legend.conflict': 'Salle en conflit',
  'legend.concurrent': 'Simultané permis',

  'nav.prev': 'Période précédente',
  'nav.next': 'Période suivante',
  'nav.today': 'Aujourd’hui',
  'nav.window': '{start} au {end}',

  'ref.internal': 'DEMANDE INTERNE',
  'ref.packaging': 'EMBALLAGE',
  'card.noDates': 'Sans dates',
  'card.unassigned': 'Non assignée',
  'stat.stages': '{n} étapes',
  'stat.blocked': '{n} bloquées',
  'stat.late': '{n} en retard',
  'stat.conflicts': '{n} conflits de salle',

  'room.concurrent': 'Étapes simultanées permises',
  'room.exclusive': 'Une étape à la fois',
  'room.none': 'Aucune salle',

  'tip.blocked': 'En attente d’une étape amont ou d’une retenue AQ.',
  'tip.conflict': 'Une autre étape occupe cette salle sur la même période.',
  'tip.late': 'La fin projetée dépasse la date promise.',
} as const;

export type PlanningDict = typeof frPlanning;

export const enPlanning: Partial<Record<keyof PlanningDict, string>> = {
  'title': 'Planning',
  'subtitle':
    'The same stages, four questions. Where each order stands, what is happening this week, what is going to slip, and whether the room is free.',

  'view.kanban': 'Board',
  'view.calendar': 'Calendar',
  'view.gantt': 'Gantt',
  'view.rooms': 'Rooms',

  'view.kanban.q': 'Where each order stands',
  'view.calendar.q': 'What is happening this week',
  'view.gantt.q': 'What is going to slip',
  'view.rooms.q': 'Whether the room is free',

  'empty': 'No stages planned. Open an order and build its production plan.',
  'emptyWindow': 'No stages in this period.',

  'col.toPlan': 'To plan',
  'col.done': 'Done',
  'legend.blocked': 'Blocked',
  'legend.atRisk': 'At risk',
  'legend.conflict': 'Room conflict',
  'legend.concurrent': 'Concurrent allowed',

  'nav.prev': 'Previous period',
  'nav.next': 'Next period',
  'nav.today': 'Today',
  'nav.window': '{start} to {end}',

  'ref.internal': 'INTERNAL REQUEST',
  'ref.packaging': 'PACKAGING',
  'card.noDates': 'No dates',
  'card.unassigned': 'Unassigned',
  'stat.stages': '{n} stages',
  'stat.blocked': '{n} blocked',
  'stat.late': '{n} at risk',
  'stat.conflicts': '{n} room conflicts',

  'room.concurrent': 'Concurrent stages allowed',
  'room.exclusive': 'One stage at a time',
  'room.none': 'No room',

  'tip.blocked': 'Waiting on an upstream stage or a QA hold.',
  'tip.conflict': 'Another stage occupies this room over the same period.',
  'tip.late': 'Projected finish is past the promised date.',
};
