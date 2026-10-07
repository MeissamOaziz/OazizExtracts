import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid, logEvent, setSetting } from '../../../../../lib/payables';
import { disconnect } from '../../../../../lib/qbo';
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
