// Production requests (ps_requests): someone asks the production lead for work —
// a customer PO, an internal restock or a packaging run — with lines and files.
// The production lead plans it as one or more tasks (ps_tasks.request_id).
// A request's status is read from its tasks and its shipping work order (a
// confirmed work order means the order is done); only cancelling is stored.

import type { SupabaseClient } from '@supabase/supabase-js';
import { effectivePermissions } from './access';
import { addDays, todayLocal, type Task } from './production';

export const REQUEST_KINDS = ['customer_po', 'internal', 'packaging'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const isRequestKind = (v: unknown): v is RequestKind => (REQUEST_KINDS as readonly string[]).includes(String(v));

export const REQUEST_UNITS = ['unit', 'g', 'kg'] as const;

/** À planifier → Planifiée → En production → Terminée, or Annulée. */
export type RequestState = 'to_plan' | 'planned' | 'in_production' | 'done' | 'cancelled';
export const REQUEST_STATES: readonly RequestState[] = ['to_plan', 'planned', 'in_production', 'done', 'cancelled'];

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'message/rfc822', 'application/vnd.ms-outlook', 'text/plain',
];
// Browsers often send Outlook .msg and .eml with no type; go by extension then.
const TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  heic: 'image/heic', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', csv: 'text/csv', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  eml: 'message/rfc822', msg: 'application/vnd.ms-outlook', txt: 'text/plain',
};
export const FILE_ACCEPT = Object.keys(TYPE_BY_EXT).map((e) => `.${e}`).join(',');

export interface RequestLine { description: string; quantity: number | null; unit: string }
export interface RequestFile {
  id: string; filename: string; content_type: string | null; size_bytes: number | null;
  uploaded_at: string; uploaded_by_name: string | null; removed_at: string | null;
}
export interface ProdRequest {
  id: string; request_no: string; kind: RequestKind; title: string;
  customer_name: string | null; customer_po: string | null; needed_by: string | null;
  priority: 'normal' | 'rush'; production_type_id: string | null; notes: string | null;
  requested_by: string | null; requested_by_name: string | null;
  created_at: string; updated_at: string;
  cancelled_at: string | null; cancel_reason: string | null;
  lines: RequestLine[];
  files: RequestFile[];
  /** Its shipping work order is confirmed: the order is prepared and leaves. */
  order_completed: boolean;
}
export interface RequestEvent {
  id: number; at: string; staff_name: string | null; kind: string; note: string | null; changes: Record<string, any>;
}

const REQUEST_COLS = 'id, request_no, kind, title, customer_name, customer_po, needed_by, priority, '
  + 'production_type_id, notes, requested_by, created_at, updated_at, cancelled_at, cancel_reason, '
  + 'requester:staff!ps_requests_requested_by_fkey ( full_name ), '
  + 'lines:ps_request_lines ( description, quantity, unit, sort_order ), '
  + 'swo:ps_swos ( status ), '
  + 'files:ps_request_files ( id, filename, content_type, size_bytes, uploaded_at, removed_at, uploader:staff!ps_request_files_uploaded_by_fkey ( full_name ) )';

