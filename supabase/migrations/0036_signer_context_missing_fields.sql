-- get_signer_context's jsonb payload was missing packaging_id (added in a
-- later migration than this function was last touched) and rnd_destruction_id
-- (never included despite migration 0013 adding the column) — the tokenized
-- (emailed-link) signer page was silently showing blank values for both.
-- Also adds the new optional rnd_qa_comments note. Function body otherwise
-- unchanged from its live definition.
create or replace function public.get_signer_context(raw_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text;
  v_token signer_tokens%rowtype;
  v_submission submissions%rowtype;
  v_staff staff%rowtype;
  v_initiator staff%rowtype;
  v_production staff%rowtype;
  v_qa staff%rowtype;
  v_consent staff%rowtype;
  v_pending_signers jsonb;
  v_participants jsonb;
  v_documents jsonb;
  v_participant_rnd jsonb;
  v_result jsonb;
begin
  if get_signer_context.raw_token is null or length(get_signer_context.raw_token) < 16 then
    return null;
  end if;

  v_hash := encode(extensions.digest(get_signer_context.raw_token, 'sha256'), 'hex');

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
  select * into v_staff       from staff where id = v_token.staff_id;
  select * into v_initiator   from staff where id = v_submission.initiator_staff_id;
  select * into v_production  from staff where id = v_submission.production_staff_id;
  select * into v_qa          from staff where id = v_submission.qa_staff_id;
  select * into v_consent     from staff where id = v_submission.consent_obtainer_staff_id;

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

  select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.full_name) order by st.full_name) into v_participants
  from submission_participants sp
  join staff st on st.id = sp.participant_staff_id
  where sp.submission_id = v_submission.id;

  select jsonb_agg(jsonb_build_object(
    'kind', document_kind,
    'participant', case when participant_staff_id is null then null
      else jsonb_build_object('id', participant_staff_id, 'name', participant_name) end
  )) into v_documents
  from (
    select distinct document_kind, participant_staff_id, participant_name
    from (
      select s.document_kind, s.participant_staff_id, pst.full_name as participant_name
      from signers s
      left join staff pst on pst.id = s.participant_staff_id
      where s.signer_token_id = v_token.id
    ) x
    order by document_kind, participant_name nulls first
  ) y;

  select jsonb_build_object(
    'rnd_ratings', sp.rnd_ratings,
    'rnd_comments', sp.rnd_comments
  ) into v_participant_rnd
  from submission_participants sp
  where sp.submission_id = v_submission.id
    and sp.participant_staff_id = v_token.staff_id;

  v_result := jsonb_build_object(
    'token_id', v_token.id,
    'is_qa', v_token.is_qa,
    'expires_at', v_token.expires_at,
    'signer', jsonb_build_object(
      'staff_id', v_staff.id,
      'name', v_staff.full_name,
      'email', v_staff.email,
      'saved_signature', v_staff.saved_signature
    ),
    'submission', jsonb_build_object(
      'id', v_submission.id,
      'form_date', v_submission.form_date,
      'product_name', v_submission.product_name,
      'product_type', v_submission.product_type,
      'quantity', v_submission.quantity,
      'production_state', v_submission.production_state,
      'production_id', v_submission.production_id,
      'packaging_id', v_submission.packaging_id,
      'rnd_objective', v_submission.rnd_objective,
      'rnd_quantity_for_test', v_submission.rnd_quantity_for_test,
      'rnd_lp_number', v_submission.rnd_lp_number,
      'rnd_qty_destroyed', v_submission.rnd_qty_destroyed,
      'rnd_date_destroyed', v_submission.rnd_date_destroyed,
      'rnd_destruction_id', v_submission.rnd_destruction_id,
      'rnd_qa_comments', v_submission.rnd_qa_comments,
      'initiator',        jsonb_build_object('id', v_initiator.id,  'name', v_initiator.full_name,  'email', v_initiator.email),
      'production',       jsonb_build_object('id', v_production.id, 'name', v_production.full_name, 'email', v_production.email),
      'qa',               jsonb_build_object('id', v_qa.id,         'name', v_qa.full_name,         'email', v_qa.email),
      'consent_obtainer', jsonb_build_object('id', v_consent.id,    'name', v_consent.full_name,    'email', v_consent.email)
    ),
    'participants', coalesce(v_participants, '[]'::jsonb),
    'documents', coalesce(v_documents, '[]'::jsonb),
    'pending_signers', coalesce(v_pending_signers, '[]'::jsonb),
    'participant_rnd', coalesce(v_participant_rnd, jsonb_build_object('rnd_ratings', null, 'rnd_comments', null))
  );

  return v_result;
end;
$function$;
