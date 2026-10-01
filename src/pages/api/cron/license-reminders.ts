import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import {
  sendLicenseExpiryReminder, sendVendorLicenseExpiredNoticeInternal, sendVendorLicenseExpiredNoticeVendor,
} from '../../../lib/email';
import { REQUIRED_APPROVER_EMAILS } from '../../../lib/vendor-approvals';

export const prerender = false;

const KIND_LABEL: Record<string, string> = {
  cra: 'Agence du revenu du Canada (CRA)',
  health_canada: 'Santé Canada',
};

const VENDOR_LICENSE_FIELDS: Array<{ dateCol: 'file_cra_license_expiry' | 'file_health_canada_license_expiry'; sentAtCol: 'file_cra_license_reminder_sent_at' | 'file_health_canada_license_reminder_sent_at'; kind: string }> = [
  { dateCol: 'file_cra_license_expiry', sentAtCol: 'file_cra_license_reminder_sent_at', kind: 'cra' },
  { dateCol: 'file_health_canada_license_expiry', sentAtCol: 'file_health_canada_license_reminder_sent_at', kind: 'health_canada' },
];

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

    const daysUntilExpiry = Math.round((new Date(`${lic.expiry_date}T00:00:00Z`).getTime() - now.getTime()) / 86_400_000);
    const result = await sendLicenseExpiryReminder({
      toEmails: lic.reminder_recipients,
      kindLabel: KIND_LABEL[lic.kind] ?? lic.kind,
      expiryDate: lic.expiry_date,
      daysUntilExpiry,
    });
    if (result.status !== 'error') {
      await admin.from('company_licenses').update({ reminder_sent_at: now.toISOString() }).eq('kind', lic.kind);
      sent.push(lic.kind);
    }
  }

  // Vendor-uploaded licenses (CRA / Health Canada expiry dates captured on
  // the qualification form) — fire on the day each one reaches its expiry,
  // not on a lead-time schedule like our own licenses above.
  const { data: vendors, error: vendorErr } = await admin
    .from('vendor_submissions')
    .select(`
      id, company_name, email,
      file_cra_license_expiry, file_cra_license_reminder_sent_at,
      file_health_canada_license_expiry, file_health_canada_license_reminder_sent_at
    `)
    .eq('status', 'submitted');
  if (vendorErr) {
    console.error('[cron/license-reminders] vendor fetch failed:', vendorErr);
    return Response.json({ ok: true, remindersSent: sent, vendorFetchError: true });
  }

  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const vendorRemindersSent: string[] = [];

  for (const vendor of vendors ?? []) {
    for (const f of VENDOR_LICENSE_FIELDS) {
      const expiryDate = vendor[f.dateCol] as string | null;
      if (!expiryDate) continue;
      if (vendor[f.sentAtCol]) continue; // already reminded for this expiry (cleared when the vendor gives us a new date)

      const expiry = new Date(`${expiryDate}T00:00:00Z`);
      if (now < expiry) continue; // fires on the day it expires, not before

      const daysUntilExpiry = Math.round((expiry.getTime() - now.getTime()) / 86_400_000);
      const kindLabel = KIND_LABEL[f.kind] ?? f.kind;

      const internalResult = await sendVendorLicenseExpiredNoticeInternal({
        toEmails: [...REQUIRED_APPROVER_EMAILS],
        companyName: vendor.company_name,
        kindLabel,
        expiryDate,
        daysUntilExpiry,
        submissionUrl: `${siteUrl}/portail/fournisseurs/${vendor.id}`,
      });

      let vendorResult: { status: string } = { status: 'skipped_no_key' };
      if (vendor.email) {
        vendorResult = await sendVendorLicenseExpiredNoticeVendor({
          toEmail: vendor.email,
          companyName: vendor.company_name,
          kindLabel,
          expiryDate,
          daysUntilExpiry,
        });
      }

      if (internalResult.status !== 'error' && vendorResult.status !== 'error') {
        await admin.from('vendor_submissions').update({ [f.sentAtCol]: now.toISOString() }).eq('id', vendor.id);
        vendorRemindersSent.push(`${vendor.id}:${f.kind}`);
      }
    }
  }

  return Response.json({ ok: true, remindersSent: sent, vendorRemindersSent });
};
