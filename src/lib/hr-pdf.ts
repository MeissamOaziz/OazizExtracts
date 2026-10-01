import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib';

// ============================================================
// Shared low-level drawing primitives (same spirit as src/lib/pdf.ts,
// kept separate since the HR documents have a different shape).
// ============================================================

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const CONTENT_W = A4.width - MARGIN * 2;

const ORANGE = rgb(0.816, 0.345, 0.149);
const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.47, 0.52);
const LIGHT = rgb(0.95, 0.95, 0.97);
const SEP = rgb(0.87, 0.88, 0.91);

interface FontSet { reg: PDFFont; bold: PDFFont; }
interface Cursor { page: PDFPage; y: number; doc: PDFDocument; fonts: FontSet; }

function newPage(doc: PDFDocument, fonts: FontSet, headerText: string): Cursor {
  const page = doc.addPage([A4.width, A4.height]);
  page.drawRectangle({ x: 0, y: A4.height - 40, width: A4.width, height: 40, color: ORANGE });
  page.drawText('OAZIZ EXTRACTS INC.', { x: MARGIN, y: A4.height - 26, size: 11, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText(headerText, { x: A4.width - MARGIN - fonts.reg.widthOfTextAtSize(headerText, 9), y: A4.height - 25, size: 9, font: fonts.reg, color: rgb(1, 1, 1) });
  return { page, y: A4.height - 40 - 28, doc, fonts };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const attempt = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(attempt, size) > maxWidth) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = attempt;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function ensureRoom(c: Cursor, needed: number, headerText: string): Cursor {
  if (c.y - needed < MARGIN + 20) {
    return newPage(c.doc, c.fonts, headerText);
  }
  return c;
}

function title(c: Cursor, s: string) {
  c.page.drawText(s, { x: MARGIN, y: c.y, size: 18, font: c.fonts.bold, color: BLACK });
  c.y -= 22;
}
function subMuted(c: Cursor, s: string) {
  c.page.drawText(s, { x: MARGIN, y: c.y, size: 9.5, font: c.fonts.reg, color: GRAY });
  c.y -= 14;
}
function gap(c: Cursor, h: number) { c.y -= h; }

function section(c: Cursor, s: string) {
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: 3, height: 15, color: ORANGE });
  c.page.drawText(s, { x: MARGIN + 10, y: c.y, size: 11, font: c.fonts.bold, color: BLACK });
  c.y -= 20;
}

function keyValueRow(c: Cursor, label: string, value: string, labelW = 150) {
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: CONTENT_W, height: 18, color: LIGHT });
  c.page.drawText(label, { x: MARGIN + 6, y: c.y + 1, size: 8.5, font: c.fonts.bold, color: GRAY });
  c.page.drawText(value || '—', { x: MARGIN + 6 + labelW, y: c.y + 1, size: 9.5, font: c.fonts.reg, color: BLACK });
  c.y -= 20;
}

function paragraph(c: Cursor, s: string, size = 10, color = BLACK) {
  const lines = wrap(s, c.fonts.reg, size, CONTENT_W);
  for (const line of lines) {
    c.page.drawText(line, { x: MARGIN, y: c.y, size, font: c.fonts.reg, color });
    c.y -= size + 4;
  }
}

function textBox(c: Cursor, label: string, value: string, minLines = 3) {
  const lineHeight = 13;
  const lines = value ? wrap(value, c.fonts.reg, 9.5, CONTENT_W - 12) : [];
  const displayed = Math.max(minLines, lines.length);
  const boxH = displayed * lineHeight + 20;
  c.page.drawRectangle({ x: MARGIN, y: c.y - boxH, width: CONTENT_W, height: boxH, borderColor: SEP, borderWidth: 0.6 });
  c.page.drawText(label, { x: MARGIN + 6, y: c.y - 12, size: 8.5, font: c.fonts.bold, color: GRAY });
  for (let i = 0; i < lines.length; i++) {
    c.page.drawText(lines[i], { x: MARGIN + 6, y: c.y - 28 - i * lineHeight, size: 9.5, font: c.fonts.reg, color: BLACK });
  }
  c.y -= boxH + 8;
}

