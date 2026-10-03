-- 20261024130000_eta_honored_checkin.sql
--
-- Defense (2026-10-03): when the guest stated arrival time has come, assign
-- and check-in must work - the clock alone must not strand an arrival whose
-- room is ready. On the check-in date, once hotel-local time reaches the
-- reservation expected_arrival, the EARLY_CHECKIN_NOT_ALLOWED block is
-- lifted (same effect as a manager approval). Every other gate is untouched:
-- verified identity, zero balance, vacant clean unblocked room, type match.
--
-- Guardrails (load-bearing, not optional):
-- - Only strict HH:MM is honored; free-text ETAs (e.g. Walk-in notes)
--   are ignored, so the rule cannot be steered by typing.
-- - One-directional only: a future ETA never restricts. Normal rules apply
--   until the stated time passes.
-- - Audit stamps earlyCheckInViaEta true only when the ETA actually made
--   the difference (distinct from managerEarlyApproval).
--
-- Base: byte-identical re-assertion of the 20260922010000 front_desk_check_in
-- body plus the four ETA regions (declare, parse, guard, audit). Same
-- signature, so grants and callers survive CREATE OR REPLACE untouched.
--
-- Verify against live before applying (drift happens): compare
-- select pg_get_functiondef('public.front_desk_check_in(text,text,uuid)'::regprocedure)
-- with the 20260922010000 body. Grants survive CREATE OR REPLACE.
--
-- REVERT: follow-up migration restoring the pure clock rule; ETA returns
-- to informational.

create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;early_approved boolean;type_mismatch boolean;appr manager_approval_requests%rowtype;t room_types%rowtype;new_total numeric;diff numeric;early_blocked boolean;eta_time time;eta_ok boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;perform expire_booking_holds();
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;if r.guest_id is null or nullif(trim(r.guest_name),'')is null then raise exception'GUEST_DETAILS_REQUIRED';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid','credit'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_now:=now()at time zone tz;early_approved:=coalesce(r.early_check_in_approved_until>now(),false);eta_time:=case when coalesce(trim(r.expected_arrival),'')~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then trim(r.expected_arrival)::time else null end;eta_ok:=eta_time is not null and local_now::date=r.check_in and local_now::time>=eta_time;early_blocked:=local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time))and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false)and not early_approved;
if local_now::date<r.check_in or local_now::date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;if early_blocked and not eta_ok then raise exception'EARLY_CHECKIN_NOT_ALLOWED';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found then raise exception'ROOM_TYPE_MISMATCH';end if;type_mismatch:=(room.type<>r.room_type);if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
if type_mismatch then
 select * into appr from manager_approval_requests where reservation_id=r.id and request_type='room_type_exception' and status='approved' and execution_status='awaiting_execution' and requested_action->>'roomType'=room.type order by requested_at desc limit 1;
 if appr.id is null then raise exception'ROOM_TYPE_MISMATCH';end if;
 if appr.requested_action->'financials'is null then raise exception'APPROVAL_STALE';end if;
 select * into t from room_types where name=room.type and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 -- The request-time snapshot governs (historically reproducible even if base rates later
 -- change); only the night count is re-derived so a date change cannot silently
 -- invalidate the approved numbers.
 if coalesce((appr.requested_action->'financials'->>'nights')::int,0)<>(r.check_out-r.check_in)then raise exception'APPROVAL_STALE';end if;
 diff:=round(coalesce((appr.requested_action->'financials'->>'difference')::numeric,0),2);
 if coalesce(appr.requested_action->'financials'->>'responsibility','')='guest'and diff>0 then
  if appr.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED';end if;
  new_total:=round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0),2);
 else
  new_total:=r.total;
 end if;
end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,room_type=room.type,status='checked_in',checked_in_at=coalesce(checked_in_at,now()),total=case when appr.id is null then r.total else new_total end where id=r.id;update rooms set status='occupied'where id=room.id;
if appr.id is not null then
 update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=appr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_room_type_exception','manager_approval',appr.id::text,jsonb_build_object('reservationId',r.id,'previousRoomType',r.room_type,'roomType',room.type,'room',room.number,'newTotal',new_total,'reasonCode',appr.requested_action->'financials'->>'reasonCode','responsibility',appr.requested_action->'financials'->>'responsibility','hotelAbsorbedAmount',case when coalesce(appr.requested_action->'financials'->>'responsibility','')='hotel'then round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0)-coalesce((appr.requested_action->'financials'->>'originalTotal')::numeric,0),2)else 0 end,'guestPaidDifference',case when coalesce(appr.requested_action->'financials'->>'responsibility','')='guest'then diff else 0 end));
end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number,'managerEarlyApproval',early_approved,'earlyCheckInViaEta',early_blocked and eta_ok));end$$;
