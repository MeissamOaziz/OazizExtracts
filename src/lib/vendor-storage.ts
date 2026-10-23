import { getAdminClient } from './supabase';

const BUCKET = 'vendor-uploads';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

export function validateUploadedFile(file: File | null): string | null {
  if (!file || file.size === 0) return 'missing';
  if (!ALLOWED_TYPES.has(file.type)) return 'invalid_type';
  if (file.size > MAX_BYTES) return 'too_large';
  return null;
}

export type VendorFileKind = 'cra-license' | 'health-canada-license' | 'bank-proof';
const KINDS: readonly VendorFileKind[] = ['cra-license', 'health-canada-license', 'bank-proof'];

function extensionFor(file: Pick<File, 'type'>): string {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

// The browser uploads each file straight to storage before the form is posted:
// Vercel refuses request bodies over 4.5 MB, which a few scanned licences sent
// with the form easily exceed (Chroniqc, 2026-10-23: 413
// FUNCTION_PAYLOAD_TOO_LARGE). The file lands under staging/ and the form only
// carries that path; the bucket enforces the same 10 MB / PDF-or-image rule.
const STAGED_RE = /^staging\/[0-9a-f-]{36}\/(cra-license|health-canada-license|bank-proof)\.(pdf|png|jpg|webp)$/;

/** A one-time URL the vendor's browser uploads one file to, or why the file is refused. */
export async function createStagedUpload(kind: string, type: string, size: number):
  Promise<{ path: string; signedUrl: string } | 'invalid_kind' | 'invalid_type' | 'too_large'> {
  if (!(KINDS as readonly string[]).includes(kind)) return 'invalid_kind';
  if (!ALLOWED_TYPES.has(type)) return 'invalid_type';
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return 'too_large';
  const path = `staging/${crypto.randomUUID()}/${kind}.${extensionFor({ type })}`;
  const { data, error } = await getAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw new Error(`signed upload URL failed: ${error?.message}`);
  return { path, signedUrl: data.signedUrl };
}

/** The staged path posted for a file of this kind, when it is one we issued. */
export function stagedPathFor(value: unknown, kind: VendorFileKind): string | null {
  const m = typeof value === 'string' ? STAGED_RE.exec(value) : null;
  return m && m[1] === kind ? value as string : null;
}

/** Moves a staged upload to the submission's folder (replacing an earlier file); returns its path. */
export async function moveStagedVendorFile(submissionId: string, kind: VendorFileKind, stagedPath: string): Promise<string> {
  const storage = getAdminClient().storage.from(BUCKET);
  const path = `${submissionId}/${kind}.${stagedPath.split('.').pop()}`;
  await storage.remove([path]);
  const { error } = await storage.move(stagedPath, path);
  if (error) throw new Error(`vendor file move failed: ${error.message}`);
  return path;
}

// Uploads one vendor-submitted file to the private vendor-uploads bucket and
// returns its storage path. Server-only (admin/service-role client) — the
// public submission page never talks to Supabase directly.
export async function uploadVendorFile(
  submissionId: string,
  kind: VendorFileKind,
  file: File,
): Promise<string> {
  const admin = getAdminClient();
  const path = `${submissionId}/${kind}.${extensionFor(file)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`vendor file upload failed: ${error.message}`);
  return path;
}

export async function vendorFileSignedUrl(path: string, ttlSeconds = 60): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`signed URL failed: ${error?.message}`);
  return data.signedUrl;
}
