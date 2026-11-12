# Landing Audit Current / Proposed Comparison — November 11, 2026

User requested a current/proposed comparison based on the audit, then explicitly
expanded scope to all findings. Created one inline, interactive review with all
34 findings from `docs/qa/landing-ui-ux-audit-2026-11-11.md`.

Deliverable source:
`C:/Users/Mark Rowell/.codex/visualizations/2026/11/11/01a1c88c-d100-7c02-ad38-ed6e7cd84e71/haven-current-proposed.html`

- Finding selector and previous/next expose F01–F34, each with severity, current
  evidence, proposed treatment, guest impact and a distinct visual/behavior example.
- Full-page tab compares reconstructed audited content/order with the proposed
  guest decision journey. It is explicitly a reconstruction, not a live screenshot.
- Local interactions cover calendar dates/months/keyboard dismissal, photo viewing,
  policy/contact placement, room selection, compact account context, FAQ and intent.
- Existing source images and approved generated samples are illustrative in both
  review contexts. Bracketed address/contact/amenity/policy/photo requirements need
  owner-approved facts. No fabricated verified hotel, review, legal text or measured
  performance gain. Room-number interactions are sample inventory, explicitly labeled.

Verification:

- All 34 unique finding views and 34 coverage rows rendered without JS errors in
  JSDOM. Script syntax checked through Node VM; final source below the 1 MB limit.
- Actual in-app Chromium rendered every finding at 1024px, 390px and 320px;
  proposed panels had no horizontal overflow in the measured checks.
- Full-page layout checked at 1024px, 768px and 320px. Images loaded, fonts rendered,
  practical FAQ expanded, and proposed calendar remained outside clipping geometry.
- Calendar advanced to December (31 dates, correct accessible date labels), selected
  December 5–7, and Escape returned focus to its trigger. Current trigger/Escape
  specimen reproduced the audited behavior.
- Selecting Garden Twin and sample Room 201 retained type/number/date/party and
  the illustrative ₱11,600 two-night amount in the compact account continuation.
- Viewport override reset, preview tab closed, owned QA server stopped. Initial
  127.0.0.1 preview timed out; localhost worked after using the permitted local server.

No production UI, business logic, database, environment, deployment, commit or push
changed. App typecheck/full suite/build were not rerun for this isolated inline
review; previous audit results remain separate. Helpers stay in ignored
`.tmp/landing-ux-comparison/`. Preserve all pre-existing working-tree changes.
