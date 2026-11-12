// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_WEBSITE_CONTENT } from "@/lib/website-content";
import WebsiteContentPanel from "./website-content-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("retains stale edits and requires a successful save and reason before publishing", async () => {
  const original = structuredClone(DEFAULT_WEBSITE_CONTENT);
  let data = { draft: original, published: original, version: 1, published_version: 0, images: [], published_at: null };
  let rejectSave = true;
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method) return Response.json({ data, location: null });
    const body = JSON.parse(String(init.body));
    requests.push(body);
    if (body.action === "save" && rejectSave) return Response.json({ error: "Another editor saved a newer version." }, { status: 409 });
    if (body.action === "save") data = { ...data, draft: body.content, version: data.version + 1 };
    if (body.action === "publish") data = { ...data, published: data.draft, version: data.version + 1, published_version: data.version + 1 };
    return Response.json({ data });
  }));
  render(<WebsiteContentPanel />);
  const headline = await screen.findByRole("textbox", { name: "Hero headline" });
  const save = screen.getByRole("button", { name: "Save draft" });
  const review = screen.getByRole("button", { name: "Review & publish" });
  fireEvent.change(headline, { target: { value: "A quiet stay in {city}." } });
  expect(screen.getByRole("heading", { name: "A quiet stay in Manila." })).toBeTruthy();
  expect((review as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(save);
  expect((await screen.findByRole("alert")).textContent).toContain("Another editor saved a newer version");
  expect((headline as HTMLInputElement).value).toBe("A quiet stay in {city}.");
  expect(data.published.identity.headline).toBe(original.identity.headline);

  rejectSave = false;
  fireEvent.click(save);
  await screen.findByText(/Draft saved/);
  fireEvent.click(review);
  const row = within(screen.getByRole("table")).getByRole("row", { name: /identity \/ headline/i });
  expect(within(row).getByText(original.identity.headline)).toBeTruthy();
  expect(within(row).getByText("A quiet stay in {city}.")).toBeTruthy();
  const publish = screen.getByRole("button", { name: "Publish saved draft" });
  expect((publish as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Publication reason" }), { target: { value: "Reviewed demo headline" } });
  fireEvent.click(publish);
  await screen.findByText(/Website published/);
  expect(requests.at(-1)).toEqual({ action: "publish", version: 2, reason: "Reviewed demo headline" });
  expect(data.published.identity.headline).toBe("A quiet stay in {city}.");
});
