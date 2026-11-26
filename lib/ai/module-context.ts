import { getAnalyticsInputs } from "@/lib/analytics/data";
import { forecastOccupancy } from "@/lib/analytics/occupancy";
import { shiftDate } from "@/lib/analytics/types";
import { guestRequestSummary, transportationSummary } from "@/lib/ai/tools";
import { maintenanceBlockedRoomIds, roomBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";
import type { ModuleContext, ModuleFact } from "./module-metadata";

// Server-only: deterministic, PII-free Front Desk facts. Gemini never queries
// the database and never becomes the source of a displayed value.
export async function buildFrontDeskContext(now = new Date()): Promise<ModuleContext> {
  const inputs = await getAnalyticsInputs();
  const today = inputs.today;
  const tomorrow = shiftDate(today, 1);
  const [requests, transportation] = await Promise.all([guestRequestSummary(), transportationSummary()]);
  const activeRooms = inputs.rooms.filter((room) => room.administratively_active !== false);
  const countRooms = (...statuses: string[]) => activeRooms.filter((room) => statuses.includes(room.status)).length;
  const boardRooms: RackRoom[] = inputs.rooms.map((room) => ({
    ...room, floor: null, type: "", housekeeping: room.housekeeping ?? "unknown"
  }));
  const boardStays = inputs.reservations.map((reservation): RackReservation => ({
    ...reservation, room_type: reservation.room_type ?? ""
  }));
  const blockedRooms = maintenanceBlockedRoomIds(inputs.orders, boardRooms);
  const readyRooms = boardRooms.filter((room) => roomBoardState(room, boardStays, today, blockedRooms).state === "available").length;
  const countReservations = (field: "check_in" | "check_out", date: string) =>
    inputs.reservations.filter(
      (reservation) => ["confirmed", "checked_in"].includes(reservation.status) && reservation[field] === date
    ).length;

  const occupancy = forecastOccupancy({ reservations: inputs.reservations, rooms: activeRooms, today });
  const tonight = occupancy.days[0];
  const tomorrowDay = occupancy.days[1];
  const asOf = now.toISOString();
  const fact = (
    id: string,
    label: string,
    display: string,
    basis: ModuleFact["basis"],
    source: string,
    note?: string
  ): ModuleFact => ({ id, label, display, basis, source, asOf, ...(note ? { note } : {}) });

  return {
    moduleId: "front_desk",
    generatedAt: asOf,
    facts: [
      fact("front_desk.date", "Operating date", today, "FACT", "HAVEN hotel calendar"),
      fact(
        "front_desk.arrivals_today",
        "Arrivals today",
        String(countReservations("check_in", today)),
        "FACT",
        "HAVEN reservations"
      ),
      fact(
        "front_desk.departures_today",
        "Departures today",
        String(countReservations("check_out", today)),
        "FACT",
        "HAVEN reservations"
      ),
      fact(
        "front_desk.arrivals_tomorrow",
        "Arrivals tomorrow",
        String(countReservations("check_in", tomorrow)),
        "FACT",
        "HAVEN reservations"
      ),
      fact(
        "front_desk.departures_tomorrow",
        "Departures tomorrow",
        String(countReservations("check_out", tomorrow)),
        "FACT",
        "HAVEN reservations"
      ),
      fact("front_desk.in_house", "In-house rooms", String(countRooms("occupied")), "FACT", "HAVEN room inventory"),
      fact("front_desk.rooms_ready", "Rooms ready", String(readyRooms), "FACT", "HAVEN room board"),
      fact("front_desk.rooms_dirty", "Rooms dirty", String(countRooms("dirty")), "FACT", "HAVEN room inventory"),
      fact(
        "front_desk.rooms_maintenance",
        "Rooms unavailable for maintenance",
        String(countRooms("maintenance", "out_of_service")),
        "FACT",
        "HAVEN room inventory"
      ),
      fact(
        "front_desk.occupancy_tonight",
        "Booked occupancy tonight",
        `${tonight.knownOccupancyPct}% booked`,
        "FACT",
        "HAVEN occupancy model",
        `${tonight.knownOccupied} of ${tonight.totalRooms} active rooms booked for tonight.`
      ),
      fact(
        "front_desk.occupancy_tomorrow",
        "Occupancy forecast tomorrow",
        tomorrowDay.predictedOccupancyPct === undefined ? "Prediction not available" : `${tomorrowDay.predictedOccupancyPct}% predicted`,
        "PREDICTION",
        "HAVEN occupancy model",
        tomorrowDay.predictedOccupancyPct === undefined
          ? `${tomorrowDay.dataQuality} data quality; only ${tomorrowDay.basisObservations} historical observations, so HAVEN did not publish a forecast.`
          : `${tomorrowDay.dataQuality} data quality; ${tomorrowDay.basisObservations} historical observations.`
      ),
      fact(
        "front_desk.guest_requests_open",
        "Open guest requests",
        String(requests.open),
        "FACT",
        "HAVEN guest requests"
      ),
      fact(
        "front_desk.guest_requests_escalated",
        "Escalated guest requests",
        String(requests.escalated),
        "FACT",
        "HAVEN guest requests"
      ),
      fact(
        "front_desk.transportation_pending",
        "Pending transportation requests",
        String(transportation.pending),
        "FACT",
        "HAVEN transportation requests"
      ),
      fact(
        "front_desk.maintenance_open",
        "Open maintenance orders",
        String(inputs.orders.filter((order) => !["resolved", "cancelled"].includes(order.status)).length),
        "FACT",
        "HAVEN maintenance"
      )
    ]
  };
}
