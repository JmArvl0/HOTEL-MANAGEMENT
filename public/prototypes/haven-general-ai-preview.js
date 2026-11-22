/* Standalone concept preview. All data is invented; this file makes no network calls. */
const ROLES = {
  front_desk: {
    label: "Front Desk", initials: "FD", caption: "Front office account",
    description: "Connect arrivals, room readiness, guest requests, transfers, and QR check-in status.",
    contexts: ["Arrivals", "Room board", "Guest requests", "Transfers", "QR check-in"],
    prompts: ["What needs attention before today's arrivals?", "How do room readiness and guest requests affect check-in?", "What can a reservation QR scan tell me?"],
    intro: "Relates arrival preparation to room and service status within Front Desk authority.",
    facts: [["12 arrivals expected", "FACT · Reservations"], ["7 rooms ready", "FACT · Room board"], ["4 open requests", "FACT · Guest requests"]],
    answer: "Start with arrivals that still need a room assignment. The sample room board shows 7 ready rooms, while 4 guest requests remain open. Check readiness and requests before completing check-in. A QR scan can open the protected reservation workflow, but it does not bypass identity, deposit, or room checks.",
    action: "Review arrivals and the room board in HAVEN."
  },
  housekeeping: {
    label: "Housekeeping", initials: "HK", caption: "Room care account",
    description: "Connect room care, inspection, routed guest requests, and supplies within Housekeeping scope.",
    contexts: ["Room care", "Inspections", "Routed requests", "Supplies", "Room QR"],
    prompts: ["What should our team prepare first?", "How do inspections affect room readiness?", "Can a room QR help with a task?"],
    intro: "Relates room work to the department's service queue and supplies.",
    facts: [["8 open tasks", "FACT · Housekeeping"], ["2 inspections pending", "FACT · Room care"], ["2 routed requests", "FACT · Department requests"]],
    answer: "The sample Housekeeping queue has 8 open tasks and 2 rooms awaiting inspection. Two guest requests are routed to this department. Prioritize time-sensitive turnover work, then verify inspection results before treating a room as ready. A room QR can open the authorized task workflow; the assistant cannot mark the work complete.",
    action: "Review the Housekeeping task and inspection queues."
  },
  maintenance: {
    label: "Maintenance", initials: "MT", caption: "Engineering account",
    description: "Connect work orders, room serviceability, supplies, and room QR entry points.",
    contexts: ["Work orders", "Room status", "Supplies", "Room QR"],
    prompts: ["Which work is most urgent today?", "How does an open repair affect room availability?", "What would a room QR open for me?"],
    intro: "Connects maintenance priority to room availability and stock.",
    facts: [["6 open work orders", "FACT · Maintenance"], ["2 urgent orders", "FACT · Work queue"], ["1 room blocked", "FACT · Room board"]],
    answer: "The sample queue has 6 open work orders, including 2 urgent items. One room is blocked from service. Review the urgent orders and confirm whether the room can return to use only after the required work and checks are complete. A room QR opens authorized maintenance context; it does not release the room automatically.",
    action: "Review urgent work orders and room serviceability."
  },
  accounting: {
    label: "Accounting", initials: "AC", caption: "Finance account",
    description: "Ask freely across authorized payment, refund, collection, and balance workflows.",
    contexts: ["Verification", "Refunds", "Collections", "Balances"],
    prompts: ["What financial work needs review today?", "How do pending verifications affect balances?", "Explain the refund queue without approving it."],
    intro: "Connects authorized financial queues without granting payment authority to the assistant.",
    facts: [["3 verifications pending", "FACT · Payments"], ["1 refund pending", "FACT · Refund queue"], ["₱12,450 outstanding", "FACT · Folio balances"]],
    answer: "The sample Accounting view has 3 payment verifications and 1 refund awaiting the authorized workflow. Outstanding balances total ₱12,450. Verify source evidence for each case before a staff member posts or approves anything. The assistant can explain queue status but cannot verify a payment or issue a refund.",
    action: "Open the Accounting queues and review source evidence."
  },
  manager: {
    label: "Manager", initials: "MG", caption: "Operations account",
    description: "Ask across hotel operations, service queues, QR activity, and HAVEN's forecasts.",
    contexts: ["Operations", "Service work", "Room board", "QR activity", "Forecasts"],
    prompts: ["What needs attention across the hotel today?", "How could tomorrow's occupancy affect room care?", "Explain the forecast alongside open service work."],
    intro: "Combines permitted operational facts with separately computed predictions.",
    facts: [["12 arrivals today", "FACT · Reservations"], ["2 urgent repairs", "FACT · Maintenance"], ["High demand tomorrow", "PREDICTION · HAVEN analytics"]],
    answer: "The sample hotel day has 12 expected arrivals and 2 urgent repairs. HAVEN's separate analytics engine indicates high demand tomorrow; that is a prediction, not a confirmed booking count. Check whether repairs and room care could constrain availability before choosing staffing or room actions. Gemini can explain the connection; the Manager decides what to do.",
    action: "Review the source queues and forecast quality in HAVEN."
  },
  owner: {
    label: "Owner", initials: "OW", caption: "Executive account",
    description: "Ask about authorized executive trends, hotel performance, and forecast explanations.",
    contexts: ["Performance", "Trends", "Forecasts", "Reports"],
    prompts: ["How is the hotel performing this week?", "Explain the occupancy outlook.", "What does the forecast mean for planning?"],
    intro: "Explains executive-level facts and forecasts within existing authority.",
    facts: [["7-day outlook", "PREDICTION · HAVEN analytics"], ["Current performance", "FACT · Hotel reports"], ["Open issues", "FACT · Aggregated operations"]],
    answer: "This sample executive view combines current hotel performance with a 7-day occupancy outlook. Current results are facts from HAVEN reports; the outlook is a separately calculated prediction and should be read with its data-quality note. Use source reports before making a pricing or operating decision.",
    action: "Review the executive report and forecast basis."
  },
  admin: {
    label: "System Administrator", initials: "SA", caption: "Administration account",
    description: "Ask about authorized system health, access, and operational status.",
    contexts: ["System health", "Access", "Audit status", "Operations"],
    prompts: ["What system issues need attention?", "Explain the operational health summary.", "Which access checks matter for QR operations?"],
    intro: "Explains permitted administration and aggregate operational status.",
    facts: [["System checks", "FACT · System health"], ["Access events", "FACT · Audit status"], ["QR validation", "FACT · Protected workflow"]],
    answer: "This sample administration view brings together system health, access events, and QR validation status. A QR scan still requires current session, role, and resource checks. Review authoritative logs before changing configuration or access. The assistant cannot change permissions or repair a failed workflow.",
    action: "Review system health and access logs in HAVEN."
  }
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const icon = (name) => `<i data-icon="${escapeHtml(name)}" aria-hidden="true"></i>`;
let role = "front_desk";
let asked = false;
let question = "";

function fillIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    element.innerHTML = window.HAVEN_ICONS?.[element.dataset.icon] ?? "";
  });
}

