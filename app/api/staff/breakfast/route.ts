import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { breakfastService } from "@/lib/breakfast-service";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending || !["front_desk", "manager"].includes(session.user.role)) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }
  return breakfastService(request, { staff: session.user.id });
}
