// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import WorkforcePanel from "./workforce-panel";
import type { WorkforceSnapshot } from "@/lib/workforce";

const userId = "11111111-1111-4111-8111-111111111111";
const snapshot = (extra: Partial<WorkforceSnapshot> = {}): WorkforceSnapshot => ({ generatedAt: new Date().toISOString(), scope: "self", canManage: false, receiverConfigured: false,
  settings: { sourceSystem: "workforce", propertyId: "haven", autoAssignCheckout: false, version: 1 }, unassignedCheckoutTasks: 2,
  staff: [{ userId, name: "Ana QA", role: "housekeeping", employeeId: null, linkId: null, status: "unmapped", shiftStartsAt: null, shiftEndsAt: null, observedAt: null, receivedAt: null, validUntil: null, openTasks: 0 }], ...extra });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function serve(data: WorkforceSnapshot) {
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => ({ ok: true, json: async () => options?.method === "POST" ? { data: { saved: true } } : { data } }));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
describe("Workforce availability interface", () => {
  it("shows an honest unconfigured state and pending checkout work", async () => {
    serve(snapshot()); render(<WorkforcePanel />);
    expect(await screen.findByText("Connection not configured")).toBeTruthy();
    expect(screen.getByText("Automatic checkout assignment off")).toBeTruthy();
    expect(screen.getByText("Employee not linked")).toBeTruthy();
    expect(screen.getByText(/2 checkout cleaning tasks awaiting assignment/)).toBeTruthy();
    expect(screen.queryByText("Configure connection and employee links")).toBeNull();
  });
  it("keeps ordinary staff on a compact personal shift view", async () => {
    serve(snapshot()); render(<WorkforcePanel compact />);
    expect(await screen.findByText("Employee not linked")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Your shift has not been received.")).toBeTruthy();
  });
  it("never presents expired evidence as on duty", async () => {
    const data = snapshot(); data.staff[0] = { ...data.staff[0], status: "on_duty", validUntil: new Date(Date.now()-1000).toISOString() };
    serve(data); render(<WorkforcePanel compact />);
    expect(await screen.findByText("Update expired")).toBeTruthy();
    expect(screen.queryByText("On duty")).toBeNull();
  });
  it("offers retry when unavailable and does not show cached availability badges", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Workforce data unavailable." }) })));
    render(<WorkforcePanel />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("On duty")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
  it("lets Admin submit an exact reviewed employee mapping", async () => {
    const fetcher = serve(snapshot({ canManage: true })); render(<WorkforcePanel />);
    const summary = await screen.findByText("Configure connection and employee links"); fireEvent.click(summary);
    fireEvent.change(screen.getByLabelText("Hotel staff account"), { target: { value: userId } });
    fireEvent.change(screen.getByLabelText("Workforce employee ID"), { target: { value: "EMP-123" } });
    fireEvent.change(screen.getByLabelText("Reason for mapping change"), { target: { value: "Reviewed with Workforce team" } });
    fireEvent.click(screen.getByRole("button", { name: "Link employee" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    const posted = fetcher.mock.calls.find(([, options]) => options?.method === "POST")?.[1];
    expect(JSON.parse(String(posted?.body))).toEqual({ action: "link", userId, employeeId: "EMP-123", reason: "Reviewed with Workforce team" });
    const settings = screen.getByLabelText("Automatically assign checkout cleaning") as HTMLInputElement;
    expect(settings.disabled).toBe(true);
  });
  it("shows staff, evidence expiry and unfinished workload in the read-only team view", async () => {
    const data=snapshot(); data.staff[0] = { ...data.staff[0], status:"on_duty",employeeId:"EMP-1",validUntil:new Date(Date.now()+600_000).toISOString(),observedAt:new Date().toISOString(),openTasks:3 };
    serve(data); render(<WorkforcePanel />); const table=await screen.findByRole("table");
    expect(within(table).getByText("On duty")).toBeTruthy(); expect(within(table).getByText("3")).toBeTruthy(); expect(within(table).getByText(/Valid until/)).toBeTruthy();
  });
  it("keeps names visible for a Manager viewing the compact queue panel", async () => {
    serve(snapshot({scope:"team"})); render(<WorkforcePanel compact />);
    fireEvent.click(await screen.findByText("Employee availability and shifts"));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByText("Ana QA")).toBeTruthy();
    expect(screen.queryByText("Configure connection and employee links")).toBeNull();
  });
});
