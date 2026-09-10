import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STAFF_DUTY_BASIS_NOTE, deriveStaffDuty, hotelTodayKey, type StaffDutyInput } from "@/lib/staff-duty";

const route = readFileSync("app/api/manager/staff-duty/route.ts", "utf8");
const permissions = readFileSync("lib/permissions.ts", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");

const TODAY = hotelTodayKey();

function input(overrides: Partial<StaffDutyInput> = {}): StaffDutyInput {
  return {
    today: TODAY,
    accounts: [
      { id: "ana", name: "Ana Cruz", role: "housekeeping" },
      { id: "carlo", name: "Carlo Diaz", role: "maintenance" },
      { id: "liam", name: "Liam Cruz", role: "front_desk" },
      { id: "amelia", name: "Amelia Hart", role: "owner" }
    ],
    housekeepingTasks: [],
    maintenanceOrders: [],
    openCashShifts: [],
    ...overrides
  };
}

describe("staff duty derivation", () => {
  it("marks staff with in-progress work as working", () => {
    const snapshot = deriveStaffDuty(input({ housekeepingTasks: [{ id: "HKT-1", room_number: "102", task: "Checkout clean", status: "in_progress", assigned_user_id: "ana" }] }));
    const ana = snapshot.staff.find((member) => member.id === "ana")!;
    expect(ana.dutyStatus).toBe("working");
    expect(ana.currentAssignment).toBe("Room 102 · Checkout clean");
  });

  it("marks staff with only open (not started) work as assigned, not working", () => {
    const snapshot = deriveStaffDuty(input({ maintenanceOrders: [{ id: "MWO-1", room_number: "305", issue: "AC not cooling", status: "assigned", assigned_user_id: "carlo" }] }));
    expect(snapshot.staff.find((member) => member.id === "carlo")!.dutyStatus).toBe("assigned");
  });

  it("never marks an idle account as working — login is not duty", () => {
    const snapshot = deriveStaffDuty(input());
    for (const member of snapshot.staff) expect(member.dutyStatus).toBe("no_active_work");
  });

  it("treats an open cash shift as cash-handling work without defining the whole role", () => {
    const snapshot = deriveStaffDuty(input({ openCashShifts: [{ staff_user_id: "liam", location: "Front Desk" }] }));
    const liam = snapshot.staff.find((member) => member.id === "liam")!;
    expect(liam.dutyStatus).toBe("working");
    expect(liam.assignmentKind).toBe("cash");
    expect(liam.cashShiftOpen).toBe(true);
  });

  it("counts completed-today workload in the hotel timezone day", () => {
    const snapshot = deriveStaffDuty(input({
      housekeepingTasks: [
        { id: "HKT-1", room_number: "201", task: "Checkout clean", status: "completed", assigned_user_id: "ana", completed_at: `${TODAY}T23:30:00+08:00` },
        { id: "HKT-2", room_number: "202", task: "Turndown", status: "completed", assigned_user_id: "ana", completed_at: `${TODAY}T22:00:00Z` } // 06:00 Manila next day — outside the hotel day
      ]
    }));
    const ana = snapshot.staff.find((member) => member.id === "ana")!;
    expect(ana.workload.completedToday).toBe(1);
  });

  it("excludes governance and guest accounts from operational supervision", () => {
    const snapshot = deriveStaffDuty(input());
    expect(snapshot.staff.map((member) => member.id)).not.toContain("amelia");
    expect(snapshot.departments.map((dept) => dept.name)).toEqual(["Housekeeping", "Maintenance", "Front Desk"]);
  });

  it("rolls departments up with on-duty and activity counts", () => {
    const snapshot = deriveStaffDuty(input({
      housekeepingTasks: [
        { id: "HKT-1", room_number: "102", task: "Checkout clean", status: "in_progress", assigned_user_id: "ana" },
        { id: "HKT-2", room_number: "103", task: "Turndown", status: "pending", assigned_user_id: "ana" }
      ]
    }));
    const housekeeping = snapshot.departments.find((dept) => dept.name === "Housekeeping")!;
    expect(housekeeping.total).toBe(1);
    expect(housekeeping.working).toBe(1);
    expect(housekeeping.activity.Cleaning).toBe(1);
    expect(snapshot.summary.working).toBe(1);
  });
});

describe("staff duty authorization and wiring", () => {
  it("restricts the endpoint to the Manager role", () => {
    expect(permissions).toContain("export const canViewStaffDuty = (role: Role) => role === \"manager\"");
    expect(route).toContain("canViewStaffDuty(session.user.role as Role)");
    expect(route).toContain("403");
  });
  it("serves the dashboard only through the guarded route, never the generic resource CRUD", () => {
    expect(dashboard).toContain('section: "staff_duty"');
    expect(readFileSync("app/api/resources/[resource]/route.ts", "utf8")).not.toContain("staff_duty");
  });
  it("documents that duty is derived, not faked from login", () => {
    expect(STAFF_DUTY_BASIS_NOTE).toContain("never used");
    expect(route).toContain("never a duty signal");
  });
});
