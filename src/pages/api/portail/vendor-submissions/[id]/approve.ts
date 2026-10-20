import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { sendVendorChangesRequested } from '../../../../../lib/email';
import { mintToken } from '../../../../../lib/tokens';
import { contactEmails, type VendorSubmission } from '../../../../../lib/vendor-qbo';

export const prerender = false;

const DECISIONS = ['approved', 'feedback', 'rejected'] as const;
type Decision = (typeof DECISIONS)[number];

// Each of the five required approvers decides on their OWN row only — this is
// what makes the record usable as individual, named proof of review for a
// Health Canada audit, rather than a single shared "approved" flag.
//
// A decision is approve, awaiting feedback (missing or expired licence…) or
// reject; the last two need a reason. It can be changed later (feedback →
// approved once the documents arrive), and every decision is kept in
// vendor_submission_events.
export const POST: APIRoute = async ({ params, cookies, request, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail/fournisseurs');
  const back = (q: string) => redirect(`/portail/fournisseurs/${id}?${q}#approbations`, 303);

  const form = await request.formData().catch(() => new FormData());
  const raw = String(form.get('decision') ?? 'approved');
  const decision: Decision = (DECISIONS as readonly string[]).includes(raw) ? (raw as Decision) : 'approved';
  const note = String(form.get('note') ?? '').trim() || null;
  const notify = decision !== 'approved' && form.get('notify') === '1';
  if (decision !== 'approved' && !note) return back('error=note_required');

  const admin = getAdminClient();
  const { data: approval } = await admin
    .from('vendor_submission_approvals')
    .select('id, decision, decision_note')
    .eq('vendor_submission_id', id)
    .eq('staff_id', staff.id)
    .maybeSingle();
  if (!approval) return back('error=not_approver');

  // Same decision and same reason (and no email asked): nothing to record.
  if (!notify && approval.decision === decision && (decision === 'approved' || approval.decision_note === note)) {
    return back(`info=${decision}`);
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('vendor_submission_approvals')
    .update({
      decision, decided_at: now, decision_note: note,
      approved_at: decision === 'approved' ? now : null,
    })
    .eq('id', approval.id);
  if (error) {
    console.error('[vendor-approve] update failed:', error);
    return back('error=unknown');
  }
  // Tell the supplier, with the reason and a private link that reopens their
  // form (filled in) so they can correct it and submit it again.
  let notifiedTo: string[] | null = null;
  if (notify) {
    const { data: sub } = await admin.from('vendor_submissions').select('*').eq('id', id).maybeSingle();
    const to = sub ? contactEmails(sub as VendorSubmission) : [];
    if (sub && to.length) {
      const { raw, hash } = mintToken();
      const { error: tokErr } = await admin.from('vendor_submissions').update({ resume_token_hash: hash }).eq('id', id);
      if (tokErr) {
        console.error('[vendor-approve] edit link failed:', tokErr);
      } else {
        const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://www.oaziz.ca').replace(/\/$/, '');
        const res = await sendVendorChangesRequested({
          toEmails: to, companyName: sub.company_name, decision: decision as 'feedback' | 'rejected',
          reason: note ?? '', editUrl: `${siteUrl}/fournisseurs/brouillon/${raw}`,
        });
        if (res.status === 'sent' || res.status === 'skipped_dev') notifiedTo = to;
        else console.error('[vendor-approve] supplier email not sent:', res);
      }
    }
  }

  const { error: evErr } = await admin.from('vendor_submission_events')
    .insert({ vendor_submission_id: id, staff_id: staff.id, decision, note, supplier_notified_to: notifiedTo });
  if (evErr) console.error('[vendor-approve] history insert failed:', evErr);

  return back(`info=${decision}${notify ? (notifiedTo ? '&notified=1' : '&notified=0') : ''}`);
};
