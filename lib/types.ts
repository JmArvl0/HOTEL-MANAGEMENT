export type Role = "owner" | "admin" | "manager" | "front_desk" | "housekeeping" | "maintenance" | "accounting" | "guest";

export type Resource = "reservations" | "rooms" | "guests" | "housekeeping_tasks" | "maintenance_orders" | "invoices" | "inventory" | "staff";

export interface RecordItem {
  id: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface DashboardData {
  metrics: { occupancy: number; arrivals: number; departures: number; revenue: number; openTasks: number; availableRooms: number };
  occupancyTrend: { day: string; occupancy: number }[];
  roomMix: { name: string; value: number; color: string }[];
  recentReservations: RecordItem[];
}
