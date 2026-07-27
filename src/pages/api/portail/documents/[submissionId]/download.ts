import type { APIRoute } from 'astro';
import {
  createServerClient, currentStaff, getAdminClient,
} from '../../../../../lib/supabase';
import {
  buildSubmissionPdf, storePdf, storagePathFor, signedDownloadUrl,
  type BuildInput, type SignerRecord,
} from '../../../../../lib/pdf';
import type { SubmissionForRender, StaffLite } from '../../../../../lib/portail-types';

export const prerender = false;

// Download the finalized PDF for a submission. Lazy-generates + stores on first request.
export const GET: APIRoute = async ({ params, request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const { submissionId } = params;
  if (!submissionId) return new Response('not found', { status: 404 });

  const admin = getAdminClient();

  // Guard: submission must exist and have at least the signing complete state.
  const { data: sub } = await supabase
    .from('submissions')
    .select('id, status')
    .eq('id', submissionId)
    .maybeSingle();
  if (!sub) return new Response('not found', { status: 404 });

  const canDownload = ['finalized', 'complete', 'signing', 'sent'].includes(sub.status);
  if (!canDownload) {
    // Draft — nothing to download yet.
    return redirect(`/portail/demande/${submissionId}?error=nothing_to_download`, 303);
  }

  // Reuse existing PDF if we already generated one; else build it.
  const path = storagePathFor(submissionId);
  const { data: existing } = await admin.storage.from('documents').list(submissionId, { limit: 5 });
  const hasExisting = (existing ?? []).some((f) => f.name === `${submissionId}.pdf`);

  if (!hasExisting) {
    const bytes = await generateFreshPdf(admin, submissionId);
    await storePdf(submissionId, bytes);

    // Record in documents table
    await admin.from('documents').insert({
      submission_id: submissionId,
      kind: 'sample_request',   // one merged PDF; use sample_request as kind
      participant_staff_id: null,
      pdf_path: path,
    });

    await admin.from('audit_log').insert({
      submission_id: submissionId,
      actor_email: staff.email,
      action: 'pdf_generated',
    });
  }

  // Redirect through a short-lived signed URL so the browser gets the PDF directly.
  const url = await signedDownloadUrl(path, 60);
  return redirect(url, 302);
};

async function generateFreshPdf(admin: ReturnType<typeof getAdminClient>, submissionId: string): Promise<Uint8Array> {
  const { data: subRow, error: subErr } = await admin
    .from('submissions')
    .select(`
      id, form_date, product_name, product_type, quantity, production_state, production_id,
      rnd_objective, rnd_quantity_for_test, rnd_lp_number, rnd_qty_destroyed, rnd_date_destroyed,
      initiator:initiator_staff_id ( id, full_name, email ),
      production:production_staff_id ( id, full_name, email ),
      qa:qa_staff_id ( id, full_name, email ),
      consent_obtainer:consent_obtainer_staff_id ( id, full_name, email )
    `)
    .eq('id', submissionId)
    .maybeSingle();
  if (subErr || !subRow) throw new Error('submission not found');

  const { data: partRows } = await admin
    .from('submission_participants')
    .select('participant:participant_staff_id ( id, full_name )')
    .eq('submission_id', submissionId);

  const { data: signerRows } = await admin
    .from('signers')
    .select('role, document_kind, participant_staff_id, signature_image, signed_at, ip_address, staff:staff_id ( full_name )')
    .eq('submission_id', submissionId);

  const submission: SubmissionForRender = {
    id: subRow.id,
    form_date: subRow.form_date,
    product_name: subRow.product_name,
    product_type: subRow.product_type,
    quantity: subRow.quantity,
    production_state: subRow.production_state,
    production_id: subRow.production_id,
    rnd_objective: subRow.rnd_objective,
    rnd_quantity_for_test: subRow.rnd_quantity_for_test,
    rnd_lp_number: subRow.rnd_lp_number,
    rnd_qty_destroyed: subRow.rnd_qty_destroyed,
    rnd_date_destroyed: subRow.rnd_date_destroyed,
    initiator:        toStaffLite(subRow.initiator),
    production:       toStaffLite(subRow.production),
    qa:               toStaffLite(subRow.qa),
    consent_obtainer: toStaffLite(subRow.consent_obtainer),
  };

  const participants: StaffLite[] = (partRows ?? [])
    .map((r: any) => ({ id: r.participant.id, name: r.participant.full_name }));

  const signers: SignerRecord[] = (signerRows ?? []).map((s: any): SignerRecord => ({
    role: s.role,
    document_kind: s.document_kind,
    participant_id: s.participant_staff_id,
    staff_name: s.staff?.full_name ?? '',
    signature_image: s.signature_image,
    signed_at: s.signed_at,
    ip_address: s.ip_address,
  }));

  const input: BuildInput = { submission, participants, signers };
  return await buildSubmissionPdf(input);
}

function toStaffLite(obj: any): StaffLite {
  return { id: obj?.id ?? '', name: obj?.full_name ?? '—', email: obj?.email };
}