function checkRow(c: Cursor, items: Array<{ label: string; checked: boolean }>) {
  let x = MARGIN;
  for (const it of items) {
    const box = it.checked ? '☒' : '☐';
    const text = `${box} ${it.label}`;
    c.page.drawText(text, { x, y: c.y, size: 9.5, font: c.fonts.reg, color: BLACK });
    x += c.fonts.reg.widthOfTextAtSize(text, 9.5) + 18;
  }
  c.y -= 18;
}

async function embedDataUrl(doc: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  try {
    return m[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch { return null; }
}

function fmtDate(iso: string | null | undefined, locale: 'fr' | 'en' = 'fr'): string {
  if (!iso) return '—';
  const mdt = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!mdt) return iso;
  const [, y, m, d] = mdt;
  return locale === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

// ============================================================
// 1. Attestation de travail (French only, matches the official template)
// ============================================================

export interface AttestationInput {
  employeeName: string;
  startDate: string; // YYYY-MM-DD
  issueDate: string; // YYYY-MM-DD
}

export async function buildAttestationPdf(input: AttestationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { reg, bold };
  const c = newPage(doc, fonts, 'ATTESTATION D’EMPLOI');

  gap(c, 20);
  title(c, 'Attestation d’emploi');
  gap(c, 16);
  paragraph(c, 'À qui de droit,');
  gap(c, 10);
  paragraph(c, `Ceci pour attester que ${input.employeeName || '____________________'} a été employé(e) par Oaziz Extracts Inc. depuis le ${fmtDate(input.startDate)}.`);
  gap(c, 6);
  paragraph(c, 'L’employé(e) est présentement en poste au sein de notre entreprise.');
  gap(c, 6);
  paragraph(c, 'Cette attestation est délivrée à la demande de l’intéressé(e) pour servir et valoir ce que de droit.');
  gap(c, 20);
  paragraph(c, `Fait à Montréal, le ${fmtDate(input.issueDate)}.`);
  gap(c, 24);
  paragraph(c, 'Pour Oaziz Extracts Inc.');
  gap(c, 24);
  paragraph(c, 'Jorge Sousa, PDG', 10, BLACK);

  return doc.save();
}

// ============================================================
// 2. Incident report (bilingual, matches the existing HTML tool's fields)
// ============================================================

export interface IncidentReportInput {
  employeeName: string; jobTitle: string; incidentDate: string; incidentTime: string;
  incidentLocation: string; incidentDescription: string;
  injuryType: string; bodyPart: string; treatmentProvided: string;
  witnessName: string; witnessSignature: string; employeeSignature: string; supervisorSignature: string;
}

const INCIDENT_LABELS = {
  fr: {
    header: "RAPPORT D'INCIDENT", title: "Rapport d'incident d'employé",
    employeeInfo: "Informations sur l'employé", fullName: 'Nom complet', jobTitle: 'Titre du poste',
    dateOfIncident: "Date de l'incident", timeOfIncident: "Heure de l'incident",
    incidentDetails: "Détails de l'incident", location: "Lieu de l'incident",
    description: "Description", injuryDetails: 'Détails de la blessure',
    injuryType: 'Type de blessure', bodyPart: 'Partie du corps touchée',
    treatment: 'Traitement fourni sur place', witnesses: 'Témoins et signatures',
    witnessName: 'Nom du témoin', witnessSignature: 'Signature du témoin',
    employeeSignature: "Signature de l'employé", supervisorSignature: 'Signature du superviseur/gérant',
  },
  en: {
    header: 'INCIDENT REPORT', title: 'Employee Incident Report',
    employeeInfo: 'Employee Information', fullName: 'Full Name', jobTitle: 'Job Title',
    dateOfIncident: 'Date of Incident', timeOfIncident: 'Time of Incident',
    incidentDetails: 'Incident Details', location: 'Location of Incident',
    description: 'Description', injuryDetails: 'Injury Details',
    injuryType: 'Type of Injury', bodyPart: 'Body Part Affected',
    treatment: 'Treatment provided on site', witnesses: 'Witnesses & Signatures',
    witnessName: 'Witness Name', witnessSignature: 'Witness Signature',
    employeeSignature: 'Employee Signature', supervisorSignature: 'Supervisor/Manager Signature',
  },
} as const;

export async function buildIncidentReportPdf(input: IncidentReportInput, lang: 'fr' | 'en'): Promise<Uint8Array> {
  const L = INCIDENT_LABELS[lang];
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { reg, bold };
  const c = newPage(doc, fonts, L.header);

  gap(c, 16);
  title(c, L.title);
  gap(c, 10);

  section(c, L.employeeInfo);
  keyValueRow(c, L.fullName, input.employeeName);
  keyValueRow(c, L.jobTitle, input.jobTitle);
  keyValueRow(c, L.dateOfIncident, fmtDate(input.incidentDate, lang));
  keyValueRow(c, L.timeOfIncident, input.incidentTime);
  gap(c, 8);

  section(c, L.incidentDetails);
  keyValueRow(c, L.location, input.incidentLocation);
  gap(c, 4);
  textBox(c, L.description, input.incidentDescription, 4);

  section(c, L.injuryDetails);
  keyValueRow(c, L.injuryType, input.injuryType);
  keyValueRow(c, L.bodyPart, input.bodyPart);
  gap(c, 4);
  textBox(c, L.treatment, input.treatmentProvided, 3);

  section(c, L.witnesses);
  keyValueRow(c, L.witnessName, input.witnessName);
  keyValueRow(c, L.employeeSignature, input.employeeSignature);
  keyValueRow(c, L.witnessSignature, input.witnessSignature);
  keyValueRow(c, L.supervisorSignature, input.supervisorSignature);

  return doc.save();
}

// ============================================================
// 3. Employee performance evaluation (English only, matches the official
//    template — long, multi-page, with fixed competency descriptions).
// ============================================================

export interface CompetencyRating { rating: string; comments: string; }
export interface GoalProgress { goal: string; status: string; comments: string; }
export interface ActionPlanItem { goal: string; measure: string; support: string; due: string; }

export interface EvaluationInput {
  employeeName: string; hireDate: string; jobTitle: string; companyLocation: string;
  reviewDate: string; periodCovered: string; reviewers: string;
  evaluationType: string; // '3month' | '6month' | 'annual' | 'followup'
  followupPreviousDate: string;
  competencies: Record<string, CompetencyRating>; // keyed by COMPETENCIES id
  overallRating: string; overallComments: string;
  previousGoals: GoalProgress[];
  keyStrengths: string; areasForImprovement: string; roleExpectations: string;
  actionPlan: ActionPlanItem[];
  employeeComments: string;
  outcomes: string[]; // subset of OUTCOME_OPTIONS ids
  interimCheckins: string; nextEvaluationDate: string; nextEvaluationFocus: string;
  employeeSigName: string; employeeSigDate: string;
  reviewerSigName: string; reviewerSigDate: string;
  secondReviewerSigName: string; secondReviewerSigDate: string;
}

export const COMPETENCIES: Array<{ id: string; label: string; desc: string }> = [
  { id: 'job_knowledge', label: 'Job Knowledge & Regulatory Compliance', desc: 'Understands and applies SOPs, GPP/GDP and Cannabis Act / Health Canada requirements; keeps records audit-ready.' },
  { id: 'task_ownership', label: 'Task Ownership & Follow-Through', desc: 'Takes each assigned task to completion without reminders; tracks open items and follows up with third parties (labs, clients, suppliers).' },
  { id: 'attention_to_detail', label: 'Attention to Detail & Accuracy', desc: 'Accurate labels, order verifications, COAs and documentation; catches errors before they leave the building.' },
  { id: 'organization', label: 'Organization & Information Management', desc: 'Keeps own files, notes and statuses organized; checks monday.com, Google Drive and email before asking others.' },
  { id: 'communication', label: 'Communication & Escalation', desc: 'Keeps the team informed of status; raises roadblocks early and asks for help as soon as stuck.' },
  { id: 'time_management', label: 'Time Management & Prioritization', desc: 'Prioritizes time-sensitive items (releases, shipments, customer commitments); meets deadlines.' },
  { id: 'teamwork', label: 'Teamwork & Flexibility', desc: 'Supports colleagues across Oaziz and 907; adapts to changing priorities in a small team.' },
  { id: 'initiative', label: 'Initiative & Continuous Improvement', desc: 'Identifies gaps and proposes improvements (checklists, CAPAs, process fixes) without being asked.' },
];

export const OUTCOME_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'confirmed', label: 'Employment confirmed / probation successfully completed' },
  { id: 'followup_scheduled', label: 'Follow-up evaluation scheduled to review progress on the action plan' },
  { id: 'pip', label: 'Formal performance improvement plan (PIP) required' },
  { id: 'comp_review', label: 'Role / compensation review (annual evaluations only)' },
];

