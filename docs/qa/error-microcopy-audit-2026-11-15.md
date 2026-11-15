# Haven error messages and UX microcopy audit

Date: 15 November 2026, Asia/Manila. **Historical audit and proposed changes.** The user subsequently authorized the repairs; see the [implementation and verification report](error-microcopy-implementation-2026-11-15.md) for the completed local changes. The findings below preserve the original audit snapshot.

The main problems are unsafe message handoff and inconsistent presentation, rather than a lack of friendly fallback strings. APIs frequently forward validation-library messages. Client catch handlers frequently render any `Error.message`, including network and response-parsing exceptions. Staff action failures can appear as successful green toasts. Several submissions have no network-error recovery at all. Guest checkout includes instructions intended for whoever configures Xendit.

The proposed changes retain distinctions between validation, sign-in, permissions, unavailable records, business rules, conflicting updates, network problems, provider rejection and unknown outcomes. Existing business rules, payment confirmation authority, role permissions, SQL guard codes and integration contracts remain authoritative.

## Deliverables and coverage

| Deliverable | Contents |
| --- | --- |
| [Reviewed findings](error-microcopy-audit-2026-11-15/reviewed-findings.csv) | The 82 rows below, including proposed wording and handling, source locations and priorities. |
| [Complete discovered message table (CSV)](error-microcopy-audit-2026-11-15/message-inventory.csv) | 2,314 static message/adjacent-feedback occurrences, representing 1,672 distinct strings. Includes safe copy to retain, internal diagnostics, machine tokens and scan exclusions. |
| [Dynamic error handoffs](error-microcopy-audit-2026-11-15/dynamic-error-paths.csv) | 243 source sites passing response errors, exception messages or validation issues to error responses or feedback. These overlap with the static inventory and are not 243 confirmed leaks. |
| [Validation sites](error-microcopy-audit-2026-11-15/validation-sites.csv) | 1,698 candidate schema/validator call sites where default messages may originate. Multiple calls can contribute to one field; not every site is exposed or defective. |
| [Database exceptions](error-microcopy-audit-2026-11-15/database-exceptions.csv) | 1,027 exception occurrences across migration history. Later migrations can replace earlier functions. These are not 1,027 active user messages or defects. |

The scan covers 575 non-test JavaScript/TypeScript files in `app`, `components`, `lib` and `config`, the root request-protection `proxy.ts`, plus all 148 SQL migration files. Read paths, write paths, forms, dialogs, toasts, error boundaries, authentication, booking, payment, reservation amendments/cancellation, account/profile, reviews/rewards, Front Desk, room/catalog/rate management, housekeeping, maintenance, inventory/purchasing, accounting/cash/refunds, management approvals/reports, Admin/Owner governance, website/location editing, QR, transportation/Fleet, Workforce, AI and automation endpoints were included.

This is an audit of the **current local working tree**, including existing uncommitted repairs. It is not a certification of the hosted release. The previous handoff identifies production as `d95d14b`; that deployment was not checked in this audit. No hosted database queries, writes, payment attempts, emails, migrations, commits or deployment were performed.

The inventories were extracted from syntax trees and SQL exception statements, followed by source review of the important display paths. They intentionally distinguish discovered candidates from confirmed user-visible defects. Exact runtime exception text from external services, browser-native constraint messages and dormant/unreachable branches cannot be exhaustively enumerated from static source. No explicit direct stack-trace renderer was found in the reviewed error paths. That does not make arbitrary exception-message forwarding safe. The complete table is a discovery catalog, **not a claim that every row was individually exercised or approved**. Its default “Keep” rows are provisional static wording dispositions; the 3 explicitly reviewed “Keep” rows below have stronger evidence.

## Priorities and principal findings

The reviewed table contains **41 P1 rows, 38 P2 rows and 3 Keep rows**. Related rows describe shared root causes and should not be treated as independent defect counts. No P0 finding was established during this source-only audit.

- **P1 — before the next release:** untrusted exception/validation text, wrong success tone for errors, missing or misleading recovery for reservation/payment actions, guest-facing provider setup instructions, dropped queued feedback and potentially sensitive raw log details.
- **P2 — next copy/UX pass:** technical workflow language, field errors shown as toasts, missing recovery instructions, duplicate announcement risks and consistency improvements.
- **Keep:** verified examples of useful existing wording. Retain the underlying safe behavior as well.

The largest improvements come from fixing the shared transport/response boundaries, carrying severity explicitly through dashboard notifications, and treating unconfirmed mutations as a distinct outcome. Replacing individual sentences without fixing those paths would leave the main problems in place.

## Reviewed wording and handling table

“Existing Message” is either exact source text, a generating expression, or an observed default-library message. Rows involving missing feedback or incorrect delivery describe the needed behavior change alongside the proposed message. File locations are relative to the repository root and point to the audited working-tree snapshot.

