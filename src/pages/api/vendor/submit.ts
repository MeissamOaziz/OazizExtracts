import type { APIRoute } from 'astro';
import { getAdminClient } from '../../../lib/supabase';
import { validateUploadedFile } from '../../../lib/vendor-storage';
import { sendVendorDraftLink } from '../../../lib/email';
import { readVendorFields, reminderResets, sendForApproval, uploadAnyProvidedFiles } from '../../../lib/vendor-form-parse';
import { mintToken, sha256Hex } from '../../../lib/tokens';
import { findInviteByToken, inviteRecipients } from '../../../lib/vendor-invites';

export const prerender = false;

function backTo(
  submissionId: string | null,
  resumeToken: string | null,
  inviteToken: string | null,
  errorCode: string,
): string {
  // A form opened from an invite goes back to that same shared link, so the
  // vendor keeps working on the group's draft rather than a blank page.
  if (inviteToken) return `/fournisseurs?invite=${encodeURIComponent(inviteToken)}&error=${errorCode}`;
  const base = submissionId && resumeToken ? `/fournisseurs/brouillon/${resumeToken}` : '/fournisseurs';
  return `${base}?error=${errorCode}`;
}

function sharedLink(inviteToken: string, info: string): string {
  return `/fournisseurs?invite=${encodeURIComponent(inviteToken)}&info=${info}`;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const getOrNull = (k: string) => get(k) || null;

  const action = get('action') === 'draft' ? 'draft' : 'submit';
  const existingSubmissionId = getOrNull('submission_id');
  const resumeToken = getOrNull('resume_token');
  const inviteToken = getOrNull('invite_token');

  const admin = getAdminClient();

  // If resuming, verify the (submission_id, resume_token) pair before touching anything.
  // A submitted file carries a token only while Oaziz has sent it back for
  // changes (on hold or rejected): the supplier corrects it and submits again.
  let existing: Record<string, any> | null = null;
  if (existingSubmissionId && resumeToken) {
    const { data } = await admin
      .from('vendor_submissions')
      .select('*')
      .eq('id', existingSubmissionId)
      .eq('resume_token_hash', sha256Hex(resumeToken))
      .in('status', ['draft', 'submitted'])
      .maybeSingle();
    if (!data) return redirect('/fournisseurs?error=unknown', 303);
    existing = data;
  }

  // Opened from an invite: everyone on it shares one form. Once anyone has saved,
  // the invite points at that draft, and every later save goes into it. That
  // includes a colleague whose page was opened before the draft existed, who
  // would otherwise have started a second, separate submission.
  const invite = await findInviteByToken(admin, inviteToken);
  let viaInvite = false;
  if (!existing && invite?.vendor_submission_id) {
    const { data } = await admin
      .from('vendor_submissions')
      .select('*')
      .eq('id', invite.vendor_submission_id)
      .maybeSingle();
    if (data?.status === 'draft') {
      existing = data;
      viaInvite = true;
    } else if (data?.status === 'submitted') {
      // A colleague already submitted it: the shared link now shows that.
      return redirect(`/fournisseurs?invite=${encodeURIComponent(inviteToken ?? '')}`, 303);
    }
  }

  // Whether someone else saved the shared draft after this person opened it.
  // The page sends the draft's updated_at as it was when rendered (blank when no
  // draft existed yet); anything else now means this page is out of date.
  const loadedVersion = form.has('loaded_version') ? get('loaded_version') : null;
  const stale = !!existing && viaInvite && loadedVersion !== null
    && loadedVersion !== String(existing.updated_at ?? '');

  const fields = readVendorFields(form);
  const {
    vendor_type, company_name, address, city, province, postal_code, contact_person, phone, email,
    shipping_same_as_billing, shipping_address, shipping_city, shipping_province, shipping_postal_code,
    sales_contact_name, sales_contact_email, sales_contact_phone,
    qa_contact_name, qa_contact_email, qa_contact_phone,
    accounting_contact_email, accounting_contact_phone,
    business_number, gst_hst_number,
    bank_institution_number, bank_transit_number, bank_account_number, bank_address,
    certified, certified_by_name, certified_by_title,
    file_cra_license_expiry, file_health_canada_license_expiry,
  } = fields;

  // Out of date: a colleague saved after this page was opened. Their answers are
  // not on this page, so an empty field here means "I did not fill this in",
  // not "clear it". Keep what they saved wherever this save has nothing.
  // Yes/no answers are not empty and are taken as posted.
  if (stale && existing) {
    const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    for (const [k, v] of Object.entries(fields)) {
      if (isEmpty(v) && !isEmpty(existing[k])) (fields as Record<string, unknown>)[k] = existing[k];
    }
  }

  // If a license's expiry date actually changed (vendor renewed and told us
  // the new date), reset that license's reminder flag so a new cycle can
  // fire for it. New rows start with the flag unset (column default null).
  if (existing) Object.assign(fields, reminderResets(fields, existing));

  // ---------------- DRAFT SAVE ----------------
  // Minimal validation: just enough to identify who to send the resume link to.
  if (action === 'draft') {
    if (!company_name || !email) {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'missing_draft'), 303);
    }

    if (existing) {
      await admin.from('vendor_submissions').update(fields).eq('id', existing.id);
      // Files are optional to re-upload on a draft save; only replace what was provided.
      await uploadAnyProvidedFiles(admin, existing.id, form);
      if (viaInvite && inviteToken) return redirect(sharedLink(inviteToken, stale ? 'draft_merged' : 'draft_saved'), 303);
      return redirect(`/fournisseurs/brouillon/${resumeToken}?info=draft_saved`, 303);
    }

    const { raw, hash } = mintToken();
    const { data: inserted, error: insErr } = await admin
      .from('vendor_submissions')
      .insert({ ...fields, status: 'draft', resume_token_hash: hash })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('[vendor-submit] draft insert failed:', insErr);
      return redirect('/fournisseurs?error=unknown', 303);
    }
    await uploadAnyProvidedFiles(admin, inserted.id, form);
    await linkInviteIfAny(admin, inviteToken, inserted.id, fields);

    // Everyone on the invite already has the link that reopens this draft, so no
    // separate private resume link is sent — two links would only confuse.
    if (invite && inviteToken) return redirect(sharedLink(inviteToken, 'draft_saved'), 303);

    const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
    const resumeUrl = `${siteUrl}/fournisseurs/brouillon/${raw}`;
    await sendVendorDraftLink({ toEmail: email, companyName: company_name || email, resumeUrl });

    return redirect(`${resumeUrl.replace(siteUrl, '')}?info=draft_saved`, 303);
  }

  // ---------------- FULL SUBMIT ----------------
  if (
    !vendor_type ||
    !company_name || !address || !city || !province || !postal_code || !contact_person || !phone || !email ||
    !sales_contact_name || !sales_contact_email ||
    !qa_contact_name || !qa_contact_email ||
    !accounting_contact_email ||
    !business_number || !gst_hst_number ||
    !bank_institution_number || !bank_transit_number || !bank_account_number || !bank_address ||
    !certified_by_name || !certified_by_title ||
    !file_cra_license_expiry || !file_health_canada_license_expiry
  ) {
    return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'missing'), 303);
  }
  if (!certified) {
    return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'certify'), 303);
  }
  const anyContactPhone = !!(sales_contact_phone || qa_contact_phone || accounting_contact_phone);
  if (!anyContactPhone) {
    return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'phone_required'), 303);
  }
  if (!shipping_same_as_billing && (!shipping_address || !shipping_city || !shipping_province || !shipping_postal_code)) {
    return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'shipping_missing'), 303);
  }

  const fileBankProof = form.get('file_bank_proof') as File | null;
  const fileCra = form.get('file_cra_license') as File | null;
  const fileHc = form.get('file_health_canada_license') as File | null;

  const hasExistingFile = (col: string) => !!(existing && existing[col]);

  if (!hasExistingFile('file_bank_void_cheque_path') || (fileBankProof && fileBankProof.size > 0)) {
    const err = validateUploadedFile(fileBankProof);
    if (err === 'missing' && !hasExistingFile('file_bank_void_cheque_path')) {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'file_bank'), 303);
    }
    if (err && err !== 'missing') {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, err === 'too_large' ? 'file_size' : 'file_type'), 303);
    }
  }
  if (!hasExistingFile('file_cra_license_path') || (fileCra && fileCra.size > 0)) {
    const err = validateUploadedFile(fileCra);
    if (err === 'missing' && !hasExistingFile('file_cra_license_path')) {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'file_cra'), 303);
    }
    if (err && err !== 'missing') {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, err === 'too_large' ? 'file_size' : 'file_type'), 303);
    }
  }
  if (!hasExistingFile('file_health_canada_license_path') || (fileHc && fileHc.size > 0)) {
    const err = validateUploadedFile(fileHc);
    if (err === 'missing' && !hasExistingFile('file_health_canada_license_path')) {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'file_hc'), 303);
    }
    if (err && err !== 'missing') {
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, err === 'too_large' ? 'file_size' : 'file_type'), 303);
    }
  }

  let submissionId: string;
  if (existing) {
    submissionId = existing.id;
    const { error: updErr } = await admin
      .from('vendor_submissions')
      .update({ ...fields, status: 'submitted', submitted_at: new Date().toISOString(), resume_token_hash: null })
      .eq('id', submissionId);
    if (updErr) {
      console.error('[vendor-submit] finalize update failed:', updErr);
      return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'unknown'), 303);
    }
    // A draft saved before the email was typed (Aspire Infusions, 2026-10-15)
    // was never matched to its invitation: match it now that it is complete.
    await linkInviteIfAny(admin, inviteToken, submissionId, fields);
  } else {
    // A second click on Submit while the first request is still uploading files
    // arrives as a brand-new submission, which is how PBG BioPharma ended up with
    // two identical rows four seconds apart (2026-10-02). If the same vendor email
    // already submitted the same company in the last ten minutes, that earlier
    // submission is the one: acknowledge it rather than create a twin.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: twin } = await admin
      .from('vendor_submissions')
      .select('id')
      .eq('status', 'submitted')
      .ilike('email', likeLiteral(email))
      .ilike('company_name', likeLiteral(company_name))
      .gte('submitted_at', tenMinutesAgo)
      .limit(1)
      .maybeSingle();
    if (twin) {
      await linkInviteIfAny(admin, inviteToken, twin.id, fields);
      return redirect('/fournisseurs/merci', 303);
    }

    const { data: inserted, error: insErr } = await admin
      .from('vendor_submissions')
      .insert({ ...fields, status: 'submitted', submitted_at: new Date().toISOString() })
      .select('id')
      .single();
    if (insErr || !inserted) {
      console.error('[vendor-submit] insert failed:', insErr);
      return redirect('/fournisseurs?error=unknown', 303);
    }
    submissionId = inserted.id as string;
    await linkInviteIfAny(admin, inviteToken, submissionId, fields);
  }

  try {
    await uploadAnyProvidedFiles(admin, submissionId, form);
  } catch (e) {
    console.error('[vendor-submit] file upload failed:', e);
    return redirect(backTo(existingSubmissionId, resumeToken, inviteToken, 'unknown'), 303);
  }

  // A file sent back for changes and submitted again: every approver reviews
  // it anew (their earlier decisions stay in the history).
  if (existing?.status === 'submitted') {
    await admin.from('vendor_submission_events').insert({ vendor_submission_id: submissionId, decision: 'resubmitted' });
  }

  await sendForApproval(admin, submissionId, company_name);

  return redirect('/fournisseurs/merci', 303);
};

