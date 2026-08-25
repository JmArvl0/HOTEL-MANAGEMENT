import type { Resource, Role } from "@/lib/types";

const access: Record<Role, Resource[]> = {
  owner: ["reservations", "rooms", "guests", "housekeeping_tasks", "maintenance_orders", "invoices", "inventory", "staff"],
  admin: ["reservations", "rooms", "guests", "housekeeping_tasks", "maintenance_orders", "invoices", "inventory", "staff"],
  manager: ["reservations", "rooms", "guests", "housekeeping_tasks", "maintenance_orders", "invoices", "inventory", "staff"],
  front_desk: ["reservations", "rooms", "guests", "housekeeping_tasks", "invoices"],
  housekeeping: ["rooms", "housekeeping_tasks", "inventory"],
  maintenance: ["rooms", "maintenance_orders", "inventory"],
  accounting: ["reservations", "guests", "invoices", "inventory"],
  guest: ["reservations", "invoices"]
};

export const canAccess = (role: Role, resource: Resource) => access[role]?.includes(resource) ?? false;
