import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../../lib/supabase';
import { currentOpsStaff } from '../../../../lib/ops';
import { parseLines, missingFor, summariseLines, type OrderSource } from '../../../../lib/ops-orders';
import { sendNewOrderNotice } from '../../../../lib/email';

export const prerender = false;

const SOURCES: OrderSource[] = ['customer_po', 'internal_refill', 'packaging_request'];
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

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier/commandes?error=no_role', 303);

  const form = await request.formData();
  const source = String(form.get('source') ?? '') as OrderSource;
  if (!SOURCES.includes(source)) return redirect('/portail/atelier/commandes?error=unknown', 303);

  const back = `/portail/atelier/commandes/nouvelle?type=${source}`;

  // 1. Header fields this door insists on.
  const missing = missingFor(source, form);
  if (missing.length > 0) {
    return redirect(`${back}&error=missing&fields=${encodeURIComponent(missing.join(','))}`, 303);
  }

  // 2. At least one complete line.
  const { lines, errors } = parseLines(form);
  if (errors.length > 0) {
    return redirect(`${back}&error=lines&fields=${encodeURIComponent(errors.join(','))}`, 303);
  }

  // 3. Header insert. Numbering is assigned by trigger.
  const { data: order, error: orderErr } = await supabase
    .from('ops_orders')
    .insert({
      source,
      status: 'submitted',
      customer_id: str(form, 'customer_id'),
      customer_po_ref: str(form, 'customer_po_ref'),
      order_date: str(form, 'order_date') ?? new Date().toISOString().slice(0, 10),
      requested_delivery_date: str(form, 'requested_delivery_date'),
      ship_to_text: str(form, 'ship_to_text'),
      payment_terms: str(form, 'payment_terms'),
      currency: str(form, 'currency') ?? 'CAD',
      excise_province: str(form, 'excise_province'),
      priority: str(form, 'priority') ?? 'normal',
      notes: str(form, 'notes'),
      created_by_staff_id: staff.id,
      created_by_email: staff.email,
    })
    .select('id, order_no, customer_po_ref, source, requested_delivery_date')
    .single();

  if (orderErr || !order) {
    console.error('[atelier] order insert failed:', orderErr);
    return redirect(`${back}&error=unknown`, 303);
  }

  // 4. Lines.
  // `id` is only meaningful when editing — sending it as null here would override
  // the column default and fail the not-null constraint.
  const { error: lineErr } = await supabase.from('ops_order_lines').insert(
    lines.map(({ id: _ignored, ...l }) => ({ ...l, order_id: order.id })),
  );
  if (lineErr) {
    console.error('[atelier] line insert failed:', lineErr);
    await supabase.from('ops_orders').delete().eq('id', order.id);
    return redirect(`${back}&error=unknown`, 303);
  }

  // 5. Internal-refill spec.
  if (source === 'internal_refill') {
    const { error: specErr } = await supabase.from('ops_refill_specs').insert({
      order_id: order.id,
      thc_min_pct: num(form, 'thc_min_pct'),
      thc_max_pct: num(form, 'thc_max_pct'),
      cbd_min_pct: num(form, 'cbd_min_pct'),
      cbd_max_pct: num(form, 'cbd_max_pct'),
      purpose: str(form, 'purpose'),
      source_material_id: str(form, 'source_material_id'),
      source_lot_ref: str(form, 'source_lot_ref'),
      special_requests: str(form, 'special_requests'),
    });
    if (specErr) console.error('[atelier] refill spec insert failed:', specErr);
  }

  // 6. Every order gets a work order, flower resale included, so nothing is
  //    invisible on the boards. It waits in awaiting_plan for the stage plan.
  const { error: woErr } = await supabase.from('ops_work_orders').insert({
    order_id: order.id,
    status: 'awaiting_plan',
    promised_date: order.requested_delivery_date,
  });
  if (woErr) console.error('[atelier] work order insert failed:', woErr);

  // 7. PO attachment, if one came with the form. Upload runs on the service-role
  //    client because the bucket grants no INSERT to authenticated.
  const file = form.get('po_file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD) {
      await supabase.from('ops_events').insert({
        order_id: order.id, actor_staff_id: staff.id, actor_email: staff.email,
        action: 'attachment_rejected',
        detail: { filename: file.name, reason: 'too_large', size: file.size },
      });
    } else {
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
      const path = `orders/${order.id}/${Date.now()}_${safe}`;
      const admin = getAdminClient();
      const { error: upErr } = await admin.storage
        .from('atelier')
        .upload(path, await file.arrayBuffer(), {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (upErr) {
        console.error('[atelier] PO upload failed:', upErr);
      } else {
        await supabase.from('ops_order_attachments').insert({
          order_id: order.id,
          kind: 'po',
          storage_path: path,
          filename: file.name,
          content_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: staff.email,
        });
      }
    }
  }

  // 8. Activity feed.
  await supabase.from('ops_events').insert({
    order_id: order.id,
    actor_staff_id: staff.id,
    actor_email: staff.email,
    action: 'order_created',
    detail: { source, line_count: lines.length },
  });

  // 9. Tell the production manager. Never block the order on the mail.
  try {
    const admin = getAdminClient();
    const { data: pm } = await admin
      .from('staff')
      .select('full_name, email')
      .eq('ops_role', 'production_manager')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (pm?.email) {
      let customerName: string | null = null;
      const customerId = str(form, 'customer_id');
      if (customerId) {
        const { data: c } = await admin.from('ops_customers').select('name').eq('id', customerId).maybeSingle();
        customerName = c?.name ?? null;
      }
      const base = import.meta.env.PORTAL_SITE_URL ?? new URL(request.url).origin;
      await sendNewOrderNotice({
        toEmail: pm.email,
        toName: pm.full_name,
        order: {
          order_no: order.order_no,
          customer_po_ref: order.customer_po_ref,
          source,
          customer_name: customerName,
          requested_delivery_date: order.requested_delivery_date,
          line_summary: summariseLines(lines),
          created_by_name: staff.full_name,
        },
        orderUrl: `${base}/portail/atelier/commandes/${order.id}`,
      });
    } else {
      console.warn('[atelier] no active production_manager to notify');
    }
  } catch (e) {
    console.error('[atelier] notification failed (order still created):', e);
  }

  return redirect(`/portail/atelier/commandes/${order.id}?ok=created`, 303);
};
