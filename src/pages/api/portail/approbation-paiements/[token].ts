import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../../lib/supabase';
import { json, loadRunByToken } from '../../../../lib/payables';
import { submitApproval } from '../../../../lib/payables-approval';

export const prerender = false;

// Approval submitted from the emailed link (no login; the token is the key).
export const POST: APIRoute = async ({ request, params }) => {
  const admin = getAdminClient();
  const loaded = await loadRunByToken(admin, String(params.token ?? ''));
  if (!loaded) return json({ error: 'Lien invalide.' }, 404);
  if (loaded.run.token_expires_at && new Date(loaded.run.token_expires_at) < new Date()) {
    return json({ error: 'Lien expiré — connectez-vous au portail pour approuver.' }, 410);
  }
  const body = await request.json().catch(() => null);
  const res = await submitApproval(admin, loaded, body, {
    label: loaded.run.approver_name ?? 'Approbateur', staffId: null, via: 'link',
    ip: request.headers.get('x-forwarded-for'),
  });
  return res.ok ? json({ ok: true }) : json({ error: res.error }, res.status);
};
