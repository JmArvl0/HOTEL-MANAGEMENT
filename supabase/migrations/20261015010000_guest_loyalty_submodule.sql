-- Guest Loyalty & Rewards submodule.
-- Tiers: silver (0-19999 lifetime spend), gold (20000-49999), platinum (50000+).
-- Points: 1 per PHP 100 settled room total x tier multiplier (1 / 1.25 / 1.5).
-- Redemption: 1 point = PHP 1 folio credit. Ledger is append-only.

alter table public.guests add column if not exists lifetime_spend numeric(12,2) not null default 0;
-- Backfill free-text tiers to the governed set (Member->silver, Silver->silver, Gold->gold).
update public.guests set loyalty_tier = case
  when lower(trim(coalesce(loyalty_tier,''))) = 'gold' then 'gold'
  when lower(trim(coalesce(loyalty_tier,''))) = 'platinum' then 'platinum'
  else 'silver' end
where loyalty_tier is distinct from 'silver' and loyalty_tier is distinct from 'gold' and loyalty_tier is distinct from 'platinum';
alter table public.guests drop constraint if exists guests_loyalty_tier_check;
alter table public.guests add constraint guests_loyalty_tier_check check (loyalty_tier in ('silver','gold','platinum'));

create table if not exists public.guest_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  guest_id text not null references public.guests(id) on delete restrict,
  reservation_id text references public.reservations(id) on delete set null,
  points integer not null check (points <> 0),
  transaction_type text not null check (transaction_type in ('earned','redeemed','adjusted','expired')),
  notes text,
  created_by uuid references public.user_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists guest_loyalty_one_earned_per_stay
  on public.guest_loyalty_ledger(reservation_id) where transaction_type = 'earned' and reservation_id is not null;
create index if not exists guest_loyalty_guest_idx on public.guest_loyalty_ledger(guest_id, created_at desc);
alter table public.guest_loyalty_ledger enable row level security;

create or replace function public.protect_loyalty_ledger() returns trigger language plpgsql as $$
begin raise exception 'LOYALTY_LEDGER_IMMUTABLE'; end$$;
drop trigger if exists loyalty_ledger_immutable on public.guest_loyalty_ledger;
create trigger loyalty_ledger_immutable before update or delete on public.guest_loyalty_ledger
  for each row execute function public.protect_loyalty_ledger();

