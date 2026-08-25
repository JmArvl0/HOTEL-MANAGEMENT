import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { create, list, update } from "@/lib/data";
import { canAccess } from "@/lib/permissions";
import type { Resource } from "@/lib/types";

const resources: Resource[] = ["reservations", "rooms", "guests", "housekeeping_tasks", "maintenance_orders", "invoices", "inventory", "staff"];

async function authorize(resource: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!resources.includes(resource as Resource) || !canAccess(session.user.role, resource as Resource)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { resource: resource as Resource };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const auth = await authorize(resource);
  if (auth.error) return auth.error;
  try { return NextResponse.json({ data: await list(auth.resource!) }); }
  catch { return NextResponse.json({ error: "Unable to load records" }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const auth = await authorize(resource);
  if (auth.error) return auth.error;
  try { return NextResponse.json({ data: await create(auth.resource!, await request.json()) }, { status: 201 }); }
  catch { return NextResponse.json({ error: "Unable to create record" }, { status: 400 }); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const auth = await authorize(resource);
  if (auth.error) return auth.error;
  try {
    const { id, ...payload } = await request.json();
    if (!id) return NextResponse.json({ error: "Record id is required" }, { status: 400 });
    return NextResponse.json({ data: await update(auth.resource!, id, payload) });
  } catch { return NextResponse.json({ error: "Unable to update record" }, { status: 400 }); }
}
