# Room-type lifecycle and inherited room amenities

Status (November 11, 2026): implemented in the local application. Both the room
lifecycle and booking/configuration mutex migrations are applied in Supabase.
Local PostgreSQL tests verified both commit orders. The existing
comparison and editor prototypes remain available for reference. See the
[implementation and verification record](../qa/landing-audit-implementation-2026-11-11.md).

## Required behavior

> The system shall allow authorized administrators to dynamically create, edit,
> activate, deactivate, and archive room types. Physical rooms may be assigned or
> reassigned to a room type. Each room type shall support configurable standard
> amenities, which are automatically inherited by all rooms assigned to that room
> type. Individual rooms may optionally contain additional amenities or amenity
> exceptions without modifying the default configuration of the parent room type.

## Planned catalog and room behavior

- **Room types:** create and edit types dynamically, including their existing
  marketing fields, photos, capacity and standard amenities. Support activation,
  deactivation and an explicit archived lifecycle. “Remove” means deactivate or
  archive; do not hard-delete a type referenced by rooms, holds or reservations.
  Distinguish temporarily inactive types from archived types in administration.
- **Activation and retirement:** preserve approved-rate and pending-proposal
  activation rules. Inactive/archived types are excluded from new public booking
  choices. Existing reservations and historical references remain intact.
  Archiving must require safe reassignment/retirement of active physical rooms
  and resolution of live holds or upcoming/in-house commitments; return an
  actionable explanation when these block archival.
- **Physical rooms:** add a uniquely numbered physical room under a room type,
  assign existing rooms, and reassign eligible rooms to another type. Keep room
  numbers permanent. Preserve current commitment, occupancy, version and
  concurrency checks; do not retype a room with protected assignments,
  reservations or live holds. Catalog changes must not rewrite housekeeping or
  operational room status. New assignments require an eligible, non-archived type.
- **Standard amenities:** maintain one default set on each room type. Rooms
  inherit it automatically; do not copy that set into independently editable
  room records. Changes to the default set update the current effective amenities
  of every assigned room, subject to its explicit room-level overrides.
- **Room-level overrides:** allow additional amenities and exclusions from the
  inherited defaults. Show which amenities are inherited, added or excluded, and
  allow an override to be cleared to restore inheritance. A room edit must never
  modify its parent type or another room's configuration.

Effective room amenities are:

`(room-type standard amenities ∪ room additions) − room exclusions`

Use stable normalized amenity identities, deduplicate the result, and reject an
amenity being both explicitly added and excluded. Removing a parent default does
not remove a separately recorded room addition. On reassignment, recompute from
the new parent and retain explicit room overrides; show the resulting changes
before saving. An exclusion absent from the new parent's defaults has no effect
and must be identified as such, rather than deleting unrelated configuration.

Example: Deluxe King supplies Wi-Fi, air conditioning and a desk. Room 101 adds a
microwave and excludes the desk. Its effective amenities become Wi-Fi, air
conditioning and microwave; Room 102 and Deluxe King's defaults stay unchanged.

## Ownership and affected surfaces

- Owner/System Admin are the authorized administrators for full lifecycle
  management and the planned archive action. Preserve existing delegated Manager
  catalog/physical-room powers and the Manager rate-proposal → Owner/Admin
  approval workflow. Do not infer new archive powers or landing-edit access for
  Manager, and do not expand operational staff/guest permissions.
- Use the existing room catalog and physical-room configuration surfaces. The
  landing editor must not keep a duplicate room-type, room or rate catalog.
- Landing/type comparison cards display the type's standard amenities. Exact-room
  choices/details display that room's effective amenities and material exceptions
  before the guest commits. Public results, staff views and booking summaries
  must resolve amenities consistently. Amenities do not independently change
  pricing, occupancy or availability rules.
- Preserve reservation-time promises/history; later catalog edits must not
  silently rewrite a booked reservation's amenity snapshot. Review effects on
  upcoming reservations before applying material amenity changes.
- Enforce authorization, lifecycle constraints, override validation, optimistic
  concurrency and audit records in server/RPC mutations, not only in the UI.

## Prior implementation boundaries

`SYSTEM.md` currently documents dynamic room-type content and amenities, rate
approval, and physical-room creation/retyping. Type retirement currently uses
deactivation, without a distinct archive state. Physical-room configuration does
not currently expose amenity overrides; `rooms.amenities` is documented as vestigial
and shadowed by the room type. **Do not treat that column as an implemented override
system or blindly backfill it into room additions.** Inspect actual source,
migrations and legacy data before designing an additive storage change.

This plan extends the current documented behavior; it does not update `SYSTEM.md`
as though the extension were already implemented. Any later migrations must follow
the repository's live-ledger verification and `supabase db push` workflow.

## Implementation acceptance checks

1. An authorized administrator can create/edit/activate/deactivate/archive a type;
   inactive or archived types disappear from new booking choices without losing
   history. Protected commitments block archival with a clear recovery action.
2. A physical room can be added to an eligible type and safely reassigned; duplicate
   numbers, stale versions and protected stays/holds are rejected atomically.
3. A new room inherits its type's amenities. Parent additions/removals propagate
   without manually updating every room.
4. Adding/excluding an amenity for Room 101 changes only Room 101. Clearing its
   overrides restores inheritance; duplicate/conflicting entries are rejected.
5. Reassignment uses the new parent's defaults and the retained, reviewed room
   overrides, with no stale amenities copied from the former parent.
6. Landing type cards, exact-room selection, staff details and booking summaries
   show the correct standard/effective set. Historical booking snapshots remain
   stable, and existing rate approvals and operational workflows still work.

The implementation record lists the checks completed and the remaining release work.
