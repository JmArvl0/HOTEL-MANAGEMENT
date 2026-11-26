import { hotelToday } from "@/lib/booking";
import { readAllRows } from "@/lib/read-all-rows";
import { maintenanceBlockedRoomIds, roomBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";
import { inReservationQueue } from "@/lib/reservation-workspace";
import type { ManagerContext } from "@/lib/manager-route";
import { shiftDate } from "@/lib/analytics/types";
import { forecastInventory } from "@/lib/analytics/inventory";

export const canReadHotelOverview = (role: string) => role === "manager" || role === "owner";
const maintenanceStatuses = ["open", "assigned", "in_progress", "waiting_parts", "deferred"];

async function source<T>(load: () => Promise<T>) {
  try { return { data: await load(), at: new Date().toISOString() }; }
  catch { return { data: null, at: null }; }
}

export async function loadCommandCenter({ client: db, actorId, role }: ManagerContext) {
  const clock = await db.from("hotel_operational_policies").select("hotel_timezone,housekeeping_turnover_overdue_minutes,guest_request_overdue_minutes").eq("key", "default").single();
  if (clock.error) throw clock.error;
  const zone = String(clock.data.hotel_timezone);
  const today = hotelToday(zone);
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  const now = Date.now();
  const overdue = (start: string, limit: number) => now - Date.parse(start) > limit * 60000;
  const [board, work, approvals, money, stock, alerts] = await Promise.all([
    source(async () => {
      const [rooms, reservations, orders] = await Promise.all([
        readAllRows<RackRoom>(() => db.from("rooms").select("id,number,floor,type,status,housekeeping,administratively_active").returns<RackRoom[]>()),
        readAllRows<RackReservation & { expected_arrival: string | null }>(() => db.from("reservations").select("id,confirmation_number,room_type,room_id,room_number,check_in,check_out,status,expected_arrival")
          .in("status", ["pending", "confirmed", "checked_in", "checked_out"]).lt("check_in", shiftDate(today, 7)).gte("check_out", today).returns<(RackReservation & { expected_arrival: string | null })[]>()),
        readAllRows<{ id: string; room_id: string | null; room_number: string; status: string; serviceability_impact: string }>(() => db.from("maintenance_orders")
          .select("id,room_id,room_number,status,serviceability_impact").in("status", maintenanceStatuses))
      ]);
      const blocked = maintenanceBlockedRoomIds(orders, rooms);
      const active = rooms.filter(room => room.administratively_active !== false);
      const isBlocked = (room: RackRoom) => blocked.has(room.id) || ["maintenance", "out_of_service"].includes(room.status);
      const serviceable = active.filter(room => !isBlocked(room));
      const occupied = serviceable.filter(room => room.status === "occupied").length;
      const states = new Map(active.map(room => [room.id, roomBoardState(room, reservations, today, blocked).state]));
      const selectedRows = (queue: "arrivals" | "departures") => reservations.filter(row => inReservationQueue(row, queue, today));
      const entries = (rows: ReturnType<typeof selectedRows>) => [...rows]
        .sort((a, b) => (a.expected_arrival || "~").localeCompare(b.expected_arrival || "~") || a.id.localeCompare(b.id))
        .slice(0, 5).map(row => {
          const room = active.find(candidate => candidate.id === row.room_id);
          const readiness = !row.room_id ? "Unassigned" : !room ? "Unavailable"
            : blocked.has(room.id) || ["maintenance", "out_of_service"].includes(room.status) ? "Blocked"
              : room.housekeeping === "clean" && room.status !== "occupied" ? "Ready" : room.status === "occupied" ? "Occupied" : "Room care needed";
          // Owner can review the executive operating board without guest identity details.
          return { id: row.id, reference: row.confirmation_number ?? row.id, time: row.expected_arrival?.match(/^([01]\d|2[0-3]):[0-5]\d/)?.[0] ?? null, room: room?.number ?? row.room_number ?? null, readiness, status: row.status };
        });
      const arrivals = selectedRows("arrivals");
      const departures = selectedRows("departures");
      return {
        occupied, serviceable: serviceable.length, ready: [...states.values()].filter(state => state === "available").length,
        dirty: active.filter(room => ["dirty", "reclean_required"].includes(room.housekeeping) || room.status === "dirty").length,
        blocked: active.filter(isBlocked).length,
        arrivalTotal: arrivals.length + reservations.filter(row => row.check_in === today && ["checked_in", "checked_out"].includes(row.status)).length,
        departureTotal: departures.length + reservations.filter(row => row.check_out === today && row.status === "checked_out").length,
        arrivalRemaining: arrivals.length, departureRemaining: departures.length, arrivals: entries(arrivals), departures: entries(departures)
      };
    }),
    source(async () => {
      const [tasks, maintenance, requests, trips] = await Promise.all([
        source(() => readAllRows<{ id: string; created_at: string }>(() => db.from("housekeeping_tasks").select("id,created_at").in("status", ["pending", "assigned", "in_progress", "deferred"]))),
        source(() => readAllRows<{ id: string; priority: string; severity: string }>(() => db.from("maintenance_orders").select("id,priority,severity").in("status", maintenanceStatuses))),
        source(() => readAllRows<{ id: string; created_at: string; due_at: string | null }>(() => db.from("guest_requests").select("id,created_at,due_at").in("status", ["open", "in_progress"]).in("approval_status", ["pending", "approved"]))),
        source(() => readAllRows<{ id: string }>(() => db.from("transportation_requests").select("id").eq("pickup_date", today).in("status", ["REQUESTED", "REVIEWED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"])))
      ]);
      return { housekeeping: tasks.data?.length ?? null, maintenance: maintenance.data?.length ?? null, requests: requests.data?.length ?? null, trips: trips.data?.length ?? null,
        freshness: { housekeeping: tasks.at, maintenance: maintenance.at, requests: requests.at, transport: trips.at },
        overdueHousekeeping: tasks.data?.filter(task => overdue(task.created_at, Number(clock.data.housekeeping_turnover_overdue_minutes))).length ?? null,
        overdueRequests: requests.data?.filter(request => request.due_at ? Date.parse(request.due_at) < now : overdue(request.created_at, Number(clock.data.guest_request_overdue_minutes))).length ?? null,
        criticalMaintenance: maintenance.data?.filter(row => row.severity === "critical" || ["critical", "urgent"].includes(row.priority)).length ?? null };
    }),
    source(async () => (await readAllRows<{ id: string }>(() => db.from("manager_approval_requests").select("id").eq("status", "pending").eq("authority_level", role === "owner" ? "owner" : "manager"))).length),
    source(async () => {
      const { data, error } = await db.rpc("hotel_night_audit_preview", { p_actor: actorId });
      if (error) throw error;
      const metrics = data?.metrics as { received?: number; outstanding?: number; date?: string } | undefined;
      if (!metrics) return null;
      return { date: metrics.date, received: metrics.received ?? null, outstanding: metrics.outstanding ?? null };
    }),
    source(async () => {
      const rows = await readAllRows<{ id: string; name: string; unit: string; category: string; quantity: number; reorder_point: number }>(() => db.from("inventory").select("id,name,unit,category,quantity,reorder_point"));
      const moves = await readAllRows<{ id: string; item_id: string; direction: string; quantity: number; created_at: string }>(() => db.from("inventory_movements").select("id,item_id,direction,quantity,created_at").eq("direction", "consumption").gte("created_at", `${shiftDate(today, -31)}T00:00:00Z`));
      const lowStock = rows.filter(item => Number(item.quantity) <= Number(item.reorder_point));
      return { low: lowStock.length, lowStock: lowStock.slice(0, 8).map(({ id, name, quantity, unit }) => ({ id, name, quantity, unit })),
        forecast: forecastInventory({ items: rows, movements: moves, today }).items.filter(item => (item.projectedShortage ?? 0) > 0).slice(0, 3), through: shiftDate(today, 3) };
    }),
    source(async () => {
      const { data, error } = await db.from("analytics_predictions").select("target_date,generated_at,risk_level,data_quality,predicted_value,metadata").eq("prediction_type", "occupancy")
        .gte("target_date", today).order("generated_at", { ascending: false }).limit(7);
      if (error) throw error;
      const stamp = data[0]?.generated_at;
      return data.filter(row => row.generated_at === stamp && row.risk_level === "high" && row.metadata?.knownOnly === false)
        .map(row => ({ date: row.target_date, generatedAt: row.generated_at, quality: row.data_quality, occupancy: Number(row.predicted_value), issuedOn: localDay.format(new Date(row.generated_at)) }));
    })
  ]);
  return { today, zone, board, work, approvals, money, stock, alerts };
}

export type CommandCenterData = Awaited<ReturnType<typeof loadCommandCenter>>;
