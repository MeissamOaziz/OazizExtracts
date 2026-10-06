import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid, logEvent, n, round2 } from '../../../../../lib/payables';
import { pushInvoice } from '../../../../../lib/qbo-sync';
import { compareSupplier, fetchQbDoc } from '../../../../../lib/qbo-reconcile';

export const prerender = false;

// Fixes offered on Paiements → QuickBooks → Écarts → <supplier>. Every action
// changes the PORTAL side only (or pushes a portal invoice to QB the normal
// way); corrections to QB itself are made in QuickBooks. Each one is logged in
// the supplier's history with who, when and why.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const sid = String(form.get('supplier_id') ?? '');
  if (!isUuid(sid)) return redirect('/portail/paiements/quickbooks/ecarts', 303);
  const back = `/portail/paiements/quickbooks/ecarts/${sid}`;
  const go = (k: 'ok' | 'error', msg: string) => redirect(`${back}?${k}=${encodeURIComponent(msg)}`, 303);
  const admin = getAdminClient();
  const reason = String(form.get('reason') ?? '').trim().slice(0, 500);
  const invoiceId = String(form.get('invoice_id') ?? '');
  const qbId = String(form.get('qb_id') ?? '').trim();
  const qbType = form.get('qb_type') === 'VendorCredit' ? 'VendorCredit' : 'Bill';
  const today = new Date().toISOString().slice(0, 10);
  const log = (act: string, details: Record<string, unknown>) =>
    logEvent(admin, { supplier_id: sid, actor_staff_id: staff.id, action: act, details: { ...details, reason: reason || null } });

  // Portal-only adjustment (never pushed to QB: kind 'adjustment').
  async function adjust(amount: number, number: string | null, description: string) {
    const { error } = await admin.from('ap_invoices').insert({
      supplier_id: sid, kind: 'adjustment', invoice_number: number, invoice_date: today, amount: round2(amount),
      description, in_quickbooks: true, source: 'portal', created_by: staff!.id,
    });
    if (error) throw error;
  }

  try {
    switch (action) {
      case 'align_total': {
        if (!reason) return go('error', 'Indiquez la raison de l’ajustement.');
        const r = await compareSupplier(admin, sid);
        if (!r || r.diff === null) return go('error', 'Fournisseur non lié à QuickBooks.');
        if (Math.abs(r.diff) < 0.01) return go('ok', 'Déjà concordant.');
        await adjust(-r.diff, null, `Ajustement pour concorder avec QuickBooks — ${reason}`);
        await log('qbo_reconcile_align', { from: r.portalOwed, to: r.qbBalance, amount: -r.diff });
        return go('ok', `Solde du portail ajusté de ${(-r.diff).toFixed(2)} $ pour concorder avec QuickBooks.`);
      }
      case 'adjust_line': {
        if (!isUuid(invoiceId)) return go('error', 'Facture invalide');
        if (!reason) return go('error', 'Indiquez la raison de l’ajustement.');
        const { data: inv } = await admin.from('ap_invoice_balances').select('invoice_number, open_amount').eq('id', invoiceId).eq('supplier_id', sid).maybeSingle();
        if (!inv) return go('error', 'Facture introuvable');
        const target = n(form.get('qb_balance'));
        const delta = round2(target - n(inv.open_amount));
        if (Math.abs(delta) < 0.01) return go('ok', 'Déjà concordant.');
        await adjust(delta, inv.invoice_number, `Ajustement facture ${inv.invoice_number ?? ''} pour concorder avec QuickBooks — ${reason}`);
        await log('qbo_reconcile_line', { invoice: inv.invoice_number, from: n(inv.open_amount), to: target, amount: delta });
        return go('ok', `Facture ${inv.invoice_number ?? ''} ajustée à ${target.toFixed(2)} $.`);
      }
      case 'settle': {
        if (!isUuid(invoiceId)) return go('error', 'Facture invalide');
        if (!reason) return go('error', 'Indiquez la raison.');
        const { data: inv } = await admin.from('ap_invoice_balances').select('invoice_number, open_amount').eq('id', invoiceId).eq('supplier_id', sid).maybeSingle();
        if (!inv) return go('error', 'Facture introuvable');
        await adjust(-n(inv.open_amount), inv.invoice_number, `Soldée pour concorder avec QuickBooks — ${reason}`);
        await log('qbo_reconcile_settle', { invoice: inv.invoice_number, amount: -n(inv.open_amount) });
        return go('ok', `Facture ${inv.invoice_number ?? ''} soldée dans le portail.`);
      }
      case 'import': {
        if (!qbId) return go('error', 'Document QB invalide');
        const { data: dup } = await admin.from('ap_invoices').select('id').eq('qbo_bill_id', qbId).is('voided_at', null).limit(1);
        if (dup?.length) return go('error', 'Ce document QB est déjà lié à une facture du portail.');
        const d = await fetchQbDoc(admin, qbType, qbId);
        if (!d) return go('error', 'Document introuvable dans QuickBooks');
        const total = n(d.TotalAmt), open = n(d.Balance);
        const credit = qbType === 'VendorCredit';
        const partial = Math.abs(total - open) >= 0.01;
        const { error } = await admin.from('ap_invoices').insert({
          supplier_id: sid, kind: credit ? 'credit' : 'invoice', invoice_number: d.DocNumber ?? null,
          invoice_date: d.TxnDate ?? null, due_date: credit ? null : d.DueDate ?? null,
          amount: credit ? -open : open,
          description: [partial ? `Solde ouvert importé de QB (total ${total.toFixed(2)} $)` : null, d.PrivateNote ?? d.Line?.[0]?.Description ?? null].filter(Boolean).join(' — ') || null,
          in_quickbooks: true, source: 'qbo', qbo_bill_id: qbId, qbo_synced_at: new Date().toISOString(),
        });
        if (error) throw error;
        await log('qbo_reconcile_import', { invoice: d.DocNumber ?? null, qbo_id: qbId, type: qbType, amount: credit ? -open : open });
        return go('ok', `${credit ? 'Crédit' : 'Facture'} ${d.DocNumber ?? ''} importé(e) de QuickBooks.`);
      }
      case 'link': {
        if (!isUuid(invoiceId) || !qbId) return go('error', 'Choisissez la facture QB à lier.');
        const { error } = await admin.from('ap_invoices').update({ qbo_bill_id: qbId, in_quickbooks: true, qbo_synced_at: new Date().toISOString(), qbo_error: null })
          .eq('id', invoiceId).eq('supplier_id', sid);
        if (error) throw error;
        await log('qbo_reconcile_link', { invoice_id: invoiceId, qbo_id: qbId });
        return go('ok', 'Facture liée au document QuickBooks.');
      }
      case 'push': {
        if (!isUuid(invoiceId)) return go('error', 'Facture invalide');
        const r = await pushInvoice(admin, invoiceId, { force: true });
        if (r.ok) await log('qbo_reconcile_push', { invoice_id: invoiceId });
        return go(r.ok ? 'ok' : 'error', r.message);
      }
    }
  } catch (e) {
    console.error('[qbo] reconcile failed:', action, e);
    return go('error', e instanceof Error ? e.message : String(e));
  }
  return redirect(back, 303);
};
