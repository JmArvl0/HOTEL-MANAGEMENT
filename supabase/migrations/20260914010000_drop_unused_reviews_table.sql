-- Drop the unused guest reviews table. It came with the initial schema, was never
-- surfaced in any UI, and nothing in the application reads or writes it.
-- Vendors and purchase_orders stay: they are the natural interface tables for the
-- future hotel-inventory / supply-chain phase.
drop table if exists public.reviews;
