import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib';
import { getAdminClient } from './supabase';
import type { SubmissionForRender, StaffLite, RndRatings } from './portail-types';
import {
  fmtDateFr, INVESTIGATOR_PHONE, splitQuantity, RATING_KEYS, RATING_LABELS,
} from './portail-types';

// Minimal server-side PDF generator. Not pixel-matching the on-screen preview —
// this produces a clean, printable, legible record with signatures embedded.
//
// One PDF per submission = 1 sample-request page + 1 R&D page/participant + 1 consent page/participant.
// Signatures are stamped where each signer's row was captured.

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_W = A4.width - MARGIN * 2;

const ORANGE = rgb(0.816, 0.345, 0.149);
const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.47, 0.52);
const LIGHT = rgb(0.95, 0.95, 0.97);
const SEP = rgb(0.87, 0.88, 0.91);

interface FontSet { reg: PDFFont; bold: PDFFont; }

interface Cursor {
  page: PDFPage;
  y: number;   // top-down; decrease as we draw
  doc: PDFDocument;
  fonts: FontSet;
}

// ============================================================
// Public entry: build one PDF for a fully-signed submission.
// ============================================================

export interface SignerRecord {
  role: string;
  document_kind: string;
  participant_id: string | null;
  staff_name: string;
  signature_image: string | null;   // data URL (image/png)
  signed_at: string | null;
  ip_address: string | null;
}

export interface ParticipantRnd {
  staff_id: string;
  ratings: RndRatings | null;
  comments: string | null;
}

export interface BuildInput {
  submission: SubmissionForRender;
  participants: StaffLite[];
  signers: SignerRecord[];
  participantRnd?: ParticipantRnd[];
}

export async function buildSubmissionPdf(input: BuildInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { reg, bold };

  // Preload signature images (once) — keyed by "role|document_kind|participant_id" so we can find them per-doc.
  const sigCache = new Map<string, PDFImage>();
  for (const s of input.signers) {
    if (!s.signature_image) continue;
    try {
      const img = await embedDataUrl(doc, s.signature_image);
      const key = `${s.role}|${s.document_kind}|${s.participant_id ?? ''}`;
      sigCache.set(key, img);
    } catch {
      // Skip broken images silently — we'll show the typed name instead.
    }
  }

  // 1) Sample request
  await renderSampleRequestPage(doc, fonts, input, sigCache);

  // 2) R&D + Consent per participant
  for (const p of input.participants) {
    await renderRndPage(doc, fonts, input, p, sigCache);
    await renderConsentPage(doc, fonts, input, p, sigCache);
  }

  return await doc.save();
}

// ============================================================
// Storage helpers
// ============================================================

const BUCKET = 'documents';

export function storagePathFor(submissionId: string): string {
  return `${submissionId}/${submissionId}.pdf`;
}

export async function storePdf(submissionId: string, bytes: Uint8Array): Promise<string> {
  const admin = getAdminClient();
  const path = storagePathFor(submissionId);
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return path;
}

export async function signedDownloadUrl(path: string, ttlSeconds = 60): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`signed URL failed: ${error?.message}`);
  return data.signedUrl;
}

