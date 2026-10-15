// Production scheduling — a standalone module (tables ps_*), separate from the
// Atelier. GrowerIQ remains the system of record for lots and batches; a task
// only carries their IDs. Writes go through the ps_save_task() function, which
// logs every change to ps_task_events (see migration 0072).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortailLocale } from './portail-i18n';

export const STATUSES = ['planned', 'in_progress', 'on_hold', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof STATUSES)[number];
export const OPEN_STATUSES: readonly TaskStatus[] = ['planned', 'in_progress', 'on_hold'];

// Why a task was added: the first three. Why a plan moved: the rest.
export const CREATE_REASONS = ['planned', 'added_last_minute', 'rush_order'] as const;
export const CHANGE_REASONS = [
  'rush_order', 'added_last_minute', 'accelerated', 'slowed', 'material_delay', 'equipment',
  'staffing', 'qa_hold', 'customer_change', 'estimate_correction', 'other',
] as const;
export const ALL_REASONS = [
  'planned', 'added_last_minute', 'rush_order', 'accelerated', 'slowed', 'material_delay', 'equipment',
  'staffing', 'qa_hold', 'customer_change', 'estimate_correction', 'other',
] as const;
export type ReasonCode = (typeof ALL_REASONS)[number];
export const isReason = (v: unknown): v is ReasonCode => (ALL_REASONS as readonly string[]).includes(String(v));

export const UNITS = ['g', 'kg', 'unit'] as const;
export type Unit = (typeof UNITS)[number];

// Codes raised by ps_save_task(), plus the API's own; each has an `err.*` message.
export const SAVE_ERRORS = [
  'NOT_FOUND', 'VERSION_CONFLICT', 'REASON_REQUIRED', 'BAD_REASON', 'DATES_ORDER',
  'ACTUAL_DATES_ORDER', 'MISSING_FIELDS', 'BAD_INPUT', 'UNKNOWN',
] as const;
export type SaveError = (typeof SAVE_ERRORS)[number];
export function saveErrorCode(e: unknown): SaveError {
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  return (SAVE_ERRORS as readonly string[]).find((c) => msg.includes(c)) as SaveError ?? 'UNKNOWN';
}

export interface Room {
  id: string; code: string; name_fr: string; name_en: string; colour: string;
  allows_concurrent: boolean; sort_order: number; is_active: boolean;
}
export interface ProdType {
  id: string; code: string; name_fr: string; name_en: string; sort_order: number; is_active: boolean;
}
export interface TaskInput {
  material: string; groweriq_lot_id: string | null; quantity: number | null; unit: Unit;
  /** How much was really used, entered when the work is done. */
  actual_quantity: number | null;
}
export interface TaskOutput {
  product: string; is_byproduct: boolean; expected_yield_pct: number | null;
  actual_quantity: number | null; unit: Unit;
}
/** Default outputs of a production type (Settings), copied onto new tasks. */
export interface TypeOutput {
  id: string; production_type_id: string; sort_order: number; product: string;
  is_byproduct: boolean; default_yield_pct: number | null;
}
export interface Task {
  id: string; task_no: string; production_type_id: string; room_id: string;
  status: TaskStatus; priority: 'normal' | 'rush';
  start_date: string; end_date: string;
  original_start_date: string; original_end_date: string;
  actual_start_date: string | null; actual_end_date: string | null;
  groweriq_lot_id: string | null; groweriq_batch_id: string | null; notes: string | null;
  request_id: string | null;
  version: number; created_at: string; updated_at: string;
  inputs: TaskInput[];
  outputs: TaskOutput[];
}
export interface TaskEvent {
  id: number; task_id: string; at: string; staff_id: string | null; staff_name: string | null;
  kind: 'created' | 'rescheduled' | 'status' | 'updated';
  reason_code: ReasonCode | null; reason_note: string | null;
  changes: Record<string, unknown>;
  start_shift_days: number | null; end_shift_days: number | null; room_changed: boolean;
}

