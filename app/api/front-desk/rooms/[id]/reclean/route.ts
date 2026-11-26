import { guardManager, managerGuardFailed } from "@/lib/manager-route";
import { canDispatchReclean } from "@/lib/permissions";
import { publicJson } from "@/lib/server-errors";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardManager(canDispatchReclean, "Front Desk or a Manager can dispatch a reclean.");
  if (managerGuardFailed(context)) return context;

  const { id } = await params;
  const { data, error } = await context.client.rpc("hotel_dispatch_reclean", {
    p_actor: context.actorId,
    p_room_id: id,
  });
  if (!error) return publicJson({ data }, { status: data.created ? 201 : 200 });
  if (error.message.includes("ROOM_NOT_FOUND")) return publicJson({ error: "Room not found." }, { status: 404 });
  if (error.message.includes("ROOM_RECLEAN_UNAVAILABLE")) {
    return publicJson({ error: "This room is no longer eligible for a reclean. Refresh Room Management." }, { status: 409 });
  }
  if (error.message.includes("FORBIDDEN")) {
    return publicJson({ error: "You don't have permission to dispatch a reclean." }, { status: 403 });
  }
  return publicJson({ error: "Reclean dispatch is unavailable. Contact Housekeeping for help." }, { status: 503 });
}
