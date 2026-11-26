import { getDashboard } from "@/lib/data";
import { getAnalyticsInputs } from "@/lib/analytics/data";
import { readAllRows } from "@/lib/read-all-rows";
import { demoStore } from "@/lib/demo-store";
import { supabase } from "@/lib/supabase";
import { foundMetrics } from "@/lib/operations";
import type { Role } from "@/lib/types";
import { AI_MODULE_METADATA, type AiModuleId, type ModuleContext, type ModuleFact } from "./module-metadata";

type Phase2ModuleId = Exclude<AiModuleId, "front_desk">;
type RequestRow = { id: string; department: string; status: string; approval_status: string | null; escalation_status: string | null };
type FoundRow = { id: string; status: string };
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

/** Only aggregate, role-scoped values leave this module for the AI provider. */
export async function buildPhase2Context(moduleId: Phase2ModuleId, role: Role, now = new Date()): Promise<ModuleContext> {
  if (!AI_MODULE_METADATA[moduleId].roles.includes(role)) throw new Error("Forbidden module context");
  const asOf = now.toISOString();
  const facts: ModuleFact[] = [];
  const add = (key: string, label: string, display: string, source: string) => {
    facts.push({ id: `${moduleId}.${key}`, label, display, basis: "FACT", source, asOf });
  };

  if (moduleId === "housekeeping" || moduleId === "maintenance" || moduleId === "accounting") {
    const { metrics } = await getDashboard(role);
    if (moduleId === "housekeeping") {
      add("open_tasks", "Open Housekeeping tasks", String(metrics.openTasks), "HAVEN Housekeeping dashboard");
      add("cleaning_rooms", "Rooms being cleaned", String(metrics.roomsCleaning), "HAVEN room care");
      add("awaiting_inspection", "Rooms awaiting inspection", String(metrics.roomsAwaitingInspection), "HAVEN room care");
      add("overdue_tasks", "Overdue Housekeeping tasks", String(metrics.overdueHousekeeping), "HAVEN Housekeeping dashboard");
    } else if (moduleId === "maintenance") {
      add("open_orders", "Open maintenance orders", String(metrics.openMaintenance), "HAVEN Maintenance dashboard");
      add("critical_orders", "Urgent or critical maintenance orders", String(metrics.criticalMaintenance), "HAVEN Maintenance dashboard");
      add("out_of_service_rooms", "Out-of-service rooms", String(metrics.outOfServiceRooms), "HAVEN room board");
    } else {
      add("pending_refunds", "Pending refund requests", String(metrics.pendingRefundCount ?? 0), "HAVEN Accounting dashboard");
      add("outstanding_balances", "Outstanding folio balances", money(metrics.outstandingBalances), "HAVEN Accounting dashboard");
      add("collections_today", "Collections today", money(metrics.collectionsToday), "HAVEN Accounting dashboard");
      add("refunds_today", "Refunds today", money(metrics.refundSummary), "HAVEN Accounting dashboard");
    }
  } else if (moduleId === "inventory") {
    const inputs = await getAnalyticsInputs();
    const items = inputs.inventoryItems;
    const quantity = (item: typeof items[number]) => Number(item.quantity);
    add("items", "Inventory items", String(items.length), "HAVEN inventory");
    add("out_of_stock", "Out-of-stock items", String(items.filter((item) => quantity(item) <= 0).length), "HAVEN inventory");
    add("low_stock", "Low-stock items", String(items.filter((item) => quantity(item) > 0 && quantity(item) <= Number(item.reorder_point)).length), "HAVEN inventory");
  } else if (moduleId === "guest_requests") {
    const client = supabase;
    const rows: RequestRow[] = client
      ? await readAllRows<RequestRow>(() => {
          const query = client.from("guest_requests").select("id,department,status,approval_status,escalation_status");
          return role === "housekeeping" ? query.eq("department", "housekeeping") : query;
        })
      : demoStore.guest_requests.filter((row) => role !== "housekeeping" || row.department === "housekeeping") as RequestRow[];
    const open = rows.filter((row) => ["open", "in_progress"].includes(row.status));
    add("open", "Open guest requests", String(open.length), "HAVEN guest requests");
    add("escalated", "Escalated guest requests", String(open.filter((row) => row.escalation_status === "escalated").length), "HAVEN guest requests");
    add("pending_approval", "Requests pending approval", String(open.filter((row) => row.approval_status === "pending").length), "HAVEN guest requests");
  } else {
    const client = supabase;
    if (!client) throw new Error("Lost & Found database unavailable");
    const rows = await readAllRows<FoundRow>(() => client.from("lost_found_items").select("id,status"));
    const counts = foundMetrics(rows);
    add("in_custody", "Items in custody", String(counts.inCustody), "HAVEN Lost & Found register");
    add("open_claims", "Open claims", String(counts.openClaims), "HAVEN Lost & Found register");
    add("ready_for_release", "Items authorized for release", String(counts.readyForRelease), "HAVEN Lost & Found register");
  }

  return { moduleId, generatedAt: asOf, facts };
}
