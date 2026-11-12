# Location reference recreation — 2026-11-12

Implemented the supplied location-section screenshot and pasted specification
in the actual homepage. The user's follow-up removes the map address and
Open in Maps footer: the native Google map now fills the whole rounded card.
View Directions remains on the photo card.

- Warm ivory, centered editorial heading/subtitle, dark green photo overlay,
  gold arc/chips/CTA, 1.52:1 main columns and three compact photo-led highlights.
- Main cards stack below1100; nearby cards stack on tablet/phone. Phones retain
  a430px photo and340px map; the tablet map is400px and desktop map438px.
- Published Google embed, destinations, uploaded property photo, identity,
  client descriptions, reviewed distances and visibility remain authoritative.
- The unchanged fictional Manila seed uses the requested highlight copy and
  sample walking times. A disclosure explains those times and generated art;
  edited demo descriptions/uploads opt out of replacement copy. The complete
  guide retains category/search/no-match recovery and client route selection.
- Real Rizal Park/museum images retain credits. Two new illustrative assets and
  exact built-in generation prompts are in
  `public/website-samples/location/README.md`.
- Photo layers share a grid and the outer card uses `overflow:clip`. Browser
  QA exposed focus scrolling an `overflow:hidden` card because its decorative
  arc enlarged the scrollable area. The fix keeps photo/image tops equal and
  scrollTop zero when the directions link receives keyboard focus.

## Verification

- Node22.22.2 final production build: pass.
- Explicit typecheck and touched TypeScript ESLint: pass.
- Final focused location suite:31 tests /4 files pass.
- Full suite checkpoint:2,463 tests /237 files pass. Subsequent scoped changes
  (photo layering/clipping and requested footer removal) were covered by the
  final focused suite, typecheck and production build.
- First broad run under concurrent builds hit source-scan/worker timeouts;
  focused rerun37 and then the complete two-worker run passed. A later build
  timed out on existing booking-policy prerendering; subsequent builds passed.
- Live browser checks at1672/1440/768/390/320: no horizontal overflow, photo
  aligned after keyboard focus, map frame exactly fills card, footer absent.
  Search no-match, clear filters and Dining category behavior passed.
- Native Google map loaded with its own controls. No screenshot or custom
  navigation controls replace it. The Google-owned place info panel remains.
- Screenshot evidence is in ignored `.tmp/location-reference-qa/`. Full-page
  IAB captures omit cross-origin map paint, so the final live viewport captures
  are the visual evidence. Earlier misaligned phone captures document the bug,
  not the final result.
- Impeccable detector returned `[]`. Taste source lint flags the explicitly
  requested gradients, gold rules, shadows and outlines; the reference takes
  precedence. Its browser inspector was not used because browser control is
  routed through the supported CUA interface.
- Skill-directed independent finish review found one material issue: the CTA
  focus outline had insufficient contrast against the dark photograph. The
  CTA now uses light gold; production phone recapture confirms focus-visible,
  a3px outline and5px offset. The reviewer scored that sole fix resolved and
  returned Ship at the fix-verification scope.

Final production preview: `http://localhost:3026/#how-to-go`.

## Nearby button follow-up

Replaced the full-guide details/summary with a centered filled Explore Nearby
Places button and right arrow. It toggles a hidden, named region via
`aria-expanded`/`aria-controls`; the open-state label is Hide Nearby Places.
Search/category state remains intact between opening and closing. The separate
photo-credit disclosure is unchanged.

Node22 production build, explicit typecheck, touched ESLint and14 focused tests
in3 files pass. Production browser at1440px and the current430px phone view:
Enter opens/closes the region, hidden search leaves the accessibility tree,
no-match recovery and Dining filtering work, and no horizontal overflow occurs.
Evidence: `nearby-button-phone.jpg` in the existing ignored QA directory.
No full-suite rerun was needed for this scoped follow-up; the earlier full
checkpoint remains identified above. Local production3026 restarted.

The desktop render follows the reference's major geometry and text hierarchy.
Generated/retained images are close alternatives, not identical source photos;
Google controls/labels are owned by Google. The disclosures preserve existing
guide access and media attribution below the reference's highlight row.

Physical-device and authenticated hosted CMS publication QA were not performed.
No migration, database write, commit, push or hosted deployment.
