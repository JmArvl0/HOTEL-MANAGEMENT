import { BedDouble, Clock3, Coins, Luggage } from "lucide-react";
import { publicDepositLabel, publicHotelTime, type PublicBookingInformation } from "@/lib/public-booking-information";

export function policySnapshotItems({ deposit, operations: policy }: PublicBookingInformation) {
  const amount = publicDepositLabel(deposit);
  const checkIn = publicHotelTime(policy.checkInTime);
  const checkOut = publicHotelTime(policy.checkOutTime);
  return [
    { icon: Coins, title: deposit.enabled ? `${amount} deposit` : "Online deposits unavailable", description: deposit.enabled ? "Required to confirm your reservation." : "Contact Front Desk for assistance.", label: deposit.enabled ? "Deposit required" : "Online deposits unavailable", detail: deposit.enabled ? deposit.calculationType === "percentage" ? `${amount} of the total stay.` : `${amount} per reservation.` : "Contact Front Desk for assistance." },
    { icon: Clock3, title: `${deposit.holdMinutes}-minute room hold`, description: "After you submit guest details.", label: "Room hold", detail: `${deposit.holdMinutes} minutes after you submit guest details.` },
    { icon: BedDouble, title: `Check-in ${checkIn}`, description: `Rooms are ready from ${checkIn} (${policy.hotelTimezone}).` },
    { icon: Luggage, title: `Check-out ${checkOut}`, description: `Please check out by ${checkOut} (${policy.hotelTimezone}).` },
  ];
}

export function BookingPolicySnapshot({ information }: { information: PublicBookingInformation }) {
  return <section className="booking-policy-snapshot" aria-labelledby="policy-snapshot-title">
    <h2 id="policy-snapshot-title">Policy <span>Snapshot</span></h2>
    <ul role="list">{policySnapshotItems(information).map(({ icon: Icon, title: label, description }) => <li key={label}>
      <Icon size={34} strokeWidth={1.5} aria-hidden="true" />
      <div><h3>{label}</h3><p>{description}</p></div>
    </li>)}</ul>
  </section>;
}
