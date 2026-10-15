// Vendor qualification → QuickBooks vendor, for the accountants.
//
// QuickBooks is strict: an unknown or refused field makes the whole request
// fail. So the vendor is created with the fields every QBO company accepts
// (name, company, billing address, phone, one email), then each extra is tried
// on its own as a sparse update — all contact emails, the shipping address,
// the business number and the banking notes. Whatever QuickBooks refuses or
// silently drops is reported on the VQ page instead of breaking the creation.
//
// Nothing is created without an accountant pressing the button, and similar
// existing vendors are offered first: a duplicate vendor in the real books is
// worse than a missing one (same rule as the Paiements sync).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Qbo } from './qbo';
import { nameScore } from './name-match';

export interface VendorSubmission {
  id: string; company_name: string; address: string | null; city: string | null; province: string | null; postal_code: string | null;
  shipping_same_as_billing: boolean | null; shipping_address: string | null; shipping_city: string | null;
  shipping_province: string | null; shipping_postal_code: string | null;
  contact_person: string | null; email: string | null; phone: string | null; phone_ext: string | null;
  sales_contact_name: string | null; sales_contact_email: string | null;
  qa_contact_name: string | null; qa_contact_email: string | null;
  accounting_contact_name: string | null; accounting_contact_email: string | null;
  business_number: string | null; gst_hst_number: string | null; qst_number: string | null;
  bank_institution_number: string | null; bank_transit_number: string | null; bank_account_number: string | null;
  qbo_vendor_id: string | null; ap_supplier_id: string | null;
}

export type FieldKey = 'emails' | 'shipping' | 'business_number' | 'notes';
export interface PushReport {
  vendor_id: string; vendor_name: string; created: boolean;
  fields: Partial<Record<FieldKey, 'kept' | 'refused' | 'dropped' | 'skipped'>>;
  errors: Partial<Record<FieldKey, string>>;
  supplier: 'created' | 'linked' | 'updated';
}

const clip = (s: string | null | undefined, n: number) => (s ?? '').trim().slice(0, n);
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Every distinct contact email on the VQ, main contact first. */
export function contactEmails(s: VendorSubmission): string[] {
  const all = [s.email, s.accounting_contact_email, s.sales_contact_email, s.qa_contact_email]
    .map((e) => (e ?? '').trim().toLowerCase()).filter((e) => EMAIL.test(e));
  return [...new Set(all)];
}

