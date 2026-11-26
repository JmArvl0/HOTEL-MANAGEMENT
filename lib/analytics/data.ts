import { readAllRows } from "@/lib/read-all-rows";
import { demoStore } from "@/lib/demo-store";
import { hotelToday } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { hotelMidnight, shiftDate } from "./types";
import type { ClosedPickup } from "./occupancy";
import type { MaintenanceAsset } from "./maintenance";
import { readOccupancyPickupHistory } from "./evaluation-data";
import type { InventoryItemLike, InventoryMovementLike, MaintenanceOrderLike, ReservationLike, RoomLike, TaskLike } from "./types";

/**
 * Fetches the operational inputs the analytics engine needs. Targeted column
 * selects keep dashboards off entire-table reads; demo mode serves the
 * in-memory store so forecasts still work with zero configuration.
 */

export interface AnalyticsInputs {
  today: string;
  reservations: ReservationLike[];
  rooms: RoomLike[];
  tasks: TaskLike[];
  orders: MaintenanceOrderLike[];
  assets?: MaintenanceAsset[];
  pickupHistory?: ClosedPickup[];
  inventoryItems: InventoryItemLike[];
  movements: InventoryMovementLike[];
  inspectionRequired: boolean;
  databaseMode: "demo" | "supabase";
}

const RESERVATION_HISTORY_DAYS = 84;
const TASK_HISTORY_DAYS = 30;
const MAINTENANCE_HISTORY_DAYS = 90;
const MOVEMENT_HISTORY_DAYS = 30;

export async function getAnalyticsInputs(): Promise<AnalyticsInputs> {
  const today = hotelToday();

  if (!supabase) {
    return {
      today,
      reservations: demoStore.reservations as unknown as ReservationLike[],
      rooms: demoStore.rooms as unknown as RoomLike[],
      tasks: demoStore.housekeeping_tasks as unknown as TaskLike[],
      orders: demoStore.maintenance_orders as unknown as MaintenanceOrderLike[],
      inventoryItems: demoStore.inventory as unknown as InventoryItemLike[],
      movements: [], // no consumption history in demo mode
      inspectionRequired: true,
      databaseMode: "demo"
    };
  }

  const [
    reservationResult, roomResult, taskResult, orderResult, inventoryResult, movementResult, policyResult, assets, pickupHistory
  ] = await Promise.all([
    readAllRows(() => supabase!.from("reservations").select("id,status,check_in,check_out,created_at,checked_in_at,checked_out_at,room_type,guests,source").gte("check_out", shiftDate(today, -RESERVATION_HISTORY_DAYS))).then(data => ({ data, error: null })),
    readAllRows(() => supabase!.from("rooms").select("id,number,status,administratively_active,housekeeping")).then(data => ({ data, error: null })),
    readAllRows(() => supabase!.from("housekeeping_tasks").select("id,reservation_id,room_id,task_type,status,inspection_status,created_at,started_at,completed_at").or(`created_at.gte.${hotelMidnight(shiftDate(today, -TASK_HISTORY_DAYS))},completed_at.gte.${hotelMidnight(shiftDate(today, -TASK_HISTORY_DAYS))},status.in.(pending,assigned,in_progress,deferred),and(status.eq.completed,inspection_status.eq.pending)`)).then(data => ({ data, error: null })),
    readAllRows(() => supabase!.from("maintenance_orders").select("id,room_id,room_number,category,target_type,target_label,status,priority,serviceability_impact,created_at").or(`created_at.gte.${hotelMidnight(shiftDate(today, -MAINTENANCE_HISTORY_DAYS))},and(status.in.(open,assigned,in_progress,waiting_parts,deferred),serviceability_impact.in.(blocked,out_of_service))`)).then(data => ({ data, error: null })),
    readAllRows(() => supabase!.from("inventory").select("id,name,category,quantity,reorder_point,unit,created_at")).then(data => ({ data, error: null })),
    readAllRows(() => supabase!.from("inventory_movements").select("id,item_id,quantity,direction,created_at").gte("created_at", hotelMidnight(shiftDate(today, -MOVEMENT_HISTORY_DAYS)))).then(data => ({ data, error: null })),
    supabase.from("hotel_operational_policies").select("housekeeping_inspection_required").eq("key", "default").maybeSingle(),
    readAllRows<MaintenanceAsset>(() => supabase!.from("maintenance_assets").select("id,room_id,name,category,last_serviced_at").eq("active", true)),
    readOccupancyPickupHistory(today)
  ]);

  const error = [reservationResult, roomResult, taskResult, orderResult, inventoryResult, movementResult].find((result) => result.error)?.error;
  if (error) throw error;

  const orders = (orderResult.data ?? []) as MaintenanceOrderLike[];
  const blockedRooms = new Set(orders.filter(order => order.room_id
    && ["open", "assigned", "in_progress", "waiting_parts", "deferred"].includes(order.status)
    && ["blocked", "out_of_service"].includes(order.serviceability_impact ?? "")).map(order => order.room_id));

  return {
    today,
    reservations: (reservationResult.data ?? []) as ReservationLike[],
    rooms: ((roomResult.data ?? []) as RoomLike[]).map(room => blockedRooms.has(room.id) ? { ...room, status: "maintenance" } : room),
    tasks: (taskResult.data ?? []) as TaskLike[],
    orders,
    assets,
    pickupHistory,
    inventoryItems: (inventoryResult.data ?? []) as InventoryItemLike[],
    movements: (movementResult.data ?? []) as InventoryMovementLike[],
    inspectionRequired: policyResult.data?.housekeeping_inspection_required ?? true,
    databaseMode: "supabase"
  };
}
