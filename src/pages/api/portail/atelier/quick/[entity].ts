import type { APIRoute } from 'astro';
import { createServerClient } from '../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../lib/ops';
import { quickSpec, comboRow } from '../../../../../lib/ops-quick';
import { getPortailLocale } from '../../../../../lib/portail-i18n';

export const prerender = false;

// Create a reference record from inside whatever form needed it, and hand the new
// row straight back as JSON so the combobox can select it without a page reload.
//
// The entity, its fields and their types all come from QUICK_SPECS — nothing is
// listed twice. Anything not in the spec is dropped rather than written, so a
// crafted payload cannot reach a column the drawer never offered.
//
// Insert is permitted to any Atelier role by policy (0019, widened in 0030);
// editing and deleting still are not.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

function toNum(v: unknown): number | null {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const spec = quickSpec(String(params.entity ?? ''));
  if (!spec) return json({ error: 'unknown_entity' }, 404);

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  if (!staff.ops_role) return json({ error: 'no_role' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const row: Record<string, unknown> = {};

  for (const f of spec.fields) {
    const raw = body[f.key];

    if (f.type === 'checkbox') {
      // An absent checkbox keeps the spec's default rather than reading as false.
      row[f.key] = raw === undefined ? (f.default ?? false) : raw === true;
      continue;
    }
    if (f.type === 'number') {
      const n = toNum(raw);
      if (n === null && f.required) return json({ error: 'field_required', field: f.key }, 422);
      if (n !== null) row[f.key] = n;
      continue;
    }

    const s = clean(raw);
    if (s === null) {
      if (f.required) return json({ error: 'field_required', field: f.key }, 422);
      continue;
    }
    // A closed list is closed: an unknown option is a rejected payload, not a write.
    if (f.options && !f.options.some((o) => o.v === s)) {
      return json({ error: 'field_invalid', field: f.key }, 422);
    }
    row[f.key] = s;
  }

  // Products are born unreleased for sale planning; the settings screen promotes them.
  if (spec.kind === 'product') row.status = 'new';

  const { data, error } = await supabase
    .from(spec.table)
    .insert(row)
    .select(spec.select)
    .single();

  if (error) {
    console.error(`[atelier] quick ${spec.kind} insert failed:`, error);
    if (error.code === '23505') return json({ error: 'duplicate' }, 409);
    if (error.code === '42501') return json({ error: 'no_role' }, 403);
    return json({ error: 'insert_failed' }, 500);
  }

  return json({ ok: true, row: comboRow(spec.kind, data, getPortailLocale(cookies)) }, 201);
};
