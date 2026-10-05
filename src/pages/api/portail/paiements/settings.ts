import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { setSetting, loadAccounts, logEvent, CASH_KINDS } from '../../../../lib/payables';

export const prerender = false;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const form = await request.formData();
  const admin = getAdminClient();

  const name = String(form.get('approver_name') ?? '').trim();
  const email = String(form.get('approver_email') ?? '').trim().toLowerCase();
  if (name && EMAIL.test(email)) await setSetting(admin, 'approver', { name, email });

  const notify = String(form.get('notify_emails') ?? '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e));
  await setSetting(admin, 'notify_emails', notify);

  const codes = new Set((await loadAccounts(admin)).map((a) => a.code));
  const template = String(form.get('cash_template') ?? '').split(/\r?\n/).map((line) => {
    const [account, kind, ...rest] = line.split('|');
    const label = rest.join('|').trim();
    if (!account || !codes.has(account.trim()) || !label) return null;
    return { account: account.trim(), kind: (CASH_KINDS as readonly string[]).includes((kind ?? '').trim()) ? kind.trim() : 'other', label };
  }).filter(Boolean);
  if (template.length) await setSetting(admin, 'cash_template', template);

  await logEvent(admin, { actor_staff_id: staff.id, action: 'settings_updated', details: { approver: email, notify } });
  return redirect('/portail/paiements/parametres?ok=saved', 303);
};
