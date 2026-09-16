-- Reservation QR stay-lifecycle validity: one stable QR identity per active
-- reservation/stay, enforced server-side against the reservation status.
--
-- reservations.qr_code mirrors the rooms.qr_code precedent: the plaintext of
-- the currently active reservation QR so the customer portal can re-render
-- the SAME code on every view instead of rotating (which killed previously
-- displayed codes). The hash row in qr_tokens remains the authoritative
-- validation record; resolve re-checks revocation + lifecycle on every scan.
--
-- TREAT AS A SENSITIVE BEARER TOKEN: service-role/server access only
-- (reservations inherits the project-wide RLS posture — enabled, no
-- anon/authenticated policies). Never selected by general reservation
-- queries (all use explicit column lists), never logged, never audited,
-- never sent to AI/analytics payloads — exposed only through the authorized
-- QR-display endpoint.
alter table public.reservations add column if not exists qr_code text unique;
comment on column public.reservations.qr_code is 'Plaintext of the active reservation QR token (stable identity for the stay lifecycle). Sensitive bearer token: service-role only, never exposed except via the authorized QR-display endpoint.';
