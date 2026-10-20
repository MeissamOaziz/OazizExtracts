import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../lib/supabase';
import { sendShipmentLabelReady } from '../../../lib/email';
import type { Permission } from '../../../lib/access';
import {
  LABEL_READY_NOTIFY, loadShipment, logShipment, shipmentSummary, type Shipment, type ShipmentBox,
} from '../../../lib/shipments';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const orNull = (v: string) => (v === '' ? null : v);
const siteUrl = () => (import.meta.env.PORTAL_SITE_URL ?? 'https://www.oaziz.ca').replace(/\/$/, '');

type Fields = Pick<Shipment, 'ship_to' | 'carrier' | 'tracking_no' | 'tracking_url' | 'mode' | 'pallets' | 'notes' | 'boxes'>;
const FIELD_KEYS: Array<keyof Fields> = ['ship_to', 'carrier', 'tracking_no', 'tracking_url', 'mode', 'pallets', 'notes', 'boxes'];

/** The booking form as posted; a string is an error code. */
function readFields(form: FormData): Fields | string {
  const url = str(form, 'tracking_url');
  if (url && !/^https?:\/\/\S+$/i.test(url)) return 'url';
  const mode = str(form, 'mode') === 'pallet' ? 'pallet' : 'boxes';
  const p = str(form, 'pallets');
  const pallets = mode === 'pallet' ? (p === '' ? 1 : Number(p)) : null;
  if (pallets !== null && (!Number.isInteger(pallets) || pallets < 1 || pallets > 99)) return 'pallets';
  const nos = form.getAll('b_no').map(String); const sizes = form.getAll('b_size').map(String); const weights = form.getAll('b_weight').map(String);
  const boxes: ShipmentBox[] = [];
  for (let i = 0; i < nos.length; i++) {
    const b = { no: orNull(nos[i].trim()), size: orNull((sizes[i] ?? '').trim()), weight: orNull((weights[i] ?? '').trim()) };
    if (b.no || b.size || b.weight) boxes.push(b);
  }
  return {
    ship_to: orNull(str(form, 'ship_to')), carrier: orNull(str(form, 'carrier')), tracking_no: orNull(str(form, 'tracking_no')),
    tracking_url: orNull(url), mode, pallets, notes: orNull(str(form, 'notes')), boxes,
  };
}

