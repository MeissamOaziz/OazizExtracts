import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { sendShipmentToBook, sendSwoCompletedCopy, sendSwoToProduction } from '../../../../lib/email';
import { bookers, loadShipment, openShipmentForSwo, shipmentSummary } from '../../../../lib/shipments';
import { buildPackingList, packingListFilename } from '../../../../lib/packing-list';
import { isIsoDate, parseQty } from '../../../../lib/production';
import { loadRequest } from '../../../../lib/production-requests';
import {
  READABLE_TYPES, SWO_LINE_FIELDS, buildSwoPdf, createSwo, isNumericLineField, loadSwo, loadSwoForRequest, logSwo,
  mergeSheet, readCompletedSheet, readPurchaseOrder, readingAvailable, saveSwo,
  type PoExtraction, type SwoHeader, type SwoLine,
} from '../../../../lib/production-swo';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const orNull = (v: string) => (v === '' ? null : v);
const siteUrl = () => (import.meta.env.PORTAL_SITE_URL ?? 'https://www.oaziz.ca').replace(/\/$/, '');

/** Header and lines as posted by the work order form. */
function readForm(form: FormData): { header: SwoHeader; lines: SwoLine[] } | 'BAD_QTY' {
  const date = (k: string) => (isIsoDate(str(form, k)) ? str(form, k) : null);
  const header: SwoHeader = {
    order_date: date('order_date'), packaging_date: date('packaging_date'),
    customer_name: orNull(str(form, 'customer_name')), customer_po: orNull(str(form, 'customer_po')),
    prepared_by: orNull(str(form, 'prepared_by')), preparation_date: date('preparation_date'),
    notes: orNull(str(form, 'notes')),
  };
  const cols = Object.fromEntries(SWO_LINE_FIELDS.map((f) => [f, form.getAll(`l_${f}`).map((v) => String(v).trim())]));
  const lines: SwoLine[] = [];
  for (let i = 0; i < cols.product_name.length; i++) {
    if (!cols.product_name[i]) continue;
    const line: Record<string, unknown> = {};
    for (const f of SWO_LINE_FIELDS) {
      const raw = cols[f][i] ?? '';
      if (isNumericLineField(f)) {
        const q = parseQty(raw);
        if (Number.isNaN(q)) return 'BAD_QTY';
        line[f] = q;
      } else line[f] = orNull(raw);
    }
    lines.push(line as unknown as SwoLine);
  }
  return { header, lines };
}

