export type Role = "owner" | "admin" | "manager" | "front_desk" | "housekeeping" | "maintenance" | "accounting" | "guest";

export type Resource = "reservations" | "rooms" | "guests" | "guest_requests" | "housekeeping_tasks" | "maintenance_orders" | "invoices" | "payments" | "refunds" | "inventory" | "staff";

// Accounting workspaces. Deliberately not Resources: the generic /api/resources CRUD surface must
// never reach financial ledger tables, which are only mutated through the accounting RPCs.
export type AccountingSection = "transactions" | "folios" | "cash_shifts" | "reconciliation" | "documents";
// Manager-only workspaces beyond the generic resource CRUD surface (approvals) and
// catalog maintenance that self-fetches /api/catalog/* (room_types; transport_services added with F3).
export type ManagerSection = "approvals" | "room_types" | "transport_services";
export interface RecordItem { id: string; [key: string]: string | number | boolean | null | undefined; }
export interface AccountingMetrics { grossCollected: number; refundsIssued: number; netRevenue: number; outstandingBalance: number; folioCredit: number; pendingVerification: number; pendingRefunds: number; failedRefunds: number; openCashShifts: number; unreconciledShifts: number; cashVariance: number; openReconciliationVariance: number }
export interface DashboardData {
  metrics: { occupancy: number; arrivals: number; departures: number; revenue: number; openTasks: number; availableRooms: number; onlineBookings: number; inHouse: number; unassignedArrivals: number; dirtyRooms: number; outOfServiceRooms: number; openRequests: number; balancesAttention: number; roomsCleaning:number; roomsAwaitingInspection:number; overdueHousekeeping:number; openMaintenance:number; criticalMaintenance:number; overdueRequests:number; escalatedIssues:number; pendingApprovals:number; collectionsToday:number; depositsReceived:number; refundSummary:number; outstandingBalances:number };
  occupancyTrend: { day: string; occupancy: number }[];
  roomMix: { name: string; value: number; color: string }[];
  recentReservations: RecordItem[];
  notifications: { id: string; title: string; detail: string; section: Resource | AccountingSection | ManagerSection; createdAt?: string }[];
}
