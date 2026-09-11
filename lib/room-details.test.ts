import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccess, canViewGuestContact } from "@/lib/permissions";

const roomRoute = readFileSync("app/api/staff/rooms/[id]/route.ts", "utf8");
const staffData = readFileSync("lib/staff-data.ts", "utf8");
const modal = readFileSync("components/manager/room-detail-modal.tsx", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");

describe("room detail RBAC", () => {
  it("gates the room dossier endpoint behind session and rooms access", () => {
    expect(roomRoute).toContain("getServerSession");
    expect(roomRoute).toContain('canAccess(session.user.role, "rooms")');
    expect(roomRoute).toContain("getRoomDetail");
    expect(roomRoute).not.toContain("PATCH");
    expect(roomRoute).not.toContain("POST");
  });
  it("shows booking history only to roles that may see reservations and guest contact", () => {
    expect(staffData).toContain("canAccess(role, \"reservations\") && canViewGuestContact(role)");
    for (const role of ["manager", "owner", "front_desk"] as const) {
      expect(canAccess(role, "reservations")).toBe(true);
      expect(canViewGuestContact(role)).toBe(true);
    }
    for (const role of ["housekeeping", "maintenance"] as const) {
      expect(canAccess(role, "rooms")).toBe(true);
      expect(canAccess(role, "reservations")).toBe(false);
      expect(canViewGuestContact(role)).toBe(false);
    }
  });
  it("never queries financial or guest-contact data for a room", () => {
    // Bounded to the getRoomDetail function itself — later functions in the
    // file (getStaffGuestProfile) legitimately query guests and invoices.
    const body = staffData.slice(staffData.indexOf("getRoomDetail"), staffData.indexOf("getStaffGuestProfile"));
    expect(body).not.toContain("from(\"payments\")");
    expect(body).not.toContain("from(\"invoices\")");
    expect(body).not.toContain("from(\"guests\")");
    expect(body).toContain("guest_name");
    expect(body).not.toContain("guest_email");
  });
});

describe("room details modal", () => {
  it("is view-only — the only fetch is a GET and navigation reuses the reservation modal", () => {
    expect(modal).toContain("fetch(`/api/staff/rooms/${room.id}`, { cache: \"no-store\" })");
    expect(modal).not.toContain("method:");
    expect(dashboard).toContain("onViewReservation={(id)=>{setRoomDetail(null);viewReservation({id})}}");
  });
  it("makes every room card keyboard-accessible and labels it", () => {
    expect(dashboard).toContain('aria-label={`View room details for Room ${label(item.number)}`}');
    expect(dashboard).toContain('onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();viewRoom(item)}}');
    expect(dashboard).toContain("event.stopPropagation();advance(item)");
  });
  it("uses accessible tabs and the required blocked-room copy", () => {
    expect(modal).toContain('role="tablist"');
    expect(modal).toContain('role="tab"');
    expect(modal).toContain('role="tabpanel"');
    expect(modal).toContain("ArrowRight");
    expect(modal).toContain("ROOM BLOCKED — Active maintenance work order prevents this room from being assigned until resolved.");
  });
  it("reuses room_types facts instead of duplicating them on the physical room", () => {
    expect(staffData).toContain('from("room_types")');
    expect(staffData).toContain("max_guests,beds,size_sqm");
  });
  it("separates active maintenance issues from resolved history", () => {
    expect(modal).toContain("Active issues");
    expect(modal).toContain("Resolved history");
    expect(modal).toContain('["open", "assigned", "in_progress", "waiting_parts", "deferred"].includes(String(order.status))');
    // Show-more paginates only the resolved list; active issues always render in full.
    expect(modal).toContain("resolved.slice(0, shown)");
  });
  it("sorts upcoming bookings nearest-first while recent stays stay newest-first", () => {
    expect(modal).toContain("String(a.check_in).localeCompare(String(b.check_in))");
    expect(staffData.slice(staffData.indexOf("getRoomDetail"))).toContain('.eq("room_id", id).order("check_in", { ascending: false })');
  });
  it("shows departure and status for the next reservation", () => {
    expect(modal).toContain("<dt>Departure</dt>");
    expect(modal).toContain("<dt>Status</dt>");
  });
});
