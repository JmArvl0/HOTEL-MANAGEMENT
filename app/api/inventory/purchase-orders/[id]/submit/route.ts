import { getAuthenticatedSession } from "@/lib/authorization";
import { publicJson } from "@/lib/server-errors";

export async function POST() {
  if (!await getAuthenticatedSession()) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  return publicJson({ error: "Submit new orders to Supply Chain. Existing Hotel orders remain in Hotel Supplies." }, { status: 410 });
}
