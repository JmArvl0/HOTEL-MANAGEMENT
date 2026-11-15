# Housekeeping mobile web audit

**5 November 2026 · Local working tree · Audit only**

The core room-care flow works with touch in a phone browser. The current layout makes staff scroll too far to find work, gives secondary actions more prominence than cleaning, and understates active work in the queue summary.

## Findings

| Priority | Finding | Evidence and suggested change |
| --- | --- | --- |
| P1 | The next room is several screens down | With 16 loaded task records and suggestions visible, the first actionable room started at about 2,960 px on a 390×844 viewport and 3,380 px on a 320×700 viewport. Five summary cards, the guest-request strip and a full suggestion list precede search and work. Put room search and **My tasks**, **Needs attention**, and **Inspection** first. Collapse suggestions and make the summary compact. See `components/manager/housekeeping-queue-panel.tsx:143`. |
| P1 | The summary hides the current worker's active cleaning | The dashboard showed **Cleaning now 1** while the queue showed **In progress 0** with an active task under **My tasks**. The card counts only the `in_progress` display group, which excludes active tasks grouped under `my_tasks`. Urgent assigned tasks also move into **Needs attention** ahead of the ownership grouping. Count active tasks from the applicable task statuses and keep owned work easy to find. See `components/manager/housekeeping-queue-panel.tsx:43` and `:162`. |
| P1 | The phone layout reverses the action hierarchy | The mobile CSS puts **Room Details** and **Report Issue** before **Start cleaning** and **Claim**, while the source order runs the other way. Room actions measured 34 px tall with 6 px gaps. Checklist submit and cancel measured about 36 px. Match visual and keyboard order, put the next action first, and use Haven's 44 px mobile target. Move secondary actions behind a clearly labelled control where practical. See `app/staff-theme.css:790` and `:814`, and `DESIGN.md:199`. |
| P1 | Dialog instructions are hard to read | Light-theme branded dialog help text renders at **2.97:1** contrast against its dark header. The completion checklist footer starts below the visible area at 320×700. Use a high-contrast header token, keep the submit action reachable in short viewports, and make inspection selection deliberate. The current form preselects **passed**. See `app/staff-theme.css:2054` and `components/manager/manager-dashboard-client.tsx:316`. |
| P2 | Navigation loses work context | The mobile menu requires opening the Operations group to reach Housekeeping from the dashboard. Refresh returns to Dashboard. Opening Guest Requests from a scrolled queue started partway down the new module in the browser. Give the role a visible **Open my tasks** shortcut and a stable queue URL. Reset scroll on forward module navigation and restore the queue position on return. See `components/manager/manager-dashboard-client.tsx:113` and `:358`. |
| P2 | Secondary workflows still require sideways scrolling | Inventory's 335 px table sits in a 316 px scroll area at 390 px and a 246 px area at 320 px, pushing **Select** off the right edge. Room Details uses a similar scrollable tab strip, with 32 px high tabs. Reflow inventory rows and keep every room-detail tab discoverable at 320 px. See `components/manager/stock-integrity-panel.tsx:37` and `app/staff-theme.css:688`. |

## Technical review

The queue uses the app's existing design components and task workflow coherently. Its mobile layout needs a different order of information and actions. This is a scoped implementation score, with local observations for performance.

| Dimension | Score | Main finding |
| --- | --- | --- |
| Accessibility | 2/4 | Low dialog contrast and mismatch between visual and focus order. |
| Performance | 3/4 | Local touch submissions and refreshes worked. Assignment suggestions add a separate request and render an extra list before active work. |
| Theming | 2/4 | Light and dark layouts render. The light-theme dialog overrides the description with a low-contrast hard-coded color. |
| Responsive design | 2/4 | Main views fit, but touch sizes, scroll depth and nested horizontal scrolling affect daily work. |
| Implementation integrity | 3/4 | The touch workflow persists correctly. Queue summary and module navigation have isolated correctness issues. |
| **Total** | **12/20** | **Significant mobile usability work remains.** |

## Verification

- Actual Housekeeping login, populated queue and browser touch through a loopback Next.js, PostgREST and PostgreSQL clone. The working tree was copied into an ignored QA directory for the browser runs.
- Edge Chromium at 320, 390, 430, 768 and 1440 CSS px, with dark mode checked at 390 px. The dashboard and queue had no document-level horizontal overflow. Room Details, completion, inspection and issue reporting opened with touch. Guest Requests, Inventory, Hotel Operations, Approvals and Operational Handover were reviewed on the narrow layouts.
- The synthetic room's **Claim → Start cleaning → Complete Task → Inspect** flow returned HTTP 200 on all four submissions at 390 px. A fresh API read confirmed task completed, inspection passed and room clean. Four targeted Vitest files passed all 85 tests under Node 22.22.2.
- Physical devices, iOS Safari, camera/QR, on-screen keyboards, weak Wi-Fi, guest-request fulfillment, service outcomes and a full accessibility conformance check remain unverified. The Impeccable detector engine was unavailable, so the contrast result came from rendered browser styles.
- Screenshots and measurements are in `.tmp/mobile-hk/`. All browser writes were confined to disposable local records. This session changed no application code.
