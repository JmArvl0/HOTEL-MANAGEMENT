// Room-type badge colors — the single source of the type→color mapping.
// Keys are semantic (stored on room_types.badge_color_key); CSS variant classes
// (rt-<key>) are derived here and nowhere else. A null/unknown key falls back to
// the neutral base pill so legacy or unconfigured types still render a badge.
export const ROOM_TYPE_COLORS = ["sage", "gold", "ocean", "plum", "terracotta", "slate", "sand", "lavender"] as const;
export type RoomTypeColorKey = (typeof ROOM_TYPE_COLORS)[number];

export const roomTypeBadgeClass = (key: string | null | undefined) =>
  `room-type${key && (ROOM_TYPE_COLORS as readonly string[]).includes(key) ? ` rt-${key}` : ""}`;
