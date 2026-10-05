// QuickBooks Online (Intuit Accounting API) client for the payables module.
//
// OAuth 2.0 authorization-code flow, one connected company (qbo_connection).
// Access tokens last 60 min and are refreshed on demand; Intuit rotates the
// refresh token (daily, max 5 years) so every refresh persists the new one.
// Tokens are stored AES-256-GCM encrypted. All requests pin minorversion 75.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';
const MINOR = '75';

export type QboEnv = 'sandbox' | 'production';

export function qboConfig() {
  const clientId = import.meta.env.QBO_CLIENT_ID as string | undefined;
  const clientSecret = import.meta.env.QBO_CLIENT_SECRET as string | undefined;
  const environment: QboEnv = import.meta.env.QBO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const base = (import.meta.env.PORTAL_SITE_URL ?? 'https://oaziz.ca').replace(/\/$/, '');
  return {
    clientId, clientSecret, environment,
    configured: !!clientId && !!clientSecret,
    redirectUri: `${base}/api/portail/paiements/qbo/callback`,
    apiBase: environment === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com',
  };
}

// ------------------------------------------------------------- token crypto
function key(): Buffer {
  const secret = import.meta.env.QBO_TOKEN_KEY ?? import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('QBO_TOKEN_KEY not configured');
  return createHash('sha256').update(`qbo-token:${secret}`).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ------------------------------------------------------------- OAuth
export function authorizeUrl(state: string): string {
  const cfg = qboConfig();
  const p = new URLSearchParams({
    client_id: cfg.clientId ?? '', response_type: 'code', scope: SCOPE, redirect_uri: cfg.redirectUri, state,
  });
  return `${AUTH_URL}?${p}`;
}

interface TokenResponse {
  access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in?: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const cfg = qboConfig();
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
    },
    body: new URLSearchParams(body),
  });
  if (!r.ok) throw new Error(`Intuit token error ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function saveTokens(admin: SupabaseClient, t: TokenResponse, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  const row = {
    id: 1,
    access_token_enc: encrypt(t.access_token),
    refresh_token_enc: encrypt(t.refresh_token),
    access_expires_at: new Date(now + (t.expires_in - 120) * 1000).toISOString(),
    refresh_expires_at: t.x_refresh_token_expires_in ? new Date(now + t.x_refresh_token_expires_in * 1000).toISOString() : null,
    ...extra,
  };
  // First connection inserts the full row; a token refresh only updates the
  // token columns (an upsert would fail the NOT NULL check on realm/environment).
  const { error } = extra.realm_id
    ? await admin.from('qbo_connection').upsert(row)
    : await admin.from('qbo_connection').update(row).eq('id', 1);
  if (error) throw error;
}

export async function completeConnection(admin: SupabaseClient, code: string, realmId: string, staffId: string) {
  const cfg = qboConfig();
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
  await saveTokens(admin, t, {
    environment: cfg.environment, realm_id: realmId, connected_by: staffId, connected_at: new Date().toISOString(),
    last_pull_cursor: new Date().toISOString(),
  });
  const qbo = await getQbo(admin);
  if (qbo) {
    try {
      const info = await qbo.get(`/companyinfo/${realmId}`);
      await admin.from('qbo_connection').update({ company_name: info?.CompanyInfo?.CompanyName ?? null }).eq('id', 1);
    } catch { /* name is cosmetic */ }
  }
}

export async function disconnect(admin: SupabaseClient) {
  const { data } = await admin.from('qbo_connection').select('refresh_token_enc').eq('id', 1).maybeSingle();
  const cfg = qboConfig();
  if (data && cfg.configured) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/json', Accept: 'application/json',
        },
        body: JSON.stringify({ token: decrypt(data.refresh_token_enc) }),
      });
    } catch (e) { console.error('[qbo] revoke failed:', e); }
  }
  await admin.from('qbo_connection').delete().eq('id', 1);
}

export interface QboConnectionInfo {
  environment: QboEnv; realm_id: string; company_name: string | null; connected_at: string;
  refresh_expires_at: string | null; last_sync_at: string | null; last_sync_status: string | null; last_pull_cursor: string | null;
}

export async function connectionInfo(admin: SupabaseClient): Promise<QboConnectionInfo | null> {
  const { data } = await admin.from('qbo_connection')
    .select('environment, realm_id, company_name, connected_at, refresh_expires_at, last_sync_at, last_sync_status, last_pull_cursor')
    .eq('id', 1).maybeSingle();
  return (data as QboConnectionInfo) ?? null;
}

// ------------------------------------------------------------- API client
export class QboError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export interface Qbo {
  realmId: string;
  get(path: string): Promise<any>;
  post(path: string, body: unknown): Promise<any>;
  query<T = any>(entity: string, where?: string): Promise<T[]>;
  upload(fileName: string, contentType: string, data: Buffer, entityType: string, entityId: string): Promise<any>;
}

/** Ready-to-use client (refreshing the access token if needed), or null when not connected. */
export async function getQbo(admin: SupabaseClient): Promise<Qbo | null> {
  const cfg = qboConfig();
  if (!cfg.configured) return null;
  const { data: conn } = await admin.from('qbo_connection').select('*').eq('id', 1).maybeSingle();
  if (!conn) return null;

  let accessToken: string;
  if (new Date(conn.access_expires_at).getTime() > Date.now()) {
    accessToken = decrypt(conn.access_token_enc);
  } else {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(conn.refresh_token_enc) });
    await saveTokens(admin, t);
    accessToken = t.access_token;
  }
  const realm = conn.realm_id as string;
  const root = `${cfg.apiBase}/v3/company/${realm}`;
  const withMinor = (p: string) => `${root}${p}${p.includes('?') ? '&' : '?'}minorversion=${MINOR}`;

  async function call(url: string, init: RequestInit = {}) {
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(init.headers ?? {}) },
    });
    const text = await r.text();
    const body = text ? JSON.parse(text) : null;
    if (!r.ok || body?.Fault) {
      const err = body?.Fault?.Error?.[0];
      throw new QboError(err ? `${err.Message}${err.Detail ? ` — ${err.Detail}` : ''}` : `QuickBooks ${r.status}`, r.status, err?.code);
    }
    return body;
  }

  return {
    realmId: realm,
    get: (path) => call(withMinor(path)),
    post: (path, body) => call(withMinor(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    async query(entity, where) {
      const out: any[] = [];
      for (let start = 1; ; start += 1000) {
        const q = `select * from ${entity}${where ? ` where ${where}` : ''} startposition ${start} maxresults 1000`;
        const res = await call(withMinor(`/query?query=${encodeURIComponent(q)}`));
        const rows = res?.QueryResponse?.[entity] ?? [];
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out;
    },
    async upload(fileName, contentType, data, entityType, entityId) {
      const boundary = `oaziz${randomBytes(8).toString('hex')}`;
      const meta = JSON.stringify({
        AttachableRef: [{ EntityRef: { type: entityType, value: entityId } }], FileName: fileName, ContentType: contentType,
      });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_metadata_01"\r\nContent-Type: application/json\r\n\r\n${meta}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_content_01"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return call(withMinor('/upload'), { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body });
    },
  };
}

/** QB query string literal. */
export const qstr = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
