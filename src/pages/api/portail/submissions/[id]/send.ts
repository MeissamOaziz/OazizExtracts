import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../lib/supabase';
import { mintToken, signerUrl } from '../../../../../lib/tokens';
import { sendSignerInvite } from '../../../../../lib/email';

export const prerender = false;

function readIp(request: Request): string | null {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

const TOKEN_TTL_DAYS = 30;

type StaffRow = { id: string; full_name: string; email: string };
type PlannedRow = {
  role: 'initiator' | 'production' | 'participant' | 'consent_obtainer';
  staff_id: string;
  document_kind: 'sample_request' | 'rnd' | 'consent';
  participant_staff_id: string | null;
};

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { id } = params;
  if (!id) return redirect('/portail/formulaires');

  // Load submission — RLS lets any authenticated user read, so this succeeds if it exists.
  const { data: submission, error: subErr } = await supabase
    .from('submissions')
    .select(`
      id, status, created_by_email,
      initiator_staff_id, production_staff_id, qa_staff_id, consent_obtainer_staff_id,
      form_date, product_name, product_type
    `)
    .eq('id', id)
    .maybeSingle();

  if (subErr || !submission) {
    console.error('send: submission lookup failed', subErr);
    return redirect(`/portail/demande/${id}?error=not_found`, 303);
  }
  if (submission.created_by_email !== staff.email) {
    return redirect(`/portail/demande/${id}?error=not_creator`, 303);
  }
  if (submission.status !== 'draft') {
    return redirect(`/portail/demande/${id}?error=already_sent`, 303);
  }

  const { data: participantRows, error: partErr } = await supabase
    .from('submission_participants')
    .select('participant_staff_id, participant:participant_staff_id ( id, full_name, email )')
    .eq('submission_id', id);

  if (partErr || !participantRows || participantRows.length === 0) {
    return redirect(`/portail/demande/${id}?error=no_participants`, 303);
  }

  // Staff roster for names + emails we'll need to email
  const staffIds = new Set<string>();
  staffIds.add(submission.initiator_staff_id);
  staffIds.add(submission.production_staff_id);
  staffIds.add(submission.consent_obtainer_staff_id);
  for (const p of participantRows) staffIds.add(p.participant_staff_id);

  const admin = getAdminClient();

  // Clean up any orphan signer_tokens from a prior failed send (they'd violate
  // the (submission_id, staff_id) unique constraint on retry). Safe because we
  // already asserted status='draft'. Cascades to signers rows.
  await admin.from('signer_tokens').delete().eq('submission_id', id);

  const { data: rosterRows, error: rosterErr } = await admin
    .from('staff')
    .select('id, full_name, email')
    .in('id', Array.from(staffIds));
  if (rosterErr || !rosterRows) {
    console.error('send: staff lookup failed', rosterErr);
    return redirect(`/portail/demande/${id}?error=unknown`, 303);
  }
  const rosterById = new Map<string, StaffRow>();
  for (const r of rosterRows) rosterById.set(r.id, r);

  const initiatorStaff = rosterById.get(submission.initiator_staff_id);
  if (!initiatorStaff) return redirect(`/portail/demande/${id}?error=unknown`, 303);

  // Plan every signer row we need (excluding QA — created just-in-time).
  const planned: PlannedRow[] = [];
  // Sample request → initiator + production
  planned.push({
    role: 'initiator',
    staff_id: submission.initiator_staff_id,
    document_kind: 'sample_request',
    participant_staff_id: null,
  });
  planned.push({
    role: 'production',
    staff_id: submission.production_staff_id,
    document_kind: 'sample_request',
    participant_staff_id: null,
  });
  // Per participant → R&D + consent (participant signs both) and consent_obtainer signs the consent.
  for (const p of participantRows) {
    planned.push({
      role: 'participant',
      staff_id: p.participant_staff_id,
      document_kind: 'rnd',
      participant_staff_id: p.participant_staff_id,
    });
    planned.push({
      role: 'participant',
      staff_id: p.participant_staff_id,
      document_kind: 'consent',
      participant_staff_id: p.participant_staff_id,
    });
    planned.push({
      role: 'consent_obtainer',
      staff_id: submission.consent_obtainer_staff_id,
      document_kind: 'consent',
      participant_staff_id: p.participant_staff_id,
    });
  }

  // Group by staff_id → one token per unique signer person.
  const groupedByStaff = new Map<string, PlannedRow[]>();
  for (const row of planned) {
    if (!groupedByStaff.has(row.staff_id)) groupedByStaff.set(row.staff_id, []);
    groupedByStaff.get(row.staff_id)!.push(row);
  }

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const sentAt = new Date().toISOString();

  // Insert signer_tokens, then signers linked to them. Server-side (admin) to bypass RLS.
  const inviteJobs: Array<{
    to: StaffRow;
    role: string;
    rawToken: string;
  }> = [];

  for (const [staff_id, rows] of groupedByStaff.entries()) {
    const target = rosterById.get(staff_id);
    if (!target) continue;

    const { raw, hash } = mintToken();

    const { data: tokenRow, error: tErr } = await admin
      .from('signer_tokens')
      .insert({
        submission_id: id,
        staff_id,
        token_hash: hash,
        expires_at: expiresAt,
        sent_at: sentAt,
        is_qa: false,
      })
      .select('id')
      .single();

    if (tErr || !tokenRow) {
      console.error('send: signer_token insert failed', tErr);
      return redirect(`/portail/demande/${id}?error=token_insert`, 303);
    }

    const { error: sErr } = await admin
      .from('signers')
      .insert(
        rows.map((r) => ({
          submission_id: id,
          role: r.role,
          staff_id: r.staff_id,
          document_kind: r.document_kind,
          participant_staff_id: r.participant_staff_id,
          signer_token_id: tokenRow.id,
          status: 'pending',
        })),
      );
    if (sErr) {
      console.error('send: signers insert failed', sErr);
      return redirect(`/portail/demande/${id}?error=signer_insert`, 303);
    }

    // Pick the "primary" role for the email badge — participants first if they are participant
    // in this batch; otherwise fall back to the first row's role.
    const primaryRole =
      rows.find((r) => r.role === 'participant')?.role ??
      rows.find((r) => r.role === 'consent_obtainer')?.role ??
      rows[0].role;

    inviteJobs.push({ to: target, role: primaryRole, rawToken: raw });
  }

  // Flip submission status now (before emails) so a partial email failure doesn't leave a draft.
  await admin
    .from('submissions')
    .update({ status: 'sent', sent_at: sentAt })
    .eq('id', id);

  // Audit
  await supabase.from('audit_log').insert({
    submission_id: id,
    actor_email: staff.email,
    action: 'sent_for_signature',
    ip_address: readIp(request),
    user_agent: request.headers.get('user-agent'),
    metadata: { token_count: inviteJobs.length },
  });

  // Emails. Failures are non-fatal — the URLs are recoverable server-side.
  for (const job of inviteJobs) {
    await sendSignerInvite({
      toEmail: job.to.email,
      toName: job.to.full_name,
      role: job.role,
      submission: {
        id,
        form_date: submission.form_date,
        product_name: submission.product_name,
        product_type: submission.product_type,
        initiator_name: initiatorStaff.full_name,
      },
      signerUrl: signerUrl(job.rawToken),
      expiresAt,
    });
  }

  return redirect(`/portail/demande/${id}?info=sent`, 303);
};
