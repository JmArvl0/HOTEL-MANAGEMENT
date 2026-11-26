import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/front-desk/reservations/route";
import { readResponse } from "@/lib/client-errors";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hotel-operations-route", () => ({
  hotelGuard: async () => ({ actor: "synthetic-front-desk", client: { rpc } }),
}));

it("preserves the sold-out explanation and recovery code through both public error boundaries", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "ROOM_TYPE_UNAVAILABLE" } });
  const response = await POST(new Request("http://127.0.0.1/api/front-desk/reservations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guestName: "Synthetic Guest",
      email: "guest@example.invalid",
      phone: "+639170000051",
      roomType: "Synthetic Twin",
      checkIn: "2027-01-15",
      checkOut: "2027-01-16",
      guests: 1,
      source: "Front Desk",
      quotedTotal: 2200,
      idempotencyKey: "70000000-0000-4000-8000-000000000001",
    }),
  }));

  expect(response.status).toBe(409);
  expect(await readResponse(response)).toMatchObject({
    code: "ROOM_TYPE_UNAVAILABLE",
    outcome: "rejected",
    error: "That room type is no longer available for those dates. Review the updated availability.",
  });
});
