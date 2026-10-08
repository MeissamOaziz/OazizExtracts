import { Resend } from 'resend';

const OAZIZ_ORANGE = '#d05826';
const OAZIZ_ORANGE_DEEP = '#a8451d';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateFr(iso: string): string {
  // Interpret plain YYYY-MM-DD as a calendar date, not UTC midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const ROLE_LABELS_FR: Record<string, string> = {
  initiator: 'Initiateur',
  production: 'Personnel de production',
  participant: 'Participant',
  consent_obtainer: 'Personne obtenant le consentement',
  qa_verifier: 'Vérification AQ',
};

// ============================================================
// Shared shell — light theme, orange accents. All portal emails
// go through renderEmailShell to stay visually consistent.
// ============================================================

interface ShellOpts {
  preheader: string;    // hidden preview text in most inbox clients
  badge: string;        // small orange pill above the heading
  greeting: string;     // e.g. "Bonjour Kyle,"
  intro: string;        // one or two sentences
  rows?: Array<{ label: string; value: string }>;   // optional key/value rows, zebra-striped
  ctaLabel: string;
  ctaUrl: string;
  fallbackNote?: string; // small text under the button
  footerNote?: string;   // small footer text
  brandLine?: string;    // header line under the logo (defaults to "Portail R&D")
}

