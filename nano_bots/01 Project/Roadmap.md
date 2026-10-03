# Roadmap

Ideas and TODOs. Nothing here is committed yet.

## Candidates
- [ ] Payments table exists in schema but has no API surface yet
- [ ] guest_requests, reviews, vendors, purchase_orders, audit_logs tables exist but aren't exposed as resources
- [ ] Add tests
- [ ] Rate limiting / brute-force protection on login

## Done
- Initial schema + RBAC + dashboard (as of vault creation)
- Weekly `occupancyTrend` derived from real per-day reservations — and now a single shared
  night-covering basis (`bookedOccupancyTrend`) for the dashboard, Owner executive and analytics
  engine, with booked-vs-live-room-rack labelling on every surface that shows both
