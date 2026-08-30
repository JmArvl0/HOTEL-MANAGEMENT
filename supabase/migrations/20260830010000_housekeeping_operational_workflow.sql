-- HAVEN Housekeeping provisional operational baseline.
-- Additive extensions only; existing rooms, tasks, reservations, work orders and audit history are preserved.
alter table public.hotel_operational_policies add column if not exists housekeeping_inspection_required boolean not null default true;

alter table public.housekeeping_tasks add column if not exists task_type text not null default 'room_preparation';
alter table public.housekeeping_tasks add column if not exists reservation_id text references public.reservations(id) on delete restrict;
alter table public.housekeeping_tasks add column if not exists guest_request_id uuid references public.guest_requests(id) on delete restrict;
alter table public.housekeeping_tasks add column if not exists source_type text not null default 'manual';
alter table public.housekeeping_tasks add column if not exists source_id text;
alter table public.housekeeping_tasks add column if not exists assigned_user_id uuid references public.user_accounts(id) on delete set null;
alter table public.housekeeping_tasks add column if not exists assigned_by uuid references public.user_accounts(id) on delete set null;
alter table public.housekeeping_tasks add column if not exists assigned_at timestamptz;
alter table public.housekeeping_tasks add column if not exists started_by uuid references public.user_accounts(id) on delete set null;
alter table public.housekeeping_tasks add column if not exists started_at timestamptz;
alter table public.housekeeping_tasks add column if not exists completed_by uuid references public.user_accounts(id) on delete set null;
alter table public.housekeeping_tasks add column if not exists deferred_by uuid references public.user_accounts(id) on delete set null;
alter table public.housekeeping_tasks add column if not exists deferred_at timestamptz;
alter table public.housekeeping_tasks add column if not exists deferred_reason text;
alter table public.housekeeping_tasks add column if not exists checklist jsonb not null default '{}'::jsonb;
alter table public.housekeeping_tasks add column if not exists inspection_status text not null default 'not_required';
alter table public.housekeeping_tasks add column if not exists inspected_by uuid references public.user_accounts(id) on delete set null;
alter table public.housekeeping_tasks add column if not exists inspected_at timestamptz;
alter table public.housekeeping_tasks add column if not exists inspection_reason text;
alter table public.housekeeping_tasks add column if not exists parent_task_id text references public.housekeeping_tasks(id) on delete restrict;
alter table public.housekeeping_tasks add column if not exists idempotency_key uuid;
alter table public.housekeeping_tasks add column if not exists version integer not null default 1;
alter table public.housekeeping_tasks add column if not exists updated_at timestamptz not null default now();

update public.housekeeping_tasks set task_type=case when lower(task)like'%checkout%'then'checkout_cleaning'when lower(task)like'%stayover%'or lower(task)like'%turndown%'then'stayover_cleaning'when lower(task)like'%inspection%'then'inspection'when lower(task)like'%maintenance%'then'maintenance_cleanup'else'room_preparation'end where source_type='manual'and task_type='room_preparation';
update public.housekeeping_tasks set inspection_status='pending'where task_type='inspection'and inspection_status='not_required';

alter table public.housekeeping_tasks drop constraint if exists housekeeping_tasks_status_check;
alter table public.housekeeping_tasks add constraint housekeeping_tasks_status_check check(status in('pending','assigned','in_progress','completed','deferred','cancelled'));
alter table public.housekeeping_tasks add constraint housekeeping_tasks_type_check check(task_type in('checkout_cleaning','stayover_cleaning','guest_request','reclean','inspection','maintenance_cleanup','room_preparation'));
alter table public.housekeeping_tasks add constraint housekeeping_tasks_inspection_check check(inspection_status in('not_required','pending','passed','failed'));
alter table public.housekeeping_tasks add constraint housekeeping_tasks_version_check check(version>0);
create unique index if not exists housekeeping_task_idempotency_unique on public.housekeeping_tasks(idempotency_key)where idempotency_key is not null;
create unique index if not exists housekeeping_task_source_unique on public.housekeeping_tasks(source_type,source_id,task_type)where source_id is not null and status<>'cancelled';
create unique index if not exists housekeeping_one_exclusive_active_per_room on public.housekeeping_tasks(room_id)where status='in_progress';
create index if not exists housekeeping_task_queue_idx on public.housekeeping_tasks(status,priority,created_at);
create index if not exists housekeeping_task_room_history_idx on public.housekeeping_tasks(room_id,created_at desc);

