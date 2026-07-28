import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../lib/supabase';

export const prerender = false;

// Receives {access_token, refresh_token} from the tiny client-side shim on
// /portail when a Supabase invite / recovery link lands with an implicit-flow
// hash fragment. Calls setSession server-side so the auth cookies get set on
// our domain; the client then redirects to /portail/definir-mot-de-passe.
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const access_token = String(body?.access_token ?? '');
    const refresh_token = String(body?.refresh_token ?? '');
    if (!access_token || !refresh_token) {
      return Response.json({ error: 'missing_tokens' }, { status: 400 });
    }

    const supabase = createServerClient(request, cookies);
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      console.error('[hash-callback] setSession failed:', error);
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[hash-callback] unexpected error:', e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
};
