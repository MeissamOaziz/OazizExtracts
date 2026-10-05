// Atelier — stage planning helpers, shared by the planner page and its API routes.

import type { PortailLocale } from './portail-i18n';

export type StageStatus = 'planned' | 'in_progress' | 'done' | 'skipped' | 'cancelled';

export type LossReason =
  | 'moisture' | 'process_waste' | 'sampling' | 'spillage' | 'qa_hold' | 'destruction' | 'other';

type Bi = { fr: string; en: string };

export const STAGE_STATUSES: Record<StageStatus, Bi> = {
  planned: { fr: 'Planifiée', en: 'Planned' },
  in_progress: { fr: 'En cours', en: 'In progress' },
  done: { fr: 'Terminée', en: 'Done' },
  skipped: { fr: 'Sautée', en: 'Skipped' },
  cancelled: { fr: 'Annulée', en: 'Cancelled' },
};

export const LOSS_REASONS: Record<LossReason, Bi> = {
  moisture: { fr: 'Humidité', en: 'Moisture' },
  process_waste: { fr: 'Perte de procédé', en: 'Process waste' },
  sampling: { fr: 'Échantillonnage', en: 'Sampling' },
  spillage: { fr: 'Déversement', en: 'Spillage' },
  qa_hold: { fr: 'Retenue AQ', en: 'QA hold' },
  destruction: { fr: 'Destruction', en: 'Destruction' },
  other: { fr: 'Autre', en: 'Other' },
};

/** Statuses that still occupy a room and still hold up what follows. */
export const ACTIVE_STAGE_STATUSES: StageStatus[] = ['planned', 'in_progress'];

export function stageTone(status: StageStatus, blocked: boolean): 'muted' | 'neutral' | 'active' | 'good' | 'stop' {
  if (status === 'done') return 'good';
  if (status === 'cancelled' || status === 'skipped') return 'muted';
  if (blocked) return 'stop';
  if (status === 'in_progress') return 'active';
  return 'neutral';
}

// ------------------------------------------------------------------
// Date chaining
// ------------------------------------------------------------------

export function addDays(iso: string, days: number): string {
  // Parse as a plain calendar date so a timezone never shifts it a day.
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Dates to pre-fill when adding a stage: it starts the day AFTER the last active
 * stage ends, and runs for the process's default duration.
 *
 * Cancelled and skipped stages are ignored on purpose — a stage that will not
 * happen must not push the schedule out. Everything stays editable afterwards;
 * this only saves typing on the common case.
 */
export function chainDates(
  previousEnd: string | null,
  durationDays: number | null | undefined,
): { start: string; end: string } {
  const start = previousEnd ? addDays(previousEnd, 1) : today();
  // A 1.5-day process occupies 2 calendar days: start and end are inclusive.
  const span = Math.max(1, Math.ceil(Number(durationDays ?? 1)));
  return { start, end: addDays(start, span - 1) };
}

/** The end date of the last stage that still counts, for chaining the next one. */
export function lastActiveEnd(
  stages: Array<{ status: string; planned_end: string | null; actual_end: string | null }>,
): string | null {
  const relevant = stages
    .filter((s) => s.status !== 'cancelled' && s.status !== 'skipped')
    .map((s) => s.actual_end ?? s.planned_end)
    .filter((d): d is string => !!d)
    .sort();
  return relevant.length ? relevant[relevant.length - 1] : null;
}

/** Inclusive day count, for the Gantt and for showing a stage's length. */
export function dayCount(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.UTC(...(start.split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(end.split('-').map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400000) + 1;
}

// ------------------------------------------------------------------
// Mass balance
// ------------------------------------------------------------------

export interface BalanceParts {
  inputs: number;
  outputs: number;
  losses: number;
}

export function massBalance(p: BalanceParts): number {
  return round3(p.inputs - p.outputs - p.losses);
}

/** Yield as a percentage of input mass, or null when nothing went in. */
export function actualYieldPct(p: BalanceParts): number | null {
  if (!p.inputs) return null;
  return round3((p.outputs / p.inputs) * 100);
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function sumQty(rows: Array<{ actual_qty_g?: number | string | null; qty_g?: number | string | null }>): number {
  return round3(
    rows.reduce((t, r) => t + Number(r.actual_qty_g ?? r.qty_g ?? 0), 0),
  );
}

export function biStage(map: Record<string, Bi>, key: string | null | undefined, locale: PortailLocale): string {
  if (!key) return '—';
  const e = map[key];
  if (!e) return key;
  return locale === 'en' ? e.en : e.fr;
}
