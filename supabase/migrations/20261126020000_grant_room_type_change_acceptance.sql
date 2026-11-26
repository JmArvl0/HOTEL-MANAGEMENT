-- The server-side acceptance route invokes this RPC as service_role.
grant execute on function public.record_room_type_change_acceptance(uuid, uuid) to service_role;