// Shipping work orders: create, save, send to production, read the completed
// sheet, confirm and send the copy, cancel, reopen.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const admin = getAdminClient();
  const form = await request.formData();
  const action = str(form, '_action');
  const page = (id: string, q: string, hash = '') => redirect(`/portail/production/expeditions/${id}?${q}${hash}`, 303);

  // ---------------------------------------------------------------- create
  if (action === 'create') {
    const rid = str(form, 'request_id');
    if (!UUID.test(rid)) return redirect('/portail/production/demandes', 303);
    const r = await loadRequest(admin, rid);
    if (!r) return redirect('/portail/production/demandes', 303);
    const existing = await loadSwoForRequest(admin, rid);
    if (existing) return page(existing.id, '');
    let po: PoExtraction | null = null;
    let readFailed = false;
    const fileId = str(form, 'file_id');
    const file = r.files.find((f) => f.id === fileId && !f.removed_at);
    if (file && readingAvailable() && READABLE_TYPES.includes(file.content_type ?? '')) {
      try {
        const { data: row } = await admin.from('ps_request_files').select('storage_path').eq('id', file.id).single();
        const { data: blob, error } = await admin.storage.from('production').download(row!.storage_path);
        if (error || !blob) throw error ?? new Error('download failed');
        po = await readPurchaseOrder({ data: Buffer.from(await blob.arrayBuffer()), mediaType: file.content_type! });
      } catch (e) {
        console.error('[production] PO read for work order failed:', e);
        readFailed = true;
      }
    }
    try {
      const id = await createSwo(admin, staff.id, r, po);
      return page(id, readFailed ? 'ok=created&error=read' : 'ok=created');
    } catch (e) {
      console.error('[production] work order create failed:', e);
      return redirect(`/portail/production/demandes/${rid}?error=unknown`, 303);
    }
  }

  const id = str(form, 'id');
  if (!UUID.test(id)) return redirect('/portail/production/expeditions', 303);
  const swo = await loadSwo(admin, id);
  if (!swo) return redirect('/portail/production/expeditions', 303);
  const version = Number(str(form, 'version'));
  if (['save', 'complete'].includes(action) && version !== swo.version) return page(id, 'error=conflict');

  // ------------------------------------------------------------------ save
  if (action === 'save') {
    const v = readForm(form);
    if (v === 'BAD_QTY') return page(id, 'error=qty', '#bon');
    try {
      const changed = await saveSwo(admin, staff.id, swo, v.header, v.lines);
      return page(id, `ok=${changed ? 'saved' : 'nochange'}`, '#bon');
    } catch (e) {
      if (String((e as Error).message).includes('VERSION_CONFLICT')) return page(id, 'error=conflict');
      console.error('[production] work order save failed:', e);
      return page(id, 'error=unknown');
    }
  }

  const recipients = () => {
    const picked = form.getAll('to').map(String).filter((e) => EMAIL.test(e));
    const other = str(form, 'other').split(/[,;\s]+/).filter((e) => EMAIL.test(e));
    return [...new Set([...picked, ...other].map((e) => e.toLowerCase()))];
  };
  const { data: req } = await admin.from('ps_requests').select('request_no').eq('id', swo.request_id).maybeSingle();
  const pdfName = `${swo.swo_no}${swo.customer_po ? `_${swo.customer_po.replace(/[^\w.-]+/g, '_')}` : ''}.pdf`;

  // ------------------------------------------------------- send to production
  if (action === 'send') {
    const to = recipients();
    if (!to.length) return page(id, 'error=recipients', '#envoyer');
    const pdf = await buildSwoPdf(swo, { requestNo: req?.request_no });
    await sendSwoToProduction({
      toEmails: to, swoNo: swo.swo_no, customer: swo.customer_name, customerPo: swo.customer_po,
      sentBy: staff.full_name, swoUrl: `${siteUrl()}/portail/production/expeditions/${id}`,
      attachments: [{ filename: pdfName, content: Buffer.from(pdf) }], note: orNull(str(form, 'note')),
    });
    const { error } = await admin.from('ps_swos').update({
      status: swo.status === 'completed' ? 'completed' : 'sent', sent_at: new Date().toISOString(), sent_by: staff.id,
      version: swo.version + 1, updated_by: staff.id, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { console.error('[production] work order send failed:', error); return page(id, 'error=unknown'); }
    await logSwo(admin, id, staff.id, 'sent', orNull(str(form, 'note')), { to });
    return page(id, 'ok=sent');
  }

  // ------------------------------------------------- read the completed sheet
  if (action === 'sheet') {
    const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0
      && READABLE_TYPES.includes(f.type) && f.size <= 20 * 1024 * 1024);
    if (!files.length) return page(id, 'error=files', '#feuille');
    const docs: Array<{ data: Buffer; mediaType: string }> = [];
    const paths: string[] = [];
    for (const f of files) {
      const data = Buffer.from(await f.arrayBuffer());
      const ext = f.type === 'application/pdf' ? 'pdf' : f.type.split('/')[1];
      const path = `swo/${id}/${Date.now()}_${paths.length + 1}.${ext}`;
      const { error } = await admin.storage.from('production').upload(path, data, { contentType: f.type, upsert: false });
      if (error) { console.error('[production] sheet upload failed:', error); return page(id, 'error=unknown', '#feuille'); }
      paths.push(path); docs.push({ data, mediaType: f.type });
    }
    let header: SwoHeader = swo; let lines = swo.lines; let reading: unknown = null; let note: string | null = null;
    if (!readingAvailable()) note = 'noKey';
    else {
      try {
        const s = await readCompletedSheet(docs, swo);
        reading = s;
        ({ header, lines } = mergeSheet(swo, s));
      } catch (e) {
        console.error('[production] sheet read failed:', e);
        note = 'failed';
      }
    }
    const pick = (h: SwoHeader): SwoHeader => ({
      order_date: h.order_date, packaging_date: h.packaging_date, customer_name: h.customer_name,
      customer_po: h.customer_po, prepared_by: h.prepared_by, preparation_date: h.preparation_date, notes: h.notes,
    });
    try {
      await saveSwo(admin, staff.id, swo, pick(header), lines,
        { sheet_paths: [...swo.sheet_paths, ...paths], sheet_extraction: reading ?? swo.sheet_extraction }, 'sheet_uploaded');
    } catch (e) {
      console.error('[production] sheet save failed:', e);
      return page(id, 'error=unknown', '#feuille');
    }
    return page(id, note ? `ok=read&sheet=${note}` : 'ok=read', '#bon');
  }

  // ------------------------------------------ confirm and send the copy
  if (action === 'complete') {
    const to = recipients();
    if (!to.length) return page(id, 'error=recipients', '#confirmer');
    // Save what is on screen first, so the copy is exactly what was checked.
    const v = readForm(form);
    if (v === 'BAD_QTY') return page(id, 'error=qty', '#bon');
    let cur = swo;
    try {
      if (await saveSwo(admin, staff.id, swo, v.header, v.lines)) cur = (await loadSwo(admin, id))!;
    } catch (e) {
      if (String((e as Error).message).includes('VERSION_CONFLICT')) return page(id, 'error=conflict');
      throw e;
    }
    const pdf = await buildSwoPdf(cur, { requestNo: req?.request_no });
    const attachments = [{ filename: pdfName, content: Buffer.from(pdf) }];
    for (const [i, p] of cur.sheet_paths.entries()) {
      const { data: blob } = await admin.storage.from('production').download(p);
      if (blob) attachments.push({ filename: `${cur.swo_no}_feuille_${i + 1}.${p.split('.').pop()}`, content: Buffer.from(await blob.arrayBuffer()) });
    }
    // The order is ready to leave: open its shipment ticket for booking.
    let shipment = null;
    let shipmentIsNew = false;
    try {
      const opened = await openShipmentForSwo(admin, staff.id, cur);
      shipment = await loadShipment(admin, opened.id);
      shipmentIsNew = opened.created;
    } catch (e) {
      console.error('[production] shipment open failed:', e);
    }
    const packingList = { filename: packingListFilename(cur), content: await buildPackingList(cur, shipment) };
    attachments.push(packingList);
    await sendSwoCompletedCopy({
      toEmails: to, swoNo: cur.swo_no, customer: cur.customer_name, customerPo: cur.customer_po,
      sentBy: staff.full_name, swoUrl: `${siteUrl()}/portail/production/expeditions/${id}`, attachments,
    });
    const now = new Date().toISOString();
    const { error } = await admin.from('ps_swos').update({
      status: 'completed', completed_at: now, completed_by: staff.id, copy_sent_to: to,
      version: cur.version + 1, updated_by: staff.id, updated_at: now,
    }).eq('id', id);
    if (error) { console.error('[production] work order complete failed:', error); return page(id, 'error=unknown'); }
    await logSwo(admin, id, staff.id, 'completed', null, {});
    await logSwo(admin, id, staff.id, 'copy_sent', null, { to });
    if (shipment && shipmentIsNew) {
      const who = await bookers(admin);
      await sendShipmentToBook({
        toEmails: who.map((b) => b.email), shipmentNo: shipment.shipment_no, customer: shipment.customer_name,
        customerPo: shipment.customer_po, shipTo: shipment.ship_to, summary: shipmentSummary(shipment), by: staff.full_name,
        shipmentUrl: `${siteUrl()}/portail/envois/${shipment.id}`, attachments: [packingList],
      });
    }
    return page(id, 'ok=completed');
  }

  // --------------------------------------------------------- cancel / reopen
  if (action === 'cancel') {
    const reason = str(form, 'reason');
    if (!reason) return page(id, 'error=reason');
    await admin.from('ps_swos').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason,
      version: swo.version + 1, updated_by: staff.id, updated_at: new Date().toISOString() }).eq('id', id);
    await logSwo(admin, id, staff.id, 'cancelled', reason);
    return page(id, 'ok=cancelled');
  }
  if (action === 'reopen') {
    const back = swo.completed_at ? 'completed' : swo.sent_at ? 'sent' : 'draft';
    await admin.from('ps_swos').update({ status: back, cancelled_at: null, cancel_reason: null,
      version: swo.version + 1, updated_by: staff.id, updated_at: new Date().toISOString() }).eq('id', id);
    await logSwo(admin, id, staff.id, 'reopened', null, { status: back });
    return page(id, 'ok=reopened');
  }

  return page(id, '');
};
