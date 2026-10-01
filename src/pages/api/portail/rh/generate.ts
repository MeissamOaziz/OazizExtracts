import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { uploadHrBytes } from '../../../../lib/hr-storage';
import { sendHrDocumentEmail } from '../../../../lib/email';
import {
  buildAttestationPdf, buildIncidentReportPdf, buildEvaluationPdf,
  COMPETENCIES, type EvaluationInput,
} from '../../../../lib/hr-pdf';

export const prerender = false;

const KIND_LABEL_FR: Record<string, string> = {
  attestation: "Attestation d'emploi",
  incident_report: "Rapport d'incident",
  evaluation: 'Évaluation de rendement',
};

function backPath(kind: string): string {
  const map: Record<string, string> = {
    attestation: '/portail/rh/attestation',
    incident_report: '/portail/rh/incident',
    evaluation: '/portail/rh/evaluation',
  };
  return map[kind] ?? '/portail/rh';
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerClient(request, cookies);
  const staff = await currentStaff(supabase);
  if (!staff) return redirect('/portail/connexion');

  const form = await request.formData();
  const kind = String(form.get('kind') ?? '');
  const get = (k: string) => String(form.get(k) ?? '').trim();

  if (!['attestation', 'incident_report', 'evaluation'].includes(kind)) {
    return redirect('/portail/rh?error=unknown', 303);
  }

  const language = (get('language') === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const recipientsRaw = get('recipients');
  const recipients = recipientsRaw ? recipientsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  let pdfBytes: Uint8Array;
  let data: Record<string, unknown>;
  let fileNameBase: string;

  if (kind === 'attestation') {
    data = {
      employeeName: get('employee_name'),
      startDate: get('start_date'),
      issueDate: get('issue_date') || new Date().toISOString().slice(0, 10),
    };
    if (!data.employeeName || !data.startDate) {
      return redirect(`${backPath(kind)}?error=missing`, 303);
    }
    pdfBytes = await buildAttestationPdf(data as any);
    fileNameBase = `Attestation-${String(data.employeeName).replace(/\s+/g, '_')}`;
  } else if (kind === 'incident_report') {
    data = {
      employeeName: get('employee_name'), jobTitle: get('job_title'),
      incidentDate: get('incident_date'), incidentTime: get('incident_time'),
      incidentLocation: get('incident_location'), incidentDescription: get('incident_description'),
      injuryType: get('injury_type'), bodyPart: get('body_part'), treatmentProvided: get('treatment_provided'),
      witnessName: get('witness_name'), witnessSignature: get('witness_signature'),
      employeeSignature: get('employee_signature'), supervisorSignature: get('supervisor_signature'),
    };
    if (!data.employeeName || !data.incidentDate) {
      return redirect(`${backPath(kind)}?error=missing`, 303);
    }
    pdfBytes = await buildIncidentReportPdf(data as any, language);
    fileNameBase = `Incident-${String(data.employeeName).replace(/\s+/g, '_')}`;
  } else {
    const competencies: EvaluationInput['competencies'] = {};
    for (const comp of COMPETENCIES) {
      competencies[comp.id] = {
        rating: get(`comp_${comp.id}_rating`),
        comments: get(`comp_${comp.id}_comments`),
      };
    }
    const previousGoals = [1, 2, 3, 4].map((i) => ({
      goal: get(`prevgoal_${i}_goal`), status: get(`prevgoal_${i}_status`), comments: get(`prevgoal_${i}_comments`),
    }));
    const actionPlan = [1, 2, 3, 4].map((i) => ({
      goal: get(`action_${i}_goal`), measure: get(`action_${i}_measure`),
      support: get(`action_${i}_support`), due: get(`action_${i}_due`),
    }));
    const evalData: EvaluationInput = {
      employeeName: get('employee_name'), hireDate: get('hire_date'), jobTitle: get('job_title'),
      companyLocation: get('company_location'), reviewDate: get('review_date'), periodCovered: get('period_covered'),
      reviewers: get('reviewers'), evaluationType: get('evaluation_type'), followupPreviousDate: get('followup_previous_date'),
      competencies, overallRating: get('overall_rating'), overallComments: get('overall_comments'),
      previousGoals, keyStrengths: get('key_strengths'), areasForImprovement: get('areas_for_improvement'),
      roleExpectations: get('role_expectations'), actionPlan, employeeComments: get('employee_comments'),
      outcomes: form.getAll('outcomes').map(String),
      interimCheckins: get('interim_checkins'), nextEvaluationDate: get('next_evaluation_date'),
      nextEvaluationFocus: get('next_evaluation_focus'),
      employeeSigName: get('employee_sig_name'), employeeSigDate: get('employee_sig_date'),
      reviewerSigName: get('reviewer_sig_name'), reviewerSigDate: get('reviewer_sig_date'),
      secondReviewerSigName: get('second_reviewer_sig_name'), secondReviewerSigDate: get('second_reviewer_sig_date'),
    };
    if (!evalData.employeeName || !evalData.reviewDate) {
      return redirect(`${backPath(kind)}?error=missing`, 303);
    }
    data = evalData as unknown as Record<string, unknown>;
    pdfBytes = await buildEvaluationPdf(evalData);
    fileNameBase = `Evaluation-${evalData.employeeName.replace(/\s+/g, '_')}`;
  }

  const admin = getAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${fileNameBase}.pdf`;
  const filePath = `generated/${kind}/${crypto.randomUUID()}.pdf`;

  try {
    await uploadHrBytes(filePath, pdfBytes);
  } catch (e) {
    console.error('[rh/generate] upload failed:', e);
    return redirect(`${backPath(kind)}?error=unknown`, 303);
  }

  let sentAt: string | null = null;
  if (recipients.length > 0) {
    const result = await sendHrDocumentEmail({
      toEmails: recipients,
      kindLabel: KIND_LABEL_FR[kind],
      subjectLine: `[Oaziz RH] ${KIND_LABEL_FR[kind]} - ${data.employeeName ?? ''}`,
      fileName,
      pdfBytes,
    });
    if (result.status !== 'error') sentAt = new Date().toISOString();
  }

  const { data: inserted, error: insErr } = await admin
    .from('hr_generated_documents')
    .insert({
      kind, generated_by_staff_id: staff.id, language, data,
      file_path: filePath,
      sent_to: recipients.length > 0 ? recipients : null,
      sent_at: sentAt,
    })
    .select('id')
    .single();
  if (insErr) {
    console.error('[rh/generate] insert failed:', insErr);
  }

  return redirect(`${backPath(kind)}?info=generated&id=${inserted?.id ?? ''}`, 303);
};
