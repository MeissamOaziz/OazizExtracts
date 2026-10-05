import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { completeConnection } from '../../../../../lib/qbo';
import { linkVendors } from '../../../../../lib/qbo-sync';

export const prerender = false;

// Intuit redirects here after the user authorizes the app.
export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const back = '/portail/paiements/quickbooks';
  const state = url.searchParams.get('state');
  const expected = cookies.get('qbo_oauth_state')?.value;
  cookies.delete('qbo_oauth_state', { path: '/api/portail/paiements/qbo' });
  if (url.searchParams.get('error')) return redirect(`${back}?error=denied`, 303);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  if (!state || state !== expected || !code || !realmId) return redirect(`${back}?error=state`, 303);

  const admin = getAdminClient();
  try {
    await completeConnection(admin, code, realmId, staff.id);
  } catch (e) {
    console.error('[qbo] connection failed:', e);
    return redirect(`${back}?error=token`, 303);
  }
  try { await linkVendors(admin); } catch (e) { console.error('[qbo] initial vendor link failed:', e); }
  return redirect(`${back}?ok=connected`, 303);
};
