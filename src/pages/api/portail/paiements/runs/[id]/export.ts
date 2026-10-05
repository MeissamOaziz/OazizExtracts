import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { isUuid, loadRun, loadAccounts, loadSuppliers, paymentAmounts, n } from '../../../../../../lib/payables';

export const prerender = false;

// CSV of a run (opens in Excel): cash lines, then one row per supplier with a
// balance or a line — the same columns as the old summary tab, plus paid/remittance.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const runId = String(params.id ?? '');
  if (!isUuid(runId)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const loaded = await loadRun(admin, runId);
  if (!loaded) return new Response('Not found', { status: 404 });
  const { run, cash, lines } = loaded;
  const [accounts, suppliers] = await Promise.all([loadAccounts(admin), loadSuppliers(admin, { includeInactive: true })]);
  const paid = await paymentAmounts(admin, lines.map((l) => l.payment_id).filter((x): x is string => !!x));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const byS = new Map(lines.map((l) => [l.supplier_id, l]));

  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const amt = (v: number | null | undefined) => (v === null || v === undefined ? '' : n(v).toFixed(2).replace('.', ','));
  const rows: string[][] = [];
  rows.push([`Paiements fournisseurs — semaine du ${run.run_date}`, `Statut: ${run.status}`]);
  rows.push([]);
  rows.push(['Compte', 'Ligne de trésorerie', 'Montant', 'Au']);
  for (const c of cash) rows.push([accName.get(c.bank_account_id) ?? '', c.label, amt(c.amount), c.as_of ?? '']);
  rows.push([]);
  rows.push(['Fournisseur', 'Compte', 'Mode', 'Total dû', 'Échu', 'Suggéré', 'Note', 'Approuvé', 'Note approbateur', 'Payé', 'Remise envoyée', 'Infos de paiement', 'Note permanente']);
  for (const s of suppliers) {
    const l = byS.get(s.id);
    if (!l && Math.abs(s.bal.owed) < 0.005) continue;
    rows.push([
      s.name, accName.get(s.bank_account_id ?? '') ?? '', s.payment_method, amt(s.bal.owed), amt(s.bal.overdue),
      amt(l?.suggested_amount), l?.suggested_note ?? '', amt(l?.approved_amount), l?.approver_note ?? '',
      l?.payment_id ? amt(paid.get(l.payment_id) ?? null) : '', l?.remittance_sent_at ? l.remittance_sent_at.slice(0, 10) : '',
      s.payment_details ?? '', s.notes ?? '',
    ]);
  }
  // Semicolons + BOM: opens cleanly in a French-locale Excel.
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="paiements-${run.run_date}.csv"`,
    },
  });
};
