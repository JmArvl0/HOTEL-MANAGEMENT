const stages = {
  queued: { label: "To clean", icon: "ClipboardList", tone: "warn" },
  cleaning: { label: "Cleaning", icon: "BedDouble", tone: "info" },
  inspection: { label: "To inspect", icon: "ClipboardCheck", tone: "warn" },
  hold: { label: "On hold", icon: "LockKeyhole", tone: "danger" },
  completed: { label: "Completed today", icon: "CircleCheck", tone: "success" },
};
const mine = "Mara Santos";
const sampleTime = "12:15 PM";
const priorities = ["Urgent", "High", "Normal"];
const previewRoles = {
  housekeeping: { label: "Housekeeping", name: mine, initials: "MS", filter: "My tasks", icon: "UserRound", matches: (task) => task.assignee === mine },
  manager: { label: "Manager", name: "Isabel Navarro", initials: "IN", filter: "Unassigned", icon: "Users", matches: (task) => task.stage === "queued" && !task.assignee },
  front_desk: { label: "Front Desk", name: "Nico Flores", initials: "NF", filter: "Arrivals today", icon: "CalendarDays", matches: (task) => Boolean(task.arrival) },
};
const tasks = [
  { room: 304, roomType: "Deluxe King", type: "Checkout cleaning", stage: "queued", priority: 0, arrival: "2:00 PM", opened: "10:35 AM", note: "Early check-in requested. Replace the extra pillows before inspection." },
  { room: 205, roomType: "Deluxe Twin", type: "Checkout cleaning", stage: "inspection", priority: 1, arrival: "2:30 PM", opened: "9:46 AM", assignee: "Ana Reyes", cleaned: "11:52 AM" },
  { room: 412, roomType: "Executive Suite", type: "Checkout cleaning", stage: "cleaning", priority: 1, arrival: "3:00 PM", opened: "10:20 AM", assignee: mine, started: "11:57 AM", note: "Restock the minibar and replace both robes." },
  { room: 218, roomType: "Deluxe Twin", type: "Checkout cleaning", stage: "queued", priority: 2, arrival: "3:00 PM", opened: "10:40 AM", assignee: "Leo Cruz" },
  { room: 506, roomType: "Executive Suite", type: "Checkout cleaning", stage: "inspection", priority: 2, arrival: "3:30 PM", opened: "10:46 AM", assignee: mine, cleaned: "12:03 PM" },
  { room: 307, roomType: "Deluxe King", type: "Checkout cleaning", stage: "queued", priority: 2, arrival: "4:00 PM", opened: "10:29 AM" },
  { room: 508, roomType: "Executive Suite", type: "Maintenance cleanup", stage: "queued", priority: 2, arrival: "5:00 PM", opened: "11:23 AM", assignee: mine, note: "Maintenance resolved the sink leak. Wipe down the vanity and check for standing water." },
  { room: 211, roomType: "Deluxe Twin", type: "Stayover cleaning", stage: "cleaning", priority: 2, opened: "9:30 AM", assignee: mine, started: "12:02 PM", note: "Guest requested fresh towels only." },
  { room: 315, roomType: "Deluxe King", type: "Stayover cleaning", stage: "hold", priority: 2, opened: "9:20 AM", assignee: mine, hold: "Do Not Disturb", note: "The guest asked for privacy. Wait for Front Desk to clear the instruction before starting." },
  { room: 417, roomType: "Deluxe King", type: "Checkout cleaning", stage: "hold", priority: 1, opened: "10:52 AM", hold: "Maintenance", note: "Work order WO-1042 is open for a leaking shower valve. Maintenance owns the repair." },
  { room: 301, roomType: "Deluxe King", type: "Checkout cleaning", stage: "completed", priority: 2, arrival: "1:00 PM", opened: "8:48 AM", assignee: mine, cleaned: "10:02 AM", inspected: "10:28 AM" },
  { room: 202, roomType: "Deluxe Twin", type: "Checkout cleaning", stage: "completed", priority: 2, arrival: "2:00 PM", opened: "9:15 AM", assignee: "Leo Cruz", cleaned: "10:33 AM", inspected: "11:05 AM" },
  { room: 309, roomType: "Deluxe King", type: "Stayover cleaning", stage: "completed", priority: 2, opened: "9:11 AM", assignee: "Ana Reyes", cleaned: "11:35 AM" },
];

