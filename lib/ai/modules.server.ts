import type { AiModuleId, ModuleContext, ModuleMetadata, ModuleFact } from "./module-metadata";
import { buildFrontDeskContext } from "./module-context";
import { buildPhase2Context } from "./module-context-phase2";
import type { Role } from "@/lib/types";
import { AI_MODULE_METADATA } from "./module-metadata";
import type { ModuleAssistant } from "./schemas";
import type { ModuleAssistantData, ModuleSuggestedAction } from "./module-metadata";

// Server-only module registry. No client code may import this file.
export interface ModuleAssistantDefinition {
  metadata: ModuleMetadata;
  task: string;
  buildContext: (role: Role) => Promise<ModuleContext>;
  actions: Record<string, ModuleSuggestedAction>;
}

const FRONT_DESK_TASK = `
Select the most relevant Front Desk fact IDs for the current shift.
Prioritize arrivals, departures, room readiness, occupancy, open guest requests, transportation, and maintenance blockers.
The facts do not include deposit verification, identity-document readiness, or payment status.
`;
const PHASE2_TASK = "Select the most relevant supplied aggregate fact IDs and advisory action IDs for the requested focus area.";

const DEFINITIONS: Record<AiModuleId, ModuleAssistantDefinition> = {
  front_desk: {
    metadata: AI_MODULE_METADATA.front_desk,
    task: FRONT_DESK_TASK,
    buildContext: () => buildFrontDeskContext(),
    actions: {
      review_arrivals: { action: "Review arrivals", rationale: "Check the reservation queue and prepare the assigned rooms." },
      check_room_readiness: { action: "Check room readiness", rationale: "Use Room Management before assigning or checking in a guest." },
      review_guest_requests: { action: "Review guest requests", rationale: "Open the request queue for current status and ownership." },
      review_transportation: { action: "Review transportation", rationale: "Check pending transfer requests in the transportation workspace." },
      review_maintenance: { action: "Review maintenance blockers", rationale: "Open the maintenance queue before treating a room as serviceable." }
    }
  },
  housekeeping: {
    metadata: AI_MODULE_METADATA.housekeeping, task: PHASE2_TASK,
    buildContext: (role) => buildPhase2Context("housekeeping", role),
    actions: {
      review_tasks: { action: "Review room-care tasks", rationale: "Use the Housekeeping queue for current assignment and status." },
      review_inspections: { action: "Review inspections", rationale: "Check the Housekeeping queue before marking a room ready." }
    }
  },
  maintenance: {
    metadata: AI_MODULE_METADATA.maintenance, task: PHASE2_TASK,
    buildContext: (role) => buildPhase2Context("maintenance", role),
    actions: {
      review_orders: { action: "Review work orders", rationale: "Use the Maintenance queue for diagnosis and next steps." },
      review_blockers: { action: "Review blocked rooms", rationale: "Check serviceability decisions before releasing a room." }
    }
  },
  accounting: {
    metadata: AI_MODULE_METADATA.accounting, task: PHASE2_TASK,
    buildContext: (role) => buildPhase2Context("accounting", role),
    actions: {
      review_verifications: { action: "Review pending verifications", rationale: "Open the Accounting verification queue for source evidence." },
      review_refunds: { action: "Review refund work", rationale: "Check the authorized refund queue and recorded payout method." }
    }
  },
  inventory: {
    metadata: AI_MODULE_METADATA.inventory, task: PHASE2_TASK,
    buildContext: (role) => buildPhase2Context("inventory", role),
    actions: {
      review_stock: { action: "Review stock levels", rationale: "Open Inventory for current quantities and reorder points." },
      review_replenishment: { action: "Review replenishment", rationale: "Check existing requests and purchase orders before ordering." }
    }
  },
  guest_requests: {
    metadata: AI_MODULE_METADATA.guest_requests, task: PHASE2_TASK,
    buildContext: (role) => buildPhase2Context("guest_requests", role),
    actions: {
      review_requests: { action: "Review open requests", rationale: "Use the authorized request queue to confirm ownership and due status." },
      review_escalations: { action: "Review escalations", rationale: "Check the request queue for escalation details and assigned team." }
    }
  },
  lost_found: {
    metadata: AI_MODULE_METADATA.lost_found, task: PHASE2_TASK,
    buildContext: (role) => buildPhase2Context("lost_found", role),
    actions: {
      review_custody: { action: "Review custody", rationale: "Open the Lost & Found register for the current custody chain." },
      review_claims: { action: "Review claims", rationale: "Check claim and release authority in the Lost & Found workspace." }
    }
  }
};

export function getModuleAssistant(moduleId: string): ModuleAssistantDefinition | null {
  const def = DEFINITIONS[moduleId as AiModuleId];
  return def?.metadata.enabled ? def : null;
}

/** Resolve model-selected IDs; all displayed text is server-owned. */
export function resolveModuleAnswer(
  answer: ModuleAssistant,
  context: ModuleContext
): { ok: true; data: ModuleAssistantData } | { ok: false } {
  const definition = getModuleAssistant(context.moduleId);
  if (!definition) return { ok: false };
  const byId = new Map(context.facts.map((fact) => [fact.id, fact]));
  const facts: ModuleFact[] = [];
  for (const id of answer.fact_ids) {
    const fact = byId.get(id);
    if (!fact) return { ok: false };
    if (!facts.some((item) => item.id === id)) facts.push(fact);
  }
  const actions: ModuleSuggestedAction[] = [];
  for (const id of answer.action_ids) {
    const action = definition.actions[id];
    if (!action) return { ok: false };
    if (!actions.includes(action)) actions.push(action);
  }
  return {
    ok: true,
    data: {
      summary: `${definition.metadata.label}: selected current HAVEN indicators.`,
      findings: facts.map((fact) => ({ fact_ids: [fact.id], explanation: `Source: ${fact.source}.` })),
      suggested_actions: actions,
      limitations: answer.unanswered ? ["The supplied facts cannot answer the question. Check the relevant HAVEN records."] : [],
      facts
    }
  };
}
