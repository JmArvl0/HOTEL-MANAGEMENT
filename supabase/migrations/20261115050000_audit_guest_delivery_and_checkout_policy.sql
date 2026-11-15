begin;

create table public.guest_email_deliveries (
  event_key text primary key,
  state text not null check (state in ('sending','sent','failed','skipped')),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  provider_id text,
  failure_code text
);
alter table public.guest_email_deliveries enable row level security;
revoke all on public.guest_email_deliveries from public,anon,authenticated,service_role;

create function public.claim_guest_email_delivery(p_key text,p_retry boolean)
returns integer language plpgsql security definer set search_path=public as $$
declare attempt int;
begin
  if p_key is null or length(p_key) not between 4 and 150 then raise exception 'INVALID_EMAIL_EVENT_KEY'; end if;
  insert into guest_email_deliveries(event_key,state) values(p_key,'sending')
  on conflict(event_key) do update set state='sending',attempts=guest_email_deliveries.attempts+1,changed_at=now()
  where p_retry and guest_email_deliveries.attempts<3 and guest_email_deliveries.created_at>now()-interval '23 hours'
    and (guest_email_deliveries.state in ('failed','skipped')
      or (guest_email_deliveries.state='sending' and guest_email_deliveries.changed_at<now()-interval '2 minutes'))
  returning attempts into attempt;
  return attempt;
end $$;

create function public.finish_guest_email_delivery(p_key text,p_attempt integer,p_state text,p_provider_id text,p_failure text)
returns void language sql security definer set search_path=public as $$
  update guest_email_deliveries set state=p_state,changed_at=now(),provider_id=left(p_provider_id,120),failure_code=left(p_failure,80)
   where event_key=p_key and attempts=p_attempt and state='sending' and p_state in ('sent','failed','skipped');
$$;

-- A new online hold always has a payable deposit. Existing historical rows and
-- frozen policy snapshots are kept in place.
create function public.booking_require_payable_hold()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.total<=0 or new.deposit_required<=0 then raise exception 'DEPOSIT_AMOUNT_UNAVAILABLE'; end if;
  return new;
end $$;
create trigger audit_booking_payable_hold before insert on public.booking_holds
  for each row execute function public.booking_require_payable_hold();

create function public.require_positive_online_deposit()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.key='online_reservation' and new.enabled and
    (case new.calculation_type when 'percentage' then coalesce(new.percentage_basis_points,0)<=0
      else coalesce(new.fixed_amount,0)<=0 end) then raise exception 'DEPOSIT_AMOUNT_UNAVAILABLE'; end if;
  return new;
end $$;
create trigger audit_positive_online_deposit before insert or update of enabled,calculation_type,percentage_basis_points,fixed_amount
  on public.reservation_deposit_policies for each row execute function public.require_positive_online_deposit();

revoke all on function public.claim_guest_email_delivery(text,boolean),
  public.finish_guest_email_delivery(text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_guest_email_delivery(text,boolean),
  public.finish_guest_email_delivery(text,integer,text,text,text) to service_role;

commit;
