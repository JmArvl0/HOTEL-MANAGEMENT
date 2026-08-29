-- Customer / Guest workflows. Server-authoritative, ownership-scoped, and additive.
alter table public.guest_requests add column if not exists request_type text not null default 'general';
alter table public.guest_requests add column if not exists requested_action jsonb not null default '{}'::jsonb;
alter table public.guest_requests add column if not exists idempotency_key uuid;
create unique index if not exists guest_requests_customer_idempotency_unique on public.guest_requests(idempotency_key) where idempotency_key is not null;

alter table public.reservation_change_requests add column if not exists requested_guests integer;
alter table public.reservation_change_requests add column if not exists requested_special_requests text;
alter table public.reservation_change_requests add column if not exists calculated_total numeric(12,2);
alter table public.reservation_change_requests add column if not exists payment_difference numeric(12,2);
alter table public.reservation_change_requests add column if not exists manager_approval_id uuid references public.manager_approval_requests(id) on delete restrict;
alter table public.reservation_change_requests add column if not exists idempotency_key uuid;
alter table public.reservation_change_requests add column if not exists execution_status text not null default 'pending_review';
alter table public.reservation_change_requests drop constraint if exists reservation_change_requests_status_check;
alter table public.reservation_change_requests add constraint reservation_change_requests_status_check check(status in('pending','approved','rejected','cancelled','executed'));
alter table public.reservation_change_requests add constraint reservation_change_execution_status_check check(execution_status in('pending_review','awaiting_execution','executed','not_required','cancelled'));
create unique index if not exists reservation_change_idempotency_unique on public.reservation_change_requests(idempotency_key) where idempotency_key is not null;
create unique index if not exists reservation_change_manager_approval_unique on public.reservation_change_requests(manager_approval_id) where manager_approval_id is not null;

create unique index if not exists payments_manual_reference_unique on public.payments(method,lower(reference))
 where reference is not null and status in('pending_verification','paid') and purpose in('reservation_deposit','stay_payment');

create or replace function public.register_guest_account(p_first_name text,p_last_name text,p_email text,p_phone text,p_password_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid;gid text;email_value text:=lower(trim(p_email));full_name text:=trim(p_first_name||' '||p_last_name);begin
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or email_value!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'or length(coalesce(p_password_hash,''))<40 then raise exception'INVALID_REGISTRATION';end if;
 if exists(select 1 from user_accounts where lower(email)=email_value)then raise exception'ACCOUNT_EXISTS';end if;
 if exists(select 1 from guests where lower(email)=email_value and user_account_id is not null)then raise exception'ACCOUNT_EXISTS';end if;
 insert into user_accounts(email,name,role,password_hash,active)values(email_value,full_name,'guest',p_password_hash,true)returning id into uid;
 select id into gid from guests where lower(email)=email_value and user_account_id is null for update;
 if gid is null then insert into guests(name,first_name,last_name,email,phone,user_account_id)values(full_name,trim(p_first_name),trim(p_last_name),email_value,nullif(trim(p_phone),''),uid)returning id into gid;
 else update guests set name=full_name,first_name=trim(p_first_name),last_name=trim(p_last_name),phone=coalesce(nullif(trim(p_phone),''),phone),user_account_id=uid where id=gid;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(uid,'register_guest_account','user_account',uid::text,jsonb_build_object('guestId',gid,'role','guest'));
 return uid;end$$;

create or replace function public.customer_submit_guest_request(p_user_id uuid,p_reservation_id text,p_request_type text,p_description text,p_requested_action jsonb,p_idempotency_key uuid)
returns table(id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;rid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if nullif(trim(p_description),'')is null or length(trim(p_description))>500 then raise exception'INVALID_REQUEST';end if;
 select * into existing from guest_requests where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 case p_request_type when'extra_towels'then dept:='housekeeping';label:='Extra towels';when'toiletries'then dept:='housekeeping';label:='Toiletries';when'housekeeping'then dept:='housekeeping';label:='Housekeeping request';when'maintenance'then dept:='maintenance';label:='Maintenance concern';when'room_assistance'then dept:='front_desk';label:='Room assistance';when'room_change'then dept:='front_desk';label:='Room change request';when'stay_extension'then dept:='front_desk';label:='Stay extension request';when'general'then dept:='front_desk';label:='General hotel assistance';else raise exception'INVALID_REQUEST_TYPE';end case;
 if p_request_type='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
 insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,idempotency_key)
 values(r.id,r.guest_id,label||': '||trim(p_description),p_request_type,coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key)returning guest_requests.id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_request','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',p_request_type,'department',dept));
 return query select rid,'open'::text;end$$;

create or replace function public.customer_submit_stay_payment(p_user_id uuid,p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid)
returns table(payment_id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;pid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_amount<=0 or p_method not in('manual_bank_transfer','manual_gcash')or nullif(trim(p_reference),'')is null then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,submitted_at)
 values(i.id,r.id,round(p_amount,2),'PHP',p_method,trim(p_reference),'stay_payment','pending_verification',p_idempotency_key,now())returning id into pid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_stay_payment','payment',pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',p_method));
 return query select pid,'pending_verification'::text;end$$;

