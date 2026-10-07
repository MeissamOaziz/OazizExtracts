import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { isUuid } from '../../../../../lib/payables';
import { csvCell, defaultPeriod, describe, loadPaymentReport } from '../../../../../lib/payables-report';

export const prerender = false;

const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ?format=csv  → detailed list (Excel)
// ?format=qbo  → QuickBooks "Upload transactions" file: Date (dd/MM/yyyy),
//                Description, Amount (payments negative)
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return new Response('Unauthorized', { status: 401 });
  const def = defaultPeriod();
  const from = isDate(url.searchParams.get('from')) ? url.searchParams.get('from')! : def.from;
  const to = isDate(url.searchParams.get('to')) ? url.searchParams.get('to')! : def.to;
  const acc = url.searchParams.get('account');
  const accountId = acc === 'none' ? 'none' : isUuid(acc) ? acc : null;
  const format = url.searchParams.get('format') === 'qbo' ? 'qbo' : 'csv';

  const admin = getAdminClient();
  const { rows } = await loadPaymentReport(admin, { accountId, from, to });
  let accName = 'tous-comptes';
  if (accountId && accountId !== 'none') {
    const { data } = await admin.from('ap_bank_accounts').select('name').eq('id', accountId).maybeSingle();
    accName = (data?.name ?? 'compte').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  }

  let body: string;
  if (format === 'qbo') {
    const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    body = ['Date,Description,Amount', ...rows.map((r) => [dmy(r.paid_on), csvCell(describe(r)), (-r.amount).toFixed(2)].join(','))].join('\r\n');
  } else {
    const head = ['Date', 'Fournisseur', 'Compte', 'Mode', 'Référence', 'Montant', 'Factures', 'Dans QB', 'Remise envoyée', 'Notes'];
    body = '﻿' + [head.join(','), ...rows.map((r) => [
      r.paid_on, r.supplier, r.account, r.method ?? '', r.reference ?? '', r.amount.toFixed(2),
      r.invoices.join(' / '), r.in_qbo ? 'oui' : 'non', r.remittance_sent ? 'oui' : 'non', r.notes ?? '',
    ].map(csvCell).join(','))].join('\r\n');
  }
  const name = `paiements-${accName}-${from}-au-${to}${format === 'qbo' ? '-quickbooks' : ''}.csv`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
  });
};
