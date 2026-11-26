/* Standalone, scripted design preview. No fetch, database, Gemini call, or hotel write. */
const STAFF_MODULES = window.HAVEN_AI_PREVIEW_MODULES;
const GUEST_MODULES = [
  { name: "Dashboard", purpose: "Stay overview", description: "Show the guest's own reservation, request, payment, and arrival information." },
  { name: "Find a Room", purpose: "Booking preparation", description: "Help the guest understand available choices and the additional requests currently offered by the hotel." },
  { name: "My Reservations", purpose: "Reservation guidance", description: "Explain the guest's own booking status and the next permitted step." },
  { name: "Transportation", purpose: "Travel coordination", description: "Explain a guest's own transfer status and where to request help." },
  { name: "Payments & Folio", purpose: "Own payment status", description: "Explain recorded charges and payment status without declaring an unverified payment settled." },
  { name: "My Requests", purpose: "Service request help", description: "Show the guest's submitted requests and available choices; the hotel controls the catalog." },
  { name: "Rewards", purpose: "Reward explanation", description: "Explain the guest's own points activity from recorded transactions." },
  { name: "Help & Support", purpose: "Guest concierge", description: "Open the separate guest concierge for hotel information or a guest-confirmed request draft." },
];
const ROLES = {
  front_desk: { label: "Front Desk", initials: "FD", start: "Bookings", scope: "Arrivals, rooms, requests, and guest-facing operations" },
  housekeeping: { label: "Housekeeping", initials: "HK", start: "Housekeeping", scope: "Assigned room care, supplies, and routed service work" },
  maintenance: { label: "Maintenance", initials: "MT", start: "Maintenance", scope: "Repair orders, serviceability, and relevant parts" },
  accounting: { label: "Accounting", initials: "AC", start: "Deposit Verification", scope: "Payments, folios, refunds, and reconciliation" },
  manager: { label: "Manager", initials: "MG", start: "Approvals & Escalations", scope: "Cross-team operations and Manager decisions" },
  owner: { label: "Owner", initials: "OW", start: "Financial Overview", scope: "Executive summaries and governance decisions" },
  admin: { label: "System Administrator", initials: "SA", start: "System Health", scope: "System configuration, access, and sanitized health" },
  guest: { label: "Guest", initials: "GU", start: "Dashboard", scope: "Own stay and separate guest concierge" },
};
const CATALOG = [
  { id: "pillow", name: "Extra pillow", detail: "Pre-arrival amenity · 8 in stock", visible: true, eligible: true, stock: 8 },
  { id: "towels", name: "Extra towels", detail: "Housekeeping item · 12 in stock", visible: true, eligible: true, stock: 12 },
  { id: "late", name: "Late check-out", detail: "Schedule and possible charge need staff review", visible: true, eligible: false, stock: null },
  { id: "water", name: "Bottled water", detail: "Pre-arrival amenity · temporarily hidden", visible: false, eligible: false, stock: 6 },
];
const state = {
  role: "front_desk", module: "Bookings", selected: {}, aiStates: {}, analyzedAt: {}, aiOpen: false, filter: "All", navQuery: "", eventSerial: 0,
  catalog: CATALOG.map((item) => ({ ...item })), guestPicks: new Set(["pillow"]),
  batches: [
    { id: "GR-310", guest: "Lia Mercado", items: ["Extra pillow"], status: "Pending", source: "Analysis in progress", note: "Routine batch filed; staff and proposed automation may race.", raceEligible: true },
    { id: "GR-309", guest: "Noel Cruz", items: ["Extra towels"], status: "Auto-approved", source: "Auto-approved by HAVEN AI", note: "Prototype policy checks passed · audit A-1049" },
    { id: "GR-308", guest: "Ana Lim", items: ["Late check-out"], status: "Human-approved", source: "Approved by Front Desk · AI assisted", note: "Staff reviewed the schedule and charge · audit A-1048" },
  ],
  stayConfirmed: false, dialogOpen: false,
};
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const icon = (name) => `<i data-icon="${esc(name)}" aria-hidden="true"></i>`;
const allModules = () => state.role === "guest" ? GUEST_MODULES : STAFF_MODULES[state.role];
const currentEntry = () => allModules().find((item) => item.name === state.module) ?? allModules()[0];
const key = () => `${state.role}/${state.module}`;
const currentAiState = () => state.aiStates[key()] ?? "current";
const nowLabel = () => new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
function fillIcons(root = document) { root.querySelectorAll("[data-icon]").forEach((node) => { node.innerHTML = window.HAVEN_ICONS?.[node.dataset.icon] ?? ""; }); }
function badge(label, kind = "neutral") { return `<span class="status-badge ${kind}">${esc(label)}</span>`; }
function button(label, action, cls = "button-secondary", extra = "") { return `<button type="button" class="button ${cls}" data-action="${esc(action)}" ${extra}>${label}</button>`; }
function cardHead(kicker, title, description, action = "") { return `<header class="work-card-header"><div><p class="section-label">${esc(kicker)}</p><h2>${esc(title)}</h2><p>${esc(description)}</p></div>${action}</header>`; }
function metric(label, value, hint) { return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></div>`; }
function detailCell(label, value) { return `<div class="detail-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function selectedIndex(rows) { const index = state.selected[key()] ?? 0; return Math.max(0, Math.min(index, rows.length - 1)); }
function renderNav() {
  const entries = allModules();
  const filtered = entries.filter((entry) => entry.name.toLowerCase().includes(state.navQuery));
  $("side-role").textContent = ROLES[state.role].label;
  $("side-role-note").textContent = state.role === "guest" ? "Separate concierge surface" : "Role-scoped module view";
  $("module-count").textContent = `${entries.length} ${state.role === "guest" ? "guest" : "staff"} modules`;
  $("module-nav").innerHTML = filtered.length ? filtered.map((entry) => `<button type="button" class="nav-button ${entry.name === state.module ? "active" : ""}" data-module="${esc(entry.name)}" ${entry.name === state.module ? 'aria-current="page"' : ""}>${icon(entry.name === "HAVEN AI" || entry.name === "Help & Support" ? "Activity" : "ChevronRight")}<span>${esc(entry.name)}</span></button>`).join("") : `<p class="nav-empty">No matching module.</p>`;
  fillIcons($("module-nav"));
}

const SCENES = {
  "front_desk/Bookings": {
    metrics: [["Expected arrivals", "12", "Today · reservation board"], ["Ready rooms", "7", "Held rooms excluded"], ["Need a check", "3", "Room or deposit blocker"], ["QR ready", "9", "Protected check-in flow"]],
    title: "Today's arrivals", description: "Choose a reservation to see the same operational context beside the work queue.",
    rows: [
      { title: "Lia Mercado · HN-2041", sub: "Arriving today · Deluxe King", status: "Needs attention", kind: "warn", meta: "Room not assigned", facts: [["Room", "Deluxe King · no eligible assignment yet"], ["Deposit", "Submitted · Accounting review pending"], ["QR", "Issued; scan opens protected check-in"]], rec: "Resolve the room assignment and wait for Accounting's deposit review before check-in. A QR scan does not complete those checks.", next: "Open room board and Accounting status", source: "Reservations, room board, deposit status" },
      { title: "Noel Cruz · HN-2042", sub: "Arriving today · Standard Twin", status: "Ready for review", kind: "ok", meta: "Room 412 held", facts: [["Room", "412 · clean, serviceable, held for arrival"], ["Deposit", "Verified by Accounting"], ["QR", "Issued; identity check still required"]], rec: "The recorded room and deposit are ready. Front Desk can continue the protected identity and check-in process.", next: "Open reservation detail", source: "Reservations, room board, Accounting" },
      { title: "Ana Lim · HN-2043", sub: "Arriving tomorrow · Garden Suite", status: "Upcoming", kind: "neutral", meta: "Preparation", facts: [["Room", "Type booked; assignment pending"], ["Deposit", "Verified"], ["QR", "Not yet used"]], rec: "Check turnover progress before tomorrow's arrival. Do not assign a room held for another confirmed reservation.", next: "Review tomorrow's room readiness", source: "Reservations, housekeeping" },
    ],
  },
  "housekeeping/Housekeeping": {
    metrics: [["Open room tasks", "8", "Assigned work only"], ["Inspection queue", "2", "Ready status awaits check"], ["Arrival turnovers", "3", "Due before check-in"], ["Routed requests", "2", "Approved service work"]],
    title: "Room care queue", description: "The assistant suggests priority; Housekeeping records actual completion.",
    rows: [
      { title: "Room 412 · turnover", sub: "Arrival due at 15:00", status: "Inspection due", kind: "warn", meta: "HK-42", facts: [["Task", "Cleaning complete; inspection open"], ["Arrival", "Confirmed guest due today"], ["Supplies", "Linen available"]], rec: "Inspect room 412 before it is marked ready for the arrival. The assistant cannot pass the inspection.", next: "Open inspection task", source: "Housekeeping task, arrival board" },
      { title: "Room 305 · stayover", sub: "Scheduled service · no arrival conflict", status: "Assigned", kind: "neutral", meta: "HK-43", facts: [["Task", "Stayover clean assigned"], ["Due", "This afternoon"], ["Stock", "Supplies available"]], rec: "Complete the assigned stayover task after time-sensitive turnover work.", next: "Review assigned task", source: "Housekeeping queue" },
    ],
  },
  "maintenance/Maintenance": {
    metrics: [["Open work orders", "6", "Maintenance queue"], ["Urgent", "2", "Needs triage"], ["Rooms blocked", "1", "Unavailable for booking"], ["Parts alerts", "1", "Recorded stock"]],
    title: "Work orders", description: "Select a repair to compare serviceability and parts without closing the order.",
    rows: [
      { title: "Room 218 · air-conditioning", sub: "WO-218 · reported at 09:10", status: "Urgent", kind: "danger", meta: "Room blocked", facts: [["Room", "Out of service"], ["History", "Two similar incidents recorded"], ["Parts", "Filter kit available; compressor unconfirmed"]], rec: "Investigate the repeated cooling issue and verify the needed part. Keep room 218 blocked until staff completes the repair and checks.", next: "Open work order", source: "Work orders, room board, parts inventory" },
      { title: "Lobby light · fixture", sub: "WO-219 · low impact", status: "Scheduled", kind: "neutral", meta: "No room impact", facts: [["Work", "Scheduled fixture replacement"], ["Room impact", "None"], ["Parts", "Replacement in stock"]], rec: "Schedule after urgent room work; a technician records the result.", next: "Review work order", source: "Maintenance queue, inventory" },
    ],
  },
  "accounting/Deposit Verification": {
    metrics: [["Awaiting review", "3", "Accounting queue"], ["Possible matches", "1", "Needs source check"], ["Unmatched", "1", "No automatic approval"], ["Refunds", "1", "Separate workflow"]],
    title: "Deposit verification", description: "The assistant can compare permitted metadata; Accounting verifies the payment.",
    rows: [
      { title: "HN-2041 · Lia Mercado", sub: "Deposit submitted · ₱2,000", status: "Pending review", kind: "warn", meta: "P-1041", facts: [["Booking obligation", "₱2,000 deposit required"], ["Payment record", "Proof submitted; unverified"], ["Stripe", "No confirmed event in this sample"]], rec: "The submitted amount matches the booking obligation, but this does not prove settlement. Accounting must review the permitted payment source.", next: "Open protected verification detail", source: "Booking obligation, payment metadata" },
      { title: "HN-2042 · Noel Cruz", sub: "Deposit confirmed by staff", status: "Verified", kind: "ok", meta: "P-1042", facts: [["Payment", "Verified by Accounting"], ["Booking", "Confirmed"], ["Source", "Accounting audit record"]], rec: "The recorded deposit is verified. Review the audit if a discrepancy is reported.", next: "View verification audit", source: "Payment status, Accounting audit" },
    ],
  },
  "front_desk/Lost & Found": {
    metrics: [["Open cases", "7", "Latest 100 records"], ["Awaiting claim", "2", "Ownership unverified"], ["Handover gaps", "1", "Custody check"], ["Released", "4", "Staff action only"]],
    title: "Custody register", description: "AI checks the recorded chain of custody; it never releases an item.",
    rows: [
      { title: "Blue travel pouch · LF-102", sub: "Found in room 318 · stored at Front Desk", status: "Claim review", kind: "warn", meta: "2 days old", facts: [["Custody", "Found → sealed → Front Desk storage"], ["Claim", "Guest description received"], ["Release", "Identity and claim checks incomplete"]], rec: "Compare the permitted claim details with the custody record. A staff member must decide release after the required checks.", next: "Open claim detail", source: "Lost & Found register, custody events" },
      { title: "Black umbrella · LF-101", sub: "Found in lobby · unclaimed", status: "Stored", kind: "neutral", meta: "4 days old", facts: [["Custody", "Stored with location recorded"], ["Claim", "None"], ["Release", "Not eligible"]], rec: "Keep the item in recorded storage and await a claim.", next: "View custody timeline", source: "Lost & Found register" },
    ],
  },
  "owner/Financial Overview": {
    metrics: [["Collections", "₱248k", "Recorded · sample week"], ["Outstanding", "₱18.4k", "Authorized aggregate"], ["Occupancy outlook", "High", "HAVEN prediction"], ["Open risks", "3", "Executive summary"]],
    title: "Performance overview", description: "Executive trends and forecasts are kept separate from recorded results.",
    rows: [
      { title: "Weekly collections", sub: "Source-linked executive report", status: "Recorded fact", kind: "ok", meta: "This week", facts: [["Collected", "₱248,000 recorded"], ["Outstanding", "₱18,400 on open folios"], ["Trend", "Compared with prior week"]], rec: "Collections are recorded; the occupancy outlook is a separate HAVEN forecast. Review the report basis before a pricing or policy decision.", next: "Open executive report", source: "Executive reports, HAVEN analytics" },
      { title: "Next-week outlook", sub: "Model basis · 7-day horizon", status: "Prediction", kind: "warn", meta: "Forecast", facts: [["Forecast", "Higher demand indicated"], ["Basis", "Recent bookings and observed occupancy"], ["Limit", "Not a confirmed booking count"]], rec: "Use the forecast as planning context and check actual reservations before changing rates.", next: "Review predictive basis", source: "HAVEN analytics" },
    ],
  },
  "admin/System Health": {
    metrics: [["Services", "9 / 10", "Sample probes"], ["Warnings", "1", "Needs Admin review"], ["Access events", "12", "Sanitized aggregate"], ["QR checks", "Active", "Protected workflow"]],
    title: "System checks", description: "The assistant explains sanitized health facts; an Admin chooses any repair.",
    rows: [
      { title: "Notification delivery", sub: "Probe reported delayed queue", status: "Warning", kind: "warn", meta: "SH-14", facts: [["Probe", "Delivery latency above sample threshold"], ["Effect", "Notifications may arrive late"], ["Secrets", "Never sent to Gemini"]], rec: "Inspect the delivery queue and recent deployment notes. Do not change configuration from the assistant's suggestion alone.", next: "Open diagnostic detail", source: "System probes, sanitized change log" },
      { title: "QR validation", sub: "Session and role checks responding", status: "Healthy", kind: "ok", meta: "SH-15", facts: [["Probe", "Validation endpoint responsive"], ["Authority", "Current session and role checks remain required"], ["Action", "No automated repair"]], rec: "Continue normal monitoring. A passing probe is not authorization for a QR operation.", next: "View system probe", source: "System health" },
    ],
  },
};
SCENES["housekeeping/Lost & Found"] = {
  ...SCENES["front_desk/Lost & Found"],
  metrics: [["Found items", "5", "Custody records"], ["Need handover", "1", "Department work"], ["Stored", "4", "Location recorded"], ["Claim notes", "Hidden", "Housekeeping scope"]],
  rows: SCENES["front_desk/Lost & Found"].rows.map((row) => ({ ...row, status: "Custody check", meta: "Claim notes hidden", facts: [["Custody", "Found → sealed → storage"], ["Claim notes", "Not available to Housekeeping"], ["Next step", "Record or check handover"]], rec: "Check the custody stage and complete any missing handover record. Claim details and item release remain outside Housekeeping access.", next: "Open custody timeline", source: "Lost & Found custody record" })),
};
SCENES["manager/Lost & Found"] = { ...SCENES["front_desk/Lost & Found"], rows: SCENES["front_desk/Lost & Found"].rows.map((row) => ({ ...row, rec: "Review the custody timeline and aging claim. A responsible staff member still performs the required release checks.", next: "Review custody oversight" })) };

function genericScene(entry) {
  return {
    metrics: [["Account", ROLES[state.role].label, "Existing role scope"], ["Module", entry.name, "Visible navigation"], ["AI purpose", "Defined", entry.purpose], ["Provider on open", "0 calls", "Stored guidance only"]],
    title: `${entry.name} workspace`, description: "Placement preview for this account and module. The content below is fictional.",
    rows: [{ title: `${entry.name} · sample record`, sub: entry.purpose, status: "Sample", kind: "neutral", meta: "Concept", facts: [["Account scope", ROLES[state.role].scope], ["Module purpose", entry.purpose], ["Source", `${entry.name} records permitted to ${ROLES[state.role].label}`]], rec: entry.description, next: `Open the normal ${entry.name} workflow`, source: `${entry.name} authorized records` }],
  };
}
function activeScene() { return SCENES[key()] ?? genericScene(currentEntry()); }
function renderMetrics(scene) { $("metric-strip").innerHTML = scene.metrics.map((item) => metric(...item)).join(""); }
function queueRow(row, index, selected) { return `<button type="button" class="queue-item ${index === selected ? "active" : ""}" data-record="${index}" aria-pressed="${index === selected}"><span class="queue-main"><strong>${esc(row.title)}</strong><small>${esc(row.sub)}</small></span><span class="queue-side">${badge(row.status, row.kind === "ok" ? "" : row.kind)}<small>${esc(row.meta)}</small></span></button>`; }
function recordDetail(row) {
  return `<section class="work-card">${cardHead("SELECTED RECORD", row.title, row.sub)}<div class="work-body"><div class="detail-head"><div><h3>Recorded context</h3><p>These are fictional HAVEN facts, separate from the AI suggestion.</p></div>${badge(row.status, row.kind === "ok" ? "" : row.kind)}</div><div class="detail-grid">${row.facts.map((fact) => detailCell(...fact)).join("")}</div><div class="detail-message">This record remains in its normal authorized workflow. Review the adjacent AI panel for guidance before taking a staff action.</div><div class="detail-actions">${button(`Review source ${icon("ArrowUpRight")}`, "source")}</div><p class="audit-line">${row.batch ? `${esc(row.batch.note)} · ` : ""}Source: ${esc(row.source)} · Sample record only</p></div></section>`;
}
function renderStandard(scene) {
  const rows = scene.rows;
  const index = selectedIndex(rows);
  const visible = state.filter === "Needs attention" ? rows.map((row, i) => ({ row, i })).filter(({ row }) => row.kind === "warn" || row.kind === "danger") : rows.map((row, i) => ({ row, i }));
  return `<section class="work-card">${cardHead("WORK QUEUE", scene.title, scene.description)}<div class="work-body"><div class="toolbar"><div class="filter-group"><button type="button" class="filter-chip ${state.filter === "All" ? "active" : ""}" data-filter="All">All</button><button type="button" class="filter-chip ${state.filter === "Needs attention" ? "active" : ""}" data-filter="Needs attention">Needs attention</button></div><span class="inline-note">Select a record to change AI context · no new call</span></div><div class="queue">${visible.length ? visible.map(({ row, i }) => queueRow(row, i, index)).join("") : '<div class="empty-state">No sample records in this filter.</div>'}</div></div></section>${recordDetail(rows[index])}`;
}

function requestRows() { return state.batches.map((batch) => ({ title: `${batch.guest} · ${batch.id}`, sub: batch.items.join(", "), status: batch.status, kind: batch.status === "Pending" ? "warn" : "ok", meta: batch.source, facts: [["Batch", `${batch.id} · ${batch.items.join(", ")}`], ["Decision source", batch.source], ["Status", batch.status]], rec: batch.status === "Pending" ? "Cross-check this customer's entire filed batch. A mixed, changed, or uncertain batch stays with Front Desk; never auto-reject." : "The decision source is visible in the table and audit detail. The logged-in person is not assigned an automated decision.", next: batch.status === "Pending" ? "Review batch as Front Desk" : "Open decision audit", source: "Guest Request batch, catalog policy, decision audit", batch })); }
function canAutoApprove(batch) { return Boolean(batch?.raceEligible && batch.items.every((name) => state.catalog.some((item) => item.name === name && item.visible && item.eligible && item.stock > 0))); }
function renderFrontDeskRequests() {
  const rows = requestRows(), index = selectedIndex(rows), row = rows[index];
  return `<section class="work-card">${cardHead("GUEST REQUESTS", "Submitted batches", "Analysis and approval are per customer batch, not the entire module.", badge("Proposed automation", "warn"))}<div class="work-body"><div class="queue">${rows.map((item, i) => queueRow(item, i, index)).join("")}</div><div class="detail-actions">${button("Simulate staff approval", "approve-batch", "button-secondary", row.batch.status !== "Pending" ? "disabled" : "")}${button("Race: staff wins", "race-batch", "button-quiet", row.batch.status !== "Pending" ? "disabled" : "")}${button("Race: AI wins", "race-ai-wins", "button-quiet", row.batch.status !== "Pending" || !canAutoApprove(row.batch) ? "disabled" : "")}</div><p class="catalog-note">Guest-visible catalog choices and automatic eligibility use separate controls in Manager → Request Types.</p></div></section>${recordDetail(row)}`;
}
function renderCatalog() {
  return `<section class="work-card">${cardHead("MANAGER CATALOG", "Request Types", "Guest visibility and proposed routine auto-approval are separate settings.", badge("Prototype policy", "warn"))}<div class="work-body">${state.catalog.map((item) => `<div class="catalog-row"><div><strong>${esc(item.name)}</strong><small>${esc(item.detail)}</small></div><label class="toggle-label"><input type="checkbox" data-catalog="${esc(item.id)}" data-field="visible" ${item.visible ? "checked" : ""}><span>Visible to guest</span></label><label class="toggle-label"><input type="checkbox" data-catalog="${esc(item.id)}" data-field="eligible" ${item.eligible ? "checked" : ""} ${item.visible ? "" : "disabled"}><span>Auto-eligible (proposed)</span></label></div>`).join("")}<p class="catalog-note">Turning off visibility removes an item from future guest choices. Existing submitted batches remain visible. An item also needs the booking amenity, stock, routing, and no-charge checks before any automatic approval.</p></div></section><section class="work-card">${cardHead("POLICY PREVIEW", "What happens after a submission?", "The exact allowlist and authority must be approved before live automation.")}<div class="work-body"><div class="event-trace"><div class="event-step"><b>1</b><span>Guest selects an offered item; selection alone does not approve anything.</span></div><div class="event-step"><b>2</b><span>After booking confirmation or a live-stay submission, one customer batch is filed.</span></div><div class="event-step"><b>3</b><span>HAVEN checks the whole batch, current policy, stock, reservation, and record state.</span></div><div class="event-step"><b>4</b><span>Only a fully eligible routine batch may be auto-approved. Others stay with Front Desk.</span></div></div></div></section>`;
}
const EXCEPTIONS = [
  { title: "Room-type substitution · EX-41", sub: "Hotel-caused issue · room 218 blocked", status: "Manager review", kind: "warn", meta: "Alternative found", facts: [["Reason", "Assigned room blocked by repair"], ["Alternative", "Room 412 · exact eligible type, clean and free"], ["Financial impact", "No guest charge or compensation"]], rec: "The evidence supports a possible same-type substitution, but automatic exception approval is only a later proposal. Manager reviews the current case.", next: "Review room 412 and submitted reason", source: "Exception, reservations, room board, maintenance" },
  { title: "Fully booked request · EX-42", sub: "Requested room type has no assignable room", status: "Manager review", kind: "danger", meta: "No eligible room", facts: [["Availability", "No clean, free, serviceable alternative"], ["Current booking", "Existing confirmed reservation"], ["Decision", "Cannot auto-approve a room assignment"]], rec: "No eligible room exists. Prepare alternatives for the Manager and contact the guest through the normal workflow. Do not approve an impossible assignment.", next: "Review alternative arrangements", source: "Exception, reservations, live room board" },
];
function renderExceptions() {
  const index = selectedIndex(EXCEPTIONS), row = EXCEPTIONS[index];
  return `<section class="work-card">${cardHead("MANAGER QUEUE", "Approvals & Escalations", "AI prepares a source-linked brief for every exception; a narrow automatic case is only proposed.")}<div class="work-body"><div class="queue">${EXCEPTIONS.map((item, i) => queueRow(item, i, index)).join("")}</div><p class="catalog-note">Financial, high-risk, and Owner-escalated exceptions remain staff-reviewed. Any future automatic exception requires its own policy, observation trial, and authority change.</p></div></section>${recordDetail(row)}`;
}
function renderGuestBooking() {
  const choices = state.catalog.filter((item) => item.visible && (item.stock === null || item.stock > 0));
  return `<section class="work-card">${cardHead("BOOKING FLOW", "Choose your additional requests", "The Manager controls which eligible choices appear here.", badge(state.stayConfirmed ? "Sample booking confirmed" : "Selection stage", state.stayConfirmed ? "" : "warn"))}<div class="work-body"><div class="two-col"><div class="mini-card"><strong>Deluxe King · 22–24 Nov</strong><p>Fictional reservation for Lia Mercado. Your selected requests are filed only after confirmation.</p></div><div class="mini-card"><strong>Available options</strong><p>Active pre-arrival amenities also need inventory and a positive quantity. Structured services follow their own workflow.</p></div></div><div style="margin-top:12px">${choices.map((item) => `<label class="request-option"><input type="checkbox" data-pick="${esc(item.id)}" ${state.guestPicks.has(item.id) ? "checked" : ""} ${state.stayConfirmed ? "disabled" : ""}><span><strong>${esc(item.name)}</strong><small>${esc(item.detail)}</small></span></label>`).join("") || '<p class="empty-state">No additional request choices are currently offered.</p>'}</div><div class="detail-actions">${button("Confirm sample booking", "confirm-booking", "", state.stayConfirmed ? "disabled" : "")}</div><p class="catalog-note">Selecting a checkbox never triggers automatic approval. Confirmation files the selected batch; the proposed policy is evaluated then.</p></div></section>`;
}
function renderGuestRequests() {
  const choices = state.catalog.filter((item) => item.visible);
  return `<section class="work-card">${cardHead("MY REQUESTS", "Ask for stay assistance", "Submit a fictional live-stay batch. Your selected items are considered together.")}<div class="work-body"><div class="queue">${state.batches.filter((item) => item.guest === "Lia Mercado").map((item) => `<div class="queue-item"><span class="queue-main"><strong>${esc(item.id)} · ${esc(item.items.join(", "))}</strong><small>${esc(item.note)}</small></span><span class="queue-side">${badge(item.status, item.status === "Pending" ? "warn" : "")}<small>${esc(item.source)}</small></span></div>`).join("")}</div><div style="margin-top:15px"><p class="section-label">AVAILABLE TO REQUEST NOW</p>${choices.map((item) => `<label class="request-option"><input type="checkbox" data-pick="${esc(item.id)}" ${state.guestPicks.has(item.id) ? "checked" : ""}><span><strong>${esc(item.name)}</strong><small>${esc(item.detail)}</small></span></label>`).join("") || '<p class="empty-state">The hotel has no visible choices right now.</p>'}</div><div class="detail-actions">${button("Submit sample request", "submit-request")}</div><p class="catalog-note">A hidden item disappears from future choices, but a previously submitted request remains in the history above.</p></div></section>`;
}
function renderGuestDefault(entry) {
  return `<section class="work-card">${cardHead("GUEST PORTAL", entry.name, entry.description)}<div class="work-body"><div class="two-col"><div class="mini-card"><strong>Your stay · HN-2041</strong><p>Fictional guest-owned reservation. Only this guest's information appears here.</p></div><div class="mini-card"><strong>HAVEN Concierge</strong><p>A separate help surface can answer hotel questions and prepare a guest-confirmed request draft.</p></div></div><div class="detail-actions">${button("Open guest concierge", "ask-guest")}${entry.name === "Dashboard" ? button("View additional requests", "guest-requests", "button-secondary") : ""}</div></div></section>`;
}
function renderManagerAiWorkspace() {
  return `<section class="work-card">${cardHead("DEDICATED WORKSPACE", "HAVEN AI", "The Manager already has a general assistant page. This is its own workspace, without a second nested panel.")}<div class="work-body"><div class="two-col"><div class="mini-card"><strong>Ask across authorized modules</strong><p>Connect room readiness, guest work, operational risks, and HAVEN forecasts.</p></div><div class="mini-card"><strong>One assistant</strong><p>Contextual module panels and this workspace share one role-enforced capability.</p></div></div><div class="detail-actions">${button("Ask HAVEN AI", "ask")}</div></div></section>`;
}
function renderWork(scene) {
  let html;
  if (state.role === "manager" && state.module === "Request Types") html = renderCatalog();
  else if (state.role === "manager" && state.module === "Approvals & Escalations") html = renderExceptions();
  else if (state.role === "manager" && state.module === "HAVEN AI") html = renderManagerAiWorkspace();
  else if (state.role === "front_desk" && state.module === "Guest Requests") html = renderFrontDeskRequests();
  else if (state.role === "guest" && state.module === "Find a Room") html = renderGuestBooking();
  else if (state.role === "guest" && state.module === "My Requests") html = renderGuestRequests();
  else if (state.role === "guest") html = renderGuestDefault(currentEntry());
  else html = renderStandard(scene);
  $("module-work").innerHTML = html;
  fillIcons($("module-work"));
}
function panelRecord(scene) {
  if (state.role === "manager" && state.module === "Request Types") return { title: "Request catalog policy", rec: "Separate guest visibility from proposed automatic eligibility. A disabled option must not be auto-approved while pending.", facts: [["Visible choices", `${state.catalog.filter((item) => item.visible).length} of ${state.catalog.length} fictional types`], ["Auto-eligible", `${state.catalog.filter((item) => item.visible && item.eligible).length} proposed routine types`]], next: "Review catalog and proposed policy", source: "Request Types catalog, proposed policy" };
  if (state.role === "manager" && state.module === "Approvals & Escalations") return EXCEPTIONS[selectedIndex(EXCEPTIONS)];
  if (state.role === "front_desk" && state.module === "Guest Requests") return requestRows()[selectedIndex(requestRows())];
  return scene.rows[selectedIndex(scene.rows)];
}
function renderAssistant(scene) {
  if (state.role === "guest") return renderGuestAssistant();
  if (state.role === "manager" && state.module === "HAVEN AI") { $("assistant-panel").innerHTML = ""; return; }
  const record = panelRecord(scene), status = currentAiState();
  const statusLabel = { current: "Current", stale: "Stale", absent: "No analysis yet", unavailable: "AI unavailable", loading: "Updating" }[status];
  const statusKind = status === "current" ? "" : status === "absent" ? "neutral" : "warn";
  const note = status === "stale" ? "A relevant source changed after this recommendation. Use current HAVEN facts below; do not rely on the old recommendation for approval." : status === "absent" ? "There is no stored AI analysis for this context yet. Opening this module does not trigger a Gemini call." : status === "unavailable" ? "The provider is unavailable. HAVEN facts and ordinary staff workflows remain available; uncertain cases stay pending." : status === "loading" ? "A new-information event is updating this affected context. Navigation did not trigger the update." : "";
  $("assistant-panel").innerHTML = `<div class="ai-card"><header class="ai-header"><span class="ai-symbol">${icon("Activity")}</span><div><p class="section-label">PROACTIVE MODULE HELP</p><h2>HAVEN AI</h2><p>${esc(currentEntry().purpose)}</p></div><span class="ai-state">${badge(statusLabel, statusKind)}</span></header><div class="ai-content"><div class="ai-context"><span>Current context</span><strong>${esc(record.title)}</strong></div><section class="ai-section"><h3>Recorded HAVEN facts</h3>${record.facts.slice(0, 3).map(([label, value]) => `<div class="fact-row">${icon("Check")}<span>${esc(value)}<small>${esc(label)}</small></span></div>`).join("")}</section><section class="ai-section"><h3>AI recommendation</h3>${note ? `<p class="ai-state-note ${status === "absent" ? "absent" : ""}">${esc(note)}</p>` : ""}${status === "current" ? `<p>${esc(record.rec)}</p><div class="ai-next"><strong>Suggested next step</strong><p>${esc(record.next)}</p></div>` : ""}</section><div class="ai-meta"><span>Source: <strong>${esc(record.source)}</strong></span><span>${status === "current" ? `Analyzed ${esc(state.analyzedAt[key()] ?? "09:42 · sample")}` : status === "stale" ? "Older analysis" : "No current analysis"}</span></div></div><footer class="ai-footer">${button(`${icon("CircleHelp")} Ask HAVEN AI`, "ask", "")}<p><strong>No AI call on open or selection.</strong> Ask is for a complex hotel question. Approval follows the guarded workflow.</p></footer></div>`;
  fillIcons($("assistant-panel"));
}
function renderGuestAssistant() {
  $("assistant-panel").innerHTML = `<div class="ai-card"><header class="ai-header"><span class="ai-symbol">${icon("Activity")}</span><div><p class="section-label">SEPARATE GUEST SURFACE</p><h2>HAVEN Concierge</h2><p>Guest-owned stay help</p></div>${badge("On demand", "neutral")}</header><div class="ai-content"><div class="ai-context"><span>Current context</span><strong>${esc(state.module)}</strong></div><section class="ai-section"><h3>What a guest can ask</h3><p>Check hotel information, understand your own reservation or request status, and prepare a service-request draft.</p></section><section class="ai-section"><h3>Guest confirmation</h3><p>A suggested request is a draft. The guest confirms submission; the hotel then routes or reviews it.</p></section><div class="ai-meta"><span>Source: <strong>Guest-owned stay and hotel information</strong></span><span>Separate from staff AI</span></div></div><footer class="ai-footer">${button(`${icon("CircleHelp")} Open concierge`, "ask-guest", "")}<p>The guest concierge is not a staff approval tool. This sample makes no service call.</p></footer></div>`;
  fillIcons($("assistant-panel"));
}
function syncAiDrawer(focus = false) {
  const panel = $("assistant-panel"), toggle = $("ai-toggle");
  panel.classList.toggle("open", state.aiOpen);
  panel.setAttribute("aria-hidden", String(!state.aiOpen));
  panel.toggleAttribute("inert", !state.aiOpen);
  toggle.setAttribute("aria-expanded", String(state.aiOpen));
  toggle.setAttribute("aria-label", `${state.aiOpen ? "Close" : "Open"} ${state.role === "guest" ? "HAVEN Concierge" : "HAVEN AI assistance"}`);
  $("ai-peek").hidden = state.aiOpen;
  if (focus) (state.aiOpen ? panel : toggle).focus();
}
function renderDock(scene) {
  const generalWorkspace = state.role === "manager" && state.module === "HAVEN AI";
  $("ai-dock").hidden = generalWorkspace;
  if (generalWorkspace) state.aiOpen = false;
  const status = state.role === "guest" ? "guest" : currentAiState();
  $("ai-toggle").dataset.status = status;
  const label = state.role === "guest" ? "Guest concierge" : {
    current: "HAVEN AI · current", stale: "HAVEN AI · stale", absent: "HAVEN AI · no analysis", unavailable: "HAVEN AI · unavailable", loading: "HAVEN AI · updating",
  }[status];
  const record = state.role === "guest" ? null : panelRecord(scene);
  const preview = state.role === "guest" ? "Help with your own stay is on demand." : status === "current" ? record.rec : status === "stale" ? "A relevant source changed; check current facts." : status === "absent" ? "No stored recommendation yet." : status === "unavailable" ? "Hotel workflows remain available." : "New information is being analyzed.";
  $("ai-peek").innerHTML = `<strong>${esc(label)}</strong><span title="${esc(preview)}">${esc(preview)}</span>`;
  syncAiDrawer();
}
function render() {
  const role = ROLES[state.role], entry = currentEntry(), scene = activeScene();
  document.documentElement.dataset.role = state.role;
  $("role-select").value = state.role;
  $("crumb-module").textContent = entry.name;
  $("page-eyebrow").textContent = `${role.label.toUpperCase()} · ${state.role === "guest" ? "SEPARATE CONCIERGE" : "MODULE PREVIEW"}`;
  $("page-title").textContent = entry.name;
  $("page-description").textContent = entry.description;
  $("account-mark").textContent = role.initials;
  $("ai-state").value = currentAiState() === "loading" ? "current" : currentAiState();
  $("ai-state").disabled = state.role === "guest" || state.module === "HAVEN AI";
  $("new-info").disabled = state.role === "guest" || state.module === "HAVEN AI" || currentAiState() === "loading";
  $("main").classList.toggle("general-ai-page", state.role === "manager" && state.module === "HAVEN AI");
  renderNav();
  if (state.role === "guest") {
    $("metric-strip").innerHTML = metric("Your stay", "HN-2041", "Fictional reservation") + metric("Requests", String(state.batches.filter((item) => item.guest === "Lia Mercado").length), "Own history") + metric("Concierge", "On demand", "Separate guest help") + metric("Provider on open", "0 calls", "This preview");
  } else if (state.role === "front_desk" && state.module === "Guest Requests") {
    $("metric-strip").innerHTML = metric("Filed batches", String(state.batches.length), "One customer per batch") + metric("Pending", String(state.batches.filter((item) => item.status === "Pending").length), "Front Desk queue") + metric("Auto-approved", String(state.batches.filter((item) => item.status === "Auto-approved").length), "Proposed policy example") + metric("Staff decisions", String(state.batches.filter((item) => item.status === "Human-approved").length), "Attributed to staff");
  } else if (state.role === "manager" && state.module === "Request Types") {
    $("metric-strip").innerHTML = metric("Catalog types", String(state.catalog.length), "Fictional choices") + metric("Guest visible", String(state.catalog.filter((item) => item.visible).length), "Selection control") + metric("Auto-eligible", String(state.catalog.filter((item) => item.eligible && item.visible).length), "Separate proposal") + metric("Submitted batches", String(state.batches.length), "History preserved");
  } else if (state.role === "manager" && state.module === "Approvals & Escalations") {
    $("metric-strip").innerHTML = metric("Open exceptions", "2", "Manager queue") + metric("Possible alternative", "1", "Room must be rechecked") + metric("No room available", "1", "Cannot auto-approve") + metric("Auto policy", "Proposed", "No live authority");
  } else renderMetrics(scene);
  renderWork(scene);
  renderAssistant(scene);
  renderDock(scene);
}
function setRole(next) { if (!ROLES[next]) return; state.aiOpen = false; state.role = next; state.module = ROLES[next].start; state.filter = "All"; state.navQuery = ""; $("nav-search").value = ""; closeMobileNav(); render(); $("main").focus(); }
function setModule(next) { if (!allModules().some((entry) => entry.name === next)) return; state.module = next; if (next === "HAVEN AI") state.aiOpen = false; state.filter = "All"; closeMobileNav(); render(); $("main").focus(); }
function announce(message) { $("live-status").textContent = message; }
function closeMobileNav() { $("sidebar").classList.remove("open"); $("mobile-menu").setAttribute("aria-expanded", "false"); }
function fileBatch(items, source = "Guest submission") {
  if (!items.length) { announce("Select at least one visible request."); return false; }
  const selected = items.map((id) => state.catalog.find((item) => item.id === id)).filter(Boolean);
  if (selected.length !== items.length || selected.some((item) => !item.visible)) { announce("An item is no longer offered. Review the visible choices."); return false; }
  const safe = selected.every((item) => item.eligible && item.stock !== null && item.stock > 0);
  const id = `GR-${311 + state.eventSerial++}`;
  state.batches.unshift({ id, guest: "Lia Mercado", items: selected.map((item) => item.name), status: safe ? "Auto-approved" : "Pending", source: safe ? "Auto-approved by HAVEN AI" : "Front Desk review needed", note: safe ? `Prototype policy checks passed · audit A-${1050 + state.eventSerial}` : "Mixed or ineligible batch remains pending for Front Desk.", raceEligible: safe });
  state.selected["front_desk/Guest Requests"] = 0;
  state.aiStates["front_desk/Guest Requests"] = "current";
  state.analyzedAt["front_desk/Guest Requests"] = `${nowLabel()} · sample`;
  announce(`${id} filed from ${source}. ${safe ? "Prototype auto-approval recorded." : "Front Desk review needed."}`);
  return true;
}
function eventRefresh() {
  const target = key();
  state.aiStates[target] = "loading"; render(); announce("New information received. Only this context is updating.");
  window.setTimeout(() => { state.aiStates[target] = "current"; state.analyzedAt[target] = `${nowLabel()} · sample`; if (key() === target) render(); announce("Stored guidance updated for the affected context."); }, 850);
}
let returnFocus = null;
function openAsk(isGuest = false) {
  returnFocus = document.activeElement;
  state.dialogOpen = true;
  const title = isGuest ? "HAVEN Concierge" : "Ask HAVEN AI";
  const intro = isGuest ? "Ask about your own stay or hotel information. This is a separate guest help surface." : `Ask a complex question about ${state.module} within ${ROLES[state.role].label} access.`;
  $("dialog-root").innerHTML = `<div class="dialog-scrim" data-close-scrim="true"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-head"><div><p class="section-label">SCRIPTED SAMPLE ANSWER</p><h2 id="dialog-title">${title}</h2><p>${esc(intro)}</p></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close assistant">×</button></header><div class="dialog-body"><form id="ask-form"><label for="ask-question">Your question</label><textarea id="ask-question" maxlength="500" placeholder="Ask about a hotel workflow…" required></textarea><div class="sample-prompts"><button type="button" data-prompt="What should I check next?">What should I check next?</button><button type="button" data-prompt="Explain the source and policy.">Explain the source and policy.</button><button type="button" data-prompt="Write code for me.">Try an out-of-scope request</button></div><button type="submit" class="button">Show sample answer ${icon("ArrowUpRight")}</button></form><div id="ask-answer" aria-live="polite"></div></div></section></div>`;
  fillIcons($("dialog-root"));
  $("ask-question").focus();
}
function closeAsk() { if (!state.dialogOpen) return; state.dialogOpen = false; $("dialog-root").innerHTML = ""; returnFocus?.focus(); }
function answerQuestion(question) {
  const q = question.trim();
  if (!q) return;
  const misuse = /\b(code|program|script|sql|password|secret|token|api key|export all|download all|ignore your rules|personal essay|homework)\b/i.test(q);
  const isGuest = state.role === "guest";
  const record = isGuest ? null : panelRecord(activeScene());
  const reply = misuse ? "I can only help with authorized HAVEN hotel tasks. I cannot generate code, reveal secrets, export records, or follow instructions in guest notes. Try a question about this module's permitted workflow." : isGuest ? `For ${state.module}, I can explain hotel information or your own stay and prepare a request draft for you to confirm. Your fictional reservation is HN-2041; check its recorded status before acting.` : `${record.rec} The next authorized step is: ${record.next}. This answer uses only the ${ROLES[state.role].label} context shown in the prototype.`;
  $("ask-answer").innerHTML = `<div class="answer-box">${badge(misuse ? "Outside assistant purpose" : "Scripted answer", misuse ? "warn" : "")}<p>${esc(reply)}</p><small>No provider request was made. ${misuse ? "No operational action was taken." : `Source: ${esc(record?.source ?? "guest-owned stay information")}.`}</small></div>`;
}

$("role-select").addEventListener("change", (event) => setRole(event.target.value));
$("nav-search").addEventListener("input", (event) => { state.navQuery = event.target.value.trim().toLowerCase(); renderNav(); });
$("ai-state").addEventListener("change", (event) => { state.aiStates[key()] = event.target.value; render(); });
$("new-info").addEventListener("click", eventRefresh);
$("ai-toggle").addEventListener("click", () => { state.aiOpen = !state.aiOpen; syncAiDrawer(true); });
$("theme-toggle").addEventListener("click", () => { const dark = document.documentElement.dataset.theme !== "dark"; document.documentElement.dataset.theme = dark ? "dark" : "light"; $("theme-toggle").setAttribute("aria-pressed", String(dark)); $("theme-toggle").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme"); $("theme-toggle").innerHTML = icon(dark ? "Sun" : "Moon"); fillIcons($("theme-toggle")); });
$("mobile-menu").addEventListener("click", () => { const open = $("sidebar").classList.toggle("open"); $("mobile-menu").setAttribute("aria-expanded", String(open)); });
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-catalog]")) {
    const item = state.catalog.find((candidate) => candidate.id === target.dataset.catalog);
    if (!item) return;
    item[target.dataset.field] = target.checked;
    if (!item.visible) item.eligible = false;
    state.aiStates["front_desk/Guest Requests"] = "stale";
    eventRefresh();
    announce(`${item.name} ${target.dataset.field === "visible" ? "guest visibility" : "proposed auto eligibility"} ${target.checked ? "enabled" : "disabled"}. Only affected guidance is refreshing.`);
  }
  if (target.matches("[data-pick]")) { if (target.checked) state.guestPicks.add(target.dataset.pick); else state.guestPicks.delete(target.dataset.pick); }
});
document.addEventListener("click", (event) => {
  const moduleButton = event.target.closest("[data-module]");
  if (moduleButton) { setModule(moduleButton.dataset.module); return; }
  const recordButton = event.target.closest("[data-record]");
  if (recordButton) { state.selected[key()] = Number(recordButton.dataset.record); render(); return; }
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.filter = filter.dataset.filter; render(); return; }
  const prompt = event.target.closest("[data-prompt]");
  if (prompt) { $("ask-question").value = prompt.dataset.prompt; $("ask-question").focus(); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "ask" || action === "ask-guest") openAsk(action === "ask-guest");
  if (action === "close-dialog") closeAsk();
  if (action === "guest-requests") setModule("My Requests");
  if (action === "source") announce("This is a fictional source record. No hotel record is connected.");
  if (action === "confirm-booking") { const picks = [...state.guestPicks].filter((id) => state.catalog.some((item) => item.id === id && item.visible)); state.stayConfirmed = true; if (picks.length) fileBatch(picks, "confirmed booking"); render(); }
  if (action === "submit-request") { if (fileBatch([...state.guestPicks], "live-stay guest submission")) { state.guestPicks.clear(); render(); } }
  if (action === "approve-batch") { const batch = state.batches[selectedIndex(requestRows())]; if (batch?.status === "Pending") { batch.status = "Human-approved"; batch.source = "Approved by Front Desk · AI assisted"; batch.note = "Staff decision · audit A-1052"; render(); announce(`${batch.id} approved in this fictional preview by Front Desk.`); } }
  if (action === "race-batch") { const batch = state.batches[selectedIndex(requestRows())]; if (batch?.status === "Pending") { batch.status = "Human-approved"; batch.source = "Approved by Front Desk · AI assisted"; batch.note = "Staff action won; late AI proposal discarded · one audit outcome"; render(); announce("Staff approval won. The late AI proposal was discarded."); } }
  if (action === "race-ai-wins") { const batch = state.batches[selectedIndex(requestRows())]; if (batch?.status === "Pending" && canAutoApprove(batch)) { batch.status = "Auto-approved"; batch.source = "Auto-approved by HAVEN AI"; batch.note = "Automation won; a stale staff click must report already reviewed · one audit outcome"; render(); announce("Automation won in this fictional race. A stale staff click would report already reviewed."); } }
  if (event.target.matches("[data-close-scrim]")) closeAsk();
});
document.addEventListener("submit", (event) => { if (event.target.id === "ask-form") { event.preventDefault(); answerQuestion($("ask-question").value); } });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { if (state.dialogOpen) closeAsk(); else if (state.aiOpen) { state.aiOpen = false; syncAiDrawer(true); } else closeMobileNav(); }
  if (event.key === "Tab" && state.dialogOpen) {
    const focusable = [...$("dialog-root").querySelectorAll("button,textarea")].filter((node) => !node.disabled);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
fillIcons();
render();
