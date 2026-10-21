// Customer SKUs (ps_customer_skus, migration 0087): the buyer's item number for
// each product and how many units ship per case. Used to fill the item # and
// the case count on shipping work orders and the OCS documents.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isOcs, type SwoLine } from './production-swo';

export type SkuCustomer = 'OCS' | 'SQDC' | 'TEEDY';
export const SKU_CUSTOMERS: readonly SkuCustomer[] = ['OCS', 'SQDC', 'TEEDY'];

export interface CustomerSku {
  id: string; customer: SkuCustomer; item_no: string; product_name: string;
  units_per_case: number | null; is_active: boolean;
}

/** OCS ships every current SKU in cases of 6 unless the SKU says otherwise. */
export const OCS_DEFAULT_UNITS_PER_CASE = 6;
/** The OCS ships through Les Messagers, contact Khloe Dias. */
export const OCS_CARRIER = 'Les Messagers';
export const OCS_CONTACT = 'Khloe Dias';

export function skuCustomer(customer: string | null | undefined): SkuCustomer | null {
  if (isOcs(customer)) return 'OCS';
  if (/\bSQDC\b|soci[ée]t[ée] qu[ée]b[ée]coise du cannabis/i.test(customer ?? '')) return 'SQDC';
  if (/\bteedy\b/i.test(customer ?? '')) return 'TEEDY';
  return null;
}

/** OCS POs print the SKU as "107510_28g___"; its documents use "107510_28g_". */
export const normItemNo = (s: string | null | undefined) => (s ? s.trim().replace(/_+$/, '_') : null);

/** OCS PO numbers carry a revision suffix ("PO-0113975-1"); its documents use the base number. */
export const ocsPoNumber = (po: string | null | undefined) => (po ? po.trim().replace(/^(PO-\d+)-\d+$/i, '$1') : po ?? null);

const key = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

export async function loadSkus(admin: SupabaseClient, customer?: SkuCustomer | null): Promise<CustomerSku[]> {
  let q = admin.from('ps_customer_skus').select('*').order('customer').order('item_no');
  if (customer) q = q.eq('customer', customer);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CustomerSku[];
}

/** The SKU of a work order line: by item #, else by product name. */
export function matchSku(skus: CustomerSku[], line: Pick<SwoLine, 'item_no' | 'product_name'>): CustomerSku | null {
  const item = normItemNo(line.item_no);
  if (item) {
    const byItem = skus.find((s) => s.item_no === item);
    if (byItem) return byItem;
  }
  const name = key(line.product_name ?? '');
  return name ? skus.find((s) => key(s.product_name) === name) ?? null : null;
}

/** Cases for a line: written by production, else units ÷ units per case (rounded up). */
export function casesFor(line: Pick<SwoLine, 'cases' | 'final_quantity' | 'po_quantity' | 'item_no' | 'product_name'>,
  skus: CustomerSku[], customer: SkuCustomer | null): number | null {
  if (line.cases !== null && line.cases !== undefined) return line.cases;
  const units = line.final_quantity ?? line.po_quantity;
  const perCase = matchSku(skus, line)?.units_per_case ?? (customer === 'OCS' ? OCS_DEFAULT_UNITS_PER_CASE : null);
  return units && perCase ? Math.ceil(units / perCase) : null;
}

/** Fills the item # left blank on lines, from the customer's SKUs. */
export function withItemNumbers(lines: SwoLine[], skus: CustomerSku[]): SwoLine[] {
  return lines.map((l) => {
    if (l.item_no) return { ...l, item_no: normItemNo(l.item_no) };
    const sku = matchSku(skus, l);
    return sku ? { ...l, item_no: sku.item_no } : l;
  });
}

/**
 * New SKUs read from a PO are remembered for the next orders (OCS ones in
 * cases of 6). Existing SKUs are left as they are.
 */
export async function learnSkus(admin: SupabaseClient, customer: SkuCustomer | null, lines: SwoLine[]): Promise<void> {
  if (!customer) return;
  const rows = lines.filter((l) => l.item_no && l.product_name).map((l) => ({
    customer, item_no: normItemNo(l.item_no)!, product_name: l.product_name,
    units_per_case: customer === 'OCS' ? OCS_DEFAULT_UNITS_PER_CASE : null,
  }));
  if (!rows.length) return;
  const { error } = await admin.from('ps_customer_skus').upsert(rows, { onConflict: 'customer,item_no', ignoreDuplicates: true });
  if (error) console.error('[skus] learn failed:', error);
}
