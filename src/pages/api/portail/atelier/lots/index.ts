import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';

export const prerender = false;

// Receive material into a new lot.
//
// The lot, its opening ledger entry, its potency and its external references are
// written by ops_receive_lot() in one transaction, so a lot can never exist
// without the movement that explains its balance.

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
  const back = '/portail/atelier/lots/reception';

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect('/portail/atelier/lots?error=no_role', 303);

  const form = await request.formData();

  const materialId = str(form, 'material_id');
  const qty = num(form, 'qty_g');
  if (!materialId) return redirect(`${back}?error=material`, 303);
  if (qty === null || qty <= 0) return redirect(`${back}?error=qty`, 303);

  const { data: lotId, error } = await supabase.rpc('ops_receive_lot', {
    p_material_id: materialId,
    p_qty_g: qty,
    p_lot_code: str(form, 'lot_code'),
    p_origin: str(form, 'origin') ?? 'purchased',
    p_supplier: str(form, 'supplier'),
    p_supplier_id: str(form, 'supplier_id'),
    p_received_at: str(form, 'received_at') ?? new Date().toISOString().slice(0, 10),
    p_cultivar: str(form, 'cultivar'),
    p_thc_pct: num(form, 'thc_pct'),
    p_cbd_pct: num(form, 'cbd_pct'),
    p_potency_source: str(form, 'potency_source') ?? 'supplier',
    p_coa_ref: str(form, 'coa_ref'),
    p_tested_at: str(form, 'tested_at'),
    p_groweriq_ref: str(form, 'groweriq_ref'),
    p_supplier_ref: str(form, 'supplier_ref'),
    p_notes: str(form, 'notes'),
    p_owner_customer_id: str(form, 'owner_customer_id'),
  });

  if (error || !lotId) {
    console.error('[atelier] receive lot failed:', error);
    const msg = error?.message ?? '';
    const dupe = error?.code === '23505' || /duplicate key/i.test(msg);
    // The counterparty rules live in the database, so surface their refusals plainly.
    const reason = dupe ? 'duplicate'
      : /needs the customer recorded/i.test(msg) ? 'owner'
      : /needs the supplier recorded/i.test(msg) ? 'supplierOwner'
      : 'unknown';
    return redirect(`${back}?error=${reason}`, 303);
  }

  // COA, if one came with the form.
  const file = form.get('coa_file');
  if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD) {
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `lots/${lotId}/${Date.now()}_${safe}`;
    const admin = getAdminClient();
    const { error: upErr } = await admin.storage
      .from('atelier')
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) {
      console.error('[atelier] COA upload failed:', upErr);
    } else {
      await supabase.from('ops_lot_attachments').insert({
        lot_id: lotId,
        kind: 'coa',
        storage_path: path,
        filename: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: staff.email,
      });
    }
  }

  return redirect(`/portail/atelier/lots/${lotId}?ok=received`, 303);
};
