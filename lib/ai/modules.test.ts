import { describe, expect, it } from "vitest";
import { AI_MODULE_METADATA, visibleModuleForSection } from "./module-metadata";
import { getModuleAssistant } from "./modules.server";

describe("AI module metadata", () => {
  it("enables only the Front Desk Operations Summary for front desk and manager", () => {
    const mod = AI_MODULE_METADATA.front_desk;
    expect(mod.label).toBe("Front Desk Operations Summary");
    expect(mod.roles).toEqual(["front_desk", "manager"]);
    expect(mod.enabled).toBe(true);
    expect(mod.rateLimit).toEqual({ limit: 10, windowMinutes: 10 });
    expect(getModuleAssistant("front_desk")?.metadata.id).toBe("front_desk");
  });

  it("registers the six Phase 2 modules with their operational roles", () => {
    expect(Object.fromEntries(Object.entries(AI_MODULE_METADATA).map(([id, module]) => [id, module.roles]))).toMatchObject({
      housekeeping: ["housekeeping", "manager"],
      maintenance: ["maintenance", "manager"],
      accounting: ["accounting"],
      inventory: ["front_desk", "housekeeping", "maintenance", "manager"],
      guest_requests: ["front_desk", "housekeeping", "manager"],
      lost_found: ["front_desk", "housekeeping", "manager"]
    });
    for (const id of ["housekeeping", "maintenance", "accounting", "inventory", "guest_requests", "lost_found"])
      expect(getModuleAssistant(id)?.metadata.enabled).toBe(true);
  });

  it("does not expose an assistant for an unknown module", () => {
    expect(getModuleAssistant("not_a_module")).toBeNull();
  });

  it("maps each operational workspace to a card only for its allowed roles", () => {
    expect(visibleModuleForSection("housekeeping_tasks", "housekeeping")).toBe("housekeeping");
    expect(visibleModuleForSection("maintenance_orders", "maintenance")).toBe("maintenance");
    expect(visibleModuleForSection("overview", "accounting")).toBe("accounting");
    expect(visibleModuleForSection("transactions", "accounting")).toBe("accounting");
    expect(visibleModuleForSection("inventory", "front_desk")).toBe("inventory");
    expect(visibleModuleForSection("guest_requests", "housekeeping")).toBe("guest_requests");
    expect(visibleModuleForSection("lost_found", "front_desk")).toBe("lost_found");
    expect(visibleModuleForSection("transactions", "manager")).toBeNull();
    expect(visibleModuleForSection("lost_found", "owner")).toBeNull();
    expect(visibleModuleForSection("reports", "front_desk")).toBeNull();
  });
});