const TASK_COLS = 'id, task_no, production_type_id, room_id, status, priority, start_date, end_date, '
  + 'original_start_date, original_end_date, actual_start_date, actual_end_date, groweriq_lot_id, '
  + 'groweriq_batch_id, notes, request_id, version, created_at, updated_at, '
  + 'inputs:ps_task_inputs ( material, groweriq_lot_id, quantity, actual_quantity, unit, sort_order ), '
  + 'outputs:ps_task_outputs ( product, is_byproduct, expected_yield_pct, actual_quantity, unit, sort_order )';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function shapeTask(row: any): Task {
  const bySort = (a: any, b: any) => a.sort_order - b.sort_order;
  const inputs = [...(row.inputs ?? [])].sort(bySort).map((i: any) => ({
    material: i.material, groweriq_lot_id: i.groweriq_lot_id,
    quantity: num(i.quantity), actual_quantity: num(i.actual_quantity), unit: i.unit,
  }));
  const outputs = [...(row.outputs ?? [])].sort(bySort).map((o: any) => ({
    product: o.product, is_byproduct: !!o.is_byproduct, expected_yield_pct: num(o.expected_yield_pct),
    actual_quantity: num(o.actual_quantity), unit: o.unit,
  }));
  return { ...row, inputs, outputs };
}

export async function loadTypeOutputs(admin: SupabaseClient): Promise<TypeOutput[]> {
  const { data, error } = await admin.from('ps_type_outputs').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, default_yield_pct: num(r.default_yield_pct) }));
}

// ----------------------------------------------------------------------- yield
//
// Yields are mass ratios: output grams over input grams. Lines counted in
// units cannot be weighed, so they are left out of the mass.

/** Grams, or null for a quantity in units (or no quantity). */
export function grams(q: number | null, unit: string): number | null {
  if (q === null || unit === 'unit') return null;
  return unit === 'kg' ? q * 1000 : q;
}

/** Planned input mass (what the plan expected to use). */
export const plannedInputG = (t: Pick<Task, 'inputs'>) =>
  t.inputs.reduce((s, i) => s + (grams(i.quantity, i.unit) ?? 0), 0);

/** Mass really used: the actual quantity where entered, the planned one otherwise. */
export function actualInputG(t: Pick<Task, 'inputs'>): number {
  return t.inputs.reduce((s, i) => s + (grams(i.actual_quantity ?? i.quantity, i.unit) ?? 0), 0);
}

/** True once every input line has its used quantity and every output its result. */
export const yieldComplete = (t: Pick<Task, 'inputs' | 'outputs'>) =>
  t.outputs.length > 0 && t.outputs.every((o) => o.actual_quantity !== null)
  && t.inputs.every((i) => i.actual_quantity !== null);

/** Expected output in grams for one output line, from the planned inputs. */
export function expectedOutputG(t: Pick<Task, 'inputs'>, o: TaskOutput): number | null {
  const mass = plannedInputG(t);
  return o.expected_yield_pct === null || mass === 0 ? null : (mass * o.expected_yield_pct) / 100;
}

/** Actual yield % of one output line, or null until both sides are known. */
export function actualYieldPct(t: Pick<Task, 'inputs'>, o: TaskOutput): number | null {
  const out = grams(o.actual_quantity, o.unit);
  const mass = actualInputG(t);
  return out === null || mass === 0 ? null : (out / mass) * 100;
}

export function fmtPct(v: number | null, locale: 'fr' | 'en'): string {
  if (v === null) return '—';
  const s = v.toLocaleString(locale === 'en' ? 'en-CA' : 'fr-CA', { maximumFractionDigits: 1 });
  return locale === 'en' ? `${s}%` : `${s}\u00a0%`;
}

/** "1 234,5 g", switching to kg from 10 kg so big batches stay readable. */
export function fmtMass(g: number | null, locale: 'fr' | 'en'): string {
  if (g === null) return '—';
  const l = locale === 'en' ? 'en-CA' : 'fr-CA';
  return g >= 10000
    ? `${(g / 1000).toLocaleString(l, { maximumFractionDigits: 2 })} kg`
    : `${g.toLocaleString(l, { maximumFractionDigits: 1 })} g`;
}

