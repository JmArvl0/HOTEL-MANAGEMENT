begin;

create function public.front_desk_daily_snapshot(p_date date)
returns jsonb language sql stable security definer set search_path=public as $$
with zone as (
  select coalesce((select hotel_timezone from hotel_operational_policies where key='default'),'Asia/Manila') as name
), day_window as (
  select p_date::timestamp at time zone name as starts, (p_date+1)::timestamp at time zone name as ends from zone
), created as (
  select coalesce(source,'unknown') key,count(*) total from reservations,day_window
   where created_at>=starts and created_at<ends group by 1
), open_requests as (
  select coalesce(department,'unknown') key,count(*) total from guest_requests where status in ('open','in_progress') group by 1
), settled as (
  select purpose,method,amount from payments,day_window
   where status='paid' and purpose is distinct from 'refund'
     and coalesce(verified_at,created_at)>=starts and coalesce(verified_at,created_at)<ends
), cash as (
  select count(*) total,coalesce(sum(expected_cash),0) expected,coalesce(sum(actual_cash),0) counted,
    coalesce(sum(variance),0) variance from cash_shifts,day_window where closed_at>=starts and closed_at<ends
), room_care as (
  select task_type,started_at,completed_at,inspection_status from housekeeping_tasks,day_window
    where status='completed' and completed_at>=starts and completed_at<ends
)
select jsonb_build_object(
 'reportDate',p_date,
 'hotelTimezone',(select name from zone),
 'reservations',jsonb_build_object(
   'created',coalesce((select sum(total) from created),0),
   'bySource',coalesce((select jsonb_object_agg(key,total) from created),'{}'::jsonb),
   'arrivals',(select count(*) from reservations,day_window where checked_in_at>=starts and checked_in_at<ends),
   'departures',(select count(*) from reservations,day_window where checked_out_at>=starts and checked_out_at<ends),
   'cancelled',(select count(*) from audit_logs,day_window where entity_type='reservation' and action='cancel_reservation' and created_at>=starts and created_at<ends),
   'noShow',(select count(*) from audit_logs,day_window where entity_type='reservation' and action='reservation_no_show' and created_at>=starts and created_at<ends)),
 'guestRequests',jsonb_build_object(
   'opened',(select count(*) from guest_requests,day_window where created_at>=starts and created_at<ends),
   'escalated',(select count(*) from guest_requests,day_window where escalated_at>=starts and escalated_at<ends),
   'openByDepartment',coalesce((select jsonb_object_agg(key,total) from open_requests),'{}'::jsonb)),
 'collections',jsonb_build_object('count',(select count(*) from settled),'total',(select coalesce(sum(amount),0) from settled),
   'byPurpose',coalesce((select jsonb_object_agg(key,total) from (select coalesce(purpose,'unknown') key,count(*) total from settled group by 1) s),'{}'::jsonb),
   'byMethod',coalesce((select jsonb_object_agg(key,total) from (select coalesce(method,'unknown') key,sum(amount) total from settled group by 1) s),'{}'::jsonb)),
 'cashShifts',(select jsonb_build_object('closed',total,'counted',counted,'expected',expected,'variance',variance) from cash),
 'housekeeping',jsonb_build_object('tasksCompleted',(select count(*) from room_care),
   'byType',coalesce((select jsonb_object_agg(key,total) from (select coalesce(task_type,'unknown') key,count(*) total from room_care group by 1) c),'{}'::jsonb),
   'awaitingInspection',(select count(*) from room_care where inspection_status='pending'),
   'avgTurnaroundMinutes',(select round(avg(extract(epoch from (completed_at-started_at))/60))
     from room_care where started_at is not null and completed_at>=started_at)),
 'rooms',coalesce((select jsonb_object_agg(key,total) from (select status key,count(*) total from rooms where administratively_active group by 1) r),'{}'::jsonb),
 'transportation',coalesce((select jsonb_object_agg(key,total) from (select status key,count(*) total from transportation_requests,day_window where created_at>=starts and created_at<ends group by 1) r),'{}'::jsonb),
 'approvals',coalesce((select jsonb_object_agg(key,total) from (select status key,count(*) total from manager_approval_requests,day_window where requested_at>=starts and requested_at<ends group by 1) a),'{}'::jsonb)
);
$$;

create function public.preview_front_desk_daily_report(p_date date)
returns jsonb language sql stable security definer set search_path=public as $$
  select snapshot||jsonb_build_object('previewVersion',md5(snapshot::text),'generatedAt',statement_timestamp())
    from (select front_desk_daily_snapshot(p_date) snapshot) source;
$$;

create function public.submit_front_desk_daily_snapshot(p_date date,p_supersedes uuid,p_actor uuid,p_preview_version text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare snapshot jsonb;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and not recovery_required and role='front_desk') then
    raise exception 'REPORT_SUBMIT_FORBIDDEN';
  end if;
  if p_date is null or p_date>hotel_today(current_operational_policy_snapshot()) then raise exception 'REPORT_DATE_INVALID'; end if;
  snapshot:=front_desk_daily_snapshot(p_date);
  if p_preview_version is distinct from md5(snapshot::text) then raise exception 'REPORT_PREVIEW_CHANGED'; end if;
  return submit_front_desk_report(p_date,snapshot||jsonb_build_object('generatedAt',statement_timestamp()),p_supersedes,p_actor);