-- Award on checkout: idempotent per reservation, tier multiplier, auto-upgrade.
create or replace function public.award_stay_loyalty_points(p_reservation_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype; g guests%rowtype; mult numeric; earned integer; new_tier text;
begin
  select * into r from reservations where id=p_reservation_id for update;
  if not found or r.status <> 'checked_out' then raise exception 'LOYALTY_STAY_NOT_COMPLETED'; end if;
  if r.guest_id is null then raise exception 'LOYALTY_NO_GUEST'; end if;
  if exists (select 1 from guest_loyalty_ledger where reservation_id=r.id and transaction_type='earned') then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;
  select * into g from guests where id=r.guest_id for update;
  if not found then raise exception 'LOYALTY_NO_GUEST'; end if;
  mult := case g.loyalty_tier when 'gold' then 1.25 when 'platinum' then 1.5 else 1 end;
  earned := floor(coalesce(r.total,0) / 100 * mult);
  if earned <= 0 then return jsonb_build_object('awarded', false, 'reason', 'no_spend'); end if;
  insert into guest_loyalty_ledger(guest_id,reservation_id,points,transaction_type,notes)
    values(g.id,r.id,earned,'earned','Stay '||r.id||' x'||mult);
  update guests set loyalty_points=coalesce(loyalty_points,0)+earned, lifetime_spend=round(coalesce(lifetime_spend,0)+coalesce(r.total,0),2) where id=g.id;
  select case when coalesce(lifetime_spend,0)+coalesce(r.total,0) >= 50000 then 'platinum'
    when coalesce(lifetime_spend,0)+coalesce(r.total,0) >= 20000 then 'gold' else 'silver' end
    into new_tier from guests where id=g.id;
  -- Never downgrade: tier only moves up.
  update guests set loyalty_tier=new_tier where id=g.id and
    (case loyalty_tier when 'silver' then 0 when 'gold' then 1 else 2 end) < (case new_tier when 'silver' then 0 when 'gold' then 1 else 2 end);
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(null,'loyalty_points_awarded','guest',g.id,jsonb_build_object('reservationId',r.id,'points',earned,'tier',new_tier));
  return jsonb_build_object('awarded', true, 'points', earned, 'tier', new_tier);
end$$;

-- Trigger: award on every checked_out transition (normal + exception checkout).
-- Fail-safe: loyalty must never break checkout.
create or replace function public.award_loyalty_on_checkout() returns trigger language plpgsql
security definer set search_path=public as $$
begin
  if new.status = 'checked_out' and (old.status is distinct from 'checked_out') then
    begin
      perform award_stay_loyalty_points(new.id);
    exception when others then
      insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
        values(null,'loyalty_award_failed','reservation',new.id,jsonb_build_object('error',SQLERRM));
    end;
  end if;
  return new;
end$$;
drop trigger if exists loyalty_award_on_checkout on public.reservations;
create trigger loyalty_award_on_checkout after update on public.reservations
  for each row execute function public.award_loyalty_on_checkout();

-- Redeem: guest spends points for a PHP 1/pt folio credit on an open folio.
create or replace function public.redeem_loyalty_points(p_guest_id text, p_points integer, p_reservation_id text, p_user_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; g guests%rowtype; r reservations%rowtype; i invoices%rowtype; v_amount numeric; v_aid uuid;
begin
  select role into actor from user_accounts where id=p_user_id and active;
  if actor is null or actor <> 'guest' then raise exception 'LOYALTY_REDEEM_FORBIDDEN'; end if;
  if p_points is null or p_points <= 0 then raise exception 'LOYALTY_INVALID_POINTS'; end if;
  if exists (select 1 from financial_adjustments where idempotency_key=p_idempotency_key) then raise exception 'LOYALTY_ALREADY_REDEEMED'; end if;
  select * into g from guests where id=p_guest_id for update;
  if not found then raise exception 'LOYALTY_NO_GUEST'; end if;
  if g.user_account_id is distinct from p_user_id then raise exception 'LOYALTY_NOT_YOUR_POINTS'; end if;
  if coalesce(g.loyalty_points,0) < p_points then raise exception 'LOYALTY_INSUFFICIENT_POINTS'; end if;
  select * into r from reservations where id=p_reservation_id for update;
  if not found or r.guest_id is distinct from p_guest_id then raise exception 'LOYALTY_RESERVATION_MISMATCH'; end if;
  if r.status not in ('pending','confirmed','checked_in') then raise exception 'LOYALTY_FOLIO_CLOSED'; end if;
  select * into i from invoices where reservation_id=r.id for update;
  if not found or i.status = 'cancelled' then raise exception 'LOYALTY_FOLIO_CLOSED'; end if;
  v_amount := least(p_points::numeric, round(i.amount,2));
  if v_amount <= 0 then raise exception 'LOYALTY_NOTHING_TO_DISCOUNT'; end if;
  update guests set loyalty_points=loyalty_points-p_points where id=g.id;
  insert into guest_loyalty_ledger(guest_id,reservation_id,points,transaction_type,notes,created_by)
    values(g.id,r.id,-p_points,'redeemed','Redeemed '||p_points||' pts = PHP '||v_amount||' folio credit',p_user_id);
  insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,created_by,idempotency_key)
    values(i.id,r.id,'credit','credit',v_amount,'Loyalty redemption: '||p_points||' pts',p_user_id,p_idempotency_key) returning id into v_aid;
  update invoices set amount=greatest(round(i.amount-v_amount,2),0) where id=i.id;
  select * into i from sync_invoice_financials(i.id);
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(p_user_id,'loyalty_points_redeemed','guest',g.id,jsonb_build_object('reservationId',r.id,'points',p_points,'creditAmount',v_amount,'adjustmentId',v_aid));
  return jsonb_build_object('pointsRedeemed',p_points,'creditAmount',v_amount,'folioBalance',i.balance,'remainingPoints',g.loyalty_points-p_points);
end$$;

-- Manual adjustment: manager/owner/admin only, reason required.
create or replace function public.adjust_loyalty_points(p_guest_id text, p_points_delta integer, p_reason text, p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; g guests%rowtype;
begin
  select role into actor from user_accounts where id=p_staff_user_id and active;
  if actor is null or actor not in ('manager','owner','admin') then raise exception 'LOYALTY_ADJUST_FORBIDDEN'; end if;
  if p_points_delta is null or p_points_delta = 0 then raise exception 'LOYALTY_INVALID_POINTS'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'LOYALTY_REASON_REQUIRED'; end if;
  select * into g from guests where id=p_guest_id for update;
  if not found then raise exception 'LOYALTY_NO_GUEST'; end if;
  if coalesce(g.loyalty_points,0)+p_points_delta < 0 then raise exception 'LOYALTY_INSUFFICIENT_POINTS'; end if;
  update guests set loyalty_points=loyalty_points+p_points_delta where id=g.id;
  insert into guest_loyalty_ledger(guest_id,points,transaction_type,notes,created_by)
    values(g.id,p_points_delta,'adjusted',trim(p_reason),p_staff_user_id);
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_staff_user_id,'loyalty_points_adjusted','guest',g.id,jsonb_build_object('points',g.loyalty_points),jsonb_build_object('points',g.loyalty_points+p_points_delta,'reason',trim(p_reason)));
  return jsonb_build_object('points',g.loyalty_points+p_points_delta);
end$$;

revoke all on table public.guest_loyalty_ledger from anon, authenticated;
grant all on table public.guest_loyalty_ledger to service_role;
revoke all on function public.award_stay_loyalty_points(text) from public,anon,authenticated;
revoke execute on function public.award_stay_loyalty_points(text) from anon,authenticated;
revoke all on function public.redeem_loyalty_points(text,integer,text,uuid,uuid) from public,anon,authenticated;
revoke execute on function public.redeem_loyalty_points(text,integer,text,uuid,uuid) from anon,authenticated;
revoke all on function public.adjust_loyalty_points(text,integer,text,uuid) from public,anon,authenticated;
revoke execute on function public.adjust_loyalty_points(text,integer,text,uuid) from anon,authenticated;
grant execute on function public.award_stay_loyalty_points(text), public.redeem_loyalty_points(text,integer,text,uuid,uuid), public.adjust_loyalty_points(text,integer,text,uuid) to service_role;
