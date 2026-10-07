import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid, logEvent, parseAmount } from '../../../../../lib/payables';
import { autoPushInvoice, linkVendorChoice } from '../../../../../lib/qbo-sync';
import { numKey } from '../../../../../lib/payables-duplicates';

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

  // Same form submitted twice (double click, back + resubmit): send to the invoice already saved.
  const submissionKey = str(form, 'submission_key');
  if (submissionKey) {
    const { data: existing } = await admin.from('ap_invoices').select('supplier_id').eq('submission_key', submissionKey).maybeSingle();
    if (existing) return redirect(`/portail/paiements/fournisseurs/${existing.supplier_id}?ok=inv`, 303);
  }

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

  // Learn how this supplier appears on its invoices, so the next one matches by itself.
  const printed = [str(form, 'x_vendor_name'), str(form, 'x_vendor_legal_name')].filter((v): v is string => !!v);
  const gstNo = str(form, 'x_gst_number');
  const qstNo = str(form, 'x_qst_number');
  if (printed.length || gstNo || qstNo) {
    const { data: sup } = await admin.from('ap_suppliers').select('name, legal_name, aliases, gst_number, qst_number').eq('id', supplierId).maybeSingle();
    if (sup) {
      const known = new Set([sup.name, sup.legal_name, ...(sup.aliases ?? [])].filter(Boolean).map((v: string) => v.toLowerCase()));
      const newAliases = printed.filter((p) => !known.has(p.toLowerCase()));
      const patch: Record<string, unknown> = {};
      if (newAliases.length) patch.aliases = [...(sup.aliases ?? []), ...newAliases];
      if (gstNo && !sup.gst_number) patch.gst_number = gstNo;
      if (qstNo && !sup.qst_number) patch.qst_number = qstNo;
      if (Object.keys(patch).length) await admin.from('ap_suppliers').update(patch).eq('id', supplierId);
    }
  }
  const vendorChoice = str(form, 'qbo_vendor_choice');
  if (vendorChoice && form.get('in_quickbooks') !== 'on') {
    await linkVendorChoice(admin, supplierId, vendorChoice, {
      displayName: str(form, 'x_vendor_name'), legalName: str(form, 'x_vendor_legal_name'), email: str(form, 'x_vendor_email'),
    });
  }

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

  // Same supplier + same invoice number already in the portal: refuse unless
  // the reviewer explicitly confirmed it is not a duplicate.
  if (number && form.get('confirm_not_duplicate') !== '1') {
    const { data: same } = await admin.from('ap_invoices').select('invoice_number')
      .eq('supplier_id', supplierId).is('voided_at', null).not('invoice_number', 'is', null);
    if ((same ?? []).some((i) => numKey(i.invoice_number) === numKey(number))) return redirect(`${back}?error=dup_invoice`, 303);
  }
  // Reuse an existing QB bill instead of creating a second one.
  const linkBill = str(form, 'link_qbo_bill_id');
  if (linkBill) {
    if (!/^\d+$/.test(linkBill)) return redirect(`${back}?error=save`, 303);
    const { data: taken } = await admin.from('ap_invoices').select('id').eq('qbo_bill_id', linkBill).is('voided_at', null).limit(1);
    if (taken?.length) return redirect(`${back}?error=qb_linked`, 303);
  }

  const subtotal = parseAmount(form.get('subtotal'));
  const alreadyInQb = form.get('in_quickbooks') === 'on' || !!linkBill;
  const { data: created, error } = await admin.from('ap_invoices').insert({
    supplier_id: supplierId, kind, invoice_number: number, po_number: str(form, 'po_number'),
    invoice_date: invoiceDate, due_date: dueDate, amount, description: str(form, 'description'),
    subtotal: subtotal && subtotal > 0 ? subtotal : null,
    tax_gst: parseAmount(form.get('tax_gst')), tax_qst: parseAmount(form.get('tax_qst')),
    qbo_account_id: str(form, 'qbo_account_id'), qbo_tax_code_id: str(form, 'qbo_tax_code_id'),
    in_quickbooks: alreadyInQb, file_path: safePath, created_by: staff.id, submission_key: submissionKey,
    ...(linkBill ? { qbo_bill_id: linkBill, qbo_synced_at: new Date().toISOString() } : {}),
  }).select('id').single();
  if (error?.code === '23505') return redirect(`/portail/paiements/fournisseurs/${supplierId}?ok=inv`, 303);
  if (error || !created) {
    console.error('[paiements] invoice create failed:', error);
    return redirect(`${back}?error=save`, 303);
  }
  await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'invoice_added', details: { invoice: number, amount, via: 'pdf', ...(linkBill ? { linked_qbo_bill: linkBill } : {}) } });
  if (form.get('qbo_remember') === 'on' && str(form, 'qbo_account_id')) {
    await admin.from('ap_suppliers').update({ qbo_expense_account_id: str(form, 'qbo_account_id'), qbo_tax_code_id: str(form, 'qbo_tax_code_id') }).eq('id', supplierId);
  }
  // Already keyed into QB by hand? Then don't create a second Bill.
  if (!alreadyInQb) await autoPushInvoice(admin, created.id);
  if (form.get('next') === 'another') return redirect(`${back}?ok=1`, 303);
  return redirect(`/portail/paiements/fournisseurs/${supplierId}?ok=inv`, 303);
};