alter table public.rooms drop constraint if exists rooms_housekeeping_check;
alter table public.rooms add constraint rooms_housekeeping_check check(housekeeping in('dirty','cleaning','clean','inspection','reclean_required'));
-- Readiness remains the existing authoritative composite: available + clean + no active maintenance.
-- Inspection and reclean_required are explicit non-ready states, avoiding a second competing room-ready flag.

alter table public.maintenance_orders add column if not exists reported_by uuid references public.user_accounts(id) on delete set null;
alter table public.maintenance_orders add column if not exists housekeeping_task_id text references public.housekeeping_tasks(id) on delete restrict;
alter table public.maintenance_orders add column if not exists source_type text not null default 'manual';
alter table public.maintenance_orders add column if not exists source_id text;
alter table public.maintenance_orders add column if not exists idempotency_key uuid;
create unique index if not exists maintenance_order_source_unique on public.maintenance_orders(source_type,source_id)where source_id is not null and status<>'resolved';
create unique index if not exists maintenance_order_idempotency_unique on public.maintenance_orders(idempotency_key)where idempotency_key is not null;

create table if not exists public.housekeeping_task_assignments(
 id uuid primary key default gen_random_uuid(),task_id text not null references public.housekeeping_tasks(id)on delete restrict,
 previous_user_id uuid references public.user_accounts(id)on delete set null,assigned_user_id uuid not null references public.user_accounts(id)on delete restrict,
 assigned_by uuid not null references public.user_accounts(id)on delete restrict,reason text,assigned_at timestamptz not null default now()
);
create index if not exists housekeeping_assignment_history_idx on public.housekeeping_task_assignments(task_id,assigned_at desc);
alter table public.housekeeping_task_assignments enable row level security;
revoke all on table public.housekeeping_task_assignments from anon,authenticated;
grant all on table public.housekeeping_task_assignments to service_role;

create or replace function public.housekeeping_assign_task(p_task_id text,p_assigned_user_id uuid,p_reason text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;target_role text;t housekeeping_tasks%rowtype;action_name text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_ASSIGNMENT_FORBIDDEN';end if;
 if actor='housekeeping'and p_assigned_user_id<>p_staff_user_id then raise exception'SELF_ASSIGNMENT_ONLY';end if;
 select ua.role into target_role from user_accounts ua where ua.id=p_assigned_user_id and ua.active;if target_role<>'housekeeping'then raise exception'INVALID_HOUSEKEEPING_ASSIGNEE';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;if t.status not in('pending','assigned','deferred')or t.task_type='inspection'then raise exception'TASK_NOT_ASSIGNABLE';end if;
 if actor='housekeeping'and t.assigned_user_id is not null and t.assigned_user_id<>p_staff_user_id then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 if t.assigned_user_id=p_assigned_user_id then return jsonb_build_object('taskId',t.id,'status','assigned','assignedUserId',p_assigned_user_id);end if;
 action_name:=case when t.assigned_user_id is null then'housekeeping_assign_task'else'housekeeping_reassign_task'end;
 insert into housekeeping_task_assignments(task_id,previous_user_id,assigned_user_id,assigned_by,reason)values(t.id,t.assigned_user_id,p_assigned_user_id,p_staff_user_id,nullif(trim(p_reason),''));
 update housekeeping_tasks set status='assigned',assigned_user_id=p_assigned_user_id,assigned_by=p_staff_user_id,assigned_at=now(),version=version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,action_name,'housekeeping_task',t.id,jsonb_build_object('assignedUserId',t.assigned_user_id,'status',t.status),jsonb_build_object('assignedUserId',p_assigned_user_id,'status','assigned','reason',nullif(trim(p_reason),'')));
 return jsonb_build_object('taskId',t.id,'status','assigned','assignedUserId',p_assigned_user_id);end$$;
