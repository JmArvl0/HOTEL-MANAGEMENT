import type { RecordItem, Resource } from "@/lib/types";

const today = new Date();
const iso = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

const seed: Record<Resource, RecordItem[]> = {
  reservations: [
    { id: "RSV-1048", guest_name: "Ava Thompson", room_number: "401", room_type: "Ocean Suite", check_in: iso(0), check_out: iso(3), guests: 2, status: "confirmed", total: 26700, source: "Direct" },
    { id: "RSV-1047", guest_name: "Marcus Chen", room_number: "205", room_type: "Deluxe King", check_in: iso(0), check_out: iso(2), guests: 1, status: "checked_in", total: 12800, source: "Online" },
    { id: "RSV-1046", guest_name: "Samantha Lee", room_number: "—", room_type: "Garden Twin", check_in: iso(1), check_out: iso(4), guests: 3, status: "pending", total: 17400, source: "Phone" },
    { id: "RSV-1045", guest_name: "Oliver Wilson", room_number: "302", room_type: "Executive Suite", check_in: iso(-2), check_out: iso(0), guests: 2, status: "checked_in", total: 23200, source: "Corporate" }
  ],
  rooms: [
    { id: "RM-101", number: "101", floor: 1, type: "Deluxe King", rate: 6400, status: "available", housekeeping: "clean" },
    { id: "RM-102", number: "102", floor: 1, type: "Garden Twin", rate: 5800, status: "occupied", housekeeping: "clean" },
    { id: "RM-201", number: "201", floor: 2, type: "Deluxe King", rate: 6400, status: "dirty", housekeeping: "dirty" },
    { id: "RM-205", number: "205", floor: 2, type: "Deluxe King", rate: 6400, status: "occupied", housekeeping: "clean" },
    { id: "RM-302", number: "302", floor: 3, type: "Executive Suite", rate: 11600, status: "occupied", housekeeping: "clean" },
    { id: "RM-305", number: "305", floor: 3, type: "Garden Twin", rate: 5800, status: "maintenance", housekeeping: "inspection" },
    { id: "RM-401", number: "401", floor: 4, type: "Ocean Suite", rate: 8900, status: "reserved", housekeeping: "clean" },
    { id: "RM-402", number: "402", floor: 4, type: "Ocean Suite", rate: 8900, status: "available", housekeeping: "clean" }
  ],
  guests: [
    { id: "GST-2041", name: "Ava Thompson", email: "ava@example.com", phone: "+63 917 555 0142", loyalty_tier: "Gold", stays: 8, preferences: "High floor, feather-free" },
    { id: "GST-2040", name: "Marcus Chen", email: "marcus@example.com", phone: "+63 918 555 0188", loyalty_tier: "Silver", stays: 4, preferences: "Late checkout" },
    { id: "GST-2039", name: "Samantha Lee", email: "sam@example.com", phone: "+63 905 555 0117", loyalty_tier: "Member", stays: 2, preferences: "Connecting rooms" }
  ],
  housekeeping_tasks: [
    { id: "HKT-501", room_number: "201", task: "Checkout clean", assignee: "Ana Cruz", priority: "high", status: "in_progress", due: "11:30 AM" },
    { id: "HKT-502", room_number: "401", task: "Arrival inspection", assignee: "Ben Flores", priority: "normal", status: "pending", due: "1:00 PM" },
    { id: "HKT-503", room_number: "102", task: "Turndown service", assignee: "Ana Cruz", priority: "normal", status: "pending", due: "5:00 PM" }
  ],
  maintenance_orders: [
    { id: "MWO-301", room_number: "305", issue: "Air-conditioning not cooling", category: "HVAC", assignee: "Carlo Diaz", priority: "urgent", status: "in_progress", created_at: iso(-1) },
    { id: "MWO-302", room_number: "Lobby", issue: "Replace pendant light", category: "Electrical", assignee: "Ramon Yu", priority: "normal", status: "open", created_at: iso(0) }
  ],
  invoices: [
    { id: "INV-7801", reservation_id: "RSV-1047", guest_name: "Marcus Chen", amount: 12800, paid: 6400, balance: 6400, status: "partial", method: "Credit card" },
    { id: "INV-7800", reservation_id: "RSV-1045", guest_name: "Oliver Wilson", amount: 23200, paid: 23200, balance: 0, status: "paid", method: "Corporate" },
    { id: "INV-7799", reservation_id: "RSV-1048", guest_name: "Ava Thompson", amount: 26700, paid: 8900, balance: 17800, status: "deposit", method: "Credit card" }
  ],
  inventory: [
    { id: "INVTRY-101", name: "Bath towels", category: "Linen", quantity: 84, reorder_point: 60, unit: "pcs", status: "healthy" },
    { id: "INVTRY-102", name: "Shampoo 40ml", category: "Amenities", quantity: 42, reorder_point: 80, unit: "bottles", status: "low" },
    { id: "INVTRY-103", name: "Queen sheet set", category: "Linen", quantity: 28, reorder_point: 24, unit: "sets", status: "healthy" },
    { id: "INVTRY-104", name: "Coffee capsules", category: "Minibar", quantity: 110, reorder_point: 100, unit: "pcs", status: "healthy" }
  ],
  staff: [
    { id: "STF-101", name: "Maya Reyes", role: "Manager", department: "Operations", shift: "Morning", status: "on_duty", attendance: "On time" },
    { id: "STF-102", name: "Liam Cruz", role: "Front Desk", department: "Front Office", shift: "Morning", status: "on_duty", attendance: "On time" },
    { id: "STF-103", name: "Ana Cruz", role: "Room Attendant", department: "Housekeeping", shift: "Morning", status: "on_duty", attendance: "On time" },
    { id: "STF-104", name: "Carlo Diaz", role: "Technician", department: "Maintenance", shift: "Morning", status: "on_duty", attendance: "Late 8m" }
  ]
};

const store = globalThis as typeof globalThis & { __hotelStore?: typeof seed };
export const demoStore = store.__hotelStore ?? structuredClone(seed);
if (process.env.NODE_ENV !== "production") store.__hotelStore = demoStore;

export function makeId(resource: Resource) {
  const prefix: Record<Resource, string> = { reservations: "RSV", rooms: "RM", guests: "GST", housekeeping_tasks: "HKT", maintenance_orders: "MWO", invoices: "INV", inventory: "INVTRY", staff: "STF" };
  return `${prefix[resource]}-${Math.floor(1000 + Math.random() * 9000)}`;
}
