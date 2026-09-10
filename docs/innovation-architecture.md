# Innovation Architecture — Predictive Analytics, Gemini AI Assistance, QR Operations

The defense document for HAVEN's capstone innovation layer. Capstone title: *"Design and
Development of a Google Gemini AI-Assisted Hotel Management System with Integrated QR-based
Operation using Predictive Analytics."* This document separates what each component does, why the
responsibilities are split the way they are, how the pieces integrate with the existing system,
and where the honest limits are.

Companion: `SYSTEM.md` §7.13 (operational summary), §9 (tables), §11 (routes), §13 (security).

## 1. The one data flow

```
hotel operational data (reservations, housekeeping tasks, work orders, inventory movements)
        │
        ▼
lib/analytics/*  — HAVEN's own predictive engine (the ONLY predictor in the system)
        │  structured forecasts: FACT / PREDICTION labeled, data-quality graded
        ▼
analytics_model_runs + analytics_predictions  (snapshots + evaluation targets)
        │  sanitized, aggregated, PII-minimized payloads — never raw rows
        ▼
lib/ai/*  — Gemini (explanation, summary, recommendation — advisory, read-only, server-side)
        │  zod-validated structured output, audited, rate-limited, disclosed
        ▼
authorized human (manager / owner / admin) — every decision and every operation
```

Three properties this split guarantees:

1. **Every number a user sees is computed by HAVEN's own code**, deterministically, from the
   operational database. Gemini never produces a forecast figure.
2. **Gemini adds narrative intelligence on top** — it explains what the forecast means, summarizes
   the day, and recommends what to consider. It cannot mutate anything.
3. **QR codes add fast physical entry points into existing workflows** — they carry no data and
   grant no authority; resolution re-checks everything on every scan.

## 2. Predictive analytics engine (`lib/analytics/`)

Pure functions over plain arrays (`{reservations, rooms, tasks, orders, movements}`), so they run
in both database modes and are trivially unit-testable. Four models, each versioned and persisted
per run:

| Model | Method (explainable by design) | Data quality gate |
|---|---|---|
| **Occupancy** (`occupancy-v1`) | Per day over a 7-day horizon: KNOWN occupancy = reservations with status confirmed/checked_in covering the night (**FACT** — a confirmed count is never labeled a prediction). PREDICTED final occupancy = known + mean historical *pickup* for that lead time, where pickup = rooms that materialized beyond what was already booked k days out, pooled across weekdays over the trailing 84 days | Prediction published only with ≥5 pickup observations per lead; "medium" quality at ≥14; below the minimum the day shows fact-only plus an honest "N observations" basis |
| **Housekeeping workload** (`housekeeping-v1`) | Expected departures → checkout cleans; stayovers → stayover services; inspections per `hotel_operational_policies.housekeeping_inspection_required`; guest-request volume = mean daily guest-request tasks over 14 days; labor hours = mean real `completed − started` duration (30-day window) × expected tasks | Labor hours only when ≥5 real duration samples exist; workload rating only with ≥10 days of history — no invented staffing numbers |
| **Inventory demand** (`inventory-v1`) | Per item: predicted 3-day consumption = mean daily consumption from `inventory_movements` (30-day window) × 3 → projected shortage, recommended reorder. Deliberately distinct from the existing low-stock alert: a shortage is *predicted* when forecast consumption will exceed stock, not when stock is already low | ≥7 distinct movement days required; below that the item is flagged "not yet predictable" — never guessed. `inventory_movements` is the schema addition that makes this model possible at all |
| **Maintenance risk** (`maintenance-risk-v1`) | Repeat-incidence grouping by (room, category) over trailing 90 days: incident count, recurrence trend (increasing when the recent 30-day window outpaces the prior one), days since last, unresolved count → risk level + human-readable reason + suggested preventive action | A risk **classification**, never a failure probability — the system never claims "the AC will fail tomorrow," only that the repeat pattern justifies preventive attention |

**Snapshots and evaluation.** `runner.ts` writes an `analytics_model_runs` row per model and an
`analytics_predictions` row per predicted value (type, target date, resource, value, risk level,
data quality). Once a target date has elapsed, the runner compares the newest prediction for that
date against the actual and records the error — occupancy MAE (rooms) and MAPE, housekeeping MAE
(tasks), inventory MAE (units) — surfaced in the UI as "Prediction performance". Maintenance risk
validation stays qualitative until enough labeled outcomes accumulate (documented, not faked).
Metrics are computed over elapsed target dates only, newest prediction per date.

**Generation cadence.** Daily Vercel cron (`vercel.json` → `POST /api/analytics/generate`,
02:35 Manila, `CRON_SECRET` bearer) plus an authorized Manager's on-demand refresh; both respect
a 1-hour cooldown. `/api/analytics/insights` serves the latest snapshot with an on-demand-compute
fallback (demo mode or no snapshot yet).

## 3. Gemini AI assistance (`lib/ai/`)

