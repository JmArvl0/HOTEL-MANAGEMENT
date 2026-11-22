import type { Role } from "@/lib/types";

export type AiModuleId = "front_desk" | "housekeeping" | "maintenance" | "accounting" | "inventory" | "guest_requests" | "lost_found";
export type FactBasis = "FACT" | "PREDICTION";

export interface ModuleFact {
  id: string;
  label: string;
  display: string;
  basis: FactBasis;
  source: string;
  asOf: string;
  note?: string;
}

export interface ModuleContext {
  moduleId: AiModuleId;
  generatedAt: string;
  facts: ModuleFact[];
}

export interface ModuleFinding {
  fact_ids: string[];
  explanation: string;
}

export interface ModuleSuggestedAction {
  action: string;
  rationale: string;
}

export interface ModuleAssistantAnswer {
  summary: string;
  findings: ModuleFinding[];
  suggested_actions: ModuleSuggestedAction[];
  limitations: string[];
}

export interface ModuleAssistantData extends ModuleAssistantAnswer {
  facts: ModuleFact[];
}

export interface ModuleMetadata {
  id: AiModuleId;
  label: string;
  description: string;
  roles: readonly Role[];
  enabled: boolean;
  rateLimit: { limit: number; windowMinutes: number };
  topics: readonly { id: string; label: string }[];
}

export const MODULE_AI_DISCLOSURE =
  "AI-generated operational guidance. Verify important decisions using authoritative HAVEN records.";

export const MODULE_AI_UNAVAILABLE_MESSAGE =
  "HAVEN could not produce a grounded summary. Check the operational records directly and try again.";

export const AI_MODULE_METADATA: Record<AiModuleId, ModuleMetadata> = {
  front_desk: {
    id: "front_desk",
    label: "Front Desk Operations Summary",
    description:
      "Explains today's Front Desk workload from HAVEN's own operational facts. Read-only; it cannot check guests in, assign rooms, or change records.",
    roles: ["front_desk", "manager"],
    enabled: true,
    rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [
      { id: "arrivals", label: "Arrivals and departures" },
      { id: "room_readiness", label: "Room readiness" },
      { id: "guest_requests", label: "Guest requests" },
      { id: "transportation", label: "Transportation" },
      { id: "maintenance", label: "Maintenance blockers" }
    ]
  },
  housekeeping: {
    id: "housekeeping", label: "Housekeeping Operations Summary",
    description: "Highlights room-care workload from HAVEN task and readiness facts.",
    roles: ["housekeeping", "manager"], enabled: true, rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [{ id: "tasks", label: "Open tasks" }, { id: "readiness", label: "Room readiness" }, { id: "inspections", label: "Inspections" }]
  },
  maintenance: {
    id: "maintenance", label: "Maintenance Operations Summary",
    description: "Highlights open work and serviceability blockers from HAVEN records.",
    roles: ["maintenance", "manager"], enabled: true, rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [{ id: "open_work", label: "Open work" }, { id: "blockers", label: "Room blockers" }, { id: "priority", label: "Priority work" }]
  },
  accounting: {
    id: "accounting", label: "Accounting Operations Summary",
    description: "Summarizes authorized payment and refund aggregates without exposing guest records.",
    roles: ["accounting"], enabled: true, rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [{ id: "verification", label: "Payment verification" }, { id: "refunds", label: "Refunds" }, { id: "balances", label: "Balances" }]
  },
  inventory: {
    id: "inventory", label: "Inventory Operations Summary",
    description: "Highlights stock levels and replenishment needs from HAVEN inventory facts.",
    roles: ["front_desk", "housekeeping", "maintenance", "manager"], enabled: true, rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [{ id: "low_stock", label: "Low stock" }, { id: "out_of_stock", label: "Out of stock" }, { id: "replenishment", label: "Replenishment" }]
  },
  guest_requests: {
    id: "guest_requests", label: "Guest Requests Operations Summary",
    description: "Highlights open and escalated requests within your authorized scope.",
    roles: ["front_desk", "housekeeping", "manager"], enabled: true, rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [{ id: "open_requests", label: "Open requests" }, { id: "escalations", label: "Escalations" }]
  },
  lost_found: {
    id: "lost_found", label: "Lost & Found Operations Summary",
    description: "Highlights custody and release stages without item descriptions or claimant details.",
    roles: ["front_desk", "housekeeping", "manager"], enabled: true, rateLimit: { limit: 10, windowMinutes: 10 },
    topics: [{ id: "custody", label: "In custody" }, { id: "claims", label: "Claims" }, { id: "release", label: "Release readiness" }]
  }
};

const WORKSPACE_MODULES: Record<string, AiModuleId> = {
  housekeeping_tasks: "housekeeping",
  maintenance_orders: "maintenance",
  transactions: "accounting",
  inventory: "inventory",
  guest_requests: "guest_requests",
  lost_found: "lost_found"
};

export function visibleModuleForSection(section: string, role: Role): AiModuleId | null {
  const id = section === "overview" && role === "accounting" ? "accounting" : WORKSPACE_MODULES[section];
  return id && AI_MODULE_METADATA[id].enabled && AI_MODULE_METADATA[id].roles.includes(role) ? id : null;
}