// Load a submission from the DB and build the PDF. Shared by the download
// endpoint and the finalize email pipeline so both render identical output.
export async function loadAndBuildPdf(submissionId: string): Promise<Uint8Array> {
  const admin = getAdminClient();
  const { data: subRow, error: subErr } = await admin
    .from('submissions')
    .select(`
      id, form_date, product_name, product_type, quantity, production_state, production_id,
      rnd_objective, rnd_quantity_for_test, rnd_lp_number, rnd_qty_destroyed, rnd_date_destroyed,
      rnd_destruction_id,
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
    .select('participant:participant_staff_id ( id, full_name ), rnd_ratings, rnd_comments')
    .eq('submission_id', submissionId);

  const { data: signerRows } = await admin
    .from('signers')
    .select('role, document_kind, participant_staff_id, signature_image, signed_at, ip_address, staff:staff_id ( full_name )')
    .eq('submission_id', submissionId);

  const toLite = (o: any): StaffLite => ({ id: o?.id ?? '', name: o?.full_name ?? '—', email: o?.email });

  const submission: SubmissionForRender = {
    id: subRow.id, form_date: subRow.form_date, product_name: subRow.product_name,
    product_type: subRow.product_type, quantity: subRow.quantity,
    production_state: subRow.production_state, production_id: subRow.production_id,
    rnd_objective: subRow.rnd_objective, rnd_quantity_for_test: subRow.rnd_quantity_for_test,
    rnd_lp_number: subRow.rnd_lp_number, rnd_qty_destroyed: subRow.rnd_qty_destroyed,
    rnd_date_destroyed: subRow.rnd_date_destroyed,
    rnd_destruction_id: subRow.rnd_destruction_id,
    initiator: toLite(subRow.initiator), production: toLite(subRow.production),
    qa: toLite(subRow.qa), consent_obtainer: toLite(subRow.consent_obtainer),
  };

  const participants: StaffLite[] = (partRows ?? [])
    .map((r: any) => ({ id: r.participant.id, name: r.participant.full_name }));

  const participantRnd: ParticipantRnd[] = (partRows ?? []).map((r: any) => ({
    staff_id: r.participant.id,
    ratings: (r.rnd_ratings ?? null) as any,
    comments: r.rnd_comments ?? null,
  }));

  const signers: SignerRecord[] = (signerRows ?? []).map((s: any): SignerRecord => ({
    role: s.role, document_kind: s.document_kind, participant_id: s.participant_staff_id,
    staff_name: s.staff?.full_name ?? '',
    signature_image: s.signature_image,
    signed_at: s.signed_at, ip_address: s.ip_address,
  }));

  return await buildSubmissionPdf({ submission, participants, signers, participantRnd });
}

// ============================================================
// Page renderers
// ============================================================

function newPage(doc: PDFDocument): { page: PDFPage; y: number } {
  const page = doc.addPage([A4.width, A4.height]);
  // Orange header band
  page.drawRectangle({ x: 0, y: A4.height - 44, width: A4.width, height: 44, color: ORANGE });
  page.drawText('OAZIZ EXTRACTS INC.', {
    x: MARGIN, y: A4.height - 28, size: 12, color: rgb(1, 1, 1),
    font: undefined as any, // set below
  });
  return { page, y: A4.height - 44 - 30 };
}

async function renderSampleRequestPage(
  doc: PDFDocument, fonts: FontSet, input: BuildInput, sigs: Map<string, PDFImage>,
) {
  const { page, y: startY } = newPage(doc);
  // Re-draw header title in bold
  page.drawText('OAZIZ EXTRACTS INC.', { x: MARGIN, y: A4.height - 28, size: 12, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText('F5-SOP-PRO-013/00', { x: A4.width - MARGIN - 100, y: A4.height - 28, size: 9, font: fonts.reg, color: rgb(1, 1, 1) });

  const c: Cursor = { page, y: startY, doc, fonts };
  title(c, "DEMANDE D'ÉCHANTILLON");
  gap(c, 6);
  subMuted(c, 'F2-QAS-001/01');
  gap(c, 14);

  section(c, "À REMPLIR PAR L'INITIATEUR");
  keyValueRow(c, 'Date', fmtDateFr(input.submission.form_date));
  keyValueRow(c, 'Nom de l\'initiateur', input.submission.initiator.name);
  keyValueRow(c, 'Nom du produit', input.submission.product_name);
  keyValueRow(c, 'Type de produit', input.submission.product_type);
  keyValueRow(c, 'Quantité (g ou unités)', input.submission.quantity);
  keyValueRow(c, 'Participants', input.participants.map((p) => p.name).join(', ') || '—');
  gap(c, 10);

  section(c, "À REMPLIR PAR LE PERSONNEL DE PRODUCTION");
  keyValueRow(c, 'Personnel', input.submission.production.name);
  keyValueRow(c, 'État de production',
    input.submission.production_state === 'vrac' ? 'Vrac' :
    input.submission.production_state === 'emballe' ? 'Emballé' : '—');
  keyValueRow(c, 'ID / Lot', input.submission.production_id ?? '—');
  gap(c, 20);

  signaturePair(c,
    { label: "Signature de l'initiateur", who: input.submission.initiator.name,
      image: sigs.get(`initiator|sample_request|`), when: findSignedAt(input, 'initiator', 'sample_request', null) },
    { label: 'Signature du personnel de production', who: input.submission.production.name,
      image: sigs.get(`production|sample_request|`), when: findSignedAt(input, 'production', 'sample_request', null) },
  );
}

async function renderRndPage(
  doc: PDFDocument, fonts: FontSet, input: BuildInput, participant: StaffLite, sigs: Map<string, PDFImage>,
) {
  const { page, y: startY } = newPage(doc);
  page.drawText('OAZIZ EXTRACTS INC.', { x: MARGIN, y: A4.height - 28, size: 12, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText('F2-PRO-013/04', { x: A4.width - MARGIN - 100, y: A4.height - 28, size: 9, font: fonts.reg, color: rgb(1, 1, 1) });

  const c: Cursor = { page, y: startY, doc, fonts };
  title(c, "RECHERCHE ET DÉVELOPPEMENT");
  subMuted(c, "UTILISATION ET PRODUCTION DE CANNABIS · F2-PRO-013/04");
  gap(c, 8);
  subMuted(c, `Participant : ${participant.name}`);
  gap(c, 14);

  section(c, "SECTION 2 — TEST D'ODEUR, DE GOÛT ET DE TEXTURE");
  keyValueRow(c, 'Nom du lot', input.submission.production_id ?? '—');
  keyValueRow(c, 'Type de produit', input.submission.product_type);
  keyValueRow(c, 'Souche(s)', input.submission.product_name);
  paragraphRow(c, 'Objectif',
    input.submission.rnd_objective ??
    'Contrôle qualité, essai de traction, analyse physique du lot, R&D pour le lancement du produit.',
    5);
  gap(c, 8);

  section(c, "INFORMATIONS SUR LE TEST");
  const qtyForTest = input.submission.rnd_quantity_for_test
    ?? splitQuantity(input.submission.quantity, Math.max(1, input.participants.length));
  keyValueRow(c, 'Quantité pour le test', qtyForTest);
  keyValueRow(c, 'Date du test', fmtDateFr(input.submission.form_date));
  keyValueRow(c, 'Personnel impliqué', participant.name);
  keyValueRow(c, 'N° producteur autorisé', input.submission.rnd_lp_number ?? '—');
  gap(c, 10);

  section(c, "CONCLUSION ET COMMENTAIRES");
  const pRnd = input.participantRnd?.find((r) => r.staff_id === participant.id);
  ratingsTable(c, pRnd?.ratings ?? null);
  gap(c, 6);
  commentsBox(c, pRnd?.comments ?? '', 4);
  gap(c, 14);

  signaturePair(c,
    { label: 'Signature du A/RPIC (participant)', who: participant.name,
      image: sigs.get(`participant|rnd|${participant.id}`), when: findSignedAt(input, 'participant', 'rnd', participant.id) },
    { label: 'Signature AQ (vérification)', who: input.submission.qa.name,
      image: sigs.get(`qa_verifier|rnd|${participant.id}`), when: findSignedAt(input, 'qa_verifier', 'rnd', participant.id) },
  );

  // VÉRIFICATION DU FORMULAIRE — Stephane's destruction record
  gap(c, 8);
  section(c, "VÉRIFICATION DU FORMULAIRE (À remplir par l'AQ)");
  keyValueRow(c, 'Révisé par', input.submission.qa.name);
  keyValueRow(c, 'Date de vérification',
    findSignedAt(input, 'qa_verifier', 'rnd', participant.id)
      ? fmtDateFr(findSignedAt(input, 'qa_verifier', 'rnd', participant.id)!)
      : '—');
  keyValueRow(c, 'ID de destruction', input.submission.rnd_destruction_id ?? '—');
  keyValueRow(c, 'Quantité détruite (g)', input.submission.rnd_qty_destroyed ?? '—');
  keyValueRow(c, 'Date de destruction',
    input.submission.rnd_date_destroyed ? fmtDateFr(input.submission.rnd_date_destroyed) : '—');
}

async function renderConsentPage(
  doc: PDFDocument, fonts: FontSet, input: BuildInput, participant: StaffLite, sigs: Map<string, PDFImage>,
) {
  const { page, y: startY } = newPage(doc);
  page.drawText('OAZIZ EXTRACTS INC.', { x: MARGIN, y: A4.height - 28, size: 12, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText('Consentement éclairé', { x: A4.width - MARGIN - 130, y: A4.height - 28, size: 9, font: fonts.reg, color: rgb(1, 1, 1) });

  const c: Cursor = { page, y: startY, doc, fonts };
  title(c, "FORMULAIRE DE CONSENTEMENT ÉCLAIRÉ");
  subMuted(c, "Étude organoleptique sur le cannabis");
  gap(c, 12);

  section(c, "PROJET");
  paragraph(c, "Titre : Évaluation organoleptique des produits du cannabis.");
  paragraph(c, `Chercheur principal : ${input.submission.initiator.name}`);
  paragraph(c, `Courriel : ${input.submission.initiator.email ?? ''} — Téléphone : ${INVESTIGATOR_PHONE}`);
  paragraph(c, "Financement : interne, Oaziz Extracts Inc.");
  gap(c, 6);

  section(c, "PARTICIPATION");
  paragraph(c, "Session de 15 à 30 minutes. Consommation d'une petite quantité pré-mesurée selon votre mode habituel. Questionnaire papier sur les propriétés organoleptiques.", GRAY);
  paragraph(c, "Participation volontaire. Vous pouvez vous retirer à tout moment sans conséquence.", GRAY);
  gap(c, 6);

  section(c, "CONFIDENTIALITÉ");
  paragraph(c, "Vos renseignements sont confidentiels et conservés à l'interne. Aucun partage extérieur à Oaziz Extracts Inc.", GRAY);
  gap(c, 12);

  section(c, "DÉCLARATION DE CONSENTEMENT");
  paragraph(c,
    "En signant ci-dessous, le participant confirme que l'étude lui a été expliquée, que ses questions ont été répondues, et qu'il accepte de participer volontairement.");
  gap(c, 20);

  signaturePair(c,
    { label: `Signature du participant (${participant.name})`, who: participant.name,
      image: sigs.get(`participant|consent|${participant.id}`), when: findSignedAt(input, 'participant', 'consent', participant.id) },
    { label: `Personne obtenant le consentement (${input.submission.consent_obtainer.name})`, who: input.submission.consent_obtainer.name,
      image: sigs.get(`consent_obtainer|consent|${participant.id}`), when: findSignedAt(input, 'consent_obtainer', 'consent', participant.id) },
  );
}

// ============================================================
// Layout primitives
// ============================================================

function title(c: Cursor, s: string) {
  c.page.drawText(s, { x: MARGIN, y: c.y, size: 20, font: c.fonts.bold, color: BLACK });
  c.y -= 24;
}

function subMuted(c: Cursor, s: string) {
  c.page.drawText(s, { x: MARGIN, y: c.y, size: 10, font: c.fonts.reg, color: GRAY });
  c.y -= 14;
}

function section(c: Cursor, s: string) {
  // Orange left bar + light rect + text
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: 3, height: 16, color: ORANGE });
  c.page.drawText(s, { x: MARGIN + 10, y: c.y, size: 11, font: c.fonts.bold, color: BLACK });
  c.y -= 20;
}

function keyValueRow(c: Cursor, label: string, value: string) {
  const labelW = 170;
  c.page.drawRectangle({ x: MARGIN, y: c.y - 4, width: CONTENT_W, height: 20, color: LIGHT });
  c.page.drawText(label, { x: MARGIN + 8, y: c.y + 2, size: 9, font: c.fonts.bold, color: GRAY });
  c.page.drawText(truncate(value, 90), { x: MARGIN + 8 + labelW, y: c.y + 2, size: 10, font: c.fonts.reg, color: BLACK });
  c.y -= 22;
}

// Multi-line "key : long paragraph" row. Wraps value across up to maxLines lines,
// grows the box height accordingly. Used for R&D objectif.
function paragraphRow(c: Cursor, label: string, value: string, maxLines: number) {
  const labelW = 170;
  const valueW = CONTENT_W - labelW - 16;
  const lineHeight = 13;
  let lines = wrap(value, c.fonts.reg, 10, valueW);
  const truncated = lines.length > maxLines;
  if (truncated) {
    lines = lines.slice(0, maxLines);
    // Add ellipsis to last line if we cut off content
    const last = lines[maxLines - 1];
    if (last.length > 3) lines[maxLines - 1] = last.slice(0, -1) + '…';
  }
  const displayed = Math.max(1, lines.length);
  const boxH = displayed * lineHeight + 10;
  c.page.drawRectangle({ x: MARGIN, y: c.y - boxH + 14, width: CONTENT_W, height: boxH, color: LIGHT });
  c.page.drawText(label, { x: MARGIN + 8, y: c.y + 2, size: 9, font: c.fonts.bold, color: GRAY });
  for (let i = 0; i < lines.length; i++) {
    c.page.drawText(lines[i], {
      x: MARGIN + 8 + labelW, y: c.y + 2 - i * lineHeight,
      size: 10, font: c.fonts.reg, color: BLACK,
    });
  }
  c.y -= boxH + 4;
}

function ratingsTable(c: Cursor, ratings: RndRatings | null) {
  const rowH = 16;
  const labelW = 130;
  const cellW = (CONTENT_W - labelW) / 5;
  // Header
  c.page.drawRectangle({ x: MARGIN, y: c.y - rowH + 12, width: CONTENT_W, height: rowH, borderColor: SEP, borderWidth: 0.6 });
  c.page.drawText('Note', { x: MARGIN + 6, y: c.y, size: 9, font: c.fonts.bold, color: GRAY });
  for (let n = 1; n <= 5; n++) {
    const x = MARGIN + labelW + (n - 1) * cellW;
    c.page.drawLine({ start: { x, y: c.y - rowH + 12 }, end: { x, y: c.y + 12 }, thickness: 0.5, color: SEP });
    c.page.drawText(String(n), { x: x + cellW / 2 - 3, y: c.y, size: 9, font: c.fonts.bold, color: GRAY });
  }
  c.y -= rowH + 2;
  // Rows
  for (const key of RATING_KEYS) {
    const val = ratings?.[key] ?? null;
    c.page.drawRectangle({ x: MARGIN, y: c.y - rowH + 12, width: CONTENT_W, height: rowH, borderColor: SEP, borderWidth: 0.6 });
    c.page.drawText(RATING_LABELS[key], { x: MARGIN + 6, y: c.y, size: 9, font: c.fonts.reg, color: BLACK });
    for (let n = 1; n <= 5; n++) {
      const x = MARGIN + labelW + (n - 1) * cellW;
      c.page.drawLine({ start: { x, y: c.y - rowH + 12 }, end: { x, y: c.y + 12 }, thickness: 0.5, color: SEP });
      if (val === n) {
        c.page.drawText('X', { x: x + cellW / 2 - 3, y: c.y, size: 11, font: c.fonts.bold, color: BLACK });
      }
    }
    c.y -= rowH + 2;
  }
}

function commentsBox(c: Cursor, comments: string, minLines: number) {
  const lineHeight = 13;
  const lines = comments ? wrap(comments, c.fonts.reg, 10, CONTENT_W - 12) : [];
  const displayed = Math.max(minLines, lines.length);
  const boxH = displayed * lineHeight + 12;
  c.page.drawRectangle({
    x: MARGIN, y: c.y - boxH + 14, width: CONTENT_W, height: boxH,
    borderColor: SEP, borderWidth: 0.6,
  });
  c.page.drawText('Rétroaction / Commentaires :', {
    x: MARGIN + 6, y: c.y + 2, size: 8, font: c.fonts.bold, color: GRAY,
  });
  for (let i = 0; i < lines.length; i++) {
    c.page.drawText(lines[i], {
      x: MARGIN + 6, y: c.y - 12 - i * lineHeight,
      size: 10, font: c.fonts.reg, color: BLACK,
    });
  }
  c.y -= boxH + 4;
}

function paragraph(c: Cursor, s: string, color = BLACK) {
  const lines = wrap(s, c.fonts.reg, 10, CONTENT_W);
  for (const line of lines) {
    c.page.drawText(line, { x: MARGIN, y: c.y, size: 10, font: c.fonts.reg, color });
    c.y -= 14;
  }
}

function gap(c: Cursor, h: number) { c.y -= h; }

interface SigInput { label: string; who: string; image: PDFImage | undefined; when: string | null; }

function signaturePair(c: Cursor, left: SigInput, right: SigInput) {
  const boxH = 90;
  const boxW = (CONTENT_W - 20) / 2;
  const y = c.y - boxH;

  drawSigBox(c, MARGIN, y, boxW, boxH, left);
  drawSigBox(c, MARGIN + boxW + 20, y, boxW, boxH, right);

  c.y = y - 4;
}

function drawSigBox(c: Cursor, x: number, y: number, w: number, h: number, sig: SigInput) {
  // Frame
  c.page.drawRectangle({ x, y, width: w, height: h, borderColor: SEP, borderWidth: 1 });
  // Signature area (top ~60%)
  const sigAreaH = h - 34;
  if (sig.image) {
    const iw = sig.image.width, ih = sig.image.height;
    const scale = Math.min((w - 12) / iw, (sigAreaH - 8) / ih) * 0.95;
    const dw = iw * scale, dh = ih * scale;
    c.page.drawImage(sig.image, {
      x: x + (w - dw) / 2, y: y + h - 8 - dh, width: dw, height: dh,
    });
  } else {
    // Empty area — nothing drawn
  }
  // Underline
  c.page.drawLine({
    start: { x: x + 8, y: y + 30 }, end: { x: x + w - 8, y: y + 30 },
    thickness: 0.8, color: SEP,
  });
  // Meta
  c.page.drawText(sig.label, { x: x + 8, y: y + 16, size: 8, font: c.fonts.bold, color: BLACK });
  const meta = sig.when
    ? `${sig.who} · ${fmtDateFr(sig.when)}`
    : `${sig.who} · (non signé)`;
  c.page.drawText(truncate(meta, Math.floor((w - 12) / 4)), {
    x: x + 8, y: y + 5, size: 7.5, font: c.fonts.reg, color: GRAY,
  });
}

// ============================================================
// Utils
// ============================================================

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
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

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1) + '…';
}

async function embedDataUrl(doc: PDFDocument, dataUrl: string): Promise<PDFImage> {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('unsupported image');
  const bytes = Buffer.from(m[2], 'base64');
  if (m[1] === 'png') return doc.embedPng(bytes);
  return doc.embedJpg(bytes);
}

function findSignedAt(input: BuildInput, role: string, kind: string, pid: string | null): string | null {
  const s = input.signers.find((s) =>
    s.role === role && s.document_kind === kind && (s.participant_id ?? null) === (pid ?? null));
  return s?.signed_at ?? null;
}
