import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string; disabled?: boolean } }, account: { id: "00000000-0000-4000-8000-000000000010", role: "admin", active: true, recovery_required: false }, rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), download: vi.fn(), revalidate: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => state.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.account }) }) }) }), rpc: state.rpc, storage: { from: () => ({ upload: state.upload, remove: state.remove, download: state.download }) } } }));
import { GET, POST, DELETE } from "@/app/api/admin/location/route";
import { POST as uploadImage } from "@/app/api/admin/location/images/route";
import { GET as readImage } from "@/app/api/location/images/[id]/route";
import sharp from "sharp";
const request = (body: unknown) => new Request("https://hotel.invalid/api/admin/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.session = { user: { id: state.account.id, role: "admin" } }; state.account = { id: state.account.id, role: "admin", active: true, recovery_required: false }; state.rpc.mockResolvedValue({ data: {}, error: null }); });
describe("location management API authorization and validation", () => {
  it("guards every entry point before reading or mutating content", async () => {
    state.session = null;
    expect((await GET()).status).toBe(401); expect((await POST(request({}))).status).toBe(401); expect((await DELETE(request({}))).status).toBe(401); expect((await uploadImage(request({}))).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each(["guest", "manager", "front_desk", "housekeeping", "maintenance", "accounting"])("denies %s rather than granting catalog authority", async role => { state.session!.user.role = role; expect((await GET()).status).toBe(403); expect((await POST(request({}))).status).toBe(403); expect(state.rpc).not.toHaveBeenCalled(); });
  it("rechecks active, recovery and current role from the database", async () => { state.account.active = false; expect((await GET()).status).toBe(401); state.account.active = true; state.account.recovery_required = true; expect((await GET()).status).toBe(401); state.account.recovery_required = false; state.account.role = "guest"; expect((await GET()).status).toBe(401); });
  it("allows Owner and binds the audited RPC actor/version, then invalidates the landing page", async () => { state.session!.user.role = "owner"; state.account.role = "owner"; const response = await POST(request({ kind: "category", id: null, version: 0, body: { name: "Dining", slug: "dining", status: "draft", sort_order: 0 } })); expect(response.status).toBe(200); expect(state.rpc).toHaveBeenCalledWith("website_content_write", expect.objectContaining({ p_actor: state.account.id, p_kind: "category", p_action: "save", p_version: 0 })); expect(state.revalidate).toHaveBeenCalledWith("/"); });
  it("rejects bad fields before SQL and preserves stale/conflict errors without claiming success", async () => { expect((await POST(request({ kind: "category", id: null, version: 0, body: { name: "", slug: "Bad Slug", status: "published", sort_order: -1 } }))).status).toBe(400); expect(state.rpc).not.toHaveBeenCalled(); state.rpc.mockResolvedValue({ data: null, error: { message: "WEBSITE_STALE" } }); const response = await DELETE(request({ kind: "place", id: state.account.id, version: 0 })); expect(response.status).toBe(409); expect(state.revalidate).not.toHaveBeenCalled(); });
  it("returns a committed save successfully even if cache invalidation is temporarily unavailable", async () => {
    state.revalidate.mockImplementationOnce(() => { throw new Error("cache unavailable"); });
    const response = await POST(request({ kind: "category", id: null, version: 0, body: { name: "Dining", slug: "dining", status: "draft", sort_order: 0 } }));
    expect(response.status).toBe(200); expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects disguised SVG uploads before storage", async () => { const form = new FormData(); form.append("file", new File(["<svg onload='alert(1)'/>"], "renamed.png", { type: "image/png" })); const response = await uploadImage(new Request("https://hotel.invalid/api/admin/location/images", { method: "POST", body: form })); expect(response.status).toBe(400); expect(state.upload).not.toHaveBeenCalled(); });
  it("normalizes genuine images, registers private owned media and cleans up an unregistered upload", async () => {
    const bytes = await sharp({ create: { width: 20, height: 16, channels: 3, background: "#54745f" } }).png().toBuffer();
    const upload = () => { const form = new FormData(); form.append("file", new File([new Uint8Array(bytes)], "valid.png", { type: "image/png" })); return uploadImage(new Request("https://hotel.invalid/api/admin/location/images", { method: "POST", body: form })); };
    state.upload.mockResolvedValue({ error: null }); state.remove.mockResolvedValue({ error: null });
    expect((await upload()).status).toBe(201); expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${state.account.id}/[a-f0-9-]+\\.webp$`)), expect.any(Buffer), { contentType: "image/webp", upsert: false });
    expect(state.rpc).toHaveBeenCalledWith("website_image_write", expect.objectContaining({ p_actor: state.account.id, p_action: "register", p_details: expect.objectContaining({ width: 20, height: 16 }) }));
    state.rpc.mockResolvedValue({ data: null, error: { message: "WEBSITE_FORBIDDEN" } }); expect((await upload()).status).toBe(403); expect(state.remove).toHaveBeenCalledTimes(1);
  });
  it("draft media requires admin preview authority; unpublished public media returns 404", async () => { state.session = null; const context = { params: Promise.resolve({ id: state.account.id }) }; expect((await readImage(new Request("https://hotel.invalid/image?preview=1"), context)).status).toBe(401); state.rpc.mockResolvedValue({ data: null, error: null }); expect((await readImage(new Request("https://hotel.invalid/image"), context)).status).toBe(404); expect(state.download).not.toHaveBeenCalled(); });
});
