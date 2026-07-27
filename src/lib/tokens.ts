import { randomBytes, createHash } from 'node:crypto';

// 32 bytes → 64 hex chars. URL-safe, no ambiguity, no base64 padding issues.
export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = sha256Hex(raw);
  return { raw, hash };
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Signer link that goes in the invitation email.
export function signerUrl(rawToken: string): string {
  const base = import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca';
  return `${base.replace(/\/$/, '')}/portail/signature/${rawToken}`;
}
