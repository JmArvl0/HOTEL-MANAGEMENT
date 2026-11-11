import type { RecordItem } from "@/lib/types";

export type GuestDirectoryRow = {
  guest: RecordItem;
  currentRoom: string | null;
  inHouse: boolean;
  arrivingToday: boolean;
  nextArrival: string | null;
  nextRoom: string | null;
  lastCheckout: string | null;
  flags: string[];
};

export type GuestDirectory = { today: string; rows: GuestDirectoryRow[]; flagsAvailable: boolean };

export const guestFlagBadges = [
  { type: "do_not_rent", label: "Do Not Rent", status: "danger" },
  { type: "security_alert", label: "Security alert", status: "danger" },
  { type: "vip", label: "VIP", status: "active" },
  { type: "accessibility", label: "Accessibility", status: "confirmed" },
  { type: "special_handling", label: "Special handling", status: "pending" },
];

export function guestStayContext(stays: RecordItem[], today: string) {
  const date = (stay: RecordItem) => String(stay.check_in ?? "").slice(0, 10);
  const chronological = [...stays].sort((left, right) => date(left).localeCompare(date(right)));
  return {
    current: chronological.findLast(stay => stay.status === "checked_in"),
    next: chronological.find(stay => ["pending", "confirmed"].includes(String(stay.status)) && date(stay) >= today),
    lastCheckout: stays.reduce<string | null>((latest, stay) => {
      const checkout = String(stay.checked_out_at ?? stay.check_out ?? "");
      if (stay.status !== "checked_out" || !checkout) return latest;
      return latest === null || checkout > latest ? checkout : latest;
    }, null),
  };
}
