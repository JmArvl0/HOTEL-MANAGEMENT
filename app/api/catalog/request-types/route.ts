import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";

// Manager-maintained guest request catalog. Plain guarded table CRUD — unlike
// the fare/room catalogs this has no money or versioning concerns, so it skips
// the RPC/audit machinery; every mutation still re-checks the session here.
const columns = "id,value,label,department,active,sort_order,created_at";

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const { data, error } = await c.client.from("guest_request_catalog").select(columns).order("active", { ascending: false }).order("sort_order").order("label");
  if (error) return NextResponse.json({ error: "Unable to load the request types." }, { status: 500 });
  return NextResponse.json({ data });
}

const createSchema = z.object({
  label: z.string().trim().min(2).max(60),
  department: z.enum(["front_desk", "housekeeping", "maintenance"]).default("front_desk"),
});

export async function POST(request: Request) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a request type label." }, { status: 400 });
  // The form key derives from the label so managers never hand-write snake_case.
  const value = parsed.data.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!value) return NextResponse.json({ error: "Enter a request type label." }, { status: 400 });
  const { data, error } = await c.client.from("guest_request_catalog").insert({ value, label: parsed.data.label, department: parsed.data.department }).select(columns).single();
  if (error) return NextResponse.json({ error: /duplicate key/.test(error.message) ? "A request type with that label already exists." : "Unable to create the request type." }, { status: 409 });
  return NextResponse.json({ data }, { status: 201 });
}