const EVAL_TYPE_LABEL: Record<string, string> = {
  '3month': '3-Month (Probation) Review', '6month': '6-Month Review',
  annual: '1-Year / Annual Review', followup: 'Follow-Up Evaluation',
};

export async function buildEvaluationPdf(input: EvaluationInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { reg, bold };
  const H = 'PERFORMANCE EVALUATION';
  let c = newPage(doc, fonts, H);

  gap(c, 16);
  title(c, 'Employee Performance Evaluation');
  subMuted(c, 'Confidential — to be kept in the employee file');
  gap(c, 10);

  section(c, '1. Employee & Evaluation Information');
  keyValueRow(c, 'Employee name', input.employeeName);
  keyValueRow(c, 'Hire date', fmtDate(input.hireDate, 'en'));
  keyValueRow(c, 'Job title', input.jobTitle);
  keyValueRow(c, 'Company / location', input.companyLocation);
  keyValueRow(c, 'Review date', fmtDate(input.reviewDate, 'en'));
  keyValueRow(c, 'Period covered', input.periodCovered);
  keyValueRow(c, 'Reviewer(s)', input.reviewers);
  keyValueRow(c, 'Evaluation type', EVAL_TYPE_LABEL[input.evaluationType] ?? input.evaluationType);
  if (input.evaluationType === 'followup') {
    keyValueRow(c, 'Previous evaluation date', fmtDate(input.followupPreviousDate, 'en'));
  }
  gap(c, 10);

  c = ensureRoom(c, 200, H);
  section(c, '3. Core Competencies');
  for (const comp of COMPETENCIES) {
    const r = input.competencies?.[comp.id] ?? { rating: '', comments: '' };
    const descLines = wrap(comp.desc, fonts.reg, 8, CONTENT_W - 12);
    const commentLines = r.comments ? wrap(r.comments, fonts.reg, 9, CONTENT_W - 12) : [];
    const boxH = 16 + descLines.length * 10 + 14 + Math.max(1, commentLines.length) * 12 + 10;
    c = ensureRoom(c, boxH + 6, H);
    c.page.drawRectangle({ x: MARGIN, y: c.y - boxH, width: CONTENT_W, height: boxH, borderColor: SEP, borderWidth: 0.6 });
    c.page.drawText(`${comp.label}  —  Rating: ${r.rating || '—'}`, { x: MARGIN + 6, y: c.y - 12, size: 9.5, font: fonts.bold, color: BLACK });
    let yy = c.y - 24;
    for (const dl of descLines) { c.page.drawText(dl, { x: MARGIN + 6, y: yy, size: 8, font: fonts.reg, color: GRAY }); yy -= 10; }
    yy -= 4;
    if (commentLines.length) {
      for (const cl of commentLines) { c.page.drawText(cl, { x: MARGIN + 6, y: yy, size: 9, font: fonts.reg, color: BLACK }); yy -= 12; }
    } else {
      c.page.drawText('—', { x: MARGIN + 6, y: yy, size: 9, font: fonts.reg, color: GRAY });
    }
    c.y -= boxH + 6;
  }
  c = ensureRoom(c, 40, H);
  keyValueRow(c, 'OVERALL RATING', input.overallRating);
  textBox(c, 'Overall comments', input.overallComments, 2);

  if (input.previousGoals?.some((g) => g.goal)) {
    c = ensureRoom(c, 100, H);
    section(c, '4. Progress on Previous Goals');
    for (const g of input.previousGoals) {
      if (!g.goal) continue;
      keyValueRow(c, 'Goal', g.goal, 90);
      keyValueRow(c, 'Status / comments', `${g.status || '—'} — ${g.comments || ''}`, 90);
    }
    gap(c, 6);
  }

  c = ensureRoom(c, 80, H);
  section(c, '5. Key Strengths & Contributions');
  textBox(c, '', input.keyStrengths, 3);

  c = ensureRoom(c, 100, H);
  section(c, '6. Areas for Improvement');
  textBox(c, '', input.areasForImprovement, 4);

  c = ensureRoom(c, 80, H);
  section(c, '7. Role Expectations & Working Arrangements');
  textBox(c, '', input.roleExpectations, 2);

  if (input.actionPlan?.some((a) => a.goal)) {
    c = ensureRoom(c, 100, H);
    section(c, '8. Action Plan & Goals Until Next Review');
    let n = 1;
    for (const a of input.actionPlan) {
      if (!a.goal) continue;
      keyValueRow(c, `#${n} Goal`, a.goal, 90);
      keyValueRow(c, 'Measure / Support / Due', `${a.measure || '—'} — ${a.support || '—'} — Due: ${fmtDate(a.due, 'en')}`, 90);
      n++;
    }
    gap(c, 6);
  }

  c = ensureRoom(c, 80, H);
  section(c, '9. Employee Comments');
  textBox(c, '', input.employeeComments, 3);

  c = ensureRoom(c, 120, H);
  section(c, '10. Outcome & Next Steps');
  checkRow(c, OUTCOME_OPTIONS.map((o) => ({ label: o.label, checked: input.outcomes?.includes(o.id) })).slice(0, 2));
  checkRow(c, OUTCOME_OPTIONS.map((o) => ({ label: o.label, checked: input.outcomes?.includes(o.id) })).slice(2, 4));
  keyValueRow(c, 'Interim check-ins', input.interimCheckins);
  keyValueRow(c, 'Next evaluation date', fmtDate(input.nextEvaluationDate, 'en'));
  keyValueRow(c, 'Focus of next evaluation', input.nextEvaluationFocus);

  c = ensureRoom(c, 140, H);
  section(c, '11. Signatures & Acknowledgement');
  paragraph(c, 'Signing confirms that this evaluation was discussed with the employee and a copy was received. It does not necessarily mean the employee agrees with every rating or comment; the employee may add comments in Section 9.', 8.5, GRAY);
  gap(c, 8);
  keyValueRow(c, 'Employee', `${input.employeeSigName || '—'}  —  ${fmtDate(input.employeeSigDate, 'en')}`, 90);
  keyValueRow(c, 'Reviewer', `${input.reviewerSigName || '—'}  —  ${fmtDate(input.reviewerSigDate, 'en')}`, 90);
  if (input.secondReviewerSigName) {
    keyValueRow(c, 'Second reviewer', `${input.secondReviewerSigName}  —  ${fmtDate(input.secondReviewerSigDate, 'en')}`, 90);
  }

  return doc.save();
}

