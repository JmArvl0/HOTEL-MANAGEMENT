import { z } from "zod";
import type { Role } from "@/lib/types";

export const OPERATIONAL_ROLES: Role[] = ["manager", "front_desk", "housekeeping", "maintenance", "accounting"];
export const LOST_FOUND_ROLES: Role[] = ["manager", "front_desk", "housekeeping"];
const id = z.string().uuid();
const version = z.number().int().positive();
const note = z.string().trim().min(3).max(500);
export const operationsAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule"), id, staffId: id, startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), note: z.string().trim().max(500).default("") }),
  z.object({ action: z.literal("cancel_schedule"), id, version, note }),
  z.object({ action: z.literal("handover"), id, summary: z.string().trim().min(3).max(1000), sourceType: z.enum(["reservation", "guest_request", "housekeeping", "maintenance", "cash_shift"]), sourceId: z.string().trim().min(1).max(80), followUpId: id }),
  z.object({ action: z.enum(["acknowledge", "resolve"]), id, version, note: z.string().trim().max(500).default("") })
]);
export const foundAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), id, description: z.string().trim().min(3).max(500), location: z.string().trim().min(2).max(120), foundAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.enum(["secure", "claim", "authorize_release", "reject_claim", "release", "dispose", "take_custody"]), id, version, note, identityVerified: z.boolean().default(false) })
]);
export type OperationalStaff = { id: string; name: string; role: Role };
export type RosterAssignment = { id: string; staff_user_id: string; department: string; starts_at: string; ends_at: string; note: string; status: string; version: number };
export type ShiftHandover = { id: string; summary: string; department: string; source_type: string; source_id: string; follow_up_user_id: string; submitted_by: string; submitted_at: string; acknowledged_at: string | null; resolved_at: string | null; resolution: string | null; version: number };
export type FoundItem = { id: string; description: string; found_location: string; found_at: string; storage_location: string | null; status: string; version: number; custodian_id: string; custodian_name?: string; claimant_note?: string | null };
export type FoundEvent = { id: string; item_id: string; action: string; note: string; actor_id: string; actor_name?: string; created_at: string };

export function manilaInputToIso(value: string): string {
  const parsed = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).safeParse(value);
  if (!parsed.success) throw new Error("Enter a valid date and time.");
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", "T") !== value) throw new Error("Enter a valid date and time.");
  return date.toISOString();
}

export function rosterWindowValid(start: string, end: string): boolean {
  const duration = Date.parse(end) - Date.parse(start);
  return Number.isFinite(duration) && duration > 0 && duration <= 24 * 60 * 60 * 1000;
}
