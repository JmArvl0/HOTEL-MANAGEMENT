import { publicJson } from "@/lib/server-errors";

export function roomHeldConflict(
  error: { message: string; details?: string | null },
  message = "A guest is holding this room for these dates. Reopen the room list and choose another room.",
) {
  if (error.message !== "EXACT_ROOM_UNAVAILABLE" || error.details !== "ROOM_HELD_FOR_GUEST") return null;

  return publicJson({
    code: "ROOM_HELD_FOR_GUEST",
    error: message,
  }, { status: 409 });
}
