// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { GuestDirectoryRow } from "@/lib/guest-directory";
import GuestManagementWorkspace from "./guest-management-workspace";

const row = (id: string, name: string, extra: Partial<GuestDirectoryRow>): GuestDirectoryRow => ({
  guest: { id, name }, currentRoom: null, inHouse: false, arrivingToday: false, nextRoom: null,
  nextArrival: null, lastCheckout: null, flags: [], ...extra,
});
const rows = [
  row("G-A", "Ava Reyes", { inHouse: true, currentRoom: "201" }),
  row("G-B", "Ben Lim", { arrivingToday: true, nextArrival: "2026-11-10", flags: ["vip"], guest: {
    id: "G-B", name: "Ben Lim", loyalty_tier: "Gold", merge_alias_search: "Old guest reference",
  } }),
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("filters real directory rows and returns from a profile with the same directory context", async () => {
  const open = vi.fn();
  vi.stubGlobal("fetch", async (url: string) => {
    if (url === "/api/staff/guests") return Response.json({ data: { rows, today: "2026-11-10", flagsAvailable: true } });
    const guest = rows.find(({ guest }) => url.endsWith("/" + guest.id))?.guest;
    if (!guest) return Response.json({ error: "Unknown guest" }, { status: 404 });
    return Response.json({ data: {
      guest, stays: [{ id: "R-" + guest.id, confirmation_number: "H-" + guest.id, status: "confirmed", check_in: "2026-11-10", check_out: "2026-11-12" }],
      stayCounts: { current: 0, upcoming: 1, completed: 0, cancelled: 0, noShow: 0 },
      requestOptions: [], requests: [], transportation: [], assignments: [], approvals: [], financialVisible: false,
    } });
  });
  function Harness() {
    const [search, setSearch] = useState("");
    return <GuestManagementWorkspace role="front_desk" search={search} setSearch={setSearch} onViewReservation={open} />;
  }
  render(<Harness />);
  const directory = await screen.findByRole("region", { name: "Guest directory" });
  fireEvent.click(within(directory).getByRole("button", { name: /Arriving today/ }));
  expect(within(directory).queryByRole("button", { name: /Ava Reyes/ })).toBeNull();
  const search = within(directory).getByRole("searchbox");
  fireEvent.change(search, { target: { value: "Old guest reference" } });
  fireEvent.click(within(directory).getByRole("button", { name: /Ben Lim/ }));
  const profile = screen.getByRole("complementary", { name: "Guest profile" });
  await within(profile).findByRole("heading", { name: "Ben Lim" });
  expect(within(profile).getByText("Gold")).toBeTruthy();
  fireEvent.click(await within(profile).findByRole("tab", { name: "Stays" }));
  fireEvent.click(within(profile).getByRole("button", { name: /Open booking/ }));
  expect(open).toHaveBeenCalledWith("R-G-B");
  fireEvent.click(within(profile).getByRole("button", { name: "Back to directory" }));
  expect((search as HTMLInputElement).value).toBe("Old guest reference");
  expect(within(directory).getByRole("button", { name: /Arriving today/ }).getAttribute("aria-pressed")).toBe("true");
});
