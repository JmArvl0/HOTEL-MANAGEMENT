-- HAVEN Maintenance operational workflow.
-- Additive only: existing work orders and cross-department history are preserved.

alter table public.maintenance_orders add column if not exists reservation_id text references public.reservations(id) on delete restrict;
alter table public.maintenance_orders add column if not exists guest_request_id uuid references public.guest_requests(id) on delete restrict;
alter table public.maintenance_orders add column if not exists target_type text not null default 'room';
alter table public.maintenance_orders add column if not exists target_label text;
alter table public.maintenance_orders add column if not exists assigned_user_id uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists assigned_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists assigned_at timestamptz;
alter table public.maintenance_orders add column if not exists started_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists started_at timestamptz;
alter table public.maintenance_orders add column if not exists diagnosis text;
alter table public.maintenance_orders add column if not exists severity text not null default 'normal';
alter table public.maintenance_orders add column if not exists serviceability_impact text;
alter table public.maintenance_orders add column if not exists serviceability_reason text;
alter table public.maintenance_orders add column if not exists serviceability_decided_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists serviceability_decided_at timestamptz;
alter table public.maintenance_orders add column if not exists parts_required boolean not null default false;
alter table public.maintenance_orders add column if not exists parts_status text not null default 'none';
alter table public.maintenance_orders add column if not exists external_service_required boolean not null default false;
alter table public.maintenance_orders add column if not exists estimated_completion timestamptz;
alter table public.maintenance_orders add column if not exists waiting_reason text;
alter table public.maintenance_orders add column if not exists resolution text;
alter table public.maintenance_orders add column if not exists resolved_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists cleanup_required boolean not null default false;
alter table public.maintenance_orders add column if not exists completed_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists completed_at timestamptz;
alter table public.maintenance_orders add column if not exists cancelled_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists cancelled_at timestamptz;
alter table public.maintenance_orders add column if not exists cancellation_reason text;
alter table public.maintenance_orders add column if not exists version integer not null default 1;
alter table public.maintenance_orders add column if not exists updated_at timestamptz not null default now();

-- Preserve the previous conservative behavior for already-open legacy work. New reports await a
-- Maintenance diagnosis and therefore default to serviceable instead of silently blocking a room.
update public.maintenance_orders set serviceability_impact=case when status in('open','in_progress')then'blocked'else'serviceable'end where serviceability_impact is null;
alter table public.maintenance_orders alter column serviceability_impact set default 'serviceable';
alter table public.maintenance_orders alter column serviceability_impact set not null;
alter table public.maintenance_orders drop constraint if exists maintenance_orders_status_check;
alter table public.maintenance_orders add constraint maintenance_orders_status_check check(status in('open','assigned','in_progress','waiting_parts','deferred','resolved','completed','cancelled'));
alter table public.maintenance_orders drop constraint if exists maintenance_orders_priority_check;
alter table public.maintenance_orders add constraint maintenance_orders_priority_check check(priority in('low','normal','high','urgent','critical'));
alter table public.maintenance_orders add constraint maintenance_orders_target_type_check check(target_type in('room','equipment','facility'));
alter table public.maintenance_orders add constraint maintenance_orders_severity_check check(severity in('low','normal','high','critical'));
alter table public.maintenance_orders add constraint maintenance_orders_serviceability_check check(serviceability_impact in('serviceable','blocked','out_of_service'));
alter table public.maintenance_orders add constraint maintenance_orders_parts_status_check check(parts_status in('none','required','ordered','available'));
alter table public.maintenance_orders add constraint maintenance_orders_version_check check(version>0);
create index if not exists maintenance_queue_idx on public.maintenance_orders(status,priority,created_at);
create index if not exists maintenance_room_history_idx on public.maintenance_orders(room_id,created_at desc);
create index if not exists maintenance_serviceability_idx on public.maintenance_orders(room_id,serviceability_impact,status);
create unique index if not exists maintenance_guest_request_unique on public.maintenance_orders(guest_request_id) where guest_request_id is not null;

