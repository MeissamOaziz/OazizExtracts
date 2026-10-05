import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { isUuid, logEvent, parseAmount, uploadInvoiceFile } from '../../../../../../lib/payables';
import { autoPushInvoice, deleteQboBill } from '../../../../../../lib/qbo-sync';

export const prerender = false;

const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));

// Add an invoice / credit / adjustment, void one (kept, struck through), or
// toggle its "entered in QuickBooks" check.
export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const supplierId = String(params.id ?? '');
  if (!isUuid(supplierId)) return redirect('/portail/paiements/fournisseurs', 303);
  const back = `/portail/paiements/fournisseurs/${supplierId}`;
  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const admin = getAdminClient();

  if (action === 'qbo') {
    const invoiceId = String(form.get('invoice_id') ?? '');
    if (isUuid(invoiceId)) {
      await admin.from('ap_invoices').update({ in_quickbooks: form.get('in_quickbooks') === 'on', updated_at: new Date().toISOString() })
        .eq('id', invoiceId).eq('supplier_id', supplierId);
    }
    return redirect(back, 303);
  }

  if (action === 'void') {
    const invoiceId = String(form.get('invoice_id') ?? '');
    if (!isUuid(invoiceId)) return redirect(back, 303);
    const { data: inv } = await admin.from('ap_invoices').select('invoice_number, amount').eq('id', invoiceId).eq('supplier_id', supplierId).maybeSingle();
    const qbWarning = await deleteQboBill(admin, invoiceId);
    // Money already paid against a voided invoice becomes a credit on the
    // supplier's account instead of vanishing.
    const { data: bal } = await admin.from('ap_invoice_balances').select('allocated').eq('id', invoiceId).maybeSingle();
    const paid = Number(bal?.allocated ?? 0);
    await admin.from('ap_payment_allocations').delete().eq('invoice_id', invoiceId);
    if (paid > 0) {
      await admin.from('ap_invoices').insert({
        supplier_id: supplierId, kind: 'credit', amount: -paid, invoice_date: new Date().toISOString().slice(0, 10),
        description: `Crédit — paiements appliqués à la facture annulée ${inv?.invoice_number ?? ''}`.trim(), created_by: staff.id,
      });
    }
    await admin.from('ap_invoices').update({
      voided_at: new Date().toISOString(), voided_by: staff.id, void_reason: String(form.get('reason') ?? '').trim() || 'Annulée',
    }).eq('id', invoiceId).eq('supplier_id', supplierId);
    await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'invoice_voided', details: { invoice: inv?.invoice_number ?? null, amount: inv?.amount ?? null } });
    return redirect(qbWarning ? `${back}?error=${encodeURIComponent(qbWarning)}` : `${back}?ok=invvoid`, 303);
  }

  const submissionKey = String(form.get('submission_key') ?? '').trim() || null;
  if (submissionKey) {
    const { data: existing } = await admin.from('ap_invoices').select('id').eq('submission_key', submissionKey).maybeSingle();
    if (existing) return redirect(`${back}?ok=inv`, 303);
  }

  let amount = parseAmount(form.get('amount'));
  if (amount === null || amount === 0) return redirect(`${back}?error=missing&addinv=1`, 303);
  const kind = ['invoice', 'credit', 'adjustment'].includes(String(form.get('kind'))) ? String(form.get('kind')) : 'invoice';
  if (kind === 'credit') amount = -Math.abs(amount);

  const invoiceDate = isDate(form.get('invoice_date')) ? String(form.get('invoice_date')) : null;
  let dueDate = isDate(form.get('due_date')) ? String(form.get('due_date')) : null;
  if (!dueDate && invoiceDate) {
    const { data: sup } = await admin.from('ap_suppliers').select('terms_days').eq('id', supplierId).maybeSingle();
    if (sup?.terms_days !== null && sup?.terms_days !== undefined) {
      const d = new Date(invoiceDate + 'T12:00:00');
      d.setDate(d.getDate() + sup.terms_days);
      dueDate = d.toISOString().slice(0, 10);
    }
  }
  const number = String(form.get('invoice_number') ?? '').trim() || null;

  let filePath: string | null = null;
  const file = form.get('file') as File | null;
  if (file && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) return redirect(`${back}?error=file&addinv=1`, 303);
    try { filePath = await uploadInvoiceFile(admin, supplierId, file); }
    catch (e) { console.error('[paiements] invoice upload failed:', e); }
  }

  let dup = false;
  if (number) {
    const { count } = await admin.from('ap_invoices').select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplierId).eq('invoice_number', number).is('voided_at', null);
    dup = (count ?? 0) > 0;
  }

  const { data: created, error } = await admin.from('ap_invoices').insert({
    supplier_id: supplierId, kind, invoice_number: number,
    po_number: String(form.get('po_number') ?? '').trim() || null,
    invoice_date: invoiceDate, due_date: dueDate, amount,
    description: String(form.get('description') ?? '').trim() || null,
    in_quickbooks: form.get('in_quickbooks') === 'on', file_path: filePath, created_by: staff.id, submission_key: submissionKey,
  }).select('id').single();
  if (error?.code === '23505') return redirect(`${back}?ok=inv`, 303);
  if (error || !created) {
    console.error('[paiements] invoice insert failed:', error);
    return redirect(`${back}?error=missing&addinv=1`, 303);
  }
  await logEvent(admin, { supplier_id: supplierId, actor_staff_id: staff.id, action: 'invoice_added', details: { invoice: number, amount, kind } });
  if (form.get('in_quickbooks') !== 'on') await autoPushInvoice(admin, created.id);
  return redirect(`${back}?ok=inv${dup ? `&dup=${encodeURIComponent(number!)}` : ''}`, 303);
};
