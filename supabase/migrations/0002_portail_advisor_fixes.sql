-- Address advisor findings from 0001:
--   1) v_signers_public defaults to SECURITY DEFINER in PG15+; force security_invoker
--      so the view runs with the caller's permissions and RLS.
--   2) touch_updated_at() has no fixed search_path — pin it to prevent search_path attacks.

alter view v_signers_public set (security_invoker = true);

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