create table if not exists public.maintenance_order_events(
 id uuid primary key default gen_random_uuid(),
 order_id text not null references public.maintenance_orders(id) on delete restrict,
 event_type text not null,
 from_status text,
 to_status text,
 note text,
 metadata jsonb not null default '{}'::jsonb,
 actor_user_id uuid references public.user_accounts(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists maintenance_event_history_idx on public.maintenance_order_events(order_id,created_at desc);
alter table public.maintenance_order_events enable row level security;

create table if not exists public.maintenance_order_assignments(
 id uuid primary key default gen_random_uuid(),
 order_id text not null references public.maintenance_orders(id) on delete restrict,
 assigned_user_id uuid not null references public.user_accounts(id) on delete restrict,
 assigned_by uuid references public.user_accounts(id) on delete set null,
 assigned_at timestamptz not null default now(),
 released_at timestamptz,
 release_reason text
);
create unique index if not exists maintenance_one_active_assignment on public.maintenance_order_assignments(order_id) where released_at is null;
alter table public.maintenance_order_assignments enable row level security;

create or replace function public.maintenance_room_is_blocked(p_room_id text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.maintenance_orders m where m.room_id=p_room_id and m.status in('open','assigned','in_progress','waiting_parts','deferred') and m.serviceability_impact in('blocked','out_of_service'))
$$;

create or replace function public.maintenance_restore_room_state(p_room_id text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_room_id is null or public.maintenance_room_is_blocked(p_room_id) then return;end if;
 update rooms set status=case when status='maintenance' then case when housekeeping='clean'then'available'else'dirty'end else status end where id=p_room_id;
end$$;

create or replace function public.maintenance_create_work_order(p_room_id text,p_target_type text,p_target_label text,p_category text,p_description text,p_priority text,p_reservation_id text,p_guest_request_id uuid,p_source_type text,p_source_id text,p_idempotency_key uuid,p_staff_user_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare actor text;room rooms%rowtype;order_id text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor not in('owner','admin','front_desk','maintenance')then raise exception'MAINTENANCE_REPORT_FORBIDDEN';end if;
 if nullif(trim(p_description),'')is null or p_priority not in('low','normal','high','urgent','critical')or coalesce(p_target_type,'room')not in('room','equipment','facility')then raise exception'INVALID_MAINTENANCE_REPORT';end if;
 if p_room_id is not null then select * into room from rooms where id=p_room_id or number=p_room_id limit 1;if not found then raise exception'ROOM_NOT_FOUND';end if;end if;
 if p_guest_request_id is not null and not exists(select 1 from guest_requests where id=p_guest_request_id and department='maintenance')then raise exception'INVALID_GUEST_REQUEST';end if;
 insert into maintenance_orders(room_id,room_number,reservation_id,guest_request_id,target_type,target_label,issue,category,priority,status,serviceability_impact,reported_by,source_type,source_id,idempotency_key)
 values(room.id,room.number,p_reservation_id,p_guest_request_id,coalesce(p_target_type,'room'),coalesce(nullif(trim(p_target_label),''),room.number),trim(p_description),nullif(trim(p_category),''),p_priority,'open','serviceable',p_staff_user_id,coalesce(nullif(trim(p_source_type),''),'manual'),nullif(trim(p_source_id),''),p_idempotency_key)returning id into order_id;
 insert into maintenance_order_events(order_id,event_type,to_status,note,actor_user_id,metadata)values(order_id,'reported','open',trim(p_description),p_staff_user_id,jsonb_build_object('sourceType',coalesce(p_source_type,'manual'),'roomId',room.id));
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'maintenance_create_work_order','maintenance_order',order_id,jsonb_build_object('roomId',room.id,'priority',p_priority,'sourceType',coalesce(p_source_type,'manual')));
 return order_id;
exception when unique_violation then
 select id into order_id from maintenance_orders where idempotency_key=p_idempotency_key or(p_guest_request_id is not null and guest_request_id=p_guest_request_id)or(p_source_id is not null and source_type=p_source_type and source_id=p_source_id)limit 1;
 if order_id is null then raise;end if;return order_id;
end$$;

create or replace function public.maintenance_assign_work_order(p_order_id text,p_assigned_user_id uuid,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;target_role text;m maintenance_orders%rowtype;target uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;
 target:=coalesce(p_assigned_user_id,p_staff_user_id);select role into target_role from user_accounts where id=target and active;if target_role is null or(target_role<>'maintenance'and target_role not in('owner','admin'))then raise exception'INVALID_MAINTENANCE_ASSIGNEE';end if;if actor='maintenance'and target<>p_staff_user_id then raise exception'CANNOT_ASSIGN_ANOTHER_TECHNICIAN';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('open','assigned','deferred','waiting_parts')then raise exception'WORK_ORDER_NOT_ASSIGNABLE';end if;
 update maintenance_order_assignments set released_at=now(),release_reason='Reassigned'where order_id=m.id and released_at is null and assigned_user_id<>target;
 insert into maintenance_order_assignments(order_id,assigned_user_id,assigned_by)values(m.id,target,p_staff_user_id)on conflict do nothing;
 update maintenance_orders set assigned_user_id=target,assigned_by=p_staff_user_id,assigned_at=now(),assignee=(select name from user_accounts where id=target),status=case when status='open'then'assigned'else status end,version=version+1,updated_at=now()where id=m.id;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,actor_user_id,metadata)values(m.id,'assigned',m.status,case when m.status='open'then'assigned'else m.status end,p_staff_user_id,jsonb_build_object('assignedUserId',target));
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_assign_work_order','maintenance_order',m.id,jsonb_build_object('assignedUserId',m.assigned_user_id),jsonb_build_object('assignedUserId',target));return jsonb_build_object('id',m.id,'status',case when m.status='open'then'assigned'else m.status end,'assignedUserId',target);
end$$;

create or replace function public.maintenance_start_work_order(p_order_id text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('assigned','deferred','waiting_parts')then raise exception'WORK_ORDER_NOT_STARTABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;
 update maintenance_orders set status='in_progress',started_by=coalesce(started_by,p_staff_user_id),started_at=coalesce(started_at,now()),waiting_reason=null,version=version+1,updated_at=now()where id=m.id;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,actor_user_id)values(m.id,'started',m.status,'in_progress',p_staff_user_id);insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_start_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status','in_progress'));return jsonb_build_object('id',m.id,'status','in_progress');
end$$;

create or replace function public.maintenance_record_diagnosis(p_order_id text,p_diagnosis text,p_severity text,p_serviceability_impact text,p_serviceability_reason text,p_parts_required boolean,p_parts_status text,p_external_service_required boolean,p_estimated_completion timestamptz,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;room rooms%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;
 if nullif(trim(p_diagnosis),'')is null or p_severity not in('low','normal','high','critical')or p_serviceability_impact not in('serviceable','blocked','out_of_service')or(p_serviceability_impact<>'serviceable'and nullif(trim(p_serviceability_reason),'')is null)or p_parts_status not in('none','required','ordered','available')then raise exception'INVALID_DIAGNOSIS';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('assigned','in_progress','waiting_parts','deferred')then raise exception'WORK_ORDER_NOT_DIAGNOSABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;
 if m.room_id is not null then perform pg_advisory_xact_lock(hashtextextended(m.room_id,0));select * into room from rooms where id=m.room_id for update;end if;
 update maintenance_orders set diagnosis=trim(p_diagnosis),severity=p_severity,serviceability_impact=p_serviceability_impact,serviceability_reason=nullif(trim(p_serviceability_reason),''),serviceability_decided_by=p_staff_user_id,serviceability_decided_at=now(),parts_required=coalesce(p_parts_required,false),parts_status=p_parts_status,external_service_required=coalesce(p_external_service_required,false),estimated_completion=p_estimated_completion,version=version+1,updated_at=now()where id=m.id;
 if m.room_id is not null and p_serviceability_impact in('blocked','out_of_service')and room.status not in('occupied','reserved')then update rooms set status='maintenance'where id=room.id;elsif m.room_id is not null and p_serviceability_impact='serviceable'then perform maintenance_restore_room_state(m.room_id);end if;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'diagnosis',m.status,m.status,trim(p_diagnosis),p_staff_user_id,jsonb_build_object('severity',p_severity,'serviceabilityImpact',p_serviceability_impact,'partsStatus',p_parts_status));insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_record_diagnosis','maintenance_order',m.id,jsonb_build_object('serviceabilityImpact',m.serviceability_impact),jsonb_build_object('serviceabilityImpact',p_serviceability_impact,'severity',p_severity));return jsonb_build_object('id',m.id,'status',m.status,'serviceabilityImpact',p_serviceability_impact);
end$$;

create or replace function public.maintenance_defer_work_order(p_order_id text,p_status text,p_reason text,p_parts_status text,p_estimated_completion timestamptz,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;if p_status not in('waiting_parts','deferred')or nullif(trim(p_reason),'')is null or p_parts_status not in('none','required','ordered','available')then raise exception'INVALID_DEFERMENT';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status<>'in_progress'then raise exception'WORK_ORDER_NOT_DEFERABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;
 update maintenance_orders set status=p_status,waiting_reason=trim(p_reason),parts_status=p_parts_status,parts_required=parts_required or p_status='waiting_parts',estimated_completion=p_estimated_completion,notes=concat_ws(E'\n',notes,trim(p_reason)),version=version+1,updated_at=now()where id=m.id;insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'deferred',m.status,p_status,trim(p_reason),p_staff_user_id,jsonb_build_object('partsStatus',p_parts_status,'estimatedCompletion',p_estimated_completion));insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_defer_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status',p_status,'reason',trim(p_reason)));return jsonb_build_object('id',m.id,'status',p_status);
end$$;

create or replace function public.maintenance_add_progress(p_order_id text,p_note text,p_parts_status text,p_estimated_completion timestamptz,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;if nullif(trim(p_note),'')is null or p_parts_status not in('none','required','ordered','available')then raise exception'INVALID_PROGRESS_UPDATE';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('in_progress','waiting_parts','deferred')then raise exception'WORK_ORDER_NOT_ACTIVE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;update maintenance_orders set notes=concat_ws(E'\n',notes,trim(p_note)),parts_status=p_parts_status,estimated_completion=coalesce(p_estimated_completion,estimated_completion),version=version+1,updated_at=now()where id=m.id;insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'progress',m.status,m.status,trim(p_note),p_staff_user_id,jsonb_build_object('partsStatus',p_parts_status,'estimatedCompletion',p_estimated_completion));return jsonb_build_object('id',m.id,'status',m.status);end$$;

create or replace function public.maintenance_resolve_work_order(p_order_id text,p_resolution text,p_cleanup_required boolean,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;room rooms%rowtype;cleanup_id text;cleanup_type text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_RESOLUTION_FORBIDDEN';end if;if nullif(trim(p_resolution),'')is null then raise exception'RESOLUTION_REQUIRED';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('in_progress','waiting_parts','deferred')then raise exception'WORK_ORDER_NOT_RESOLVABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;if nullif(trim(m.diagnosis),'')is null then raise exception'DIAGNOSIS_REQUIRED';end if;
 if m.room_id is not null then perform pg_advisory_xact_lock(hashtextextended(m.room_id,0));select * into room from rooms where id=m.room_id for update;end if;
 update maintenance_orders set status='resolved',resolution=trim(p_resolution),resolved_by=p_staff_user_id,resolved_at=now(),cleanup_required=coalesce(p_cleanup_required,false),serviceability_impact='serviceable',serviceability_reason='Technical repair resolved',version=version+1,updated_at=now()where id=m.id;
 if m.guest_request_id is not null then update guest_requests set status='completed'where id=m.guest_request_id and status<>'completed';end if;
 if m.room_id is not null and coalesce(p_cleanup_required,false)then cleanup_type:=case when room.status='occupied'then'stayover_cleaning'else'maintenance_cleanup'end;insert into housekeeping_tasks(room_id,room_number,task,task_type,priority,status,due,notes,reservation_id,guest_request_id,source_type,source_id)values(room.id,room.number,'Post-maintenance cleanup',cleanup_type,case when m.priority in('urgent','critical')then'high'else'normal'end,'pending','Before room readiness','Repair resolved: '||trim(p_resolution),m.reservation_id,null,'maintenance_order',m.id)returning id into cleanup_id;update rooms set housekeeping='dirty',status=case when status='occupied'then'occupied'when status='reserved'then'reserved'else'dirty'end where id=room.id;elsif m.room_id is not null then perform maintenance_restore_room_state(m.room_id);end if;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'resolved',m.status,'resolved',trim(p_resolution),p_staff_user_id,jsonb_build_object('cleanupRequired',coalesce(p_cleanup_required,false),'cleanupTaskId',cleanup_id));insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_resolve_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status,'serviceabilityImpact',m.serviceability_impact),jsonb_build_object('status','resolved','cleanupRequired',coalesce(p_cleanup_required,false),'cleanupTaskId',cleanup_id));return jsonb_build_object('id',m.id,'status','resolved','cleanupRequired',coalesce(p_cleanup_required,false),'cleanupTaskId',cleanup_id);
end$$;

create or replace function public.resolve_maintenance_order(p_order_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$begin raise exception'USE_MAINTENANCE_RESOLUTION_WORKFLOW';end$$;

create or replace function public.maintenance_close_work_order(p_order_id text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status<>'resolved'then raise exception'WORK_ORDER_NOT_CLOSABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;update maintenance_orders set status='completed',completed_by=p_staff_user_id,completed_at=now(),version=version+1,updated_at=now()where id=m.id;insert into maintenance_order_events(order_id,event_type,from_status,to_status,actor_user_id)values(m.id,'closed','resolved','completed',p_staff_user_id);insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_close_work_order','maintenance_order',m.id,jsonb_build_object('status','resolved'),jsonb_build_object('status','completed'));return jsonb_build_object('id',m.id,'status','completed');end$$;

create or replace function public.maintenance_cancel_work_order(p_order_id text,p_reason text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'CANCELLATION_REASON_REQUIRED';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('open','assigned','deferred','waiting_parts')then raise exception'WORK_ORDER_NOT_CANCELLABLE';end if;if actor='maintenance'and m.assigned_user_id is not null and m.assigned_user_id<>p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;update maintenance_orders set status='cancelled',cancelled_by=p_staff_user_id,cancelled_at=now(),cancellation_reason=trim(p_reason),version=version+1,updated_at=now()where id=m.id;update maintenance_order_assignments set released_at=now(),release_reason='Work order cancelled'where order_id=m.id and released_at is null;perform maintenance_restore_room_state(m.room_id);insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id)values(m.id,'cancelled',m.status,'cancelled',trim(p_reason),p_staff_user_id);insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_cancel_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status','cancelled','reason',trim(p_reason)));return jsonb_build_object('id',m.id,'status','cancelled');end$$;

-- Housekeeping reports an observed issue; only Maintenance diagnosis can block the room.
create or replace function public.housekeeping_report_maintenance(p_task_id text,p_category text,p_description text,p_priority text,p_idempotency_key uuid,p_staff_user_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;order_id text;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','housekeeping')then raise exception'MAINTENANCE_REPORT_FORBIDDEN';end if;if nullif(trim(p_description),'')is null or p_priority not in('normal','high','urgent')then raise exception'INVALID_MAINTENANCE_REPORT';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found or t.room_id is null then raise exception'TASK_NOT_FOUND';end if;select * into room from rooms where id=t.room_id for update;insert into maintenance_orders(room_id,room_number,issue,category,priority,status,serviceability_impact,notes,reported_by,housekeeping_task_id,source_type,source_id,idempotency_key)values(room.id,room.number,trim(p_description),nullif(trim(p_category),''),p_priority,'open','serviceable','Reported during Housekeeping task '||t.id,p_staff_user_id,t.id,'housekeeping_task',p_idempotency_key::text,p_idempotency_key)returning id into order_id;insert into maintenance_order_events(order_id,event_type,to_status,note,actor_user_id,metadata)values(order_id,'reported','open',trim(p_description),p_staff_user_id,jsonb_build_object('housekeepingTaskId',t.id,'roomId',room.id));insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_report_maintenance','maintenance_order',order_id,jsonb_build_object('taskId',t.id,'roomId',room.id,'priority',p_priority));return order_id;exception when unique_violation then select id into order_id from maintenance_orders where idempotency_key=p_idempotency_key limit 1;if order_id is null then raise;end if;return order_id;end$$;

create or replace function public.create_maintenance_for_guest_request() returns trigger language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;begin if new.department<>'maintenance'then return new;end if;if new.reservation_id is not null then select * into r from reservations where id=new.reservation_id;end if;insert into maintenance_orders(room_id,room_number,reservation_id,guest_request_id,target_type,target_label,issue,category,priority,status,serviceability_impact,source_type,source_id)values(r.room_id,r.room_number,new.reservation_id,new.id,'room',r.room_number,new.request,'Guest request',case when new.priority in('low','normal','high','urgent','critical')then new.priority else'normal'end,'open','serviceable','guest_request',new.id::text)on conflict(guest_request_id)where guest_request_id is not null do nothing;return new;end$$;
drop trigger if exists guest_request_create_maintenance on public.guest_requests;
create trigger guest_request_create_maintenance after insert or update of department on public.guest_requests for each row when(new.department='maintenance')execute function public.create_maintenance_for_guest_request();

-- Keep Housekeeping readiness transitions aligned with technical serviceability.
create or replace function public.housekeeping_complete_task(p_task_id text,p_checklist jsonb,p_notes text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;inspection_required boolean;blocked boolean;next_state text;next_room_status text;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;if t.status<>'in_progress'then raise exception'TASK_NOT_COMPLETABLE';end if;if t.started_by is distinct from p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;select * into room from rooms where id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if t.task_type in('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')and room.status in('occupied','reserved')then raise exception'ROOM_STATE_CHANGED';end if;select coalesce((select housekeeping_inspection_required from hotel_operational_policies where key='default'),true)into inspection_required;blocked:=maintenance_room_is_blocked(room.id);next_state:=case when room.status='occupied'then'clean'when inspection_required then'inspection'else'clean'end;next_room_status:=case when room.status='occupied'then'occupied'when blocked then'maintenance'when room.status in('dirty','maintenance')then'available'else room.status end;update housekeeping_tasks set status='completed',completed_at=now(),completed_by=p_staff_user_id,checklist=coalesce(p_checklist,'{}'),notes=concat_ws(E'\n',notes,nullif(trim(p_notes),'')),inspection_status=case when room.status<>'occupied'and inspection_required then'pending'else'not_required'end,version=version+1,updated_at=now()where id=t.id;update rooms set housekeeping=next_state,status=next_room_status where id=room.id;if t.guest_request_id is not null then update guest_requests set status='completed'where id=t.guest_request_id and status<>'completed';end if;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_complete_task','housekeeping_task',t.id,jsonb_build_object('status',t.status),jsonb_build_object('status','completed','maintenanceBlocked',blocked));return jsonb_build_object('taskId',t.id,'status','completed','roomState',next_state,'maintenanceBlocked',blocked);end$$;

-- Lock workflow tables and RPCs to the server service role.
revoke all on table public.maintenance_order_events,public.maintenance_order_assignments from public,anon,authenticated;
grant all on table public.maintenance_order_events,public.maintenance_order_assignments to service_role;
revoke all on function public.maintenance_room_is_blocked(text),public.maintenance_restore_room_state(text),public.maintenance_create_work_order(text,text,text,text,text,text,text,uuid,text,text,uuid,uuid),public.maintenance_assign_work_order(text,uuid,uuid),public.maintenance_start_work_order(text,uuid),public.maintenance_record_diagnosis(text,text,text,text,text,boolean,text,boolean,timestamptz,uuid),public.maintenance_defer_work_order(text,text,text,text,timestamptz,uuid),public.maintenance_add_progress(text,text,text,timestamptz,uuid),public.maintenance_resolve_work_order(text,text,boolean,uuid),public.maintenance_close_work_order(text,uuid),public.maintenance_cancel_work_order(text,text,uuid),public.create_maintenance_for_guest_request() from public,anon,authenticated;
grant execute on function public.maintenance_room_is_blocked(text),public.maintenance_restore_room_state(text),public.maintenance_create_work_order(text,text,text,text,text,text,text,uuid,text,text,uuid,uuid),public.maintenance_assign_work_order(text,uuid,uuid),public.maintenance_start_work_order(text,uuid),public.maintenance_record_diagnosis(text,text,text,text,text,boolean,text,boolean,timestamptz,uuid),public.maintenance_defer_work_order(text,text,text,text,timestamptz,uuid),public.maintenance_add_progress(text,text,text,timestamptz,uuid),public.maintenance_resolve_work_order(text,text,boolean,uuid),public.maintenance_close_work_order(text,uuid),public.maintenance_cancel_work_order(text,text,uuid) to service_role;
revoke all on function public.resolve_maintenance_order(text,uuid),public.housekeeping_report_maintenance(text,text,text,text,uuid,uuid),public.housekeeping_complete_task(text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_maintenance_order(text,uuid),public.housekeeping_report_maintenance(text,text,text,text,uuid,uuid),public.housekeeping_complete_task(text,jsonb,text,uuid) to service_role;
