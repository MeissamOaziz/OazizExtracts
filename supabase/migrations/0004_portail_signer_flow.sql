-- Milestone B: signer routing.
--
-- Adds signer_tokens (one row per person invited to a submission),
-- restructures signers to link to a token, and exposes two SECURITY DEFINER
-- RPCs (get_signer_context, submit_signature) so the tokenized signing page
-- can run without any auth session.
--
-- QA is created just-in-time: a trigger on signer_tokens completion checks
-- whether all non-QA tokens are done and, if so, creates the QA token row.
-- The API layer notices the new QA row and emails Stéphane.

-- ============================================================
-- pgcrypto: gen_random_bytes + digest for token hashing helpers
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- Restructure signers: drop old token fields, add FK to signer_tokens
-- ============================================================

alter table signers drop column if exists token_hash;
alter table signers drop column if exists unlocks_after_role;
drop index if exists signers_token_hash_uniq;

-- We'll add signer_token_id after creating signer_tokens.

-- ============================================================
-- signer_tokens
-- ============================================================

create table signer_tokens (
  id                    uuid primary key default gen_random_uuid(),
  submission_id         uuid not null references submissions(id) on delete cascade,
  staff_id              uuid not null references staff(id),
  token_hash            text not null unique,
  expires_at            timestamptz not null,
  sent_at               timestamptz,
  completed_at          timestamptz,
  reminder_count        integer not null default 0,
  last_reminded_at      timestamptz,
  is_qa                 boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (submission_id, staff_id)
);

create index signer_tokens_submission_idx on signer_tokens (submission_id);

alter table signers
  add column signer_token_id uuid references signer_tokens(id) on delete cascade;

create index signers_signer_token_idx on signers (signer_token_id);

-- ============================================================
-- Safe projection so the dashboard can render signer status
-- (rebuild the existing view to include token metadata)
-- ============================================================

drop view if exists v_signers_public;
create view v_signers_public with (security_invoker = true) as
select
  s.id,
  s.submission_id,
  s.role,
  s.staff_id,
  st.full_name       as staff_name,
  st.email           as staff_email,
  s.document_kind,
  s.participant_staff_id,
  pst.full_name      as participant_name,
  s.signed_at,
  s.status,
  s.created_at,
  t.id               as signer_token_id,
  t.expires_at,
  t.sent_at,
  t.completed_at,
  t.reminder_count,
  t.is_qa
from signers s
join staff st on st.id = s.staff_id
left join staff pst on pst.id = s.participant_staff_id
left join signer_tokens t on t.id = s.signer_token_id;

grant select on v_signers_public to authenticated;

-- ============================================================
-- RLS: signer_tokens is server-side only.
-- ============================================================

alter table signer_tokens enable row level security;
-- (No policies for authenticated / anon → clients get zero rows.)

-- ============================================================
-- RPC: get_signer_context(raw_token)
-- Returns a jsonb payload for the tokenized signer page, or null.
-- ============================================================

