(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => `<i data-icon="${name}">${window.HAVEN_ICONS[name]}</i>`;
  for (const element of document.querySelectorAll("i[data-icon]")) element.innerHTML = window.HAVEN_ICONS[element.dataset.icon];

  // Fixed, fictional records for UI review. No API or financial write is connected.
  const transactions = [
    { id: "TX-1158", at: "2026-11-15T15:42:00+08:00", guest: "Amara Reyes", booking: "HVN-261115-042", purpose: "stay_payment", method: "Card", reference: "CARD-115842", amount: 5400, status: "paid", source: "Front Desk collection", note: "Applied to the guest folio.", reviewed: "2026-11-15T15:46:00+08:00" },
    { id: "TX-1157", at: "2026-11-15T14:18:00+08:00", guest: "Mateo Villanueva", booking: "HVN-261112-036", purpose: "refund", method: "Cash", reference: "REF-115718", amount: 350.25, status: "paid", source: "Accounting refund", note: "Refund outflow is recorded separately from the original payment.", reviewed: "2026-11-15T14:18:00+08:00" },
    { id: "TX-1156", at: "2026-11-15T12:07:00+08:00", guest: "Isabel Santos", booking: "HVN-261115-058", purpose: "deposit", method: "Bank transfer", reference: "BT-115607", amount: 2800, status: "pending_verification", source: "Guest submission", note: "Submitted proof is waiting for Accounting review." },
    { id: "TX-1155", at: "2026-11-15T10:52:00+08:00", guest: "Sofia Mendoza", booking: "HVN-261114-039", purpose: "deposit", method: "GCash", reference: "GC-115552", amount: 3200, status: "paid", source: "Guest payment", note: "Verified deposit applied to the guest folio.", reviewed: "2026-11-15T11:01:00+08:00" },
    { id: "TX-1154", at: "2026-11-15T09:35:00+08:00", guest: "Enzo de Leon", booking: "HVN-261115-017", purpose: "stay_payment", method: "Bank transfer", reference: "BT-115435", amount: 4700, status: "failed", source: "Guest submission", note: "Proof did not match the submitted payment amount.", reviewed: "2026-11-15T10:03:00+08:00" },
    { id: "TX-1153", at: "2026-11-15T08:24:00+08:00", guest: "Lucia Navarro", booking: "HVN-261113-013", purpose: "stay_payment", method: "Cash", reference: "CASH-115324", amount: 8624, status: "paid", source: "Front Desk collection", note: "Linked to the open cash drawer at collection.", reviewed: "2026-11-15T08:24:00+08:00" },
    { id: "TX-1149", at: "2026-11-14T17:29:00+08:00", guest: "Gabriel Cruz", booking: "HVN-261114-018", purpose: "deposit", method: "GCash", reference: "GC-114929", amount: 1900, status: "paid", source: "Guest payment", note: "Verified deposit applied to the guest folio.", reviewed: "2026-11-14T17:41:00+08:00" },
    { id: "TX-1148", at: "2026-11-14T16:18:00+08:00", guest: "Mara Lim", booking: "HVN-261111-064", purpose: "refund", method: "Bank transfer", reference: "REF-114818", amount: 1200, status: "paid", source: "Accounting refund", note: "Refund outflow is recorded separately from the original payment.", reviewed: "2026-11-14T16:18:00+08:00" },
    { id: "TX-1147", at: "2026-11-14T13:05:00+08:00", guest: "Theo Garcia", booking: "HVN-261114-021", purpose: "stay_payment", method: "Card", reference: "CARD-114705", amount: 7056, status: "paid", source: "Front Desk collection", note: "Applied to the guest folio.", reviewed: "2026-11-14T13:05:00+08:00" },
    { id: "TX-1146", at: "2026-11-14T11:44:00+08:00", guest: "Noel Bautista", booking: "HVN-261114-033", purpose: "deposit", method: "Bank transfer", reference: "BT-114644", amount: 2500, status: "pending_verification", source: "Guest submission", note: "Submitted proof is waiting for Accounting review." },
    { id: "TX-1145", at: "2026-11-14T09:12:00+08:00", guest: "Elena Ramos", booking: "HVN-261114-025", purpose: "stay_payment", method: "Cash", reference: "CASH-114512", amount: 6160, status: "paid", source: "Front Desk collection", note: "Linked to the open cash drawer at collection.", reviewed: "2026-11-14T09:12:00+08:00" },
  ];

  const purposeLabels = { deposit: "Reservation deposit", stay_payment: "Stay payment", refund: "Refund" };
  const statusLabels = { paid: "Settled", pending_verification: "Awaiting review", failed: "Failed" };
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
  const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
  const asMoney = (amount) => money.format(amount);
  const dayLabel = (at) => date.format(new Date(at));
  const timeLabel = (at) => time.format(new Date(at));
  const stamp = (at) => `${dayLabel(at)} · ${timeLabel(at)}`;

  const workspace = $("#workspace");
  const rows = $("#rows");
  const query = $("#query");
  const type = $("#type");
  const period = $("#period");
  const role = $("#role");
  const filters = [...document.querySelectorAll("[data-status]")];
  const pageSize = 6;
  let status = "all";
  let page = 0;
  let selectedId = transactions[0].id;
  let returnFocusId = selectedId;

  const inPeriod = (record) => period.value === "all" || record.at.startsWith(period.value === "today" ? "2026-11-15" : "2026-11-14");
  const matches = (record) => {
    const search = query.value.trim().toLowerCase();
    return inPeriod(record)
      && (type.value === "all" || record.purpose === type.value)
      && [record.guest, record.booking, record.reference, record.id].some((value) => value.toLowerCase().includes(search));
  };

  function renderSummary() {
    const scoped = transactions.filter(inPeriod);
    const gross = scoped.filter((record) => record.status === "paid" && record.purpose !== "refund").reduce((sum, record) => sum + record.amount, 0);
    const refunds = scoped.filter((record) => record.status === "paid" && record.purpose === "refund").reduce((sum, record) => sum + record.amount, 0);
    $("#gross").textContent = asMoney(gross);
    $("#refunds").textContent = asMoney(refunds);
    $("#net").textContent = asMoney(gross - refunds);
    $("#pending").textContent = String(scoped.filter((record) => record.status === "pending_verification").length);
  }

  function renderDetail(record) {
    const content = $("#detail-content");
    if (!record) {
      content.innerHTML = `<div class="detail-empty">${icon("ReceiptText")}<h3>No transaction selected</h3><p>Choose a ledger entry to review its recorded details.</p></div>`;
      return;
    }
    const isRefund = record.purpose === "refund";
    const pending = record.status === "pending_verification";
    const failed = record.status === "failed";
    const guidance = pending
      ? role.value === "accounting"
        ? "Accounting can review submitted proof in Deposit Verification. This ledger is for inspection."
        : "Accounting reviews submitted proof in Deposit Verification. Front Desk can follow its status here."
      : failed
        ? "This attempt is not included in settled collections. Review the reason in Deposit Verification or Billing."
        : isRefund
          ? "This refund is a separate outflow; the original payment remains in the ledger."
          : "This settled entry is preserved. Any correction is recorded through a separate financial workflow.";

    content.innerHTML = `
      <div class="record-top">
        <div class="record-overline"><span>${purposeLabels[record.purpose]}</span><span class="status ${record.status}">${statusLabels[record.status]}</span></div>
        <p class="record-amount ${isRefund ? "outflow" : ""}">${isRefund ? "−" : ""}${asMoney(record.amount)}</p>
        <p class="record-person">${record.guest} <span>· ${record.booking}</span></p>
        ${pending || failed ? `<p class="record-outcome">${record.note}</p>` : ""}
      </div>
      <div class="detail-section">
        <h3>Recorded details</h3>
        <dl class="facts">
          <div><dt>Transaction ID</dt><dd>${record.id}</dd></div>
          <div><dt>Recorded · Manila</dt><dd><time datetime="${record.at}">${stamp(record.at)}</time></dd></div>
          <div><dt>Payment method</dt><dd>${record.method}</dd></div>
          <div><dt>Source</dt><dd>${record.source}</dd></div>
          <div class="reference"><dt>Reference</dt><dd>${record.reference}<button type="button" class="copy-button" id="copy-reference" aria-label="Copy reference ${record.reference}">${icon("ClipboardList")} Copy</button></dd></div>
        </dl>
        <p class="copy-feedback" id="copy-feedback" role="status" aria-live="polite"></p>
      </div>
      <div class="detail-section history">
        <h3>Record history</h3>
        <ol>
          <li><span class="history-dot"></span><div><strong>${record.source}</strong><time datetime="${record.at}">${stamp(record.at)}</time></div></li>
          ${record.reviewed ? `<li><span class="history-dot"></span><div><strong>${failed ? "Marked failed" : isRefund ? "Refund recorded" : "Payment settled"}</strong><time datetime="${record.reviewed}">${stamp(record.reviewed)}</time></div></li>` : ""}
        </ol>
      </div>
      <div class="context-note ${pending || failed ? "attention" : ""}">${icon(pending || failed ? "CircleAlert" : "CircleCheck")}<div><strong>${pending ? "Review required" : failed ? "Not settled" : isRefund ? "Separate refund entry" : "Settled record"}</strong><p>${guidance}</p></div></div>
      <p class="detail-footnote">${record.note} · Fictional sample record.</p>`;

    $("#copy-reference").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(record.reference);
        $("#copy-feedback").textContent = "Reference copied.";
      } catch {
        $("#copy-feedback").textContent = `Copy unavailable here. Reference: ${record.reference}`;
      }
    });
  }

  function renderRows() {
    renderSummary();
    const base = transactions.filter(matches);
    for (const filter of filters) {
      const value = filter.dataset.status;
      filter.setAttribute("aria-pressed", String(value === status));
      filter.querySelector("span").textContent = String(value === "all" ? base.length : base.filter((record) => record.status === value).length);
    }
    const filtered = base.filter((record) => status === "all" || record.status === status);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages - 1);
    const start = page * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    if (!visible.some((record) => record.id === selectedId)) selectedId = visible[0]?.id;
    rows.innerHTML = visible.map((record) => `<div role="listitem"><button type="button" class="transaction-row" data-id="${record.id}" aria-controls="detail-content" aria-pressed="${record.id === selectedId}">
      <span class="recorded"><strong>${dayLabel(record.at)}</strong><small>${timeLabel(record.at)}</small></span>
      <span class="guest"><strong>${record.guest}</strong><small>${record.booking} · ${purposeLabels[record.purpose]}</small></span>
      <span class="method"><strong>${record.method}</strong><small>${record.reference}</small></span>
      <span class="money-cell"><strong class="${record.purpose === "refund" ? "outflow" : ""}">${record.purpose === "refund" ? "−" : ""}${asMoney(record.amount)}</strong><small class="status ${record.status}">${statusLabels[record.status]}</small></span>
      <span class="mobile-chevron">${icon("ChevronRight")}</span>
    </button></div>`).join("");
    rows.hidden = !visible.length;
    $(".table-head").hidden = !visible.length;
    $("#empty").hidden = Boolean(visible.length);
    $("#clear").hidden = !query.value && type.value === "all" && period.value === "today" && status === "all";
    $("#ledger-count").textContent = `${filtered.length} ${filtered.length === 1 ? "record" : "records"} in view`;
    $("#range").textContent = visible.length ? `Showing ${start + 1}–${start + visible.length} of ${filtered.length}` : "Showing 0 records";
    $("#page").textContent = `${page + 1} / ${pages}`;
    $("#prev").disabled = page === 0;
    $("#next").disabled = page === pages - 1;
    renderDetail(visible.find((record) => record.id === selectedId));
    for (const button of rows.querySelectorAll(".transaction-row")) {
      button.addEventListener("click", () => {
        selectedId = button.dataset.id;
        returnFocusId = selectedId;
        for (const entry of rows.querySelectorAll(".transaction-row")) entry.setAttribute("aria-pressed", String(entry === button));
        renderDetail(visible.find((record) => record.id === selectedId));
        workspace.dataset.view = "detail";
        if (window.matchMedia("(max-width: 900px)").matches) $("#detail-title").focus();
      });
    }
  }

  function reset() {
    query.value = "";
    type.value = "all";
    period.value = "today";
    status = "all";
    page = 0;
    workspace.dataset.view = "ledger";
    renderRows();
    query.focus();
  }

  for (const filter of filters) filter.addEventListener("click", () => { status = filter.dataset.status; page = 0; renderRows(); });
  query.addEventListener("input", () => { page = 0; renderRows(); });
  type.addEventListener("change", () => { page = 0; renderRows(); });
  period.addEventListener("change", () => { page = 0; workspace.dataset.view = "ledger"; renderRows(); });
  role.addEventListener("change", () => renderRows());
  $("#clear").addEventListener("click", reset);
  $("#empty-clear").addEventListener("click", reset);
  $("#prev").addEventListener("click", () => { page -= 1; renderRows(); });
  $("#next").addEventListener("click", () => { page += 1; renderRows(); });
  $("#back").addEventListener("click", () => {
    workspace.dataset.view = "ledger";
    (rows.querySelector(`[data-id="${returnFocusId}"]`) ?? query).focus();
  });
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("#theme").setAttribute("aria-pressed", String(dark));
    $("#theme").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    $("#theme i").innerHTML = window.HAVEN_ICONS[dark ? "Sun" : "Moon"];
  });
  renderRows();
})();