/** As many whole addresses as fit QuickBooks' 100-character email box. */
export function joinEmails(list: string[], max = 100): string {
  let out = '';
  for (const e of list) {
    const next = out ? `${out}, ${e}` : e;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** The three lines asked for in the vendor's notes: institution, transit, account. */
export function bankNotes(s: VendorSubmission): string | null {
  if (!s.bank_institution_number && !s.bank_transit_number && !s.bank_account_number) return null;
  return [
    `Institution : ${s.bank_institution_number ?? ''}`.trim(),
    `Transit : ${s.bank_transit_number ?? ''}`.trim(),
    `Compte : ${s.bank_account_number ?? ''}`.trim(),
  ].join('\n');
}

// Vendors type the province freely ("qc", "Saskatchewan", "Québec"): send the code.
const PROVINCES: Record<string, string> = {
  ab: 'AB', alberta: 'AB', bc: 'BC', 'british columbia': 'BC', 'colombie britannique': 'BC', mb: 'MB', manitoba: 'MB',
  nb: 'NB', 'new brunswick': 'NB', 'nouveau brunswick': 'NB', nl: 'NL', newfoundland: 'NL', 'newfoundland and labrador': 'NL',
  'terre neuve et labrador': 'NL', ns: 'NS', 'nova scotia': 'NS', 'nouvelle ecosse': 'NS', nt: 'NT', 'northwest territories': 'NT',
  'territoires du nord ouest': 'NT', nu: 'NU', nunavut: 'NU', on: 'ON', ontario: 'ON', pe: 'PE', pei: 'PE',
  'prince edward island': 'PE', 'ile du prince edouard': 'PE', qc: 'QC', pq: 'QC', quebec: 'QC', sk: 'SK', saskatchewan: 'SK',
  yt: 'YT', yukon: 'YT',
};
export function provinceCode(p: string | null): string {
  const k = (p ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim();
  return PROVINCES[k] ?? clip(p, 255);
}

/** A business number has digits; vendors sometimes type their name in the box. */
export function businessNumber(s: VendorSubmission): string | null {
  const bn = (s.business_number ?? '').trim();
  return (bn.match(/\d/g) ?? []).length >= 9 ? clip(bn, 30) : null;
}

const fold = (v: string | null | undefined) =>
  (v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

/**
 * Vendors often type the whole address on the street line ("100 avenue X,
 * Saint-Georges, Qc, Canada, G5Z 0L1") and then the city, province and postal
 * code again in their own boxes. Trailing pieces of the street line that
 * repeat those boxes (or say "Canada") are dropped, so QuickBooks does not
 * print the address twice. Returns the cleaned line and whether it changed.
 */
export function cleanStreetLine(line: string | null, city: string | null, prov: string | null, postal: string | null): { line: string; changed: boolean } {
  const original = (line ?? '').trim();
  if (!original) return { line: '', changed: false };
  const repeats = new Set([fold(city), fold(prov), fold(provinceCode(prov)), fold(postal), 'canada', 'ca'].filter((x) => x.length >= 2));
  // "Saint-Georges QC G5Z0L1" in one piece counts too.
  const combos = [fold(`${city ?? ''}${provinceCode(prov)}${postal ?? ''}`), fold(`${city ?? ''}${prov ?? ''}${postal ?? ''}`),
    fold(`${provinceCode(prov)}${postal ?? ''}`), fold(`${prov ?? ''}${postal ?? ''}`)].filter((x) => x.length >= 4);
  const parts = original.split(',').map((x) => x.trim());
  // The postal code on the street line is the tell that the whole address was
  // typed there; without it, a street can share a city's name (boul. Saint-Laurent).
  let sawPostal = false;
  while (parts.length > 1) {
    const last = fold(parts[parts.length - 1]);
    if (!last || repeats.has(last) || combos.includes(last)) {
      if (postal && last.includes(fold(postal))) sawPostal = true;
      parts.pop();
    } else break;
  }
  let cleaned = parts.join(', ');
  // No commas at all: a postal code glued to the end of the street line.
  if (postal && fold(cleaned).endsWith(fold(postal)) && fold(cleaned) !== fold(postal)) {
    const re = new RegExp(`[\\s,]*${(postal ?? '').trim().replace(/\s+/g, '').split('').join('\\s*')}\\s*$`, 'i');
    cleaned = cleaned.replace(re, '').trim();
    sawPostal = true;
  }
  // Then trailing words that spell the city, province or country ("… Montreal QC").
  const words = cleaned.split(/\s+/);
  for (let changed = sawPostal; changed && words.length > 2;) {
    changed = false;
    for (let k = Math.min(4, words.length - 2); k >= 1; k--) {
      const tail = fold(words.slice(-k).join(' '));
      if (repeats.has(tail) || combos.includes(tail)) { words.splice(-k, k); changed = true; break; }
    }
  }
  cleaned = words.join(' ').replace(/[\s,]+$/, '');
  return { line: cleaned, changed: cleaned !== original };
}

function addr(line: string | null, city: string | null, prov: string | null, postal: string | null) {
  if (!line && !city && !postal) return null;
  const street = cleanStreetLine(line, city, prov, postal);
  return {
    Line1: clip(street.line, 500), City: clip(city, 255), CountrySubDivisionCode: provinceCode(prov),
    PostalCode: clip(postal, 30), Country: 'Canada',
    // Not sent to QuickBooks: shown on the preview when the street line was corrected.
    typed: street.changed ? clip(line, 500) : null,
  };
}

/** The address as QuickBooks takes it (without the preview-only "typed" line). */
const qbAddr = (a: ReturnType<typeof addr>) => {
  if (!a) return null;
  const { typed: _typed, ...rest } = a;
  return rest;
};
export const billingAddress = (s: VendorSubmission) => addr(s.address, s.city, s.province, s.postal_code);
export const shippingAddress = (s: VendorSubmission) => (s.shipping_same_as_billing
  ? null : addr(s.shipping_address, s.shipping_city, s.shipping_province, s.shipping_postal_code));

export function phoneText(s: VendorSubmission): string | null {
  if (!s.phone) return null;
  return clip(s.phone_ext ? `${s.phone} x${s.phone_ext}` : s.phone, 30);
}

/** What will be sent, for the preview on the VQ page. */
export function vendorPreview(s: VendorSubmission, displayName?: string) {
  const emails = contactEmails(s);
  return {
    displayName: clip(displayName || s.company_name, 100),
    companyName: clip(s.company_name, 100),
    emails,
    phone: phoneText(s),
    billing: billingAddress(s),
    shipping: shippingAddress(s),
    businessNumber: businessNumber(s),
    notes: bankNotes(s),
  };
}

export type VendorDraft = ReturnType<typeof vendorPreview>;

/**
 * The draft as edited on the VQ page (every field prefilled from the VQ,
 * cleaned, then changeable by the accountant). Blank fields are left out.
 */
export function draftFromForm(form: FormData): VendorDraft | { error: string } {
  const g = (k: string) => String(form.get(k) ?? '').trim();
  const emails = g('emails').split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean);
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { error: `courriel invalide : ${bad}` };
  const address = (p: string) => {
    const line = g(`${p}_line`), city = g(`${p}_city`), prov = g(`${p}_prov`), postal = g(`${p}_postal`);
    if (!line && !city && !postal) return null;
    return { Line1: clip(line, 500), City: clip(city, 255), CountrySubDivisionCode: provinceCode(prov), PostalCode: clip(postal, 30), Country: 'Canada', typed: null as string | null };
  };
  const displayName = clip(g('display_name'), 100);
  if (!displayName) return { error: 'nom du fournisseur manquant' };
  return {
    displayName,
    companyName: clip(g('company_name') || displayName, 100),
    emails: [...new Set(emails)],
    phone: clip(g('phone'), 30) || null,
    billing: address('bill'),
    shipping: form.get('ship_same') ? null : address('ship'),
    businessNumber: clip(g('business_number'), 30) || null,
    notes: g('notes').replace(/\r\n/g, '\n').slice(0, 2000) || null,
  };
}

/** Existing QB vendors that look like this supplier, best first. */
export async function similarVendors(qbo: Qbo, s: VendorSubmission): Promise<Array<{ id: string; name: string; company: string | null; score: number }>> {
  const vendors = await qbo.query('Vendor', 'Active = true');
  return vendors
    .map((v) => ({
      id: String(v.Id), name: String(v.DisplayName), company: v.CompanyName ?? null,
      score: Math.max(nameScore(s.company_name, v.DisplayName), nameScore(s.company_name, v.CompanyName)),
    }))
    .filter((v) => v.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** One sparse update; returns the error text when QuickBooks refuses it. */
async function tryUpdate(qbo: Qbo, id: string, fields: Record<string, unknown>): Promise<string | null> {
  try {
    const cur = (await qbo.get(`/vendor/${id}`)).Vendor;
    await qbo.post('/vendor', { Id: id, SyncToken: cur.SyncToken, sparse: true, ...fields });
    return null;
  } catch (e) {
    return String((e as Error)?.message ?? e).slice(0, 300);
  }
}

/**
 * Creates the QB vendor (or links an existing one), then links or creates the
 * matching Paiements supplier, and records it all on the submission.
 */
export async function pushVendor(
  admin: SupabaseClient, qbo: Qbo, s: VendorSubmission, staffId: string,
  opts: { linkVendorId?: string; draft?: VendorDraft },
): Promise<PushReport> {
  const p = opts.draft ?? vendorPreview(s);
  const report: PushReport = { vendor_id: '', vendor_name: '', created: false, fields: {}, errors: {}, supplier: 'linked' };

  if (opts.linkVendorId) {
    const v = (await qbo.get(`/vendor/${opts.linkVendorId}`)).Vendor;
    report.vendor_id = String(v.Id); report.vendor_name = String(v.DisplayName);
  } else {
    // 1. The safe core.
    const res = await qbo.post('/vendor', {
      DisplayName: p.displayName,
      CompanyName: p.companyName,
      PrintOnCheckName: p.companyName,
      ...(p.emails[0] ? { PrimaryEmailAddr: { Address: p.emails[0] } } : {}),
      ...(p.phone ? { PrimaryPhone: { FreeFormNumber: p.phone } } : {}),
      ...(p.billing ? { BillAddr: qbAddr(p.billing) } : {}),
    });
    report.vendor_id = String(res.Vendor.Id); report.vendor_name = String(res.Vendor.DisplayName); report.created = true;

    // 2. Each extra on its own.
    const steps: Array<[FieldKey, Record<string, unknown> | null]> = [
      // QB accepts several addresses separated by commas in the email box (100 characters).
      ['emails', p.emails.length > 1 ? { PrimaryEmailAddr: { Address: joinEmails(p.emails) } } : null],
      ['shipping', p.shipping ? { ShipAddr: qbAddr(p.shipping) } : null],
      ['business_number', p.businessNumber ? { BusinessNumber: p.businessNumber } : null],
      ['notes', p.notes ? { Notes: p.notes } : null],
    ];
    for (const [key, fields] of steps) {
      if (!fields) { report.fields[key] = 'skipped'; continue; }
      const err = await tryUpdate(qbo, report.vendor_id, fields);
      if (err) { report.fields[key] = 'refused'; report.errors[key] = err; } else report.fields[key] = 'kept';
    }

    // 3. Read back: an accepted field that does not come back was dropped.
    const back = (await qbo.get(`/vendor/${report.vendor_id}`)).Vendor;
    const check: Array<[FieldKey, boolean]> = [
      ['emails', !!back.PrimaryEmailAddr?.Address && back.PrimaryEmailAddr.Address.includes(',')],
      ['shipping', !!back.ShipAddr],
      ['business_number', !!back.BusinessNumber],
      ['notes', !!back.Notes],
    ];
    for (const [key, ok] of check) if (report.fields[key] === 'kept' && !ok) report.fields[key] = 'dropped';
  }

  // 4. The Paiements supplier: the one already linked to this vendor, else one
  //    with the same name, else a new one — so payments use the same record.
  const supplierFields = {
    legal_name: s.company_name,
    contact_name: s.accounting_contact_name || s.contact_person,
    contact_email: s.accounting_contact_email || s.email || p.emails[0] || null,
    remittance_email: s.accounting_contact_email || s.email || p.emails[0] || null,
    gst_number: s.gst_hst_number, qst_number: s.qst_number,
    payment_details: p.notes,
  };
  const { data: byVendor } = await admin.from('ap_suppliers').select('id, qbo_vendor_id').eq('qbo_vendor_id', report.vendor_id).maybeSingle();
  let supplierId: string;
  if (byVendor) {
    supplierId = byVendor.id; report.supplier = 'linked';
  } else {
    // Same name or legal name, case-insensitive (ilike without wildcards).
    const literal = s.company_name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const [{ data: n1 }, { data: n2 }] = await Promise.all([
      admin.from('ap_suppliers').select('id, qbo_vendor_id').ilike('name', literal),
      admin.from('ap_suppliers').select('id, qbo_vendor_id').ilike('legal_name', literal),
    ]);
    const byName = [...new Map([...(n1 ?? []), ...(n2 ?? [])].map((r) => [r.id, r])).values()];
    const hit = byName.length === 1 && !byName[0].qbo_vendor_id ? byName[0] : null;
    if (hit) {
      supplierId = hit.id; report.supplier = 'updated';
    } else {
      const { data: made, error } = await admin.from('ap_suppliers').insert({
        name: report.vendor_name, qbo_vendor_name: report.vendor_name, ...supplierFields,
      }).select('id').single();
      if (error || !made) throw error ?? new Error('supplier insert failed');
      supplierId = made.id; report.supplier = 'created';
    }
  }
  // Fill what the supplier is missing; never overwrite what an accountant entered.
  const { data: cur } = await admin.from('ap_suppliers').select('*').eq('id', supplierId).single();
  const patch: Record<string, unknown> = { qbo_vendor_id: report.vendor_id, qbo_vendor_name: cur?.qbo_vendor_name ?? report.vendor_name };
  for (const [k, v] of Object.entries(supplierFields)) if (v && !cur?.[k]) patch[k] = v;
  await admin.from('ap_suppliers').update(patch).eq('id', supplierId);

  await admin.from('vendor_submissions').update({
    qbo_vendor_id: report.vendor_id, qbo_vendor_name: report.vendor_name, ap_supplier_id: supplierId,
    qbo_pushed_at: new Date().toISOString(), qbo_pushed_by: staffId, qbo_push_report: report,
  }).eq('id', s.id);
  await admin.from('qbo_sync_log').insert({
    direction: 'push', entity: 'vendor', portal_id: supplierId, qbo_id: report.vendor_id, status: 'ok',
    message: `${report.created ? 'Fournisseur créé dans QB depuis la VQ' : 'VQ liée au fournisseur QB'} : ${report.vendor_name}`,
  });
  return report;
}
