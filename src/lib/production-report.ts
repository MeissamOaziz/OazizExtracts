// Production scheduling — reading the change log: human-readable change lines
// (task history, reports, CSV) and the period report itself.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortailLocale } from './portail-i18n';
import type { ProductionDict } from '../i18n/portail/production';
import {
  loadCatalog, loadEvents, loadTasks, spanOf, slipDays, fmtDate, fmtQty, roomName, typeName, zonedDayStart, addDays,
  type ProdType, type Room, type Task, type TaskEvent, type TaskInput,
} from './production';

export type ProdT = (key: keyof ProductionDict) => string;

export interface DescribeCtx {
  T: ProdT;
  locale: PortailLocale;
  rooms: Map<string, Room>;
  types: Map<string, ProdType>;
}

const FIELD_ORDER = [
  'status', 'production_type_id', 'room_id', 'start_date', 'end_date', 'actual_start_date',
  'actual_end_date', 'priority', 'groweriq_lot_id', 'groweriq_batch_id', 'inputs', 'notes',
] as const;

export function describeInputs(inputs: TaskInput[] | null | undefined, ctx: DescribeCtx): string {
  if (!inputs || inputs.length === 0) return ctx.T('ev.empty');
  return inputs.map((i) => {
    const qty = fmtQty(i.quantity === null ? null : Number(i.quantity), i.unit, ctx.locale,
      (u) => ctx.T(`unit.${u}` as keyof ProductionDict));
    return [i.material, i.groweriq_lot_id ? `(${i.groweriq_lot_id})` : '', qty].filter(Boolean).join(' ');
  }).join(' · ');
}

function describeValue(field: string, v: unknown, ctx: DescribeCtx): string {
  if (v === null || v === undefined || v === '') return ctx.T('ev.empty');
  switch (field) {
    case 'room_id': return roomName(ctx.rooms.get(String(v)), ctx.locale);
    case 'production_type_id': return typeName(ctx.types.get(String(v)), ctx.locale);
    case 'status': return ctx.T(`status.${v}` as keyof ProductionDict);
    case 'priority': return ctx.T(`priority.${v}` as keyof ProductionDict);
    case 'start_date': case 'end_date': case 'actual_start_date': case 'actual_end_date':
      return fmtDate(String(v), ctx.locale);
    case 'inputs': return describeInputs(v as TaskInput[], ctx);
    default: return String(v);
  }
}

/** One line per changed field: "Fin prévue : 17 oct. 2026 → 19 oct. 2026". */
export function describeChanges(ev: TaskEvent, ctx: DescribeCtx): string[] {
  const label = (f: string) => ctx.T(`field.${f}` as keyof ProductionDict);
  const c = ev.changes as Record<string, any>;
  if (ev.kind === 'created') {
    return FIELD_ORDER
      .filter((f) => f in c && f !== 'status' && !(f === 'priority' && c[f] === 'normal'))
      .filter((f) => !(c[f] === null || (Array.isArray(c[f]) && c[f].length === 0)))
      .map((f) => `${label(f)}${colon(ctx.locale)}${describeValue(f, c[f], ctx)}`);
  }
  return FIELD_ORDER.filter((f) => f in c).map((f) =>
    `${label(f)}${colon(ctx.locale)}${describeValue(f, c[f]?.from, ctx)} → ${describeValue(f, c[f]?.to, ctx)}`);
}

/** "Fin prévue : …" in French, "Projected end: …" in English. */
export const colon = (locale: PortailLocale) => (locale === 'fr' ? ' : ' : ': ');

export const signedDays = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

// ------------------------------------------------------------------- report

export interface ReportParams { from: string; to: string; roomId: string | null; typeId: string | null }

export interface ReasonRow {
  reason: string; events: number; tasks: number; later: number; earlier: number; roomChanges: number;
}

export interface VarianceRow { task: Task; slip: number; moves: number; origin: string | null }

