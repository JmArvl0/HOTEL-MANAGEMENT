# Customer Portal

## Layout and access

Authenticated guests use the shared `(customer)` route-group layout. It renders a fixed desktop sidebar, icon-only collapsed state, persisted collapse preference, mobile off-canvas drawer, active-route indication, the existing light/dark theme toggle, account popover, homepage link, and sign-out. Guest pages require a NextAuth session with the `guest` role. Staff roles remain in `/manager_dashboard`; ordinary login passes through `/auth/continue` to choose the correct portal.

Focused booking routes keep a simplified header so checkout is not distracted by the full application navigation. Authenticated guests still skip booking login and retain booking context.

## Modules

- `/account` — personalized overview, current/upcoming stay, payment balance, recent requests, derived notifications, and quick actions.
- `/booking/search` — existing live room-type availability and connected booking flow.
- `/my-reservations` — current, upcoming, past, and cancelled groups derived from existing reservation statuses.
- `/my-reservations/[id]` — ownership-filtered stay, guest, rate, folio, policy, and request links.
- `/account/payments` — read-only invoices and recorded payments from the existing accounting tables. No unsupported payment button is shown.
- `/account/requests` — owned request history and request submission into the existing `guest_requests` table.
- `/account/notifications` — a read-only timeline derived from owned reservations, invoices, payments, and requests. There is no independent notification table or read/unread state.
- `/account/profile` and `/account/settings` — validated guest profile updates and password changes.
- `/account/help` — existing booking, arrival, payment, and assistance policies without invented contact details.

## Authorization

Customer reservation and invoice queries begin with `reservations.user_id = session.user.id`. Reservation details require both the requested ID and authenticated user ID. Invoice and payment access is limited to invoice IDs belonging to those reservations. Guest requests are read only through owned reservation IDs; submissions revalidate reservation ownership and eligible status server-side. Customers cannot update reservation status, payment status, room assignment, room readiness, roles, or operational fields.

## Request routing

Customers choose a guest-friendly need rather than an internal department. The API maps the request to Front Desk, Housekeeping, or Maintenance and inserts it into the existing `guest_requests` table. That resource is exposed to the appropriate staff roles in the existing shared staff dashboard, using `open`, `in_progress`, and `completed` operational states.

## Theme and responsive behavior

The portal reuses `lib/theme.ts` and `ThemeToggle`; selection remains stored under the existing `haven-dashboard-theme` key. Portal variables define deliberate dark and light palettes for content, cards, forms, badges, folios, dialogs, and sidebar states. At 900px and below, the sidebar becomes an off-canvas drawer with a backdrop and explicit close control.

## Limitations

- The existing database has no notification entity, so notifications are derived and do not support unread/read state.
- No online card processor is configured; Payments & Folio is truthful and read-only.
- No receipt/PDF generator exists.
- Cancellation remains a Front Desk-assisted policy action.
- Final public hotel contact information is not configured, so Help does not invent an address, phone number, or email.