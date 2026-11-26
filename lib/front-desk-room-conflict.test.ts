import { expect, it } from "vitest";
import { readResponse } from "@/lib/client-errors";
import { STAY_EXTENSION_HOLD_MESSAGE } from "@/lib/error-messages";
import { roomHeldConflict } from "@/lib/front-desk-room-conflict";

it("preserves the guest hold explanation through the public response and client reader", async () => {
  const response = roomHeldConflict({ message: "EXACT_ROOM_UNAVAILABLE", details: "ROOM_HELD_FOR_GUEST" });

  expect(response?.status).toBe(409);
  expect(await readResponse(response!)).toMatchObject({
    code: "ROOM_HELD_FOR_GUEST",
    error: "A guest is holding this room for these dates. Reopen the room list and choose another room.",
    outcome: "rejected",
  });
});

it("leaves other room availability conflicts to their existing handlers", () => {
  expect(roomHeldConflict({ message: "EXACT_ROOM_UNAVAILABLE", details: null })).toBeNull();
  expect(roomHeldConflict({ message: "ROOM_NOT_READY", details: "ROOM_HELD_FOR_GUEST" })).toBeNull();
});

it("preserves the same-room extension recovery through the public response", async () => {
  const response = roomHeldConflict({ message: "EXACT_ROOM_UNAVAILABLE", details: "ROOM_HELD_FOR_GUEST" }, STAY_EXTENSION_HOLD_MESSAGE);

  expect(response?.status).toBe(409);
  expect(await readResponse(response!)).toMatchObject({
    code: "ROOM_HELD_FOR_GUEST",
    error: STAY_EXTENSION_HOLD_MESSAGE,
    outcome: "rejected",
  });
});
