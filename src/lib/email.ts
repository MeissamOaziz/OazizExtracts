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
              Oaziz Extracts &middot; Portail R&amp;D
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
    ? '[Oaziz R&D] Bienvenue - définissez votre mot de passe'
    : '[Oaziz R&D] Réinitialisation du mot de passe';

  const intro = isInvite
    ? `Vous avez été invité(e) à utiliser le <strong>portail interne R&amp;D d'Oaziz Extracts</strong>. Cliquez ci-dessous pour définir votre mot de passe et vous connecter.`
    : `Une réinitialisation du mot de passe a été demandée pour votre compte. Cliquez ci-dessous pour choisir un nouveau mot de passe.`;

  const html = renderEmailShell({
    preheader: isInvite ? 'Définissez votre mot de passe pour accéder au portail R&D d\'Oaziz Extracts.' : 'Choisissez un nouveau mot de passe pour votre compte du portail R&D.',
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
