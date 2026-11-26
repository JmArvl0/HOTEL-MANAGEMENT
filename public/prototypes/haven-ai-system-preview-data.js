/* Generated from docs/ai-placement-by-account.md. Re-run build-haven-ai-system-data.cjs after changing the map. */
window.HAVEN_AI_PREVIEW_MODULES = {
  "front_desk": [
    {
      "name": "Dashboard",
      "purpose": "Shift priorities",
      "description": "Connect today's arrivals, departures, room readiness, and unresolved guest work into a short starting list."
    },
    {
      "name": "Hotel Operations",
      "purpose": "Close readiness",
      "description": "Explain recorded blockers and handover items before the operator reviews the hotel day."
    },
    {
      "name": "Room Management",
      "purpose": "Room choice guidance",
      "description": "Explain why a room is ready, held, dirty, or blocked; suggest eligible rooms using HAVEN's authoritative availability result."
    },
    {
      "name": "Bookings",
      "purpose": "Booking process guide",
      "description": "Walk the operator through reservation status, required identity and deposit checks, room readiness, and QR check-in context; point to the next authorized step without performing check-in."
    },
    {
      "name": "Guest Management",
      "purpose": "Stay context",
      "description": "Summarize relevant stay history, preferences, and flags visible to Front Desk before service; do not send contact or identity details to Gemini."
    },
    {
      "name": "Guest Requests",
      "purpose": "Request triage and bounded approval candidate",
      "description": "Classify and cross-check a submitted batch. Under the proposed policy above, HAVEN could auto-approve an entirely eligible routine batch; Front Desk reviews all other batches and remains the current approver until implementation."
    },
    {
      "name": "Transportation",
      "purpose": "Dispatch preparation",
      "description": "Flag pickup timing, itinerary, and vehicle conflicts that could affect an arrival; staff confirms the dispatch."
    },
    {
      "name": "Approvals & Escalations",
      "purpose": "Exception preparation",
      "description": "Explain the applicable rule and missing evidence before Front Desk files or executes an approved exception."
    },
    {
      "name": "Housekeeping",
      "purpose": "Arrival turnover watch",
      "description": "Highlight cleaning or inspection work that may delay a booked arrival; Housekeeping retains task authority."
    },
    {
      "name": "Reports",
      "purpose": "Daily report explanation",
      "description": "Turn the generated daily snapshot into a source-linked narrative and identify incomplete sections before submission."
    },
    {
      "name": "Billing",
      "purpose": "Folio explanation",
      "description": "Explain booked stay, charges, recorded payments, and remaining balance to support an authorized collection conversation."
    },
    {
      "name": "Transactions",
      "purpose": "Payment status explanation",
      "description": "Distinguish submitted, verified, settled, and refunded activity; identify the source record for follow-up."
    },
    {
      "name": "Deposit Verification",
      "purpose": "Read-only readiness",
      "description": "Explain that a booking is waiting for Accounting review and what Front Desk can do next, without viewing proof or verifying it."
    },
    {
      "name": "Cash & Shifts",
      "purpose": "Drawer close checklist",
      "description": "Explain expected cash, recorded count, and any variance or unresolved step before the human closes a shift."
    },
    {
      "name": "Financial Documents",
      "purpose": "Document readiness",
      "description": "Explain when a receipt or statement can be issued and which settled payment or folio it would represent."
    },
    {
      "name": "Operational Handover",
      "purpose": "Source-linked handover draft",
      "description": "Suggest a concise carry-forward note from unresolved Front Desk items; staff edits and submits it."
    },
    {
      "name": "Lost & Found",
      "purpose": "Claim readiness check",
      "description": "Show custody stage and missing claim or handover checks; never assert ownership or release an item."
    }
  ],
  "housekeeping": [
    {
      "name": "Dashboard",
      "purpose": "Room-care priorities",
      "description": "Rank recorded turnover, stayover, and inspection work by due time and upcoming arrival."
    },
    {
      "name": "Hotel Operations",
      "purpose": "Department blockers",
      "description": "Explain Housekeeping work that may affect readiness or the next shift's handover."
    },
    {
      "name": "Guest Requests",
      "purpose": "Routed work guidance",
      "description": "Summarize only requests approved and routed to Housekeeping, with the next permitted fulfillment step."
    },
    {
      "name": "Approvals & Escalations",
      "purpose": "Exception request preparation",
      "description": "Explain what evidence is needed when Housekeeping asks Manager for an exception."
    },
    {
      "name": "Housekeeping",
      "purpose": "Cleaning and inspection guide",
      "description": "Suggest the next room task from due times, assigned work, and readiness state; the cleaner records actual completion."
    },
    {
      "name": "Inventory",
      "purpose": "Supply watch",
      "description": "Flag low or predicted-shortage supplies relevant to room care using recorded stock and HAVEN forecasts."
    },
    {
      "name": "Operational Handover",
      "purpose": "Room-care carry-forward",
      "description": "Draft unresolved room and inspection notes with source links for staff review."
    },
    {
      "name": "Lost & Found",
      "purpose": "Custody checklist",
      "description": "Remind staff to record finding, storage, and handover stages without exposing claimant notes."
    }
  ],
  "maintenance": [
    {
      "name": "Dashboard",
      "purpose": "Repair priorities",
      "description": "Surface urgent orders and rooms blocked from service using the current work queue."
    },
    {
      "name": "Hotel Operations",
      "purpose": "Serviceability handover",
      "description": "Explain which unresolved faults affect operations and need a next-shift owner."
    },
    {
      "name": "Approvals & Escalations",
      "purpose": "Exception request preparation",
      "description": "Summarize the policy reason and source evidence for a Manager request."
    },
    {
      "name": "Maintenance",
      "purpose": "Work-order guidance",
      "description": "Relate severity, prior incidents, room impact, and required checks; suggest investigation steps without diagnosing or closing an order."
    },
    {
      "name": "Inventory",
      "purpose": "Parts availability",
      "description": "Show stock or predicted shortages for parts linked to open work, with source and data-quality labels."
    },
    {
      "name": "Operational Handover",
      "purpose": "Repair carry-forward",
      "description": "Suggest an ETA and unresolved-work note from recorded orders for staff to verify and submit."
    }
  ],
  "accounting": [
    {
      "name": "Dashboard",
      "purpose": "Financial queue priorities",
      "description": "Summarize pending verifications, refunds, balances, and shift variances without making decisions."
    },
    {
      "name": "Hotel Operations",
      "purpose": "Financial close blockers",
      "description": "Explain only the Accounting items preventing a clean operating-day close."
    },
    {
      "name": "Bookings",
      "purpose": "Payment readiness",
      "description": "Explain the payment and refund status attached to a booking; do not suggest Front Desk check-in actions."
    },
    {
      "name": "Approvals & Escalations",
      "purpose": "Financial exception guidance",
      "description": "Explain an approved exception's permitted financial execution path and source evidence."
    },
    {
      "name": "Reports",
      "purpose": "Financial narrative",
      "description": "Explain collections, outstanding balances, and exceptions from the authorized report snapshot."
    },
    {
      "name": "Billing",
      "purpose": "Folio reconciliation",
      "description": "Trace the booked stay, charges, corrections, applied payments, and balance to help identify a discrepancy."
    },
    {
      "name": "Transactions",
      "purpose": "Transaction investigation",
      "description": "Highlight unusual or unmatched ledger activity and show the records an accountant should inspect."
    },
    {
      "name": "Deposit Verification",
      "purpose": "Verification checklist",
      "description": "Compare permitted proof metadata or a future Stripe-confirmed payment event with the booking obligation and identify missing evidence; Accounting retains deposit verification in the first automation set."
    },
    {
      "name": "Refunds",
      "purpose": "Refund policy explanation",
      "description": "Explain the policy amount, approved exception if any, and payout preconditions before staff processes the refund."
    },
    {
      "name": "Cash & Shifts",
      "purpose": "Cash variance explanation",
      "description": "Relate drawer movements and the saved physical count; require human recount or review where needed."
    },
    {
      "name": "Reconciliation",
      "purpose": "Difference investigation",
      "description": "Group the ledger entries behind a variance and suggest which source documents to compare."
    },
    {
      "name": "Financial Documents",
      "purpose": "Receipt/statement basis",
      "description": "Explain the settled-payment or unchanged-folio rule and point to the source of an issued document."
    },
    {
      "name": "Operational Handover",
      "purpose": "Finance carry-forward",
      "description": "Suggest a source-linked note for unresolved verifications, refunds, and variances."
    }
  ],
  "manager": [
    {
      "name": "Dashboard",
      "purpose": "Hotel priorities",
      "description": "Connect operational risks, room readiness, service queues, and forecasts into a review list."
    },
    {
      "name": "Hotel Operations",
      "purpose": "Cross-team coordination",
      "description": "Explain close blockers and handover ownership across permitted departments."
    },
    {
      "name": "Room Management",
      "purpose": "Availability overview",
      "description": "Explain ready versus blocked room capacity and its effect on near-term bookings."
    },
    {
      "name": "Bookings",
      "purpose": "Booking bottleneck review",
      "description": "Identify reservations waiting on room, service, or exception work; Manager reviews, Front Desk executes."
    },
    {
      "name": "Guest Management",
      "purpose": "Service trend review",
      "description": "Summarize permitted guest-service patterns without exposing identity details to Gemini."
    },
    {
      "name": "Guest Requests",
      "purpose": "Backlog and escalation",
      "description": "Explain aging or escalated requests and the department responsible for the next step."
    },
    {
      "name": "Transportation",
      "purpose": "Dispatch exception review",
      "description": "Flag timing, capacity, or cancellation cases that need coordination."
    },
    {
      "name": "Approvals & Escalations",
      "purpose": "Decision brief",
      "description": "Present the normal policy, submitted evidence, and operational impact; Manager alone decides."
    },
    {
      "name": "Housekeeping",
      "purpose": "Turnover capacity",
      "description": "Connect task load, inspections, arrivals, and HAVEN's workload forecast."
    },
    {
      "name": "Maintenance",
      "purpose": "Repeat-issue review",
      "description": "Explain urgent orders and HAVEN's recurrence-risk classification without predicting a failure date."
    },
    {
      "name": "Inventory",
      "purpose": "Replenishment outlook",
      "description": "Explain current low stock separately from HAVEN's predicted consumption and shortage."
    },
    {
      "name": "Reports",
      "purpose": "Performance explanation",
      "description": "Summarize authoritative daily reports and flag changes or data-quality gaps."
    },
    {
      "name": "Operational Handover",
      "purpose": "Ownership review",
      "description": "Group unresolved items by department, age, and owner for Manager follow-up."
    },
    {
      "name": "Lost & Found",
      "purpose": "Custody oversight",
      "description": "Flag aging claims, incomplete chain of custody, and release-readiness gaps without deciding ownership."
    },
    {
      "name": "Staff & Duty",
      "purpose": "Workload balance",
      "description": "Suggest where recorded duty or task load is uneven; Manager controls assignments."
    },
    {
      "name": "Room Types & Photos",
      "purpose": "Catalog and rate review",
      "description": "Check missing content and explain HAVEN's demand-based price recommendation before a rate proposal."
    },
    {
      "name": "Transfer Vehicles",
      "purpose": "Fleet coverage",
      "description": "Compare recorded vehicle capacity and trip demand before Manager changes availability."
    },
    {
      "name": "Request Types",
      "purpose": "Routing review",
      "description": "Identify request categories with repeated rerouting or missing department coverage; Manager edits the catalog."
    },
    {
      "name": "Predictive Insights",
      "purpose": "Forecast explanation",
      "description": "Explain model factors, observation counts, and fact-versus-prediction labels without recomputing a forecast."
    },
    {
      "name": "HAVEN AI",
      "purpose": "Existing general assistant",
      "description": "Keep cross-module questions here; contextual assistants above should also work within their own modules."
    }
  ],
  "owner": [
    {
      "name": "Dashboard",
      "purpose": "Executive brief",
      "description": "Explain current hotel performance, open risks, and forecast quality from authorized summaries."
    },
    {
      "name": "Executive Operations",
      "purpose": "Cross-department outlook",
      "description": "Connect occupancy, room readiness, and unresolved service work for executive oversight."
    },
    {
      "name": "Financial Overview",
      "purpose": "Financial trend explanation",
      "description": "Explain recorded revenue, collections, and balances alongside authorized trends."
    },
    {
      "name": "Departments",
      "purpose": "Department performance context",
      "description": "Summarize workload and unresolved issues by department without directing staff actions."
    },
    {
      "name": "Admin Governance",
      "purpose": "Governance oversight",
      "description": "Explain account and configuration exceptions that need Owner review, using sanitized metadata."
    },
    {
      "name": "Roles & Permissions",
      "purpose": "Authority explanation",
      "description": "Explain which role can perform a hotel action and why, based on the fixed capability catalogue."
    },
    {
      "name": "Critical Policies",
      "purpose": "Policy impact explanation",
      "description": "Describe how a proposed policy setting affects booking or operations before a human changes it."
    },
    {
      "name": "Payment Settings",
      "purpose": "Destination review",
      "description": "Explain enabled payment routes and configuration completeness without giving Gemini account numbers or secrets."
    },
    {
      "name": "Owner Exceptions",
      "purpose": "Exception decision brief",
      "description": "Present the policy, source evidence, and business impact; the Owner makes the decision."
    },
    {
      "name": "Room Types & Photos",
      "purpose": "Catalog and rate oversight",
      "description": "Explain room-type completeness and HAVEN's demand-based rate basis before an Owner decision."
    },
    {
      "name": "Transfer Vehicles",
      "purpose": "Fleet configuration overview",
      "description": "Highlight capacity or coverage gaps from approved vehicle records."
    },
    {
      "name": "Location & Places",
      "purpose": "Public content review",
      "description": "Identify missing or inconsistent hotel-location content before publication."
    },
    {
      "name": "Transportation",
      "purpose": "Service trend explanation",
      "description": "Summarize transfer demand, exceptions, and fulfillment outcomes at the Owner's read scope."
    },
    {
      "name": "System Audit",
      "purpose": "Change explanation",
      "description": "Explain sanitized patterns in recorded governance changes without exposing raw sensitive events."
    },
    {
      "name": "Security Events",
      "purpose": "Security trend explanation",
      "description": "Summarize event categories and trends, leaving investigation and access decisions to authorized people."
    },
    {
      "name": "Executive Reports",
      "purpose": "Performance narrative",
      "description": "Explain authoritative report results and labeled forecasts for executive planning."
    }
  ],
  "admin": [
    {
      "name": "Dashboard",
      "purpose": "Administration brief",
      "description": "Summarize system health, account queues, and configuration issues visible to Admin."
    },
    {
      "name": "Users & Staff",
      "purpose": "Account workflow guide",
      "description": "Explain lifecycle steps and missing requirements without sending identity or recovery data to Gemini."
    },
    {
      "name": "Roles & Permissions",
      "purpose": "Capability reference",
      "description": "Answer which role has a capability from the fixed catalogue; do not change access."
    },
    {
      "name": "Room Configuration",
      "purpose": "Configuration check",
      "description": "Flag inconsistent room setup while leaving operational room status to the responsible department."
    },
    {
      "name": "Room Types",
      "purpose": "Catalog check",
      "description": "Explain inactive or incomplete type configuration and the effect of proposed changes."
    },
    {
      "name": "Transfer Vehicles",
      "purpose": "Vehicle configuration check",
      "description": "Identify missing or conflicting vehicle setup fields before an Admin saves changes."
    },
    {
      "name": "Location & Places",
      "purpose": "Content validation",
      "description": "Explain incomplete public location and nearby-place configuration."
    },
    {
      "name": "Hotel Policies",
      "purpose": "Policy change explanation",
      "description": "Summarize the effect and dependencies of a proposed policy value before approval and save."
    },
    {
      "name": "Audit Logs",
      "purpose": "Audit summary",
      "description": "Group sanitized administrative change events by type and time; keep raw identities and secrets out of model context."
    },
    {
      "name": "Security events",
      "purpose": "Event pattern summary",
      "description": "Explain authentication or session event patterns from safe aggregates; do not take security actions."
    },
    {
      "name": "Security Configuration",
      "purpose": "Setting explanation",
      "description": "Describe session and OTP setting effects without receiving keys, tokens, or secret values."
    },
    {
      "name": "Password reset audit",
      "purpose": "Recovery trend summary",
      "description": "Explain counts and failure categories; never receive recovery links or tokens."
    },
    {
      "name": "Admin Reports",
      "purpose": "Governance narrative",
      "description": "Summarize account distribution, configuration status, and documented exceptions."
    },
    {
      "name": "System Health",
      "purpose": "Diagnostic explanation",
      "description": "Interpret probe failures and migration status from safe server facts; an Admin chooses any repair."
    }
  ]
};
