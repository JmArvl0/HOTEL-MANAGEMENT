import { roomTypeBadgeClass } from "@/lib/room-type-badge";

/** One visual identity per room type: the pill rendered wherever a room-type badge appears. */
export function RoomTypeBadge({ name, colorKey, className }: { name: string; colorKey?: string | null; className?: string }) {
  const base = roomTypeBadgeClass(colorKey);
  return <span className={className ? `${base} ${className}` : base}>{name}</span>;
}
