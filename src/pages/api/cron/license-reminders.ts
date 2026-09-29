import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { sendLicenseExpiryReminder } from '../../../lib/email';

export const prerender = false;

const KIND_LABEL: Record<string, string> = {
  cra: 'Agence du revenu du Canada (CRA)',
  health_canada: 'Santé Canada',
};

function monthsBefore(dateStr: string, months: number): Date {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

// Vercel Cron hits this once a day (see vercel.json). Protected by CRON_SECRET
// when that env var is set — configure it in Vercel's project settings and
// Vercel automatically sends it as a Bearer token on cron-triggered requests.
export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new Response('unauthorized', { status: 401 });
    }
  }

  const admin = getAdminClient();
  const { data: licenses, error } = await admin
    .from('company_licenses')
    .select('kind, expiry_date, reminder_recipients, reminder_sent_at');
  if (error) {
    console.error('[cron/license-reminders] fetch failed:', error);
    return Response.json({ error: 'fetch_failed' }, { status: 500 });
  }

  const now = new Date();
  const sent: string[] = [];

  for (const lic of licenses ?? []) {
    if (!lic.expiry_date || !lic.reminder_recipients || lic.reminder_recipients.length === 0) continue;
    if (lic.reminder_sent_at) continue; // already reminded for this expiry_date (cleared whenever it changes)

    const reminderStart = monthsBefore(lic.expiry_date, 6);
    if (now < reminderStart) continue;

    const result = await sendLicenseExpiryReminder({
      toEmails: lic.reminder_recipients,
      kindLabel: KIND_LABEL[lic.kind] ?? lic.kind,
      expiryDate: lic.expiry_date,
    });
    if (result.status !== 'error') {
      await admin.from('company_licenses').update({ reminder_sent_at: now.toISOString() }).eq('kind', lic.kind);
      sent.push(lic.kind);
    }
  }

  return Response.json({ ok: true, remindersSent: sent });
};