export async function loadReport(admin: SupabaseClient, p: ReportParams) {
  const [{ rooms, types }, tasks, allEvents] = await Promise.all([
    loadCatalog(admin),
    loadTasks(admin, { includeCancelled: true }),
    loadEvents(admin, {}),
  ]);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const keep = (t: Task | undefined) =>
    !!t && (!p.roomId || t.room_id === p.roomId) && (!p.typeId || t.production_type_id === p.typeId);

  // Change log of the period (event dates are Montréal days, see loadEvents).
  const lo = zonedDayStart(p.from); const hi = zonedDayStart(addDays(p.to, 1));
  const events = allEvents.filter((e) => e.at >= lo && e.at < hi && keep(taskById.get(e.task_id)));

  const created = events.filter((e) => e.kind === 'created');
  const unplanned = created.filter((e) => e.reason_code === 'added_last_minute' || e.reason_code === 'rush_order');
  const reschedules = events.filter((e) => e.kind === 'rescheduled');
  const later = events.reduce((s, e) => s + Math.max(0, e.end_shift_days ?? 0), 0);
  const earlier = events.reduce((s, e) => s + Math.max(0, -(e.end_shift_days ?? 0)), 0);

  const doneInPeriod = tasks.filter((t) => keep(t) && t.status === 'done' && t.actual_end_date
    && t.actual_end_date >= p.from && t.actual_end_date <= p.to);
  const doneLate = doneInPeriod.filter((t) => t.actual_end_date! > t.original_end_date);

  const byReason = new Map<string, ReasonRow & { taskSet: Set<string> }>();
  for (const e of events) {
    if (e.kind !== 'created' && e.kind !== 'rescheduled' && !e.reason_code) continue;
    const key = e.reason_code ?? 'none';
    const row = byReason.get(key) ?? { reason: key, events: 0, tasks: 0, later: 0, earlier: 0, roomChanges: 0, taskSet: new Set() };
    row.events++;
    row.taskSet.add(e.task_id);
    row.later += Math.max(0, e.end_shift_days ?? 0);
    row.earlier += Math.max(0, -(e.end_shift_days ?? 0));
    if (e.room_changed) row.roomChanges++;
    byReason.set(key, row);
  }
  const reasons: ReasonRow[] = [...byReason.values()]
    .map(({ taskSet, ...r }) => ({ ...r, tasks: taskSet.size }))
    .sort((a, b) => b.events - a.events);

  // Every task that occupied a room during the period, with its whole history.
  const movesByTask = new Map<string, number>();
  const originByTask = new Map<string, string | null>();
  for (const e of allEvents) {
    if (e.kind === 'rescheduled') movesByTask.set(e.task_id, (movesByTask.get(e.task_id) ?? 0) + 1);
    if (e.kind === 'created') originByTask.set(e.task_id, e.reason_code);
  }
  const variance: VarianceRow[] = tasks
    .filter((t) => keep(t) && t.status !== 'cancelled')
    .filter((t) => { const s = spanOf(t); return s.start <= p.to && s.end >= p.from; })
    .map((t) => ({ task: t, slip: slipDays(t), moves: movesByTask.get(t.id) ?? 0, origin: originByTask.get(t.id) ?? null }))
    .sort((a, b) => b.slip - a.slip || a.task.start_date.localeCompare(b.task.start_date));

  return {
    rooms, types, taskById, events, reasons, variance,
    kpi: {
      created: created.length,
      unplanned: unplanned.length,
      reschedules: reschedules.length,
      rescheduledTasks: new Set(reschedules.map((e) => e.task_id)).size,
      later, earlier,
      done: doneInPeriod.length,
      doneLate: doneLate.length,
    },
  };
}

export function defaultReportPeriod(today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 2, Number(today.slice(8, 10)) + 1));
  return { from: back.toISOString().slice(0, 10), to: today };
}
