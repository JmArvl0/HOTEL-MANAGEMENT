import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { canEditGuestProfile, canViewGuestContact } from "@/lib/permissions";
import { getStaffGuestProfile } from "@/lib/staff-data";
import { hotelGuard } from "@/lib/hotel-operations-route";
import { normalizePhone } from "@/lib/input-validation";
import { validationBody } from "@/lib/errors";

// The dossier is assembled from the existing role-aware operational reads.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!canViewGuestContact(session.user.role)) return publicJson({ error: "You don't have permission to perform this action. Ask your system administrator if you need access." }, { status: 403 });
  try {
    const record = await getStaffGuestProfile((await params).id, session.user.role);
    return record ? publicJson({ data: record }) : publicJson({ error: "Guest not found" }, { status: 404 });
  } catch {
    return publicJson({ error: "Unable to load guest profile" }, { status: 500 });
  }
}

const expectedProfile = z.object({ phone: z.string().nullable(), address: z.string().nullable(), preferences: z.string().nullable() }).strict();
const editProfile = z.object({
  expected: expectedProfile,
  phone: z.string().max(40),
  address: z.string().trim().max(400),
  preferences: z.string().trim().max(1000),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await hotelGuard(canEditGuestProfile);
  if (context instanceof NextResponse) return context;
  const parsed = editProfile.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Review the profile fields and try again." }), { status: 400 });
  const edit = parsed.data;
  const unchangedPhone = edit.phone === (edit.expected.phone ?? "");
  const phone = unchangedPhone ? edit.expected.phone : normalizePhone(edit.phone);
  if (!unchangedPhone && edit.phone.trim() && phone === null) return publicJson({ error: "Enter a valid phone number." }, { status: 400 });
  const { error } = await context.client.rpc("hotel_staff_edit_guest_profile", {
    p_actor: context.actor, p_guest_id: (await params).id, p_expected: edit.expected,
    p_phone: phone, p_address: edit.address || null, p_preferences: edit.preferences || null,
  });
  if (error?.message.includes("GUEST_PROFILE_CHANGED")) return publicJson({ error: "This profile changed. Reload it before saving.", code: "GUEST_PROFILE_CHANGED" }, { status: 409 });
  if (error?.message.includes("GUEST_NOT_FOUND")) return publicJson({ error: "Guest profile not found." }, { status: 404 });
  if (error) return publicJson({ error: "The guest profile could not be saved. Try again." }, { status: 503 });
  return publicJson({ ok: true });
}
