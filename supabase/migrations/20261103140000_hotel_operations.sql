-- P3/P4/P5/P9/P10. Additive; no remote apply, auth-account merges or historical guesses.
begin;
create table public.hotel_operation_requests(
  id uuid primary key, action text not null, entity text not null, actor uuid not null references user_accounts(id),
  payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
create function public.hotel_actor(p_actor uuid,p_roles text[]) returns text language plpgsql security definer set search_path=public as $$
declare actor text;begin
 select role into actor from user_accounts where id=p_actor and active and account_status='active' and not coalesce(recovery_required,false);
 if actor is null or not(actor=any(p_roles)) then raise exception 'HOTEL_FORBIDDEN';end if;return actor;
end$$;
create function public.hotel_request_result(p_key uuid,p_action text,p_entity text,p_actor uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare previous hotel_operation_requests%rowtype;begin
 if p_key is null then raise exception 'IDEMPOTENCY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,1));
 select * into previous from hotel_operation_requests where id=p_key;
 if found then
  if previous.action<>p_action or previous.entity<>p_entity or previous.actor<>p_actor or previous.payload<>p_payload then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return previous.result;
 end if;return null;
end$$;

-- Do not infer effective boundaries for existing rows. New episodes record them.
alter table reservation_room_assignments add column effective_from date;
alter table reservation_room_assignments add column effective_to date;
alter table reservation_room_assignments add constraint assignment_effective_order check(effective_to is null or effective_to>=effective_from);
create function public.hotel_assignment_period() returns trigger language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;begin
 select * into r from reservations where id=new.reservation_id;
 if tg_op='INSERT' then
  if r.status='checked_in' then new.check_in:=greatest(new.check_in,hotel_today(r.operational_policy_snapshot));end if;
  new.effective_from:=new.check_in;new.effective_to:=null;
 elsif new.status<>old.status and new.status in('completed','reassigned','cancelled') and old.effective_from is not null then
  new.effective_to:=greatest(old.effective_from,least(old.check_out,hotel_today(r.operational_policy_snapshot)));
 end if;return new;
end$$;
create trigger hotel_assignment_period before insert or update on reservation_room_assignments for each row execute function hotel_assignment_period();
-- Room changes validate only remaining nights; pricing and reservation dates stay intact.
-- The picker must use the same in-house remaining-night window as the commit.
do $$declare body text;patched text;begin
 select pg_get_functiondef('front_desk_room_is_eligible(text,text)'::regprocedure) into body;
 patched:=replace(body,'r.status=''confirmed''','r.status in(''confirmed'',''checked_in'')');
 if patched=body then raise exception 'ROOM_ELIGIBILITY_STATUS_UNEXPECTED';end if;
 body:=patched;
 patched:=replace(body,'ra.check_out>r.check_in','ra.check_out>case when r.status=''checked_in'' then greatest(r.check_in,hotel_today(r.operational_policy_snapshot)) else r.check_in end');
 if patched=body then raise exception 'ROOM_ELIGIBILITY_WINDOW_UNEXPECTED';end if;
 execute patched;
end$$;
do $$declare body text;patched text;begin
 select pg_get_functiondef('front_desk_change_room(text,text,text,uuid)'::regprocedure) into body;
 patched:=replace(body,'check_out>r.check_in','check_out>greatest(r.check_in,hotel_today(r.operational_policy_snapshot))');
 if patched=body then raise exception 'ROOM_MOVE_BODY_UNEXPECTED';end if;execute patched;
end$$;
do $$declare body text;prefix text;boundary integer;begin
 select pg_get_functiondef('front_desk_execute_manager_approval(uuid,text,uuid)'::regprocedure) into body;
 boundary:=strpos(body,'elsif a.request_type=''reservation_modification''');
 if boundary=0 then raise exception 'MANAGER_MOVE_BODY_UNEXPECTED';end if;
 prefix:=replace(left(body,boundary-1),'check_out>r.check_in','check_out>greatest(r.check_in,hotel_today(r.operational_policy_snapshot))');
 execute prefix||substr(body,boundary);
end$$;

alter table reservations add column party_version integer not null default 0;
create table public.reservation_guests(
 reservation_id text not null references reservations(id) on delete restrict,
 guest_id text not null references guests(id) on delete restrict,
 role text not null check(role in('primary','accompanying')),
 added_by uuid references user_accounts(id),added_at timestamptz not null default now(),primary key(reservation_id,guest_id));
create unique index reservation_party_one_primary on reservation_guests(reservation_id) where role='primary';
insert into reservation_guests(reservation_id,guest_id,role)
 select r.id,r.guest_id,'primary' from reservations r join guests g on g.id=r.guest_id
 where lower(trim(r.guest_name))=lower(trim(g.name));
create function public.hotel_party_primary_on_booking() returns trigger language plpgsql security definer set search_path=public as $$begin
 if exists(select 1 from guests where id=new.guest_id and lower(trim(name))=lower(trim(new.guest_name))) then
  insert into reservation_guests(reservation_id,guest_id,role) values(new.id,new.guest_id,'primary') on conflict do nothing;
 end if;return new;
end$$;
create trigger hotel_party_primary_on_booking after insert on reservations for each row execute function hotel_party_primary_on_booking();
create function public.hotel_party_capacity_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (select count(*) from reservation_guests where reservation_id=new.id)>least(new.guests,coalesce((select max_guests from room_types where name=new.room_type),new.guests)) then raise exception 'PARTY_CAPACITY';end if;
 return new;
end$$;
create trigger hotel_party_capacity_guard before update of guests,room_type on reservations for each row execute function hotel_party_capacity_guard();
create function public.hotel_party_read(p_reservation_id text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;begin
 perform hotel_actor(p_actor,array['front_desk','manager','owner']);select * into r from reservations where id=p_reservation_id;
 if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 return jsonb_build_object('version',r.party_version,'capacity',least(r.guests,(select max_guests from room_types where name=r.room_type)),
 'members',coalesce((select jsonb_agg(jsonb_build_object('guestId',g.id,'name',g.name,'role',m.role) order by m.role desc,g.name) from reservation_guests m join guests g on g.id=m.guest_id where m.reservation_id=r.id),'[]'));
end$$;
create function public.hotel_party_update(p_reservation_id text,p_members jsonb,p_expected_version integer,p_key uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;before_members jsonb;result jsonb;member jsonb;gid text;seen text[]:='{}';begin
 perform hotel_actor(p_actor,array['front_desk']);
 result:=hotel_request_result(p_key,'party',p_reservation_id,p_actor,p_members);if result is not null then return result;end if;
 select * into r from reservations where id=p_reservation_id for update;
 if not found or r.status not in('confirmed','checked_in') then raise exception 'PARTY_NOT_EDITABLE';end if;
 if r.party_version<>p_expected_version then raise exception 'STALE_VERSION';end if;
 if jsonb_typeof(p_members)<>'array' then raise exception 'INVALID_PARTY';end if;
 if jsonb_array_length(p_members)>least(r.guests,(select max_guests from room_types where name=r.room_type)) then raise exception 'PARTY_CAPACITY';end if;
 if (select count(*) from jsonb_array_elements(p_members) m where m->>'role'='primary')<>1 then raise exception 'PARTY_PRIMARY_REQUIRED';end if;
 before_members:=hotel_party_read(r.id,p_actor);
 delete from reservation_guests where reservation_id=r.id;
 for member in select value from jsonb_array_elements(p_members) loop
  if coalesce(member->>'role','') not in('primary','accompanying') then raise exception 'INVALID_PARTY';end if;
  gid:=nullif(member->>'guestId','');
  if gid is null then
   if char_length(trim(coalesce(member->>'name',''))) not between 2 and 160 then raise exception 'GUEST_NAME_REQUIRED';end if;
   insert into guests(name) values(trim(member->>'name')) returning id into gid;
  elsif not exists(select 1 from guests where id=gid) then raise exception 'GUEST_NOT_FOUND';end if;
  if gid=any(seen) then raise exception 'DUPLICATE_PARTY_MEMBER';end if;seen:=array_append(seen,gid);
  if member->>'role'='primary' and gid is distinct from r.guest_id then raise exception 'PRIMARY_STAYING_GUEST_LOCKED';end if;
  insert into reservation_guests(reservation_id,guest_id,role,added_by) values(r.id,gid,member->>'role',p_actor);
 end loop;
 update reservations set party_version=party_version+1 where id=r.id;
 result:=hotel_party_read(r.id,p_actor);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor,'reservation_party_update','reservation',r.id,before_members,result);
 insert into hotel_operation_requests values(p_key,'party',r.id,p_actor,p_members,result,now());return result;
end$$;

create table public.hotel_handovers(
 id uuid primary key default gen_random_uuid(),text text not null check(char_length(text) between 3 and 2000),
 status text not null default 'open' check(status in('open','in_progress','resolved')),archived boolean not null default false,
 assigned_role text not null check(assigned_role in('front_desk','housekeeping','maintenance','accounting','manager')),
 assigned_user uuid references user_accounts(id),due_at timestamptz,
 reservation_id text references reservations(id),room_id text references rooms(id),guest_id text references guests(id),task_id text references housekeeping_tasks(id),
 created_by uuid not null references user_accounts(id),updated_by uuid not null references user_accounts(id),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create function public.hotel_handover_list(p_actor uuid,p_archived boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;result jsonb;begin
 actor:=hotel_actor(p_actor,array['owner','manager','front_desk','housekeeping','maintenance','accounting']);
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(h) order by h.due_at nulls last,h.created_at desc),'[]')) into result
 from (select * from hotel_handovers where archived=p_archived and (assigned_role=actor or created_by=p_actor or actor in('manager','owner')) order by due_at nulls last,created_at desc limit 200) h;
 return result;
end$$;
create function public.hotel_handover_save(p_id uuid,p_version integer,p_body jsonb,p_key uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;previous hotel_handovers%rowtype;row hotel_handovers%rowtype;result jsonb;assignee user_accounts%rowtype;entity text:=coalesce(p_id::text,'new');begin
 actor:=hotel_actor(p_actor,array['owner','manager','front_desk','housekeeping','maintenance','accounting']);
 result:=hotel_request_result(p_key,'handover',entity,p_actor,p_body);if result is not null then return result;end if;
 if p_id is not null then
  select * into previous from hotel_handovers where id=p_id for update;
  if not found or not(previous.assigned_role=actor or previous.created_by=p_actor or actor in('manager','owner')) then raise exception 'HOTEL_FORBIDDEN';end if;
  if previous.version<>p_version then raise exception 'STALE_VERSION';end if;
 end if;
 if char_length(trim(coalesce(p_body->>'text',''))) not between 3 and 2000 then raise exception 'HANDOVER_TEXT_REQUIRED';end if;
 if coalesce(nullif(p_body->>'guestId',''),previous.guest_id) is not null and (actor not in('front_desk','manager','owner') or coalesce(p_body->>'assignedRole','') not in('front_desk','manager')) then raise exception 'CONTACT_LINK_FORBIDDEN';end if;
 if nullif(p_body->>'assignedUser','') is not null then
  select * into assignee from user_accounts where id=(p_body->>'assignedUser')::uuid and active;
  if not found or assignee.role<>p_body->>'assignedRole' then raise exception 'INVALID_ASSIGNEE';end if;
 end if;
 if p_id is null then
  insert into hotel_handovers(text,assigned_role,assigned_user,due_at,reservation_id,room_id,guest_id,task_id,created_by,updated_by)
  values(trim(p_body->>'text'),p_body->>'assignedRole',nullif(p_body->>'assignedUser','')::uuid,nullif(p_body->>'dueAt','')::timestamptz,
   nullif(p_body->>'reservationId',''),nullif(p_body->>'roomId',''),nullif(p_body->>'guestId',''),nullif(p_body->>'taskId',''),p_actor,p_actor) returning * into row;
 else
  update hotel_handovers set text=trim(p_body->>'text'),status=coalesce(p_body->>'status',status),archived=coalesce((p_body->>'archived')::boolean,archived),
   assigned_role=p_body->>'assignedRole',assigned_user=nullif(p_body->>'assignedUser','')::uuid,due_at=nullif(p_body->>'dueAt','')::timestamptz,
   updated_by=p_actor,updated_at=now(),version=version+1 where id=p_id returning * into row;
 end if;
 result:=to_jsonb(row);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor,'handover_save','handover',row.id::text,to_jsonb(previous),result);
 insert into hotel_operation_requests values(p_key,'handover',entity,p_actor,p_body,result,now());return result;
end$$;

create function public.hotel_reservation_readiness(p_reservation_id text,p_actor uuid,p_candidate_room text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;i invoices%rowtype;room rooms%rowtype;policy jsonb;local_now timestamp;arrival text;ci text[]:='{}';co text[]:='{}';begin
 perform hotel_actor(p_actor,array['front_desk','manager','owner']);
 select * into r from reservations where id=p_reservation_id;if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 select * into i from invoices where reservation_id=r.id;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());local_now:=now() at time zone coalesce(policy->>'hotelTimezone','Asia/Manila');
 if r.status<>'confirmed' then ci:=array_append(ci,'CONFIRMED_STAY_REQUIRED');end if;
 if coalesce((policy->>'validIdRequired')::boolean,true) and r.identity_status is distinct from 'verified' then ci:=array_append(ci,'IDENTITY_REQUIRED');end if;
 if i.id is null then ci:=array_append(ci,'FOLIO_REQUIRED');co:=array_append(co,'FOLIO_REQUIRED');
 elsif i.balance>0 then ci:=array_append(ci,'BALANCE_DUE');co:=array_append(co,'BALANCE_DUE');end if;
 if lower(coalesce(r.source,''))='website' and r.deposit_required>0 and r.payment_status not in('partial','paid','credit') then ci:=array_append(ci,'DEPOSIT_VERIFICATION_REQUIRED');end if;
 if local_now::date<r.check_in or local_now::date>=r.check_out then ci:=array_append(ci,'ARRIVAL_DATE_WINDOW');end if;
 arrival:=r.expected_arrival;
 if local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time)) and not coalesce(r.early_check_in_approved_until>now(),false) and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false) then
  if arrival is null or arrival!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then ci:=array_append(ci,'EARLY_APPROVAL_REQUIRED');
  elsif local_now<(r.check_in+arrival::time) then ci:=array_append(ci,'EARLY_APPROVAL_REQUIRED');end if;
 end if;
 if coalesce(p_candidate_room,r.room_id) is null then ci:=array_append(ci,'ROOM_REQUIRED');else
  select * into room from rooms where id=coalesce(p_candidate_room,r.room_id) or number=p_candidate_room limit 1;
  if room.id is null or room.housekeeping is distinct from 'clean' or room.status is distinct from 'available' or not coalesce(room.administratively_active,true) or maintenance_room_is_blocked(room.id) then ci:=array_append(ci,'ROOM_NOT_READY');end if;
  if exists(select 1 from reservation_room_assignments a where a.room_id=room.id and a.reservation_id<>r.id and a.status='active' and a.check_in<r.check_out and a.check_out>r.check_in) then ci:=array_append(ci,'ROOM_CONFLICT');end if;
 end if;
 if r.status<>'checked_in' then co:=array_append(co,'IN_HOUSE_REQUIRED');end if;
 if not exists(select 1 from reservation_room_assignments where reservation_id=r.id and status='active') then co:=array_append(co,'ACTIVE_ASSIGNMENT_REQUIRED');end if;
 return jsonb_build_object('assessedAt',clock_timestamp(),'reservationVersion',md5(to_jsonb(r)::text),'checkIn',ci,'checkOut',co,'checkInDate',r.check_in,'checkOutDate',r.check_out,'checkInTime',policy->>'checkInTime');
