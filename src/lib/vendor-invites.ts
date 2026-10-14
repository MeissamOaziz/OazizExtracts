// Vendor qualification invites: several recipients, one shared link, one form.
//
// Shared by the staff routes that send and re-send invites, the public form that
// opens one, and the submit route that saves into it.

import type { getAdminClient } from './supabase';
import { sha256Hex } from './tokens';

type Admin = ReturnType<typeof getAdminClient>;

/** Enough for a vendor's sales, QA and accounting people plus a few more. */
export const MAX_INVITE_RECIPIENTS = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Split whatever was typed or pasted into addresses. Commas, semicolons (how
 * Outlook copies a list), spaces and new lines all separate. Duplicates are
 * dropped case-insensitively, keeping the first spelling.
 */
export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const emails: string[] = [];
  const invalid: string[] = [];
  // Commas, semicolons and new lines separate entries first, so a display name
  // with a space in it ("Ramandeep Singh <r@pbg.com>", as Outlook copies it)
  // stays in one piece. Within an entry, an <address> wins; otherwise spaces
  // separate too, for a plain "a@x.com b@x.com" list.
  const parts = raw.split(/[,;\n\r]+/).flatMap((entry) => {
    const bracketed = entry.match(/<([^>]+)>/);
    return bracketed ? [bracketed[1]] : entry.split(/\s+/);
  });
  for (const part of parts) {
    const addr = part.trim().replace(/^mailto:/i, '');
    if (!addr) continue;
    if (!EMAIL_RE.test(addr)) { invalid.push(addr); continue; }
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(addr);
  }
  return { emails, invalid };
}

export interface InviteRow {
  id: string;
  email: string;
  recipients: string[];
  vendor_submission_id: string | null;
}

/**
 * The invite a link belongs to. A link stays valid after a reminder mints a new
 * one, so the earlier hashes are checked too.
 */
export async function findInviteByToken(admin: Admin, rawToken: string | null | undefined): Promise<InviteRow | null> {
  if (!rawToken) return null;
  const hash = sha256Hex(rawToken);
  const { data } = await admin
    .from('vendor_invites')
    .select('id, email, recipients, vendor_submission_id')
    .or(`invite_token_hash.eq.${hash},extra_token_hashes.cs.{${hash}}`)
    .limit(1)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

/** Everyone an invite goes to, falling back to the single address on old rows. */
export function inviteRecipients(invite: { email: string; recipients?: string[] | null }): string[] {
  return invite.recipients && invite.recipients.length > 0 ? invite.recipients : [invite.email];
}
