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

function extensionFor(file: File): string {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

// Uploads one vendor-submitted file to the private vendor-uploads bucket and
// returns its storage path. Server-only (admin/service-role client) — the
// public submission page never talks to Supabase directly.
export async function uploadVendorFile(
  submissionId: string,
  kind: 'cra-license' | 'health-canada-license' | 'bank-proof',
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
