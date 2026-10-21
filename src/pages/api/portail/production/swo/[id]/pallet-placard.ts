import type { APIRoute } from 'astro';
import { createServerClient, currentStaff, getAdminClient } from '../../../../../../lib/supabase';
import { loadSwo } from '../../../../../../lib/production-swo';
import { loadShipmentForSwo } from '../../../../../../lib/shipments';
import { buildPalletPlacard, palletPlacardFilename } from '../../../../../../lib/ocs-documents';

export const prerender = false;

// The OCS pallet placard (Word) of a work order, one page per pallet.
export const GET: APIRoute = async ({ request, cookies, params, redirect }) => {
  const staff = await currentStaff(createServerClient(request, cookies));
  if (!staff) return redirect('/portail/connexion', 303);
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const admin = getAdminClient();
  const swo = await loadSwo(admin, id);
  if (!swo) return new Response('Not found', { status: 404 });
  const docx = await buildPalletPlacard(swo, await loadShipmentForSwo(admin, id));
  return new Response(docx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${palletPlacardFilename(swo)}"`,
    },
  });
};
