// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LocationContentPanel from "./location-content-panel";
import { testHotel, testPlace } from "@/tests/fixtures/location-content";
import type { LocationEditorData } from "@/lib/location-content";

let data: LocationEditorData, writes: Record<string, unknown>[], failSave = false;
beforeEach(() => {
  data = { hotel: testHotel, categories: [{ id: "00000000-0000-4000-8000-000000000020", name: "Dining", slug: "dining", status: "published", sort_order: 0, version: 0, updated_at: "2026-11-06" }], places: [], routes: [], images: [] }; writes = []; failSave = false;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method) return new Response(JSON.stringify({ data }));
    const payload = JSON.parse(String(init.body)); writes.push(payload);
    if (failSave) return new Response(JSON.stringify({ error: "This content changed in another session. Refresh and reopen it." }), { status: 409 });
    if (init.method === "POST" && payload.kind === "category") data = { ...data, categories: [...data.categories, { ...payload.body, id: "00000000-0000-4000-8000-000000000021", version: 1, updated_at: "2026-11-06" }] };
    if (init.method === "DELETE") data = { ...data, categories: data.categories.filter(row => row.id !== payload.id) };
    return new Response(JSON.stringify({ data: {} }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function categories() { render(<LocationContentPanel />); await screen.findByText("Demo location"); fireEvent.click(screen.getByRole("button", { name: "Categories" })); }
describe("admin location content editor", () => {
  it("creates and publishes a category with explicit ordering", async () => {
    await categories(); fireEvent.click(screen.getByRole("button", { name: /Add category/ })); const dialog = screen.getByRole("dialog", { name: "Add category" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Shopping" } }); fireEvent.change(within(dialog).getByLabelText(/Category slug/), { target: { value: "shopping" } }); fireEvent.change(within(dialog).getByLabelText("Publication status"), { target: { value: "published" } }); fireEvent.change(within(dialog).getByLabelText(/Display order/), { target: { value: "3" } }); fireEvent.click(within(dialog).getByRole("button", { name: "Save and publish" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add category" })).toBeNull()); expect(screen.getByRole("heading", { name: "Shopping" })).toBeTruthy(); expect(writes[0]).toEqual(expect.objectContaining({ kind: "category", id: null, version: 0, body: expect.objectContaining({ slug: "shopping", status: "published", sort_order: 3 }) }));
  });
  it("retains edits after a stale save instead of silently overwriting", async () => {
    await categories(); fireEvent.click(screen.getByRole("button", { name: "Edit" })); const dialog = screen.getByRole("dialog", { name: "Edit category" }); fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Dining revised" } }); failSave = true; fireEvent.click(within(dialog).getByRole("button", { name: "Save and publish" })); await screen.findByText(/changed in another session/); expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("Dining revised"); expect(writes[0].version).toBe(0);
  });
  it("requires delete confirmation, allows cancellation, then deletes the selected version", async () => {
    await categories(); fireEvent.click(screen.getByRole("button", { name: "Delete" })); let dialog = screen.getByRole("dialog", { name: "Delete this category?" }); expect(writes.length).toBe(0); fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); expect(writes.length).toBe(0); fireEvent.click(screen.getByRole("button", { name: "Delete" })); dialog = screen.getByRole("dialog", { name: "Delete this category?" }); fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })); await waitFor(() => expect(writes.length).toBe(1)); expect(writes[0]).toEqual({ kind: "category", id: "00000000-0000-4000-8000-000000000020", version: 0 });
  });
  it("keeps legacy demo fields removable after switching the hotel to client mode", async () => {
    data.hotel = { ...testHotel, is_demo: false }; data.places = [{ ...testPlace, category_id: data.categories[0].id }];
    render(<LocationContentPanel />); await screen.findByText("Demo location");
    fireEvent.click(screen.getByRole("button", { name: "Nearby places" })); fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit nearby place" });
    const search = within(dialog).getByLabelText(/Demo category search/), photo = within(dialog).getByLabelText(/AI sample photo/);
    fireEvent.change(search, { target: { value: "" } }); fireEvent.change(photo, { target: { value: "" } });
    fireEvent.change(within(dialog).getByLabelText("Publication status"), { target: { value: "draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes.length).toBe(1)); expect(writes[0]).toEqual(expect.objectContaining({ body: expect.objectContaining({ maps_search: "", sample_image: null }) }));
  });
});