function renderEmailShell(o: ShellOpts): string {
  const rowsHtml = (o.rows ?? []).map((r, i) => {
    const bg = i % 2 === 0 ? '#fdf6f1' : '#ffffff';
    return `<tr>
      <td style="padding:12px 18px;background:${bg};border-left:3px solid ${OAZIZ_ORANGE};font-size:11px;font-weight:600;color:#8a8f9c;text-transform:uppercase;letter-spacing:.4px;width:38%;">${escapeHtml(r.label)}</td>
      <td style="padding:12px 18px;background:${bg};font-size:14px;color:#1a1d24;">${escapeHtml(r.value)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Portail Oaziz</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d24;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f5f7;opacity:0;">
    ${escapeHtml(o.preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(16,24,40,0.06);border-top:4px solid ${OAZIZ_ORANGE};">

        <!-- Header (white) with orange accent bar -->
        <tr>
          <td style="background:#ffffff;padding:26px 28px 18px;text-align:center;border-bottom:1px solid #eef0f3;">
            <img src="https://www.oaziz.ca/icon-192.png" width="56" height="56" alt="Oaziz Extracts" style="display:inline-block;height:56px;width:56px;border:0;"/>
            <div style="color:${OAZIZ_ORANGE_DEEP};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-top:10px;">
              Oaziz Extracts &middot; ${escapeHtml(o.brandLine ?? 'Portail R&D')}
            </div>
          </td>
        </tr>

        <!-- White body -->
        <tr>
          <td style="padding:32px 28px 8px;">
            <span style="display:inline-block;background:${OAZIZ_ORANGE};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:4px 12px;border-radius:20px;">${escapeHtml(o.badge)}</span>
            <h1 style="color:#1a1d24;font-size:22px;font-weight:700;margin:14px 0 8px;line-height:1.3;">${escapeHtml(o.greeting)}</h1>
            <p style="color:#4b5063;font-size:15px;line-height:1.55;margin:0 0 22px;">${o.intro}</p>
          </td>
        </tr>

        ${rowsHtml ? `<tr><td style="padding:0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${rowsHtml}</table>
        </td></tr>` : ''}

        <!-- CTA button -->
        <tr>
          <td style="padding:26px 28px 8px;text-align:center;">
            <a href="${o.ctaUrl}" style="display:inline-block;background:${OAZIZ_ORANGE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;box-shadow:0 2px 6px rgba(208,88,38,0.3);">${escapeHtml(o.ctaLabel)}</a>
          </td>
        </tr>

        ${o.fallbackNote ? `<tr><td style="padding:8px 28px 22px;">
          <p style="color:#8a8f9c;font-size:12px;line-height:1.5;margin:0;text-align:center;">${o.fallbackNote}</p>
        </td></tr>` : ''}

        <!-- Fallback URL block -->
        <tr>
          <td style="padding:0 28px 24px;">
            <div style="background:#fdf6f1;border-left:3px solid ${OAZIZ_ORANGE_DEEP};padding:12px 14px;border-radius:6px;">
              <div style="font-size:11px;font-weight:600;color:#8a8f9c;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">
                Ou copiez ce lien
              </div>
              <div style="font-size:12px;color:#4b5063;word-break:break-all;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;">
                ${escapeHtml(o.ctaUrl)}
              </div>
            </div>
          </td>
        </tr>

        <!-- Muted footer -->
        <tr>
          <td style="background:#fafbfc;padding:18px 28px;border-top:1px solid #eef0f3;text-align:center;">
            <div style="color:#8a8f9c;font-size:11px;line-height:1.5;">
              ${o.footerNote ?? ''}
              ${o.footerNote ? '<br/>' : ''}
              Oaziz Extracts Inc. &middot; Montréal, QC &middot; <a href="https://www.oaziz.ca" style="color:${OAZIZ_ORANGE_DEEP};text-decoration:none;">oaziz.ca</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ============================================================
// Bilingual shell for vendor-facing emails (external recipients — these are
// often a supplier's first impression of Oaziz, so FR and EN are both shown
// in the same email rather than picking one). Separate from renderEmailShell
// above (which is French-only and branded "Portail R&D" — not appropriate to
// show an outside vendor). Uses a bulletproof VML button so the CTA still
// renders as a proper rounded button in Outlook desktop, which ignores
// border-radius on a plain <a> tag.
// ============================================================

interface VendorShellOpts {
  preheaderFr: string;
  preheaderEn: string;
  headingFr: string;
  headingEn: string;
  introFr: string;
  introEn: string;
  ctaLabelFr: string;
  ctaLabelEn: string;
  ctaUrl: string;
  fallbackNoteFr?: string;
  fallbackNoteEn?: string;
  footerNote?: string;
}

function vmlButton(url: string, label: string): string {
  const escapedLabel = escapeHtml(label);
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:280px;" arcsize="14%" stroke="f" fillcolor="${OAZIZ_ORANGE}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">${escapedLabel}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${url}" style="display:inline-block;background:${OAZIZ_ORANGE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:8px;box-shadow:0 2px 6px rgba(208,88,38,0.3);mso-hide:all;">${escapedLabel}</a>
<!--<![endif]-->`;
}

function renderVendorEmailShell(o: VendorShellOpts): string {
  const langBlock = (heading: string, intro: string, fallback: string | undefined, langTag: string) => `
    <tr><td style="padding:0 28px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#c9cdd6;text-transform:uppercase;margin-bottom:6px;">${langTag}</div>
      <h1 style="color:#1a1d24;font-size:20px;font-weight:700;margin:0 0 8px;line-height:1.3;">${escapeHtml(heading)}</h1>
      <p style="color:#4b5063;font-size:15px;line-height:1.55;margin:0 0 6px;">${intro}</p>
      ${fallback ? `<p style="color:#8a8f9c;font-size:12px;line-height:1.5;margin:0;">${escapeHtml(fallback)}</p>` : ''}
    </td></tr>`;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Oaziz Extracts</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d24;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f5f7;opacity:0;">
    ${escapeHtml(o.preheaderFr)} — ${escapeHtml(o.preheaderEn)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(16,24,40,0.06);border-top:4px solid ${OAZIZ_ORANGE};">

        <tr>
          <td style="background:#ffffff;padding:26px 28px 18px;text-align:center;border-bottom:1px solid #eef0f3;">
            <img src="https://www.oaziz.ca/icon-192.png" width="56" height="56" alt="Oaziz Extracts" style="display:inline-block;height:56px;width:56px;border:0;"/>
            <div style="color:${OAZIZ_ORANGE_DEEP};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-top:10px;">
              Oaziz Extracts
            </div>
          </td>
        </tr>

        <tr><td style="height:26px;line-height:26px;font-size:0;">&nbsp;</td></tr>
        ${langBlock(o.headingFr, o.introFr, o.fallbackNoteFr, 'Français')}
        <tr><td style="padding:18px 28px;"><div style="border-top:1px solid #eef0f3;"></div></td></tr>
        ${langBlock(o.headingEn, o.introEn, o.fallbackNoteEn, 'English')}
        <tr><td style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>

        <tr>
          <td style="padding:20px 28px 8px;text-align:center;">
            ${vmlButton(o.ctaUrl, `${o.ctaLabelFr} / ${o.ctaLabelEn}`)}
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px 24px;">
            <div style="background:#fdf6f1;border-left:3px solid ${OAZIZ_ORANGE_DEEP};padding:12px 14px;border-radius:6px;">
              <div style="font-size:11px;font-weight:600;color:#8a8f9c;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">
                Ou copiez ce lien / Or copy this link
              </div>
              <div style="font-size:12px;color:#4b5063;word-break:break-all;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;">
                ${escapeHtml(o.ctaUrl)}
              </div>
            </div>
          </td>
        </tr>

        <tr>
          <td style="background:#fafbfc;padding:18px 28px;border-top:1px solid #eef0f3;text-align:center;">
            <div style="color:#8a8f9c;font-size:11px;line-height:1.5;">
              ${o.footerNote ?? ''}
              ${o.footerNote ? '<br/>' : ''}
              Oaziz Extracts Inc. &middot; 322 rue de Port-Royal Ouest, Montréal, QC &middot; <a href="https://www.oaziz.ca" style="color:${OAZIZ_ORANGE_DEEP};text-decoration:none;">oaziz.ca</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ============================================================
// Signer invite (F5-SOP-PRO-013 signature flow)
// ============================================================

export interface SignerInviteEmail {
  toEmail: string;
  toName: string;
  role: string;
  submission: {
    id: string;
    form_date: string;
    product_name: string;
    product_type: string;
    initiator_name: string;
  };
  signerUrl: string;
  expiresAt: string;
}

export async function sendSignerInvite(
  invite: SignerInviteEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[signer-email] RESEND_API_KEY not set; would-have-sent link to ${invite.toEmail}: ${invite.signerUrl}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const roleLabel = ROLE_LABELS_FR[invite.role] ?? invite.role;
  const s = invite.submission;

  const html = renderEmailShell({
    preheader: `${invite.submission.initiator_name} vous demande de signer les documents pour ${s.product_name}.`,
    badge: `Signature — ${roleLabel}`,
    greeting: `Bonjour ${invite.toName.split(' ')[0] || invite.toName},`,
    intro: `<strong>${escapeHtml(invite.submission.initiator_name)}</strong> vous demande de signer les documents de la demande d'échantillon suivante&nbsp;:`,
    rows: [
      { label: 'Produit', value: `${s.product_name} · ${s.product_type}` },
      { label: 'Date du formulaire', value: formatDateFr(s.form_date) },
      { label: 'Votre rôle', value: roleLabel },
    ],
    ctaLabel: 'Ouvrir et signer',
    ctaUrl: invite.signerUrl,
    fallbackNote: `Ce lien est personnel et expire le ${formatDateFr(invite.expiresAt)}.`,
    footerNote: 'Vous avez reçu ce courriel parce qu\'une demande de signature R&D vous concerne.',
  });

  const subject = `[Oaziz R&D] Signature requise - ${s.product_name}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: [invite.toEmail], replyTo, subject, html,
    });
    if (error) {
      console.error('[signer-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[signer-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Finalized R&D — sent to the distribution list when Stéphane signs QA
// ============================================================

export interface FinalizedRndEmail {
  submission: {
    id: string;
    form_date: string;
    product_name: string;
    product_type: string;
    initiator_name: string;
    qa_name: string;
    participants: string[];   // just names, for display
  };
  pdfBytes: Uint8Array;
  recipients: string[];       // deduped emails
}

export async function sendFinalizedRnd(
  input: FinalizedRndEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string; id?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[finalized-email] RESEND_API_KEY not set; would-have-sent to ${input.recipients.join(', ')}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const s = input.submission;

  const html = renderEmailShell({
    preheader: `Le formulaire R&D pour ${s.product_name} a été signé par tous les intervenants. Le PDF est joint.`,
    badge: 'Formulaire finalisé',
    greeting: 'Formulaire R&D finalisé',
    intro: `Le formulaire R&D pour <strong>${escapeHtml(s.product_name)}</strong> a été signé par tous les intervenants (initiateur, personnel de production, participants, personne obtenant le consentement, vérification AQ). <strong>Le document PDF final est joint à ce courriel</strong> — conservez-le pour vos dossiers.`,
    rows: [
      { label: 'Produit', value: `${s.product_name} · ${s.product_type}` },
      { label: 'Date du formulaire', value: formatDateFr(s.form_date) },
      { label: 'Initiateur', value: s.initiator_name },
      { label: 'Vérification AQ', value: s.qa_name },
      { label: 'Participants', value: s.participants.join(', ') || '—' },
    ],
    ctaLabel: 'Ouvrir dans le portail',
    ctaUrl: `${siteUrl}/portail/demande/${s.id}`,
    fallbackNote: 'Copie archivée dans le portail. Le PDF signé est en pièce jointe.',
    footerNote: 'Diffusion automatique du portail R&D d\'Oaziz Extracts.',
  });

  const subject = `[Oaziz R&D] Formulaire finalisé - ${s.product_name}`;
  const filename = `oaziz-rd-${s.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${s.id.slice(0, 8)}.pdf`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: input.recipients, replyTo, subject, html,
      attachments: [{ filename, content: Buffer.from(input.pdfBytes) }],
    });
    if (error) {
      console.error('[finalized-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id, id: data?.id };
  } catch (e) {
    console.error('[finalized-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Portal invite / password reset (Kyle-style first-time or forgot-password)
// ============================================================

export interface PortalInviteEmail {
  toEmail: string;
  toName: string;
  actionUrl: string;         // pre-signed Supabase link → lands on /portail
  kind: 'invite' | 'recovery';
}

export async function sendPortalInvite(
  invite: PortalInviteEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[portal-invite] RESEND_API_KEY not set; would-have-sent link to ${invite.toEmail}: ${invite.actionUrl}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const isInvite = invite.kind === 'invite';
  const badge = isInvite ? 'Bienvenue' : 'Réinitialisation';
  const subject = isInvite
    ? '[Portail Oaziz] Bienvenue — définissez votre mot de passe'
    : '[Portail Oaziz] Réinitialisation du mot de passe';

  const intro = isInvite
    ? `Vous avez été invité(e) à utiliser le <strong>portail interne d'Oaziz Extracts</strong>. Cliquez ci-dessous pour définir votre mot de passe et vous connecter.`
    : `Une réinitialisation du mot de passe a été demandée pour votre compte. Cliquez ci-dessous pour choisir un nouveau mot de passe.`;

  const html = renderEmailShell({
    preheader: isInvite ? 'Définissez votre mot de passe pour accéder au portail d\'Oaziz Extracts.' : 'Choisissez un nouveau mot de passe pour votre compte du portail Oaziz.',
    badge,
    greeting: `Bonjour ${invite.toName.split(' ')[0] || invite.toName},`,
    intro,
    ctaLabel: isInvite ? 'Définir mon mot de passe' : 'Réinitialiser mon mot de passe',
    ctaUrl: invite.actionUrl,
    fallbackNote: 'Ce lien est à usage unique et expire dans 24 heures. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message.',
    footerNote: 'Portail réservé au personnel autorisé d\'Oaziz Extracts.',
  });

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: [invite.toEmail], replyTo, subject, html,
    });
    if (error) {
      console.error('[portal-invite] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[portal-invite] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Atelier — new order landed, sent to the production manager
// ============================================================

export interface NewOrderEmail {
  toEmail: string;
  toName: string;
  order: {
    order_no: string;
    customer_po_ref: string | null;
    source: 'customer_po' | 'internal_refill' | 'packaging_request';
    customer_name: string | null;
    requested_delivery_date: string | null;
    line_summary: string;
    created_by_name: string;
  };
  orderUrl: string;
}

const ORDER_SOURCE_FR: Record<string, string> = {
  customer_po: 'Bon de commande client',
  internal_refill: 'Réapprovisionnement interne',
  packaging_request: "Demande d'emballage",
};

export async function sendNewOrderNotice(
  n: NewOrderEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[atelier-email] RESEND_API_KEY not set; would-have-notified ${n.toEmail} about ${n.order.order_no}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const o = n.order;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Numéro', value: o.order_no },
  ];
  if (o.customer_po_ref) rows.push({ label: 'Bon de commande client', value: o.customer_po_ref });
  if (o.customer_name) rows.push({ label: 'Client', value: o.customer_name });
  rows.push({ label: 'Type', value: ORDER_SOURCE_FR[o.source] ?? o.source });
  rows.push({ label: 'Contenu', value: o.line_summary });
  if (o.requested_delivery_date) {
    rows.push({ label: 'Livraison demandée', value: formatDateFr(o.requested_delivery_date) });
  }
  rows.push({ label: 'Saisi par', value: o.created_by_name });

  const html = renderEmailShell({
    preheader: `${o.order_no} — ${o.line_summary}`,
    badge: 'Atelier — nouvelle commande',
    greeting: `Bonjour ${n.toName.split(' ')[0] || n.toName},`,
    intro: 'Une nouvelle commande vient d\'entrer dans l\'Atelier et attend son plan de production&nbsp;:',
    rows,
    ctaLabel: 'Ouvrir la commande',
    ctaUrl: n.orderUrl,
    fallbackNote: 'Le bon de travail est déjà créé et attend la répartition en étapes.',
    footerNote: 'Vous recevez ce courriel parce que vous êtes responsable de la production.',
  });

  const label = o.customer_po_ref ? `${o.customer_po_ref} · ${o.order_no}` : o.order_no;
  const subject = `[Oaziz Atelier] Nouvelle commande - ${label}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: [n.toEmail], replyTo, subject, html });
    if (error) {
      console.error('[atelier-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[atelier-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// New vendor package submitted — sent individually to each of the five
// required approvers (Jacob, Stephane, Jorge, Kyle, Meissam). Each of them
// must personally click "Approved" in the portal; this is not a single
// QA decision, so everyone gets their own copy of the request.
// ============================================================

export interface VendorSubmissionEmail {
  toEmail: string;
  toName: string;
  companyName: string;
  submissionUrl: string;
}

export async function sendVendorSubmissionNotice(
  n: VendorSubmissionEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[vendor-email] RESEND_API_KEY not set; would-have-notified ${n.toEmail} about ${n.companyName}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderEmailShell({
    preheader: `${n.companyName} a soumis son dossier fournisseur — votre approbation individuelle est requise.`,
    badge: 'Nouveau fournisseur — approbation requise',
    greeting: `Bonjour ${n.toName.split(' ')[0] || n.toName},`,
    intro: `<strong>${escapeHtml(n.companyName)}</strong> vient de soumettre son formulaire d'auto-évaluation fournisseur et ses documents (licence CRA, licence Santé Canada). Veuillez réviser le dossier et cliquer « Approuver » de votre côté — votre approbation est enregistrée individuellement et sert de preuve en cas de vérification par Santé Canada. Aucun échantillon ni produit ne doit être accepté avant que tous les approbateurs requis aient confirmé.`,
    rows: [{ label: 'Fournisseur', value: n.companyName }],
    ctaLabel: 'Réviser et approuver',
    ctaUrl: n.submissionUrl,
    fallbackNote: 'Consultez le dossier dans la section Fournisseurs du portail pour voir tous les documents.',
    footerNote: 'Diffusion automatique — nouvelle demande de qualification fournisseur.',
  });

  const subject = `[Oaziz] Approbation requise - Nouveau fournisseur ${n.companyName}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [n.toEmail],
      replyTo,
      subject,
      html,
    });
    if (error) {
      console.error('[vendor-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[vendor-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Vendor draft saved — gives the person filling the public form a link to
// come back and finish later. Sent once, the first time a draft is saved.
// ============================================================

export interface VendorDraftLinkEmail {
  toEmail: string;
  companyName: string;
  resumeUrl: string;
}

export async function sendVendorDraftLink(
  n: VendorDraftLinkEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[vendor-draft-email] RESEND_API_KEY not set; would-have-sent draft link to ${n.toEmail}: ${n.resumeUrl}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderVendorEmailShell({
    preheaderFr: 'Continuez votre formulaire de qualification fournisseur Oaziz Extracts quand vous serez prêt.',
    preheaderEn: 'Continue your Oaziz Extracts vendor qualification form whenever you\'re ready.',
    headingFr: 'Votre brouillon a été enregistré',
    headingEn: 'Your draft has been saved',
    introFr: `Voici votre lien personnel pour continuer et soumettre le formulaire de qualification fournisseur pour <strong>${escapeHtml(n.companyName)}</strong> — vos renseignements déjà saisis sont conservés.`,
    introEn: `Here is your personal link to continue and submit the vendor qualification form for <strong>${escapeHtml(n.companyName)}</strong> — your previously entered information has been saved.`,
    ctaLabelFr: 'Continuer le formulaire',
    ctaLabelEn: 'Continue the form',
    ctaUrl: n.resumeUrl,
    fallbackNoteFr: 'Conservez ce lien — il vous permet de revenir compléter le dossier à tout moment avant de le soumettre.',
    fallbackNoteEn: 'Keep this link — it lets you come back and complete the file at any time before submitting.',
  });

  const subject = `Oaziz Extracts — Continuez votre dossier fournisseur / Continue your vendor file — ${n.companyName}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: [n.toEmail], replyTo, subject, html });
    if (error) {
      console.error('[vendor-draft-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[vendor-draft-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// New-vendor invite — sent by staff from the portal to a prospective
// vendor's email, with a link to the public qualification form and Oaziz's
// own CRA + Health Canada licenses attached for reciprocal verification.
// ============================================================

export interface VendorInviteEmail {
  toEmail: string;
  formUrl: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}

export async function sendVendorInviteEmail(
  n: VendorInviteEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[vendor-invite-email] RESEND_API_KEY not set; would-have-sent invite to ${n.toEmail}: ${n.formUrl}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderVendorEmailShell({
    preheaderFr: 'Oaziz Extracts vous invite à compléter le formulaire de qualification fournisseur.',
    preheaderEn: 'Oaziz Extracts invites you to complete the vendor qualification form.',
    headingFr: 'Bienvenue chez Oaziz Extracts',
    headingEn: 'Welcome to Oaziz Extracts',
    introFr: "Oaziz Extracts Inc. vous invite à compléter notre formulaire de qualification fournisseur avant que nous puissions faire affaire ensemble. Vous trouverez également ci-joint nos licences (Agence du revenu du Canada et Santé Canada) pour vos dossiers.",
    introEn: "Oaziz Extracts Inc. invites you to complete our vendor qualification form before we can do business together. You'll also find our licenses (Canada Revenue Agency and Health Canada) attached for your records.",
    ctaLabelFr: 'Remplir le formulaire',
    ctaLabelEn: 'Fill out the form',
    ctaUrl: n.formUrl,
    fallbackNoteFr: 'Vous pouvez enregistrer votre progression et y revenir plus tard.',
    fallbackNoteEn: 'You can save your progress and come back later.',
    footerNote: 'Oaziz Extracts Inc. — 322 rue de Port-Royal Ouest, Montréal, QC.',
  });

  const subject = 'Oaziz Extracts — Licences et lien de qualification fournisseur / Licenses and vendor qualification link';

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: [n.toEmail], replyTo, subject, html, attachments: n.attachments,
    });
    if (error) {
      console.error('[vendor-invite-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[vendor-invite-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Company licenses — quick-send our own CRA/Health Canada licenses to one or
// more email addresses on request, and the 6-months-before-expiry reminder.
// ============================================================

export interface CompanyLicensesEmail {
  toEmails: string[];
  attachments: Array<{ filename: string; content: Buffer }>;
}

export async function sendCompanyLicensesEmail(
  n: CompanyLicensesEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[company-license-email] RESEND_API_KEY not set; would-have-sent licenses to ${n.toEmails.join(', ')}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderVendorEmailShell({
    preheaderFr: 'Licences Oaziz Extracts (Agence du revenu du Canada et Santé Canada) ci-jointes.',
    preheaderEn: 'Oaziz Extracts licenses (Canada Revenue Agency and Health Canada) attached.',
    headingFr: 'Nos licences',
    headingEn: 'Our licenses',
    introFr: 'Veuillez trouver ci-joint nos licences en vigueur : Agence du revenu du Canada (cannabis) et Santé Canada.',
    introEn: 'Please find attached our current licenses: Canada Revenue Agency (cannabis) and Health Canada.',
    ctaLabelFr: 'Visiter oaziz.ca',
    ctaLabelEn: 'Visit oaziz.ca',
    ctaUrl: 'https://www.oaziz.ca',
    footerNote: 'Oaziz Extracts Inc. — 322 rue de Port-Royal Ouest, Montréal, QC.',
  });

  const subject = 'Oaziz Extracts — Licences (ARC et Santé Canada) / Licenses (CRA and Health Canada)';

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: n.toEmails, replyTo, subject, html, attachments: n.attachments,
    });
    if (error) {
      console.error('[company-license-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[company-license-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// Shared "expires in N days" / "expired N days ago" phrasing (French) for
// every license-expiry email — always computed from today vs. the actual
// expiry date, never a hardcoded lead time, so the copy stays correct
// regardless of exactly when the cron job's lead-time threshold fired.
function expiryPhraseFr(daysUntilExpiry: number): string {
  if (daysUntilExpiry > 1) return `expire dans ${daysUntilExpiry} jours`;
  if (daysUntilExpiry === 1) return 'expire demain';
  if (daysUntilExpiry === 0) return "expire aujourd'hui";
  const overdue = Math.abs(daysUntilExpiry);
  return overdue === 1 ? 'a expiré il y a 1 jour' : `a expiré il y a ${overdue} jours`;
}

export interface LicenseExpiryReminderEmail {
  toEmails: string[];
  kindLabel: string;
  expiryDate: string;
  daysUntilExpiry: number;
}

export async function sendLicenseExpiryReminder(
  n: LicenseExpiryReminderEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[license-reminder-email] RESEND_API_KEY not set; would-have-reminded ${n.toEmails.join(', ')} about ${n.kindLabel}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  const phrase = expiryPhraseFr(n.daysUntilExpiry);

  const html = renderEmailShell({
    preheader: `La licence ${n.kindLabel} d'Oaziz Extracts ${phrase} (${n.expiryDate}) — pensez à entamer le renouvellement.`,
    badge: 'Rappel — expiration de licence',
    greeting: `La licence ${n.kindLabel} ${phrase}`,
    intro: `La licence <strong>${escapeHtml(n.kindLabel)}</strong> d'Oaziz Extracts Inc. <strong>${phrase}</strong> (échéance le ${escapeHtml(n.expiryDate)}). Ceci est un rappel automatique — pensez à entamer le renouvellement si ce n'est pas déjà fait.`,
    ctaLabel: 'Gérer les licences',
    ctaUrl: `${siteUrl}/portail/fournisseurs/licences`,
    footerNote: 'Rappel automatique du portail Oaziz.',
  });

  const subject = `[Oaziz] Rappel — la licence ${n.kindLabel} ${phrase}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: n.toEmails, replyTo, subject, html });
    if (error) {
      console.error('[license-reminder-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[license-reminder-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// HR — generated document sent on request (Attestation / Incident Report /
// Evaluation) to whichever comma-separated recipients the staff member
// typed in. Internal, French-first like the rest of the R&D portal emails.
// ============================================================

export interface HrDocumentEmail {
  toEmails: string[];
  kindLabel: string;
  subjectLine: string;
  fileName: string;
  pdfBytes: Uint8Array;
}

export async function sendHrDocumentEmail(
  n: HrDocumentEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[hr-document-email] RESEND_API_KEY not set; would-have-sent ${n.kindLabel} to ${n.toEmails.join(', ')}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderEmailShell({
    preheader: `${n.kindLabel} — document généré depuis le portail RH d'Oaziz.`,
    badge: 'Ressources humaines',
    greeting: n.kindLabel,
    intro: `Veuillez trouver ci-joint le document <strong>${escapeHtml(n.kindLabel)}</strong> généré depuis le portail RH.`,
    ctaLabel: 'Ouvrir le portail',
    ctaUrl: (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '') + '/portail/rh',
    footerNote: 'Document envoyé depuis la section Ressources humaines du portail Oaziz.',
  });

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: n.toEmails, replyTo, subject: n.subjectLine, html,
      attachments: [{ filename: n.fileName, content: Buffer.from(n.pdfBytes) }],
    });
    if (error) {
      console.error('[hr-document-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[hr-document-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// New Employee Package — bilingual invite to the new hire (link to fill the
// Employee Information Form + sign the Code of Conduct), the internal
// witness countersign request, and the final completion notice to Jorge,
// Meissam, Stephane + the new employee.
// ============================================================

export interface EmployeePackageInviteEmail {
  toEmail: string;
  employeeName: string;
  language: 'fr' | 'en';
  packageUrl: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}

export async function sendEmployeePackageInvite(
  n: EmployeePackageInviteEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[hr-package-invite] RESEND_API_KEY not set; would-have-sent to ${n.toEmail}: ${n.packageUrl}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const isFr = n.language === 'fr';

  const html = renderVendorEmailShell({
    preheaderFr: 'Bienvenue chez Oaziz Extracts — veuillez compléter votre dossier d\'employé.',
    preheaderEn: 'Welcome to Oaziz Extracts — please complete your employee file.',
    headingFr: `Bienvenue chez Oaziz Extracts, ${n.employeeName.split(' ')[0] || n.employeeName} !`,
    headingEn: `Welcome to Oaziz Extracts, ${n.employeeName.split(' ')[0] || n.employeeName}!`,
    introFr: "Pour compléter votre dossier d'employé, veuillez remplir le formulaire de renseignements et signer électroniquement la politique de conduite ci-dessous. Vous trouverez également en pièce jointe vos formulaires fiscaux (TD1 et TP-1015.3) à compléter et remettre séparément.",
    introEn: "To complete your employee file, please fill in the information form and electronically sign the conduct policy below. You'll also find your tax forms (TD1 and TP-1015.3) attached — please complete and return those separately.",
    ctaLabelFr: 'Compléter mon dossier',
    ctaLabelEn: 'Complete my file',
    ctaUrl: n.packageUrl,
    footerNote: isFr ? 'Oaziz Extracts Inc. — Ressources humaines.' : 'Oaziz Extracts Inc. — Human Resources.',
  });

  const subject = isFr
    ? `Oaziz Extracts — Bienvenue, ${n.employeeName} ! Dossier d'employé à compléter`
    : `Oaziz Extracts — Welcome, ${n.employeeName}! Please complete your employee file`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: [n.toEmail], replyTo, subject, html, attachments: n.attachments,
    });
    if (error) {
      console.error('[hr-package-invite] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[hr-package-invite] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

export interface WitnessCountersignEmail {
  toEmail: string; toName: string; employeeName: string; portalUrl: string;
}

export async function sendWitnessCountersignRequest(
  n: WitnessCountersignEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[hr-witness-email] RESEND_API_KEY not set; would-have-notified ${n.toEmail}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderEmailShell({
    preheader: `${n.employeeName} a signé son dossier d'employé — votre contresignature est requise.`,
    badge: 'Contresignature requise',
    greeting: `Bonjour ${n.toName.split(' ')[0] || n.toName},`,
    intro: `<strong>${escapeHtml(n.employeeName)}</strong> vient de remplir et signer son dossier de nouvel employé (code de conduite). Veuillez réviser et apposer votre signature de témoin/gérant pour compléter le dossier.`,
    ctaLabel: 'Réviser et signer',
    ctaUrl: n.portalUrl,
    footerNote: 'Portail RH Oaziz — contresignature de nouvel employé.',
  });

  const subject = `[Oaziz RH] Contresignature requise - ${n.employeeName}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: [n.toEmail], replyTo, subject, html });
    if (error) {
      console.error('[hr-witness-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[hr-witness-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

export interface EmployeePackageCompletedEmail {
  toEmails: string[];
  employeeName: string;
  portalUrl: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}

export async function sendEmployeePackageCompleted(
  n: EmployeePackageCompletedEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[hr-package-completed] RESEND_API_KEY not set; would-have-notified ${n.toEmails.join(', ')}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';

  const html = renderEmailShell({
    preheader: `Le dossier de nouvel employé pour ${n.employeeName} est complété et signé.`,
    badge: 'Dossier complété',
    greeting: 'Dossier de nouvel employé complété',
    intro: `Le dossier d'employé pour <strong>${escapeHtml(n.employeeName)}</strong> a été rempli et signé par toutes les parties. Les documents signés sont joints à ce courriel et archivés dans le portail.`,
    ctaLabel: 'Ouvrir dans le portail',
    ctaUrl: n.portalUrl,
    footerNote: 'Portail RH Oaziz — dossier de nouvel employé.',
  });

  const subject = `[Oaziz RH] Dossier complété - ${n.employeeName}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: n.toEmails, replyTo, subject, html, attachments: n.attachments,
    });
    if (error) {
      console.error('[hr-package-completed] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[hr-package-completed] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Vendor-uploaded license expired — fired on the day a vendor's CRA or
// Health Canada license (dates captured on the qualification form) reaches
// its expiry date. One copy to the internal vendor-approval team, one
// bilingual copy to the vendor themselves asking for a renewed copy.
// ============================================================

function expiryPhraseEn(daysUntilExpiry: number): string {
  if (daysUntilExpiry > 1) return `expires in ${daysUntilExpiry} days`;
  if (daysUntilExpiry === 1) return 'expires tomorrow';
  if (daysUntilExpiry === 0) return 'expires today';
  const overdue = Math.abs(daysUntilExpiry);
  return overdue === 1 ? 'expired 1 day ago' : `expired ${overdue} days ago`;
}

export interface VendorLicenseExpiredInternalEmail {
  toEmails: string[];
  companyName: string;
  kindLabel: string;
  expiryDate: string;
  daysUntilExpiry: number;
  submissionUrl: string;
}

export async function sendVendorLicenseExpiredNoticeInternal(
  n: VendorLicenseExpiredInternalEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[vendor-license-expired-internal] RESEND_API_KEY not set; would-have-notified ${n.toEmails.join(', ')} about ${n.companyName}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const phrase = expiryPhraseFr(n.daysUntilExpiry);

  const html = renderEmailShell({
    preheader: `La licence ${n.kindLabel} de ${n.companyName} ${phrase} — un courriel a été envoyé au fournisseur pour en demander une copie à jour.`,
    badge: 'Licence fournisseur expirée',
    greeting: `${n.companyName} — licence ${n.kindLabel}`,
    intro: `La licence <strong>${escapeHtml(n.kindLabel)}</strong> au dossier de <strong>${escapeHtml(n.companyName)}</strong> ${phrase} (échéance le ${escapeHtml(n.expiryDate)}). Le fournisseur a été contacté automatiquement pour nous fournir une copie à jour.`,
    ctaLabel: 'Voir le dossier fournisseur',
    ctaUrl: n.submissionUrl,
    footerNote: 'Rappel automatique du portail Oaziz — qualification fournisseur.',
  });

  const subject = `[Oaziz] Licence ${n.kindLabel} ${phrase} - ${n.companyName}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: n.toEmails, replyTo, subject, html });
    if (error) {
      console.error('[vendor-license-expired-internal] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[vendor-license-expired-internal] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

export interface VendorLicenseExpiredVendorEmail {
  toEmail: string;
  companyName: string;
  kindLabel: string;
  expiryDate: string;
  daysUntilExpiry: number;
}

export async function sendVendorLicenseExpiredNoticeVendor(
  n: VendorLicenseExpiredVendorEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[vendor-license-expired-vendor] RESEND_API_KEY not set; would-have-notified ${n.toEmail}`);
    return { status: 'skipped_no_key' };
  }

  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const phraseFr = expiryPhraseFr(n.daysUntilExpiry);
  const phraseEn = expiryPhraseEn(n.daysUntilExpiry);
  const subjectBody = `Renouvellement de licence requis - ${n.kindLabel}`;
  const mailtoUrl = `mailto:info@oaziz.ca?subject=${encodeURIComponent(subjectBody + ' - ' + n.companyName)}`;

  const html = renderVendorEmailShell({
    preheaderFr: `Votre licence ${n.kindLabel} ${phraseFr} — veuillez nous faire parvenir une copie à jour.`,
    preheaderEn: `Your ${n.kindLabel} license ${phraseEn} — please send us an updated copy.`,
    headingFr: `Votre licence ${n.kindLabel} ${phraseFr}`,
    headingEn: `Your ${n.kindLabel} license ${phraseEn}`,
    introFr: `Selon nos dossiers, la licence <strong>${escapeHtml(n.kindLabel)}</strong> que vous nous avez fournie pour <strong>${escapeHtml(n.companyName)}</strong> ${phraseFr} (échéance le ${escapeHtml(n.expiryDate)}). Merci de nous faire parvenir une copie à jour dès que possible afin que nous puissions maintenir votre dossier de qualification à jour.`,
    introEn: `According to our records, the <strong>${escapeHtml(n.kindLabel)}</strong> license you provided for <strong>${escapeHtml(n.companyName)}</strong> ${phraseEn} (expiry date: ${escapeHtml(n.expiryDate)}). Please send us an updated copy as soon as possible so we can keep your qualification file current.`,
    ctaLabelFr: 'Répondre par courriel',
    ctaLabelEn: 'Reply by email',
    ctaUrl: mailtoUrl,
    footerNote: 'Oaziz Extracts Inc. — Qualification fournisseur / Vendor Qualification.',
  });

  const subject = `Oaziz Extracts — ${subjectBody}`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: [n.toEmail], replyTo, subject, html });
    if (error) {
      console.error('[vendor-license-expired-vendor] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[vendor-license-expired-vendor] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

// ============================================================
// Supplier payments — weekly approval request to the approver (Jorge) and
// the "approved" notice back to the people who prepare and pay.
// ============================================================

export interface PaymentApprovalRequestEmail {
  toEmail: string;
  approverName: string;
  weekLabel: string;
  preparedBy: string;
  count: number;
  totalSuggested: string;
  cashRows: Array<{ label: string; value: string }>;
  approvalUrl: string;
  portalUrl: string;
  resend?: boolean;
}

export async function sendPaymentApprovalRequest(
  n: PaymentApprovalRequestEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[payment-approval-email] RESEND_API_KEY not set; would-have-sent to ${n.toEmail}: ${n.approvalUrl}`);
    return { status: 'skipped_no_key' };
  }
  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const html = renderEmailShell({
    brandLine: 'Paiements fournisseurs',
    preheader: `${n.count} paiement(s) suggéré(s) — ${n.totalSuggested} — à approuver.`,
    badge: n.resend ? 'Rappel — approbation requise' : 'Approbation requise',
    greeting: `Bonjour ${n.approverName.split(' ')[0]},`,
    intro: `${escapeHtml(n.preparedBy)} a préparé les paiements fournisseurs de la semaine du <strong>${escapeHtml(n.weekLabel)}</strong>. `
      + 'Ouvrez le lien pour voir chaque fournisseur, le total dû et le détail des factures, puis entrer les montants approuvés.',
    rows: [
      { label: 'Paiements suggérés', value: String(n.count) },
      { label: 'Total suggéré', value: n.totalSuggested },
      ...n.cashRows,
    ],
    ctaLabel: 'Réviser et approuver',
    ctaUrl: n.approvalUrl,
    fallbackNote: `Ce lien personnel est valide 18 heures. Après ce délai, connectez-vous au portail (Paiements → Approbations) : <a href="${n.portalUrl}" style="color:${OAZIZ_ORANGE_DEEP};">${escapeHtml(n.portalUrl)}</a>. `
      + 'Une fois l’approbation envoyée, elle ne peut plus être modifiée — demandez à Meissam ou Nathalie tout changement.',
  });
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: [n.toEmail], replyTo,
      subject: `${n.resend ? 'Rappel — ' : ''}Paiements fournisseurs à approuver — semaine du ${n.weekLabel}`,
      html,
    });
    if (error) {
      console.error('[payment-approval-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[payment-approval-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}

export interface PaymentsApprovedEmail {
  toEmails: string[];
  approverName: string;
  weekLabel: string;
  approvedCount: number;
  totalApproved: string;
  totalSuggested: string;
  comment: string | null;
  runUrl: string;
}

export async function sendPaymentsApprovedNotice(
  n: PaymentsApprovedEmail,
): Promise<{ status: 'sent' | 'skipped_no_key' | 'error'; detail?: string }> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (n.toEmails.length === 0) return { status: 'skipped_no_key' };
  if (!apiKey) {
    console.warn(`[payments-approved-email] RESEND_API_KEY not set; would-have-sent to ${n.toEmails.join(', ')}`);
    return { status: 'skipped_no_key' };
  }
  const from = import.meta.env.SIGNER_FROM_EMAIL ?? 'Portail Oaziz <onboarding@resend.dev>';
  const replyTo = import.meta.env.SIGNER_REPLY_TO ?? 'info@oaziz.ca';
  const html = renderEmailShell({
    brandLine: 'Paiements fournisseurs',
    preheader: `${n.approverName} a approuvé ${n.totalApproved}.`,
    badge: 'Paiements approuvés',
    greeting: 'Paiements approuvés',
    intro: `${escapeHtml(n.approverName)} a approuvé les paiements de la semaine du <strong>${escapeHtml(n.weekLabel)}</strong>. `
      + 'Vous pouvez procéder aux paiements et cocher Payé / Remise au fur et à mesure.',
    rows: [
      { label: 'Paiements approuvés', value: String(n.approvedCount) },
      { label: 'Total approuvé', value: n.totalApproved },
      { label: 'Total suggéré', value: n.totalSuggested },
      ...(n.comment ? [{ label: 'Commentaire', value: n.comment }] : []),
    ],
    ctaLabel: 'Ouvrir la semaine',
    ctaUrl: n.runUrl,
  });
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from, to: n.toEmails, replyTo,
      subject: `Paiements approuvés — semaine du ${n.weekLabel} — ${n.totalApproved}`,
      html,
    });
    if (error) {
      console.error('[payments-approved-email] Resend error:', error);
      return { status: 'error', detail: error.message };
    }
    return { status: 'sent', detail: data?.id };
  } catch (e) {
    console.error('[payments-approved-email] unexpected error:', e);
    return { status: 'error', detail: String(e) };
  }
}
