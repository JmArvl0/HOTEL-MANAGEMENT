const reportsByRole = {
  manager: {
    label: "Manager",
    title: "Performance overview",
    subtitle: "Occupancy, room readiness, and daily activity in one view.",
    caption: "Manager view · Performance and operational summaries",
    period: "Last 7 days",
    primary: "Performance",
    secondary: "Daily reports",
    metrics: [
      ["Collections today", "₱84,260", "Settled payments", "positive"],
      ["Booked occupancy", "72%", "+4 points across seven days", "positive"],
      ["Rooms serviceable", "44 / 48", "Four rooms out of service", "attention"],
      ["Pending approvals", "3", "Oldest request · 2h 14m", "attention"]
    ],
    chart: {
      title: "Booked occupancy",
      description: "Rooms with a stay covering each night, measured against serviceable rooms.",
      type: "line",
      max: 100,
      suffix: "%",
      labels: ["Nov 6", "Nov 7", "Nov 8", "Nov 9", "Nov 10", "Nov 11", "Nov 12"],
      axis: ["100%", "75%", "50%", "25%", "0%"],
      series: [{ name: "Booked occupancy", values: [61, 65, 63, 69, 72, 76, 72], color: "primary" }]
    },
    insight: {
      title: "Room readiness",
      description: "Live room status from the room rack.",
      lead: ["44 of 48", "rooms serviceable"],
      rows: [["Available", 9, "green"], ["Occupied", 27, "blue"], ["Reserved", 8, "amber"], ["Service", 4, "red"]],
      note: "Room status is a live snapshot. It is separate from booked occupancy."
    },
    reports: [
      ["Daily Front Desk report", "Nov 12", "Awaiting review", "attention"],
      ["Property performance", "Last 7 days", "Ready to export", "ready"],
      ["Department handover", "Nov 12", "2 items carried forward", "attention"]
    ],
    modules: [["Occupancy & room status", "Seven-day bookings and live readiness"], ["Daily operations", "Review Front Desk submissions"], ["Approvals & escalations", "3 cases need a decision"]]
  },
  front_desk: {
    label: "Front Desk",
    title: "Daily operations report",
    subtitle: "Build, export, and submit the daily hotel operations snapshot.",
    caption: "Front Desk view · Daily report and submission history",
    period: "Today · Nov 12",
    primary: "Daily operations",
    secondary: "Submission history",
    metrics: [
      ["Arrivals", "12", "4 still need room assignment", "attention"],
      ["Departures", "9", "3 still due today", "attention"],
      ["New reservations", "6", "Website and direct", ""],
      ["Collections", "₱84,260", "Settled payments today", "positive"]
    ],
    chart: {
      title: "Daily arrivals & departures",
      description: "Recorded check-ins and check-outs for the past seven report days.",
      type: "line",
      max: 16,
      suffix: "",
      labels: ["Nov 6", "Nov 7", "Nov 8", "Nov 9", "Nov 10", "Nov 11", "Nov 12"],
      axis: ["16", "12", "8", "4", "0"],
      series: [
        { name: "Arrivals", values: [8, 11, 9, 13, 10, 14, 12], color: "primary" },
        { name: "Departures", values: [7, 9, 8, 11, 9, 12, 9], color: "secondary" }
      ]
    },
    insight: {
      title: "Today's report",
      description: "A saved report is an immutable daily snapshot.",
      lead: ["Draft preview", "Nov 12 · ready to generate"],
      rows: [["Report date", "Nov 12", "green"], ["Export", "Print or save PDF", "blue"], ["Submit to Manager", "Not submitted", "amber"]],
      note: "Exporting does not submit the report. Submission sends it to the Manager for review.",
      action: "Generate report preview"
    },
    reports: [
      ["Daily operations report", "Nov 11", "Acknowledged", "ready"],
      ["Daily operations report", "Nov 10", "Returned with note", "returned"],
      ["Daily operations report", "Nov 9", "Acknowledged", "ready"]
    ],
    modules: [["Daily report preview", "Counts and collections for a selected hotel day"], ["Submission history", "Track acknowledged and returned reports"], ["Cash summary", "Closed-shift totals and recorded variance"]]
  },
  accounting: {
    label: "Accounting",
    title: "Financial reports",
    subtitle: "Collections, refunds, folio balances, and review workload.",
    caption: "Accounting view · Financial summaries and follow-ups",
    period: "Last 7 days",
    primary: "Collections & refunds",
    secondary: "Reconciliation",
    metrics: [
      ["Gross collections", "₱268,450", "Settled non-refund payments", "positive"],
      ["Refunds issued", "₱9,200", "Recorded as separate transactions", ""],
      ["Net collections", "₱259,250", "Collected less refunded", "positive"],
      ["Awaiting review", "4", "Deposits past SLA: 1", "attention"]
    ],
    chart: {
      title: "Collections & refunds",
      description: "Settled collections and recorded refunds by hotel day.",
      type: "line",
      max: 120,
      prefix: "₱",
      suffix: "k",
      labels: ["Nov 6", "Nov 7", "Nov 8", "Nov 9", "Nov 10", "Nov 11", "Nov 12"],
      axis: ["₱120k", "₱90k", "₱60k", "₱30k", "₱0"],
      series: [
        { name: "Collections", values: [72, 85, 78, 104, 96, 112, 84], color: "primary" },
        { name: "Refunds", values: [4, 8, 5, 11, 7, 9, 6], color: "secondary" }
      ]
    },
    insight: {
      title: "Financial follow-ups",
      description: "Work waiting in Accounting's queues.",
      lead: ["4 deposits", "awaiting verification"],
      rows: [["Past verification target", 1, "red"], ["Refunds needing action", 2, "amber"], ["Open folios to review", 6, "blue"]],
      note: "Amounts and case status come from the financial ledger in the live system."
    },
    reports: [
      ["Collections summary", "Last 7 days", "Ready to export", "ready"],
      ["Deposit verification", "Today", "4 pending", "attention"],
      ["Refund activity", "Last 7 days", "2 need action", "attention"]
    ],
    modules: [["Collections & refunds", "Settled money in and out"], ["Folio balances", "Outstanding balances and guest credits"], ["Reconciliation", "Compare recorded collections with statements"]]
  },
  owner: {
    label: "Owner",
    title: "Executive reports",
    subtitle: "A read-only view of hotel performance, risks, and decisions.",
    caption: "Owner view · Executive performance and operating risks",
    period: "Last 7 days",
    primary: "Executive performance",
    secondary: "Department risks",
    metrics: [
      ["Booked occupancy", "72%", "Seven-day view", "positive"],
      ["Net revenue", "₱259,250", "Collections less refunds", "positive"],
      ["Blocked rooms", "2", "Maintenance diagnosis", "attention"],
      ["Owner exceptions", "3", "Awaiting executive decision", "attention"]
    ],
    chart: {
      title: "Booked occupancy",
      description: "Seven-day occupancy based on reservation stay dates.",
      type: "line",
      max: 100,
      suffix: "%",
      labels: ["Nov 6", "Nov 7", "Nov 8", "Nov 9", "Nov 10", "Nov 11", "Nov 12"],
      axis: ["100%", "75%", "50%", "25%", "0%"],
      series: [{ name: "Booked occupancy", values: [61, 65, 63, 69, 72, 76, 72], color: "primary" }]
    },
    insight: {
      title: "Operational risks",
      description: "Items with a reported service or governance impact.",
      lead: ["5 items", "across operating departments"],
      rows: [["Critical maintenance", 1, "red"], ["Overdue housekeeping", 2, "amber"], ["Pending exceptions", 3, "blue"]],
      note: "Owner reporting is read-only. Department teams retain execution actions."
    },
    reports: [
      ["Executive operating summary", "Last 7 days", "Ready to export", "ready"],
      ["Department risk review", "Current", "5 items", "attention"],
      ["Governance activity", "Last 7 days", "Ready to view", "ready"]
    ],
    modules: [["Operating summary", "Occupancy, revenue, and blocked rooms"], ["Department risks", "Open issues grouped by team"], ["Governance activity", "Recorded decisions and account changes"]]
  },
  admin: {
    label: "Admin",
    title: "Governance reports",
    subtitle: "Account distribution and current hotel configuration.",
    caption: "Admin view · Account and configuration reporting",
    period: "Current snapshot",
    primary: "Accounts by role",
    secondary: "Configuration",
    metrics: [
      ["Accounts on record", "84", "All created accounts", ""],
      ["Staff accounts", "19", "Operations and governance", ""],
      ["Guest accounts", "65", "Customer portal users", ""],
      ["Needs attention", "3", "Suspended or recovery-required", "attention"]
    ],
    chart: {
      title: "Accounts by role",
      description: "Current account distribution across the fixed role catalogue.",
      type: "bars",
      suffix: "",
      groups: [["Guest", 65], ["Front Desk", 6], ["Housekeeping", 5], ["Manager", 3], ["Accounting", 3], ["Other staff", 2]]
    },
    insight: {
      title: "Configuration snapshot",
      description: "Current catalogue and account configuration state.",
      lead: ["48 rooms", "in the room catalogue"],
      rows: [["Active room types", 5, "green"], ["Inactive room types", 2, "amber"], ["Unused recovery links", 1, "blue"]],
      note: "Admin reports cover governance and configuration, not financial or hotel operations."
    },
    reports: [
      ["Account distribution", "Current", "Ready to export", "ready"],
      ["Configuration summary", "Current", "Ready to view", "ready"],
      ["Access attention", "Current", "3 accounts", "attention"]
    ],
    modules: [["Accounts by role", "Account totals and role share"], ["Configuration summary", "Rooms, room types, and recovery links"], ["Access attention", "Suspended or recovery-required accounts"]]
  }
};

