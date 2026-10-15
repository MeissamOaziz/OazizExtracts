import type { APIRoute } from 'astro';
import { createServerClient, currentStaff } from '../../../../lib/supabase';
import { READABLE_TYPES, readPurchaseOrder, readingAvailable } from '../../../../lib/production-swo';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// "Lire le bon de commande" on the request form: reads the PO with Claude and
// returns what it found. Nothing is saved; the person checks the prefilled form.
export const POST: APIRoute = async ({ request, cookies }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  if (!readingAvailable()) return json({ error: 'no_key' }, 503);
  const file = (await request.formData()).get('file');
  if (!(file instanceof File) || file.size === 0 || !READABLE_TYPES.includes(file.type) || file.size > 20 * 1024 * 1024) {
    return json({ error: 'bad_file' }, 400);
  }
  try {
    const extracted = await readPurchaseOrder({ data: Buffer.from(await file.arrayBuffer()), mediaType: file.type });
    return json({ extracted });
  } catch (e) {
    console.error('[production] PO read failed:', e);
    return json({ error: 'read_failed' }, 502);
  }
};
