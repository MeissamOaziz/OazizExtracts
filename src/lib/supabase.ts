import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient as ssrCreateServerClient, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const SUPABASE_URL = import.meta.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

type CookieBag = { name: string; value: string };
type CookieToSet = { name: string; value: string; options: CookieOptions };

// SSR client bound to Astro's cookie store.
// Reads all incoming cookies from the raw request header (Astro's AstroCookies
// doesn't expose an enumerator) and writes new/rotated cookies via Astro.cookies.set.
export function createServerClient(request: Request, cookies: AstroCookies): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not configured');
  }
  return ssrCreateServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll(): CookieBag[] {
        return parseCookieHeader(request.headers.get('cookie'));
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value, options } of cookiesToSet) {
          setSecureCookie(cookies, name, value, options);
        }
      },
    },
  });
}

// Anonymous, no-session Supabase client for server code. Use it when calling
// SECURITY DEFINER RPCs (e.g. the signer flow) — least-privilege compared to admin.
export function getAnonServerClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not configured');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Service-role client. Bypasses RLS. NEVER expose to the browser and NEVER include in a
// component that renders on the client. Use only inside server routes for privileged ops
// (invite users, mint signer tokens, write finalized documents, etc.).
export function getAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseCookieHeader(header: string | null): CookieBag[] {
  if (!header) return [];
  const out: CookieBag[] = [];
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    if (!name) continue;
    const value = pair.slice(idx + 1).trim();
    out.push({ name, value });
  }
  return out;
}

function setSecureCookie(
  cookies: AstroCookies,
  name: string,
  value: string,
  options: CookieOptions,
) {
  cookies.set(name, value, {
    path: options.path ?? '/',
    domain: options.domain,
    maxAge: options.maxAge,
    expires: options.expires,
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? import.meta.env.PROD,
    sameSite: options.sameSite ?? 'lax',
  });
}

// Resolve the current staff row for the logged-in user (or null if not signed in).
export async function currentStaff(
  supabase: SupabaseClient,
): Promise<{ id: string; full_name: string; email: string; title: string | null } | null> {
  const { data: userResult } = await supabase.auth.getUser();
  const email = userResult.user?.email;
  if (!email) return null;
  const { data, error } = await supabase
    .from('staff')
    .select('id, full_name, email, title')
    .eq('email', email)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
