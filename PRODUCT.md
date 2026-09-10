# HAVEN Hotel & Residences

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Guests and prospective customers compare rooms, search live availability, reserve a stay, submit a required deposit for verification, and manage their stay.
- Hotel staff operate the property through role-based Front Desk, Housekeeping, Maintenance, Accounting, Manager, Admin, and Owner workspaces.

## Product Purpose

HAVEN is a hotel management and direct-booking system for one property. It connects the public booking journey and guest self-service to the hotel’s operational workflows and live PostgreSQL data in Supabase.

## Positioning

The same system carries a guest from live room availability through a time-limited hold, deposit verification, arrival, service requests, folio, and checkout while giving each hotel role only the controls it is authorized to use.

## Operating Context

Guests usually search by stay dates and party size, compare room types, select a room, sign in or register, enter stay details, hold inventory, and submit a deposit. Staff then verify payments, assign rooms, complete assisted check-in, coordinate service work, and maintain financial and audit records.

## Capabilities and Constraints

- Next.js and TypeScript application with REST-style route handlers, NextAuth authentication, PostgreSQL in Supabase, GitHub version control, and Vercel deployment.
- Live availability, rates, room inventory, holds, deposit policy, and booking state remain database-backed; presentation changes must not replace these with fabricated data.
- Public reservations use a configurable deposit policy and a time-limited inventory hold. Deposit submission is verified by authorized hotel staff before confirmation.
- A check-in QR may support arrival, but Front Desk completes identity verification and physical room assignment.
- The system serves one HAVEN property. It must not imply a global chain, unsupported AI recommendations, fake reviews, ratings, scarcity, guarantees, promotions, or sustainability claims.
- Prices are shown in Philippine pesos.

## Brand Commitments

HAVEN Hotel & Residences should feel calm, refined, modern, welcoming, and hospitality-led. The current direction uses coastal light, warm ivory, deep ocean teal, sea-glass accents, editorial serif display type, and clear sans-serif utility text. Public booking must feel like the same site as the landing page.

## Evidence on Hand

- Live room types, photos when uploaded, pricing, and availability come from Supabase through `lib/booking.ts`.
- Booking, guest, payment, transportation, operational, role, and audit workflows are implemented in the repository and described in `SYSTEM.md`.
- No approved reviews, star ratings, awards, sustainability metrics, or global-property claims are available; future interfaces must not fabricate them.

## Product Principles

1. Product truth outranks promotional convention.
2. Make the guest’s next action and current booking state unmistakable.
3. Keep operational rules enforced server-side and visible in plain language at the right moment.
4. Preserve a continuous experience from public discovery to role-based hotel operations.
5. Make responsive and keyboard-accessible behavior part of the shipped workflow.

## Accessibility & Inclusion

Public and authenticated workflows use semantic structure, clear labels, visible keyboard focus, sufficient contrast, and responsive layouts with touch-sized controls.
