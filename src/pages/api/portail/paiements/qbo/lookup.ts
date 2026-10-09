import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { json } from '../../../../../lib/payables';
import { getQbo, qstr } from '../../../../../lib/qbo';

export const prerender = false;

// Read-only: which QB transactions already carry these reference numbers
// (bill payments, expenses/cheques). Used to avoid pushing duplicates of
// payments that were also entered in QuickBooks by hand.
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  const docs = (url.searchParams.get('docs') ?? '').split(',').map((d) => d.trim()).filter((d) => /^[\w-]{1,21}$/.test(d)).slice(0, 60);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('since') ?? '') ? url.searchParams.get('since')! : null;
  const qbo = await getQbo(getAdminClient());
  if (!qbo) return json({ error: 'QuickBooks non connecté' }, 409);
  const out: Array<Record<string, unknown>> = [];
  const pick = (type: string, t: any) => ({
    type, id: t.Id, doc: t.DocNumber ?? null, date: t.TxnDate, amount: t.TotalAmt,
    vendor: t.VendorRef?.name ?? t.EntityRef?.name ?? null, balance: t.Balance ?? null, created: t.MetaData?.CreateTime ?? null, note: t.PrivateNote ?? null,
    bills: (t.Line ?? []).flatMap((l: any) => (l.LinkedTxn ?? []).map((x: any) => `${x.TxnType}:${x.TxnId}`)),
  });
  const entities = url.searchParams.get('bills') === '1' ? ['Bill'] : ['BillPayment', 'Purchase'];
  for (const entity of entities) {
    if (docs.length) {
      const list = docs.map((d) => qstr(d)).join(', ');
      for (const t of await qbo.query(entity, `DocNumber IN (${list})`)) out.push(pick(entity, t));
    }
    if (since) {
      for (const t of await qbo.query(entity, `TxnDate >= ${qstr(since)}`)) {
        if (!out.some((o) => o.type === entity && o.id === t.Id)) out.push(pick(entity, t));
      }
    }
  }
  return json({ count: out.length, results: out });
};
