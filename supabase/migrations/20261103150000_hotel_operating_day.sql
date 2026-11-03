-- Scoped operational clock. Real-time reservation/security clocks remain untouched.
begin;
alter table hotel_operational_policies add column operating_date date;
alter table hotel_operational_policies add column operating_version integer not null default 0;
alter table hotel_operational_policies add column operating_activated_at timestamptz;
create table public.hotel_night_audits(
 business_date date primary key,snapshot jsonb not null,closed_by uuid not null references user_accounts(id),
 closed_at timestamptz not null default clock_timestamp(),idempotency_key uuid not null unique);
create function public.hotel_immutable_close() returns trigger language plpgsql set search_path=public as $$begin raise exception 'CLOSED_DAY_IMMUTABLE';end$$;
create trigger hotel_immutable_close before update or delete on hotel_night_audits for each row execute function hotel_immutable_close();

create function public.hotel_lock_operating_day() returns date language plpgsql security definer set search_path=public as $$
declare day date;begin
 select operating_date into day from hotel_operational_policies where key='default' for share;return day;
end$$;
create function public.hotel_posting_lock() returns trigger language plpgsql security definer set search_path=public as $$begin perform hotel_lock_operating_day();return null;end$$;
create function public.hotel_posting_stamp() returns trigger language plpgsql security definer set search_path=public as $$
declare day date;posting boolean:=true;begin
 day:=hotel_lock_operating_day();
 if tg_op='UPDATE' and old.operating_date is not null then
  if new.operating_date is distinct from old.operating_date then raise exception 'POSTING_DATE_IMMUTABLE';end if;return new;
 end if;
 if tg_table_name='payments' then posting:=new.status='paid';
 elsif tg_table_name='refund_requests' then posting:=new.status='processed';end if;
 -- Existing pre-cutover rows keep NULL until a previously-unposted event settles.
 if tg_op='UPDATE' and tg_table_name not in('payments','refund_requests') then new.operating_date:=old.operating_date;return new;end if;
 if tg_op='UPDATE' and ((tg_table_name='payments' and old.status='paid') or (tg_table_name='refund_requests' and old.status='processed')) then new.operating_date:=old.operating_date;return new;end if;
 new.operating_date:=case when posting then day else null end;return new;
end$$;
do $$declare name text;begin
 foreach name in array array['payments','folio_charges','financial_adjustments','refund_requests','invoices'] loop
  execute format('alter table %I add column operating_date date',name);
  execute format('create trigger hotel_posting_lock before insert or update or delete on %I for each statement execute function hotel_posting_lock()',name);
  execute format('create trigger zz_hotel_posting_stamp before insert or update on %I for each row execute function hotel_posting_stamp()',name);
 end loop;
end$$;
-- Acquire the operating-date lock before RPC entity locks. Statement gates and
-- stamps additionally cover direct server-side writes and trigger-originated events.
do $$declare fn record;patched text;begin
 for fn in select p.oid,pg_get_functiondef(p.oid) definition,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and l.lanname='plpgsql' and (p.proname not like 'hotel_%' or p.proname='hotel_fee_post')
 and p.prosrc ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public\.)?(payments|invoices|folio_charges|financial_adjustments|refund_requests)\M'
 loop
  patched:=regexp_replace(fn.prosrc,'\mbegin\M',E'begin\n perform public.hotel_lock_operating_day();','i');
  if patched=fn.prosrc then raise exception 'POSTING_LOCK_BODY_UNEXPECTED: %',fn.oid::regprocedure;end if;
  execute replace(fn.definition,fn.prosrc,patched);
 end loop;
end$$;

