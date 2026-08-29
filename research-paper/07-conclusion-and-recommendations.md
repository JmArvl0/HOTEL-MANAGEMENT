# 7. Conclusion & Recommendations

## 7.1 Summary of findings

This paper presented Haven, a web-based hotel operations management system for a single
small property, implemented as one Next.js deployment spanning a public marketing site,
a unified sign-in gateway, and a role-aware operations dashboard with eight CRUD
modules and aggregated reporting.

The principal contributions/design outcomes are:

1. **Dual-mode persistence** — an identical data-access interface serving seeded
   in-memory data (zero-configuration evaluation) and PostgreSQL/Supabase (production),
   selected purely by environment variables.
2. **Server-enforced RBAC** — an eight-role, resource-level permission matrix applied at
   every REST handler boundary, independent of client-side UI filtering.
3. **Declarative module architecture** — a single `config` registry drives tables,
   create forms, and status enums for all eight resources, making module addition a
   data-definition task.
4. **Module-based code organisation** — route groups `(landing-page)`, `(auth)`,
   `(manager)` align folder naming with business use case without affecting URLs.

## 7.2 Conclusions

The system demonstrates that the modern Next.js/TypeScript/PostgreSQL stack can deliver
a coherent hotel operations platform within ~560 lines of application code, and that
demonstration-first design (zero-config boot) need not compromise the production code
path when implemented as progressive enhancement of the data layer. Verification
(typecheck, production build, CRUD/RBAC smoke tests in demo mode) supports the claim
that the system is fit for its current purpose: demonstration, teaching, and evaluation
toward deployment at one real property.

## 7.3 Recommendations / future work

Prioritised toward production readiness at a single property:

1. **Validation layer (high)** — adopt the already-installed zod to schema-check every
   `POST`/`PATCH` body; forbid mass assignment of `id`, `created_at`, financial fields.
2. **Row-level scoping (high)** — restrict `guest` reads to their own
   reservations/invoices before any real guest accounts exist.
3. **Availability constraint (high)** — Postgres exclusion constraint on
   `reservations(room_id, daterange(check_in, check_out))` to make double-booking
   impossible at the database level.
4. **Verb-separated permissions** — split `canAccess` into read/write grants.
5. **State machine for statuses** — replace cyclic badge advancement with guarded
   transitions that trigger side effects (check-in → room occupied; check-out → dirty +
   housekeeping task).
6. **Payments workflow** — activate the dormant `payments` table; make invoice balance
   a generated column (`amount − paid`).
7. **Audit logging** — write `audit_logs` on every mutation.
8. **Performance** — pagination/limits, SQL-side aggregation, caching of dashboard
   metrics.
9. **Quality infrastructure** — test suite, CI pipeline (lint + typecheck + tests),
   structured logging replacing silent `catch {}`.
10. **Public booking surface (revenue)** — replace the decorative booking bar with a
    guest-facing availability search and reservation request flow.

## 7.4 Closing statement

Haven is deliberately positioned as a *starter-grade but honestly documented* system:
its gaps are enumerated rather than hidden, its demonstration capability is an
architectural feature, and each identified gap maps to a concrete, scoped remediation.
It is therefore both a working tool for a small property's near-term needs and a
teachable artefact for full-stack hospitality software engineering.
