import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { connectionInfo } from '../../../lib/qbo';
import { syncAll } from '../../../lib/qbo-sync';

export const prerender = false;

// Nightly QuickBooks sync (see vercel.json): retries anything that failed to
// push during the day and pulls bills/payments entered directly in QB.
// Protected by CRON_SECRET, which Vercel sends as a Bearer token.
export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const admin = getAdminClient();
  if (!(await connectionInfo(admin))) return new Response(JSON.stringify({ skipped: 'not connected' }), { status: 200 });
  try {
    const summary = await syncAll(admin);
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[cron/qbo-sync] failed:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
