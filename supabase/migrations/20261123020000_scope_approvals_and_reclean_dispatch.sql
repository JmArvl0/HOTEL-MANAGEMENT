-- Enforce approval scope under the source row lock and add an audited Room Rack command.
create or replace function public.request_manager_approval(
  p_request_type text, p_related_entity_type text, p_related_entity_id text, p_reservation_id text,
  p_guest_request_id uuid, p_department text, p_severity text, p_reason text,
  p_requested_action jsonb, p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;v_target text;v_type room_types%rowtype;v_new_out date;v_added numeric;v_conflict boolean;v_nightly jsonb;v_rate numeric;v_target_total numeric;begin
actor := public.hotel_actor(p_staff_user_id, array['front_desk','housekeeping','maintenance','accounting']);
if p_request_type is null or nullif(trim(p_reason),'') is null then
  raise exception 'INVALID_APPROVAL_REQUEST';
end if;
if p_severity is null or p_severity not in ('normal','high','critical') then
  raise exception 'INVALID_SEVERITY';
end if;
case p_request_type
  when 'guest_escalation' then
    if actor not in ('front_desk','housekeeping','maintenance') then
      raise exception 'APPROVAL_REQUEST_FORBIDDEN';
    end if;
    select * into g from guest_requests where id = p_guest_request_id for update;
    if not found or (actor <> 'front_desk' and g.department is distinct from actor) then
      raise exception 'GUEST_REQUEST_NOT_FOUND';
    end if;
    if g.approval_status is distinct from 'approved' or g.status not in ('open','in_progress') then
      raise exception 'GUEST_REQUEST_NOT_ESCALATABLE';
    end if;
    if p_reservation_id is not null and p_reservation_id is distinct from g.reservation_id then
      raise exception 'APPROVAL_LINK_MISMATCH';
    end if;
    p_department := g.department;
    p_related_entity_type := 'guest_request';
    p_related_entity_id := g.id::text;
    p_reservation_id := g.reservation_id;
    update guest_requests set severity = p_severity, escalation_status = 'escalated',
      escalated_by = p_staff_user_id, escalated_at = now() where id = g.id;
  when 'refund_exception', 'guest_compensation' then
    if actor not in ('front_desk','accounting') then raise exception 'APPROVAL_REQUEST_FORBIDDEN'; end if;
  when 'room_upgrade', 'room_type_exception', 'reservation_modification', 'early_check_in',
       'late_checkout', 'checkout_exception', 'stay_extension' then
    if actor <> 'front_desk' then raise exception 'APPROVAL_REQUEST_FORBIDDEN'; end if;
  else raise exception 'APPROVAL_REQUEST_FORBIDDEN';
end case;
if p_request_type <> 'guest_escalation' then
  if p_reservation_id is null then raise exception 'RESERVATION_REQUIRED'; end if;
  p_department := actor;
  p_related_entity_type := 'reservation';
  p_related_entity_id := p_reservation_id;
  p_guest_request_id := null;
  select * into r from reservations where id = p_reservation_id;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  policy := coalesce(r.operational_policy_snapshot, current_operational_policy_snapshot());
  normal_result := jsonb_build_object('reservationStatus',r.status,'roomType',r.room_type,
    'checkIn',r.check_in,'checkOut',r.check_out,'policySnapshot',policy);
end if;
if p_request_type='refund_exception'then
 if r.status not in('cancelled','no_show')then raise exception'REFUND_EXCEPTION_REQUIRES_CLOSURE';end if;
 select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(max(eligible_amount),0)into normal_refund from refund_requests where reservation_id=r.id and exception_approval_id is null;
 normal_result:=normal_result||jsonb_build_object('settledDeposit',deposit_paid,'normalPolicyRefund',normal_refund);
end if;
if p_request_type='room_type_exception'then
 if nullif(p_requested_action->>'roomType','')is null then raise exception'ROOM_TYPE_EXCEPTION_TYPE_REQUIRED';end if;
 if(p_requested_action->>'roomType')=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=(p_requested_action->>'roomType')and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
end if;
if p_request_type in('room_type_exception','room_upgrade')then
 -- Financial responsibility derives from the reason code only. Strip any caller-supplied
 -- financial field, validate the code, then stamp the server-computed snapshot that the
 -- Manager reviews and that approval/execution consume verbatim.
 p_requested_action:=p_requested_action-'financials'-'priceDifference'-'waived'-'guest_charge'-'hotel_absorbed_amount'-'financial_responsibility';
 if nullif(p_requested_action->>'reasonCode','')is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_REQUIRED';end if;
 if public.room_type_change_responsibility(p_requested_action->>'reasonCode')is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_INVALID';end if;
 if(p_requested_action->>'reasonCode')='hotel_early_checkin_failure'and r.early_check_in_approved_until is null then raise exception'ROOM_TYPE_EXCEPTION_EARLY_CHECKIN_PRECONDITION';end if;
 v_target:=coalesce(nullif(p_requested_action->>'roomType',''),nullif(p_requested_action->>'requestedRoomType',''));
 select * into v_type from room_types where name=v_target and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 select round(coalesce(sum(rate),0),2),case when count(distinct rate)=1 then min(rate)else null end,coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into v_target_total,v_rate,v_nightly from room_nightly_rates(v_type.name,r.check_in,r.check_out);
 p_requested_action:=p_requested_action||jsonb_build_object('financials',jsonb_build_object('reasonCode',p_requested_action->>'reasonCode','responsibility',public.room_type_change_responsibility(p_requested_action->>'reasonCode'),'originalTotal',r.total,'targetRate',v_rate,'nights',(r.check_out-r.check_in),'targetTotal',v_target_total,'nightlyRates',v_nightly,'difference',round(v_target_total-r.total,2)));
end if;
if p_request_type='stay_extension'then
 -- In-house only, later checkout required; every derived figure is server-stamped.
 p_requested_action:=p_requested_action-'stayExtension';
 if r.status<>'checked_in'then raise exception'STAY_EXTENSION_REQUIRES_IN_HOUSE';end if;
 if nullif(p_requested_action->>'requestedCheckOut','')is null or(p_requested_action->>'requestedCheckOut')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out then raise exception'STAY_EXTENSION_INVALID_DATE';end if;
 v_new_out:=(p_requested_action->>'requestedCheckOut')::date;
 select * into v_type from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select round(coalesce(sum(rate),0),2),case when count(distinct rate)=1 then min(rate)else null end,coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into v_added,v_rate,v_nightly from room_nightly_rates(r.room_type,r.check_out,v_new_out);
 select exists(select 1 from reservation_room_assignments where room_id=r.room_id and reservation_id<>r.id and status='active'and check_in<v_new_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=r.room_id and status in('confirmed','checked_in')and check_in<v_new_out and check_out>r.check_out)into v_conflict;
 p_requested_action:=p_requested_action||jsonb_build_object('stayExtension',jsonb_build_object('currentCheckOut',r.check_out,'requestedCheckOut',v_new_out,'nights',(v_new_out-r.check_out),'rate',v_rate,'nightlyRates',v_nightly,'additionalAmount',v_added,'projectedTotal',round(r.total+v_added,2),'roomConflict',v_conflict,'roomNumber',r.room_number,'roomType',r.room_type));
end if;
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id,'actorRole',actor,'department',p_department,'reservationId',p_reservation_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end
$$;

-- Room Rack dispatch creates a task without changing room readiness or assignment.
create function public.hotel_dispatch_reclean(p_actor uuid, p_room_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text;
  room rooms%rowtype;
  task_id text;
begin
  actor := public.hotel_actor(p_actor, array['front_desk','manager']);
  select * into room from rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not room.administratively_active or room.status in ('occupied','maintenance')
     or room.housekeeping not in ('dirty','reclean_required')
     or exists (select 1 from reservations where room_id = room.id and status = 'checked_in')
     or exists (select 1 from maintenance_orders where room_id = room.id
                and status in ('open','assigned','in_progress','waiting_parts','deferred')
                and serviceability_impact in ('blocked','out_of_service')) then
    raise exception 'ROOM_RECLEAN_UNAVAILABLE';
  end if;

  -- The room lock serializes duplicate dispatches. Existing department work stays in its queue.
  select id into task_id from housekeeping_tasks
  where room_id = room.id and task_type in ('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')
    and status in ('pending','assigned','in_progress','deferred')
  order by created_at, id limit 1;
  if found then return jsonb_build_object('taskId',task_id,'created',false); end if;

  insert into housekeeping_tasks(room_id,room_number,task,task_type,priority,status,source_type)
  values(room.id,room.number,'Urgent reclean requested from Room Rack','reclean','urgent','pending','manual')
  returning id into task_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_actor,'housekeeping_reclean_dispatched','housekeeping_task',task_id,
         jsonb_build_object('actorRole',actor,'roomId',room.id,'priority','urgent'));
  return jsonb_build_object('taskId',task_id,'created',true);
end
$$;

revoke all on function public.hotel_dispatch_reclean(uuid,text) from public, anon, authenticated;
grant execute on function public.hotel_dispatch_reclean(uuid,text) to service_role;
revoke all on function public.request_manager_approval(text,text,text,text,uuid,text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.request_manager_approval(text,text,text,text,uuid,text,text,text,jsonb,uuid) to service_role;