// ilike is used for its case-insensitivity only; its wildcards must not apply,
// and underscores are common in email addresses.
function likeLiteral(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Free mailboxes say nothing about which company someone works for, so they
// never count as a domain match.
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.ca',
  'icloud.com', 'me.com', 'msn.com', 'aol.com', 'videotron.ca', 'bell.net', 'sympatico.ca',
]);

// Best-effort: links this submission back to the invite that brought the vendor
// here, so staff can see on the dashboard that the invite was acted on instead
// of it sitting as "not started" forever.
//
// The token is the reliable route, but invites get forwarded: PBG's went to
// their QA lead and was filled in by their sales lead from a link without the
// token, so it stayed "not started" despite two submissions. Without a token,
// an open invite is matched by exact email against any address on the
// submission, then by company domain.
async function linkInviteIfAny(
  admin: ReturnType<typeof getAdminClient>,
  inviteToken: string | null,
  submissionId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  if (inviteToken) {
    const invite = await findInviteByToken(admin, inviteToken);
    if (!invite) return;
    await admin
      .from('vendor_invites')
      .update({ vendor_submission_id: submissionId })
      .eq('id', invite.id)
      .is('vendor_submission_id', null);
    return;
  }

  // Already tied to an invitation: never claim a second one.
  const { count: linked } = await admin
    .from('vendor_invites').select('id', { count: 'exact', head: true }).eq('vendor_submission_id', submissionId);
  if (linked) return;

  const addresses = ['email', 'sales_contact_email', 'qa_contact_email', 'accounting_contact_email']
    .map((k) => String(fields[k] ?? '').trim().toLowerCase())
    .filter((e) => e.includes('@'));
  if (addresses.length === 0) return;

  const { data: open } = await admin
    .from('vendor_invites')
    .select('id, email, recipients')
    .is('vendor_submission_id', null)
    .order('sent_at', { ascending: false });
  if (!open || open.length === 0) return;

  const domainOf = (e: string) => e.split('@')[1] ?? '';
  const domains = new Set(addresses.map(domainOf).filter((d) => d && !FREE_MAIL_DOMAINS.has(d)));

  const sentTo = (i: { email: string; recipients?: string[] | null }) =>
    inviteRecipients(i).map((e) => e.trim().toLowerCase());
  const match =
    open.find((i) => sentTo(i).some((e) => addresses.includes(e))) ??
    open.find((i) => sentTo(i).some((e) => domains.has(domainOf(e))));
  if (!match) return;

  await admin
    .from('vendor_invites')
    .update({ vendor_submission_id: submissionId })
    .eq('id', match.id)
    .is('vendor_submission_id', null);
}
