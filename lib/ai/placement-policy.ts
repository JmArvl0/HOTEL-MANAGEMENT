import type { Role } from "@/lib/types";
import type { AiModuleId } from "./module-metadata";
import placementMap from "@/public/prototypes/haven-ai-system-preview-data.json";

export type Placement = { name: string; purpose: string; description: string };
const STAFF_ROLES = ["front_desk", "housekeeping", "maintenance", "accounting", "manager", "owner", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];
const placements = placementMap as Record<StaffRole, Placement[]>;

export function allStaffPlacements(): { role: Role; module: Placement }[] {
  return STAFF_ROLES.flatMap((role) => placements[role].map((module) => ({ role, module })));
}

export function placementForRole(role: Role, moduleName: string): Placement | null {
  if (role === "guest" || (role === "manager" && moduleName === "HAVEN AI")) return null;
  return placements[role]?.find(({ name }) => name.toLowerCase() === moduleName.toLowerCase()) ?? null;
}

export function placementModuleId(role: Role, moduleName: string): string {
  return `${role}_${moduleName.toLowerCase().normalize("NFKD").replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")}`;
}

const directContexts: Partial<Record<string, AiModuleId>> = {
  "Bookings": "front_desk", "Room Management": "front_desk", "Transportation": "front_desk",
  "Housekeeping": "housekeeping", "Maintenance": "maintenance", "Inventory": "inventory",
  "Guest Requests": "guest_requests", "Lost & Found": "lost_found",
  "Deposit Verification": "accounting", "Refunds": "accounting", "Financial Documents": "accounting",
};

export function contextIdForPlacement(role: Role, moduleName: string): AiModuleId | null {
  if (!placementForRole(role, moduleName)) return null;
  if (["Dashboard", "Hotel Operations", "Operational Handover"].includes(moduleName)) {
    return ({ front_desk: "front_desk", housekeeping: "housekeeping", maintenance: "maintenance", accounting: "accounting", manager: "front_desk" } as Partial<Record<Role, AiModuleId>>)[role] ?? null;
  }
  return directContexts[moduleName] ?? null;
}

const OUTSIDE_SCOPE = "I can help with HAVEN hotel operations in modules your account can access. Ask about a hotel task without personal details, code, or secrets.";

export function validateHotelQuestion(question: string): { ok: boolean; reason?: string } {
  const value = question.trim();
  if (value.length < 3 || value.length > 600) return { ok: false, reason: "Enter a hotel-work question of 3–600 characters." };
  if (/\b(?:python|javascript|typescript|programming|source code|sql query|shell script|powershell|homework|essay|recipe|poem|song lyrics)\b/i.test(value)) return { ok: false, reason: OUTSIDE_SCOPE };
  if (/\b(?:write|generate|create|build|debug|fix)\b.{0,45}\b(?:code|script|program|website|app)\b/i.test(value)) return { ok: false, reason: OUTSIDE_SCOPE };
  if (/\b(?:give|show|reveal|print|export|list|send)\b.{0,45}\b(?:api key|password|secret|token|credential|private key)\b/i.test(value)) return { ok: false, reason: OUTSIDE_SCOPE };
  if (/\b(?:my vacation|my class|my homework|my personal|personal use)\b/i.test(value)) return { ok: false, reason: OUTSIDE_SCOPE };
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value) || /\b(?:\+?\d[\d\s().-]{8,}\d)\b/.test(value)) return { ok: false, reason: "Remove personal contact or payment details before asking HAVEN AI." };
  return { ok: true };
}