end$$;

create function public.hotel_handover_history(p_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;note hotel_handovers%rowtype;begin
 actor:=hotel_actor(p_actor,array['owner','manager','front_desk','housekeeping','maintenance','accounting']);
 select * into note from hotel_handovers where id=p_id;
 if not found or not(note.assigned_role=actor or note.created_by=p_actor or actor in('owner','manager')) then raise exception 'HOTEL_FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(history)) from (select a.created_at,u.name actor,a.after_data->>'text' text,a.after_data->>'status' status,a.after_data->>'version' version from audit_logs a left join user_accounts u on u.id=a.user_id where a.entity_type='handover' and a.entity_id=p_id::text and a.action='handover_save' order by a.created_at desc limit 100) history),'[]');
end$$;

create table public.hotel_fee_catalog(code text primary key check(code~'^[A-Za-z0-9_-]{2,40}$'),name text not null check(char_length(name) between 2 and 120),unit_amount numeric(12,2) not null check(unit_amount>0),active boolean not null default true,version integer not null default 1,updated_by uuid not null references user_accounts(id),updated_at timestamptz not null default now());
alter table folio_charges add column fee_snapshot jsonb;
create function public.hotel_fee_save(p_code text,p_name text,p_amount numeric,p_active boolean,p_version integer,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare fee hotel_fee_catalog%rowtype;begin
 perform hotel_actor(p_actor,array['accounting']);perform pg_advisory_xact_lock(hashtextextended(p_code,2));
 select * into fee from hotel_fee_catalog where code=p_code for update;
 if coalesce(fee.version,0)<>p_version then raise exception 'STALE_FEE';end if;
 if p_amount is null or p_amount<=0 or p_amount>10000000 then raise exception 'INVALID_FEE';end if;
 insert into hotel_fee_catalog(code,name,unit_amount,active,updated_by) values(p_code,trim(p_name),round(p_amount,2),p_active,p_actor)
 on conflict(code) do update set name=excluded.name,unit_amount=excluded.unit_amount,active=excluded.active,version=hotel_fee_catalog.version+1,updated_by=p_actor,updated_at=now() returning * into fee;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'fee_catalog_save','hotel_fee',p_code,to_jsonb(fee));return to_jsonb(fee);
end$$;
-- Preserve the operational charge RPC while binding a retry to the same actor,
-- reservation and charge body. A foreign key is never treated as a successful retry.
do $$declare body text;patched text;begin
 select pg_get_functiondef('post_folio_charge(text,text,text,numeric,uuid,uuid)'::regprocedure) into body;
 if strpos(body,'if found then return v_existing;end if;')=0 then raise exception 'CHARGE_RETRY_BODY_UNEXPECTED';end if;
 patched:=regexp_replace(body,'\mbegin\M',E'begin\n if p_idempotency_key is null then raise exception ''IDEMPOTENCY_REQUIRED'';end if;\n perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,1));','i');
 patched:=replace(patched,'if found then return v_existing;end if;',
  'if found then if not exists(select 1 from folio_charges where id=v_existing and reservation_id=p_reservation_id and posted_by=p_staff_user_id and amount=round(p_amount,2) and description=trim(p_description) and category=coalesce(nullif(trim(p_category),''''),''incidental'')) then raise exception ''IDEMPOTENCY_CONFLICT'';end if;return v_existing;end if;');
 execute patched;
end$$;
create function public.hotel_fee_post(p_reservation_id text,p_code text,p_quantity integer,p_version integer,p_key uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare fee hotel_fee_catalog%rowtype;cid uuid;invoice invoices%rowtype;result jsonb;payload jsonb:=jsonb_build_object('code',p_code,'quantity',p_quantity,'version',p_version);begin
 perform hotel_actor(p_actor,array['front_desk']);
 result:=hotel_request_result(p_key,'fee',p_reservation_id,p_actor,payload);if result is not null then return result;end if;
 if exists(select 1 from folio_charges where idempotency_key=p_key) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 select * into fee from hotel_fee_catalog where code=p_code for share;
 if not found or not fee.active or fee.version<>p_version then raise exception 'STALE_FEE';end if;
 if p_quantity is null or p_quantity not between 1 and 100 then raise exception 'INVALID_QUANTITY';end if;
 if fee.unit_amount*p_quantity>10000000 then raise exception 'INVALID_FEE_AMOUNT';end if;
 perform 1 from reservations where id=p_reservation_id and status='checked_in' for update;if not found then raise exception 'RESERVATION_NOT_IN_HOUSE';end if;
 select * into invoice from invoices where reservation_id=p_reservation_id for update;if not found then raise exception 'FOLIO_NOT_FOUND';end if;
 insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id,fee_snapshot)
 values(invoice.id,p_reservation_id,fee.name||' × '||p_quantity,'incidental',fee.unit_amount*p_quantity,p_actor,p_key,'hotel_operations',p_reservation_id,
 jsonb_build_object('code',fee.code,'name',fee.name,'unitAmount',fee.unit_amount,'quantity',p_quantity,'catalogVersion',fee.version,'taxTreatment','reservation_snapshot')) returning id into cid;
 update invoices set amount=round(amount+fee.unit_amount*p_quantity,2) where id=invoice.id;perform sync_invoice_financials(invoice.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'post_catalog_fee','folio_charge',cid::text,jsonb_build_object('reservationId',p_reservation_id,'code',fee.code,'quantity',p_quantity,'amount',fee.unit_amount*p_quantity));
 result:=jsonb_build_object('chargeId',cid,'amount',fee.unit_amount*p_quantity);
 insert into hotel_operation_requests values(p_key,'fee',p_reservation_id,p_actor,payload,result,now());return result;
 exception when unique_violation then raise exception 'IDEMPOTENCY_CONFLICT';
end$$;

create function public.hotel_fee_quote(p_code text,p_quantity integer,p_version integer,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare fee hotel_fee_catalog%rowtype;begin
 perform hotel_actor(p_actor,array['front_desk']);select * into fee from hotel_fee_catalog where code=p_code;
 if not found or not fee.active or fee.version<>p_version then raise exception 'STALE_FEE';end if;
 if p_quantity is null or p_quantity not between 1 and 100 then raise exception 'INVALID_QUANTITY';end if;
 if fee.unit_amount*p_quantity>10000000 then raise exception 'INVALID_FEE_AMOUNT';end if;
 return jsonb_build_object('code',fee.code,'version',fee.version,'quantity',p_quantity,'amount',round(fee.unit_amount*p_quantity,2));
end$$;
create function public.hotel_fee_snapshot_guard() returns trigger language plpgsql set search_path=public as $$begin
 if old.fee_snapshot is not null and new.fee_snapshot is distinct from old.fee_snapshot then raise exception 'FEE_SNAPSHOT_IMMUTABLE';end if;return new;
end$$;
create trigger hotel_fee_snapshot_guard before update on folio_charges for each row execute function hotel_fee_snapshot_guard();

create table public.hotel_duplicate_reviews(pair_key text primary key,decision text not null check(decision in('dismissed','do_not_merge','needs_identity_review')),reason text not null check(char_length(reason) between 3 and 500),reviewed_by uuid not null references user_accounts(id),reviewed_at timestamptz not null default now());
create function public.hotel_duplicate_review(p_pair_key text,p_decision text,p_reason text,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform hotel_actor(p_actor,array['manager','owner']);
 if p_pair_key!~'^GST-[A-Z0-9]+:GST-[A-Z0-9]+$' then raise exception 'INVALID_PAIR';end if;
 insert into hotel_duplicate_reviews values(p_pair_key,p_decision,trim(p_reason),p_actor,now()) on conflict(pair_key) do update set decision=excluded.decision,reason=excluded.reason,reviewed_by=p_actor,reviewed_at=now();
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'guest_duplicate_review','guest_pair',p_pair_key,jsonb_build_object('decision',p_decision,'reason',trim(p_reason)));
end$$;

do $$declare name text;fn record;begin
 foreach name in array array['hotel_operation_requests','reservation_guests','hotel_handovers','hotel_fee_catalog','hotel_duplicate_reviews'] loop
  execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant all on public.%I to service_role',name);
 end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hotel_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end$$;
commit;