const byId = (id) => document.getElementById(id);
const icon = (name, className = "") => `<i class="${className}">${window.HAVEN_ICONS[name]}</i>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const timestamp = (time) => {
  if (!time) return Infinity;
  const [clock, period] = time.split(" ");
  const [hour, minute] = clock.split(":").map(Number);
  return (hour % 12 + (period === "PM" ? 12 : 0)) * 60 + minute;
};
const badge = ({ label, icon: glyph, tone }) => `<span class="badge ${tone}">${icon(glyph)}${label}</span>`;
const statusBadge = (task) => {
  if (task.failed) return badge({ label: "Inspection failed", icon: "CircleAlert", tone: "danger" });
  if (task.hold) return badge({ label: task.hold, icon: stages.hold.icon, tone: stages.hold.tone });
  const stage = stages[task.stage];
  return badge(task.stage === "completed" ? { ...stage, label: "Completed" } : stage);
};

let records;
let roomStates;
let stageFilter;
let quickFilter;
let selected;
let formMode;
let queueScroll;
let role = byId("preview-role").value;
const narrow = window.matchMedia("(max-width: 760px)");

function clearFilters() {
  stageFilter = "";
  quickFilter = false;
  byId("search").value = "";
  byId("type").value = "";
}

function reset() {
  records = tasks.map((task, index) => ({ ...task, id: index + 1, events: [] }));
  roomStates = new Map(tasks.map((task) => [task.room, initialRoomState(task)]));
  selected = 1;
  formMode = "";
  queueScroll = 0;
  byId("desk").removeAttribute("data-detail-open");
  clearFilters();
  render();
}

function filterTasks() {
  const query = byId("search").value.trim().toLowerCase();
  const type = byId("type").value;
  const workRank = { queued: 0, cleaning: 0, inspection: 0, hold: 1, completed: 2 };
  return records.filter((task) =>
    (!stageFilter || task.stage === stageFilter) &&
    (!quickFilter || previewRoles[role].matches(task)) &&
    (!type || task.type === type) &&
    `Room ${task.room} ${task.roomType} ${task.type} ${task.assignee || "Unassigned"}`.toLowerCase().includes(query),
  ).sort((a, b) =>
    workRank[a.stage] - workRank[b.stage] ||
    (a.stage === "completed" && b.stage === "completed"
      ? timestamp(b.inspected || b.failed || b.cleaned) - timestamp(a.inspected || a.failed || a.cleaned)
      : a.priority - b.priority || timestamp(a.arrival) - timestamp(b.arrival) || timestamp(a.opened) - timestamp(b.opened)),
  );
}

function render({ keepSelection = false } = {}) {
  const shown = filterTasks();
  const active = Boolean(stageFilter || quickFilter || byId("search").value.trim() || byId("type").value);
  if (!keepSelection && !shown.some((task) => task.id === selected)) {
    selected = shown[0]?.id;
    formMode = "";
  }
  byId("shift").innerHTML = Object.entries(stages).map(([key, stage]) => `
    <button class="shift-button" type="button" data-stage="${key}" aria-pressed="${stageFilter === key}">
      ${icon(stage.icon, `icon-chip ${stage.tone}`)}
      <span><b>${records.filter((task) => task.stage === key).length}</b><small>${stage.label}</small></span>
    </button>`).join("");
  byId("quick-filter").setAttribute("aria-pressed", String(quickFilter));
  byId("queue-count").textContent = shown.length;
  byId("queue-list").innerHTML = shown.map(roomRow).join("");
  byId("empty").hidden = shown.length > 0;
  byId("clear-filters").hidden = !active || shown.length === 0;
  byId("queue-caption").textContent = active ? `Showing ${shown.length} of ${records.length} tasks` : `${records.length} tasks · Priority, then next arrival`;
  renderDetail();
}

function roomRow(task) {
  let timing = task.arrival ? `Arrives ${task.arrival}` : task.type === "Stayover cleaning" ? "Guest in house" : "No arrival today";
  if (task.stage === "completed") timing = task.failed ? "Reclean requested" : `Finished ${task.inspected || task.cleaned}`;
  if (task.stage === "hold") timing = task.hold === "Maintenance" ? "Work order open" : task.deferred ? "Service deferred" : "Guest in house";
  const priority = task.priority < 2 && task.stage !== "completed" ? `<span class="urgency">${priorities[task.priority]}</span> · ` : "";
  const person = role === "housekeeping" && task.assignee === mine ? "You" : task.assignee || "Unassigned";
  return `<li><button class="room-row row-grid" data-room="${task.id}" type="button" aria-pressed="${selected === task.id}">
    <span class="room-number"><b><span class="sr-only">Room </span>${task.room}</b><small>Floor ${Math.floor(task.room / 100)}</small></span>
    <span class="task-name"><b>${task.type}</b><small>${priority}${timing}</small><small class="assignee-mobile">${person}</small></span>
    <span class="assignee">${person}</span>
    ${statusBadge(task)}
    ${icon("ChevronRight", "row-chevron")}
  </button></li>`;
}

function taskSteps(task) {
  const needsInspection = task.type !== "Stayover cleaning";
  const steps = [["queued", "To clean"], ["cleaning", "Cleaning"]];
  if (needsInspection) steps.push(["inspection", "Inspection"]);
  steps.push(["completed", "Complete"]);
  const current = task.failed ? steps.findIndex(([key]) => key === "inspection") : Math.max(0, steps.findIndex(([key]) => key === task.stage));
  return `<ol class="steps" aria-label="Task progress" style="--steps: ${steps.length}">${steps.map(([, label], index) => {
    const done = index < current || (task.stage === "completed" && !task.failed);
    return `<li${done ? ' class="done"' : ""}${index === current ? ' aria-current="step"' : ""}><i aria-hidden="true">${done ? window.HAVEN_ICONS.Check : index + 1}</i>${label}</li>`;
  }).join("")}</ol>`;
}

function initialRoomState(task) {
  if (task.stage === "inspection") return "Awaiting inspection";
  if (task.stage === "cleaning") return "Cleaning";
  if (task.stage === "completed") return task.type === "Stayover cleaning" ? "Clean · Occupied" : "Clean · Available";
  if (task.hold === "Maintenance") return "Out of service";
  return task.type === "Stayover cleaning" ? "Occupied" : "Dirty · Vacant";
}

function history(task) {
  const events = [[task.opened, task.type === "Checkout cleaning" ? "Checkout recorded" : "Task opened"]];
  if (task.started) events.push([task.started, `Cleaning started by ${task.assignee}`]);
  if (task.cleaned) events.push([task.cleaned, "Cleaning completed"]);
  if (task.inspected) events.push([task.inspected, "Inspection passed"]);
  events.push(...task.events);
  return events.reverse().map(([time, description]) => `<li><time>${time}</time><span>${escapeHtml(description)}</span></li>`).join("");
}

function renderDetail() {
  const task = records.find((record) => record.id === selected);
  if (!task) {
    byId("detail-content").innerHTML = `<div class="empty">${icon("ClipboardList")}<h3>Select a room task</h3><p>Room details and actions appear here.</p></div>`;
    return;
  }
  const note = task.failureReason || task.note;
  const priority = (task.priority < 2 || role === "manager") && task.stage !== "completed"
    ? badge({ label: `${priorities[task.priority]} priority`, icon: "CircleAlert", tone: task.priority < 2 ? "warn" : "" })
    : "";
  byId("detail-content").innerHTML = `
    <header class="detail-hero">
      <div class="detail-hero-top">${statusBadge(task)}${priority}</div>
      <h2 id="room-title" tabindex="-1">Room ${task.room}</h2>
      <p>${task.roomType} · Floor ${Math.floor(task.room / 100)}</p>
    </header>
    <div class="detail-body">
      <section aria-label="Room details">
        <dl class="room-facts">
          <div><dt>Work type</dt><dd>${task.type}</dd></div>
          <div><dt>Assigned to</dt><dd>${task.assignee || "Unassigned"}${role === "housekeeping" && task.assignee === mine ? " (you)" : ""}</dd></div>
          <div><dt>Next arrival</dt><dd>${task.arrival ? `Today, ${task.arrival}` : "None scheduled"}</dd></div>
          <div><dt>Room state</dt><dd>${roomStates.get(task.room)}</dd></div>
        </dl>
      </section>
      ${note ? `<section class="task-note">${icon(task.hold === "Maintenance" ? "Wrench" : "FileText")}
        <div><h3>${task.failed || task.type === "Reclean" ? "Inspection note" : task.hold ? "Reason for hold" : "Service notes"}</h3><p>${escapeHtml(note)}</p></div>
      </section>` : ""}
      ${task.stage !== "hold" ? `<section><h3>Task progress</h3>${taskSteps(task)}</section>` : ""}
    </div>
    <div class="detail-footer">${formMode ? actionForm(formMode) : nextAction(task)}</div>
    <section class="detail-activity"><details class="history"${task.events.length ? " open" : ""}><summary>Task activity</summary><ul>${history(task)}</ul></details></section>`;
}

function primaryAction(action, label, glyph) {
  return `<button type="button" class="button primary" data-action="${action}">${label}${icon(glyph)}</button>`;
}

function nextAction(task) {
  const assignedElsewhere = task.assignee && task.assignee !== mine;
  if (task.stage === "completed") {
    const hint = task.failed ? "A reclean task is in the room queue." : task.inspected ? "Inspection passed." : "Stayover service is complete.";
    return `<p class="action-hint">${hint}</p>`;
  }
  if (task.stage === "hold") {
    const hint = task.deferred ? "Service deferred. Check with Front Desk before returning." : task.hold === "Maintenance" ? "Cleaning is on hold pending the repair." : "Routine cleaning can resume when Front Desk clears Do Not Disturb.";
    return `<p class="action-hint">${hint}</p>` + (role === "manager" ? primaryAction("prioritize", "Prioritize task", "CircleAlert") : "");
  }
  if (task.stage === "inspection") {
    if (role !== "housekeeping") return '<p class="action-hint">Awaiting Housekeeping inspection before release.</p>';
    return `<p class="action-hint">Pass inspection to release the room.</p>${primaryAction("inspect", "Inspect room", "ClipboardCheck")}`;
  }
  if (role === "manager") return primaryAction("prioritize", "Prioritize task", "CircleAlert");
  if (role === "front_desk") return '<p class="action-hint">Housekeeping updates this task as work progresses.</p>';
  if (assignedElsewhere) return `<p class="action-hint">${task.assignee} is responsible for this task.</p>`;
  const more = `<details class="more"><summary>More actions</summary>
    ${task.stage === "cleaning" && task.type === "Stayover cleaning" ? '<button type="button" class="text-button" data-action="defer">Defer service</button>' : ""}
    <button type="button" class="text-button" data-action="report">Report maintenance issue</button>
  </details>`;
  if (task.stage === "cleaning") return primaryAction("complete", "Complete cleaning", "Check") + more;
  if (task.assignee) return primaryAction("start", "Start cleaning", "ChevronRight") + more;
  return primaryAction("claim", "Claim task", "ChevronRight") + more;
}

function actionForm(mode) {
  const buttons = (label) => `<div class="form-buttons"><button class="button primary" type="submit">${label}</button><button class="button" type="button" data-action="cancel">Cancel</button></div>`;
  const note = (label, required = false, hidden = false) => `<label${hidden ? " hidden" : ""}>${label}<textarea name="note" maxlength="1000"${required ? " required" : ""}></textarea></label>`;
  let fields;
  if (mode === "prioritize") {
    const task = records.find((record) => record.id === selected);
    fields = `<div><label for="task-priority">Priority</label><select id="task-priority" name="priority">
      ${priorities.map((label, index) => `<option value="${index}"${index === task.priority ? " selected" : ""}>${label}</option>`).reverse().join("")}
    </select></div>
    <label>Coordination reason<textarea name="note" minlength="3" maxlength="500" required></textarea></label>
    ${buttons("Save priority")}`;
  } else if (mode === "inspect") {
    fields = `<fieldset class="inspection-options"><legend>Inspection result</legend>
      <label><input type="radio" name="result" value="pass" required> Pass and release room</label>
      <label><input type="radio" name="result" value="fail" required> Fail and request reclean</label>
    </fieldset>${note("Reason for reclean", false, true)}${buttons("Record inspection")}`;
  } else if (mode === "complete") {
    const checks = ["Bed and linen complete", "Bathroom complete", "Amenities replenished", "Final safety check complete"];
    fields = `<fieldset class="inspection-options"><legend>Cleaning checklist</legend>
      ${checks.map((check) => `<label><input type="checkbox" name="check" value="${check}"> ${check}</label>`).join("")}
    </fieldset>${note("Completion note (optional)")}${buttons("Complete task")}`;
  } else if (mode === "defer") {
    fields = note("Reason for deferral", true) + buttons("Defer service");
  } else {
    fields = note("Describe the maintenance issue", true) + buttons("Report issue");
  }
  return `<form class="action-form" id="action-form">${fields}</form>`;
}

function applyAction(action, data = new FormData()) {
  const task = records.find((record) => record.id === selected);
  const note = String(data.get("note") || "").trim();
  let message;
  switch (action) {
    case "prioritize":
      task.priority = Number(data.get("priority"));
      message = `Priority set to ${priorities[task.priority].toLowerCase()} by ${previewRoles.manager.name}. ${note}`;
      break;
    case "claim":
      task.assignee = mine;
      message = "Claimed by Mara Santos";
      break;
    case "start":
      task.stage = "cleaning";
      task.started = sampleTime;
      roomStates.set(task.room, "Cleaning");
      break;
    case "complete":
      task.stage = task.type === "Stayover cleaning" ? "completed" : "inspection";
      task.cleaned = sampleTime;
      roomStates.set(task.room, task.stage === "inspection" ? "Awaiting inspection" : "Clean · Occupied");
      message = `Checklist saved (${data.getAll("check").length} of 4 checked)${note ? `. ${note}` : ""}`;
      break;
    case "inspect":
      task.stage = "completed";
      if (data.get("result") === "pass") {
        task.inspected = sampleTime;
        roomStates.set(task.room, "Clean · Available");
      } else {
        task.failed = sampleTime;
        task.failureReason = note;
        roomStates.set(task.room, "Reclean required");
        message = `Inspection failed. Reclean requested. ${note}`;
        records.push({
          id: records.length + 1, room: task.room, roomType: task.roomType, type: "Reclean",
          stage: "queued", priority: Math.min(task.priority, 1), arrival: task.arrival,
          opened: sampleTime, note, events: [],
        });
      }
      break;
    case "defer":
      task.stage = "hold";
      task.hold = "Deferred";
      task.deferred = true;
      task.note = note;
      roomStates.set(task.room, "Occupied · Cleaning deferred");
      message = `Service deferred. ${note}`;
      break;
    case "report":
      message = `Issue sent to Maintenance. ${note}`;
      break;
  }
  if (message) task.events.push([sampleTime, message]);
  formMode = "";
  render({ keepSelection: true });
  focusDetail();
  announce(`Room ${task.room}. ${message || stages[task.stage].label}.`);
}

function announce(message) {
  byId("announcement").textContent = message;
}

function focusDetail() {
  byId("room-title")?.focus({ preventScroll: true });
}

function openRoom(id, keyboard) {
  const oldRow = byId("queue-list").querySelector('[aria-pressed="true"]');
  oldRow?.setAttribute("aria-pressed", "false");
  const row = byId("queue-list").querySelector(`[data-room="${id}"]`);
  row.setAttribute("aria-pressed", "true");
  selected = id;
  formMode = "";
  renderDetail();
  if (narrow.matches) {
    queueScroll = window.scrollY;
    byId("desk").setAttribute("data-detail-open", "");
    window.scrollTo(0, 0);
  }
  if (narrow.matches || keyboard) focusDetail();
}

function returnToQueue() {
  if (!byId("desk").hasAttribute("data-detail-open")) return;
  byId("desk").removeAttribute("data-detail-open");
  window.scrollTo(0, queueScroll);
  const row = byId("queue-list").querySelector(`[data-room="${selected}"]`);
  if (row) row.focus({ preventScroll: true });
  else byId("queue-title").focus();
}

document.querySelectorAll("[data-icon]").forEach((element) => {
  element.innerHTML = window.HAVEN_ICONS[element.dataset.icon];
});
document.querySelectorAll("[data-requests]").forEach((button) => {
  button.addEventListener("click", () => byId("requests-dialog").showModal());
});
function renderRole() {
  const profile = previewRoles[role];
  const attendant = role === "housekeeping";
  byId("account-name").textContent = profile.name;
  byId("account-role").textContent = profile.label;
  byId("avatar").textContent = profile.initials;
  byId("rooms-nav-label").textContent = attendant ? "Rooms" : "Room Management";
  byId("quick-filter").innerHTML = `${icon(profile.icon)} ${profile.filter}`;
  document.querySelectorAll("[data-attendant]").forEach((element) => { element.hidden = !attendant; });
  document.querySelector("[data-other-role]").hidden = attendant;
  document.querySelector("[data-inventory]").hidden = role === "front_desk";
}

byId("preview-role").addEventListener("change", (event) => {
  role = event.target.value;
  quickFilter = false;
  formMode = "";
  renderRole();
  render({ keepSelection: true });
  announce(`Previewing the ${previewRoles[role].label} account.`);
});
byId("search").addEventListener("input", () => render());
byId("type").addEventListener("change", () => render());
byId("quick-filter").addEventListener("click", () => {
  quickFilter = !quickFilter;
  render();
});
byId("shift").addEventListener("click", (event) => {
  const button = event.target.closest("[data-stage]");
  if (!button) return;
  const key = button.dataset.stage;
  stageFilter = stageFilter === key ? "" : key;
  render();
  byId("shift").querySelector(`[data-stage="${key}"]`).focus();
});
byId("queue-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-room]");
  if (button) openRoom(Number(button.dataset.room), event.detail === 0);
});
byId("detail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "claim" || action === "start") {
    applyAction(action);
    return;
  }
  formMode = action === "cancel" ? "" : action;
  renderDetail();
  if (formMode) byId("action-form").querySelector("input, select, textarea").focus();
  else byId("detail").querySelector("[data-action]").focus();
});
byId("detail").addEventListener("change", (event) => {
  if (event.target.name !== "result") return;
  const note = event.target.form.elements.note;
  note.required = event.target.value === "fail";
  note.closest("label").hidden = !note.required;
  note.setCustomValidity("");
});
byId("detail").addEventListener("input", (event) => {
  if (event.target.name === "note") event.target.setCustomValidity("");
});
byId("detail").addEventListener("submit", (event) => {
  event.preventDefault();
  const note = event.target.elements.note;
  if (note.required && note.value.trim().length < Math.max(1, note.minLength)) {
    note.setCustomValidity(note.minLength > 1 ? `Enter at least ${note.minLength} characters.` : "Enter a reason before continuing.");
    note.reportValidity();
    return;
  }
  applyAction(formMode, new FormData(event.target));
});
for (const id of ["clear-filters", "clear-empty"]) {
  byId(id).addEventListener("click", () => {
    clearFilters();
    render();
    byId("search").focus();
  });
}
byId("back").addEventListener("click", returnToQueue);
byId("housekeeping-home").addEventListener("click", returnToQueue);
narrow.addEventListener("change", () => {
  if (!narrow.matches) byId("desk").removeAttribute("data-detail-open");
});
byId("reset").addEventListener("click", () => {
  reset();
  window.scrollTo(0, 0);
  announce("Sample data reset.");
});
byId("theme").addEventListener("click", (event) => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  event.currentTarget.setAttribute("aria-pressed", String(dark));
  event.currentTarget.innerHTML = icon(dark ? "Sun" : "Moon");
});
renderRole();
reset();
