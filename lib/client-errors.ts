import { ERROR_COPY, PublicError, errorCategory, statusMessage, userMessage, safeFieldMessages } from "@/lib/errors";

const uncertain = {
  reservation: "We couldn't confirm this reservation. Check Reservations before creating another booking for this guest.",
  payment: "We couldn't confirm the payment update. Check the reservation and payment status before paying or collecting payment again.",
  cancel: "We couldn't confirm the cancellation. Check the reservation status before trying again.",
  request: "We couldn't confirm your request. Check its current status before sending it again.",
  hold: "We couldn't confirm your room hold. Try again with the same details to check this booking attempt.",
  registration: "Could not confirm registration. If the account was created, you can sign in with these details.",
  release: "We couldn't confirm whether the hold was released. Refresh your bookings to check its status.",
  change: "We couldn't confirm your change request. Check your reservation and request status before trying again.",
  transportation: "We couldn't confirm your transportation request. Check your transportation requests before sending it again.",
  withdraw: "We couldn't confirm the withdrawal. Check the request status before trying again.",
  profile: "We couldn't confirm your profile update. Reopen your profile to check it before trying again.",
  password: "Could not confirm the password change. Try signing in with your new password before submitting again.",
  email: "We couldn't confirm that the receipt email was sent. Check your inbox before trying again.",
} as const;

function transportMessage(url: string, writing: boolean) {
  if (!writing) return ERROR_COPY.load;
  if (/\/booking\/holds$/.test(url)) return uncertain.hold;
  if (/\/booking\/holds\//.test(url)) return uncertain.release;
  if (/\/register$/.test(url)) return uncertain.registration;
  if (/\/change-request$/.test(url)) return uncertain.change;
  if (/\/withdraw$/.test(url)) return uncertain.withdraw;
  if (/\/account\/transportation$/.test(url)) return uncertain.transportation;
  if (/\/account\/profile$/.test(url)) return uncertain.profile;
  if (/\/account\/password$/.test(url)) return uncertain.password;
  if (/\/receipts\/.*\/email$/.test(url)) return uncertain.email;
  if (/payment|xendit|cash|refund|charge|reconcil/.test(url)) return uncertain.payment;
  if (/cancel/.test(url)) return uncertain.cancel;
  if (/front-desk\/reservations$/.test(url)) return uncertain.reservation;
  if (/request|transportation/.test(url)) return uncertain.request;
  return ERROR_COPY.unknown;
}

/** Local JSON APIs: a broken connection or HTML proxy page becomes an explicit, unconfirmed result. */
export async function fetchPublic(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const writing = !["GET", "HEAD"].includes((init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase());
  const fallback = () => Response.json({ error: transportMessage(url, writing), code: "CLIENT_TRANSPORT_UNCONFIRMED", category: writing ? "unknown_outcome" : "network", outcome: writing ? "unknown" : "not_submitted" }, { status: 503 });
  try {
    const response = await fetch(input, init);
    if (!url.startsWith("/api/")) return response;
    const type = response.headers?.get("content-type") ?? "";
    if (response.ok && (/^(?:image\/|application\/(?:pdf|octet-stream|zip|vnd\.))/.test(type) || response.status === 204)) return response;
    try {
      const canClone = typeof response.clone === "function";
      const body = await (canClone ? response.clone() : response).json();
      if (!body || typeof body !== "object" || Array.isArray(body)) return fallback();
      if (writing && response.status >= 500 && body.outcome !== "rejected" && body.outcome !== "not_submitted") {
        return Response.json({ ...body, error: /^[A-Z][A-Z_0-9]+$/.test(body.error ?? "") ? body.error : transportMessage(url, true),
          message: transportMessage(url, true), outcome: "unknown" }, { status: response.status, headers: response.headers });
      }
      if (!canClone) return Response.json(body, { status: response.status ?? (response.ok ? 200 : 400), headers: response.headers });
    }
    catch { return fallback(); }
    return response;
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    return fallback();
  }
}

/** Decode at the browser boundary; HTML, parser exceptions and arbitrary response errors stay internal. */
export async function readResponse(response: Response) {
  let body;
  try { body = await response.json(); } catch { throw new PublicError(ERROR_COPY.unknown); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PublicError(ERROR_COPY.unknown);
  if (!response.ok) {
    const machine = typeof body.error === "string" && /^[A-Z][A-Z_0-9]+$/.test(body.error);
    const message = userMessage(machine ? body.message : body.error, statusMessage(response.status));
    return { ...body, error: machine ? body.error : message, message, category: body.category ?? errorCategory(response.status),
      ...(body.fields ? { fields: safeFieldMessages(body.fields) } : {}), ...(body.fieldErrors ? { fieldErrors: safeFieldMessages(body.fieldErrors) } : {}) };
  }
  return body;
}
