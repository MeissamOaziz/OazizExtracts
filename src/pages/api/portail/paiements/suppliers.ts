import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { isUuid, logEvent, CATEGORIES, PAYMENT_METHODS } from '../../../../lib/payables';

export const prerender = false;

// Create or update a supplier from the shared supplier form.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const id = String(form.get('id') ?? '');
  const str = (k: string) => String(form.get(k) ?? '').trim() || null;

  const name = str('name');
  const back = action === 'update' && isUuid(id) ? `/portail/paiements/fournisseurs/${id}` : '/portail/paiements/fournisseurs';
  if (!name) return redirect(`${back}?error=missing`, 303);

  const category = String(form.get('category'));
  const method = String(form.get('payment_method'));
  const terms = parseInt(String(form.get('terms_days') ?? ''), 10);
  const row: Record<string, unknown> = {
    name,
    legal_name: str('legal_name'),
    category: (CATEGORIES as readonly string[]).includes(category) ? category : 'supplier',
    payment_method: (PAYMENT_METHODS as readonly string[]).includes(method) ? method : 'eft',
    bank_account_id: isUuid(form.get('bank_account_id')) ? form.get('bank_account_id') : null,
    currency: ['CAD', 'USD', 'EUR'].includes(String(form.get('currency'))) ? form.get('currency') : 'CAD',
    terms_days: Number.isFinite(terms) && terms >= 0 ? terms : null,
    payment_details: str('payment_details'),
    notes: str('notes'),
    contact_name: str('contact_name'),
    contact_email: str('contact_email'),
    remittance_email: str('remittance_email'),
    qbo_vendor_name: str('qbo_vendor_name'),
    updated_at: new Date().toISOString(),
  };

  const admin = getAdminClient();
  if (action === 'update' && isUuid(id)) {
    row.is_active = form.get('is_active') === 'on';
    const { data: before } = await admin.from('ap_suppliers').select('*').eq('id', id).maybeSingle();
    const { error } = await admin.from('ap_suppliers').update(row).eq('id', id);
    if (error) return redirect(`${back}?error=${error.code === '23505' ? 'duplicate' : 'unknown'}`, 303);
    // Payment details are what money gets sent to — keep a trail of every change.
    const changed = Object.keys(row).filter((k) => k !== 'updated_at' && (before as Record<string, unknown> | null)?.[k] !== row[k]);
    if (changed.length) {
      await logEvent(admin, {
        supplier_id: id, actor_staff_id: staff.id, action: 'supplier_updated',
        details: Object.fromEntries(changed.map((k) => [k, { from: (before as Record<string, unknown>)?.[k] ?? null, to: row[k] }])),
      });
    }
    return redirect(`${back}?ok=saved`, 303);
  }

  const { data, error } = await admin.from('ap_suppliers').insert(row).select('id').single();
  if (error || !data) return redirect(`/portail/paiements/fournisseurs?new=1&error=${error?.code === '23505' ? 'duplicate' : 'missing'}`, 303);
  await logEvent(admin, { supplier_id: data.id, actor_staff_id: staff.id, action: 'supplier_created' });
  return redirect(`/portail/paiements/fournisseurs/${data.id}?ok=created&addinv=1`, 303);
};
