import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hotelToday } from "@/lib/booking";
import { canViewGuestContact } from "@/lib/permissions";
import { getStaffGuestDirectory } from "@/lib/staff-data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewGuestContact(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ data: await getStaffGuestDirectory(hotelToday()) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load the guest directory." }, { status: 503 });
  }
}
