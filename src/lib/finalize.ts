import { getAdminClient } from './supabase';
import { loadAndBuildPdf, storePdf, storagePathFor } from './pdf';
import { sendFinalizedRnd } from './email';

// Extra distribution beyond the roles already on the submission.
// Kept small; Meissam is included so he's copied on every finalized R&D.
const EXTRA_RECIPIENTS = ['meissam@oaziz.ca'];

// Called from both signature endpoints (tokenized + in-app) after a signature
// is captured. Idempotent — safe to call every time; only actually sends when:
//   1. Submission is in status='finalized' (Stéphane just signed QA), AND
//   2. No prior 'finalized_email_sent' audit_log entry exists for this
//      submission (so re-signing / duplicate calls don't spam).
export async function finalizeIfNeeded(submissionId: string | null): Promise<void> {
  if (!submissionId) return;
  const admin = getAdminClient();

  const { data: sub } = await admin
    .from('submissions')
    .select(`
      id, status, product_name, product_type, form_date, created_by_email,
      initiator:initiator_staff_id ( id, email, full_name ),
      qa:qa_staff_id ( id, email, full_name )
    `)
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub || sub.status !== 'finalized') return;

  const { data: alreadySent } = await admin
    .from('audit_log')
    .select('id')
    .eq('submission_id', submissionId)
    .eq('action', 'finalized_email_sent')
    .limit(1)
    .maybeSingle();
  if (alreadySent) return;

  // Gather participant names (for the email body)
  const { data: partRows } = await admin
    .from('submission_participants')
    .select('participant:participant_staff_id ( full_name )')
    .eq('submission_id', submissionId);
  const participantNames = (partRows ?? []).map((r: any) => r.participant?.full_name).filter(Boolean);

  // Build recipient list: creator + initiator + QA + EXTRA. Dedupe.
  const recipientSet = new Set<string>();
  const initiator = sub.initiator as any;
  const qa = sub.qa as any;
  if (sub.created_by_email) recipientSet.add(sub.created_by_email.toLowerCase());
  if (initiator?.email) recipientSet.add(initiator.email.toLowerCase());
  if (qa?.email) recipientSet.add(qa.email.toLowerCase());
  for (const e of EXTRA_RECIPIENTS) recipientSet.add(e.toLowerCase());
  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) return;

  // Generate the final PDF from live DB state
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await loadAndBuildPdf(submissionId);
  } catch (e) {
    console.error('[finalize] PDF build failed:', e);
    return;
  }

  // Persist to Storage + upsert documents row so future downloads hit the cache
  try {
    await storePdf(submissionId, pdfBytes);
    await admin.from('documents').upsert({
      submission_id: submissionId,
      kind: 'sample_request',
      participant_staff_id: null,
      pdf_path: storagePathFor(submissionId),
    }, { onConflict: 'submission_id' });
  } catch (e) {
    console.warn('[finalize] storage cache write failed (continuing to email):', e);
  }

  // Send the email with PDF attachment
  const result = await sendFinalizedRnd({
    submission: {
      id: sub.id,
      form_date: sub.form_date,
      product_name: sub.product_name,
      product_type: sub.product_type,
      initiator_name: initiator?.full_name ?? '',
      qa_name: qa?.full_name ?? '',
      participants: participantNames,
    },
    pdfBytes,
    recipients,
  });

  await admin.from('audit_log').insert({
    submission_id: submissionId,
    action: 'finalized_email_sent',
    metadata: {
      recipients,
      email_status: result.status,
      resend_id: result.id ?? null,
    },
  });
}
