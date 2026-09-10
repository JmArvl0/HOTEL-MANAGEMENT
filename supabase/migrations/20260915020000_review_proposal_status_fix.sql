-- Follow-up to 20260915010000: admin_review_room_type_rate_proposal stored the raw
-- decision verb ('approve'/'reject') into room_rate_proposals.status, violating the
-- ('pending','approved','rejected') check. Map the verb to the status noun.

create or replace function public.admin_review_room_type_rate_proposal(
  p_proposal_id uuid, p_decision text, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_proposals%rowtype; t room_types%rowtype; new_version integer; new_status text;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if p_decision not in ('approve', 'reject') or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into p from room_rate_proposals where id = p_proposal_id for update;
  if not found then raise exception 'RATE_PROPOSAL_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'RATE_PROPOSAL_ALREADY_REVIEWED'; end if;
  select * into t from room_types where id = p.room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  new_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  if p_decision = 'approve' then
    update room_types set base_rate = p.proposed_rate, version = version + 1, updated_at = now()
      where id = t.id returning version into new_version;
  else
    update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  end if;
  update room_rate_proposals set status = new_status, decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'review_room_type_rate_proposal', 'room_type', t.id::text,
    jsonb_build_object('baseRate', t.base_rate, 'proposedRate', p.proposed_rate, 'status', 'pending', 'version', t.version),
    jsonb_build_object('decision', p_decision, 'baseRate', case when p_decision = 'approve' then p.proposed_rate else t.base_rate end,
      'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version, 'status', new_status);
end $$;

revoke all on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) to service_role;