// ============================================================
// 4. Employee Information Form (bilingual, short)
// ============================================================

export interface EmployeeInfoInput {
  firstName: string; lastName: string; address: string; phone: string;
  dob: string; sin: string; email: string;
  emergencyFirstName: string; emergencyLastName: string; emergencyPhone: string;
  startDate: string;
  signatureDataUrl: string | null; signedDate: string | null;
}

export async function buildEmployeeInfoPdf(input: EmployeeInfoInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { reg, bold };
  const c = newPage(doc, fonts, 'EMPLOYEE INFORMATION');

  gap(c, 16);
  title(c, 'Formulaire Informations Employé / Employee Information Form');
  gap(c, 10);

  section(c, 'Informations Personnelles / Personal Information');
  keyValueRow(c, 'Prénom / First Name', input.firstName);
  keyValueRow(c, 'Nom / Last Name', input.lastName);
  keyValueRow(c, 'Adresse / Address', input.address);
  keyValueRow(c, 'Téléphone / Phone', input.phone);
  keyValueRow(c, 'Date de naissance / Date of Birth', fmtDate(input.dob));
  keyValueRow(c, 'NAS / SIN', input.sin);
  keyValueRow(c, 'Courriel / E-Mail', input.email);
  gap(c, 8);

  section(c, "Contact d'urgence / Emergency Contact");
  keyValueRow(c, 'Prénom / First Name', input.emergencyFirstName);
  keyValueRow(c, 'Nom / Last Name', input.emergencyLastName);
  keyValueRow(c, 'Téléphone / Phone', input.emergencyPhone);
  gap(c, 8);

  keyValueRow(c, 'Date de début / Start Date', fmtDate(input.startDate));
  gap(c, 10);

  section(c, 'Signature');
  const sigImg = await embedDataUrl(doc, input.signatureDataUrl ?? '');
  const boxH = 70;
  c.page.drawRectangle({ x: MARGIN, y: c.y - boxH, width: 220, height: boxH, borderColor: SEP, borderWidth: 1 });
  if (sigImg) {
    const scale = Math.min((220 - 12) / sigImg.width, (boxH - 20) / sigImg.height) * 0.95;
    const w = sigImg.width * scale, h = sigImg.height * scale;
    c.page.drawImage(sigImg, { x: MARGIN + (220 - w) / 2, y: c.y - boxH + (boxH - h) / 2 + 10, width: w, height: h });
  }
  c.page.drawText(`Date: ${fmtDate(input.signedDate)}`, { x: MARGIN, y: c.y - boxH - 14, size: 9, font: fonts.reg, color: GRAY });
  c.y -= boxH + 28;

  return doc.save();
}

