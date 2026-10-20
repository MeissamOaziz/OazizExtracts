import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';

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
  if (decision !== 'approved' && !note) return back('error=note_required');

  const admin = getAdminClient();
  const { data: approval } = await admin
    .from('vendor_submission_approvals')
    .select('id, decision, decision_note')
    .eq('vendor_submission_id', id)
    .eq('staff_id', staff.id)
    .maybeSingle();
  if (!approval) return back('error=not_approver');

  // Same decision and same reason: nothing to record.
  if (approval.decision === decision && (decision === 'approved' || approval.decision_note === note)) {
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
  const { error: evErr } = await admin.from('vendor_submission_events')
    .insert({ vendor_submission_id: id, staff_id: staff.id, decision, note });
  if (evErr) console.error('[vendor-approve] history insert failed:', evErr);

  return back(`info=${decision}`);
};