**What Gemini is: an advisor.** It explains, summarizes and recommends. It never predicts,
computes a forecast, or executes any operation. It cannot approve payments, verify deposits,
issue refunds, cancel reservations, check guests in or out, assign rooms, modify room status,
close cash shifts, adjust inventory, modify housekeeping tasks, resolve work orders, execute
arbitrary SQL, or bypass RBAC — not because a prompt asks it to be careful, but because the
architecture gives it no path to do any of that: Gemini's only outputs are zod-validated text
structures, and the only tools it can call are read-only TS functions.

**Client discipline** (`gemini-client.ts`). Server-only; `GEMINI_API_KEY` is read exclusively in
server code, never exposed to browser JavaScript (no `NEXT_PUBLIC_` variant exists), never logged,
never returned. Every call returns a discriminated result
(`unconfigured | rate_limited | timeout | unavailable | invalid`) and **never throws** — a Gemini
outage only disables AI text; reservations, payments, housekeeping, reports all keep working, and
the UI says so plainly.

**Access control** (`guard.ts`). Manager/Owner/Admin only, enforced server-side before any data
is fetched or any Gemini call is made. Front Desk, Housekeeping, Maintenance, Accounting and
Guests have no AI access at all.

**Four features.**

| Feature | Route | What Gemini receives | What comes back |
|---|---|---|---|
| Daily operations brief | `GET /api/ai/brief` | The analytics engine's own forecast output + arrival/departure/unresolved-issue aggregates | `{summary, priority_actions[], warnings[], prediction_explanations[]}` — cached per hotel day; refresh rate-limited |
| Ask HAVEN | `POST /api/ai/ask` | The user's question (+ short client-held history) and, through the tool loop, the outputs of read-only tools it chooses to call | Advisory answer + the tool list it drew on (provenance shown in the UI) |
| Explain with AI | `POST /api/ai/explain` | The forecast type only — the **server rebuilds** the forecast and its contributing factors; the client never supplies numbers | `{explanation, key_factors[], data_quality_note}` per forecast type |
| AI-assisted report summary | `POST /api/ai/report-summary` | `buildDailyReport` aggregates (§7.12) for a date | A labeled "AI-assisted summary"; the original report snapshot stays authoritative and untouched |

**The tool registry** (`tools.ts`). An explicit, fixed list of read-only functions — operational
summary, occupancy forecast, arrivals, departures, housekeeping forecast, inventory risk,
maintenance risk, guest requests, transportation. **There is no generic SQL tool and no path to
one.** Each tool returns aggregated, PII-minimized payloads: "3 arrivals require accessibility
preparation," never a guest name in a room. The Ask-HAVEN loop lets Gemini call these tools (≤5
passes), executes them server-side, and feeds the results back.

**Output safety.** Gemini is schema-guided (structured JSON mode) and the response is
zod-validated before it ever reaches the UI; unvalidated model output is never rendered.
Prompts (`prompts.ts`) enforce FACT/PREDICTION/RECOMMENDATION labeling and forbid fabricating
figures — and the enforcement doesn't depend on the prompt, because every figure shown alongside
the text comes from HAVEN's engine.

**Audit and rate limits** (`audit.ts`). Every interaction writes an `ai_interactions` row
(user, role, feature, tool calls, status, model, latency). Prompt and response bodies are
deliberately **not stored**. Recent rows per user+feature are the durable, serverless-safe rate
limit (brief refresh 3/10 min, ask 15/10 min, explain and report-summary 20/10 min).

**Disclosure.** Every AI surface renders: *"AI-generated operational guidance. Verify important
decisions using authoritative HAVEN records."*

## 4. QR-based operations (`lib/qr/tokens.ts`, `app/api/qr/**`, dashboard scan modal, `/qr-placard/[roomId]`)

**The token is a lookup key, not a credential.** QR payloads are opaque 32-byte crypto-random
URL-safe strings. Only the SHA-256 hash is stored (`qr_tokens`). **No guest data is encoded in any
QR code.** Possessing a token grants nothing by itself: `POST /api/qr/resolve` requires a valid
session, checks the scanner's role, re-checks the **current state of the resource**, and writes a
`qr_scan_events` audit row. Unknown tokens resolve to a generic invalid result; revoked/expired
tokens are logged and refused.

**Reservation check-in QR.** A guest sees a QR on their own reservation detail/confirmation page
for a `confirmed` reservation (ownership = `reservations.user_id`; staff can fetch it too).
Tokens rotate on every fetch — only the currently displayed QR is valid — and expire at check-out
+ 2 days. A Front Desk scan resolves to check-in context (guest name, confirmation number,
payment status, room). **The QR bypasses nothing**: ID verification, deposit settlement and room
readiness are still enforced by the existing `front_desk_check_in` RPC, and a reservation whose
status has changed (cancelled, no-show, already checked in/out) can never initiate check-in —
resolve re-reads the reservation on every scan.

