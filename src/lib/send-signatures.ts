import { getAdminClient } from './supabase';
import { mintToken, signerUrl } from './tokens';
import { sendSignerInvite } from './email';

// Core signer_token/signers planning + invite dispatch, shared by:
//   - POST /api/portail/submissions/[id]/send        (creator's first send, draft only)
//   - POST /api/portail/submissions/[id]/update       (creator's edit, auto-resend when
//                                                       the prior version already had
//                                                       signatures collected)
//   - POST /api/portail/submissions/[id]/qa-edit      (QA's correction, when QA chooses
//                                                       to resend rather than sign in place)
// Caller is responsible for wiping any prior signer_tokens/documents and updating the
// submission's data fields BEFORE calling this — it only (re)creates the pending signer
// rows for a submission currently in 'draft' state and flips it to 'sent'. QA's own
// token is intentionally excluded — it is still minted just-in-time by the DB trigger
// once every participant has signed.

const TOKEN_TTL_DAYS = 30;

type StaffRow = { id: string; full_name: string; email: string };
type PlannedRow = {
  role: 'initiator' | 'production' | 'participant' | 'consent_obtainer';
  staff_id: string;
  document_kind: 'sample_request' | 'rnd' | 'consent';
  participant_staff_id: string | null;
};

export async function dispatchSignatureInvites(
  submissionId: string,
): Promise<{ ok: true; tokenCount: number } | { ok: false; error: string }> {
  const admin = getAdminClient();

  const { data: submission, error: subErr } = await admin
    .from('submissions')
    .select(`
      id, initiator_staff_id, production_staff_id, consent_obtainer_staff_id,
      form_date, product_name, product_type
    `)
    .eq('id', submissionId)
    .maybeSingle();
  if (subErr || !submission) return { ok: false, error: 'not_found' };

  const { data: participantRows, error: partErr } = await admin
    .from('submission_participants')
    .select('participant_staff_id, participant:participant_staff_id ( id, full_name, email )')
    .eq('submission_id', submissionId);
  if (partErr || !participantRows || participantRows.length === 0) {
    return { ok: false, error: 'no_participants' };
  }

  const staffIds = new Set<string>();
  staffIds.add(submission.initiator_staff_id);
  staffIds.add(submission.production_staff_id);
  staffIds.add(submission.consent_obtainer_staff_id);
  for (const p of participantRows) staffIds.add(p.participant_staff_id);

  const { data: rosterRows, error: rosterErr } = await admin
    .from('staff')
    .select('id, full_name, email')
    .in('id', Array.from(staffIds));
  if (rosterErr || !rosterRows) return { ok: false, error: 'unknown' };
  const rosterById = new Map<string, StaffRow>();
  for (const r of rosterRows) rosterById.set(r.id, r);

  const initiatorStaff = rosterById.get(submission.initiator_staff_id);
  if (!initiatorStaff) return { ok: false, error: 'unknown' };

  const planned: PlannedRow[] = [];
  planned.push({ role: 'initiator', staff_id: submission.initiator_staff_id, document_kind: 'sample_request', participant_staff_id: null });
  planned.push({ role: 'production', staff_id: submission.production_staff_id, document_kind: 'sample_request', participant_staff_id: null });
  for (const p of participantRows) {
    planned.push({ role: 'participant', staff_id: p.participant_staff_id, document_kind: 'rnd', participant_staff_id: p.participant_staff_id });
    planned.push({ role: 'participant', staff_id: p.participant_staff_id, document_kind: 'consent', participant_staff_id: p.participant_staff_id });
    planned.push({ role: 'consent_obtainer', staff_id: submission.consent_obtainer_staff_id, document_kind: 'consent', participant_staff_id: p.participant_staff_id });
  }

  const groupedByStaff = new Map<string, PlannedRow[]>();
  for (const row of planned) {
    if (!groupedByStaff.has(row.staff_id)) groupedByStaff.set(row.staff_id, []);
    groupedByStaff.get(row.staff_id)!.push(row);
  }

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const sentAt = new Date().toISOString();

  const inviteJobs: Array<{ to: StaffRow; role: string; rawToken: string }> = [];

  for (const [staff_id, rows] of groupedByStaff.entries()) {
    const target = rosterById.get(staff_id);
    if (!target) continue;

    const { raw, hash } = mintToken();

    const { data: tokenRow, error: tErr } = await admin
      .from('signer_tokens')
      .insert({
        submission_id: submissionId,
        staff_id,
        token_hash: hash,
        expires_at: expiresAt,
        sent_at: sentAt,
        is_qa: false,
      })
      .select('id')
      .single();
    if (tErr || !tokenRow) return { ok: false, error: 'token_insert' };

    const { error: sErr } = await admin
      .from('signers')
      .insert(
        rows.map((r) => ({
          submission_id: submissionId,
          role: r.role,
          staff_id: r.staff_id,
          document_kind: r.document_kind,
          participant_staff_id: r.participant_staff_id,
          signer_token_id: tokenRow.id,
          status: 'pending',
        })),
      );
    if (sErr) return { ok: false, error: 'signer_insert' };

    const primaryRole =
      rows.find((r) => r.role === 'participant')?.role ??
      rows.find((r) => r.role === 'consent_obtainer')?.role ??
      rows[0].role;

    inviteJobs.push({ to: target, role: primaryRole, rawToken: raw });
  }

  await admin.from('submissions').update({ status: 'sent', sent_at: sentAt }).eq('id', submissionId);

  for (const job of inviteJobs) {
    await sendSignerInvite({
      toEmail: job.to.email,
      toName: job.to.full_name,
      role: job.role,
      submission: {
        id: submissionId,
        form_date: submission.form_date,
        product_name: submission.product_name,
        product_type: submission.product_type,
        initiator_name: initiatorStaff.full_name,
      },
      signerUrl: signerUrl(job.rawToken),
      expiresAt,
    });
  }

  return { ok: true, tokenCount: inviteJobs.length };
}