function renderConversation() {
  const data = ROLES[role];
  $("conversation-body").innerHTML = `
    <div class="welcome"><span class="welcome-icon">${icon("Activity")}</span><div><strong>Good day. I'm HAVEN AI.</strong><p>Ask a question about your hotel work. I can bring together information this account is allowed to see and explain what deserves attention.</p></div></div>
    ${asked ? `<div class="user-message">${escapeHtml(question)}</div><div class="answer-card"><div class="answer-heading">${icon("Activity")}<strong>HAVEN AI</strong><span>Scripted example</span></div><p>${escapeHtml(data.answer)}</p><div class="evidence"><span class="evidence-label">SAMPLE SOURCES</span>${data.facts.map(([fact, basis]) => `<div class="evidence-row"><strong>${escapeHtml(fact)}</strong><span>${escapeHtml(basis)}</span></div>`).join("")}</div><div class="next-step"><strong>Suggested next step</strong><p>${escapeHtml(data.action)}</p></div></div>` : `<div class="conversation-empty"><p>Try a suggested question below, or write your own to see how this assistant space could look.</p></div>`}`;
  fillIcons($("conversation-body"));
}

function render() {
  const data = ROLES[role];
  $("preview-role").value = role;
  $("avatar").textContent = data.initials;
  $("account-name").textContent = data.label;
  $("account-caption").textContent = data.caption;
  $("role-title").textContent = `${data.label} account`;
  $("role-description").textContent = data.description;
  $("context-intro").textContent = data.intro;
  $("context-pills").innerHTML = data.contexts.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  $("context-list").innerHTML = data.facts.map(([fact, basis]) => `<div class="context-item">${icon(basis.startsWith("PREDICTION") ? "Activity" : "FileText")}<div><strong>${escapeHtml(fact)}</strong><span>${escapeHtml(basis)}</span></div></div>`).join("");
  $("suggestions").innerHTML = data.prompts.map((item) => `<button type="button" class="suggestion">${escapeHtml(item)}</button>`).join("");
  $("suggestions").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => ask(button.textContent)));
  renderConversation();
  fillIcons();
}

function ask(value) {
  const next = value.trim();
  if (!next) return;
  question = next;
  asked = true;
  $("question").value = "";
  renderConversation();
  $("conversation-body").scrollTop = $("conversation-body").scrollHeight;
}

$("preview-role").addEventListener("change", (event) => {
  if (!ROLES[event.target.value]) return;
  role = event.target.value;
  asked = false;
  question = "";
  $("question").value = "";
  render();
});
$("ask-form").addEventListener("submit", (event) => { event.preventDefault(); ask($("question").value); });
$("question").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(event.currentTarget.value); }
});
$("theme-toggle").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const button = $("theme-toggle");
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  button.querySelector("[data-icon]").dataset.icon = dark ? "Sun" : "Moon";
  fillIcons(button);
});
render();