// Shipment ticket actions. Booking (save, label ready, cancel, reopen) needs
// the `shipping` permission; whoever can follow shipments can mark one shipped.
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const perms: ReadonlySet<Permission> = locals.access?.perms ?? new Set<Permission>();
  const admin = getAdminClient();
  const form = await request.formData();
  const action = str(form, '_action');
  const id = str(form, 'id');
  if (!UUID.test(id)) return redirect('/portail/envois', 303);
  const page = (q: string, hash = '') => redirect(`/portail/envois/${id}?${q}${hash}`, 303);
  const cur = await loadShipment(admin, id);
  if (!cur) return redirect('/portail/envois', 303);
  const booker = perms.has('shipping');
  if (action !== 'shipped' && !booker) return page('error=forbidden');
  const now = new Date().toISOString();

  // ------------------------------------------------- save / label ready
  if (action === 'save' || action === 'label_ready') {
    if (Number(str(form, 'version')) !== cur.version) return page('error=conflict');
    if (cur.status === 'cancelled' || cur.status === 'shipped') return page('error=state');
    const f = readFields(form);
    if (typeof f === 'string') return page(`error=${f}`, '#reserver');

    // New label files are added to the ones already there.
    const files = form.getAll('labels').filter((x): x is File => x instanceof File && x.size > 0);
    if (files.some((x) => !LABEL_TYPES.includes(x.type) || x.size > 20 * 1024 * 1024)) return page('error=files', '#reserver');
    const added: string[] = [];
    for (const file of files) {
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
      const path = `shipments/${id}/${Date.now()}_${added.length + 1}.${ext}`;
      const { error } = await admin.storage.from('production').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (error) { console.error('[shipments] label upload failed:', error); return page('error=unknown', '#reserver'); }
      added.push(path);
    }
    const labelPaths = [...cur.label_paths, ...added];

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of FIELD_KEYS) {
      if (JSON.stringify(cur[k] ?? null) !== JSON.stringify(f[k] ?? null)) changes[k] = { from: cur[k] ?? null, to: f[k] ?? null };
    }
    // "Label ready" without a label or tracking number still keeps what was
    // typed: it is saved, and the page says what is missing.
    const missing = action === 'label_ready' ? (!labelPaths.length ? 'label' : !f.tracking_no ? 'tracking' : null) : null;
    const labelReady = action === 'label_ready' && !missing;
    // Booked once a carrier or a tracking number is on it.
    const nowBooked = cur.status === 'to_book' && (!!f.carrier || !!f.tracking_no);
    const status = labelReady ? 'label_ready' : nowBooked ? 'booked' : cur.status;
    if (!Object.keys(changes).length && !added.length && status === cur.status && !labelReady) {
      return missing ? page(`error=${missing}`, '#reserver') : page('ok=nochange');
    }

    const { data: upd, error } = await admin.from('sh_shipments').update({
      ...f, label_paths: labelPaths, status,
      ...(status !== cur.status && status === 'booked' ? { booked_at: now, booked_by: staff.id } : {}),
      ...(labelReady ? { label_ready_at: now, label_ready_by: staff.id, ...(cur.booked_at ? {} : { booked_at: now, booked_by: staff.id }) } : {}),
      version: cur.version + 1, updated_by: staff.id, updated_at: now,
    }).eq('id', id).eq('version', cur.version).select('id');
    if (error) { console.error('[shipments] save failed:', error); return page('error=unknown', '#reserver'); }
    if (!upd?.length) return page('error=conflict');

    if (Object.keys(changes).length) await logShipment(admin, id, staff.id, nowBooked ? 'booked' : 'updated', null, changes);
    else if (nowBooked) await logShipment(admin, id, staff.id, 'booked', null, {});
    if (added.length) await logShipment(admin, id, staff.id, 'label_added', null, { files: added.length });
    if (!labelReady) return missing ? page(`ok=saved&error=${missing}`, '#reserver') : page('ok=saved');

    // Label ready: the person who ships gets the label(s) and the tracking link.
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    for (const [i, p] of labelPaths.entries()) {
      const { data: blob } = await admin.storage.from('production').download(p);
      if (blob) attachments.push({ filename: `${cur.shipment_no}_etiquette_${i + 1}.${p.split('.').pop()}`, content: Buffer.from(await blob.arrayBuffer()) });
    }
    const after = { ...cur, ...f };
    await sendShipmentLabelReady({
      toEmails: LABEL_READY_NOTIFY, shipmentNo: cur.shipment_no, customer: cur.customer_name, customerPo: cur.customer_po,
      shipTo: f.ship_to, summary: shipmentSummary(after), by: staff.full_name, shipmentUrl: `${siteUrl()}/portail/envois/${id}`,
      carrier: f.carrier, trackingNo: f.tracking_no, trackingUrl: f.tracking_url, attachments,
    });
    await logShipment(admin, id, staff.id, 'label_ready', null, { to: LABEL_READY_NOTIFY });
    return page('ok=label_ready');
  }

  // --------------------------------------------------------------- shipped
  if (action === 'shipped') {
    if (!['booked', 'label_ready'].includes(cur.status)) return page('error=state');
    const { error } = await admin.from('sh_shipments').update({
      status: 'shipped', shipped_at: now, shipped_by: staff.id, version: cur.version + 1, updated_by: staff.id, updated_at: now,
    }).eq('id', id).eq('version', cur.version);
    if (error) { console.error('[shipments] shipped failed:', error); return page('error=unknown'); }
    await logShipment(admin, id, staff.id, 'shipped', orNull(str(form, 'note')));
    return page('ok=shipped');
  }

  // --------------------------------------------------------- cancel / reopen
  if (action === 'cancel') {
    const reason = str(form, 'reason');
    if (!reason) return page('error=reason');
    if (cur.status === 'cancelled') return page('error=state');
    await admin.from('sh_shipments').update({ status: 'cancelled', cancelled_at: now, cancel_reason: reason,
      version: cur.version + 1, updated_by: staff.id, updated_at: now }).eq('id', id);
    await logShipment(admin, id, staff.id, 'cancelled', reason);
    return page('ok=cancelled');
  }
  if (action === 'reopen') {
    if (cur.status !== 'cancelled' && cur.status !== 'shipped') return page('error=state');
    const back = cur.label_ready_at ? 'label_ready' : cur.booked_at ? 'booked' : 'to_book';
    await admin.from('sh_shipments').update({ status: back, cancelled_at: null, cancel_reason: null, shipped_at: null, shipped_by: null,
      version: cur.version + 1, updated_by: staff.id, updated_at: now }).eq('id', id);
    await logShipment(admin, id, staff.id, 'reopened', null, { status: back });
    return page('ok=reopened');
  }

  return page('');
};