create or replace function public.housekeeping_start_task(p_task_id text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;
 if t.task_type='inspection'or t.status not in('pending','assigned','deferred')then raise exception'TASK_ALREADY_STARTED';end if;
 if t.assigned_user_id is not null and t.assigned_user_id<>p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 if t.assigned_user_id is null then insert into housekeeping_task_assignments(task_id,assigned_user_id,assigned_by,reason)values(t.id,p_staff_user_id,p_staff_user_id,'Self-assigned when work started');insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_assign_task','housekeeping_task',t.id,jsonb_build_object('assignedUserId',p_staff_user_id,'status','assigned','reason','Self-assigned when work started'));end if;
 if t.room_id is null then raise exception'TASK_ROOM_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended(t.room_id,0));select r.* into room from rooms r where r.id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;
 if t.task_type in('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')and room.status in('occupied','reserved')then raise exception'ROOM_OCCUPIED_FOR_CHECKOUT_CLEANING';end if;
 if t.task_type='stayover_cleaning'and room.status<>'occupied'then raise exception'STAYOVER_REQUIRES_OCCUPIED_ROOM';end if;
 update housekeeping_tasks set status='in_progress',assigned_user_id=coalesce(assigned_user_id,p_staff_user_id),assigned_at=coalesce(assigned_at,now()),started_by=p_staff_user_id,started_at=now(),deferred_by=null,deferred_at=null,deferred_reason=null,version=version+1,updated_at=now()where id=t.id;
 update rooms set housekeeping='cleaning'where id=room.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_start_task','housekeeping_task',t.id,jsonb_build_object('status',t.status,'roomState',room.housekeeping),jsonb_build_object('status','in_progress','roomState','cleaning','roomId',room.id));
 return jsonb_build_object('taskId',t.id,'status','in_progress','roomState','cleaning');exception when unique_violation then raise exception'TASK_ALREADY_STARTED';end$$;

create or replace function public.housekeeping_complete_task(p_task_id text,p_checklist jsonb,p_notes text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;inspection_required boolean;blocked boolean;next_state text;next_room_status text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;if t.status<>'in_progress'then raise exception'TASK_NOT_COMPLETABLE';end if;
 if t.started_by is distinct from p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 select r.* into room from rooms r where r.id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;
 if t.task_type in('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')and room.status in('occupied','reserved')then raise exception'ROOM_STATE_CHANGED';end if;
 select coalesce((select p.housekeeping_inspection_required from hotel_operational_policies p where p.key='default'),true)into inspection_required;select exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))into blocked;
 next_state:=case when room.status='occupied'then'clean'when inspection_required then'inspection'else'clean'end;
 next_room_status:=case when room.status='occupied'then'occupied'when blocked then'maintenance'when room.status in('dirty','maintenance')then'available'else room.status end;
 update housekeeping_tasks set status='completed',completed_at=now(),completed_by=p_staff_user_id,checklist=coalesce(p_checklist,'{}'),notes=concat_ws(E'\n',notes,nullif(trim(p_notes),'')),inspection_status=case when room.status<>'occupied'and inspection_required then'pending'else'not_required'end,version=version+1,updated_at=now()where id=t.id;
 update rooms set housekeeping=next_state,status=next_room_status where id=room.id;
 if next_state='clean'and next_room_status='available'then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_room_ready','room',room.id,jsonb_build_object('taskId',t.id,'inspectionRequired',false));end if;
 if t.guest_request_id is not null then update guest_requests set status='completed'where id=t.guest_request_id and status<>'completed';end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_complete_task','housekeeping_task',t.id,jsonb_build_object('status',t.status,'roomState',room.housekeeping),jsonb_build_object('status','completed','roomState',next_state,'maintenanceBlocked',blocked,'inspectionRequired',inspection_required,'roomId',room.id));
 return jsonb_build_object('taskId',t.id,'status','completed','roomState',next_state,'maintenanceBlocked',blocked);end$$;

create or replace function public.housekeeping_inspect_task(p_task_id text,p_result text,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;blocked boolean;reclean_id text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_INSPECTION_FORBIDDEN';end if;
 if p_result not in('passed','failed')or(p_result='failed'and nullif(trim(p_reason),'')is null)then raise exception'INVALID_INSPECTION_RESULT';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;
 if t.inspection_status<>'pending'or not((t.status='completed')or(t.task_type='inspection'and t.status in('assigned','in_progress')))then raise exception'INSPECTION_ALREADY_RECORDED';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.room_id,0));select r.* into room from rooms r where r.id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if room.status in('occupied','reserved')then raise exception'ROOM_NOT_VACANT_FOR_READINESS';end if;
 select exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))into blocked;
 update housekeeping_tasks set status=case when task_type='inspection'then'completed'else status end,completed_at=case when task_type='inspection'then coalesce(completed_at,now())else completed_at end,completed_by=case when task_type='inspection'then p_staff_user_id else completed_by end,inspection_status=p_result,inspected_by=p_staff_user_id,inspected_at=now(),inspection_reason=nullif(trim(p_reason),''),version=version+1,updated_at=now()where id=t.id;
 if p_result='failed'then
  update rooms set housekeeping='reclean_required',status=case when status='maintenance'then'maintenance'else'dirty'end where id=room.id;
  insert into housekeeping_tasks(room_id,room_number,task,task_type,priority,status,due,notes,source_type,source_id,parent_task_id,idempotency_key)
  values(room.id,room.number,'Reclean after failed inspection','reclean','high','pending','Before next arrival','Inspection failed: '||trim(p_reason),'inspection',t.id,t.id,p_idempotency_key)returning id into reclean_id;
 else
  update rooms set housekeeping='clean',status=case when blocked then'maintenance'when status in('dirty','maintenance')then'available'else status end where id=room.id;
  if not blocked then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_room_ready','room',room.id,jsonb_build_object('taskId',t.id,'inspectionStatus','passed'));end if;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_inspect_task','housekeeping_task',t.id,jsonb_build_object('inspectionStatus',t.inspection_status,'roomState',room.housekeeping),jsonb_build_object('inspectionStatus',p_result,'reason',nullif(trim(p_reason),''),'maintenanceBlocked',blocked,'recleanTaskId',reclean_id));
 return jsonb_build_object('taskId',t.id,'inspectionStatus',p_result,'roomState',case when p_result='failed'then'reclean_required'else'clean'end,'maintenanceBlocked',blocked,'recleanTaskId',reclean_id);exception when unique_violation then raise exception'INSPECTION_ALREADY_RECORDED';end$$;

