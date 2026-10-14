-- Recovered from the database migration history (supabase_migrations.schema_migrations)
-- on 2026-10-08. It was applied on 2026-09-08 12:13:14 UTC as version 20260908121314
-- ("atelier_storage_and_counter_reset") but never saved to the repo. Numbered after the existing files rather
-- than in its original position, because those numbers were since taken by other modules.
-- ---- original migration body follows, exactly as applied ----
-- Clear the counters used by the phase 2 smoke test so the first real order is OAZ-2026-0001.
delete from ops_counters where scope in ('order:2026', 'wo');

-- Private bucket for PO PDFs, COAs and label proofs attached to an order.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atelier',
  'atelier',
  false,
  26214400,  -- 25 MB
  array['application/pdf','image/png','image/jpeg','image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel','text/csv','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- Signed-in staff read; uploads and deletes go through the server route on the
-- service-role client, so no INSERT/DELETE policy is granted to authenticated.
create policy "atelier_read_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'atelier' and ops_current_role() is not null);
