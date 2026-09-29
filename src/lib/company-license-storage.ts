import { getAdminClient } from './supabase';

const BUCKET = 'company-licenses';

export function pathFor(kind: 'cra' | 'health_canada'): string {
  return `${kind}.pdf`;
}

export async function uploadCompanyLicenseFile(kind: 'cra' | 'health_canada', file: File): Promise<string> {
  const admin = getAdminClient();
  const path = pathFor(kind);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`company license upload failed: ${error.message}`);
  return path;
}

export async function companyLicenseSignedUrl(path: string, ttlSeconds = 60): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`signed URL failed: ${error?.message}`);
  return data.signedUrl;
}

export async function downloadCompanyLicenseBytes(path: string): Promise<Buffer> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`license download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
