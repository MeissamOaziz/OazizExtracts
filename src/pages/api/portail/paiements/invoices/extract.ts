import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { localizeMsg } from '../../../../../lib/msg-i18n';
import { getPortailLocale } from '../../../../../lib/portail-i18n';
import { json, loadSuppliers } from '../../../../../lib/payables';
import { extractInvoice, extractionAvailable, matchSuppliers } from '../../../../../lib/payables-extract';

export const prerender = false;

const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Step 1 of "drop an invoice": store the file, read it with Claude, and suggest
// the supplier. Nothing is recorded as an invoice until the person confirms.
export const POST: APIRoute = async ({ request, cookies }) => {
  const L = (m: string) => localizeMsg(m, getPortailLocale(cookies));
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: L('unauthenticated') }, 401);
  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file || file.size === 0) return json({ error: L('Aucun fichier.') }, 400);
  if (!TYPES.includes(file.type)) return json({ error: L('PDF, JPG, PNG ou WEBP seulement.') }, 400);
  if (file.size > 20 * 1024 * 1024) return json({ error: L('Fichier trop volumineux (20 Mo max).') }, 400);

  const admin = getAdminClient();
  const data = Buffer.from(await file.arrayBuffer());
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
  const path = `inbox/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await admin.storage.from('payables').upload(path, data, { contentType: file.type });
  if (upErr) {
    console.error('[paiements] inbox upload failed:', upErr);
    return json({ error: L('Téléversement impossible.') }, 500);
  }

  if (!extractionAvailable()) {
    return json({ file_path: path, file_name: file.name, extracted: null, matches: [], warning: 'no_key' });
  }
  try {
    const extracted = await extractInvoice({ data, mediaType: file.type });
    const suppliers = await loadSuppliers(admin, { includeInactive: true });
    const matches = matchSuppliers(extracted, suppliers);
    let duplicateOf: string | null = null;
    if (matches[0] && extracted.invoice_number) {
      const { data: dup } = await admin.from('ap_invoices').select('id').eq('supplier_id', matches[0].id)
        .eq('invoice_number', extracted.invoice_number).is('voided_at', null).limit(1);
      if (dup?.length) duplicateOf = matches[0].id;
    }
    return json({ file_path: path, file_name: file.name, extracted, matches, duplicate_of: duplicateOf });
  } catch (e) {
    console.error('[paiements] invoice extraction failed:', e);
    return json({ file_path: path, file_name: file.name, extracted: null, matches: [], warning: 'extract_failed', detail: String((e as Error).message ?? e) });
  }
};
