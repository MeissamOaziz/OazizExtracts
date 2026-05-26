import type { APIRoute } from 'astro';
import { Resend } from 'resend';

// This endpoint must run server-side; pre-rendering would break it.
export const prerender = false;

const SUBJECT_LABELS_FR: Record<string, string> = {
  general: 'Demande générale',
  export:  'Exportation',
  sales:   'Ventes',
  qa:      'Assurance Qualité',
  finance: 'Finances',
};

const SUBJECT_LABELS_EN: Record<string, string> = {
  general: 'General inquiry',
  export:  'Export',
  sales:   'Sales',
  qa:      'Quality Assurance',
  finance: 'Finance',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(s: string): boolean {
  // Pragmatic check — RFC 5321 in 200 chars or less. Resend will reject malformed addresses anyway.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 320;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Honeypot — bots fill hidden field; humans never do.
    if (typeof body.company_website === 'string' && body.company_website.trim().length > 0) {
      // Pretend success so we don't tip off the bot.
      return Response.json({ ok: true });
    }

    const name    = (body.name    ?? '').toString().trim();
    const email   = (body.email   ?? '').toString().trim();
    const subject = (body.subject ?? '').toString().trim().toLowerCase();
    const message = (body.message ?? '').toString().trim();
    const context = (body.context ?? '').toString().trim();
    const lang    = body.lang === 'en' ? 'en' : 'fr';

    if (!name || !email || !subject || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return Response.json({ error: 'Invalid email' }, { status: 400 });
    }
    if (message.length > 5000) {
      return Response.json({ error: 'Message too long' }, { status: 400 });
    }

    const labels = lang === 'en' ? SUBJECT_LABELS_EN : SUBJECT_LABELS_FR;
    const subLabel = labels[subject] ?? subject;
    const emailSubject = `[Oaziz Extracts] ${subLabel}${context ? ` — ${context}` : ''}`;

    const safeName    = escapeHtml(name);
    const safeEmail   = escapeHtml(email);
    const safeSubject = escapeHtml(subLabel);
    const safeMessage = escapeHtml(message);
    const safeContext = escapeHtml(context);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;margin:0;padding:24px}
  .card{background:#1a1d27;border:1px solid #2a2d3a;border-radius:12px;padding:28px;max-width:560px;margin:0 auto}
  .brand{text-align:center;margin-bottom:18px}
  .brand img{height:64px;width:auto;display:inline-block}
  .brand-name{display:block;color:#fff;margin-top:8px;font-size:13px;font-weight:600;letter-spacing:.5px;text-transform:uppercase}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:#d05826;color:#fff;margin-bottom:18px}
  .row{margin-bottom:14px}
  .label{font-size:11px;font-weight:600;color:#8b93a7;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .value{font-size:14px;color:#e2e8f0;background:#11131c;border-radius:8px;padding:10px 14px;word-break:break-word}
  .message-box{white-space:pre-wrap;line-height:1.6}
  .footer{font-size:11px;color:#4a5068;margin-top:20px;text-align:center}
</style></head>
<body>
  <div class="card">
    <div class="brand">
      <img src="https://www.oaziz.ca/images/Oaziz-Logo.webp" alt="Oaziz Extracts" width="64" height="64" />
      <span class="brand-name">Oaziz Extracts</span>
    </div>
    <div class="badge">${safeSubject}</div>
    <div class="row"><div class="label">From</div><div class="value">${safeName} &lt;${safeEmail}&gt;</div></div>
    ${safeContext ? `<div class="row"><div class="label">Page / context</div><div class="value">${safeContext}</div></div>` : ''}
    <div class="row"><div class="label">Subject</div><div class="value">${safeSubject}</div></div>
    <div class="row"><div class="label">Message</div><div class="value message-box">${safeMessage}</div></div>
    <div class="footer">Sent via oaziz.ca contact form · Reply directly to respond.</div>
  </div>
</body></html>`;

    const apiKey = import.meta.env.RESEND_API_KEY;
    const toEmail = import.meta.env.CONTACT_TO_EMAIL ?? 'info@oaziz.ca';
    const fromEmail = import.meta.env.CONTACT_FROM_EMAIL ?? 'Oaziz Extracts <onboarding@resend.dev>';

    if (!apiKey) {
      console.error('Contact form: RESEND_API_KEY env var is not set');
      return Response.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      replyTo: email,
      subject: emailSubject,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return Response.json({ error: 'Email send failed', detail: error.message }, { status: 502 });
    }

    return Response.json({ ok: true, id: data?.id });
  } catch (e) {
    console.error('Contact form unexpected error:', e);
    return Response.json({ error: 'Unexpected server error' }, { status: 500 });
  }
};