create or replace function public.housekeeping_defer_task(p_task_id text,p_reason text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'DEFERRAL_REASON_REQUIRED';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found or t.status not in('assigned','in_progress')then raise exception'TASK_NOT_DEFERRABLE';end if;if t.task_type not in('stayover_cleaning','guest_request')then raise exception'CHECKOUT_CLEANING_NOT_DEFERRABLE';end if;
 if t.assigned_user_id is distinct from p_staff_user_id and t.started_by is distinct from p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 select r.* into room from rooms r where r.id=t.room_id for update;update housekeeping_tasks set status='deferred',deferred_by=p_staff_user_id,deferred_at=now(),deferred_reason=trim(p_reason),version=version+1,updated_at=now()where id=t.id;
 if room.status='occupied'then update rooms set housekeeping='clean'where id=room.id and housekeeping='cleaning';end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_defer_task','housekeeping_task',t.id,jsonb_build_object('status',t.status),jsonb_build_object('status','deferred','reason',trim(p_reason)));
 return jsonb_build_object('taskId',t.id,'status','deferred');end$$;

create or replace function public.housekeeping_report_maintenance(p_task_id text,p_category text,p_description text,p_priority text,p_idempotency_key uuid,p_staff_user_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;order_id text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','housekeeping')then raise exception'MAINTENANCE_REPORT_FORBIDDEN';end if;
 if nullif(trim(p_description),'')is null or p_priority not in('normal','high','urgent')then raise exception'INVALID_MAINTENANCE_REPORT';end if;select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found or t.room_id is null then raise exception'TASK_NOT_FOUND';end if;select r.* into room from rooms r where r.id=t.room_id for update;
 insert into maintenance_orders(room_id,room_number,issue,category,priority,status,notes,reported_by,housekeeping_task_id,source_type,source_id,idempotency_key)
 values(room.id,room.number,trim(p_description),nullif(trim(p_category),''),p_priority,'open','Reported during Housekeeping task '||t.id,p_staff_user_id,t.id,'housekeeping_task',p_idempotency_key::text,p_idempotency_key)returning id into order_id;
 if room.status<>'occupied'then update rooms set status='maintenance'where id=room.id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_report_maintenance','maintenance_order',order_id,jsonb_build_object('taskId',t.id,'roomId',room.id,'priority',p_priority,'category',nullif(trim(p_category),'')));
 return order_id;exception when unique_violation then select m.id into order_id from maintenance_orders m where m.idempotency_key=p_idempotency_key limit 1;if order_id is null then raise;end if;return order_id;end$$;

create or replace function public.create_housekeeping_task_for_guest_request()returns trigger language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;task_id text;begin
 if new.department<>'housekeeping'then return new;end if;select rv.* into r from reservations rv where rv.id=new.reservation_id;
 insert into housekeeping_tasks(room_id,room_number,reservation_id,guest_request_id,task,task_type,priority,status,due,notes,source_type,source_id)
 values(r.room_id,r.room_number,r.id,new.id,new.request,'guest_request',case when new.priority in('high','urgent')then new.priority else'normal'end,'pending','Guest requested service','Created from authoritative Guest Request','guest_request',new.id::text)
 on conflict do nothing returning id into task_id;
 if task_id is not null then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'create_housekeeping_task_from_guest_request','housekeeping_task',task_id,jsonb_build_object('guestRequestId',new.id,'reservationId',r.id,'roomId',r.room_id));end if;return new;end$$;
drop trigger if exists guest_request_create_housekeeping_task on public.guest_requests;
create trigger guest_request_create_housekeeping_task after insert on public.guest_requests for each row execute function public.create_housekeeping_task_for_guest_request();

create or replace function public.front_desk_checkout(p_reservation_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;task_id text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','front_desk')then raise exception'CHECKOUT_FORBIDDEN';end if;
 select rv.* into r from reservations rv where rv.id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_CHECKOUT_READY';end if;select inv.* into i from invoices inv where inv.reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'FOLIO_BALANCE_REQUIRED';end if;
 select ra.* into a from reservation_room_assignments ra where ra.reservation_id=r.id and ra.status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
 update reservation_room_assignments set status='completed',released_at=now()where id=a.id;update reservations set status='checked_out',checked_out_at=coalesce(checked_out_at,now())where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=a.room_id;
 insert into housekeeping_tasks(room_id,room_number,reservation_id,task,task_type,priority,status,due,notes,source_type,source_id)
 values(a.room_id,r.room_number,r.id,'Post-checkout room turnover','checkout_cleaning','high','pending','Before next arrival','Automatically created at checkout','checkout',r.id)
 on conflict do nothing returning id into task_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_checkout','reservation',r.id,jsonb_build_object('status',r.status,'room',r.room_number),jsonb_build_object('status','checked_out','roomStatus','dirty','assignmentStatus','completed','housekeepingTaskId',task_id));end$$;

create or replace function public.resolve_maintenance_order(p_order_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;room rooms%rowtype;task_id text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_RESOLUTION_FORBIDDEN';end if;
 select mo.* into m from maintenance_orders mo where mo.id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status='resolved'then return;end if;update maintenance_orders set status='resolved',resolved_at=now()where id=m.id;
 if m.room_id is not null then select r.* into room from rooms r where r.id=m.room_id for update;update rooms set status=case when room.status='occupied'then'occupied'else'dirty'end,housekeeping='dirty'where id=room.id;
  insert into housekeeping_tasks(room_id,room_number,task,task_type,priority,status,due,notes,source_type,source_id)
  values(room.id,room.number,'Post-maintenance clean and readiness check','maintenance_cleanup','normal','pending','Before next arrival','Maintenance resolved; Housekeeping cleanup is required','maintenance_order',m.id)
  on conflict do nothing returning id into task_id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'resolve_maintenance_order','maintenance_order',m.id,jsonb_build_object('roomId',m.room_id,'housekeepingTaskId',task_id));end$$;

-- Compatibility wrapper: callers must still follow the protected in-progress transition.
create or replace function public.complete_housekeeping_task(p_task_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$begin perform housekeeping_complete_task(p_task_id,'{}'::jsonb,null,p_staff_user_id);end$$;

create or replace function public.link_housekeeping_tasks_to_assigned_room()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.room_id is not null and new.room_id is distinct from old.room_id then
  update housekeeping_tasks set room_id=new.room_id,room_number=new.room_number,updated_at=now(),version=version+1 where reservation_id=new.id and room_id is null and status in('pending','assigned','deferred');
 end if;
 return new;
end$$;
drop trigger if exists reservation_link_housekeeping_tasks on public.reservations;
create trigger reservation_link_housekeeping_tasks after update of room_id on public.reservations for each row execute function public.link_housekeeping_tasks_to_assigned_room();
revoke all on function public.housekeeping_assign_task(text,uuid,text,uuid),public.housekeeping_start_task(text,uuid),public.housekeeping_complete_task(text,jsonb,text,uuid),public.housekeeping_inspect_task(text,text,text,uuid,uuid),public.housekeeping_defer_task(text,text,uuid),public.housekeeping_report_maintenance(text,text,text,text,uuid,uuid),public.create_housekeeping_task_for_guest_request(),public.link_housekeeping_tasks_to_assigned_room(),public.front_desk_checkout(text,uuid),public.resolve_maintenance_order(text,uuid),public.complete_housekeeping_task(text,uuid)from public;
grant execute on function public.housekeeping_assign_task(text,uuid,text,uuid),public.housekeeping_start_task(text,uuid),public.housekeeping_complete_task(text,jsonb,text,uuid),public.housekeeping_inspect_task(text,text,text,uuid,uuid),public.housekeeping_defer_task(text,text,uuid),public.housekeeping_report_maintenance(text,text,text,text,uuid,uuid),public.front_desk_checkout(text,uuid),public.resolve_maintenance_order(text,uuid),public.complete_housekeeping_task(text,uuid)to service_role;
