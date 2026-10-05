// Recording the approver's decision — shared by the emailed token link and the
// logged-in approvals page, so both paths behave identically. One-shot: once a
// run is approved, only Meissam/Nathalie can change amounts (and it's logged).

import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid, logEvent, getSetting, money, n, round2, runUrl, weekLabel, type loadRun } from './payables';
import { sendPaymentsApprovedNotice } from './email';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadRun>>>;

export async function submitApproval(
  admin: SupabaseClient,
  loaded: Loaded,
  body: { lines?: unknown; comment?: unknown } | null,
  actor: { label: string; staffId: string | null; via: 'link' | 'portal'; ip: string | null },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { run, lines } = loaded;
  if (run.status !== 'submitted') return { ok: false, status: 409, error: 'Déjà approuvé ou retiré.' };
  if (!body || !Array.isArray(body.lines)) return { ok: false, status: 400, error: 'Requête invalide.' };
  const byS = new Map(lines.map((l) => [l.supplier_id, l]));

  const updates: Array<{ supplier_id: string; approved: number; note: string | null }> = [];
  for (const raw of body.lines as Array<Record<string, unknown>>) {
    if (!isUuid(raw.supplier_id)) continue;
    const approved = round2(Number(raw.approved));
    if (!Number.isFinite(approved) || approved < 0) return { ok: false, status: 400, error: 'Montant invalide.' };
    updates.push({ supplier_id: raw.supplier_id, approved, note: String(raw.note ?? '').trim().slice(0, 500) || null });
  }
  // Every suggested line gets an explicit decision, even if the browser omitted it.
  for (const l of lines) {
    if (n(l.suggested_amount) > 0 && !updates.some((u) => u.supplier_id === l.supplier_id)) {
      updates.push({ supplier_id: l.supplier_id, approved: 0, note: null });
    }
  }

  const comment = String(body.comment ?? '').trim().slice(0, 2000) || null;
  // Claim the run atomically so a double submit (or link + portal at once) can't approve twice.
  const { data: claimed } = await admin.from('ap_runs').update({
    status: 'approved', approved_at: new Date().toISOString(), approved_via: actor.via,
    approver_comment: comment,
  }).eq('id', run.id).eq('status', 'submitted').select('id');
  if (!claimed || claimed.length === 0) return { ok: false, status: 409, error: 'Déjà approuvé.' };

  for (const u of updates) {
    const existing = byS.get(u.supplier_id);
    if (existing) {
      await admin.from('ap_run_lines').update({ approved_amount: u.approved, approver_note: u.note }).eq('id', existing.id);
    } else if (u.approved > 0 || u.note) {
      const { data: sup } = await admin.from('ap_suppliers').select('id').eq('id', u.supplier_id).maybeSingle();
      if (sup) await admin.from('ap_run_lines').insert({ run_id: run.id, supplier_id: u.supplier_id, approved_amount: u.approved, approver_note: u.note });
    }
  }

  const totalApproved = updates.reduce((s, u) => s + u.approved, 0);
  const totalSuggested = lines.reduce((s, l) => s + n(l.suggested_amount), 0);
  await logEvent(admin, {
    run_id: run.id, actor_staff_id: actor.staffId, actor_label: actor.label, action: 'approved',
    details: { via: actor.via, total_approved: totalApproved, lines: updates.length, ip: actor.ip },
  });

  const notify = await getSetting<string[]>(admin, 'notify_emails', []);
  const { data: submitter } = run.submitted_by
    ? await admin.from('staff').select('email').eq('id', run.submitted_by).maybeSingle()
    : { data: null };
  const to = [...new Set([...notify, ...(submitter?.email ? [submitter.email] : [])].map((e) => e.toLowerCase()))];
  await sendPaymentsApprovedNotice({
    toEmails: to, approverName: actor.label, weekLabel: weekLabel(run.run_date),
    approvedCount: updates.filter((u) => u.approved > 0).length, totalApproved: money(totalApproved),
    totalSuggested: money(totalSuggested), comment, runUrl: runUrl(run.id),
  });
  return { ok: true };
}
