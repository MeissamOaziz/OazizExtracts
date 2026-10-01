import { getAdminClient } from './supabase';

const BUCKET = 'hr-documents';

export async function uploadHrBytes(path: string, bytes: Uint8Array, contentType = 'application/pdf'): Promise<string> {
  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`HR file upload failed: ${error.message}`);
  return path;
}

export async function downloadHrBytes(path: string): Promise<Buffer> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`HR file download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function hrSignedUrl(path: string, ttlSeconds = 60): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`signed URL failed: ${error?.message}`);
  return data.signedUrl;
}
