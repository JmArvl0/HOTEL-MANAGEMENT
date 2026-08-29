# Title & Abstract

## Proposed title

**"Haven: A Modular Web-Based Hotel Operations Management System with Role-Based Access Control Built on Next.js and PostgreSQL"**

Alternative titles:

- "Design and Implementation of a Zero-Configuration Hotel Management System Using Next.js App Router and Supabase"
- "From Demo to Deployment: A Progressive-Enhancement Architecture for Small-Property Hotel Operations"

## Abstract

Small independent hotels frequently manage reservations, room inventory, housekeeping,
maintenance, billing, and staff coordination through disconnected spreadsheets and paper
logs, while enterprise Property Management Systems (PMS) remain costly and over-scoped for
their needs. This paper presents **Haven**, a web-based hotel operations management system
designed for a single property of approximately 48 rooms. The system is implemented as one
Next.js (App Router) deployment serving three surfaces: a public marketing site with a room
browser, an authenticated sign-in gateway supporting eight staff roles, and a manager-facing
operations dashboard exposing eight CRUD modules (reservations, rooms, guests, housekeeping
tasks, maintenance orders, invoices, inventory, and staff) plus aggregated performance
reports.

Architecturally, the system adopts a progressive-enhancement data strategy: it runs with
zero configuration against an in-memory seeded demonstration store, and transparently
switches to a PostgreSQL database (via Supabase) when environment credentials are supplied.
Authentication uses NextAuth.js credentials-based login with JWT session transport; access
control is a server-enforced role-to-resource permission matrix covering eight roles.
RESTful route handlers provide list, create, and status-update operations per resource.

The paper documents the system's design decisions, module organisation, security posture,
and verification results, and identifies prioritised gaps — input validation, row-level
data scoping, reservation availability constraints, and payment workflow integration — as
a roadmap toward production readiness for a real property.

## Keywords

hotel management system; property management; Next.js; React; TypeScript; PostgreSQL;
Supabase; NextAuth.js; role-based access control; RESTful API; Vercel
