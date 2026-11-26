import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { Role } from "@/lib/types";

const state = vi.hoisted(() => ({
  role: "guest" as Role, actor: "guest-1", signedIn: true,
  tables: {} as Record<string, Record<string, unknown>[]>, reads: [] as string[],
}));
vi.mock("@/lib/authorization", () => ({ getAuthenticatedSession: async () => state.signedIn ? { user: { id: state.actor, role: state.role } } : null }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => {
  state.reads.push(table);
  let entries = [...(state.tables[table] ?? [])];
  const query = {
    select: () => query, order: () => query, returns: () => query,
    eq: (field: string, value: unknown) => { entries = entries.filter(row => row[field] === value); return query; },
    gte: (field: string, value: string) => { entries = entries.filter(row => String(row[field]) >= value); return query; },
    in: (field: string, values: unknown[]) => { entries = entries.filter(row => values.includes(row[field])); return query; },
    limit: (n: number) => { entries = entries.slice(0, n); return query; },
    maybeSingle: async () => ({ data: entries[0] ?? null, error: null }),
    range: async (from: number, to: number) => ({ data: entries.slice(from, to + 1), error: null }),
    then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise.resolve({ data: entries, error: null }).then(resolve),
  };
  return query;
} } }));

import { GET } from "@/app/api/documents/[kind]/[id]/route";
import { readCheckoutFolio } from "@/lib/hotel-document-data";
import { renderHotelDocument } from "@/lib/hotel-document-pdf";

const read = (kind: string, id: string) => GET(new Request("http://localhost/documents"), { params: Promise.resolve({ kind, id }) });
const checkedOut = "2026-11-23T05:00:00Z";
beforeEach(() => {
  state.role = "guest"; state.actor = "guest-1"; state.signedIn = true; state.reads = [];
  state.tables = {
    reservations: [
      { id: "RSV-1", user_id: "guest-1", status: "confirmed", guest_name: "Alex Peña", confirmation_number: "HAVEN-1", room_type: "Deluxe King", check_in: "2026-11-20", check_out: "2026-11-23", guests: 2, total: 12600 },
      { id: "RSV-2", user_id: "guest-1", status: "checked_out", checked_out_at: checkedOut },
      { id: "RSV-OTHER", user_id: "guest-2", status: "confirmed" },
      { id: "RSV-PENDING", user_id: "guest-1", status: "pending" },
    ],
    payments: [{ reservation_id: "RSV-1", purpose: "reservation_deposit", status: "paid", amount: 4200 }],
    financial_documents: [
      { reservation_id: "RSV-2", document_type: "folio", document_number: "FOL-DRAFT", created_at: "2026-11-22T06:00:00Z", snapshot: { balance: 200 } },
      { reservation_id: "RSV-2", document_type: "folio", document_number: "FOL-2", created_at: "2026-11-23T06:00:00Z", snapshot: {
        guestName: "Alex Peña", confirmationNumber: "HAVEN-2", folioAmount: 1900, paid: 1900, balance: 0, creditBalance: 0,
        charges: [{ amount: 400, description: "Breakfast", status: "posted", postedAt: checkedOut }],
        adjustments: [{ reason: "Internal note fixture", transactionType: "Credit", amount: 100, direction: "credit" }],
        payments: [{ amount: 1900, purpose: "payment", reference: "Provider reference fixture" }],
      } },
    ],
    cash_shifts: [
      { id: "open", status: "open", staff_user_id: "cashier" },
      { id: "recent", status: "closed", staff_user_id: "cashier", closed_at: checkedOut, expected_cash: 1100, actual_cash: 1090, opening_amount: 1000, variance: -10 },
      { id: "older-other", status: "closed", staff_user_id: "other", closed_at: checkedOut },
    ],
    user_accounts: [{ id: "cashier", name: "Fixture Cashier" }],
    front_desk_reports: [{ id: "saved", report_date: "2026-11-23", status: "acknowledged", submitted_at: checkedOut,
      snapshot: { reservations: { arrivals: 3, departures: 1, created: 2, cancelled: 0, noShow: 0 }, collections: { total: 400 }, guestRequests: { opened: 2, escalated: 0 } } }],
  };
});

describe("hotel PDF downloads", () => {
  it("checks the session and role before accessing data", async () => {
    state.signedIn = false;
    expect((await read("booking-confirmation", "RSV-1")).status).toBe(401);
    state.signedIn = true;
    expect((await read("daily-operations-report", "saved")).status).toBe(403);
    expect((await read("cash-shift-close", "recent")).status).toBe(403);
    expect(state.reads).toEqual([]);
  });

  it("permits only the booking owner and only a confirmed or in-house stay", async () => {
    expect((await read("booking-confirmation", "RSV-OTHER")).status).toBe(404);
    expect((await read("booking-confirmation", "RSV-PENDING")).status).toBe(404);
    const response = await read("booking-confirmation", "RSV-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="haven-booking-confirmation-HAVEN-1.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBe(1);
  });

  it("serves the issued post-checkout record and omits internal notes and provider references", async () => {
    const view = await readCheckoutFolio("RSV-2", "guest-1");
    expect(view?.reference).toBe("FOL-2");
    expect(JSON.stringify(view)).not.toMatch(/FOL-DRAFT|Internal note fixture|Provider reference fixture/);
    expect(JSON.stringify(view)).toContain("PHP 0.00");
    expect((await read("checkout-folio", "RSV-2")).status).toBe(200);
    state.actor = "guest-2";
    expect((await read("checkout-folio", "RSV-2")).status).toBe(404);
  });

  it("rejects open or out-of-scope drawers and exports an authorized closed shift", async () => {
    state.role = "front_desk"; state.actor = "cashier";
    expect((await read("cash-shift-close", "open")).status).toBe(404);
    expect((await read("cash-shift-close", "older-other")).status).toBe(404);
    expect((await read("cash-shift-close", "recent")).status).toBe(200);
  });

  it("only generates an operations PDF from a saved report, including older snapshots", async () => {
    state.role = "manager";
    const response = await read("daily-operations-report", "saved");
    expect(response.status).toBe(200);
    expect((await PDFDocument.load(await response.arrayBuffer())).getTitle()).toBe("Daily Operations Report");
    expect((await read("daily-operations-report", "2026-11-23")).status).toBe(404);
  });

  it("preserves long folio tables across pages", async () => {
    const view = await readCheckoutFolio("RSV-2", "guest-1");
    expect(view).toBeTruthy();
    const pdf = await renderHotelDocument({ ...view!, sections: [{ title: "Charges", table: { headings: ["Description", "Amount"], rows: Array.from({ length: 70 }, (_, n) => [`Charge ${n}`, "PHP 250.00"]) } }] });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(2);
  });
});