// --------------------------------------------------------------------- loading

export async function loadCatalog(admin: SupabaseClient) {
  const [rooms, types] = await Promise.all([
    admin.from('ps_rooms').select('*').order('sort_order').order('code'),
    admin.from('ps_production_types').select('*').order('sort_order').order('name_fr'),
  ]);
  if (rooms.error) throw rooms.error;
  if (types.error) throw types.error;
  return { rooms: (rooms.data ?? []) as Room[], types: (types.data ?? []) as ProdType[] };
}

/** Tasks whose span (planned or actual) touches [from, to]; all tasks when no window. */
export async function loadTasks(
  admin: SupabaseClient,
  opts: { from?: string; to?: string; includeCancelled?: boolean } = {},
): Promise<Task[]> {
  let q = admin.from('ps_tasks').select(TASK_COLS).order('start_date').order('task_no');
  if (opts.to) q = q.lte('start_date', opts.to);
  if (!opts.includeCancelled) q = q.neq('status', 'cancelled');
  const { data, error } = await q;
  if (error) throw error;
  const tasks = (data ?? []).map(shapeTask);
  if (!opts.from) return tasks;
  // The span check needs the actual dates too, so it is done here, not in SQL.
  return tasks.filter((t) => spanOf(t).end >= opts.from! && spanOf(t).start <= (opts.to ?? '9999-12-31'));
}

