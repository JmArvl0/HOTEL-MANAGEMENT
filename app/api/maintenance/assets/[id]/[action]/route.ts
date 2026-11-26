import { requirePermission } from "@/lib/authorization";
import { publicJson } from "@/lib/server-errors";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const auth = await requirePermission(role => role === "maintenance" || role === "manager", "Equipment history access required.");
  if (auth.error) return auth.error;
  const { action } = await params;
  if (!["update", "deactivate", "record-service"].includes(action)) return publicJson({ error: "Asset action not found." }, { status: 404 });
  return publicJson({ error: "Facilities owns equipment updates. Use the linked Hotel work order to record an existing service." }, { status: 410 });
}
