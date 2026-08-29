# 1. Introduction

## 1.1 Background

Hotel operations at small properties are operationally dense but resource-constrained.
A single property must simultaneously track guest reservations, physical room state
(occupied, dirty, under maintenance), housekeeping work orders, maintenance requests,
guest folios and payments, back-of-house inventory, and staff duty rosters. Enterprise
Property Management Systems (PMS) such as Opera Cloud or Mews address this domain but
carry per-room licensing costs, long onboarding cycles, and feature surface that a
10–50 room independent property rarely uses.

The proliferation of modern full-stack JavaScript frameworks has lowered the cost of
building bespoke operational software. Next.js in particular allows a single deployment
to serve public marketing content, server-rendered pages, authenticated application
surfaces, and REST API endpoints — eliminating the need for a separately hosted backend.

## 1.2 Problem statement

There is no affordable, lightweight, and deployable software system that unifies the
core operational modules of a single small hotel property — reservations, rooms,
guests, housekeeping, maintenance, invoices, inventory, and staff — behind a single
sign-in with role-appropriate access, while remaining runnable for demonstration and
evaluation purposes without any infrastructure setup.

## 1.3 Objectives

**General objective.** To design and implement a web-based hotel operations management
system for a single property that supports role-based access to eight operational
modules and can run in both demonstration (in-memory) and production (PostgreSQL) modes.

**Specific objectives.**

1. Provide a public-facing marketing site with a live room browser fed from the same
   database used by operations (`app/(landing-page)/page.tsx`).
2. Implement a unified sign-in gateway supporting eight roles: `owner`, `admin`,
   `manager`, `front_desk`, `housekeeping`, `maintenance`, `accounting`, `guest`
   (`lib/auth.ts`).
3. Enforce a server-side role-to-resource access matrix across all API endpoints
   (`lib/permissions.ts`).
4. Expose eight CRUD resources through RESTful route handlers with aggregated dashboard
   metrics (`app/api/resources/[resource]/route.ts`, `app/api/manager_dashboard/route.ts`).
5. Support zero-configuration startup against seeded in-memory data with a transparent
   switch to PostgreSQL/Supabase via environment variables (`lib/data.ts`).
6. Organise the codebase by module/use case using route groups — `(landing-page)`,
   `(auth)`, `(manager)` — so each business module is independently locatable and
   extensible.

## 1.4 Scope and delimitations

**In scope:** one property (~48 rooms); three web surfaces (public site, login,
staff/guest dashboard); eight CRUD modules; overview metrics and performance reports;
demo and Supabase data modes; dark/light theming; responsive layouts at 1000 px and
680 px breakpoints.

**Out of scope (current version):** multi-property tenancy; online payment processing;
public booking checkout; channel managers / OTAs; point-of-sale integration; native
mobile applications; automated testing pipelines.

## 1.5 Significance of the study

The system demonstrates that a complete, role-aware hotel operations platform can be
delivered as a single Next.js deployment with a progressive data layer, providing:

- **For property owners** — a no-cost evaluation path: the system runs immediately from
  source against seed data, deferring database provisioning until commitment.
- **For developers/researchers** — a compact reference implementation (~560 lines of
  application TypeScript) of RBAC, RESTful resource routing, and dual-mode persistence
  in the App Router paradigm.
- **For the target property** — a direct replacement for spreadsheet-based tracking of
  reservations, room status, housekeeping, and folios.
