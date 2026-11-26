import type { ReactNode } from "react";
import { roomTypeBadgeClass } from "@/lib/room-type-badge";

/** One visual identity per room type: the pill rendered wherever a room-type badge appears. */
export function RoomTypeBadge({ name, colorKey, className, icon }: { name: string; colorKey?: string | null; className?: string; icon?: ReactNode }) {
  const base = roomTypeBadgeClass(colorKey);
  return <span className={className ? `${base} ${className}` : base}>{icon}{name}</span>;
}