end $$;

alter table public.payments add column gateway_reconciled_at timestamptz;

create table public.xendit_payment_reviews (
  payment_id uuid primary key references public.payments(id) on delete restrict,
  reason text not null check (reason in ('session_unknown','capture_after_release')),
  state text not null default 'open' check (state in ('open','resolved')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  reviewed_by uuid references public.user_accounts(id)
);
alter table public.xendit_payment_reviews enable row level security;
revoke all on public.xendit_payment_reviews from public,anon,authenticated;
grant select on public.xendit_payment_reviews to service_role;

create function public.capture_xendit_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.payment_gateway<>'xendit' or new.payment_gateway is null or new.purpose<>'reservation_deposit' then return new; end if;
  if new.gateway_payment_id is not null and new.status<>'paid' and
     (new.status<>'pending_verification' or new.gateway_expires_at<=now() or
      not exists(select 1 from reservations where id=new.reservation_id and status='pending')) then
    insert into xendit_payment_reviews(payment_id,reason) values(new.id,'capture_after_release')
    on conflict(payment_id) do update set reason='capture_after_release',
      opened_at=now(),state='open',resolved_at=null,resolution=null,reviewed_by=null
      where xendit_payment_reviews.reason<>'capture_after_release';
  elsif new.gateway_reference_id is not null or new.gateway_creation_started_at is null or new.status='paid' then
    update xendit_payment_reviews set state='resolved',resolved_at=now(),
      resolution='Provider session recovered or creation definitively rejected'
      where payment_id=new.id and reason='session_unknown' and state='open';
  end if;
  return new;
end $$;
create trigger audit_xendit_capture_review after update of gateway_payment_id,gateway_creation_started_at,gateway_reference_id,status
  on public.payments for each row execute function public.capture_xendit_review();

insert into public.xendit_payment_reviews(payment_id,reason)
select id,'capture_after_release' from public.payments
  where payment_gateway='xendit' and purpose='reservation_deposit' and gateway_payment_id is not null and status<>'paid';

create function public.queue_uncertain_xendit_sessions()
returns void language sql security definer set search_path=public as $$
  insert into xendit_payment_reviews(payment_id,reason)
    select id,'session_unknown' from payments
    where payment_gateway='xendit' and purpose='reservation_deposit' and status<>'paid'
      and gateway_creation_started_at<now()-interval '2 minutes' and gateway_reference_id is null
    on conflict(payment_id) do nothing;
$$;

create function public.mark_xendit_session_uncertain(p_payment uuid)
returns void language sql security definer set search_path=public as $$
  insert into xendit_payment_reviews(payment_id,reason)
    select id,'session_unknown' from payments
    where id=p_payment and payment_gateway='xendit' and status<>'paid'
      and gateway_creation_started_at is not null and gateway_reference_id is null
    on conflict(payment_id) do nothing;
$$;

create function public.resolve_xendit_payment_review(p_payment uuid,p_actor uuid,p_evidence text)
returns void language plpgsql security definer set search_path=public as $$
declare review xendit_payment_reviews%rowtype;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and not recovery_required and role='accounting') then
    raise exception 'ACCOUNTING_AUTHORITY_REQUIRED';
  end if;
  if p_evidence is null or length(trim(p_evidence)) not between 8 and 500 then raise exception 'REVIEW_EVIDENCE_REQUIRED'; end if;
  select * into review from xendit_payment_reviews where payment_id=p_payment for update;
  if not found or review.state<>'open' then raise exception 'PAYMENT_REVIEW_NOT_OPEN'; end if;
  update xendit_payment_reviews set state='resolved',resolution=trim(p_evidence),resolved_at=now(),reviewed_by=p_actor
    where payment_id=p_payment;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'resolve_xendit_payment_review','payment',p_payment::text,jsonb_build_object('reason',review.reason,'evidence',trim(p_evidence)));
end $$;

create function public.guest_xendit_review_status(p_reservation text,p_guest uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from reservations r join payments p on p.reservation_id=r.id
    join xendit_payment_reviews v on v.payment_id=p.id
    where r.id=p_reservation and r.user_id=p_guest and v.state='open');
$$;

revoke all on function public.front_desk_daily_snapshot(date),public.preview_front_desk_daily_report(date),
  public.submit_front_desk_daily_snapshot(date,uuid,uuid,text),public.queue_uncertain_xendit_sessions(),public.mark_xendit_session_uncertain(uuid),
  public.resolve_xendit_payment_review(uuid,uuid,text),public.guest_xendit_review_status(text,uuid)
  from public,anon,authenticated;
grant execute on function public.preview_front_desk_daily_report(date),public.submit_front_desk_daily_snapshot(date,uuid,uuid,text),
  public.queue_uncertain_xendit_sessions(),public.mark_xendit_session_uncertain(uuid),public.resolve_xendit_payment_review(uuid,uuid,text),
  public.guest_xendit_review_status(text,uuid) to service_role;

revoke all on function public.capture_xendit_review() from public,anon,authenticated,service_role;

commit;
