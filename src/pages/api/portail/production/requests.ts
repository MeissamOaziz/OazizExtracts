import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../lib/supabase';
import { sendProductionRequestNotice } from '../../../../lib/email';
import { fmtDate, isIsoDate, parseQty } from '../../../../lib/production';
import {
  REQUEST_UNITS, createRequest, isRequestKind, loadRequest, logRequest, plannerRecipients, storeFiles,
  updateRequest, type RequestInput,
} from '../../../../lib/production-requests';
import { frProduction, type ProductionDict } from '../../../../i18n/portail/production';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const orNull = (v: string) => (v === '' ? null : v);

// Production requests: create, edit, add/remove files, cancel, reopen.
// Anyone with request access may send one; only its requester or a planner
// may change it afterwards.
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const planner = !!locals.access?.perms?.has('prod_schedule');
  const admin = getAdminClient();

  const form = await request.formData();
  const action = str(form, '_action');
  const id = str(form, 'id');
  const page = (rid: string, q: string) => redirect(`/portail/production/demandes/${rid}?${q}`, 303);

  // ------------------------------------------------------------------ create
  if (action === 'create' || action === 'edit') {
    const back = (code: string) => action === 'create'
      ? redirect(`/portail/production/demandes/nouvelle?error=${code}`, 303)
      : page(id, `error=${code}#modifier`);
    const kind = str(form, 'kind');
    const title = str(form, 'title');
    if (!isRequestKind(kind) || !title) return back('missing');
    const customer = str(form, 'customer_name');
    if (kind === 'customer_po' && !customer) return back('customer');
    const typeId = str(form, 'production_type_id');
    const needed = str(form, 'needed_by');

    const descs = form.getAll('ln_desc').map(String);
    const qtys = form.getAll('ln_qty').map(String);
    const units = form.getAll('ln_unit').map(String);
    const lines: RequestInput['lines'] = [];
    for (let i = 0; i < descs.length; i++) {
      const description = descs[i].trim();
      if (!description) continue;
      const q = parseQty(qtys[i] ?? '');
      if (Number.isNaN(q) || q === 0) return back('qty');
      lines.push({ description, quantity: q, unit: (REQUEST_UNITS as readonly string[]).includes(units[i]) ? units[i] : 'unit' });
    }

    const input: RequestInput = {
      kind, title,
      customer_name: orNull(customer),
      customer_po: orNull(str(form, 'customer_po')),
      needed_by: isIsoDate(needed) ? needed : null,
      priority: form.get('rush') ? 'rush' : 'normal',
      production_type_id: UUID.test(typeId) ? typeId : null,
      notes: orNull(str(form, 'notes')),
      lines,
    };

    if (action === 'edit') {
      if (!UUID.test(id)) return redirect('/portail/production/demandes', 303);
      const cur = await loadRequest(admin, id);
      if (!cur) return redirect('/portail/production/demandes', 303);
      if (!planner && cur.requested_by !== staff.id) return page(id, 'error=forbidden');
      try {
        const changed = await updateRequest(admin, staff.id, id, input);
        return page(id, `ok=${changed ? 'saved' : 'nochange'}`);
      } catch (e) {
        console.error('[production] request update failed:', e);
        return back('unknown');
      }
    }

    let created: { id: string; request_no: string };
    try {
      created = await createRequest(admin, staff.id, input);
    } catch (e) {
      console.error('[production] request create failed:', e);
      return back('unknown');
    }
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    const { stored, refused } = await storeFiles(admin, created.id, staff.id, files);

    // Tell the planners. A failed email never fails the request.
    try {
      const siteUrl = (import.meta.env.PORTAL_SITE_URL ?? 'https://www.oaziz.ca').replace(/\/$/, '');
      const recipients = (await plannerRecipients(admin)).filter((r) => r.id !== staff.id);
      for (const r of recipients) {
        await sendProductionRequestNotice({
          toEmail: r.email, toName: r.full_name, requestNo: created.request_no,
          kindLabel: frProduction[`rq.kind.${kind}` as keyof ProductionDict],
          title, requestedBy: staff.full_name, customer: input.customer_name,
          neededBy: input.needed_by ? fmtDate(input.needed_by, 'fr') : null,
          rush: input.priority === 'rush', fileCount: stored,
          requestUrl: `${siteUrl}/portail/production/demandes/${created.id}`,
        });
      }
    } catch (e) {
      console.error('[production] request notice failed:', e);
    }

    const q = new URLSearchParams({ ok: 'created' });
    if (refused.length) q.set('refused', refused.join(', '));
    return page(created.id, q.toString());
  }

  // --------------------------------------------------- actions on a request
  if (!UUID.test(id)) return redirect('/portail/production/demandes', 303);
  const cur = await loadRequest(admin, id);
  if (!cur) return redirect('/portail/production/demandes', 303);
  const mayChange = planner || cur.requested_by === staff.id;

  if (action === 'add_files') {
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
    const { stored, refused } = await storeFiles(admin, id, staff.id, files);
    const q = new URLSearchParams({ ok: 'files', n: String(stored) });
    if (refused.length) q.set('refused', refused.join(', '));
    return page(id, q.toString());
  }

  if (!mayChange) return page(id, 'error=forbidden');

  if (action === 'remove_file') {
    const fileId = str(form, 'file_id');
    const file = cur.files.find((f) => f.id === fileId && !f.removed_at);
    if (!file) return page(id, '');
    const { error } = await admin.from('ps_request_files')
      .update({ removed_at: new Date().toISOString(), removed_by: staff.id }).eq('id', fileId);
    if (error) { console.error('[production] file remove failed:', error); return page(id, 'error=unknown'); }
    await logRequest(admin, id, staff.id, 'file_removed', null, { filename: file.filename });
    return page(id, 'ok=fileRemoved');
  }

  if (action === 'cancel') {
    const reason = str(form, 'reason');
    if (!reason) return page(id, 'error=reason');
    const { error } = await admin.from('ps_requests').update({
      cancelled_at: new Date().toISOString(), cancelled_by: staff.id, cancel_reason: reason,
      updated_by: staff.id, updated_at: new Date().toISOString(),
    }).eq('id', id).is('cancelled_at', null);
    if (error) { console.error('[production] request cancel failed:', error); return page(id, 'error=unknown'); }
    await logRequest(admin, id, staff.id, 'cancelled', reason, {});
    return page(id, 'ok=cancelled');
  }

  if (action === 'reopen') {
    const { error } = await admin.from('ps_requests').update({
      cancelled_at: null, cancelled_by: null, cancel_reason: null, updated_by: staff.id, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { console.error('[production] request reopen failed:', error); return page(id, 'error=unknown'); }
    await logRequest(admin, id, staff.id, 'reopened', null, { previous_reason: cur.cancel_reason });
    return page(id, 'ok=reopened');
  }

  return page(id, '');
};
