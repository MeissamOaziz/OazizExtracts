import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { sendCocSigned } from '../../../../../lib/email';
import { isIsoDate } from '../../../../../lib/production';
import { loadSwo } from '../../../../../lib/production-swo';
import { LABEL_READY_NOTIFY, isCocSigner, loadShipment, logShipment, shipmentSummary } from '../../../../../lib/shipments';
import { buildCocPdf, cocDataFor, cocFilename } from '../../../../../lib/coc';

export const prerender = false;

const siteUrl = () => (import.meta.env.PORTAL_SITE_URL ?? 'https://www.oaziz.ca').replace(/\/$/, '');
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// QA verifies and signs the Chain of Custody, under their own name (Stéphane,
// or Jacob when he does it). The signed PDF then goes to QA & Logistics, to
// send to the customer.
export const POST: APIRoute = async ({ request, cookies, params }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return Response.json({ error: 'not_authenticated' }, { status: 401 });
  if (!isCocSigner(staff.email)) return Response.json({ error: 'not_signer' }, { status: 403 });
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'not_found' }, { status: 404 });

  let p: Record<string, unknown>;
  try { p = await request.json(); } catch { return Response.json({ error: 'invalid_body' }, { status: 400 }); }

  const admin = getAdminClient();
  const s = await loadShipment(admin, id);
  if (!s?.coc_no) return Response.json({ error: 'not_found' }, { status: 404 });
  if (s.coc_signed_at) return Response.json({ error: 'already_signed' }, { status: 409 });
  if (Number(p.version) !== s.version) return Response.json({ error: 'conflict' }, { status: 409 });

  const signature = String(p.signature ?? '');
  if (!signature.startsWith('data:image/png;base64,') || signature.length < 500 || signature.length > 500_000) {
    return Response.json({ error: 'signature' }, { status: 400 });
  }
  const shipDate = clean(p.ship_date, 10);
  const departure = clean(p.departure_time, 5);
  if (!isIsoDate(shipDate)) return Response.json({ error: 'ship_date' }, { status: 400 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)) return Response.json({ error: 'departure_time' }, { status: 400 });
  const vehicleOk = p.vehicle_ok !== false;
  const vehicleNote = clean(p.vehicle_note, 300) || null;
  if (!vehicleOk && !vehicleNote) return Response.json({ error: 'vehicle_note' }, { status: 400 });
  const temperature = clean(p.temperature, 80) || 'N/A';

  const now = new Date().toISOString();
  const { data: upd, error } = await admin.from('sh_shipments').update({
    coc_ship_date: shipDate, coc_departure_time: departure, coc_vehicle_ok: vehicleOk,
    coc_vehicle_note: vehicleOk ? null : vehicleNote, coc_temperature: temperature,
    coc_signature: signature, coc_signed_at: now, coc_signed_by: staff.id, coc_signer_name: staff.full_name,
    version: s.version + 1, updated_by: staff.id, updated_at: now,
  }).eq('id', id).eq('version', s.version).is('coc_signed_at', null).select('*');
  if (error) { console.error('[shipments] CoC sign failed:', error); return Response.json({ error: 'server_error' }, { status: 500 }); }
  if (!upd?.length) return Response.json({ error: 'conflict' }, { status: 409 });
  const signed = upd[0];

  if (p.save_signature === true) await admin.from('staff').update({ saved_signature: signature }).eq('id', staff.id);
  await logShipment(admin, id, staff.id, 'coc_signed', null, {
    coc: s.coc_no, ship_date: shipDate, departure_time: departure, vehicle_ok: vehicleOk, temperature,
  });

  // The signed CoC to QA & Logistics (and whoever signed), to send to the customer.
  const swo = await loadSwo(admin, s.swo_id);
  const pdf = await buildCocPdf(cocDataFor(signed, swo?.lines ?? [], shipDate));
  const to = [...new Set([...LABEL_READY_NOTIFY, staff.email.toLowerCase()])];
  await sendCocSigned({
    toEmails: to, shipmentNo: s.shipment_no, customer: s.customer_name, customerPo: s.customer_po, shipTo: s.ship_to,
    summary: shipmentSummary(s), by: staff.full_name, shipmentUrl: `${siteUrl()}/portail/envois/${id}`,
    carrier: s.carrier, trackingNo: s.tracking_no, cocNo: s.coc_no, signerName: staff.full_name,
    attachments: [{ filename: cocFilename(s.coc_no, s.customer_name), content: Buffer.from(pdf) }],
  });
  return Response.json({ ok: true });
};
