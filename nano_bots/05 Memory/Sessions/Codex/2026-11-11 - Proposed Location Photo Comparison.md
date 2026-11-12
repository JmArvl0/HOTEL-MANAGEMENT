# Proposed location photo comparison — November 11, 2026

User requested a place-photo background for the pictured contact block and photos
for Rizal Park, Manila museum district and city transport, preferring online sources.
The accepted scope remains **proposed comparison only**.

Created `haven-current-proposed-photos.html` in the thread visualization directory
(`C:/Users/Mark Rowell/.codex/visualizations/2026/11/11/01a1c88c-d100-7c02-ad38-ed6e7cd84e71/`).
Earlier comparison versions are retained. The contact card uses an actual Rizal Park
backdrop, dark legibility overlay and scene caption. Nearby entries show distinct
photos of Rizal Monument, National Museum of Fine Arts and LRT-1 at Pedro Gil.
All area photos were downloaded from Wikimedia Commons and visually inspected.

Source/author/license/modification metadata is recorded in
`docs/design/haven-location-photo-sources.json`; expandable credits travel with
each selected photo. Rizal CC BY 2.0, museum CC0 1.0 and LRT CC BY-SA 2.0, retaining
the latter source's attribution line and share-alike notice. Actual public-place
photos do not establish a real Haven hotel or distances from the fictional address.

Updated the JSON seed and profile mapping. Demo hotel settings edits the contact
background plus nearby names, descriptions and photo keys; captions/alt/credits
follow the chosen image. Older saved profiles retain edits while gaining new photo
fields. Hotel/gallery imagery remains illustrative. Embedded images were optimized
into this new version; no third-party image requests are required. Final760,558bytes.

Verification:

- Rerun JSDOM configuration checks: all34 findings, profile propagation, unchanged
  Current snapshot, validation/escaping/reset and repository policy alignment pass.
- Photo checks: three distinct decodable images, six source/license links, editable
  background/nearby choices, invalid photo rejection and old-profile restore pass.
- Real browser1024/390/320: all34 Proposed views fit without horizontal overflow.
  Inspected desktop nearby/contact and mobile image crops/readability. Native photo
  selection/apply, persistence after reload, reset and source-credit disclosure pass;
  no browser error logs. Viewport reset, owned tab closed, QA server stopped.

No application/DB changes, deployment or commit. Full app typecheck/build/tests
were not rerun for this comparison-only update. Authoring/check helpers remain in
ignored `.tmp/landing-ux-comparison/`.
