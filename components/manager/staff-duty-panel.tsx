"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Building2, CircleDollarSign, ClipboardCheck, ClipboardList, Eye, RefreshCw, Search, Users, Wrench, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { STAFF_DUTY_BASIS_NOTE, type StaffDutyMember, type StaffDutySnapshot, type StaffDutyStatus } from "@/lib/staff-duty";

/**
 * STAFF & DUTY — read-only operational workforce supervision for the Manager.
 * Every duty status on this page is derived server-side from live operational
 * records (in-progress housekeeping tasks, maintenance work orders, open cash
 * shifts). Login activity is never a duty signal, and no employee
 * administration happens here — accounts, roles and lifecycle stay with
 * Owner/Admin governance.
 */

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");

const DUTY_META: Record<StaffDutyStatus, { badge: string; text: string }> = {
  working: { badge: "badge confirmed", text: "Working now" },
  assigned: { badge: "badge pending", text: "Assigned work" },
  no_active_work: { badge: "badge", text: "No active work" }
};

const dutyBadge = (status: StaffDutyStatus) => DUTY_META[status].badge;
const dutyText = (status: StaffDutyStatus) => DUTY_META[status].text;

const KIND_LABEL: Record<NonNullable<StaffDutyMember["assignmentKind"]>, string> = {
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  cash: "Cash handling"
};

const WorkIcon = ({ source }: { source: StaffDutyMember["activeWork"][number]["source"] }) =>
  source === "housekeeping" ? <ClipboardCheck size={14} aria-hidden /> : source === "maintenance" ? <Wrench size={14} aria-hidden /> : <CircleDollarSign size={14} aria-hidden />;

const openWork = (workload: StaffDutyMember["workload"]) =>
  [workload.inProgress ? `${workload.inProgress} in progress` : null, workload.assigned ? `${workload.assigned} assigned` : null].filter(Boolean).join(" · ") || "No open work";

