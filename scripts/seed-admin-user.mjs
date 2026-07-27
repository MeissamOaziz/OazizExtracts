#!/usr/bin/env node
// One-shot: create (or update) a Supabase auth user for local portal testing.
// Reads .env for SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Reads ADMIN_EMAIL + ADMIN_PASSWORD from environment for the account to create.
//
// Usage (PowerShell):
//   $env:ADMIN_EMAIL="meissam@oaziz.ca"; $env:ADMIN_PASSWORD="something-strong"; node scripts/seed-admin-user.mjs
// Usage (bash):
//   ADMIN_EMAIL=meissam@oaziz.ca ADMIN_PASSWORD=something-strong node scripts/seed-admin-user.mjs
//
// The email MUST already exist in the `staff` table (the login page rejects
// unknown emails). It's created with email_confirm:true so no invite email
// is sent — the account is usable immediately.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

function loadDotenv(path) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch { console.error(`Could not read ${path}`); process.exit(1); }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadDotenv(envPath);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables before running.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: staffRow, error: staffErr } = await supabase
  .from('staff')
  .select('id, full_name')
  .eq('email', ADMIN_EMAIL.toLowerCase())
  .maybeSingle();

if (staffErr) { console.error(staffErr); process.exit(1); }
if (!staffRow) {
  console.error(`No staff row for ${ADMIN_EMAIL}. Add them to the roster first.`);
  process.exit(1);
}

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email: ADMIN_EMAIL.toLowerCase(),
  password: ADMIN_PASSWORD,
  email_confirm: true,
});

if (createErr && /already been registered/i.test(createErr.message ?? '')) {
  // Fetch the existing user and update the password.
  let existingId = null;
  let page = 1;
  while (!existingId) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) { console.error(listErr); process.exit(1); }
    const match = list.users.find((u) => (u.email ?? '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (match) existingId = match.id;
    else if (list.users.length < 200) break;
    else page += 1;
  }
  if (!existingId) { console.error('User marked as existing but not found in list.'); process.exit(1); }
  const { error: updErr } = await supabase.auth.admin.updateUserById(existingId, {
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (updErr) { console.error(updErr); process.exit(1); }
  console.log(`Password reset for existing user ${ADMIN_EMAIL} (${staffRow.full_name}).`);
} else if (createErr) {
  console.error(createErr);
  process.exit(1);
} else {
  console.log(`Created auth user for ${ADMIN_EMAIL} (${staffRow.full_name}). id=${created.user.id}`);
}

console.log('You can now log in at http://localhost:4321/portail/connexion');