const one = (v: any) => (Array.isArray(v) ? v[0] : v);
function shape(row: any): ProdRequest {
  return {
    ...row,
    requested_by_name: one(row.requester)?.full_name ?? null,
    order_completed: one(row.swo)?.status === 'completed',
    lines: [...(row.lines ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((l: any) => ({ description: l.description, quantity: l.quantity === null ? null : Number(l.quantity), unit: l.unit })),
    files: [...(row.files ?? [])].sort((a: any, b: any) => a.uploaded_at.localeCompare(b.uploaded_at))
      .map((f: any) => ({ ...f, uploaded_by_name: one(f.uploader)?.full_name ?? null })),
  };
}

export async function loadRequests(admin: SupabaseClient): Promise<ProdRequest[]> {
  const { data, error } = await admin.from('ps_requests').select(REQUEST_COLS).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(shape);
}

export async function loadRequest(admin: SupabaseClient, id: string): Promise<ProdRequest | null> {
  const { data, error } = await admin.from('ps_requests').select(REQUEST_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? shape(data) : null;
}

export async function loadRequestEvents(admin: SupabaseClient, id: string): Promise<RequestEvent[]> {
  const { data, error } = await admin.from('ps_request_events')
    .select('id, at, kind, note, changes, staff:staff ( full_name )')
    .eq('request_id', id).order('at', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({ ...e, staff_name: one(e.staff)?.full_name ?? null }));
}

/** The tasks planned for each request (cancelled tasks don't count). */
export function tasksByRequest(tasks: Task[]): Map<string, Task[]> {
  const out = new Map<string, Task[]>();
  for (const t of tasks) {
    const rid = t.request_id;
    if (!rid || t.status === 'cancelled') continue;
    out.set(rid, [...(out.get(rid) ?? []), t]);
  }
  return out;
}

export function requestState(r: Pick<ProdRequest, 'cancelled_at' | 'order_completed'>, tasks: Task[] | undefined): RequestState {
  if (r.cancelled_at) return 'cancelled';
  if (r.order_completed) return 'done';
  if (!tasks || tasks.length === 0) return 'to_plan';
  if (tasks.every((t) => t.status === 'done')) return 'done';
  if (tasks.some((t) => t.status !== 'planned')) return 'in_production';
  return 'planned';
}

/** Needed-by date passed and the work is not finished. */
export const isOverdue = (r: ProdRequest, state: RequestState) =>
  !!r.needed_by && r.needed_by < todayLocal() && state !== 'done' && state !== 'cancelled';
/** Needed within a week and nothing planned yet. */
export const isSoon = (r: ProdRequest, state: RequestState) =>
  state === 'to_plan' && !!r.needed_by && r.needed_by <= addDays(todayLocal(), 7);

/** How many open requests have no task yet — for the hub tile and the board. */
export async function countToPlan(admin: SupabaseClient): Promise<number> {
  const [{ data: reqs }, { data: tasks }] = await Promise.all([
    admin.from('ps_requests').select('id, swo:ps_swos ( status )').is('cancelled_at', null),
    admin.from('ps_tasks').select('request_id').not('request_id', 'is', null).neq('status', 'cancelled'),
  ]);
  const planned = new Set((tasks ?? []).map((t: any) => t.request_id));
  return (reqs ?? []).filter((r: any) => !planned.has(r.id) && one(r.swo)?.status !== 'completed').length;
}

// ------------------------------------------------------------------ writing

export interface RequestInput {
  kind: RequestKind; title: string; customer_name: string | null; customer_po: string | null;
  needed_by: string | null; priority: 'normal' | 'rush'; production_type_id: string | null; notes: string | null;
  lines: RequestLine[];
}

const FIELDS = ['kind', 'title', 'customer_name', 'customer_po', 'needed_by', 'priority', 'production_type_id', 'notes'] as const;

// Year-scoped number, DEM-26-0001. Compare-and-set on the counter row, so two
// requests saved at the same moment cannot get the same number (request_no is
// unique as well).
async function nextRequestSeq(admin: SupabaseClient, year: number): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: ctr } = await admin.from('ps_request_counters').select('last').eq('year', year).maybeSingle();
    if (!ctr) {
      const { error } = await admin.from('ps_request_counters').insert({ year, last: 1 });
      if (!error) return 1;
      continue;
    }
    const seq = ctr.last + 1;
    const { data: upd } = await admin.from('ps_request_counters')
      .update({ last: seq }).eq('year', year).eq('last', ctr.last).select('last');
    if (upd && upd.length) return seq;
  }
  throw new Error('request counter busy');
}

