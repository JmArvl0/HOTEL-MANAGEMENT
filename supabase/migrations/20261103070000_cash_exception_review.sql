-- Investigation metadata only: never rewrites cash payments or assigns historical drawers.
create table public.cash_exception_reviews (
 payment_id uuid primary key references public.payments(id),
 note text not null check(length(note) between 3 and 1000),
 reviewed_by uuid not null references public.user_accounts(id),
 reviewed_at timestamptz not null default now(), version integer not null default 1
);
alter table public.cash_exception_reviews enable row level security;
revoke all on public.cash_exception_reviews from public,anon,authenticated;
grant select on public.cash_exception_reviews to service_role;
create function public.review_cash_exception(p_actor uuid,p_payment uuid,p_note text,p_version integer)
returns void language plpgsql security definer set search_path=public as $$
declare prior cash_exception_reviews%rowtype;
begin
 if not exists(select 1 from user_accounts where id=p_actor and active and role='accounting') then raise exception 'RECONCILIATION_FORBIDDEN'; end if;
 if length(trim(coalesce(p_note,''))) not between 3 and 1000 then raise exception 'REASON_REQUIRED'; end if;
 perform 1 from payments where id=p_payment and method='cash' and status='paid' and cash_shift_id is null for update;
 if not found then raise exception 'CASH_EXCEPTION_NOT_FOUND'; end if;
 select * into prior from cash_exception_reviews where payment_id=p_payment;
 if coalesce(prior.version,0)<>p_version then raise exception 'CASH_EXCEPTION_STALE'; end if;
 insert into cash_exception_reviews(payment_id,note,reviewed_by) values(p_payment,trim(p_note),p_actor)
 on conflict(payment_id) do update set note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=now(),version=cash_exception_reviews.version+1;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'cash_exception_reviewed','payment',p_payment::text,jsonb_build_object('note',trim(p_note),'version',coalesce(prior.version,0)+1));
end$$;
revoke all on function public.review_cash_exception(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.review_cash_exception(uuid,uuid,text,integer) to service_role;