**Per-room operations QR — one code, role-aware experiences.** A persistent token per room
(printable placard at `/qr-placard/[roomId]`, staff-only page; rotatable by Manager/Owner/Admin).
The same scan resolves differently by role: an authenticated guest with an active checked-in stay
in that room → guest-request entry (their own portal form); housekeeping → that room's task
context; maintenance → that room's work orders; front desk/manager/owner/admin → a room summary;
anyone else (including accounting) → a generic refusal. Each experience deep-links into the
existing authoritative module — no duplicated workflow, no new mutation path.

**Scanner** (dashboard modal, opened from Overview and Reservations). Camera scanning via jsQR
(works in every modern browser, including iPhone
Safari) with a manual token-entry fallback, a camera-permission explainer, and explicit
invalid / expired / revoked / unauthorized / ineligible states. All manual workflows remain fully
intact — QR is an accelerator, not a dependency.

## 5. Why Gemini is not the predictor (the defense argument)

1. **Determinism and auditability.** A hotel makes money-moving decisions on these figures
   (staffing, reordering, preventive maintenance). Those figures must be reproducible, testable
   and explainable line-by-line. `lib/analytics` is pure, versioned, unit-tested code; an LLM
   output is none of those things.
2. **Data custody.** HAVEN's engine reads the operational database directly with service-role
   discipline. Gemini sees only the sanitized, aggregated, PII-minimized result — the minimum
   data necessary for its advisory task.
3. **Failure isolation.** When Gemini is down, HAVEN loses narrative help and keeps every
   operational capability, including the forecasts themselves. If Gemini were the predictor, an
   external API outage would blind the hotel.
4. **Cost and quota sanity.** Forecast computation runs daily on a schedule in our own runtime;
   Gemini is called only when a human asks for narrative assistance, rate-limited and audited.
5. **The right tool for each job.** Pickup-rate estimation over reservation history and
   repeat-incidence grouping over work orders are small, well-specified statistical tasks — the
   kind a few dozen lines of auditable TS do better than a prompt. Turning structured results
   into an actionable operational narrative is exactly what an LLM does better than a template.

## 6. Integration with the existing system (nothing duplicated, nothing bypassed)

- The analytics engine reads the same tables the dashboards read; snapshots add tables, they
  never fork the data.
- AI surfaces live in the existing Manager dashboard as two new workspaces (Predictive Insights,
  HAVEN AI) — same shell, same theming, same session.
- QR resolve deep-links into the existing check-in workflow, guest-request portal, housekeeping
  queue, maintenance module — the existing role-guarded RPCs remain the only mutation paths.
- The innovation migration follows the established trust model exactly: RLS enabled, no policies,
  EXECUTE on nothing new (all logic is TS), service-role-only access.

## 7. Honest limitations

- **Young dataset.** The system went live 2026-08-26; pickup estimates and labor-hour figures
  start at "Limited" data quality and are always labeled with their observation basis. No
  confidence is fabricated.
- **Inventory history starts at deploy.** `inventory_movements` begins empty; the inventory
  forecast is movements-based only once history accumulates, and flags items as "not yet
  predictable" until then.
- **Maintenance risk is room-scoped** — there is no asset registry, so recurring-issue analysis is
  per room+category, not per physical unit.
- **Hobby-plan cron is daily** — one scheduled snapshot per night; mid-day refresh is the
  Manager's manual button.
- **Prediction performance metrics** accrue only as target dates elapse; with a young dataset the
  observation counts are small and shown as-is.
- **Ask HAVEN history is client-held** (last 6 turns sent, nothing persisted) — a refresh loses
  the conversation, by design (no new chat-storage surface).

## 8. Testing strategy

- **Unit tests** (`lib/analytics/*.test.ts`): zero reservations, full occupancy, cancellations,
  no-shows, insufficient history, timezone/Asia-Manila day boundaries — deterministic outputs.
- **AI tests** (`lib/ai/*.test.ts`): `@google/genai` mocked — missing key, unavailable,
  rate-limited, timeout, invalid JSON, schema validation, RBAC refusal, no-secret exposure, tool
  authorization, payload sanitization. **The normal test suite never calls live Gemini.**
- **QR tests** (`lib/qr/*.test.ts` with the fake-supabase seam): issue/validate/expire/revoke,
  unknown tokens, reservation-state re-check, guest room ownership, audit rows.
- **Component tests** (jsdom): Predictive Insights and HAVEN AI panels — fact/prediction
  separation, refresh, explanation rendering with disclosure, outage degradation.
- **Live system test lane** (`scripts/system-test.mjs`): rollback-safe in-transaction fixtures
  covering QR issuance/resolution and analytics run + prediction persistence.
- **Live smoke** (`scripts/ai-smoke.mjs`, opt-in env flag): one minimal authorized Gemini call —
  the only place live Gemini is ever exercised, never in CI gates.
