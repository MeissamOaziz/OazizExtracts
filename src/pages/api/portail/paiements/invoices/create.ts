import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid, logEvent, parseAmount } from '../../../../../lib/payables';

export const prerender = false;

const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const str = (form: FormData, k: string) => String(form.get(k) ?? '').trim() || null;

// Step 2 of "drop an invoice": the reviewed fields are saved as an invoice on
// an existing supplier (or a supplier created on the spot), with the file attached.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const form = await request.formData();
  const admin = getAdminClient();
  const back = '/portail/paiements/factures/nouvelle';

  let amount = parseAmount(form.get('amount'));
  if (amount === null || amount === 0) return redirect(`${back}?error=amount`, 303);
  const kind = form.get('kind') === 'credit' ? 'credit' : 'invoice';
  if (kind === 'credit') amount = -Math.abs(amount);

  let supplierId = String(form.get('supplier_id') ?? '');
  if (supplierId === 'new') {
    const name = str(form, 'new_supplier_name');
    if (!name) return redirect(`${back}?error=supplier`, 303);
    const { data: rbc } = await admin.from('ap_bank_accounts').select('id').eq('code', 'rbc').maybeSingle();
    const { data: created, error } = await admin.from('ap_suppliers').insert({
      name, legal_name: str(form, 'new_supplier_legal_name'), contact_email: str(form, 'new_supplier_email'),
      payment_details: str(form, 'new_supplier_payment_details'), bank_account_id: rbc?.id ?? null,
    }).select('id').single();
    if (error || !created) return redirect(`${back}?error=${error?.code === '23505' ? 'duplicate' : 'supplier'}`, 303);
    supplierId = created.id;
    await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'supplier_created', details: { via: 'invoice_pdf' } });
  }
  if (!isUuid(supplierId)) return redirect(`${back}?error=supplier`, 303);

  const filePath = str(form, 'file_path');
  const safePath = filePath && /^inbox\/[\w\-/.]+$/.test(filePath) ? filePath : null;
  const number = str(form, 'invoice_number');
  let dueDate = isDate(form.get('due_date')) ? String(form.get('due_date')) : null;
  const invoiceDate = isDate(form.get('invoice_date')) ? String(form.get('invoice_date')) : null;
  if (!dueDate && invoiceDate) {
    const { data: sup } = await admin.from('ap_suppliers').select('terms_days').eq('id', supplierId).maybeSingle();
    if (sup?.terms_days !== null && sup?.terms_days !== undefined) {
      const d = new Date(invoiceDate + 'T12:00:00');
      d.setDate(d.getDate() + sup.terms_days);
      dueDate = d.toISOString().slice(0, 10);
    }
  }

  const { error } = await admin.from('ap_invoices').insert({
    supplier_id: supplierId, kind, invoice_number: number, po_number: str(form, 'po_number'),
    invoice_date: invoiceDate, due_date: dueDate, amount, description: str(form, 'description'),
    in_quickbooks: form.get('in_quickbooks') === 'on', file_path: safePath, created_by: staff.id,
  });
  if (error) {
    console.error('[paiements] invoice create failed:', error);
    return redirect(`${back}?error=save`, 303);
  }
  await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'invoice_added', details: { invoice: number, amount, via: 'pdf' } });
  if (form.get('next') === 'another') return redirect(`${back}?ok=1`, 303);
  return redirect(`/portail/paiements/fournisseurs/${supplierId}?ok=inv`, 303);
};