create function public.hotel_operating_day(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p hotel_operational_policies%rowtype;begin
 perform hotel_actor(p_actor,array['front_desk','accounting','manager','owner','housekeeping','maintenance']);
 select * into p from hotel_operational_policies where key='default';
 return jsonb_build_object('active',p.operating_date is not null,'businessDate',p.operating_date,'calendarDate',hotel_today(),
 'timezone',p.hotel_timezone,'version',p.operating_version,'activatedAt',p.operating_activated_at,'lagging',p.operating_date<hotel_today());
end$$;
create function public.hotel_operating_day_activate(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform hotel_actor(p_actor,array['accounting']);
 perform 1 from hotel_operational_policies where key='default' for update;
 update hotel_operational_policies set operating_date=hotel_today(),operating_version=operating_version+1,operating_activated_at=now() where key='default' and operating_date is null;
 if found then insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'operating_day_activate','hotel_policy','default',hotel_operating_day(p_actor));end if;
 return hotel_operating_day(p_actor);
end$$;

-- Booked room accrual uses contracted frozen nights; early checkout alone never
-- changes the contracted price. Cancellations/no-shows have no room-night accrual;
-- their existing obligations/refunds stay in the ledger. Adjustments stay separate.
create function public.hotel_daily_metrics(p_day date) returns jsonb language sql stable security definer set search_path=public as $$
 with stays as (
  select r.* from reservations r where r.check_in<=p_day and r.check_out>p_day
   and (r.status in('confirmed','checked_in') or (r.status='checked_out' and p_day<hotel_today()))
 ), rates as (
  select r.id,(select (n->>'rate')::numeric from jsonb_array_elements(coalesce(r.nightly_rates,'[]')) n where coalesce(n->>'date',n->>'night')=p_day::text limit 1) amount from stays r
 ), receipts as (
  select coalesce(sum(amount) filter(where purpose<>'refund'),0) received,coalesce(sum(amount) filter(where purpose='refund'),0) refunded from payments where status='paid' and operating_date=p_day
 ), reconciliation as (
  select i.id from invoices i left join lateral (
   select greatest(coalesce(sum(case when purpose='refund' then -amount else amount end),0),0) net from payments where invoice_id=i.id and status='paid'
  ) p on true where i.paid is distinct from least(round(p.net,2),round(i.amount,2))
    or i.balance is distinct from greatest(round(i.amount-p.net,2),0)
    or i.credit_balance is distinct from greatest(round(p.net-i.amount,2),0)
 )
 select jsonb_build_object('date',p_day,'basis','booked_frozen_nights_and_posted_ledger','capacityBasis','closing_active_inventory',
  'bookedNights',(select count(*) from stays),'liveOccupiedRooms',(select count(*) from rooms where status='occupied'),
  'capacity',(select count(*) from rooms where coalesce(administratively_active,true)),
  'serviceableCapacity',(select count(*) from rooms where coalesce(administratively_active,true) and status<>'maintenance' and not maintenance_room_is_blocked(id)),
  'roomAccrual',case when exists(select 1 from rates where amount is null) then null else coalesce((select sum(amount) from rates),0) end,
  'missingRates',coalesce((select jsonb_agg(id) from rates where amount is null),'[]'),
  'received',(select received from receipts),'refunds',(select refunded from receipts),'netReceipts',(select received-refunded from receipts),
  'preCutoverPayments',(select count(*) from payments where status='paid' and operating_date is null),
  'assessedCharges',coalesce((select sum(amount) from folio_charges where operating_date=p_day),0),
  'adjustments',coalesce((select sum(case when direction='debit' then amount else -amount end) from financial_adjustments where operating_date=p_day),0),
  'outstanding',coalesce((select sum(balance) from invoices where status not in('cancelled','refund_pending')),0),
  'unreconciledInvoices',coalesce((select jsonb_agg(id) from reconciliation),'[]'));
$$;
create function public.hotel_night_audit_preview(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;p hotel_operational_policies%rowtype;metrics jsonb;blockers jsonb:='[]';warnings jsonb:='[]';item record;begin
 actor:=hotel_actor(p_actor,array['front_desk','accounting','manager','owner']);select * into p from hotel_operational_policies where key='default';
 if p.operating_date is null then return jsonb_build_object('active',false,'calendarDate',hotel_today(),'blockers',jsonb_build_array(jsonb_build_object('code','OPERATING_DAY_NOT_ACTIVE')),'warnings','[]'::jsonb);end if;
 for item in select id,status,check_in,check_out from reservations where
  (status in('pending','confirmed') and check_in<=p.operating_date and (status<>'pending' or lower(coalesce(source,''))<>'website' or payment_due_at is null or payment_due_at>now())) or
  (status='checked_in' and check_out<=p.operating_date)
 loop blockers:=blockers||jsonb_build_array(jsonb_build_object('code',case when item.status='checked_in' then 'UNRESOLVED_DEPARTURE' else 'UNRESOLVED_ARRIVAL' end,'reservationId',item.id));end loop;
 if exists(select 1 from cash_shifts where status='open') then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','OPEN_CASH_SHIFT'));end if;
 if exists(select 1 from cash_shifts where status='closed' and reconciled_at is null) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','UNRECONCILED_CASH_SHIFT'));end if;
 metrics:=hotel_daily_metrics(p.operating_date);
 if p.operating_date>=hotel_today() then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','CALENDAR_DAY_STILL_OPEN'));end if;
 if (now() at time zone p.hotel_timezone)<(p.operating_date+coalesce(p.no_show_cutoff_time,'23:59'::time)) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','CLOSE_CUTOFF_NOT_REACHED'));end if;
 if jsonb_array_length(metrics->'unreconciledInvoices')>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','LEDGER_RECONCILIATION_REQUIRED'));end if;
 if jsonb_array_length(metrics->'missingRates')>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','FROZEN_RATES_REQUIRED'));end if;
 if exists(select 1 from housekeeping_tasks where inspection_status='pending') then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','PENDING_INSPECTIONS'));end if;
 if exists(select 1 from hotel_handovers where not archived and status<>'resolved') then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','OPEN_HANDOVER_WORK'));end if;
 return jsonb_build_object('active',true,'businessDate',p.operating_date,'calendarDate',hotel_today(),'timezone',p.hotel_timezone,'version',p.operating_version,'assessedAt',clock_timestamp(),
 'blockers',blockers,'warnings',warnings,'metrics',case when actor in('accounting','manager','owner') then metrics else null end,
 'recentCloses',case when actor in('accounting','manager','owner') then coalesce((select jsonb_agg(to_jsonb(c)) from (select * from hotel_night_audits order by business_date desc limit 30)c),'[]'::jsonb) else '[]'::jsonb end);
end$$;
create function public.hotel_night_audit_close(p_date date,p_version integer,p_key uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p hotel_operational_policies%rowtype;preview jsonb;result jsonb;previous hotel_night_audits%rowtype;begin
 perform hotel_actor(p_actor,array['accounting']);
 select * into p from hotel_operational_policies where key='default' for update;
 select * into previous from hotel_night_audits where idempotency_key=p_key;
 if found then if previous.business_date<>p_date or previous.closed_by<>p_actor then raise exception 'IDEMPOTENCY_CONFLICT';end if;return to_jsonb(previous);end if;
 if p.operating_date is null or p.operating_date<>p_date or p.operating_version<>p_version then raise exception 'STALE_OPERATING_DAY';end if;
 if p_date>=hotel_today() then raise exception 'CALENDAR_DAY_STILL_OPEN';end if;
 -- Today's day cannot be closed before its no-show cutoff; a lagging day may.
 if (now() at time zone p.hotel_timezone)<(p_date+coalesce(p.no_show_cutoff_time,'23:59'::time)) then raise exception 'CLOSE_CUTOFF_NOT_REACHED';end if;
 -- Freeze operational assessment inputs too. Never wait while holding the date
 -- lock: an existing writer may already be waiting for that lock. A busy table
 -- means retry the close after that operation finishes, with no partial snapshot.
 begin
  lock table reservations,rooms,cash_shifts,maintenance_orders,housekeeping_tasks,hotel_handovers in share mode nowait;
 exception when lock_not_available then raise exception 'OPERATIONS_CHANGED_RETRY';
 end;
 preview:=hotel_night_audit_preview(p_actor);
 if jsonb_array_length(preview->'blockers')>0 then raise exception 'NIGHT_AUDIT_BLOCKERS';end if;
 insert into hotel_night_audits(business_date,snapshot,closed_by,idempotency_key) values(p_date,preview->'metrics',p_actor,p_key) returning to_jsonb(hotel_night_audits.*) into result;
 update hotel_operational_policies set operating_date=operating_date+1,operating_version=operating_version+1 where key='default';
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'night_audit_close','operating_day',p_date::text,result);
 return result;
end$$;
alter table hotel_night_audits enable row level security;
revoke all on hotel_night_audits from public,anon,authenticated;
grant select,insert on hotel_night_audits to service_role;
do $$declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hotel_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end$$;
commit;
