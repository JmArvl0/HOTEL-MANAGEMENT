begin;

-- Match My Stay and staff requests by copying checkout's saved bag count into
-- the pickup profile before the outbox snapshots the ride details.
create or replace function public.trigger_file_booking_transportation() returns trigger
language plpgsql security definer set search_path=public as $$
declare ride_id uuid; profile jsonb;
begin
 if lower(coalesce(new.source,''))='website' and new.status='confirmed'
  and (old is null or old.status is distinct from 'confirmed') then
  begin
   ride_id:=public.file_booking_transportation_request(new.id);
   if ride_id is not null and new.transportation_preferences #> '{fleetOptions,sharingEnabled}' = 'true'::jsonb then
    profile:=jsonb_build_object(
      'travelerName',new.guest_name,
      'phone',new.transportation_preferences #>> '{fleetOptions,contactPhone}',
      'sharingEnabled',true,
      'ridePreferences',coalesce(new.transportation_preferences #> '{fleetOptions,ridePreferences}','[]'::jsonb),
      'luggageCount',coalesce(new.transportation_preferences #> '{fleetOptions,luggageCount}','0'::jsonb));
    perform public.queue_guest_fleet_transport(new.user_id,ride_id,profile);
   end if;
  exception when others then
   raise warning 'Transportation filing for reservation % failed (%).',new.id,sqlstate;
  end;
 end if;
 return new;
end;
$$;

commit;
