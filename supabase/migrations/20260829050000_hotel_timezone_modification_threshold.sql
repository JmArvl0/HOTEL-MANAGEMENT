-- Pins the customer reservation-modification RPC to the hotel's own calendar day.
--
-- Postgres `current_date` follows the session TimeZone, which is UTC on Supabase.
-- Asia/Manila is UTC+8, so from 16:00 UTC onward `current_date` is one day behind
-- the hotel's date. `customer_request_reservation_change` compared the snapshot's
-- `selfServiceModificationDays` against `r.check_in - current_date`, so during those
-- hours a change three days before arrival measured as four and self-executed
-- instead of raising a Manager approval — a policy bypass. The same drift let a
-- date already past in Manila validate, and let a same-day arrival be treated as a
-- future one when counting sellable rooms.
--
-- `cancel_reservation` (20260828050000) already derives its day from the snapshot
-- timezone; this migration factors that out as `hotel_today()` and applies it here.
--
-- Additive and idempotent: replaces two function definitions. No table, column,
-- constraint, reservation, payment, folio, refund, guest or audit row is touched.

create or replace function public.hotel_today(p_policy jsonb default null)
returns date language sql stable set search_path=public as $$
  select (now() at time zone coalesce(
    p_policy->>'hotelTimezone',
    (select hotel_timezone from hotel_operational_policies where key='default'),
    'Asia/Manila'))::date
$$;

create or replace function public.customer_request_reservation_change(p_user_id uuid,p_reservation_id text,p_check_in date,p_check_out date,p_room_type text,p_guests integer,p_special_requests text,p_reason text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;t room_types%rowtype;i invoices%rowtype;existing reservation_change_requests%rowtype;policy jsonb;today date;cin date;cout date;rtype text;gcount int;inventory int;reserved int;held int;new_total numeric;diff numeric;days_before int;cid uuid;aid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status);end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_MODIFIABLE';end if;
 if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in('pending','approved'))then raise exception'CHANGE_ALREADY_OPEN';end if;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());today:=hotel_today(policy);
 cin:=coalesce(p_check_in,r.check_in);cout:=coalesce(p_check_out,r.check_out);rtype:=coalesce(nullif(trim(p_room_type),''),r.room_type);gcount:=coalesce(p_guests,r.guests);
 if cin<today or cout<=cin or gcount<1 or nullif(trim(p_reason),'')is null then raise exception'INVALID_MODIFICATION';end if;
 select * into t from room_types where name=rtype and active for update;if not found or gcount>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and x.status<>'maintenance'and(cin>today or x.housekeeping='clean');
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=t.name and x.status in('pending','confirmed','checked_in')and x.check_in<cout and x.check_out>cin;
 select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<cout and h.check_out>cin;
 if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 new_total:=round(t.base_rate*(cout-cin),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;diff:=round(new_total-i.amount,2);
 days_before:=r.check_in-today;
 insert into reservation_change_requests(reservation_id,requested_by,requested_check_in,requested_check_out,requested_room_type,requested_guests,requested_special_requests,reason,status,calculated_total,payment_difference,idempotency_key,execution_status)
 values(r.id,p_user_id,cin,cout,rtype,gcount,nullif(trim(p_special_requests),''),trim(p_reason),case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'executed'else'pending'end,new_total,diff,p_idempotency_key,case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'not_required'else'pending_review'end)returning id into cid;
 if days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then
  update reservations set check_in=cin,check_out=cout,room_type=rtype,guests=gcount,special_requests=coalesce(nullif(trim(p_special_requests),''),special_requests),total=new_total,room_id=null,room_number=null where id=r.id;
  update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id);update reservation_room_assignments set status='cancelled',released_at=now(),reason='Customer self-service reservation modification'where reservation_id=r.id and status='active';
 else
  insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
  values('reservation_modification','reservation_change_request',cid::text,r.id,'front_desk','normal',trim(p_reason),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'specialRequests',nullif(trim(p_special_requests),''),'calculatedTotal',new_total,'paymentDifference',diff),jsonb_build_object('requiresManagerApproval',true,'policyDays',coalesce((policy->>'selfServiceModificationDays')::int,3)),p_user_id)returning id into aid;
  update reservation_change_requests set manager_approval_id=aid where id=cid;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_request_reservation_change','reservation_change_request',cid::text,jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'total',r.total),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid));
 return jsonb_build_object('id',cid,'status',case when aid is null then'executed'else'pending'end,'executionStatus',case when aid is null then'not_required'else'pending_review'end,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid);end$$;

revoke all on function public.hotel_today(jsonb) from public;
grant execute on function public.hotel_today(jsonb) to service_role;