export async function loadTask(admin: SupabaseClient, id: string): Promise<Task | null> {
  const { data, error } = await admin.from('ps_tasks').select(TASK_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? shapeTask(data) : null;
}

export async function loadEvents(
  admin: SupabaseClient,
  opts: { taskId?: string; from?: string; to?: string },
): Promise<TaskEvent[]> {
  let q = admin.from('ps_task_events')
    .select('id, task_id, at, staff_id, kind, reason_code, reason_note, changes, start_shift_days, end_shift_days, room_changed, staff:staff ( full_name )')
    .order('at', { ascending: false }).order('id', { ascending: false });
  if (opts.taskId) q = q.eq('task_id', opts.taskId);
  // Period bounds are calendar days in Montréal.
  if (opts.from) q = q.gte('at', zonedDayStart(opts.from));
  if (opts.to) q = q.lt('at', zonedDayStart(addDays(opts.to, 1)));
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return (data ?? []).map((e: any) => {
    const staff = Array.isArray(e.staff) ? e.staff[0] : e.staff;
    return { ...e, staff_name: staff?.full_name ?? null };
  });
}

// ----------------------------------------------------------------------- dates

export const TZ = 'America/Toronto';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && ISO.test(v);

/** Today's calendar date in Montréal. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/** Midnight of a Montréal calendar day, as an ISO instant. */
export function zonedDayStart(iso: string): string {
  // Offset at noon that day (EST/EDT), applied to midnight. DST switches at 2 a.m.,
  // so the noon offset is the midnight offset too except on the switch day itself,
  // where it is off by an hour at most — fine for a day-level report filter.
  const noon = new Date(`${iso}T12:00:00Z`);
  const local = new Date(noon.toLocaleString('en-US', { timeZone: TZ }));
  const offsetMin = Math.round((noon.getTime() - local.getTime()) / 60000);
  return new Date(Date.parse(`${iso}T00:00:00Z`) + offsetMin * 60000).toISOString();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Signed difference b − a in days. */
export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number); const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/** Inclusive length in days. */
export const dayCount = (start: string, end: string) => daysBetween(start, end) + 1;

export function mondayOf(iso: string): string {
  const dow = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const loc = (l: PortailLocale) => (l === 'en' ? 'en-CA' : 'fr-CA');

/** "mar. 14 oct." / "Tue, Oct 14" — the year only when it is not this year. */
export function fmtDay(iso: string | null | undefined, locale: PortailLocale, withYear = false): string {
  if (!iso) return '—';
  const sameYear = iso.slice(0, 4) === todayLocal().slice(0, 4);
  return asDate(iso).toLocaleDateString(loc(locale), {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
    ...(withYear || !sameYear ? { year: 'numeric' } : {}),
  });
}

/** "14 oct. 2026" without the weekday, for tables. */
export function fmtDate(iso: string | null | undefined, locale: PortailLocale): string {
  if (!iso) return '—';
  return asDate(iso).toLocaleDateString(loc(locale), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(ts: string, locale: PortailLocale): string {
  return new Date(ts).toLocaleString(loc(locale), {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function monthLabel(iso: string, locale: PortailLocale): string {
  const s = asDate(iso).toLocaleDateString(loc(locale), { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayNames(locale: PortailLocale): string[] {
  return locale === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
}

// ----------------------------------------------------------------- task logic

/**
 * The days a task actually occupies its room: from the real start when it has
 * started, to the real end once done, otherwise to the projected end (or today,
 * if it is running past it).
 */
export function spanOf(t: Pick<Task, 'start_date' | 'end_date' | 'actual_start_date' | 'actual_end_date' | 'status'>): { start: string; end: string } {
  const start = t.actual_start_date ?? t.start_date;
  let end = t.end_date;
  if (t.status === 'done' && t.actual_end_date) end = t.actual_end_date;
  else if (t.status === 'in_progress' || t.status === 'on_hold') end = t.end_date < todayLocal() ? todayLocal() : t.end_date;
  return { start, end: end < start ? start : end };
}

export const isOn = (t: Task, day: string) => { const s = spanOf(t); return s.start <= day && s.end >= day; };

/** Open task whose projected end is already past. */
export const isLate = (t: Task) => OPEN_STATUSES.includes(t.status) && t.end_date < todayLocal();

/** Projected (or real) finish minus the first-planned finish, in days. Positive = later. */
export function slipDays(t: Task): number {
  const finish = t.status === 'done' && t.actual_end_date ? t.actual_end_date : t.end_date;
  return daysBetween(t.original_end_date, finish);
}

/** Missing info the production lead still has to fill in. */
export function missingInfo(t: Task): Array<'lot' | 'batch' | 'inputs'> {
  const out: Array<'lot' | 'batch' | 'inputs'> = [];
  if (!t.groweriq_lot_id) out.push('lot');
  if (!t.groweriq_batch_id) out.push('batch');
  if (t.inputs.length === 0) out.push('inputs');
  return out;
}

/** Task ids sharing a one-at-a-time room over overlapping days. */
export function roomConflicts(tasks: Task[], rooms: Room[]): Map<string, string[]> {
  const exclusive = new Set(rooms.filter((r) => !r.allows_concurrent).map((r) => r.id));
  const live = tasks.filter((t) => t.status !== 'cancelled' && t.status !== 'done' && exclusive.has(t.room_id));
  const out = new Map<string, string[]>();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      if (a.room_id !== b.room_id) continue;
      const sa = spanOf(a); const sb = spanOf(b);
      if (sa.start <= sb.end && sb.start <= sa.end) {
        out.set(a.id, [...(out.get(a.id) ?? []), b.task_no]);
        out.set(b.id, [...(out.get(b.id) ?? []), a.task_no]);
      }
    }
  }
  return out;
}

export const roomName = (r: Room | undefined, l: PortailLocale) => (r ? (l === 'en' ? r.name_en : r.name_fr) : '—');
export const typeName = (p: ProdType | undefined, l: PortailLocale) => (p ? (l === 'en' ? p.name_en : p.name_fr) : '—');

export function fmtQty(q: number | null, unit: string, locale: PortailLocale, unitLabel: (u: string) => string): string {
  if (q === null) return '';
  return `${q.toLocaleString(loc(locale), { maximumFractionDigits: 3 })} ${unitLabel(unit)}`;
}

/** Parses "1 200,5" or "1200.5"; null for blank, NaN for garbage. */
export function parseQty(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (s === '') return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
