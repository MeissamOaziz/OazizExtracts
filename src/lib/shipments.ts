// Shipments (sh_* tables, migration 0081): one ticket per completed shipping
// work order, so the transport of that PO gets booked. Opened automatically
// when the work order is completed; the booker (permission `shipping`) adds
// carrier, tracking / BOL, boxes or pallet and the label; "label ready"
// notifies the person who ships; "shipped" closes it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { effectivePermissions } from './access';
import { todayLocal } from './production';
import type { Swo } from './production-swo';

export const SHIPMENT_STATUSES = ['to_book', 'booked', 'label_ready', 'shipped', 'cancelled'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['to_book', 'booked', 'label_ready'];

/** Who hears that the label is ready (the person who ships the order). */
export const LABEL_READY_NOTIFY = ['jacobp@oaziz.ca'];
/** From this many boxes on, a shipment defaults to a pallet. */
export const PALLET_FROM_BOXES = 10;

export interface ShipmentBox { no: string | null; size: string | null; weight: string | null }
export interface ShipmentItem { product: string; lot: string | null; quantity: number | null }
export interface Shipment {
  id: string; shipment_no: string; swo_id: string; status: ShipmentStatus;
  customer_name: string | null; customer_po: string | null; ship_to: string | null;
  mode: 'boxes' | 'pallet'; pallets: number | null;
  boxes: ShipmentBox[]; items: ShipmentItem[];
  carrier: string | null; tracking_no: string | null; tracking_url: string | null;
  label_paths: string[]; notes: string | null; version: number;
  created_at: string; booked_at: string | null; label_ready_at: string | null; shipped_at: string | null;
  cancelled_at: string | null; cancel_reason: string | null;
}
export interface ShipmentEvent { id: number; at: string; staff_name: string | null; kind: string; note: string | null; changes: Record<string, any> }

export async function loadShipments(admin: SupabaseClient): Promise<Shipment[]> {
  const { data, error } = await admin.from('sh_shipments').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Shipment[];
}
export async function loadShipment(admin: SupabaseClient, id: string): Promise<Shipment | null> {
  const { data, error } = await admin.from('sh_shipments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Shipment) ?? null;
}
export async function loadShipmentForSwo(admin: SupabaseClient, swoId: string): Promise<Shipment | null> {
  const { data, error } = await admin.from('sh_shipments').select('*').eq('swo_id', swoId).maybeSingle();
  if (error) throw error;
  return (data as Shipment) ?? null;
}
export async function loadShipmentEvents(admin: SupabaseClient, id: string): Promise<ShipmentEvent[]> {
  const { data, error } = await admin.from('sh_events')
    .select('id, at, kind, note, changes, staff:staff ( full_name )')
    .eq('shipment_id', id).order('at', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({ ...e, staff_name: (Array.isArray(e.staff) ? e.staff[0] : e.staff)?.full_name ?? null }));
}
export async function countToBook(admin: SupabaseClient): Promise<number> {
  const { count } = await admin.from('sh_shipments').select('id', { count: 'exact', head: true }).eq('status', 'to_book');
  return count ?? 0;
}

export async function logShipment(admin: SupabaseClient, id: string, staffId: string | null, kind: string, note: string | null, changes: Record<string, unknown> = {}) {
  const { error } = await admin.from('sh_events').insert({ shipment_id: id, staff_id: staffId, kind, note, changes });
  if (error) console.error('[shipments] event insert failed:', error);
}

/** Active staff who can book shipments: they get the "new shipment" notice. */
export async function bookers(admin: SupabaseClient): Promise<Array<{ email: string; full_name: string }>> {
  const { data } = await admin.from('staff').select('email, full_name, portal_role, portal_permission_overrides').eq('is_active', true);
  return (data ?? []).filter((s: any) => s.email && effectivePermissions(s).has('shipping'))
    .map((s: any) => ({ email: s.email, full_name: s.full_name }));
}

// ------------------------------------------------------------ from the SWO

/**
 * The boxes of a work order. Lines that share a box number are one box (its
 * size and weight are written once); without box numbers, each line that has
 * a size or weight is its own box.
 */
export function boxesFromSwo(swo: Swo): ShipmentBox[] {
  const out: ShipmentBox[] = [];
  const byNo = new Map<string, ShipmentBox>();
  for (const l of swo.lines) {
    const no = l.box_no?.trim() || null;
    if (no) {
      const b = byNo.get(no);
      if (b) { b.size ??= l.box_size; b.weight ??= l.box_weight; continue; }
      const nb = { no, size: l.box_size, weight: l.box_weight };
      byNo.set(no, nb); out.push(nb);
    } else if (l.box_size || l.box_weight) {
      out.push({ no: null, size: l.box_size, weight: l.box_weight });
    }
  }
  return out;
}

export function itemsFromSwo(swo: Swo): ShipmentItem[] {
  return swo.lines.map((l) => ({ product: l.product_name, lot: l.lot_no, quantity: l.final_quantity ?? l.po_quantity }));
}

/** The Ontario Cannabis Store ships on a pallet whatever the box count. */
export const isOcs = (customer: string | null | undefined) => /ontario cannabis|\bOCS\b|\bOCRC\b/i.test(customer ?? '');

/** "3 boîtes" / "Palette (12 boîtes)" — for emails and lists. */
export function shipmentSummary(s: Pick<Shipment, 'mode' | 'pallets' | 'boxes'>): string {
  const n = s.boxes.length;
  const boxes = n ? `${n} boîte${n > 1 ? 's' : ''}` : 'boîtes à préciser';
  if (s.mode !== 'pallet') return boxes;
  const p = s.pallets ?? 1;
  return `${p} palette${p > 1 ? 's' : ''}${n ? ` (${boxes})` : ''}`;
}

export function defaultMode(customer: string | null, boxCount: number): 'boxes' | 'pallet' {
  return isOcs(customer) || boxCount >= PALLET_FROM_BOXES ? 'pallet' : 'boxes';
}

// Year-scoped number, EXP-26-0001, compare-and-set (same scheme as the work orders).
async function nextSeq(admin: SupabaseClient, year: number): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: ctr } = await admin.from('sh_counters').select('last').eq('year', year).maybeSingle();
    if (!ctr) {
      const { error } = await admin.from('sh_counters').insert({ year, last: 1 });
      if (!error) return 1;
      continue;
    }
    const { data: upd } = await admin.from('sh_counters')
      .update({ last: ctr.last + 1 }).eq('year', year).eq('last', ctr.last).select('last');
    if (upd && upd.length) return ctr.last + 1;
  }
  throw new Error('shipment counter busy');
}

