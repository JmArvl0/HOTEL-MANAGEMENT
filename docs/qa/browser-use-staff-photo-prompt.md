# Browser Use prompt for Haven staff login and private photos

Copy this prompt into a chat with Browser Use available.

```text
Use Browser Use to QA the Haven Hotel local app at http://localhost:3016/.
Use the local preview only. Ask me to sign in with a designated QA account when
you reach the login form. Let me enter credentials and any OTP directly. Do not
ask me to paste passwords, OTPs, cookies or keys into chat. If Browser Use is
unavailable, report the exact blocker and use HTTP or component checks where possible.

1. On the public homepage, verify there is no “Fictional demo hotel” banner or
   similar badge in the hero, gallery, footer or area guide. Verify no placeholder
   phone, email or street address appears. Confirm the contact background,
   area map, photo credits and the three Manila destinations still appear.
   Check desktop and 390px or 320px mobile without horizontal scrolling.
2. Sign in as an authorized System Administrator and confirm the dashboard opens.
   Navigate to Configuration → Website Content → Photos & gallery. For an Owner,
   the equivalent path is Catalog → Website Content → Photos & gallery.
3. Upload one disposable sample image. Use the project file
   public/room-samples/deluxe-king-room.webp if available, and enter alt text
   “QA upload — safe to remove” and the Actual property category. Click
   Upload private photo and confirm it appears in the uploaded library with a
   working thumbnail. Reload the editor and confirm the image is still present.
   Leave the image unattached and never publish it.
4. In a separate signed-out session, verify the image is unavailable via its
   public image route and the preview link requires sign-in. If a Manager QA
   account is available, verify Website Content is unavailable and the private
   preview is denied. Use the image ID observed from the QA thumbnail only.
5. Return to the authorized editor and delete only the exact uploaded QA image
   after I confirm. Verify it disappears from the library and the preview can no
   longer load. Leave published content, hotel settings and real accounts alone.

Report PASS, FAIL or BLOCKED for each check. Include the viewport and role used.
If capturing screenshots, exclude credentials, user records and other private data.
```
