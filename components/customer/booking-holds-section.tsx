import { requestLabel } from "@/lib/request-options";
import { ActiveBookingHolds } from "@/components/customer/active-booking-holds";
import { getActiveGuestHolds } from "@/lib/booking";
import { formatStayRange } from "@/lib/customer";
import { formatHotelDateTime } from "@/lib/format";
import { getOperationalPolicy } from "@/lib/hotel-policy";

export async function BookingHoldsSection({ userId }: { userId: string }) {
  const holds = await getActiveGuestHolds(userId);
  if (!holds.length) return null;
  const policy = await getOperationalPolicy();
  return <ActiveBookingHolds holds={holds.map((hold) => ({
    preferences: [...(Array.isArray(hold.request_options) ? hold.request_options.map((value: string) => requestLabel(value)) : []), ...(hold.special_requests ? [String(hold.special_requests)] : []), ...(hold.transportation_preferences ? ["Transportation requested"] : [])],
    token: hold.token,
    roomType: hold.room_type,
    roomNumber: hold.selected_room_number,
    dates: formatStayRange(hold.check_in, hold.check_out),
    expiresAt: hold.expires_at,
    expiryLabel: formatHotelDateTime(hold.expires_at, policy.hotelTimezone),
  }))} />;
}
