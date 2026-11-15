# Housekeeping mobile work queue

**5 November 2026 · Local implementation**

Follow-up to [[2026-11-05 - Housekeeping Mobile Web Audit]]. The phone dashboard has **Open My Tasks** before its summary metrics. The queue starts with room search, compact filters, and **My Tasks**. Started work leads that group, including when the worker also has an urgent assignment waiting to start. Queue overview and assignment suggestions expand below the work list. The In progress metric counts all loaded tasks with that status, including tasks displayed under My Tasks and maintenance holds.

Cleaning, completion and inspection controls lead their task cards in both visual and keyboard order. Phone actions, checklist rows and dialog close/submit controls meet a 44 CSS px floor. The dialogs reuse Haven's branded text token and theme-specific checklist surfaces.

## Local acceptance

- Real Housekeeping sign-in and synthetic room turnover against an isolated Next.js, PostgREST and PostgreSQL fixture. Edge Chromium emulated touch completed **Claim → Start cleaning → Complete Task → Inspect** at 320×700, 390×844 and 430×932. Fresh API reads confirmed completed tasks, passed inspections and clean rooms. At 320 px, a failed inspection created a reclean, and the reclean passed inspection.
- At the three portrait widths, the first owned room started at 313–337 px and its Complete Task button was fully visible. Also checked 667×375 landscape and the queue at 1440 px. No document-level horizontal overflow in those checks.
- Branded instructions measured **6.7:1** in light and dark. Checklist labels measured **17.0:1** in light and **14.8:1** in dark on their default surfaces. Screenshots and measured bounds are under `.tmp/mobile-hk-fix/`.
- TypeScript, 86 focused tests and the full 2,338-test suite passed. Touched ESLint returned 0 errors and 8 existing warnings. The production build passed with one worker in the QA copy after the parallel build hit Windows EPERM during prerendering.
- Physical phones and iOS Safari still need a run. Local implementation only.
