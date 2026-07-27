/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string;
  readonly CONTACT_TO_EMAIL: string;
  readonly CONTACT_FROM_EMAIL: string;
  readonly PUBLIC_SITE_URL?: string;

  // Portal (internal R&D)
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly PORTAL_SITE_URL?: string;
  readonly SIGNER_FROM_EMAIL?: string;
  readonly SIGNER_REPLY_TO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
