# Guest Management implementation

10 November 2026, Asia/Singapore. The user approved the prototype and asked
the profile panel to use the available height at the bottom.

- The staff Guest Management section opens a searchable directory beside a
  full-height profile on wide screens. Each panel scrolls its own content.
  Phones open the profile separately and return to the same directory context.
- The staff directory read uses canonical stay history, recorded loyalty,
  and active flag labels. Legacy schemas retain guest and stay reads, and
  the VIP filter is available when the flag table exists.
- Overview, Stays and Guest flags reuse existing profile, booking and
  flag permissions. Reservation details can still open the profile in a modal.
- Local production build passed. The 73 focused tests passed, and touched
  lint reported zero errors and five existing dashboard warnings. The full
  suite reported 2,409 passes and two unrelated assertions in purchase orders
  and Billing's shared toolbar styles.
- Chromium checked the component at 320–1,920 px in both themes, equal desktop
  bottoms with short and long lists, and independent profile scrolling. The
  isolated demo directory endpoint returned 401 without a session, 403 for
  Accounting and 200 for Front Desk. The actual Front Desk page passed search,
  profile and mobile return with a signed demo session. The browser simulated
  session activity because that endpoint requires a database. Guest data was
  fictional.
