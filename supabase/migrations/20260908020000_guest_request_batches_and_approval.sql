-- Feature (DB): guest-request submission batches + Front Desk approval.
-- One portal submission (customer_submit_guest_requests) now stamps every row
-- with the same batch_id (the client idempotency key), so the portal can group
-- "request A with 2 items" separately from a later "request B" even when both
-- land at the same moment. Each batch then needs one Front Desk decision:
-- approved (granted) or rejected (declined) — rejecting also cancels the rows
-- and their pending housekeeping tasks so no queue acts on a declined request.

alter table public.guest_requests add column if not exists batch_id uuid not null default gen_random_uuid();
alter table public.guest_requests add column if not exists approval_status text not null default 'pending';
alter table public.guest_requests add constraint guest_requests_approval_status_chk check (approval_status in ('pending','approved','rejected')) not valid;
alter table public.guest_requests add column if not exists approved_by uuid references user_accounts(id) on delete set null;
alter table public.guest_requests add column if not exists approved_at timestamptz;
alter table public.guest_requests add column if not exists approval_note text;
create index if not exists guest_requests_batch_idx on public.guest_requests(batch_id);

-- Requests that predate the approval workflow were filed and worked under the
-- old "open = accepted" convention — backfill them as approved so Front Desk
-- does not inherit a false pending backlog. Each legacy row also keeps its own
-- generated batch_id (one row = one submission card), which is how the old
-- single-item UI already behaved.
update public.guest_requests set approval_status='approved', approved_at=created_at where approval_status='pending';

-- Bulk portal submit: recreated (was 6-arg) only to stamp the shared batch and
-- the pending review state. Body otherwise preserved from the live definition
-- (NULL-safe guest gate, ownership, stay_extension validation, per-row
-- deterministic idempotency, audit trail).
create or replace function public.customer_submit_guest_requests(p_user_id uuid,p_reservation_id text,p_request_types text[],p_description text,p_requested_action jsonb,p_idempotency_key uuid)
returns table(id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;reqtext text;key uuid;rt text;rid uuid;begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if array_length(p_request_types,1)is null or array_length(p_request_types,1)>12 then raise exception'INVALID_REQUEST';end if;
 if length(coalesce(p_description,''))>500 or p_idempotency_key is null then raise exception'INVALID_REQUEST';end if;
 select * into r from reservations rr where rr.id=p_reservation_id and rr.user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 foreach rt in array p_request_types loop
  if rt is null or char_length(trim(rt))=0 then continue;end if;
  key:=md5(p_idempotency_key::text||'|'||trim(rt))::uuid;
  select * into existing from guest_requests where idempotency_key=key;if found then return query select existing.id,existing.status;continue;end if;
  if trim(rt)='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
  select g.department,g.label into dept,label from public.guest_request_route(trim(rt)) g;
  reqtext:=case when nullif(trim(coalesce(p_description,'')),'')is null then label else label||': '||trim(p_description)end;
  insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,batch_id,approval_status,idempotency_key)
  values(r.id,r.guest_id,reqtext,trim(rt),coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key,'pending',key)returning guest_requests.id into rid;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_requests','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',trim(rt),'department',dept,'batchId',p_idempotency_key));
  return query select rid,'open'::text;
 end loop;end$$;

-- Front Desk batch review: one decision for every pending row of a submission.
-- Approve grants the request (rows keep their operational status for the routed
-- department to work). Reject declines it: rows are cancelled and their pending
-- housekeeping tasks are cancelled so the department never acts on a declined
-- request. Re-reviewing an already-decided batch raises ALREADY_REVIEWED.
create or replace function public.front_desk_review_guest_request_batch(p_staff_user_id uuid,p_batch_id uuid,p_decision text,p_note text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare actor text;count int;begin
 select role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'front_desk'then raise exception'FRONT_DESK_ACCESS_REQUIRED';end if;
 if p_decision not in('approve','reject')then raise exception'INVALID_DECISION';end if;
 if length(coalesce(p_note,''))>500 then raise exception'INVALID_NOTE';end if;
 select count(*)into count from(select 1 from guest_requests where batch_id=p_batch_id and approval_status='pending' for update)locked;
 if count=0 then raise exception'ALREADY_REVIEWED';end if;
 if p_decision='approve' then
  update guest_requests set approval_status='approved',approved_by=p_staff_user_id,approved_at=now(),approval_note=nullif(trim(coalesce(p_note,'')),'')
   where batch_id=p_batch_id and approval_status='pending';
 else
  update guest_requests set approval_status='rejected',approved_by=p_staff_user_id,approved_at=now(),approval_note=nullif(trim(coalesce(p_note,'')),''),status='cancelled'
   where batch_id=p_batch_id and approval_status='pending';
  update housekeeping_tasks h set status='cancelled',updated_at=now(),version=version+1
   where h.source_type='guest_request' and h.status in('pending','assigned','deferred')
    and exists(select 1 from guest_requests g where g.batch_id=p_batch_id and g.id::text=h.source_id);
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_staff_user_id,'front_desk_review_guest_request_batch','guest_request',p_batch_id::text,jsonb_build_object('decision',p_decision,'note',nullif(trim(coalesce(p_note,'')),''),'requestCount',count));
 return count;end$$;

revoke all on function public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid),public.front_desk_review_guest_request_batch(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid),public.front_desk_review_guest_request_batch(uuid,uuid,text,text) to service_role;
