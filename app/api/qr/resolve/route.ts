import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { findQrToken, logQrScan, type QrScanResult, type QrTokenRow } from "@/lib/qr/tokens";

/**
 * QR resolve — the single validation path for every scan. The token is only a
 * lookup key: resolution always requires an authenticated session, re-checks
 * the token's expiry/revocation AND the resource's CURRENT state, applies
 * role-aware authorization, and writes a qr_scan_events audit row. A QR can
 * never bypass a business rule — check-in still goes through the same
 * front_desk_check_in RPC the manual workflow uses.
 */

const RESERVATION_STAFF = new Set(["front_desk", "manager", "owner", "admin"]);
const ROOM_STAFF = new Set(["front_desk", "manager", "owner", "admin", "housekeeping", "maintenance"]);

const fail = (status: number, result: string, message: string) => NextResponse.json({ result, message }, { status });

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const token = body && typeof body === "object" && "token" in body ? String((body as { token: unknown }).token).trim() : "";
  if (!token || token.length > 200) return fail(400, "invalid", "That code is not a valid HAVEN QR code.");

  const record = await findQrToken(token);
  // No matching token: nothing to reference in qr_scan_events (its token FK is
  // NOT NULL), so an unknown code is simply rejected. ponytail: fine.
  if (!record) return fail(404, "invalid", "This QR code is not recognized. It may have been replaced by a newer one.");

  const auditor = (result: QrScanResult, action = "resolve") =>
    logQrScan({
      tokenId: record.id, scannerUserId: session.user.id, scannerRole: session.user.role,
      resourceType: record.resource_type, resourceId: record.resource_id, action, result
    });

  if (record.revoked_at) {
    await auditor("revoked");
    return fail(410, "revoked", "This QR code was revoked and replaced. Ask the guest to reopen their reservation or reprint the placard.");
  }
  if (record.expires_at && Date.parse(record.expires_at) < Date.now()) {
    await auditor("expired");
    return fail(410, "expired", "This QR code has expired.");
  }

  return record.resource_type === "reservation"
    ? resolveReservation(record, session.user.id, session.user.role, auditor)
    : resolveRoom(record, session.user.id, session.user.role, auditor);
}

type Auditor = (result: QrScanResult, action?: string) => Promise<void>;

async function resolveReservation(record: QrTokenRow, userId: string, role: string, auditor: Auditor) {
  const { data: reservation } = await supabase!.from("reservations")
    .select("id,guest_name,confirmation_number,status,check_in,check_out,room_type,room_id,room_number,payment_status,user_id")
    .eq("id", record.resource_id).maybeSingle();
  if (!reservation) {
    await auditor("invalid");
    return fail(404, "invalid", "The reservation this QR code refers to no longer exists.");
  }

  const isOwner = role === "guest" && reservation.user_id === userId;
  if (!RESERVATION_STAFF.has(role) && !isOwner) {
    await auditor("unauthorized");
    return fail(403, "unauthorized", "Your account is not authorized to use reservation QR codes.");
  }

  // Current-state re-check: only a confirmed reservation can initiate check-in.
  if (reservation.status !== "confirmed") {
    await auditor("ineligible");
    return fail(409, "ineligible", `This reservation is ${String(reservation.status).replace("_", " ")} and cannot start check-in. QR never bypasses check-in rules — use the normal workflow.`);
  }

  await auditor("authorized", "check_in");
  if (isOwner) {
    return NextResponse.json({
      result: "authorized",
      resourceType: "reservation",
      action: "reservation",
      reservation: {
        id: reservation.id, confirmationNumber: reservation.confirmation_number, status: reservation.status,
        checkIn: reservation.check_in, checkOut: reservation.check_out, roomType: reservation.room_type
      },
      message: "Your check-in QR is valid. Present it to the Front Desk on arrival."
    });
  }
  return NextResponse.json({
    result: "authorized",
    resourceType: "reservation",
    action: "check_in",
    reservation: {
      id: reservation.id, guestName: reservation.guest_name, confirmationNumber: reservation.confirmation_number,
      status: reservation.status, checkIn: reservation.check_in, checkOut: reservation.check_out,
      roomType: reservation.room_type, roomId: reservation.room_id, roomNumber: reservation.room_number,
      paymentStatus: reservation.payment_status
    },
    message: "Verified. Complete check-in through the Assign & Check In workflow — all rules still apply."
  });
}

async function resolveRoom(record: QrTokenRow, userId: string, role: string, auditor: Auditor) {
  const { data: room } = await supabase!.from("rooms")
    .select("id,number,floor,type,status,housekeeping,administratively_active")
    .eq("id", record.resource_id).maybeSingle();
  if (!room || room.administratively_active === false) {
    await auditor("invalid");
    return fail(404, "invalid", "The room this QR code refers to is not active.");
  }

  if (ROOM_STAFF.has(role)) {
    await auditor("authorized");
    const [tasks, orders, stay] = await Promise.all([
      role === "housekeeping"
        ? supabase!.from("housekeeping_tasks").select("id", { count: "exact", head: true }).eq("room_id", room.id).in("status", ["pending", "in_progress"])
        : Promise.resolve(null),
      role === "maintenance"
        ? supabase!.from("maintenance_orders").select("id", { count: "exact", head: true }).eq("room_id", room.id).not("status", "in", "(resolved,cancelled)")
        : Promise.resolve(null),
      ["front_desk", "manager", "owner", "admin"].includes(role)
        ? supabase!.from("reservations").select("guest_name,check_in,check_out").eq("room_id", room.id).eq("status", "checked_in").order("check_out", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve(null)
    ]);
    if (role === "housekeeping") {
      return NextResponse.json({
        result: "authorized", resourceType: "room", action: "room_tasks",
        room: { id: room.id, number: room.number, floor: room.floor, status: room.status, housekeeping: room.housekeeping },
        openTasks: tasks?.count ?? 0,
        message: `Room ${room.number} opened. Continue in the Housekeeping queue.`
      });
    }
    if (role === "maintenance") {
      return NextResponse.json({
        result: "authorized", resourceType: "room", action: "work_orders",
        room: { id: room.id, number: room.number, floor: room.floor, status: room.status },
        openOrders: orders?.count ?? 0,
        message: `Room ${room.number} opened. Continue in the Maintenance module.`
      });
    }
    return NextResponse.json({
      result: "authorized", resourceType: "room", action: "room_summary",
      room: { id: room.id, number: room.number, floor: room.floor, type: room.type, status: room.status, housekeeping: room.housekeeping },
      currentStay: stay?.data ? { guestName: stay.data.guest_name, checkIn: stay.data.check_in, checkOut: stay.data.check_out } : null,
      message: `Room ${room.number} summary.`
    });
  }

  if (role === "guest") {
    // A guest may only use a room QR for a room they are currently assigned to.
    const { count } = await supabase!.from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("room_id", room.id).eq("status", "checked_in");
    if ((count ?? 0) > 0) {
      await auditor("authorized", "guest_request");
      return NextResponse.json({
        result: "authorized", resourceType: "room", action: "guest_request",
        room: { number: room.number },
        message: `Room ${room.number} — open Guest Requests to ask for anything you need.`
      });
    }
    await auditor("unauthorized");
    // Generic response: never confirm room details to an unassigned guest.
    return fail(403, "unauthorized", "This QR code is for hotel operations on your assigned room. See the Front Desk for assistance.");
  }

  await auditor("unauthorized");
  return fail(403, "unauthorized", "Your account is not authorized to use room QR codes.");
}
