import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";
import { updatePhysicalRoom } from "@/lib/room-configuration-route";
// Same RPC as the Owner/Admin governance route (app/api/admin/rooms/[id]) — all
// authority and every guard live in admin_update_room_metadata, so the two paths
// cannot drift. Room number is absent by design: it is permanent once created.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardCatalog();
  if (adminGuardFailed(context)) return context;
  return updatePhysicalRoom(request, (await params).id, context);
}