export default function StaffDutyPanel() {
  const [data, setData] = useState<StaffDutySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [duty, setDuty] = useState("all");
  const [viewing, setViewing] = useState<StaffDutyMember | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/manager/staff-duty", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to load staff duty.");
      setData(body.data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load staff duty.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.staff.filter((member) => {
      if (department !== "all" && member.department !== department) return false;
      if (duty !== "all" && member.dutyStatus !== duty) return false;
      if (needle) {
        const haystack = `${member.name} ${member.department} ${label(member.role)} ${member.currentAssignment ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [data, search, department, duty]);

  const hasActiveFilters = Boolean(search.trim()) || department !== "all" || duty !== "all";
  const clearFilters = () => { setSearch(""); setDepartment("all"); setDuty("all"); };

  const kpis: { key: StaffDutyStatus | "all"; name: string; value: number; hint: string; icon: typeof Activity; tone: string }[] = [
    { key: "working", name: "Working now", value: data?.summary.working ?? 0, hint: "In-progress work or an open cash shift", icon: Activity, tone: "done" },
    { key: "assigned", name: "Assigned work", value: data?.summary.assigned ?? 0, hint: "Open work, not yet started", icon: ClipboardList, tone: "attention" },
    { key: "no_active_work", name: "No active work", value: data?.summary.noActiveWork ?? 0, hint: "No live operational records right now", icon: Users, tone: "" }
  ];

  const renderRow = (member: StaffDutyMember) => (
    <tr key={member.id}>
      <td><div className="cell-stack"><b>{member.name}</b><small>{label(member.role)}</small></div></td>
      <td>{member.department}</td>
      <td><span className={dutyBadge(member.dutyStatus)}>{dutyText(member.dutyStatus)}</span></td>
      <td><div className="cell-stack"><b className={member.currentAssignment ? "" : "sd-muted"}>{member.currentAssignment ?? "No active assignment"}</b>{member.assignmentKind && <small>{KIND_LABEL[member.assignmentKind]}</small>}</div></td>
      <td><div className="cell-stack"><b>{openWork(member.workload)}</b>{member.workload.completedToday > 0 && <small>{member.workload.completedToday} completed today</small>}</div></td>
      <td className="sd-actions"><button type="button" className="table-action view-action" onClick={() => setViewing(member)}><Eye size={13} /> View</button></td>
    </tr>
  );

  const renderCard = (member: StaffDutyMember) => (
    <article className="sd-card" key={member.id}>
      <header>
        <div className="cell-stack"><b>{member.name}</b><small>{member.department} · {label(member.role)}</small></div>
        <span className={dutyBadge(member.dutyStatus)}>{dutyText(member.dutyStatus)}</span>
      </header>
      <p className={member.currentAssignment ? "sd-card-assignment" : "sd-card-assignment sd-muted"}>{member.currentAssignment ?? "No active assignment"}</p>
      <div className="sd-card-meta"><span>{openWork(member.workload)}</span>{member.workload.completedToday > 0 && <span>{member.workload.completedToday} completed today</span>}</div>
      <div className="sd-card-actions"><button type="button" className="table-action view-action" onClick={() => setViewing(member)}><Eye size={13} /> View</button></div>
    </article>
  );

  return (
    <>
      <div className="page-title module-title">
        <div>
          <p className="eyebrow">Staff operations</p>
          <h1>Staff &amp; Duty</h1>
          <p>Who is on duty right now, department coverage, and what each team member is working on — across hotel operations.</p>
        </div>
      </div>

      {error ? (
        // A failed request must never read as "no staff" — the error state says so explicitly.
        <div className="data-panel"><div className="sd-empty"><span className="sd-empty-icon"><Users size={22} /></span><h3>Staff duty unavailable</h3><p>{error}</p><button type="button" className="sd-clear" onClick={() => { setError(""); setLoading(true); void load(); }}><RefreshCw size={13} />Try again</button></div></div>
      ) : loading || !data ? (
        <div className="data-panel"><div className="sd-skeleton" role="status" aria-label="Loading staff duty"><i /><i /><i /><i /><i /></div></div>
      ) : (
        <>
          <div className="sd-kpis" role="status" aria-label="Duty summary">
            {kpis.map(({ key, name, value, hint, icon: Icon, tone }) => (
              <button type="button" className={`sd-kpi${tone ? ` ${tone}` : ""}${duty === key ? " active" : ""}`} key={key} aria-pressed={duty === key} disabled={value === 0} onClick={() => setDuty(duty === key ? "all" : key)}>
                <span>{name}</span><b>{value}</b><small>{hint}</small><i aria-hidden="true"><Icon size={16} /></i>
              </button>
            ))}
            <div className="sd-kpi info" aria-label="Operational departments"><span>Departments</span><b>{data.summary.departments}</b><small>Operational departments in this view</small><i aria-hidden="true"><Building2 size={16} /></i></div>
          </div>

          <p className="sd-note">{data.basisNote}</p>

          <div className="sd-depts" aria-label="Department coverage">
            {data.departments.map((dept) => {
              const onDuty = dept.working + dept.assigned;
              const activity = Object.entries(dept.activity).filter(([, count]) => count > 0);
              return (
                <button type="button" key={dept.name} className={department === dept.name ? "active" : ""} aria-pressed={department === dept.name} onClick={() => setDepartment(department === dept.name ? "all" : dept.name)} title={`Filter to ${dept.name}`}>
                  <span className="sd-dept-name">{dept.name}</span>
                  <span className="sd-dept-count"><i>{onDuty}</i> of {dept.total} on duty</span>
                  <small>{activity.length ? activity.map(([kind, count]) => `${count} ${kind.toLowerCase()}`).join(" · ") : "No active work"}</small>
                  <span className="sd-dept-meter" aria-hidden="true"><span style={{ width: `${dept.total ? Math.round((onDuty / dept.total) * 100) : 0}%` }} /></span>
                </button>
              );
            })}
          </div>

          <div className="table-tools reservation-filters sd-toolbar">
            <label>
              <Search size={15} aria-hidden />
              <span className="sr-only">Search staff</span>
              <input type="search" placeholder="Search staff, department, assignment…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div>
              <select value={department} onChange={(event) => setDepartment(event.target.value)} aria-label="Filter by department">
                <option value="all">All departments</option>
                {data.departments.map((dept) => <option key={dept.name} value={dept.name}>{dept.name}</option>)}
              </select>
              <select value={duty} onChange={(event) => setDuty(event.target.value)} aria-label="Filter by duty status">
                <option value="all">All duty states</option>
                <option value="working">Working now</option>
                <option value="assigned">Assigned work</option>
                <option value="no_active_work">No active work</option>
              </select>
              {hasActiveFilters && <button type="button" className="sd-clear" onClick={clearFilters}><X size={13} />Clear filters</button>}
            </div>
          </div>

          <div className="data-panel">
            {data.staff.length === 0 ? (
              <div className="sd-empty"><span className="sd-empty-icon"><Users size={22} /></span><h3>No staff on record</h3><p>No active operational staff accounts exist yet. Owner/Admin create staff accounts in governance.</p></div>
            ) : filtered.length === 0 ? (
              <div className="sd-empty"><span className="sd-empty-icon"><Search size={22} /></span><h3>No matching staff</h3><p>No staff match the current search and filters.</p><button type="button" className="sd-clear" onClick={clearFilters}><X size={13} />Clear filters</button></div>
            ) : (
              <>
                <div className="table-scroll sd-table-wrap">
                  <table className="sd-table" aria-label="Staff on duty">
                    <thead><tr><th>Staff</th><th>Department</th><th>Duty</th><th>Current assignment</th><th>Today</th><th /></tr></thead>
                    <tbody>{filtered.map(renderRow)}</tbody>
                  </table>
                </div>
                <div className="sd-cards">{filtered.map(renderCard)}</div>
                <div className="table-footer">Showing {filtered.length} of {data.staff.length} staff<span>Read-only supervision — duty is derived from live operational records.</span></div>
              </>
            )}
          </div>
        </>
      )}

      {viewing && (
        <Modal isOpen onClose={() => setViewing(null)} title={viewing.name} description={`${viewing.department} · ${label(viewing.role)}`} size="md" headerVariant="branded">
          <div className="sd-detail">
            <div className="sd-detail-hero">
              <span className={dutyBadge(viewing.dutyStatus)}>{dutyText(viewing.dutyStatus)}</span>
              <small>Current assignment</small>
              <p>{viewing.currentAssignment ?? "No active assignment"}</p>
            </div>
            <div className="sd-detail-stats">
              <div><small>In progress</small><b>{viewing.workload.inProgress}</b></div>
              <div><small>Assigned</small><b>{viewing.workload.assigned}</b></div>
              <div><small>Completed today</small><b>{viewing.workload.completedToday}</b></div>
            </div>
            <section>
              <h4>Active operational work</h4>
              {viewing.activeWork.length ? (
                <ul>
                  {viewing.activeWork.map((work) => (
                    <li key={work.id}>
                      <WorkIcon source={work.source} />
                      <span>{work.label}</span>
                      <span className={`badge ${work.status === "in_progress" || work.status === "open" ? "pending" : "confirmed"}`}>{label(work.status)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No open housekeeping tasks, work orders, or cash shifts.</p>
              )}
            </section>
            <p className="sd-detail-note">{STAFF_DUTY_BASIS_NOTE}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