/**
 * Opens the shipment of a completed work order, or refreshes it from the work
 * order while it is still waiting to be booked (a work order can be corrected
 * and completed again). Returns the shipment and whether it is new.
 */
export async function openShipmentForSwo(admin: SupabaseClient, staffId: string, swo: Swo): Promise<{ id: string; created: boolean }> {
  const boxes = boxesFromSwo(swo);
  const items = itemsFromSwo(swo);
  const existing = await loadShipmentForSwo(admin, swo.id);
  if (existing) {
    if (existing.status === 'to_book') {
      await admin.from('sh_shipments').update({
        customer_name: swo.customer_name, customer_po: swo.customer_po,
        boxes, items, version: existing.version + 1, updated_by: staffId, updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      await logShipment(admin, existing.id, staffId, 'refreshed', null, { boxes: boxes.length, items: items.length });
    }
    return { id: existing.id, created: false };
  }
  const year = Number(todayLocal().slice(0, 4));
  const seq = await nextSeq(admin, year);
  const shipment_no = `EXP-${String(year % 100).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
  const { data, error } = await admin.from('sh_shipments').insert({
    shipment_no, swo_id: swo.id, customer_name: swo.customer_name, customer_po: swo.customer_po,
    ship_to: swo.po_extraction?.ship_to ?? null,
    mode: defaultMode(swo.customer_name, boxes.length),
    boxes, items, created_by: staffId, updated_by: staffId,
  }).select('id').single();
  if (error || !data) throw error ?? new Error('insert failed');
  await logShipment(admin, data.id, staffId, 'created', null, { swo: swo.swo_no, boxes: boxes.length });
  return { id: data.id, created: true };
}
