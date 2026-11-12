import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";
import { updatePhysicalRoom } from "@/lib/room-configuration-route";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardAdmin();
  if (adminGuardFailed(context)) return context;
  return updatePhysicalRoom(request, (await params).id, context);
}
