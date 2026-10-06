import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { json, isUuid, loadRun, logEvent, n, round2 } from '../../../../../../lib/payables';

export const prerender = false;

// Correct an approved week (Meissam/Nathalie only — full 'payables' access).
// Every changed amount is logged with who/when/old/new and the reason, so the
// approvals page shows a complete change history. Paid lines are never touched:
// undo the payment in the week first.
export const POST: APIRoute = async ({ request, cookies, params, locals }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return json({ error: 'unauthenticated' }, 401);
  if (!locals.access?.perms.has('payables')) return json({ error: 'Accès refusé' }, 403);
  if (!isUuid(params.id)) return json({ error: 'not found' }, 404);

  const admin = getAdminClient();
  const loaded = await loadRun(admin, params.id);
  if (!loaded) return json({ error: 'not found' }, 404);
  const { run, lines } = loaded;
  if (run.status !== 'approved' && run.status !== 'closed') return json({ error: 'La semaine n’est pas approuvée.' }, 409);

  const body = await request.json().catch(() => null) as { lines?: Array<Record<string, unknown>>; comment?: unknown } | null;
  const reason = String(body?.comment ?? '').trim().slice(0, 1000);
  if (!body || !Array.isArray(body.lines)) return json({ error: 'Requête invalide.' }, 400);
  if (!reason) return json({ error: 'Indiquez la raison de la modification.' }, 400);

  const bySupplier = new Map(lines.map((l) => [l.supplier_id, l]));
  let changed = 0;
  const skipped: string[] = [];
  for (const raw of body.lines) {
    if (!isUuid(raw.supplier_id)) continue;
    const approved = round2(Number(raw.approved));
    if (!Number.isFinite(approved) || approved < 0) return json({ error: 'Montant invalide.' }, 400);
    const note = String(raw.note ?? '').trim().slice(0, 500) || null;
    const existing = bySupplier.get(raw.supplier_id);

    if (existing) {
      const before = existing.approved_amount === null ? null : n(existing.approved_amount);
      const amountChanged = before === null ? approved !== 0 : Math.abs(before - approved) >= 0.005;
      const noteChanged = (existing.approver_note ?? null) !== note;
      if (!amountChanged && !noteChanged) continue;
      if (existing.payment_id && amountChanged) { skipped.push(raw.supplier_id); continue; }
      await admin.from('ap_run_lines').update({ approved_amount: approved, approver_note: note, updated_at: new Date().toISOString() }).eq('id', existing.id);
      if (amountChanged) {
        await logEvent(admin, {
          run_id: run.id, supplier_id: raw.supplier_id, actor_staff_id: staff.id, action: 'approved_amount_changed',
          details: { from: before, to: approved, reason },
        });
      }
      changed++;
    } else if (approved > 0) {
      const { data: sup } = await admin.from('ap_suppliers').select('id').eq('id', raw.supplier_id).maybeSingle();
      if (!sup) continue;
      await admin.from('ap_run_lines').insert({ run_id: run.id, supplier_id: raw.supplier_id, approved_amount: approved, approver_note: note });
      await logEvent(admin, {
        run_id: run.id, supplier_id: raw.supplier_id, actor_staff_id: staff.id, action: 'approval_line_added',
        details: { to: approved, reason },
      });
      changed++;
    }
  }
  if (changed) {
    await logEvent(admin, { run_id: run.id, actor_staff_id: staff.id, action: 'approval_edited', details: { lines: changed, reason } });
  }
  return json({ ok: true, changed, skipped: skipped.length });
};
