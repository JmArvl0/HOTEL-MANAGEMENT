import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { staffSections } from "@/config/role-navigation";
import type { Role } from "@/lib/types";

const boundary = vi.hoisted(() => ({ session: null as Session | null, rpc: vi.fn(), breakfast: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => boundary.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: boundary.rpc } }));
vi.mock("@/lib/data", () => ({ databaseMode: "fixture", getDashboard: async () => ({ metrics: {} }) }));
vi.mock("@/lib/breakfast-server", () => ({ getGuestBreakfast: boundary.breakfast, canShowBreakfastPass: vi.fn() }));

import { GET as dashboard } from "@/app/api/manager_dashboard/route";
import { POST as requestApproval } from "@/app/api/manager/approvals/route";
import { POST as dispatch } from "@/app/api/front-desk/rooms/[id]/reclean/route";
import { PATCH as editResource, POST as createResource } from "@/app/api/resources/[resource]/route";
import { GET as openIdentityDocument } from "@/app/api/staff/reservations/[id]/verify-id/route";
import { GET as exportFinance } from "@/app/api/accounting/exports/route";
import { POST as userAction } from "@/app/api/admin/users/[id]/action/route";
import { DELETE as releaseHold } from "@/app/api/booking/holds/[token]/route";
import { GET as downloadBreakfastPass } from "@/app/api/account/reservations/[id]/breakfast/[date]/route";

const roles = [
  ["owner", false, false, false, undefined],
  ["admin", false, false, false, undefined],
  ["manager", true, false, true, "insights"],
  ["front_desk", true, true, true, "room_rack"],
  ["housekeeping", true, false, false, "housekeeping_tasks"],
  ["maintenance", true, false, false, "maintenance_orders"],
  ["accounting", true, false, false, "reconciliation"],
  ["guest", false, false, false, undefined],
] as const;
const member = (role: Role, changes: Partial<Session["user"]> = {}): Session => ({
  expires: "2099-01-01T00:00:00.000Z",
  user: { id: "signed-in-staff", name: "Fixture", role, ...changes },
});
const context = { params: Promise.resolve({ id: "record" }) };
const write = (path: string, data?: unknown) => new Request(`https://haven.example.test${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});
const stayException = {
  type: "early_check_in", relatedEntityType: "reservation", relatedEntityId: "stay",
  reservationId: "stay", department: "front_desk", reason: "Guest requested an exception.",
};

beforeEach(() => {
  boundary.session = null;
  boundary.rpc.mockReset();
  boundary.rpc.mockResolvedValue({ data: { id: "record", created: true }, error: null });
  boundary.breakfast.mockClear();
});

describe("RBAC HTTP and navigation contracts", () => {
  it.each(roles)("%s receives only its staff workspace and action grants", async (role, workspace, exception, reclean, section) => {
    boundary.session = member(role);
    expect((await dashboard()).status).toBe(workspace ? 200 : 403);
    const sections = staffSections(role);
    if (section) expect(sections).toContain(section);
    else expect(sections).toEqual([]);
    if (role !== "manager") expect(sections).not.toContain("insights");
    if (role !== "accounting") expect(sections).not.toContain("reconciliation");
    expect((await requestApproval(write("/api/manager/approvals", stayException))).status).toBe(exception ? 201 : 403);
    expect((await dispatch(write("/api/front-desk/rooms/record/reclean"), context)).status).toBe(reclean ? 201 : 403);
    const resource = { params: Promise.resolve({ resource: "rooms" }) };
    expect((await createResource(write("/api/resources/rooms", { number: "101" }), resource)).status).toBe(403);
    expect((await editResource(write("/api/resources/rooms", { id: "record", status: "clean" }), resource)).status).toBe(403);
    expect(boundary.rpc).toHaveBeenCalledTimes(Number(exception) + Number(reclean));
  });

  it.each([null, member("front_desk", { disabled: true }), member("front_desk", { otpPending: true }), member("front_desk", { id: "" })])(
    "rejects an incomplete or inactive session before an action",
    async session => {
      boundary.session = session;
      expect((await dashboard()).status).toBe(401);
      expect((await requestApproval(write("/api/manager/approvals", stayException))).status).toBe(401);
      expect((await dispatch(write("/api/front-desk/rooms/record/reclean"), context)).status).toBe(401);
      expect(boundary.rpc).not.toHaveBeenCalled();
    },
  );

  it("returns a not-found response for a department request outside the actor's scope", async () => {
    boundary.session = member("housekeeping");
    boundary.rpc.mockResolvedValueOnce({ data: null, error: { message: "GUEST_REQUEST_NOT_FOUND" } });
    const response = await requestApproval(write("/api/manager/approvals", {
      ...stayException, type: "guest_escalation", relatedEntityType: "guest_request",
      guestRequestId: "b5ef6adb-3617-4f18-831d-5a26b279378a",
    }));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ category: "not_found" });
  });

  it("keeps private identity documents, export and account actions behind distinct grants", async () => {
    boundary.session = member("front_desk");
    expect((await userAction(write("/api/admin/users/record/action", { action: "role", role: "owner", reason: "Fixture", version: 1 }), context)).status).toBe(403);
    expect((await exportFinance(write("/api/accounting/exports"))).status).toBe(403);
    boundary.session = member("accounting");
    expect((await openIdentityDocument(new Request("https://haven.example.test/api/staff/reservations/record/verify-id"), context)).status).toBe(403);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("separates missing sessions from staff denial on guest-only actions", async () => {
    const request = new Request("https://haven.example.test/api/booking/holds/fixture", { method: "DELETE" });
    const hold = { params: Promise.resolve({ token: "fixture" }) };
    const pass = { params: Promise.resolve({ id: "fixture", date: "2026-12-01" }) };
    expect((await releaseHold(request, hold)).status).toBe(401);
    expect((await downloadBreakfastPass(request, pass)).status).toBe(401);
    boundary.session = member("front_desk");
    expect((await releaseHold(request, hold)).status).toBe(403);
    expect((await downloadBreakfastPass(request, pass)).status).toBe(403);
    expect(boundary.breakfast).not.toHaveBeenCalled();
  });
});
