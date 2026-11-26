(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => `<i data-icon="${name}">${window.HAVEN_ICONS[name]}</i>`;
  for (const element of document.querySelectorAll("i[data-icon]")) {
    element.innerHTML = window.HAVEN_ICONS[element.dataset.icon];
  }

  const types = { receipt: "Payment receipt", folio: "Folio statement" };
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const issueDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
  const issueTime = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
  const asMoney = (value) => money.format(value);
  const dayLabel = (stamp) => issueDate.format(new Date(stamp));
  const timeLabel = (stamp) => issueTime.format(new Date(stamp));

  // Fictional, fixed snapshots. The preview only displays the stamped values.
  const amara = {
    guest: "Amara Reyes", booking: "HVN-261110-042", room: "Garden Twin", stay: "10–13 Nov 2026",
    total: 7700, paid: 5100.50, balance: 2599.50, status: "Partially paid",
    tax: [6250, 625, 825, 7700],
    charges: [["Minibar", 550]],
    payments: [
      { purpose: "Reservation deposit", method: "GCash", reference: "GC-481017", amount: 1900 },
      { purpose: "Stay payment", method: "Card", reference: "CARD-882104", amount: 3200.50 },
    ],
  };
  const mateo = {
    guest: "Mateo Villanueva", booking: "HVN-261109-036", room: "Deluxe King", stay: "9–12 Nov 2026",
    total: 9856, paid: 9856, balance: 0, status: "Paid",
    tax: [8000, 800, 1056, 9856],
    charges: [["Airport transfer", 1200], ["Room service", 680]],
    payments: [
      { purpose: "Reservation deposit", method: "Bank transfer", reference: "BT-640112", amount: 2800 },
      { purpose: "Stay payment", method: "Card", reference: "CARD-918203", amount: 7056 },
    ],
    adjustments: [["Service recovery credit", -224]],
  };
  const singlePayment = (guest, booking, room, stay, total, paid, balance, method, reference, tax) => ({
    guest, booking, room, stay, total, paid, balance, tax,
    status: balance === 0 ? "Paid" : "Partially paid",
    payments: [{ purpose: balance === 0 ? "Stay payment" : "Reservation deposit", method, reference, amount: paid }],
  });
  const isabel = singlePayment("Isabel Santos", "HVN-261111-058", "Ocean King", "12–15 Nov 2026", 12320, 3700, 8620, "GCash", "GC-350209", [10000, 1000, 1320, 12320]);
  const enzo = singlePayment("Enzo de Leon", "HVN-261108-017", "Garden Twin", "8–11 Nov 2026", 6160, 6160, 0, "Cash", "", [5000, 500, 660, 6160]);
  const sofia = singlePayment("Sofia Mendoza", "HVN-261110-039", "Bay Suite", "11–14 Nov 2026", 14784, 4400, 10384, "Bank transfer", "BT-261134", [12000, 1200, 1584, 14784]);
  const lucia = singlePayment("Lucia Navarro", "HVN-261107-013", "Deluxe King", "7–10 Nov 2026", 8624, 8624, 0, "Card", "CARD-914227", [7000, 700, 924, 8624]);
  const gabriel = singlePayment("Gabriel Cruz", "HVN-261103-018", "Garden Twin", "3–5 Nov 2026", 4250, 4250, 0, "Cash", "", null);
  const documents = [
    ["receipt", "2026-11-12", "10:42", "014", amara, amara.payments[1]],
    ["folio",   "2026-11-12", "10:25", "007", mateo],
    ["receipt", "2026-11-12", "09:58", "013", isabel, isabel.payments[0]],
    ["folio",   "2026-11-12", "09:14", "006", enzo],
    ["receipt", "2026-11-12", "08:36", "012", sofia, sofia.payments[0]],
    ["receipt", "2026-11-11", "17:21", "011", mateo, mateo.payments[1]],
    ["folio",   "2026-11-11", "16:06", "005", lucia],
    ["receipt", "2026-11-11", "15:34", "010", lucia, lucia.payments[0]],
    ["receipt", "2026-11-11", "14:08", "009", enzo, enzo.payments[0]],
    ["folio",   "2026-11-11", "11:28", "004", sofia],
    ["folio",   "2026-11-05", "13:10", "003", gabriel],
    ["receipt", "2026-11-05", "12:54", "008", gabriel, gabriel.payments[0]],
  ].map(([type, date, time, serial, stay, payment]) => ({
    ...stay, type, date, payment,
    number: `${type === "receipt" ? "RCP" : "FOL"}-${date.replaceAll("-", "")}-${serial}`,
    issued: `${date}T${time}:00+08:00`,
  }));

  const workspace = $("#workspace");
  const rows = $("#rows");
  const query = $("#query");
  const date = $("#date");
  const preview = $("#preview-content");
  const narrow = window.matchMedia("(max-width: 900px)");
  const filters = [...document.querySelectorAll("[data-type]")];
  const pageSize = 6;
  let type = "all";
  let page = 0;
  let selected;

  const entries = (items) => `<dl>${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
  const disclosure = (title, contents) => `<details><summary>${title}${icon("ChevronDown")}</summary>${contents}</details>`;
  const moneyEntries = (items) => entries(items.map(([label, value]) => [label, asMoney(value)]));

  function renderPreview(record) {
    if (!record) {
      preview.innerHTML = `<div class="empty"><span class="empty-icon">${icon("FileText")}</span><h3>No document selected</h3><p>Select a matching record to see the document as issued.</p></div>`;
      return;
    }

    const isReceipt = record.type === "receipt";
    const payment = record.payment;
    const folioPosition = [
      ["Folio total", asMoney(record.total)],
      ["Payments applied", asMoney(record.paid)],
      ["Balance at issue", asMoney(record.balance)],
      ["Folio status", record.status],
    ];
    const tax = record.tax && moneyEntries([
      ["Net subtotal", record.tax[0]], ["Service charge (10%)", record.tax[1]],
      ["VAT (12%)", record.tax[2]], ["Gross folio total", record.tax[3]],
    ]);
    const lineItems = [...(record.charges ?? []), ...(record.adjustments ?? [])];
    preview.innerHTML = `<article class="paper" aria-labelledby="document-title">
      <div class="paper-head">
        <span class="paper-brand"><img src="../haven-logo-small.png" alt="" width="26" height="26"> HAVEN</span>
        <span class="paper-sample">SAMPLE COPY</span>
      </div>
      <div class="paper-title">
        <h3 id="document-title">${types[record.type]}</h3>
        <p>${record.number}</p>
      </div>
      <dl class="metadata">
        <div><dt>Guest</dt><dd>${record.guest}</dd></div>
        <div><dt>Booking reference</dt><dd>${record.booking}</dd></div>
        <div><dt>Issued · Manila time</dt><dd><time datetime="${record.issued}">${dayLabel(record.issued)} <span>· ${timeLabel(record.issued)}</span></time></dd></div>
        <div><dt>Stay · ${record.room}</dt><dd>${record.stay}</dd></div>
      </dl>
      <div class="amount">
        <div><span>${isReceipt ? "Payment received" : "Balance at issue"}</span><strong>${asMoney(isReceipt ? payment.amount : record.balance)}</strong></div>
        <p>${isReceipt ? [payment.purpose, payment.method, payment.reference].filter(Boolean).join(" · ") : `${record.status} · ${asMoney(record.paid)} applied to folio`}</p>
      </div>
      <div class="document-sections">
        ${disclosure("Folio position at issue", entries(folioPosition))}
        ${tax ? disclosure("VAT-inclusive folio breakdown", tax + "<p>The folio total already includes service charge and VAT.</p>") : ""}
        ${!isReceipt ? disclosure("Recorded payments", moneyEntries(record.payments.map((entry) => [
          [entry.purpose, entry.method, entry.reference].filter(Boolean).join(" · "), entry.amount,
        ]))) : ""}
        ${lineItems.length ? disclosure("Charges and adjustments", moneyEntries(lineItems)) : ""}
      </div>
      <p class="paper-note">${icon("LockKeyhole")} Amounts and details are preserved as issued.</p>
    </article>`;
  }

  function matches(record) {
    const q = query.value.trim().toLowerCase();
    const matchesDate = !date.value || date.value === record.date
      || (date.value === "week" && record.date >= "2026-11-05" && record.date <= "2026-11-12");
    return matchesDate && [record.number, record.guest, record.booking].some((value) => value.toLowerCase().includes(q));
  }

  function select(record) {
    selected = record?.number;
    for (const button of rows.querySelectorAll(".document-button")) {
      const active = button.dataset.number === selected;
      button.setAttribute("aria-pressed", String(active));
      button.closest("tr").classList.toggle("is-selected", active);
    }
    renderPreview(record);
  }

  function renderRegister() {
    const inScope = documents.filter(matches);
    for (const filter of filters) {
      const key = filter.dataset.type;
      filter.setAttribute("aria-pressed", String(type === key));
      filter.querySelector("span").textContent = key === "all" ? inScope.length : inScope.filter((record) => record.type === key).length;
    }
    const filtered = inScope.filter((record) => type === "all" || record.type === type);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages - 1);
    const start = page * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    rows.innerHTML = visible.map((record) => `<tr>
      <td><button class="document-button" type="button" data-number="${record.number}" aria-controls="preview-content">
        <span class="doc-icon ${record.type}">${icon(record.type === "receipt" ? "ReceiptText" : "FileText")}</span>
        <span><span class="cell-title">${record.number}</span><span class="cell-subtitle">${types[record.type]}</span></span>
      </button></td>
      <td><span class="cell-title">${record.guest}</span><span class="cell-subtitle">${record.booking}</span><time class="cell-subtitle mobile-date" datetime="${record.issued}">${dayLabel(record.issued)}</time><i data-icon="ChevronRight" class="mobile-open">${window.HAVEN_ICONS.ChevronRight}</i></td>
      <td class="issued-cell"><div class="issued"><time datetime="${record.issued}"><span class="cell-title">${dayLabel(record.issued)}</span><span class="cell-subtitle">${timeLabel(record.issued)}</span></time>${icon("ChevronRight")}</div></td>
    </tr>`).join("");
    $("#table").hidden = !visible.length;
    $("#no-results").hidden = Boolean(visible.length);
    $("#reset").hidden = type === "all" && !query.value.trim() && !date.value;
    $("#count").textContent = `${filtered.length} ${filtered.length === 1 ? "record" : "records"}`;
    $("#range").textContent = visible.length ? `Showing ${start + 1}–${start + visible.length} of ${filtered.length}` : "Showing 0 records";
    $("#page").textContent = `${page + 1} / ${pages}`;
    $("#prev").disabled = page === 0;
    $("#next").disabled = page === pages - 1;
    select(visible.find((record) => record.number === selected) ?? visible[0]);
  }

  function applyFilters() {
    page = 0;
    renderRegister();
  }

  function reset() {
    type = "all";
    query.value = "";
    date.value = "";
    applyFilters();
    query.focus();
  }

  for (const filter of filters) filter.addEventListener("click", () => {
    type = filter.dataset.type;
    applyFilters();
  });
  query.addEventListener("input", applyFilters);
  date.addEventListener("change", applyFilters);
  $("#reset").addEventListener("click", reset);
  $("#empty-reset").addEventListener("click", reset);
  $("#prev").addEventListener("click", () => { page -= 1; renderRegister(); });
  $("#next").addEventListener("click", () => { page += 1; renderRegister(); });

  rows.addEventListener("click", (event) => {
    const row = event.target.closest("tr");
    if (!row) return;
    const number = row.querySelector(".document-button").dataset.number;
    select(documents.find((record) => record.number === number));
    if (narrow.matches) {
      workspace.classList.add("show-preview");
      $("#preview-title").focus({ preventScroll: true });
      workspace.scrollIntoView({ block: "start" });
    }
  });
  $("#back").addEventListener("click", () => {
    workspace.classList.remove("show-preview");
    rows.querySelector('[aria-pressed="true"]')?.focus();
  });
  narrow.addEventListener("change", () => workspace.classList.remove("show-preview"));

  $("#theme").addEventListener("click", (event) => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    event.currentTarget.setAttribute("aria-pressed", String(dark));
    event.currentTarget.innerHTML = icon(dark ? "Sun" : "Moon");
  });
  renderRegister();
})();
