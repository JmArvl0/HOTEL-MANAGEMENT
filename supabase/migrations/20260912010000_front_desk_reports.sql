-- Centralized Daily Front Desk Operations Report.
-- Front desk submits one immutable snapshot per hotel day; the manager
-- acknowledges or returns it. The snapshot column is never updated by any
-- RPC - evidence stays exactly as submitted.

create table if not exists public.front_desk_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  snapshot jsonb not null,
  submitted_by uuid not null references public.user_accounts(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','acknowledged','returned')),
  reviewed_by uuid references public.user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  supersedes uuid references public.front_desk_reports(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one live (submitted) report per hotel day; a returned report frees the
-- date for a resubmission that references it via supersedes.
create unique index if not exists front_desk_reports_one_live_per_date
  on public.front_desk_reports(report_date) where status='submitted';

create index if not exists front_desk_reports_status_date_idx
  on public.front_desk_reports(status, report_date desc);

alter table public.front_desk_reports enable row level security;
revoke all on table public.front_desk_reports from anon, authenticated;

-- Front desk submits the day's operational snapshot. The snapshot is built
-- server-side by the API route; this function only stores it.
create or replace function public.submit_front_desk_report(p_report_date date, p_snapshot jsonb, p_supersedes uuid, p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor text;
  prior public.front_desk_reports%rowtype;
  report_id uuid;
begin
  select role into actor from public.user_accounts where id=p_staff_user_id;
  if actor is null or actor<>'front_desk' then raise exception'REPORT_SUBMIT_FORBIDDEN'; end if;
  if p_report_date is null or p_snapshot is null or p_report_date>public.hotel_today() then raise exception'REPORT_DATE_INVALID'; end if;
  if p_supersedes is not null then
    select * into prior from public.front_desk_reports where id=p_supersedes for update;
    if prior.id is null or prior.status<>'returned' or prior.report_date<>p_report_date then raise exception'REPORT_SUPERSEDES_INVALID'; end if;
  end if;
  insert into public.front_desk_reports(report_date,snapshot,submitted_by,supersedes)
    values(p_report_date,p_snapshot,p_staff_user_id,p_supersedes)
    returning id into report_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)values(
    p_staff_user_id,
    case when p_supersedes is null then 'submit_front_desk_report' else 'resubmit_front_desk_report' end,
    'front_desk_report',report_id::text,
    jsonb_build_object('reportDate',p_report_date,'supersedes',p_supersedes));
  return jsonb_build_object('id',report_id,'reportDate',p_report_date,'status','submitted');
end$$;

-- Manager reviews a submitted report: acknowledge closes it, return sends it
-- back to front desk with a required note for resubmission.
create or replace function public.review_front_desk_report(p_report_id uuid, p_decision text, p_note text, p_expected_version integer, p_manager_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor text;
  r public.front_desk_reports%rowtype;
begin
  select role into actor from public.user_accounts where id=p_manager_user_id;
  if actor is null or actor<>'manager' then raise exception'REPORT_REVIEW_FORBIDDEN'; end if;
  if p_decision not in('acknowledge','return') then raise exception'REPORT_DECISION_INVALID'; end if;
  if p_decision='return' and coalesce(btrim(p_note),'')='' then raise exception'REPORT_NOTE_REQUIRED'; end if;
  select * into r from public.front_desk_reports where id=p_report_id for update;
  if r.id is null then raise exception'REPORT_NOT_FOUND'; end if;
  if r.status<>'submitted' or r.version<>p_expected_version then raise exception'REPORT_ALREADY_REVIEWED'; end if;
  update public.front_desk_reports set
    status=case when p_decision='acknowledge' then 'acknowledged' else 'returned' end,
    reviewed_by=p_manager_user_id,
    reviewed_at=now(),
    review_note=case when p_decision='return' then btrim(p_note) else null end,
    version=r.version+1,
    updated_at=now()
  where id=r.id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(
    p_manager_user_id,'review_front_desk_report','front_desk_report',r.id::text,
    jsonb_build_object('status',r.status,'version',r.version),
    jsonb_build_object('status',case when p_decision='acknowledge' then 'acknowledged' else 'returned' end,'note',btrim(coalesce(p_note,''))));
  return jsonb_build_object('id',r.id,'status',case when p_decision='acknowledge' then 'acknowledged' else 'returned' end,'version',r.version+1);
end$$;

revoke all on function public.submit_front_desk_report(date,jsonb,uuid,uuid) from public;
revoke all on function public.review_front_desk_report(uuid,text,text,integer,uuid) from public;
grant execute on function public.submit_front_desk_report(date,jsonb,uuid,uuid),public.review_front_desk_report(uuid,text,text,integer,uuid) to service_role;
