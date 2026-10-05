import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';
import {
  parseLines, missingFor, EDITABLE_STATUSES, type OrderSource,
} from '../../../../../../lib/ops-orders';

export const prerender = false;

const MAX_UPLOAD = 25 * 1024 * 1024;

function str(form: FormData, k: string): string | null {
  const v = String(form.get(k) ?? '').trim();
  return v === '' ? null : v;
}
function num(form: FormData, k: string): number | null {
  const v = str(form, k);
  if (v === null) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const id = String(params.id ?? '');
  const detail = `/portail/atelier/commandes/${id}`;
  const back = `${detail}/editer`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${detail}?error=no_role`, 303);

  const { data: existing } = await supabase
    .from('ops_orders')
    .select('id, source, status')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return redirect('/portail/atelier/commandes?error=unknown', 303);
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return redirect(`${detail}?error=locked`, 303);
  }

  const form = await request.formData();
  // The source is fixed at creation — a PO does not become a refill request.
  const source = existing.source as OrderSource;

  const missing = missingFor(source, form);
  if (missing.length > 0) {
    return redirect(`${back}?error=missing&fields=${encodeURIComponent(missing.join(','))}`, 303);
  }

  const { lines, errors } = parseLines(form);
  if (errors.length > 0) {
    return redirect(`${back}?error=lines&fields=${encodeURIComponent(errors.join(','))}`, 303);
  }

  // ------------------------------------------------------------- header
  const { error: headErr } = await supabase
    .from('ops_orders')
    .update({
      customer_id: str(form, 'customer_id'),
      customer_po_ref: str(form, 'customer_po_ref'),
      order_date: str(form, 'order_date'),
      requested_delivery_date: str(form, 'requested_delivery_date'),
      ship_to_text: str(form, 'ship_to_text'),
      payment_terms: str(form, 'payment_terms'),
      currency: str(form, 'currency') ?? 'CAD',
      excise_province: str(form, 'excise_province'),
      priority: str(form, 'priority') ?? 'normal',
      notes: str(form, 'notes'),
    })
    .eq('id', id);

  if (headErr) {
    console.error('[atelier] order update failed:', headErr);
    return redirect(`${back}?error=unknown`, 303);
  }

  // -------------------------------------------------------------- lines
  // Diff rather than delete-and-reinsert, so a line keeps its identity for
  // anything that references it later.
  const { data: current } = await supabase
    .from('ops_order_lines').select('id').eq('order_id', id);
  const currentIds = new Set((current ?? []).map((r: any) => r.id));

  const keptIds = new Set(lines.map((l) => l.id).filter(Boolean) as string[]);
  const toDelete = [...currentIds].filter((cid) => !keptIds.has(cid));

  if (toDelete.length > 0) {
    const { error } = await supabase.from('ops_order_lines').delete().in('id', toDelete);
    if (error) console.error('[atelier] line delete failed:', error);
  }

  for (const line of lines) {
    const { id: lineId, ...fields } = line;
    // An id the caller does not actually own must not be adopted into this order.
    if (lineId && currentIds.has(lineId)) {
      const { error } = await supabase
        .from('ops_order_lines').update(fields).eq('id', lineId).eq('order_id', id);
      if (error) console.error('[atelier] line update failed:', error);
    } else {
      const { error } = await supabase
        .from('ops_order_lines').insert({ ...fields, order_id: id });
      if (error) console.error('[atelier] line insert failed:', error);
    }
  }

  // --------------------------------------------------------- refill spec
  if (source === 'internal_refill') {
    const spec = {
      order_id: id,
      thc_min_pct: num(form, 'thc_min_pct'),
      thc_max_pct: num(form, 'thc_max_pct'),
      cbd_min_pct: num(form, 'cbd_min_pct'),
      cbd_max_pct: num(form, 'cbd_max_pct'),
      purpose: str(form, 'purpose'),
      source_material_id: str(form, 'source_material_id'),
      source_lot_ref: str(form, 'source_lot_ref'),
      special_requests: str(form, 'special_requests'),
    };
    const { error } = await supabase
      .from('ops_refill_specs').upsert(spec, { onConflict: 'order_id' });
    if (error) console.error('[atelier] refill spec upsert failed:', error);
  }

  // ---------------------------------------------------------- attachment
  const file = form.get('po_file');
  if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD) {
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `orders/${id}/${Date.now()}_${safe}`;
    const admin = getAdminClient();
    const { error: upErr } = await admin.storage
      .from('atelier')
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) {
      console.error('[atelier] attachment upload failed:', upErr);
    } else {
      await supabase.from('ops_order_attachments').insert({
        order_id: id,
        kind: 'other',
        storage_path: path,
        filename: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: staff.email,
      });
      await supabase.from('ops_events').insert({
        order_id: id, actor_staff_id: staff.id, actor_email: staff.email,
        action: 'attachment_added', detail: { filename: file.name },
      });
    }
  }

  await supabase.from('ops_events').insert({
    order_id: id,
    actor_staff_id: staff.id,
    actor_email: staff.email,
    action: 'order_updated',
    detail: { line_count: lines.length, lines_removed: toDelete.length },
  });

  return redirect(`${detail}?ok=updated`, 303);
};
