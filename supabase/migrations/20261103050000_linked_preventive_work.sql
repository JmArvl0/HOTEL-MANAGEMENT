create table public.maintenance_asset_work (
 order_id text primary key references public.maintenance_orders(id),
 asset_id uuid not null references public.maintenance_assets(id),
 due_date date, created_by uuid not null references public.user_accounts(id),
 created_at timestamptz not null default now(), serviced_at date,
 service_note text, serviced_by uuid references public.user_accounts(id)
);
alter table public.maintenance_asset_work enable row level security;
revoke all on public.maintenance_asset_work from public,anon,authenticated;
grant select on public.maintenance_asset_work to service_role;

create function public.create_asset_work(p_actor uuid,p_asset uuid,p_technician uuid)
returns text language plpgsql security definer set search_path=public as $$
declare actor text; a maintenance_assets%rowtype; existing_id text; order_id text; technician_name text;
begin
 select role into actor from user_accounts where id=p_actor and active;
 if actor is null or actor not in('manager','maintenance') then raise exception 'ASSET_REGISTRY_FORBIDDEN'; end if;
 if actor='maintenance' and p_technician<>p_actor then raise exception 'MAINTENANCE_ASSIGN_FORBIDDEN'; end if;
 select name into technician_name from user_accounts where id=p_technician and active and role='maintenance';
 if not found then raise exception 'TECHNICIAN_REQUIRED'; end if;
 select * into a from maintenance_assets where id=p_asset and active for update;
 if not found then raise exception 'ASSET_NOT_FOUND'; end if;
 select w.order_id into existing_id from maintenance_asset_work w join maintenance_orders m on m.id=w.order_id
 where w.asset_id=a.id and w.serviced_at is null and m.status<>'cancelled' limit 1;
 if found then return existing_id; end if;
 insert into maintenance_orders(room_id,room_number,target_type,target_label,issue,category,priority,status,serviceability_impact,reported_by,source_type,source_id,assigned_user_id,assignee,assigned_by,assigned_at)
 values(a.room_id,coalesce((select number from rooms where id=a.room_id),a.location,a.name),'equipment',a.name,'Preventive service: '||a.name,a.category,'normal','assigned','serviceable',p_actor,'preventive_asset',a.id::text,p_technician,technician_name,p_actor,now()) returning id into order_id;
 insert into maintenance_asset_work(order_id,asset_id,due_date,created_by) values(order_id,a.id,a.next_service_date,p_actor);
 insert into maintenance_order_events(order_id,event_type,to_status,note,actor_user_id,metadata) values(order_id,'assigned','assigned','Preventive asset service',p_actor,jsonb_build_object('assetId',a.id,'assignedUserId',p_technician));
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'create_asset_work','maintenance_order',order_id,jsonb_build_object('assetId',a.id,'assignedUserId',p_technician));
 return order_id;
end$$;

create function public.record_linked_asset_service(p_actor uuid,p_order text,p_date date,p_note text)
returns date language plpgsql security definer set search_path=public as $$
declare actor text; w maintenance_asset_work%rowtype; m maintenance_orders%rowtype; a maintenance_assets%rowtype; next_date date;
begin
 select role into actor from user_accounts where id=p_actor and active;
 if actor is null or actor not in('manager','maintenance') then raise exception 'ASSET_REGISTRY_FORBIDDEN'; end if;
 select * into w from maintenance_asset_work where order_id=p_order;
 if not found then raise exception 'ASSET_WORK_NOT_FOUND'; end if;
 select * into a from maintenance_assets where id=w.asset_id for update;
 select * into m from maintenance_orders where id=p_order for update;
 if actor='maintenance' and m.assigned_user_id is distinct from p_actor then raise exception 'MAINTENANCE_ASSIGN_FORBIDDEN'; end if;
 select * into w from maintenance_asset_work where order_id=p_order for update;
 if w.serviced_at is not null then
  if w.serviced_at<>p_date then raise exception 'SERVICE_ALREADY_RECORDED'; end if;
  return w.serviced_at+a.service_interval_days;
 end if;
 if m.status<>'completed' then raise exception 'SERVICE_WORK_NOT_COMPLETED'; end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Manila')::date or p_date<(w.created_at at time zone 'Asia/Manila')::date or p_date<coalesce(a.last_serviced_at,p_date) or length(coalesce(p_note,''))>500 then raise exception 'INVALID_SERVICE_DATE'; end if;
 if not a.active then raise exception 'ASSET_INACTIVE'; end if;
 update maintenance_asset_work set serviced_at=p_date,service_note=nullif(trim(p_note),''),serviced_by=p_actor where order_id=p_order;
 next_date:=maintenance_record_asset_service(p_actor,a.id,p_date,p_note);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'record_linked_asset_service','maintenance_asset',a.id::text,jsonb_build_object('orderId',p_order,'serviceDate',p_date,'nextServiceDate',next_date));
 return next_date;
end$$;

-- Registry edits cannot advance a service schedule while linked work remains unfinished.
create function public.guard_asset_service_work() returns trigger language plpgsql as $$
begin
 if new.last_serviced_at is distinct from old.last_serviced_at and exists(
  select 1 from maintenance_asset_work w join maintenance_orders m on m.id=w.order_id
  where w.asset_id=old.id and w.serviced_at is null and m.status<>'cancelled'
 ) then raise exception 'SERVICE_WORK_NOT_COMPLETED'; end if;
 return new;
end$$;
create trigger asset_service_work_guard before update on public.maintenance_assets for each row execute function public.guard_asset_service_work();
revoke all on function public.create_asset_work(uuid,uuid,uuid),public.record_linked_asset_service(uuid,text,date,text) from public,anon,authenticated;
grant execute on function public.create_asset_work(uuid,uuid,uuid),public.record_linked_asset_service(uuid,text,date,text) to service_role;