const roleView = document.querySelector("#role-view");
const periodWrap = document.querySelector("#period-wrap");
const toast = document.querySelector("#toast");
const designChoiceButtons = [...document.querySelectorAll("[data-design-choice]")];
const designNote = document.querySelector("#design-note");
const selectedDesign = document.querySelector("#selected-design");
let toastTimer = 0;

const designChoices = {
  brief: "Executive brief — highlights the key metrics and trend first.",
  workbench: "Operations workbench — puts report history and follow-ups before the trend chart.",
  library: "Report library — puts available report modules and history first."
};

function renderDesign(design) {
  const choice = designChoices[design] ? design : "brief";
  document.body.dataset.design = choice;
  selectedDesign.textContent = "Selected · " + choice.toUpperCase();
  designNote.textContent = choice.toUpperCase() + " · " + designChoices[choice];
  designChoiceButtons.forEach((button) => {
    const selected = button.dataset.designChoice === choice;
    button.setAttribute("aria-pressed", String(selected));
  });
}

function setIcon(element, name) {
  if (element) element.querySelector("[data-icon]").dataset.icon = name;
  renderIcons();
}

function renderIcons() {
  if (!window.HAVEN_ICONS) return;
  document.querySelectorAll("[data-icon]").forEach((icon) => {
    const svg = window.HAVEN_ICONS[icon.dataset.icon];
    if (svg) icon.innerHTML = svg;
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function renderMetrics(items) {
  document.querySelector("#metrics").innerHTML = items.map((item) =>
    '<div class="metric"><span class="metric-label">' + item[0] + '</span><strong class="metric-value">' + item[1] + '</strong><small class="metric-note ' + item[3] + '">' + item[2] + '</small></div>'
  ).join("");
}

function chartPoint(value, index, count, max, width, height, top, left, right, bottom) {
  const usableWidth = width - left - right;
  const usableHeight = height - top - bottom;
  const x = left + (count <= 1 ? usableWidth / 2 : (index * usableWidth) / (count - 1));
  const y = top + usableHeight - (value / Math.max(max, 1)) * usableHeight;
  return [x, y];
}

function renderLineChart(chart) {
  const width = 720;
  const height = 250;
  const left = 50;
  const right = 14;
  const top = 18;
  const bottom = 33;
  const allValues = chart.series.flatMap((item) => item.values);
  const max = chart.max || Math.max(...allValues) * 1.22;
  const usableHeight = height - top - bottom;
  const gridLines = chart.axis.map((label, index) => {
    const y = top + (index * usableHeight) / (chart.axis.length - 1);
    return '<g><line class="grid" x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '"></line><text x="' + (left - 9) + '" y="' + (y + 4) + '" text-anchor="end">' + label + '</text></g>';
  }).join("");
  const xLabels = chart.labels.map((label, index) => {
    const point = chartPoint(0, index, chart.labels.length, max, width, height, top, left, right, bottom);
    return '<text x="' + point[0] + '" y="' + (height - 7) + '" text-anchor="middle">' + label + '</text>';
  }).join("");
  const seriesMarkup = chart.series.map((series) => {
    const points = series.values.map((value, index) => chartPoint(value, index, series.values.length, max, width, height, top, left, right, bottom));
    const path = points.map((point, index) => (index ? "L" : "M") + point[0].toFixed(1) + " " + point[1].toFixed(1)).join(" ");
    const baseline = height - bottom;
    const area = path + " L" + points[points.length - 1][0].toFixed(1) + " " + baseline + " L" + points[0][0].toFixed(1) + " " + baseline + " Z";
    const secondary = series.color === "secondary" ? " secondary" : "";
    const circles = points.map((point) => '<circle class="point' + secondary + '" cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="3.4"></circle>').join("");
    return '<path class="area' + secondary + '" d="' + area + '"></path><path class="series-line' + secondary + '" d="' + path + '"></path>' + circles;
  }).join("");
  const legend = chart.series.map((series) => '<span><i class="legend-dot' + (series.color === "secondary" ? " secondary" : "") + '"></i>' + series.name + '</span>').join("");
  document.querySelector("#chart").innerHTML =
    '<div class="chart-legend">' + legend + '</div><svg class="line-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + chart.title + '. ' + chart.description + '">' +
    '<line class="axis" x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (height - bottom) + '"></line>' + gridLines + seriesMarkup + xLabels + '</svg>';
  const head = ["Day"].concat(chart.series.map((item) => item.name));
  const rows = chart.labels.map((label, index) => '<tr><td>' + label + '</td>' + chart.series.map((item) => '<td><strong>' + (chart.prefix || "") + item.values[index] + chart.suffix + '</strong></td>').join("") + '</tr>').join("");
  document.querySelector("#chart-data").innerHTML = '<table><thead><tr>' + head.map((value) => '<th scope="col">' + value + '</th>').join("") + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderBars(chart) {
  const maximum = Math.max(...chart.groups.map((group) => group[1]));
  const bars = chart.groups.map((group) => {
    const width = Math.max(2, Math.round((group[1] / maximum) * 100));
    return '<li class="bar-row"><span>' + group[0] + '</span><span class="bar-track"><i class="bar-fill" style="width:' + width + '%"></i></span><strong>' + group[1] + '</strong></li>';
  }).join("");
  document.querySelector("#chart").innerHTML = '<ul class="bar-list" role="img" aria-label="' + chart.title + '. ' + chart.description + '">' + bars + '</ul>';
  document.querySelector("#chart-data").innerHTML = '<table><thead><tr><th scope="col">Role</th><th scope="col">Accounts</th></tr></thead><tbody>' +
    chart.groups.map((group) => '<tr><td>' + group[0] + '</td><td><strong>' + group[1] + '</strong></td></tr>').join("") + '</tbody></table>';
}

function renderInsight(insight) {
  const max = Math.max(1, ...insight.rows.map((row) => Number(row[1]) || 0));
  const rows = insight.rows.map((row) => {
    const numeric = Number(row[1]);
    const width = Number.isFinite(numeric) ? Math.max(3, Math.round((numeric / max) * 100)) : 100;
    const tone = row[2] || "blue";
    return '<li class="status-row"><div class="status-copy"><span><i class="status-mark ' + tone + '"></i>' + row[0] + '</span><strong>' + row[1] + '</strong></div><div class="status-track ' + tone + '"><span style="width:' + width + '%"></span></div></li>';
  }).join("");
  document.querySelector("#insight-content").innerHTML =
    '<div class="insight-lead"><strong>' + insight.lead[0] + '</strong><span>' + insight.lead[1] + '</span></div>' +
    '<ul class="status-list">' + rows + '</ul><p class="insight-note">' + insight.note + '</p>' +
    (insight.action ? '<button class="insight-action" type="button" data-demo-action="' + insight.action + '">' + insight.action + ' <i data-icon="ArrowUpRight"></i></button>' : "");
  renderIcons();
}

function renderReports(rows, role) {
  document.querySelector("#report-rows").innerHTML = rows.map((row) =>
    '<tr><td><strong>' + row[0] + '</strong></td><td>' + row[1] + '</td><td><span class="status-badge ' + row[3] + '">' + row[2] + '</span></td><td><button class="text-button" type="button" data-demo-action="Open ' + row[0] + '">Open</button></td></tr>'
  ).join("");
  document.querySelector("#table-note").textContent = role === "front_desk"
    ? "Exports print or save a snapshot · submission is a separate action"
    : "Showing the latest records · prototype data";
}

function renderModules(items) {
  document.querySelector("#module-list").innerHTML = items.map((item) =>
    '<div class="module-row"><div><strong>' + item[0] + '</strong><small>' + item[1] + '</small></div><button type="button" data-demo-action="Open ' + item[0] + '">Open</button></div>'
  ).join("");
}

function renderRole(role) {
  const data = reportsByRole[role];
  document.body.dataset.role = role;
  document.querySelector("#sidebar-role").textContent = data.label;
  document.querySelector("#page-title").textContent = data.title;
  document.querySelector("#page-subtitle").textContent = data.subtitle;
  document.querySelector("#view-caption").textContent = data.caption;
  document.querySelector("#nav-primary").textContent = data.primary;
  document.querySelector("#nav-secondary").textContent = data.secondary;
  document.querySelector("#chart-title").textContent = data.chart.title;
  document.querySelector("#chart-description").textContent = data.chart.description;
  document.querySelector("#chart-period").textContent = data.period;
  document.querySelector("#insight-title").textContent = data.insight.title;
  document.querySelector("#insight-description").textContent = data.insight.description;
  document.querySelector("#reports-title").textContent = role === "front_desk" ? "Submission history" : "Recent reports";
  document.querySelector("#reports-subtitle").textContent = role === "front_desk"
    ? "Daily snapshots submitted to Manager for review."
    : "Latest report activity for this account.";
  periodWrap.innerHTML = '<span class="field-label-static">' + (role === "front_desk" ? "Report date" : "Period") + '</span>' +
    (role === "front_desk"
      ? '<input id="period-view" type="date" value="2026-11-12" aria-label="Report date">'
      : '<select id="period-view" aria-label="Report period"><option>' + data.period + '</option></select>');
  periodWrap.querySelector("#period-view").addEventListener("change", () => {
    const value = periodWrap.querySelector("#period-view").value;
    document.querySelector("#chart-period").textContent = value || data.period;
    showToast("Prototype only · report data is illustrative.");
  });
  renderMetrics(data.metrics);
  if (data.chart.type === "bars") renderBars(data.chart);
  else renderLineChart(data.chart);
  renderInsight(data.insight);
  renderReports(data.reports, role);
  renderModules(data.modules);
  document.querySelector("#chart-data-details").open = false;
  renderIcons();
}

Object.entries(reportsByRole).forEach(([value, data]) => {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = data.label;
  roleView.append(option);
});
roleView.addEventListener("change", () => renderRole(roleView.value));
designChoiceButtons.forEach((button) => {
  button.addEventListener("click", () => renderDesign(button.dataset.designChoice));
});
document.querySelector("#theme").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const dark = document.body.classList.toggle("theme-dark");
  button.setAttribute("aria-pressed", String(dark));
  button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  button.title = dark ? "Switch to light theme" : "Switch to dark theme";
  setIcon(button, dark ? "Sun" : "Moon");
});
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-demo-action]");
  if (action) showToast(action.dataset.demoAction + " · prototype only, no records changed.");
});
document.querySelector("#export").addEventListener("click", () => showToast("Export preview only · no file was created."));
document.querySelector("#view-all").addEventListener("click", () => showToast("History view preview · sample records only."));
renderRole("manager");