create or replace function public.verify_customer_stay_payment(p_payment_id uuid,p_staff_user_id uuid,p_approve boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;p payments%rowtype;i invoices%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk','accounting')then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'stay_payment'then raise exception'PAYMENT_NOT_FOUND';end if;
 if p.status in('paid','failed')then return jsonb_build_object('paymentId',p.id,'status',p.status);end if;if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if not p_approve and nullif(trim(p_reason),'')is null then raise exception'REJECTION_REASON_REQUIRED';end if;
 if p_approve then update payments set status='paid',received_by=p_staff_user_id,verified_at=now(),reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=null where id=p.id;select * into i from sync_invoice_financials(p.invoice_id);
 else update payments set status='failed',reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=trim(p_reason)where id=p.id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,case when p_approve then'verify_customer_stay_payment'else'reject_customer_stay_payment'end,'payment',p.id::text,jsonb_build_object('status',p.status),jsonb_build_object('status',case when p_approve then'paid'else'failed'end,'reason',nullif(trim(p_reason),'')));
 return jsonb_build_object('paymentId',p.id,'status',case when p_approve then'paid'else'failed'end);end$$;

create or replace function public.customer_request_reservation_change(p_user_id uuid,p_reservation_id text,p_check_in date,p_check_out date,p_room_type text,p_guests integer,p_special_requests text,p_reason text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;t room_types%rowtype;i invoices%rowtype;existing reservation_change_requests%rowtype;policy jsonb;cin date;cout date;rtype text;gcount int;inventory int;reserved int;held int;new_total numeric;diff numeric;days_before int;cid uuid;aid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status);end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_MODIFIABLE';end if;
 if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in('pending','approved'))then raise exception'CHANGE_ALREADY_OPEN';end if;
 cin:=coalesce(p_check_in,r.check_in);cout:=coalesce(p_check_out,r.check_out);rtype:=coalesce(nullif(trim(p_room_type),''),r.room_type);gcount:=coalesce(p_guests,r.guests);
 if cin<current_date or cout<=cin or gcount<1 or nullif(trim(p_reason),'')is null then raise exception'INVALID_MODIFICATION';end if;
 select * into t from room_types where name=rtype and active for update;if not found or gcount>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and x.status<>'maintenance'and(cin>current_date or x.housekeeping='clean');
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=t.name and x.status in('pending','confirmed','checked_in')and x.check_in<cout and x.check_out>cin;
 select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<cout and h.check_out>cin;
 if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 new_total:=round(t.base_rate*(cout-cin),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;diff:=round(new_total-i.amount,2);
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());days_before:=r.check_in-current_date;
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

create or replace function public.sync_customer_change_request_status()returns trigger language plpgsql security definer set search_path=public as $$begin
 update reservation_change_requests set status=case when new.status='rejected'then'rejected'when new.status='cancelled'then'cancelled'when new.execution_status='executed'then'executed'when new.status='approved'then'approved'else status end,execution_status=case when new.execution_status='executed'then'executed'when new.status='approved'then'awaiting_execution'when new.status in('rejected','cancelled')then'cancelled'else execution_status end,reviewed_by=new.reviewed_by,reviewed_at=new.reviewed_at where manager_approval_id=new.id;
 if new.execution_status='executed'and new.request_type='reservation_modification'then update reservations r set guests=coalesce(c.requested_guests,r.guests),special_requests=coalesce(c.requested_special_requests,r.special_requests)from reservation_change_requests c where c.manager_approval_id=new.id and r.id=c.reservation_id;end if;return new;end$$;
drop trigger if exists manager_approval_sync_customer_change on public.manager_approval_requests;
create trigger manager_approval_sync_customer_change after update of status,execution_status on public.manager_approval_requests for each row execute function public.sync_customer_change_request_status();

revoke all on function public.register_guest_account(text,text,text,text,text),public.customer_submit_guest_request(uuid,text,text,text,jsonb,uuid),public.customer_submit_stay_payment(uuid,text,numeric,text,text,uuid),public.verify_customer_stay_payment(uuid,uuid,boolean,text),public.customer_request_reservation_change(uuid,text,date,date,text,integer,text,text,uuid) from public;
grant execute on function public.register_guest_account(text,text,text,text,text),public.customer_submit_guest_request(uuid,text,text,text,jsonb,uuid),public.customer_submit_stay_payment(uuid,text,numeric,text,text,uuid),public.verify_customer_stay_payment(uuid,uuid,boolean,text),public.customer_request_reservation_change(uuid,text,date,date,text,integer,text,text,uuid) to service_role;