export async function createRequest(admin: SupabaseClient, staffId: string, v: RequestInput): Promise<{ id: string; request_no: string }> {
  const year = Number(todayLocal().slice(0, 4));
  const seq = await nextRequestSeq(admin, year);
  const request_no = `DEM-${String(year % 100).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;

  const { lines, ...fields } = v;
  const { data, error } = await admin.from('ps_requests')
    .insert({ ...fields, request_no, requested_by: staffId, updated_by: staffId })
    .select('id').single();
  if (error || !data) throw error ?? new Error('insert failed');
  if (lines.length) {
    const { error: lErr } = await admin.from('ps_request_lines')
      .insert(lines.map((l, i) => ({ ...l, request_id: data.id, sort_order: i + 1 })));
    if (lErr) throw lErr;
  }
  await logRequest(admin, data.id, staffId, 'created', null, { ...fields, lines });
  return { id: data.id, request_no };
}

/** Saves the fields that changed and logs them; returns false when nothing did. */
export async function updateRequest(admin: SupabaseClient, staffId: string, id: string, v: RequestInput): Promise<boolean> {
  const cur = await loadRequest(admin, id);
  if (!cur) throw new Error('NOT_FOUND');
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of FIELDS) {
    const a = (cur as any)[f] ?? null; const b = (v as any)[f] ?? null;
    if (a !== b) changes[f] = { from: a, to: b };
  }
  const norm = (ls: RequestLine[]) => JSON.stringify(ls.map((l) => [l.description, l.quantity, l.unit]));
  if (norm(cur.lines) !== norm(v.lines)) changes.lines = { from: cur.lines, to: v.lines };
  if (Object.keys(changes).length === 0) return false;

  const { lines, ...fields } = v;
  const { error } = await admin.from('ps_requests')
    .update({ ...fields, updated_by: staffId, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  if (changes.lines) {
    await admin.from('ps_request_lines').delete().eq('request_id', id);
    if (lines.length) {
      const { error: lErr } = await admin.from('ps_request_lines')
        .insert(lines.map((l, i) => ({ ...l, request_id: id, sort_order: i + 1 })));
      if (lErr) throw lErr;
    }
  }
  await logRequest(admin, id, staffId, 'updated', null, changes);
  return true;
}

export async function logRequest(
  admin: SupabaseClient, requestId: string, staffId: string, kind: string, note: string | null, changes: Record<string, unknown>,
) {
  const { error } = await admin.from('ps_request_events').insert({ request_id: requestId, staff_id: staffId, kind, note, changes });
  if (error) console.error('[production] request event insert failed:', error);
}

/** Uploads the files sent with a form; returns how many were stored and which were refused. */
export async function storeFiles(
  admin: SupabaseClient, requestId: string, staffId: string, files: File[],
): Promise<{ stored: number; refused: string[] }> {
  let stored = 0; const refused: string[] = [];
  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) continue;
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    const type = ALLOWED_TYPES.includes(file.type) ? file.type : TYPE_BY_EXT[ext];
    if (!type || file.size > MAX_FILE_BYTES) { refused.push(file.name); continue; }
    const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `requests/${requestId}/${Date.now()}_${safe}`;
    const { error: upErr } = await admin.storage.from('production')
      .upload(path, await file.arrayBuffer(), { contentType: type, upsert: false });
    if (upErr) { console.error('[production] upload failed:', upErr); refused.push(file.name); continue; }
    const { error } = await admin.from('ps_request_files').insert({
      request_id: requestId, storage_path: path, filename: file.name, content_type: type,
      size_bytes: file.size, uploaded_by: staffId,
    });
    if (error) { console.error('[production] file row failed:', error); refused.push(file.name); continue; }
    await logRequest(admin, requestId, staffId, 'file_added', null, { filename: file.name, size_bytes: file.size });
    stored++;
  }
  return { stored, refused };
}

/** Everyone who plans production, i.e. who should hear about a new request. */
export async function plannerRecipients(admin: SupabaseClient): Promise<Array<{ id: string; email: string; full_name: string }>> {
  const { data } = await admin.from('staff')
    .select('id, email, full_name, portal_role, portal_permission_overrides').eq('is_active', true);
  return (data ?? []).filter((s: any) => effectivePermissions(s).has('prod_schedule'));
}

/** "PO 4521", without doubling a number already written "PO-4521". */
export const poLabel = (po: string) => (/^p\.?o\b/i.test(po.trim()) ? po.trim() : `PO ${po.trim()}`);

export function fmtBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
