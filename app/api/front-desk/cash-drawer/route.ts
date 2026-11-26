import { getCashDrawerLedger } from "@/lib/accounting";
import { guardFailed, guardFinancial } from "@/lib/financial-route";
import { publicJson } from "@/lib/server-errors";

export async function GET() {
  const context = await guardFinancial(role => role === "front_desk", "Front Desk drawer access required.");
  if (guardFailed(context)) return context;
  try {
    return publicJson({ data: await getCashDrawerLedger(context.actorId) });
  } catch {
    return publicJson({ error: "Unable to load the cash drawer. Refresh and try again." }, { status: 503 });
  }
}
