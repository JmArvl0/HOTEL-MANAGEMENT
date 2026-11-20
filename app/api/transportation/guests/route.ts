import { z } from "zod";
import { hotelToday } from "@/lib/booking";
import { canOperateTransportation } from "@/lib/permissions";
import { publicJson } from "@/lib/server-errors";
import { getHotelTransferLabel } from "@/lib/transportation";
import { guardTransportation, transportationGuardFailed } from "@/lib/transportation-route";

export async function GET(request: Request) {
  const context = await guardTransportation(canOperateTransportation);
  if (transportationGuardFailed(context)) return context;
  const search = z.string().trim().min(2).max(100).safeParse(new URL(request.url).searchParams.get("name"));
  if (!search.success) return publicJson({ error: "Enter at least two characters from the guest’s name." }, { status: 400 });

  const { client } = context;
  const pattern = search.data.replace(/[\\%_*]/g, "\\$&");
  const { data: guests, error } = await client.from("user_accounts").select("id,name,phone")
    .eq("role", "guest").eq("active", true).eq("account_status", "active")
    .ilike("name", `%${pattern}%`).order("name").limit(25);
  if (error) return publicJson({ error: "Unable to find guest accounts." }, { status: 503 });
  const today = hotelToday();
  const hotelLabel = await getHotelTransferLabel();
  if (!guests.length) return publicJson({ data: [], hotelLabel, today });
  const { data: stays, error: stayError } = await client.from("reservations")
    .select("id,user_id,guest_name,confirmation_number,room_type,check_in,check_out,guests,guest_profile:guests(phone)")
    .in("user_id", guests.map(guest => guest.id)).in("status", ["confirmed", "checked_in"])
    .gte("check_out", today).order("check_in").limit(30);
  if (stayError) return publicJson({ error: "Unable to find confirmed guest stays." }, { status: 503 });
  return publicJson({ hotelLabel, today, data: stays.map(({ user_id, guest_name, guest_profile, ...stay }) => {
    const account = guests.find(guest => guest.id === user_id);
    const guest = (Array.isArray(guest_profile) ? guest_profile[0] : guest_profile) as { phone?: string } | null;
    return { ...stay, passenger: { name: guest_name || account?.name || "", phone: guest?.phone || account?.phone || "" } };
  }) });
}