// ============================================================
// 5. Code of Conduct signature overlay — stamps onto the LAST page of the
//    real, official policy PDF (already includes the signature block in its
//    text) rather than regenerating the legal text ourselves. Coordinates
//    were measured directly off the current EN/FR PDFs (both US Letter,
//    612x792) — if Oaziz ever replaces these files with a reformatted
//    version, these coordinates will need to be re-measured.
// ============================================================

export interface CodeOfConductOverlay {
  employeeName: string;
  employeeSignature: string | null; // data URL
  employeeDate: string | null;
  witnessSignature: string | null; // data URL
  witnessDate: string | null;
}

const COC_COORDS = {
  en: {
    nameX: 165, nameY: 278.3,
    empSigX: 183, empSigY: 210.5, empDateX: 105, empDateY: 227.5,
    witSigX: 222, witSigY: 159.5, witDateX: 105, witDateY: 142.6,
  },
  fr: {
    nameX: 184, nameY: 277.4,
    empSigX: 208, empSigY: 226.5, empDateX: 101, empDateY: 243.4,
    witSigX: 263, witSigY: 175.6, witDateX: 101, witDateY: 158.6,
  },
} as const;

async function drawSignatureAt(doc: PDFDocument, page: PDFPage, dataUrl: string | null, x: number, y: number, maxW = 110, maxH = 24) {
  const img = await embedDataUrl(doc, dataUrl ?? '');
  if (!img) return;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale, h = img.height * scale;
  page.drawImage(img, { x, y, width: w, height: h });
}

export async function overlayCodeOfConductSignatures(
  baseBytes: Uint8Array,
  overlay: CodeOfConductOverlay,
  lang: 'en' | 'fr',
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(baseBytes);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPage(doc.getPageCount() - 1);
  const coords = COC_COORDS[lang];

  page.drawText(overlay.employeeName || '', { x: coords.nameX, y: coords.nameY, size: 10, font: reg, color: BLACK });
  page.drawText(fmtDate(overlay.employeeDate, lang), { x: coords.empDateX, y: coords.empDateY, size: 9, font: reg, color: BLACK });
  page.drawText(fmtDate(overlay.witnessDate, lang), { x: coords.witDateX, y: coords.witDateY, size: 9, font: reg, color: BLACK });
  await drawSignatureAt(doc, page, overlay.employeeSignature, coords.empSigX, coords.empSigY);
  await drawSignatureAt(doc, page, overlay.witnessSignature, coords.witSigX, coords.witSigY);

  return doc.save();
}
