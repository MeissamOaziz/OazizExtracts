import type { APIRoute } from 'astro';
import { createServerClient, getAdminClient } from '../../../../../../lib/supabase';
import { currentOpsStaff } from '../../../../../../lib/ops';

export const prerender = false;

// Remove one attachment from an order: the storage object first, then the row.
// Scoped by order_id as well as attachment id, so a stray id from another order
// cannot be deleted through this route.

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const orderId = String(params.id ?? '');
  const back = `/portail/atelier/commandes/${orderId}/editer`;

  const supabase = createServerClient(request, cookies);
  const staff = await currentOpsStaff(supabase);
  if (!staff) return redirect('/portail/connexion', 303);
  if (!staff.ops_role) return redirect(`${back}?error=no_role`, 303);

  const form = await request.formData();
  const attachmentId = String(form.get('attachment_id') ?? '').trim();
  if (!attachmentId) return redirect(`${back}?error=unknown`, 303);

  const { data: att } = await supabase
    .from('ops_order_attachments')
    .select('id, storage_path, filename')
    .eq('id', attachmentId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (!att) return redirect(`${back}?error=unknown`, 303);

  const admin = getAdminClient();
  const { error: rmErr } = await admin.storage.from('atelier').remove([att.storage_path]);
  if (rmErr) console.error('[atelier] storage remove failed:', rmErr);

  const { error } = await supabase
    .from('ops_order_attachments').delete().eq('id', att.id).eq('order_id', orderId);
  if (error) {
    console.error('[atelier] attachment row delete failed:', error);
    return redirect(`${back}?error=unknown`, 303);
  }

  await supabase.from('ops_events').insert({
    order_id: orderId, actor_staff_id: staff.id, actor_email: staff.email,
    action: 'attachment_removed', detail: { filename: att.filename },
  });

  return redirect(`${back}?ok=attachmentRemoved`, 303);
};
