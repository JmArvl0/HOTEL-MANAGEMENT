-- Stay-gated guest reviews: one review per completed stay.
-- A guest may review only a reservation they own whose status is
-- checked_out. The UNIQUE on reservation_id is the "1 review per stay"
-- backstop; the RPC enforces ownership and stay completion first.

create table if not exists public.stay_reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null references public.reservations(id) on delete cascade,
  user_id uuid references public.user_accounts(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists stay_reviews_reservation_unique
  on public.stay_reviews(reservation_id);
create index if not exists stay_reviews_created_idx
  on public.stay_reviews(created_at desc);

alter table public.stay_reviews enable row level security;

create or replace function public.customer_submit_stay_review(
  p_user_id uuid, p_reservation_id text, p_rating integer, p_comment text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_comment text;
  v_id uuid;
begin
  select id, user_id, status into r from reservations where id = p_reservation_id;
  if r.id is null or r.user_id is distinct from p_user_id then
    raise exception 'NOT_BOOKED';
  end if;
  if r.status is null or r.status <> 'checked_out' then
    raise exception 'STAY_NOT_COMPLETED';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_REVIEW';
  end if;
  v_comment := btrim(coalesce(p_comment, ''));
  if char_length(v_comment) < 10 or char_length(v_comment) > 1000 then
    raise exception 'INVALID_REVIEW';
  end if;
  if exists (select 1 from stay_reviews where reservation_id = p_reservation_id) then
    raise exception 'ALREADY_REVIEWED';
  end if;
  insert into stay_reviews(reservation_id, user_id, rating, comment)
    values (p_reservation_id, p_user_id, p_rating, v_comment)
    returning id into v_id;
  insert into audit_logs(user_id, action, entity_type, entity_id, after_data)
    values (p_user_id, 'customer_submit_stay_review', 'stay_review', p_reservation_id,
      jsonb_build_object('rating', p_rating));
  return jsonb_build_object('id', v_id);
end$$;

revoke all on function public.customer_submit_stay_review(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.customer_submit_stay_review(uuid, text, integer, text)
  to service_role;
