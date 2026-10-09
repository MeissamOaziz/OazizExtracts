import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid, logEvent, setSetting } from '../../../../../lib/payables';
import { disconnect, getQbo } from '../../../../../lib/qbo';
import { linkVendors, pushInvoice, pushPayment, qboDefaults, refreshQboPayment, syncAll } from '../../../../../lib/qbo-sync';

export const prerender = false;

// QuickBooks screen actions: sync now, auto-link vendors, save defaults and
// account mappings, map one supplier, retry one invoice/payment, disconnect.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const back = String(form.get('_back') ?? '/portail/paiements/quickbooks');
  const safeBack = back.startsWith('/portail/paiements') ? back : '/portail/paiements/quickbooks';
  const go = (k: 'ok' | 'error', msg: string) => redirect(`${safeBack}${safeBack.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(msg)}`, 303);
  const admin = getAdminClient();
  const str = (k: string) => String(form.get(k) ?? '').trim() || null;

  try {
    switch (action) {
      case 'sync': {
        const s = await syncAll(admin);
        return go('ok', `Synchronisé : ${s.bills} facture(s) et ${s.payments} paiement(s) envoyés, ${s.pulled.bills} facture(s) et ${s.pulled.payments} paiement(s) importés`
          + (s.billErrors + s.paymentErrors ? ` — ${s.billErrors + s.paymentErrors} à corriger (voir le journal)` : ''));
      }
      case 'link_vendors': {
        const r = await linkVendors(admin);
        return go('ok', `${r.matched} fournisseur(s) liés automatiquement, ${r.linkedBills} facture(s) ouvertes rapprochées`);
      }
      case 'save_settings': {
        const cur = await qboDefaults(admin);
        await setSetting(admin, 'qbo_defaults', {
          ...cur,
          expense_account_id: str('expense_account_id'), tax_code_id: str('tax_code_id'),
          push_bills: form.get('push_bills') === 'on', push_payments: form.get('push_payments') === 'on', pull: form.get('pull') === 'on',
        });
        const { data: accounts } = await admin.from('ap_bank_accounts').select('id');
        for (const a of accounts ?? []) {
          await admin.from('ap_bank_accounts').update({ qbo_account_id: str(`bank_${a.id}`) }).eq('id', a.id);
        }
        await logEvent(admin, { actor_staff_id: staff.id, action: 'qbo_settings_updated' });
        return go('ok', 'Paramètres QuickBooks enregistrés.');
      }
      case 'map_vendor': {
        const sid = String(form.get('supplier_id') ?? '');
        if (!isUuid(sid)) return go('error', 'Fournisseur invalide');
        const { error } = await admin.from('ap_suppliers').update({
          qbo_vendor_id: str('qbo_vendor_id'), qbo_expense_account_id: str('qbo_expense_account_id'), qbo_tax_code_id: str('qbo_tax_code_id'),
        }).eq('id', sid);
        if (error) return go('error', error.code === '23505' ? 'Ce fournisseur QB est déjà lié à un autre fournisseur du portail.' : error.message);
        return go('ok', 'Lien QuickBooks enregistré.');
      }
      case 'push_invoice': {
        const id = String(form.get('invoice_id') ?? '');
        if (!isUuid(id)) return go('error', 'Facture invalide');
        const r = await pushInvoice(admin, id, { force: form.get('force') === '1' });
        return go(r.ok ? 'ok' : 'error', r.message);
      }
      case 'code_and_push': {
        const id = String(form.get('invoice_id') ?? '');
        const account = str('qbo_account_id');
        if (!isUuid(id) || !account) return go('error', 'Choisissez un compte de dépense.');
        const tax = str('qbo_tax_code_id');
        const { data: inv } = await admin.from('ap_invoices').update({ qbo_account_id: account, qbo_tax_code_id: tax, qbo_error: null })
          .eq('id', id).select('supplier_id').single();
        if (inv && form.get('remember') === 'on') {
          await admin.from('ap_suppliers').update({ qbo_expense_account_id: account, qbo_tax_code_id: tax }).eq('id', inv.supplier_id);
        }
        const r = await pushInvoice(admin, id, { force: true });
        return go(r.ok ? 'ok' : 'error', r.message);
      }
      case 'push_payment': {
        const id = String(form.get('payment_id') ?? '');
        if (!isUuid(id)) return go('error', 'Paiement invalide');
        const r = await pushPayment(admin, id);
        return go(r.ok ? 'ok' : 'error', r.message);
      }
      case 'create_from_vendor': {
        const vid = str('qbo_vendor_id');
        if (!vid || !/^\d+$/.test(vid)) return go('error', 'Fournisseur invalide');
        const { data: taken } = await admin.from('ap_suppliers').select('id').eq('qbo_vendor_id', vid).maybeSingle();
        if (taken) return redirect(`/portail/paiements/fournisseurs/${taken.id}`, 303);
        const qbo = await getQbo(admin);
        if (!qbo) return go('error', 'QuickBooks non connecté');
        const v = (await qbo.get(`/vendor/${vid}`))?.Vendor;
        if (!v) return go('error', 'Fournisseur invalide');
        const { data: rbc } = await admin.from('ap_bank_accounts').select('id').eq('code', 'rbc').maybeSingle();
        const { data: created, error } = await admin.from('ap_suppliers').insert({
          name: v.DisplayName, legal_name: v.CompanyName && v.CompanyName !== v.DisplayName ? v.CompanyName : null,
          contact_email: v.PrimaryEmailAddr?.Address ?? null, qbo_vendor_id: vid, qbo_vendor_name: v.DisplayName,
          bank_account_id: rbc?.id ?? null,
        }).select('id').single();
        if (error || !created) return go('error', error?.code === '23505' ? 'Ce fournisseur existe déjà dans le portail.' : (error?.message ?? 'Erreur'));
        await logEvent(admin, { supplier_id: created.id, actor_staff_id: staff.id, action: 'supplier_created', details: { via: 'qbo_vendor', qbo_vendor_id: vid } });
        return redirect(`/portail/paiements/fournisseurs/${created.id}?ok=created`, 303);
      }
      case 'link_payment_bill': {
        // A paid, imported invoice whose QB bill could not be identified
        // automatically: a person picks it, then the payment is created.
        const paymentId = String(form.get('payment_id') ?? '');
        const invoiceId = String(form.get('invoice_id') ?? '');
        const billId = str('qbo_bill_id');
        if (!isUuid(paymentId) || !isUuid(invoiceId) || !billId || !/^\d+$/.test(billId)) return go('error', 'Choisissez la facture QuickBooks.');

        const { data: alloc } = await admin.from('ap_payment_allocations')
          .select('invoice_id, ap_invoices(supplier_id, qbo_bill_id, invoice_number, ap_suppliers(qbo_vendor_id))')
          .eq('payment_id', paymentId).eq('invoice_id', invoiceId).maybeSingle();
        const inv = alloc?.ap_invoices as unknown as { supplier_id: string; qbo_bill_id: string | null; invoice_number: string | null; ap_suppliers: { qbo_vendor_id: string | null } } | null;
        if (!inv) return go('error', 'Cette facture ne fait pas partie de ce paiement.');
        if (inv.qbo_bill_id) return go('error', 'Cette facture est déjà liée à QuickBooks.');

        // The bill must be this supplier's, open, and not claimed by another invoice.
        const qbo = await getQbo(admin);
        if (!qbo) return go('error', 'QuickBooks non connecté');
        const bill = (await qbo.get(`/bill/${billId}`))?.Bill;
        if (!bill || String(bill.VendorRef?.value) !== String(inv.ap_suppliers?.qbo_vendor_id)) return go('error', 'Cette facture QB n’appartient pas à ce fournisseur.');
        const { data: dup } = await admin.from('ap_invoices').select('id').eq('qbo_bill_id', billId).limit(1);
        if (dup?.length) return go('error', 'Cette facture QB est déjà liée à une autre facture du portail.');

        await admin.from('ap_invoices').update({ qbo_bill_id: billId, in_quickbooks: true, qbo_synced_at: new Date().toISOString(), qbo_error: null }).eq('id', invoiceId);
        await logEvent(admin, { supplier_id: inv.supplier_id, actor_staff_id: staff.id, action: 'qbo_bill_linked', details: { invoice: inv.invoice_number, qbo_bill_id: billId, qbo_number: bill.DocNumber ?? null, payment_id: paymentId } });
        const r = await pushPayment(admin, paymentId);
        return go(r.ok ? 'ok' : 'error', r.message);
      }
      case 'refresh_payment': {
        const id = String(form.get('payment_id') ?? '');
        if (!isUuid(id)) return go('error', 'Paiement invalide');
        const r = await refreshQboPayment(admin, id);
        return go(r.ok ? 'ok' : 'error', r.message);
      }
      case 'disconnect':
        await disconnect(admin);
        await logEvent(admin, { actor_staff_id: staff.id, action: 'qbo_disconnected' });
        return go('ok', 'QuickBooks déconnecté.');
    }
  } catch (e) {
    console.error('[qbo] action failed:', action, e);
    return go('error', e instanceof Error ? e.message : String(e));
  }
  return redirect(safeBack, 303);
};
