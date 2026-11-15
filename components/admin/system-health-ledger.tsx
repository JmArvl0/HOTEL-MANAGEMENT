"use client";

import { useRef, useState } from "react";
import { CreditCard, FileText, Layers, ShieldAlert } from "lucide-react";
import { HavenSearchInput, HavenSkeletonCard } from "@/components/ui/haven-data-controls";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { DepositMethodSwitch } from "@/components/ui/deposit-method-switch";
import type { SystemHealth } from "@/lib/system-health";

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");

const stamp = (at: string | null | undefined) =>
  at
    ? new Date(at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "—";

const tabs = [
  { key: "migrations", label: "Applied Migrations", Icon: Layers },
  { key: "payment", label: "Payment Configuration", Icon: CreditCard },
  { key: "audit", label: "Audit Trail", Icon: FileText },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function PaymentHealthPanel({ payments, gateway, notify, onRefresh }: { payments: SystemHealth["payments"]; gateway?: SystemHealth["gateway"]; notify?: (message: string, tone?: "info" | "success" | "warning" | "error") => void; onRefresh?: () => void }) {
  if (!payments)
    return (
      <HavenSkeletonCard hasHeader />
    );
  return (
    <>
      <div className="panel-heading">
        <div>
          <h3>Payment configuration</h3>
          <p>Owner and Admin can switch online checkout for new reservations.</p>
        </div>
        <StatusBadge status={payments.status === "Active" ? "paid" : "expired"} label={payments.status} />
      </div>
      <dl className="system-health-config">
        <div><dt>Xendit sandbox</dt><dd>{gateway?.xenditConfigured ? "Configured · Test mode only" : "Not configured"} · /api/webhooks/xendit</dd></div>
        <div>
          <dt>Configured by</dt>
          <dd>{payments.configuredBy ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>
            {payments.lastUpdated
              ? new Date(payments.lastUpdated).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Unknown"}
          </dd>
        </div>
        <DepositMethodSwitch
          key={payments.version}
          current={payments.depositMethod}
          version={payments.version}
          xenditOn={gateway?.xenditConfigured}
          notify={notify}
          onRefresh={onRefresh}
        />
      </dl>
    </>
  );
}

export function SystemHealthLedger({
  data,
  checked,
  onProbe,
  notify,
}: {
  data: SystemHealth;
  checked: string;
  onProbe?: () => void;
  notify?: (message: string, tone?: "info" | "success" | "warning" | "error") => void;
}) {
  const rows = data?.migrations?.applied ?? [];
  const appliedCount = data?.migrations?.appliedCount ?? rows.length;
  const localCount = data?.migrations?.localCount ?? null;
  const status =
    localCount === null ? "unknown" : appliedCount < localCount ? "remote_behind" : "in_sync";
  const activity = data?.activity ?? {};
  const probes = data?.recentProbes ?? [];
  const [tab, setTab] = useState<TabKey>("migrations");
  const [search, setSearch] = useState("");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onTabKeys = (event: React.KeyboardEvent) => {
    const order = tabs.map((t) => t.key);
    const at = order.indexOf(tab);
    if (event.key === "ArrowRight") setTab(order[(at + 1) % order.length]);
    else if (event.key === "ArrowLeft") setTab(order[(at - 1 + order.length) % order.length]);
    else if (event.key === "Home") setTab(order[0]);
    else if (event.key === "End") setTab(order[order.length - 1]);
    else return;
    event.preventDefault();
    const next = order[(at + (event.key === "ArrowLeft" ? -1 : 1) + order.length) % order.length];
    tabRefs.current[event.key === "Home" ? order[0] : event.key === "End" ? order[order.length - 1] : next]?.focus();
  };
  const filtered = rows.filter((row) =>
    `${row.version} ${row.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const page = useTablePagination(filtered);
  const clearSearch = () => setSearch("");

  return (
    <section className="system-health-ledger" aria-label="System health ledger">
      <div className="data-panel system-health-ledger-tabs">
        <div
          className="system-health-tablist"
          role="tablist"
          aria-label="System health ledgers"
          onKeyDown={onTabKeys}
        >
          {tabs.map(({ key, label: tabLabel, Icon }) => (
            <button
              key={key}
              ref={(element) => {
                tabRefs.current[key] = element;
              }}
              type="button"
              role="tab"
              id={`sys-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`sys-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              <span className="sys-ico--inline" aria-hidden="true">
                <Icon size={14} />
              </span>
              {tabLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="data-panel system-health-ledger-content">
        <div
          role="tabpanel"
          id="sys-panel-migrations"
          aria-labelledby="sys-tab-migrations"
          hidden={tab !== "migrations"}
        >
          <div className="panel-heading">
            <div>
              <h3>Applied migrations</h3>
              <p>Newest first — the live supabase migration ledger, read server-side</p>
            </div>
            <StatusBadge
              status={status === "in_sync" ? "healthy" : status === "remote_behind" ? "pending" : ""}
              label={label(status)}
            />
          </div>
          <div className="system-health-searchrow">
            <HavenSearchInput
              value={search}
              onValueChange={setSearch}
              label="Search migrations"
              placeholder="Search version or name..."
            />
            <span className="system-health-count" aria-live="polite">
              {filtered.length} of {appliedCount} shown
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty">
              <ShieldAlert size={21} aria-hidden="true" />
              <h3>No migrations match this search</h3>
              <p>Try clearing the search to see every applied migration.</p>
              <button className="table-action" onClick={clearSearch}>
                Clear search
              </button>
            </div>
          ) : (
            <div className="system-health-tablewrap">
              <table className="system-health-table system-health-table--migrations" aria-label="Applied migrations">
                {/* Column minimums live in system-health.css as --sys-col-*. The
                    LAST column (Status) deliberately carries no width: it is the
                    only unconstrained one, so the browser hands it the leftover
                    width and the other columns stay content-width and adjacent.
                    Give it a width and the slack moves back between columns —
                    see the note in system-health.css. */}
                <colgroup>
                  <col className="col-version" />
                  <col className="col-name" />
                  <col className="col-date" />
                  <col className="col-status" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.version}>
                      <td>
                        <code className="version-code">{row.version}</code>
                      </td>
                      <td>{label(row.name)}</td>
                      <td>
                        {row.appliedAt ? (
                          <>
                            {stamp(row.appliedAt)}
                            {row.approximate ? (
                              <span title="First recorded by this ledger — approximate for migrations applied before tracking began" aria-label="approximate date"> *</span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <StatusBadge status="applied" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TablePagination
            {...page}
            onPageChange={page.setPage}
            noun={`applied migration${appliedCount !== 1 ? "s" : ""}`}
            note={`Last checked ${checked} · auto-refresh every minute`}
          />
        </div>
        <div
          role="tabpanel"
          id="sys-panel-payment"
          aria-labelledby="sys-tab-payment"
          hidden={tab !== "payment"}
        >
          <PaymentHealthPanel payments={data?.payments} gateway={data?.gateway} notify={notify} onRefresh={onProbe} />
        </div>
        <div
          role="tabpanel"
          id="sys-panel-audit"
          aria-labelledby="sys-tab-audit"
          hidden={tab !== "audit"}
        >
          <div className="panel-heading">
            <div>
              <h3>Audit trail</h3>
              <p>
                Latest system probes and administrative events · {activity.auditEvents24h ?? 0} in
                the last 24 hours
              </p>
            </div>
          </div>
          {probes.length > 0 ? (
            <div className="system-health-tablewrap">
              <table className="system-health-table system-health-table--audit" aria-label="System audit trail">
                {/* Column minimums live in system-health.css as --sys-col-*.
                    Entity is the one unconstrained column: short single tokens
                    absorb the leftover, while By keeps its own allotment so
                    actor names never shred mid-word. */}
                <colgroup>
                  <col className="col-time" />
                  <col className="col-action" />
                  <col className="col-entity" />
                  <col className="col-by" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {probes.map((probe) => (
                    <tr key={`${probe.at}-${probe.action}`}>
                      <td>{stamp(probe.at || null)}</td>
                      <td>{label(probe.action)}</td>
                      <td>{label(probe.entity)}</td>
                      <td>{probe.actor ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <ShieldAlert size={21} aria-hidden="true" />
              <h3>No probe history yet</h3>
              <p>Probes record here on every refresh — run one to populate this trail.</p>
              {onProbe ? <button className="table-action" onClick={onProbe}>Run health probes</button> : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
