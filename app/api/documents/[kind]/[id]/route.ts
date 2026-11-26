import { getAuthenticatedSession } from "@/lib/authorization";
import { canGenerateFrontDeskReport, canOperateCashShift, canReviewFrontDeskReports, canViewReservationFinancials } from "@/lib/permissions";
import { readBookingConfirmation, readCashShift, readCheckoutFolio, readSavedOperationsReport } from "@/lib/hotel-document-data";
import { renderHotelDocument, type HotelDocument } from "@/lib/hotel-document-pdf";
import { publicJson, logServerError } from "@/lib/server-errors";
import { supabase } from "@/lib/supabase";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  const { kind, id } = await params;
  if (!/^[a-z0-9_-]{1,100}$/i.test(id)) return publicJson({ error: "Document not found." }, { status: 404 });
  const { id: actor, role } = session.user;
  const denied = () => publicJson({ error: "You do not have access to this document." }, { status: 403 });
  if (!supabase) return publicJson({ error: "Document downloads are temporarily unavailable. Try again shortly." }, { status: 503 });

  try {
    let document: HotelDocument | null;
    switch (kind) {
      case "booking-confirmation":
        if (role !== "guest") return denied();
        document = await readBookingConfirmation(actor, id);
        break;
      case "checkout-folio":
        if (role !== "guest" && !canViewReservationFinancials(role)) return denied();
        document = await readCheckoutFolio(id, role === "guest" ? actor : undefined);
        break;
      case "cash-shift-close":
        if (!canOperateCashShift(role)) return denied();
        document = await readCashShift(id, role === "front_desk" ? actor : undefined);
        break;
      case "daily-operations-report":
        if (!(canGenerateFrontDeskReport(role) || canReviewFrontDeskReports(role) || role === "owner")) return denied();
        document = await readSavedOperationsReport(id);
        break;
      default:
        return publicJson({ error: "Document not found." }, { status: 404 });
    }
    if (!document) return publicJson({ error: "This document is not available." }, { status: 404 });
    const bytes = await renderHotelDocument(document);
    const reference = document.reference.replace(/[^a-z0-9_-]/gi, "-").slice(0, 100);
    return new Response(bytes, { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="haven-${kind}-${reference}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    logServerError("hotel document download failed", error);
    return publicJson({ error: "Unable to prepare the PDF. Refresh and try again." }, { status: 503 });
  }
}