| Module | Existing Message | Problem | Recommended Message | File Location | Priority |
| --- | --- | --- | --- | --- | --- |
| UXE-001 · Shared / all roles | Unauthorized | Bare authorization label gives no recovery; 401 differs from 403. | Please sign in to continue. | lib/manager-route.ts:3 | P1 |
| UXE-002 · Shared / all roles | Forbidden | Technical access label with no next step. | You don't have permission to perform this action. Ask your system administrator if you need access. | app/api/resources/[resource]/route.ts:5 | P1 |
| UXE-003 · Shared / all roles | Database unavailable. | Implementation detail reaches guest and staff screens. | This service is temporarily unavailable. Please try again shortly. | lib/financial-route.ts:8 | P1 |
| UXE-004 · Guest / checkout | Xendit sandbox is not configured. Contact the hotel. | Guest cannot configure provider credentials; keep the separate sandbox disclosure. | Online payment is unavailable right now. Please contact Front Desk for help with your booking. | app/api/booking/payments/xendit/route.ts:14 | P1 |
| UXE-005 · Guest / checkout | Xendit cannot offer this wallet in the current sandbox account. Check channel availability in the Xendit Dashboard, or try the other wallet. | Guest receives provider dashboard instructions. This is a definitive channel rejection, not an unknown charge. | This wallet is unavailable right now. Choose another available wallet or contact Front Desk. | app/api/booking/payments/xendit/route.ts:55 | P1 |
| UXE-006 · Guest / checkout | Xendit rejected sandbox checkout. Check test key permissions and sandbox setup, then retry. | Developer setup instructions are shown to guests. | We couldn't open online checkout. Please try again shortly or contact Front Desk. | app/api/booking/payments/xendit/route.ts:56 | P1 |
| UXE-007 · Guest / checkout | Xendit has not confirmed checkout creation. We are keeping this attempt pending to prevent duplicates. | Correct uncertainty; provider and duplicate-prevention mechanics obscure the next step. | We're checking your payment attempt. Please don't start another payment. Check your reservation for updates. | app/api/booking/payments/xendit/route.ts:61 | P1 |
| UXE-008 · Guest / checkout | Waiting for the payment provider. Your booking is still unpaid. | A missing response does not establish that payment was not received; prefer pending confirmation. | We're waiting for payment confirmation. Check your reservation before making another payment. | components/booking/xendit-checkout.tsx:65 | P1 |
| UXE-009 · Guest / booking | We could not hold this room. Please try again. | Catch includes failures after the hold transaction. A saved hold can exist despite the error response. | We couldn't confirm your room hold. Try again with the same details to check this booking attempt. | app/api/booking/holds/route.ts:94 | P1 |
| UXE-010 · Guest / booking | Could not confirm your hold. Retry to recover the same booking attempt. | Truthful but uses internal retry terminology. | We couldn't confirm your room hold. Try again with the same details to check this booking attempt. | components/booking/guest-details-form.tsx:101 | P2 |
| UXE-011 · Guest / cancellation | async function handleCancelSubmit() | Fetch/JSON rejection reaches finally with no catch; the outcome is unknown and there is no helpful feedback. | We couldn't confirm the cancellation. Check My reservations before trying again. | components/customer/reservation-actions.tsx:138 | P1 |
| UXE-012 · Guest / reservation changes | async function handleChangeSubmit() | Fetch/JSON rejection has no catch. Preserve request key and draft; check reservation before resubmitting. | We couldn't confirm your change request. Check your reservation and request status before trying again. | components/customer/reservation-actions.tsx:181 | P1 |
| UXE-013 · Guest / requests | const response = await fetch | No catch/finally: rejected fetch/JSON can leave the form loading indefinitely. A new key is generated on each submit. | We couldn't confirm your request. Check My requests before sending it again. | components/customer/guest-request-form.tsx:37 | P1 |
| UXE-014 · Guest / transportation | const response = await fetch | No catch/finally around submission; loading can stick and a saved request may be unconfirmed. | We couldn't confirm your transportation request. Check your transportation requests before sending it again. | components/customer/transportation-request-form.tsx:40 | P1 |
| UXE-015 · Front Desk / walk-in | const idempotencyKey = crypto.randomUUID(); | A fresh key on each click contradicts the stable-retry comment; no catch for an uncertain create. Copy alone cannot make retry safe. | We couldn't confirm this reservation. Check Reservations before creating another booking for this guest. | components/manager/walk-in-dialog.tsx:107 | P1 |
| UXE-016 · Front Desk / walk-in | if (res.status === 409) | Every conflict is described as sold-out inventory; other domain conflicts lose their meaning. | Use the mapped conflict message. For room availability only: This room type is no longer available for these dates. Choose another room type. | components/manager/walk-in-dialog.tsx:119 | P1 |
| UXE-017 · Staff / all operational actions | const notify = (message: string) => { toastController.push({ title: message, tone: "success" }); }; | Errors and warnings route through a hard-coded success tone and icon. | Keep each action's specific error message; display errors with error tone and unresolved outcomes with warning tone. | components/manager/manager-dashboard-client.tsx:237 | P1 |
| UXE-018 · Admin / action feedback | const notify = (message: string) => { toastController.push({ title: message }) }; | Errors default to informational tone; notify signature does not carry severity. | Keep each action's specific message; pass error, warning, info or success explicitly. | components/admin/admin-dashboard-client.tsx:110 | P2 |
| UXE-019 · Owner / action feedback | const notify = (message: string) => { toastController.push({ title: message }); }; | Errors default to informational tone. | Keep each action's specific message; pass error, warning, info or success explicitly. | components/owner/owner-dashboard-client.tsx:86 | P2 |
| UXE-020 · Shared / transport errors | throw new Error(result.error | Any response error becomes a displayable Error; caught network exceptions are also shown verbatim. | Use a trusted error decoder. Read failure: We couldn't load this information. Please try again. Write uncertainty: We couldn't confirm the update. Check the record before trying again. | components/manager/hotel-operations-client.ts:7 | P1 |
| UXE-021 · Admin / website editor | ${valid.error.issues[0].path.join | Internal schema paths and library text are rendered to editors. | Please check the highlighted website content fields. | components/admin/website-content-panel.tsx:30 | P1 |
| UXE-022 · Shared / schema errors | error.issues[0]?.message | Default Zod text is returned as the primary error and individual fields; both need safe formatting. | Please check the highlighted details. Each field receives a specific instruction, such as Please enter your first name. | app/api/booking/holds/route.ts:16 | P1 |
| UXE-023 · Guest / booking field paths | issue.path.filter(part => typeof part === "string").at(-1) | Leaf-only paths lose nesting and array indexes; nested transport fields may not identify the matching control. | Keep the complete field path internally and map it to the actual form control and a guest-facing label. | app/api/booking/holds/route.ts:15 | P1 |
| UXE-024 · Guest / duplicate validation | setError(body.error ?? | The first field error is also displayed as a form alert while the same field has role=alert. | Please check the highlighted details. Announce the summary once, link it to fields, and keep each field's own instruction near the input. | components/booking/guest-details-form.tsx:90 | P2 |
| UXE-025 · Shared / password limit | Use a password of at most 72 UTF-8 bytes. Some characters use more than one byte. | Explains the implementation instead of giving a usable correction; keep the byte limit unchanged. | This password is too long. Use a shorter password; some characters take more space. | lib/input-validation.ts:35 | P2 |
| UXE-026 · Shared / toast delivery | setToasts((current) => current.filter((item) => item.id !== toast.id)) | Automatic expiry removes a visible toast without promoting queued messages. Notifications can remain unseen. | No copy change. Promote the next queued toast on automatic expiry and dismissal; retain important errors until acknowledged. | components/ui/toast-stack.tsx:63 | P1 |
| UXE-027 · Shared / toast deduplication | if (current.some((existing) => existing.id | Deduplication checks visible IDs only; queued repeats can accumulate. A repeated push also plays sound before this check. | No copy change. Deduplicate visible and queued notifications by action/request ID before playing sound. | components/ui/toast-stack.tsx:69 | P2 |
| UXE-028 · Shared / live regions | role="log" aria-live="polite" | A live container nests child alert/status live regions. Duplicate announcements are a risk requiring screen-reader verification. | Use one announcement owner per result. Field errors remain associated with controls; action-level errors use one live region. | components/ui/toast-stack.tsx:108 | P2 |
| UXE-029 · Guest / payment status | if (attempts >= MAX_ATTEMPTS) | Attempt limit is checked only inside try; repeated network rejection bypasses it and provides no connection state. | We couldn't refresh your payment status. Please check your connection, then check this reservation before paying again. | components/booking/payment-status-poller.tsx:52 | P1 |
| UXE-030 · Guest / payment status | if (state === "done") return null; | Polling limit silently removes the watcher message without explaining how to recover. | Payment confirmation is taking longer than expected. Check your reservation or contact Front Desk before paying again. | components/booking/payment-status-poller.tsx:68 | P2 |
| UXE-031 · Guest / receipt email | The receipt could not be emailed. | Fetch catch claims a failed delivery although the request may have been accepted. | We couldn't confirm that the receipt email was sent. Check your inbox before trying again. | components/customer/receipt-action.tsx:69 | P1 |
| UXE-032 · Guest / release hold | Could not release this hold. Please try again. | Network catch can follow a successful release; error implies a known failure. | We couldn't confirm whether the hold was released. Refresh your bookings to check its status. | components/customer/active-booking-holds.tsx:51 | P2 |
| UXE-033 · Guest / cancel payment attempt | Unable to cancel this payment attempt. Please try again. | Network failure cannot establish cancellation outcome. | We couldn't confirm the payment cancellation. Check your reservation and payment status before trying again. | components/booking/gateway-pending-actions.tsx:43 | P1 |
| UXE-034 · Shared / upload errors | error instanceof Error ? error.message | A broad catch returns any parser/stream Error text. Safe authored image validation and unexpected failures are not separated. | For invalid image content: Choose a valid JPEG, PNG or WebP photo. For an unreadable upload: We couldn't read this photo. Please choose it again. | app/api/catalog/photos/route.ts:14 | P1 |
| UXE-035 · Admin / upload errors | cause instanceof Error ? cause.message | Broad upload catch can reveal form-data parser exceptions. | We couldn't read this image. Choose a JPEG, PNG or WebP file and try again. | app/api/admin/location/images/route.ts:15 | P1 |
| UXE-036 · Admin / upload errors | cause instanceof Error && !(cause instanceof z.ZodError) ? cause.message | Excludes ZodError but still exposes arbitrary parser or stream Error messages. | We couldn't read this photo. Choose a valid image, add a description, and try again. | app/api/admin/website/images/route.ts:17 | P1 |
| UXE-037 · Staff / cash exceptions | Cash exception history is unavailable. Try again or check pending migrations. | Asks Accounting to diagnose database rollout. | Cash exception history is unavailable right now. Try again shortly, or contact the system administrator if it continues. | app/api/accounting/cash-exceptions/route.ts:12 | P2 |
| UXE-038 · Staff / preventive maintenance | Preventive work is unavailable. Check pending migrations or retry. | Technicians cannot resolve migration state. | Preventive maintenance is unavailable right now. Try again shortly, or contact the system administrator. | app/api/maintenance/asset-work/route.ts:24 | P2 |
| UXE-039 · Staff / handover | Operational handover service is unavailable. Try again or ask an administrator to check pending migrations. | Operational message includes deployment detail. | Handovers are unavailable right now. Try again shortly, or contact the system administrator. | app/api/staff/handovers/route.ts:21 | P2 |
| UXE-040 · Staff / schedules | Schedule and handover service is unavailable. Try again or ask an administrator to check pending migrations. | Operational message includes deployment detail. | Schedules and handovers are unavailable right now. Try again shortly, or contact the system administrator. | app/api/staff/operations/route.ts:26 | P2 |
| UXE-041 · Staff / Lost & Found | Lost & Found is unavailable. Check pending migrations or try again. | Staff cannot apply schema changes. | Lost & Found is unavailable right now. Try again shortly, or contact the system administrator. | app/api/staff/lost-found/route.ts:18 | P2 |
| UXE-042 · Staff / payment recording | This retry key belongs to a different charge. | Internal idempotency term rather than an operational recovery instruction. | These charge details differ from the earlier submission. Check the folio before starting a new charge. | app/api/front-desk/reservations/[id]/charge/route.ts:9 | P1 |
| UXE-043 · Staff / hotel operations | This retry key belongs to a different operation. | Technical internal retry identity exposed. | These details differ from the earlier submission. Check the record before starting a new action. | lib/hotel-operations-route.ts:15 | P2 |
| UXE-044 · Staff / inventory | Version is required to edit a draft. | Internal concurrency field; user cannot enter a record version. | Reopen the latest purchase order draft before editing it. | app/api/inventory/purchase-orders/route.ts:142 | P2 |
| UXE-045 · Admin / user accounts | Status and current version are required. | Version is a client concurrency token, not a field the user should supply. | Choose an account status. If it is already selected, reopen the account and try again. | app/api/admin/users/[id]/action/route.ts:30 | P2 |
| UXE-046 · Front Desk / report review | A decision, current version, and (for returns) a note are required. | Mixes a missing field with a stale page and uses an internal version term. | Choose a review decision and add a note if returning the report. If these details are complete, reopen the latest report. | app/api/front-desk/reports/[id]/review/route.ts:20 | P2 |
| UXE-047 · Staff / room assignment | The room is maintenance-blocked. | Awkward technical compound; retain the operational maintenance distinction. | This room is unavailable while maintenance work is open. Choose another eligible room. | app/api/front-desk/reservations/[id]/assign/route.ts:1 | P2 |
| UXE-048 · Staff / housekeeping | Checklist and notes are invalid. | Does not identify which answer needs attention. | Please check the highlighted checklist items and notes. | app/api/housekeeping/tasks/[id]/complete/route.ts:3 | P2 |
| UXE-049 · Staff / housekeeping | A failure reason is required. | Unclear whether the form or inspection failed. | Please explain why the room did not pass inspection. | app/api/housekeeping/tasks/[id]/inspect/route.ts:2 | P2 |
| UXE-050 · Guest / reservation conflict | Availability changed while you were booking. Choose another room. | Can be more specific about the selected dates. | This room is no longer available for your selected dates. Please choose another room. | app/api/booking/holds/route.ts:65 | P2 |
| UXE-051 · Guest / current stay | Requests require a confirmed or current stay. | Describes a system constraint without giving the guest a route forward. | You can make a request once your reservation is confirmed. Contact Front Desk if you need help before then. | app/api/account/requests/route.ts:3 | P2 |
| UXE-052 · Guest / no longer cancellable | This reservation can no longer be cancelled. | Does not provide the available assistance route. | This reservation can no longer be cancelled online. Please contact Front Desk for help. | app/api/account/reservations/[id]/cancel/route.ts:41 | P2 |
| UXE-053 · Guest / reservation changes | A reservation change is already awaiting review or execution. | Internal execution stage is not guest-friendly. | A change to this reservation is already being reviewed or completed. Check its status before requesting another change. | app/api/account/reservations/[id]/change-request/route.ts:60 | P2 |
| UXE-054 · Guest / cancellation preview | Unable to calculate the cancellation settlement. Please retry. | Settlement is finance terminology; the guest is checking cancellation charges/refund. | We couldn't load the cancellation charges and refund details. Please try again before confirming the cancellation. | app/api/account/reservations/[id]/cancel/route.ts:49 | P2 |
| UXE-055 · Guest / transportation availability | Transportation requires a confirmed or current stay. | Business rule lacks a next step. | You can request transportation once your reservation is confirmed. Contact Front Desk if you need help before then. | app/api/account/transportation/route.ts:2 | P2 |
| UXE-056 · Guest / payment attempt | This payment already went through — nothing to cancel. | Casual wording for a financial result. | This payment has already been confirmed and cannot be cancelled here. Please contact Front Desk if you need help. | app/api/account/reservations/[id]/cancel-attempt/route.ts:25 | P2 |
| UXE-057 · Guest / payment attempt | Only an unsettled online payment can be cancelled. | Unsettled is payment-system jargon. | Only an online payment that is still awaiting confirmation can be cancelled here. | app/api/account/reservations/[id]/cancel-attempt/route.ts:27 | P2 |
| UXE-058 · Admin / email connection | SMTP connection or authentication failed. | SMTP is appropriate for System Admin, but the recovery step is missing. | We couldn't connect to the email service. Check the SMTP settings and credentials, then test the connection again. | lib/otp-transport.ts:77 | P2 |
| UXE-059 · Guest / reset email | error: sent.message | Account email helper may return SMTP setup text or No recipient address to a guest. | We couldn't send the reset link right now. Please try again shortly or contact Front Desk. | app/api/password-reset/verify/route.ts:59 | P1 |
| UXE-060 · Guest / receipt API | error: "EMAIL_FAILED", message: result.message | Machine discriminator must stay stable; shared delivery message may contain configuration jargon. | Keep EMAIL_FAILED for compatibility. Safe message: We couldn't send the receipt email right now. You can download your receipt instead. | app/api/account/receipts/[paymentId]/email/route.ts:64 | P1 |
| UXE-061 · Shared / logging | details:typeof err.details | Raw database details/hint can contain row values. Server-side logging alone is not redaction. | No user copy. Log only a request ID, operation and allowlisted diagnostic code; redact SQL detail, credentials, tokens, guest data and payment data. | app/api/accounting/cash-shifts/[id]/route.ts:16 | P1 |
| UXE-062 · Shared / logging | error.message | Raw notification-insert DB message is logged; constraint errors can include values. | No user copy. Log an allowlisted error code and notification type with a request ID. | lib/notifications.ts:285 | P2 |
| UXE-063 · Shared / logging | console.error("guest reminder pass failed", error) | Entire exception object is logged; sensitive content is not structurally excluded. | No user copy. Log a bounded, redacted diagnostic event with the operation and request ID. | app/api/guest-reminders/route.ts:50 | P2 |
| UXE-064 · Staff / catalogue validation | notify("Seats must be a whole number from 1 to 20.") | Field validation uses a transient action toast instead of a persistent field error. | Please enter a whole number of seats from 1 to 20. Display beside Seats and focus that field. | components/catalog/transport-vehicle-types-panel.tsx:62 | P2 |
| UXE-065 · Staff / catalogue validation | notify("Enter a plan name (at least 3 characters).") | Plan-name validation is shown as a toast; it can disappear while editing. | Please enter a plan name with at least 3 characters. Display beside Plan name. | components/catalog/room-catalog-panel.tsx:160 | P2 |
| UXE-066 · Guest / account security | New passwords do not match. | Form-level text should be attached to Confirm new password. | Please enter the same new password in both fields. | components/account/account-forms.tsx:4 | P2 |
| UXE-067 · Guest / profile | Network error while saving profile. Please check your connection. | Saving may already have completed; network cause is asserted for every caught exception. | We couldn't confirm your profile update. Reopen your profile to check it before trying again. | components/account/customer-profile-modal.tsx:118 | P2 |
| UXE-068 · Guest / sign-in | That email or password doesn’t match our records. | Already concise and does not reveal which credential was wrong; retain. | That email or password doesn’t match our records. | components/auth/login-form.tsx:49 | Keep |
| UXE-069 · Guest / account recovery | Could not confirm the password change. Try signing in with your new password before submitting again. | Already truthful about uncertainty and gives a concrete recovery route; retain. | Could not confirm the password change. Try signing in with your new password before submitting again. | components/account/account-forms.tsx:4 | Keep |
| UXE-070 · Guest / confirmation boundary | Try again or check the reservation status in My reservations before submitting another payment. | Already prevents accidental duplicate payments; keep. retry is correct for this installed Next.js version. | Try again or check the reservation status in My reservations before submitting another payment. | app/(booking)/booking/confirmation/[id]/error.tsx:6 | Keep |
| UXE-071 · Guest / booking validation | Required / String must contain at least 1 character(s) | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please enter your first name. | lib/booking.ts:109 | P1 |
| UXE-072 · Guest / booking validation | Required / String must contain at least 1 character(s) | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please enter your last name. | lib/booking.ts:110 | P1 |
| UXE-073 · Guest / booking validation | Invalid email | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please enter a valid email address. | lib/booking.ts:111 | P1 |
| UXE-074 · Guest / booking validation | Expected integer, received float | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please enter a whole number of guests. | lib/booking.ts:56 | P1 |
| UXE-075 · Guest / booking validation | Number must be greater than or equal to 1 | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please include at least one guest. Apply the field-specific minimum and maximum for other integer fields. | lib/input-validation.ts:22 | P1 |
| UXE-076 · Guest / booking validation | String must contain at most 1000 character(s) | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please keep special requests to 1,000 characters or fewer. | lib/booking.ts:120 | P1 |
| UXE-077 · Shared / internal reference validation | Invalid uuid | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Reopen the booking page to continue. Do not ask the guest to enter an internal identifier. | app/api/booking/holds/route.ts:29 | P1 |
| UXE-078 · Staff / source selection | Invalid enum value. Expected 'Front Desk' \| 'Walk-In' \| 'Phone', received 'x' | Observed from the installed Zod library; the API forwards issue.message and can expose this default wording. Keep the validation rule unchanged. | Please choose Front Desk, Walk-In or Phone as the booking source. | app/api/front-desk/reservations/route.ts:3 | P1 |
| UXE-079 · Shared / error coverage | "Unable to create the reservation." | Unknown RPC failures are all returned as 409 and the caller then assumes availability conflict. Preserve current statuses during the copy rollout, but use an explicit safe code instead of inferring business meaning from status alone. | We couldn't confirm this reservation. Check Reservations before starting another booking. Known availability rejection keeps its specific room-conflict message. | app/api/front-desk/reservations/route.ts:4 | P1 |
| UXE-080 · Guest / request withdrawal | e instanceof Error ? e.message | Any network exception is rendered raw and an unknown withdrawal has no status-check guidance. | We couldn't confirm the withdrawal. Check the request status before trying again. | components/customer/withdraw-request-button.tsx:17 | P1 |
| UXE-081 · Shared / request protection | This action must come from the Haven website. | The request boundary can surface a technical origin restriction without a clear recovery action. Keep origin/CSRF checks unchanged. | Please reopen the Haven website and try this action again. | proxy.ts:14 | P2 |
| UXE-082 · Shared / request protection | Use a supported request format. | 415 feedback asks a guest or staff member to change an HTTP request format. Keep accepted content types unchanged. | We couldn't read this request. Refresh the page and try again. | proxy.ts:19 | P2 |

## Default validation messages: verified examples

Eight probes against the installed `zod` package reproduced these messages. These were isolated library probes, not browser or end-to-end workflow tests.

| Existing message | Context-specific replacement | Placement |
| --- | --- | --- |
| `Required` | Please enter the guest's full name. | Guest name field; use first/last name separately where the form has separate inputs. |
| `String must contain at least 1 character(s)` | Please enter your first name. | First name. |
| `Invalid email` | Please enter a valid email address. | Email. |
| `Number must be greater than or equal to 1` | Please include at least one guest. | Guest count; derive other numeric messages from that field's actual minimum. |
| `Expected integer, received float` | Please enter a whole number of guests. | Guest count; preserve whole-number validation. |
| `String must contain at most 500 character(s)` | Please keep this note to 500 characters or fewer. | The specific note field; use its actual label and limit. |
| `Invalid uuid` | Reopen the booking page to continue. | Form/action-level recovery for an internal reference, not a request to type a UUID. |
| `Invalid enum value. Expected 'guest' \| 'front_desk', received 'x'` | Please choose an available role. | Authorized role selector; do not reveal a wider role list than the actor can assign. |

Default-library messages can contain submitted values or internal enum names. A friendly top-level fallback does not help when the API chooses `issues[0].message` before that fallback. Custom authored messages are often good; the formatter must preserve their meaning through an explicit approved mapping.

## Centralized reusable handling strategy — proposed

### 1. One public error vocabulary with context

Use a small pure shared catalog and type definition, a server adapter and a client adapter. Proposed locations are `lib/errors.ts`, `lib/server-errors.ts` and `lib/client-errors.ts`; these files do not yet exist. Reuse existing domain maps rather than blindly relocating or duplicating every string. The pure shared module must not import database clients, environment settings, authentication or provider credentials.

Each normalized result carries:

- A stable application/domain code and category: `validation`, `authentication`, `permission`, `not_found`, `conflict`, `business_rule`, `rate_limit`, `network`, `service` or `unknown_outcome`.
- Approved complete sentences; optional safe field messages keyed by a full field path.
- The **action outcome**: `not_submitted`, `rejected`, `confirmed` or `unknown`. This describes the attempted action, not whether a payment has settled. A confirmed “review pending” response must still describe payment confirmation as pending.
- An explicit recovery: correct fields, sign in, refresh/review, open the existing attempt, check authoritative status, or retry only when the workflow permits it.
- A non-sensitive request reference where available. The reference is for support correlation, not a booking credential, hold token, receipt URL or provider secret.

Category and outcome are separate. A missing record is different from a lack of permission; a timeout after a write is different from a known rejected field value. A successful HTTP response can still describe payment processing or review, and must not be announced as “Payment successful.”

### 2. Preserve API compatibility

Most routes currently return `{ error: humanText }`; a few deliberately use machine discriminators, such as `EMAIL_UNAVAILABLE` and `EMAIL_FAILED`, with a separate `message`. Preserve those existing meanings and fields while introducing safe optional metadata. Preserve success payloads, current status codes, validation constraints, audit behavior and provider/webhook contracts during this copy rollout.

Illustrative additive response for an existing human-error route:

```json
{
  "error": "This room is no longer available for your selected dates. Please choose another room.",
  "code": "EXACT_ROOM_UNAVAILABLE",
  "category": "conflict",
  "outcome": "rejected"
}
```

For an existing machine-error route, retain its discriminator:

```json
{
  "error": "EMAIL_FAILED",
  "message": "We couldn't send the receipt email right now. You can download your receipt instead.",
  "code": "EMAIL_FAILED",
  "category": "service"
}
```

Do not replace the legacy `fields` shape globally: some endpoints return a flat field map and others return Zod's flattened structure. Add normalized `fieldErrors` where necessary, adapt the caller, and retain compatible legacy fields until their consumers are checked. Any existing field-error text exposed to the browser must also be formatted safely.

Do not rewrite machine-to-machine Fleet, Workforce or Xendit webhook bodies merely to make them conversational. Adapt diagnostics only at the human-facing boundary. Do not modify historical SQL migrations or rename database guard codes for copy changes. No migration is currently proposed.

### 3. Server response boundary

Adapt `financial-route`, `manager-route`, `admin-route`, `owner-route`, `housekeeping-route`, `transportation-route`, `hotel-operations-route` and the content/pickup helpers through the common response strategy. Keep each domain's known business messages and existing access checks.

Use a controlled list of domain codes. Existing helpers often use `message.includes(code)` and fall back to 409; preserve compatibility while ensuring unknown database failures do not acquire an invented business meaning. A PostgreSQL wrapper code such as `P0001` alone does not identify a business rule. Extract known application guard tokens from the expected exception form; never forward arbitrary `message`, `details`, `hint`, stack, request body or provider response.

Schema errors should be translated by issue code, full path and field metadata. Examples: missing name → “Please enter the guest's full name”; a maximum amount → a formatted peso maximum; an invalid internal version/reference → reopen the record. Preserve every bound, date/phone/password rule, strict-object behavior and cross-field rule. Do not weaken the 72-byte password constraint to a 72-character constraint.

Unknown failures get an action-specific fallback. A load failure can say “We couldn't load the room list. Please try again.” A mutation whose transaction outcome cannot be proven must say “We couldn't confirm the update. Check the record before trying again.” Do not automatically claim that nothing was saved.

### 4. Client request boundary

Decode the response envelope once and return a typed public result. Only known codes and registered safe public messages are displayable. `instanceof Error` and a JSON object containing an `error` property are **not** proof that the text is suitable for users. A blacklist of SQL words or HTTP codes is insufficient.

Handle rejected fetches, timeouts, non-JSON/HTML responses, invalid response shapes, authentication redirects and unsupported codes without displaying parser text, URLs or raw response content. A user cancellation/aborted superseded read normally needs no error toast. Avoid claiming a connection cause for every exception; use connection language when transport evidence supports it.

For each write, maintain its existing idempotency identity across an unchanged retry. A new identity should correspond to a deliberate new operation. The walk-in form and guest request forms need a stable retry identity; this is a narrow behavioral repair needed to make the proposed recovery truthful. Check authoritative reservation/payment/request state after uncertainty. Do not automatically create another booking, charge, cancellation or provider checkout.

Separate a confirmed mutation from a later refresh failure. If a payment has been recorded but the ledger refresh fails, retain the payment receipt/result and say “Payment recorded. We couldn't refresh the balance. Refresh the folio to check it.” Do not turn a follow-up read error into an instruction to collect payment again. Existing receipt guards and stable keys in `PaymentCollectionDialog` are useful behavior to preserve.

### 5. Concrete domain distinctions to keep

These are existing guard examples, not a proposal to replace the database vocabulary. Confirm each route's current mapping while migrating it; the full SQL inventory includes historical definitions.

| Existing code / condition | Public message / handling |
| --- | --- |
| `ROOM_TYPE_UNAVAILABLE`, `EXACT_ROOM_UNAVAILABLE` | This room is no longer available for your selected dates. Please choose another room. |
| `HOLD_ATTEMPT_EXPIRED` | This booking attempt has expired. Check available rooms to start again. |
| `RETRY_PAYLOAD_CONFLICT` | These details differ from your earlier submission. Check the existing booking or request before starting again. Use the action's actual noun. |
| `GUEST_DO_NOT_RENT` in a guest booking | Contact Front Desk for help with this reservation. Retain the neutral guest message; never expose restricted guest flags. |
| `XENDIT_AMOUNT_ALREADY_SELECTED` | This booking already has a checkout with a different amount. Refresh to reopen the existing checkout. |
| Definitive `XENDIT_CHANNEL_UNAVAILABLE` | This wallet is unavailable right now. Choose another available wallet or contact Front Desk. |
| `XENDIT_REQUEST_UNCERTAIN` / pending provider result | We're checking your payment attempt. Please don't start another payment. Check your reservation for updates. |
| `INSUFFICIENT_STOCK` / the workflow's equivalent stock guard | There is not enough stock to complete this request. Check the stock count or replenish the item before completing it. Claim “Nothing was deducted” only for a confirmed atomic rejection. |
| `ACCOUNT_STALE`, `ROOM_CONFIGURATION_STALE`, `DOCUMENT_STALE` | Keep separate account, room and identity-review instructions to refresh/reopen the specific latest record. |
| `VARIANCE_EXPLANATION_REQUIRED` | Please explain the cash difference before closing or reconciling this shift. |
| `SELF_APPROVAL_FORBIDDEN` | The requester cannot approve their own exception. Keep the financial control explicit. |
| Guest QR not confirmed / identity / room readiness guards | Retain the distinct guest instructions to contact Front Desk, present ID, complete payment or wait for room preparation. |

An HTTP status alone is not enough to choose a domain message. In particular, the current walk-in UI translates **every 409** into unavailable room inventory. Preserve the status contract while adding/using a safe explicit code to choose the message.

### 6. Secure diagnostics

Use existing server-side logging facilities with a common redaction function; no new external logging service is required. Log an allowlisted operation, diagnostic code, normalized status, safe exception class and random request reference. Preserve the existing audit trails and their access controls.

Do not log passwords, verification codes, recovery/hold tokens, cookies, authorization headers, signed URLs, connection strings, provider secrets, guest identity documents, full contact details, SQL row values or entire request/response bodies. Database `details` and `hint` are not safe by default. System Admin may see appropriate operational terms such as SMTP and migration state in their dedicated health workspace; raw exceptions still belong in access-controlled, redacted diagnostics.

The cash-shift routes currently log raw `message`, `details` and `hint`; the reminders route logs the full error object, and notifications log a raw DB message. These are potential exposure paths established from source, **not evidence that a secret has already been logged**. The Xendit routes already use bounded code-oriented diagnostics and provide a useful pattern to retain.

## Presentation and accessibility rules — proposed

| Situation | Display | Next action |
| --- | --- | --- |
| Missing/invalid field | Persistent error beside that field; correct label, `aria-invalid`, associated description. | Correct the field; retain other entries. |
| Several invalid fields | One concise summary with links/focus behavior, plus associated field messages. | Focus the first invalid field or the summary consistently. Avoid announcing the identical message in multiple live regions. |
| Business-rule block | Persistent contextual notice in the affected panel/dialog. | Explain the permitted next step, such as collect balance or choose another room. |
| Permission block | Specific access message in the current context. | Sign in for 401; contact the appropriate authorized role for 403. Preserve privacy-preserving 404 responses. |
| Read/network failure | Inline error with a real retry action and any stale-data disclosure. | Retry the read; avoid replacing unavailable data with an empty-success state or zero. |
| Short action rejection | One error toast when the user can continue without losing context. | Preserve the draft and offer a relevant action when possible. |
| Unknown booking/payment/cancellation outcome | Persistent warning beside the action/status. | Check the authoritative record or reopen the same attempt; never blindly submit again. |
| Actual confirmation decision | Existing confirmation dialog with action-specific buttons. | Keep cancellation/destructive-action decisions; do not add a modal simply to report an error. |

Reuse `FormFieldError`, `formFieldProps`, `focusFirstFormError`, `HavenErrorAlert` and `ToastStack`. Preserve help-text descriptions when attaching an error description. Keep nested/array field paths distinct; do not collapse `transportationPreferences.pickupDate` to a generic leaf if it no longer identifies the correct control. Reveal a collapsed section before focusing its invalid field.

Change dashboard notification signatures so severity is explicit. Manager currently fixes every `notify` call to `success`; Admin and Owner default all calls to `info`. Errors must use error styling, unconfirmed/pending operations warning or informative status, and confirmed actions success. Do not infer severity from English message text.

Fix toast queue promotion on both automatic expiry and manual dismissal. Deduplicate visible and queued items before sound/announcement. Preserve hover/focus timer pausing. Keep essential errors persistent when dismissal would hide the only recovery instruction. Polling should update an existing status message rather than emit a new toast every few seconds.

There are useful foundations: field messages already wrap in `form-field-errors.css`, error alerts have explicit alert roles, toast timers pause for reading, modal fields have error associations, and booking confirmation failures already warn against duplicate payment. Preserve those features. The live-region nesting is a **source-level risk**, not a confirmed result from an assistive-technology test.

## Proposed implementation sequence

1. Add and regression-test the shared vocabulary, safe server formatter and client decoder. Exercise compatibility with both human-error and machine-error envelopes. Keep domain rules and endpoint statuses stable.
2. Route shared guards and domain adapters through those helpers. Replace schema-message forwarding and broad upload exception echoes. Separate guest-facing email/payment copy from Admin/provider diagnostics.
3. Apply approved copy from the reviewed table and catalog at existing source locations. Fix dashboard severity and field placement; retain useful distinctions and existing safe messages. Inspect legacy `fields` consumers before changing any shape.
4. Repair missing catch/finally feedback, stable retries and unknown-outcome recovery in reservation changes, cancellation, guest requests, transportation, walk-in creation, hold release, payment cancellation and receipt email. Preserve automatic provider settlement and existing reconciliation controls. Do not reintroduce retired PayMongo/manual guest-payment workflows.
5. Repair toast queue delivery/deduplication and payment-poll failure/stop feedback. Check successful mutation + failed refresh paths for false failure claims.
6. Run the regression and browser matrix below. Update `SYSTEM.md` only for verified changed behavior, then record the actual results in the session handoff. Nothing in this sequence is recorded as already implemented.

This should be a focused error-boundary and copy change. It does not authorize unrelated visual redesign, schema changes, a deployment, new email sends, live payments or rewriting other sessions' unfinished work.

## Regression and layout acceptance plan

Tests must exercise behavior, not just match source strings. Add deterministic unit tests for the pure mappers and real component interaction tests. Use existing local database workflow checks where their transactional/idempotency guarantees matter; do not replace those guarantees with mocked assertions about business rules.

| Area | Required regression evidence |
| --- | --- |
| Safe mapping | Known domain code yields its specific message; unknown SQL/provider error yields an action-specific fallback. No SQL details, stack, credentials, raw HTML, UUID syntax or provider body reach displayed text. |
| Validation | Required/format/range/integer/length/enum/refinement cases map to the correct control without changing constraints. Test nested transport paths, array indexes, password byte limit and existing phone/date rules. |
| Compatibility | Existing HTTP statuses, success payloads, `EMAIL_FAILED`/`EMAIL_UNAVAILABLE` branches and legacy `fields` contracts remain compatible. Machine integrations retain their contracts. |
| Authentication / permissions | 401 prompts sign-in, 403 explains access, privacy-preserving not-found remains neutral; wrong credentials remain non-enumerating. Reset delivery never exposes SMTP setup text to a guest. |
| Booking / walk-in | Availability conflict differs from other 409 errors. Transport rejection after server commit shows unknown status, preserves details/key and checks the existing reservation before a new create. |
| Payments | Definitive wallet rejection differs from timeout/pending/review. Reopening a known attempt does not create another provider session. Confirmed payment + failed balance refresh retains the receipt and does not prompt another collection. |
| Cancellation / changes | Connection and malformed-response errors release busy guards, retain the draft and show status-check guidance. A confirmed cancellation/refund eligibility result remains distinct from a refund actually paid. |
| Guest requests / transport | A rejected fetch cannot leave loading stuck. Retry uses the same identity for unchanged details. Existing request is checked before a new submission. |
| Staff workflows | Check-in identity/age/balance/readiness, housekeeping DND/stock/inspection, maintenance assignment, stale catalog edits, inventory receiving, cash/refund limits and self-approval restrictions keep distinct messages. |
| Notifications | Error calls produce error tone, warning for uncertainty; one result produces one notification. Queue promotion works on expiry and dismissal; queued duplicates do not repeat sound. |
| Polling | Repeated rejected fetches obey the stop limit; stopped or failed status checks leave useful guidance. No statement that a payment failed merely because polling stopped. |
| Privacy / logs | Redaction strips sentinel passwords/tokens/SQL row details/provider payloads while retaining safe codes and correlation references. No real secrets are used as fixtures. |
| Field accessibility | Invalid state and descriptions identify the actual control; first-invalid focus works in collapsed sections; error correction and retry preserve input. |

Run `npm run typecheck`, ESLint on touched application/test files, targeted Vitest tests, then the full `npm test` and `npm run build` at the implementation checkpoint. Use the repository-supported Node 22.22.2 runtime. The default shell here reports Node 24.21.0; the isolated library probes ran there and are **not** a supported application verification checkpoint.

For actual browser QA, inspect representative real error states at **1440px desktop, 768px tablet, 390px mobile and 320px narrow mobile**, including 200% zoom, short viewport/keyboard pressure, long dynamic values and both supported themes. Exercise login/register/reset, booking details/checkout/confirmation, reservation cancellation/change, payment collection, room/rate forms, housekeeping inspection, maintenance, inventory, cash, Admin and Owner feedback.

Pass criteria: no horizontal page overflow, clipping or ellipsis hiding the recovery instruction; fields and messages stay together; dialog content/actions remain reachable; toast/alert text wraps; fixed headers and toasts do not obscure active controls; keyboard focus is visible; retries work; actual screen-reader checks establish that messages are announced once. An emulated viewport does not establish physical-device keyboard behavior or screen-reader behavior. Record those limits separately.

## Verification actually performed in this audit

- Checked the working tree and the live handoff; preserved the existing application work.
- Reviewed repository/system/design context, shared response guards, UI error primitives and the important guest/staff/admin/provider display paths.
- Scanned 723 source/migration files and generated location-linked inventories.
- Reproduced eight default Zod messages with the installed package.
- Read the installed Next.js `error` file-convention guide. This version supports the `retry` prop; the existing guest error boundaries are correct on that point. No speculative `retry` → `reset` change is proposed.
- Verified that every reviewed finding points to a real source substring and line. Verified source fingerprints remain unchanged while preparing this report.

**Not performed:** application implementation, new application regression tests, typecheck/lint/full-suite/build checkpoint, rendered desktop/mobile checks, screen-reader checks, hosted verification or provider/payment/email exercises. Those remain explicit implementation acceptance work. Earlier sessions' passing tests and screenshots are not claimed as evidence for this proposed change.

**Review boundary:** this report and its catalogs present the proposed wording and changes before application code is modified, as requested. After review, implementation can proceed in the order above. The targeted copy refinement is a clarification/hardening pass; final visual polish should follow verified error behavior.
