import { beforeEach, describe, expect, it, vi } from "vitest";

const schema = vi.hoisted(() => ({ modern: false, failure: null as null | { table: string; code: string; message: string } }));

// Use the real Supabase HTTP client so PostgREST schema errors reach staff-data
// in the same form as the deployed database. No hosted connection or writes.
vi.mock("@/lib/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "fictional-test-key", {
    auth: { persistSession: false }, global: { fetch: async (input: RequestInfo | URL) => {
      const url = new URL(String(input)), table = url.pathname.split("/").at(-1)!;
      const selected = url.searchParams.get("select") ?? "*";
      const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (schema.failure?.table === table) return response(schema.failure, 500);
      if (!schema.modern && table === "guests" && selected.includes("merged_into_guest_id")) return response({ code: "42703", message: "column guests.merged_into_guest_id does not exist" }, 400);
      if (!schema.modern && table === "guest_aliases") return response({ code: "PGRST205", message: "Could not find the table 'public.guest_aliases' in the schema cache" }, 404);
      if (!schema.modern && table === "guest_operational_flags") return response({ code: "PGRST205", message: "Could not find the table 'public.guest_operational_flags' in the schema cache" }, 404);
      if (!schema.modern && table === "reservation_guests" && (selected.includes("removed_at") || url.searchParams.has("removed_at"))) return response({ code: "42703", message: "column reservation_guests.removed_at does not exist" }, 400);
      const guests = [{ id: "G-A", name: "Fictional guest A" }, { id: "G-B", name: "Fictional guest B" }];
      const tables: Record<string, Record<string, unknown>[]> = {
        guests: schema.modern ? [...guests.map(row => ({ ...row, merged_into_guest_id: null })), { id: "G-OLD", name: "Old alias", merged_into_guest_id: "G-A" }] : guests,
        guest_aliases: [{ source_guest_id: "G-OLD", survivor_guest_id: "G-A", alias_type: "guest_id", display_value: "Old reference" }],
        reservations: [{ id: "R-A", guest_id: "G-A", status: "checked_out", check_out: "2026-10-01" }, { id: "R-OLD", guest_id: "G-OLD", status: "checked_out", check_out: "2026-11-01" }, { id: "R-B", guest_id: "G-B", status: "confirmed", check_in: "2026-11-10" }, { id: "R-REMOVED", guest_id: "G-B", status: "checked_out" }],
        guest_operational_flags: [{ id: "flag-1", guest_id: "G-A", flag_type: "vip" }, { id: "flag-2", guest_id: "G-B", flag_type: "do_not_rent", expires_at: "2020-01-01" }],
        reservation_guests: [{ reservation_id: "R-B", guest_id: "G-A", role: "accompanying", removed_at: null }, ...(schema.modern ? [{ reservation_id: "R-REMOVED", guest_id: "G-A", role: "accompanying", removed_at: "2026-11-01" }] : [])],
        invoices: [{ reservation_id: "R-A", amount: 100, paid: 100, balance: 0 }, { reservation_id: "R-OLD", amount: 50, paid: 50, balance: 0 }, { reservation_id: "R-B", amount: 999, paid: 0, balance: 999 }],
      };
      let rows = tables[table] ?? [];
      for (const [field, filter] of url.searchParams) {
        if (filter.startsWith("eq.")) rows = rows.filter(row => String(row[field]) === filter.slice(3));
        if (filter.startsWith("in.(")) rows = rows.filter(row => filter.slice(4, -1).split(",").includes(String(row[field])));
        if (filter === "is.null") rows = rows.filter(row => row[field] == null);
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? rows.length);
      return response(rows.slice(offset, offset + limit));
    } },
  }) };
});

import { getStaffGuestDirectory, getStaffGuestProfile, listForRole } from "@/lib/staff-data";

beforeEach(() => { schema.modern = false; schema.failure = null; });

describe("Guest Management across the deployed and upgraded schemas", () => {
  it("summarizes canonical stays and active flag types with a legacy fallback for the flag table", async () => {
    const legacy = await getStaffGuestDirectory("2026-11-10");
    expect(legacy.flagsAvailable).toBe(false);
    expect(legacy.rows[0]).toMatchObject({ guest: { id: "G-A" }, lastCheckout: "2026-10-01" });

    schema.modern = true;
    const upgraded = await getStaffGuestDirectory("2026-11-10");
    expect(upgraded.flagsAvailable).toBe(true);
    expect(upgraded.rows).toMatchObject([
      { guest: { id: "G-A", merge_alias_search: "Old reference" }, lastCheckout: "2026-11-01", flags: ["vip"] },
      { guest: { id: "G-B" }, arrivingToday: true, flags: [] },
    ]);

    schema.failure = { table: "guest_operational_flags", code: "42501", message: "Permission denied" };
    await expect(getStaffGuestDirectory("2026-11-10")).rejects.toMatchObject({ code: "42501" });
  });

  it("loads legacy guest records when merge tables have not been deployed", async () => {
    const guests = await listForRole("guests", "front_desk");
    expect(guests.map(row => row.id)).toEqual(["G-A", "G-B"]);
    expect(guests.every(row => row.merge_alias_search === "")).toBe(true);
  });

  it("opens legacy profiles and companion history without assigning companion folios", async () => {
    const profile = await getStaffGuestProfile("G-A", "front_desk");
    expect(profile?.guest.id).toBe("G-A");
    expect(profile?.stays.map(row => row.id)).toEqual(["R-A"]);
    expect(profile?.partyHistory.map(row => row.id)).toEqual(["R-B"]);
    expect(profile?.financial?.billed).toBe(100);
    expect(profile?.mergedAliases).toEqual([]);
    expect(await getStaffGuestProfile("G-MISSING", "front_desk")).toBeNull();
  });

  it("retains alias search, canonical history and removal filtering after upgrade", async () => {
    schema.modern = true;
    const guests = await listForRole("guests", "manager");
    expect(guests.map(row => row.id)).toEqual(["G-A", "G-B"]);
    expect(guests[0].merge_alias_search).toBe("Old reference");
    const profile = await getStaffGuestProfile("G-OLD", "manager");
    expect(profile?.guest.id).toBe("G-A");
    expect(profile?.stays.map(row => row.id)).toEqual(["R-A", "R-OLD"]);
    expect(profile?.partyHistory.map(row => row.id)).toEqual(["R-B"]);
    expect(profile?.financial?.billed).toBe(150);
  });

  it("does not hide base read, permission or unrelated-column failures", async () => {
    for (const code of ["42501", "08006", "42703"]) {
      schema.failure = { table: "guests", code, message: "Guest base column unavailable" };
      await expect(listForRole("guests", "front_desk")).rejects.toMatchObject({ code });
      await expect(getStaffGuestProfile("G-A", "front_desk")).rejects.toMatchObject({ code });
    }
  });

  it("does not conceal alias failures when merge support is present", async () => {
    schema.modern = true;
    schema.failure = { table: "guest_aliases", code: "PGRST205", message: "Alias schema unexpectedly unavailable" };
    await expect(listForRole("guests", "manager")).rejects.toMatchObject({ code: "PGRST205" });
    await expect(getStaffGuestProfile("G-A", "manager")).rejects.toMatchObject({ code: "PGRST205" });
  });
});
