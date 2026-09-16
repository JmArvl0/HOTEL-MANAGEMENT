// Staff bell wiring contract: the dropdown keeps its recent alerts, View-all
// opens the shared history modal (no page navigation), View jumps to the
// alert's module, and read state never feeds the sidebar workload badges.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");

describe("staff notification history wiring", () => {
  it("adds a View-all entry point that opens the modal, not a route", () => {
    expect(client).toContain("View all notifications");
    expect(client).toContain("openStaffHistory");
    expect(client).toContain("NotificationHistoryModal");
    expect(client).not.toContain("/account/notifications");
  });

  it("counts the bell from unread alerts only", () => {
    expect(client).toContain("unreadStaffNotifications");
    expect(client).toContain("countUniqueNotifications(unreadStaffNotifications)");
  });

  it("routes modal View actions to the alert's module and closes the modal", () => {
    expect(client).toContain("setSection(target.section)");
    expect(client).toContain("setHistoryOpen(false)");
  });

  it("marks the visible day as read without touching workload state", () => {
    expect(client).toContain("onMarkDayRead");
    expect(client).toContain("markStaffRead");
    // Read tracking is per-user UI dismissal; sidebar badges keep their own metrics.
    expect(client).toContain("haven-staff-read:${user.id}");
    expect(client).toContain('m.pendingVerifications');
  });

  it("returns focus to the bell when the modal closes", () => {
    expect(client).toContain("buttonRef={staffBellBtn}");
    expect(client).toContain("returnFocusRef={staffBellBtn}");
  });
});