create or replace function get_signer_context(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_token signer_tokens%rowtype;
  v_submission submissions%rowtype;
  v_staff staff%rowtype;
  v_pending_signers jsonb;
  v_result jsonb;
begin
  if raw_token is null or length(raw_token) < 16 then
    return null;
  end if;

  v_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  select * into v_token from signer_tokens where token_hash = v_hash;
  if v_token.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_token.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;

  if v_token.completed_at is not null then
    return jsonb_build_object('error', 'already_signed', 'completed_at', v_token.completed_at);
  end if;

  select * into v_submission from submissions where id = v_token.submission_id;
  select * into v_staff from staff where id = v_token.staff_id;

  -- Collect the pending signer rows this token is responsible for.
  select jsonb_agg(row_to_json(row)) into v_pending_signers
  from (
    select
      s.id, s.role, s.document_kind, s.participant_staff_id,
      pst.full_name as participant_name,
      s.status, s.signed_at
    from signers s
    left join staff pst on pst.id = s.participant_staff_id
    where s.signer_token_id = v_token.id
    order by s.document_kind, pst.full_name nulls first
  ) row;

  v_result := jsonb_build_object(
    'token_id', v_token.id,
    'is_qa', v_token.is_qa,
    'expires_at', v_token.expires_at,
    'signer', jsonb_build_object(
      'staff_id', v_staff.id,
      'name', v_staff.full_name,
      'email', v_staff.email
    ),
    'submission', jsonb_build_object(
      'id', v_submission.id,
      'form_date', v_submission.form_date,
      'product_name', v_submission.product_name,
      'product_type', v_submission.product_type,
      'quantity', v_submission.quantity,
      'production_id', v_submission.production_id
    ),
    'pending_signers', coalesce(v_pending_signers, '[]'::jsonb)
  );

  return v_result;
end;
$$;

revoke all on function get_signer_context(text) from public;
grant execute on function get_signer_context(text) to anon, authenticated;

-- ============================================================
-- RPC: submit_signature(raw_token, image, ip, ua)
-- Marks every signer row bound to the token as signed with the given image.
-- ============================================================

create or replace function submit_signature(
  raw_token       text,
  signature_data  text,
  signer_ip       inet,
  signer_ua       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_token signer_tokens%rowtype;
  v_affected int;
begin
  if raw_token is null or length(raw_token) < 16 then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  if signature_data is null or length(signature_data) < 500 then
    return jsonb_build_object('error', 'signature_missing');
  end if;
  if length(signature_data) > 500000 then
    return jsonb_build_object('error', 'signature_too_large');
  end if;

  v_hash := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  select * into v_token from signer_tokens where token_hash = v_hash for update;
  if v_token.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_token.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;
  if v_token.completed_at is not null then
    return jsonb_build_object('error', 'already_signed');
  end if;

  update signers
     set status          = 'signed',
         signed_at       = now(),
         signature_image = signature_data,
         ip_address      = signer_ip,
         user_agent      = signer_ua
   where signer_token_id = v_token.id
     and status = 'pending';
  get diagnostics v_affected = row_count;

  update signer_tokens
     set completed_at = now()
   where id = v_token.id;

  -- audit
  insert into audit_log (submission_id, actor_email, action, ip_address, user_agent, metadata)
  values (
    v_token.submission_id,
    (select email from staff where id = v_token.staff_id),
    'signature_captured',
    signer_ip,
    signer_ua,
    jsonb_build_object('signer_token_id', v_token.id, 'signed_rows', v_affected)
  );

  return jsonb_build_object(
    'ok', true,
    'signed_rows', v_affected,
    'submission_id', v_token.submission_id
  );
end;
$$;

revoke all on function submit_signature(text, text, inet, text) from public;
grant execute on function submit_signature(text, text, inet, text) to anon, authenticated;

-- ============================================================
-- Trigger: when a non-QA token completes, check whether we should
-- create the QA token so the API layer can email Stéphane. When the
-- QA token itself completes, flip the submission to 'finalized'.
-- ============================================================

create or replace function on_signer_token_completed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_submission submissions%rowtype;
  v_pending_non_qa int;
  v_qa_exists boolean;
  v_new_token_hash text;
  v_new_raw text;
begin
  -- Only react when completed_at flipped from null → not null
  if new.completed_at is null or old.completed_at is not null then
    return new;
  end if;

  select * into v_submission from submissions where id = new.submission_id;
  if v_submission.id is null then
    return new;
  end if;

  if new.is_qa then
    -- QA just finished → submission complete, ready for finalization.
    update submissions
       set status = 'finalized',
           finalized_at = now()
     where id = new.submission_id;
    return new;
  end if;

  -- Any pending non-QA tokens left?
  select count(*) into v_pending_non_qa
    from signer_tokens
   where submission_id = new.submission_id
     and is_qa = false
     and completed_at is null;

  if v_pending_non_qa > 0 then
    -- Still waiting on other people. Bump to 'signing' if we were still 'sent'.
    if v_submission.status = 'sent' then
      update submissions set status = 'signing' where id = new.submission_id;
    end if;
    return new;
  end if;

  -- All non-QA tokens are done. Create the QA token if not already there.
  select exists(
    select 1 from signer_tokens
     where submission_id = new.submission_id
       and is_qa = true
  ) into v_qa_exists;

  if not v_qa_exists then
    -- Mint a fresh QA token. Raw token stashed in metadata so the send-QA
    -- endpoint can email it. Raw is short-lived; row is deleted from
    -- metadata by the endpoint after emailing.
    v_new_raw := encode(extensions.gen_random_bytes(32), 'hex');
    v_new_token_hash := encode(extensions.digest(v_new_raw, 'sha256'), 'hex');

    insert into signer_tokens (
      submission_id, staff_id, token_hash, expires_at, is_qa
    ) values (
      new.submission_id,
      v_submission.qa_staff_id,
      v_new_token_hash,
      now() + interval '30 days',
      true
    );

    insert into signers (submission_id, role, staff_id, document_kind, participant_staff_id, signer_token_id, status)
    select
      new.submission_id,
      'qa_verifier'::signer_role,
      v_submission.qa_staff_id,
      'rnd'::document_kind,
      sp.participant_staff_id,
      (select id from signer_tokens where submission_id = new.submission_id and is_qa = true),
      'pending'::signer_status
    from submission_participants sp
    where sp.submission_id = new.submission_id;

    -- Advance status
    update submissions set status = 'complete' where id = new.submission_id;

    -- Stash the raw QA token in audit_log metadata (server picks it up + emails).
    insert into audit_log (submission_id, actor_email, action, metadata)
    values (
      new.submission_id,
      null,
      'qa_token_minted',
      jsonb_build_object(
        'staff_id', v_submission.qa_staff_id,
        'raw_token', v_new_raw
      )
    );
  end if;

  return new;
end;
$$;

create trigger signer_tokens_after_update
after update of completed_at on signer_tokens
for each row execute function on_signer_token_completed();
