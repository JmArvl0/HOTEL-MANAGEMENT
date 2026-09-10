import { demoStore } from "@/lib/demo-store";
import { hotelToday } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { shiftDate } from "./types";
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
    reservationResult, roomResult, taskResult, orderResult, inventoryResult, movementResult, policyResult
  ] = await Promise.all([
    supabase.from("reservations").select("id,status,check_in,check_out,created_at,room_type,guests").gte("check_out", shiftDate(today, -RESERVATION_HISTORY_DAYS)),
    supabase.from("rooms").select("id,number,status,administratively_active"),
    supabase.from("housekeeping_tasks").select("id,room_id,task_type,status,created_at,started_at,completed_at").gte("created_at", shiftDate(today, -TASK_HISTORY_DAYS)),
    supabase.from("maintenance_orders").select("id,room_id,room_number,category,target_type,target_label,status,priority,created_at").gte("created_at", shiftDate(today, -MAINTENANCE_HISTORY_DAYS)),
    supabase.from("inventory").select("id,name,category,quantity,reorder_point,unit"),
    supabase.from("inventory_movements").select("id,item_id,quantity,direction,created_at").gte("created_at", shiftDate(today, -MOVEMENT_HISTORY_DAYS)),
    supabase.from("hotel_operational_policies").select("housekeeping_inspection_required").eq("key", "default").maybeSingle()
  ]);

  const error = [reservationResult, roomResult, taskResult, orderResult, inventoryResult, movementResult].find((result) => result.error)?.error;
  if (error) throw error;

  return {
    today,
    reservations: (reservationResult.data ?? []) as ReservationLike[],
    rooms: (roomResult.data ?? []) as RoomLike[],
    tasks: (taskResult.data ?? []) as TaskLike[],
    orders: (orderResult.data ?? []) as MaintenanceOrderLike[],
    inventoryItems: (inventoryResult.data ?? []) as InventoryItemLike[],
    movements: (movementResult.data ?? []) as InventoryMovementLike[],
    inspectionRequired: policyResult.data?.housekeeping_inspection_required ?? true,
    databaseMode: "supabase"
  };
}
