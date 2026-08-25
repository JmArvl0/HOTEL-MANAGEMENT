import { createClient } from "@supabase/supabase-js";
import { demoStore, makeId } from "@/lib/demo-store";
import type { DashboardData, RecordItem, Resource } from "@/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const databaseMode = url && key ? "supabase" : "demo";
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export async function list(resource: Resource): Promise<RecordItem[]> {
  if (!supabase) return demoStore[resource];
  const { data, error } = await supabase.from(resource).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as RecordItem[];
}

export async function create(resource: Resource, payload: Omit<RecordItem, "id">): Promise<RecordItem> {
  if (!supabase) {
    const item = { ...payload, id: makeId(resource) } as RecordItem;
    demoStore[resource].unshift(item);
    return item;
  }
  const { data, error } = await supabase.from(resource).insert(payload).select().single();
  if (error) throw error;
  return data as RecordItem;
}

export async function update(resource: Resource, id: string, payload: Partial<RecordItem>): Promise<RecordItem> {
  if (!supabase) {
    const index = demoStore[resource].findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Record not found");
    demoStore[resource][index] = { ...demoStore[resource][index], ...payload };
    return demoStore[resource][index];
  }
  const { data, error } = await supabase.from(resource).update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data as RecordItem;
}

export async function getDashboard(): Promise<DashboardData> {
  const [reservations, rooms, tasks, invoices] = await Promise.all([list("reservations"), list("rooms"), list("housekeeping_tasks"), list("invoices")]);
  const today = new Date().toISOString().slice(0, 10);
  const occupied = rooms.filter((r) => ["occupied", "reserved"].includes(String(r.status))).length;
  const revenue = invoices.reduce((sum, item) => sum + Number(item.paid || 0), 0);
  const counts = (status: string) => rooms.filter((r) => r.status === status).length;
  return {
    metrics: { occupancy: Math.round((occupied / Math.max(rooms.length, 1)) * 100), arrivals: reservations.filter((r) => r.check_in === today).length, departures: reservations.filter((r) => r.check_out === today).length, revenue, openTasks: tasks.filter((t) => t.status !== "completed").length, availableRooms: counts("available") },
    occupancyTrend: [{ day: "Mon", occupancy: 62 }, { day: "Tue", occupancy: 68 }, { day: "Wed", occupancy: 71 }, { day: "Thu", occupancy: 67 }, { day: "Fri", occupancy: 79 }, { day: "Sat", occupancy: 86 }, { day: "Sun", occupancy: Math.round((occupied / Math.max(rooms.length, 1)) * 100) }],
    roomMix: [{ name: "Occupied", value: counts("occupied"), color: "#1f6b52" }, { name: "Available", value: counts("available"), color: "#9ac8b8" }, { name: "Reserved", value: counts("reserved"), color: "#d79855" }, { name: "Service", value: counts("maintenance") + counts("dirty"), color: "#d7d4cb" }],
    recentReservations: reservations.slice(0, 5)
  };
}
