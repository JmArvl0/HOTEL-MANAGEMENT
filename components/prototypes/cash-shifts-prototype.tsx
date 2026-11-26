"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Banknote, Building2, CalendarDays,
  Check, ChevronRight, CircleHelp, Clock3, FileText, Filter,
  LayoutDashboard, Moon, RefreshCw, Search, ShieldCheck, Sun,
  WalletCards, type LucideIcon,
} from "lucide-react";
import styles from "./cash-shifts-prototype.module.css";

type Role = "front_desk" | "accounting";
type MovementType = "collection" | "refund";

const navigation: { label: string; Icon: LucideIcon }[] = [
  { label: "Dashboard", Icon: LayoutDashboard },
  { label: "Bookings", Icon: CalendarDays },
  { label: "Transactions", Icon: WalletCards },
  { label: "Cash & Shifts", Icon: Banknote },
];

const movements: {
  id: string; time: string; type: MovementType; guest: string;
  reference: string; method: string; amount: number;
}[] = [
  { id: "1", time: "1:18 PM", type: "collection", guest: "Elena Cruz", reference: "HVN-2481", method: "Cash", amount: 8500 },
  { id: "2", time: "12:42 PM", type: "collection", guest: "David Lim", reference: "HVN-2478", method: "Cash", amount: 12400 },
  { id: "3", time: "11:06 AM", type: "refund", guest: "Mika Santos", reference: "RF-0614", method: "Cash payout", amount: 1500 },
  { id: "4", time: "10:31 AM", type: "collection", guest: "Noah Reyes", reference: "HVN-2475", method: "Cash", amount: 7900 },
];

const shifts = [
  { id: "CS-0613", date: "Nov 13, 2026", staff: "Anna Reyes", opening: 5000, expected: 18250, counted: 18250, status: "Reconciled" },
  { id: "CS-0612", date: "Nov 12, 2026", staff: "Mara Santos", opening: 5000, expected: 24100, counted: 23900, status: "Awaiting review" },
  { id: "CS-0611", date: "Nov 11, 2026", staff: "Anna Reyes", opening: 4500, expected: 16200, counted: 16200, status: "Reconciled" },
];

const peso = (amount: number) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", minimumFractionDigits: 2,
}).format(amount);

export default function CashShiftsPrototype() {
  const [role, setRole] = useState<Role>("front_desk");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [countOpen, setCountOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [countReviewed, setCountReviewed] = useState(false);
  const [query, setQuery] = useState("");
  const [movementFilter, setMovementFilter] = useState<"all" | MovementType>("all");
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [message, setMessage] = useState("");

  const filteredMovements = useMemo(() => movements.filter((movement) => {
    const matchesType = movementFilter === "all" || movement.type === movementFilter;
    const searchable = `${movement.guest} ${movement.reference} ${movement.method}`.toLowerCase();
    return matchesType && searchable.includes(query.toLowerCase());
  }), [movementFilter, query]);
  const selectedShiftRecord = shifts.find((shift) => shift.id === selectedShift);

  function reviewCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!countedCash || Number(countedCash) < 0) return;
    setCountReviewed(true);
    setMessage("Demo count reviewed. No hotel cash records were changed.");
  }

  return (
    <div className={styles.prototype} data-theme={theme}>
      <aside className={styles.sidebar} aria-label="Prototype navigation">
        <div className={styles.brand}>
          <span className={styles.brandMark}><Building2 size={19} aria-hidden="true" /></span>
          <span><strong>HAVEN</strong><small>HOTEL &amp; RESIDENCES</small></span>
        </div>

        <div className={styles.property}><span className={styles.propertyDot} />Haven Hotel <ChevronRight size={14} aria-hidden="true" /></div>
        <p className={styles.navLabel}>WORKSPACE</p>
        <nav className={styles.nav} aria-label="Preview menu">
          {navigation.map(({ label, Icon }) => (
            <span className={styles.navItem} key={label} aria-current={label === "Cash & Shifts" ? "page" : undefined}>
              <Icon size={17} aria-hidden="true" />{label}
            </span>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <span className={styles.avatar}>MS</span>
          <span><strong>Mara Santos</strong><small>{role === "front_desk" ? "Front Desk" : "Accounting"}</small></span>
          <ChevronRight size={15} aria-hidden="true" />
        </div>
      </aside>

      <div className={styles.main} id="cash-shifts">
        <header className={styles.topbar}>
          <p>Finance <ChevronRight size={13} aria-hidden="true" /> <strong>Cash &amp; Shifts</strong></p>
          <div className={styles.topActions}>
            <div className={styles.roleSwitch} role="group" aria-label="Preview role">
              <button type="button" aria-pressed={role === "front_desk"} onClick={() => setRole("front_desk")}>Front Desk</button>
              <button type="button" aria-pressed={role === "accounting"} onClick={() => setRole("accounting")}>Accounting</button>
            </div>
            <button className={styles.themeButton} type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
              {theme === "light" ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.previewBanner} role="note">
            <CircleHelp size={17} aria-hidden="true" />
            <p><strong>Preview only</strong><span>Sample names and amounts. Buttons here do not change hotel records.</span></p>
            <span className={styles.sampleTag}>DEMO DATA</span>
          </div>

          <div className={styles.pageHeading}>
            <div><h1>Cash &amp; Shifts</h1><p>Track the shared drawer, count cash, and review completed shifts.</p></div>
            <button className={styles.subtleButton} type="button" onClick={() => setMessage("Preview refreshed with sample data.")}><RefreshCw size={15} aria-hidden="true" />Refresh</button>
          </div>

          {message && <p className={styles.feedback} role="status"><Check size={16} aria-hidden="true" />{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">×</button></p>}

          <div className={styles.overviewGrid}>
            <section className={styles.drawerPanel} aria-labelledby="drawer-heading">
              <div className={styles.panelHeading}>
                <div><p className={styles.sectionLabel}>CURRENT DRAWER</p><h2 id="drawer-heading">Front Desk · Main counter</h2></div>
                <span className={styles.openBadge}><i />Open</span>
              </div>

              <div className={styles.custody}>
                <span className={styles.avatar}>MS</span>
                <div><strong>Mara Santos</strong><span>Opened today at 9:12 AM · Shift CS-0614</span></div>
                <span className={styles.elapsed}><Clock3 size={14} aria-hidden="true" />4h 18m</span>
              </div>

              <div className={styles.expectedRow}>
                <div><span>Expected cash in drawer</span><strong>{peso(32300)}</strong><small>Opening float + cash received − cash payouts</small></div>
                {!countOpen && <button className={styles.primaryButton} type="button" onClick={() => { setCountOpen(true); setCountReviewed(false); }}><Banknote size={17} aria-hidden="true" />Record cash count</button>}
              </div>

              <dl className={styles.cashBasis}>
                <div><dt>Opening float</dt><dd>{peso(5000)}</dd></div>
                <div><dt>Cash received</dt><dd>{peso(28800)}</dd></div>
                <div><dt>Cash payouts</dt><dd>−{peso(1500)}</dd></div>
              </dl>

              <div className={styles.drawerStatus}>
                <div><span className={styles.statusIcon}><Clock3 size={15} aria-hidden="true" /></span><span><strong>Count needed to close</strong><small>Expected cash is based on paid transactions linked to this drawer.</small></span></div>
                <span className={styles.statusText}>Not counted</span>
              </div>

              {countOpen && <form className={styles.countForm} onSubmit={reviewCount}>
                <div className={styles.countFormHeading}><div><h3>Record a physical count</h3><p>Count the notes and coins in the drawer, then compare with expected cash.</p></div><button type="button" className={styles.closeButton} aria-label="Close cash count" onClick={() => setCountOpen(false)}>×</button></div>
                <label htmlFor="prototype-count">Counted cash <span>PHP</span></label>
                <div className={styles.moneyInput}><span>₱</span><input id="prototype-count" type="number" min="0" step="0.01" placeholder="Enter counted amount" value={countedCash} onChange={(event) => { setCountedCash(event.target.value); setCountReviewed(false); }} required /></div>
                {countedCash && Number.isFinite(Number(countedCash)) && <p className={styles.liveDifference}><span>Difference</span><strong className={Number(countedCash) - 32300 === 0 ? styles.balanced : styles.variance}>{Number(countedCash) - 32300 > 0 ? "+" : ""}{peso(Number(countedCash) - 32300)}</strong></p>}
                <div className={styles.countActions}><button type="button" className={styles.subtleButton} onClick={() => setCountOpen(false)}>Cancel</button><button className={styles.primaryButton} type="submit">Review count</button></div>
                {countReviewed && <p className={styles.inlineSuccess}><Check size={15} aria-hidden="true" />Count reviewed in this preview. No record was saved.</p>}
              </form>}
            </section>

            <aside className={styles.sideRail}>
              <section className={styles.readiness} aria-labelledby="readiness-heading">
                <div className={styles.panelHeading}><div><p className={styles.sectionLabel}>SHIFT CHECKLIST</p><h2 id="readiness-heading">Close readiness</h2></div><span className={styles.checklistCount}>2 of 3</span></div>
                <ul>
                  <li><span className={styles.stepDone}><Check size={13} aria-hidden="true" /></span><span><strong>Drawer opened</strong><small>Float confirmed by Mara Santos</small></span></li>
                  <li><span className={styles.stepDone}><Check size={13} aria-hidden="true" /></span><span><strong>Cash activity recorded</strong><small>3 cash collections · 1 payout</small></span></li>
                  <li><span className={styles.stepPending}>3</span><span><strong>Physical count</strong><small>Required before closing the drawer</small></span></li>
                </ul>
                {role === "accounting" && <div className={styles.accountingNote}><ShieldCheck size={16} aria-hidden="true" /><span><strong>Accounting review</strong><small>Reconcile closed shifts after the cash count and close.</small></span></div>}
              </section>

              <section className={styles.handover} aria-labelledby="handover-heading">
                <div className={styles.panelHeading}><div><p className={styles.sectionLabel}>TEAM FOLLOW-UP</p><h2 id="handover-heading">Drawer handover</h2></div><span className={styles.handoverCount}>1 open</span></div>
                <p>One note is waiting for the next shift to acknowledge.</p>
                <button type="button" className={styles.linkButton} onClick={() => setHandoverOpen(!handoverOpen)}>{handoverOpen ? "Hide handover" : "Review handover"} <ChevronRight size={15} aria-hidden="true" /></button>
                {handoverOpen && <p className={styles.handoverDetail}>Mara Santos: “Please verify the sealed refund envelope against voucher RF-0614 before opening the next drawer.”</p>}
              </section>
            </aside>
          </div>

          <section className={styles.activitySection} aria-labelledby="activity-heading">
            <div className={styles.sectionTop}>
              <div><p className={styles.sectionLabel}>CURRENT DRAWER · CS-0614</p><h2 id="activity-heading">Recent cash activity</h2><p>Paid transactions linked to the open drawer.</p></div>
              <button type="button" className={styles.linkButton} onClick={() => { setQuery(""); setMovementFilter("all"); setMessage("Filters cleared. Showing all sample cash movements."); }}>View all movements <ChevronRight size={15} aria-hidden="true" /></button>
            </div>
            <div className={styles.controls}>
              <label className={styles.searchBox}><Search size={16} aria-hidden="true" /><span className={styles.visuallyHidden}>Search cash activity</span><input type="search" placeholder="Search guest or reference" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <label className={styles.filterBox}><Filter size={15} aria-hidden="true" /><span className={styles.visuallyHidden}>Filter activity type</span><select value={movementFilter} onChange={(event) => setMovementFilter(event.target.value as "all" | MovementType)}><option value="all">All activity</option><option value="collection">Collections</option><option value="refund">Payouts</option></select></label>
            </div>

            <div className={styles.tableWrap}><table>
              <thead><tr><th scope="col">Time</th><th scope="col">Guest / reference</th><th scope="col">Activity</th><th scope="col">Method</th><th scope="col" className={styles.amountColumn}>Amount</th></tr></thead>
              <tbody>{filteredMovements.map((movement) => <tr key={movement.id}>
                <td>{movement.time}</td>
                <td><strong>{movement.guest}</strong><small>{movement.reference}</small></td>
                <td><span className={`${styles.movementType} ${movement.type === "refund" ? styles.payoutType : ""}`}>{movement.type === "refund" ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownLeft size={14} aria-hidden="true" />}{movement.type === "refund" ? "Cash payout" : "Collection"}</span></td>
                <td>{movement.method}</td>
                <td className={`${styles.amountColumn} ${movement.type === "refund" ? styles.payoutAmount : ""}`}>{movement.type === "refund" ? "−" : "+"}{peso(movement.amount)}</td>
              </tr>)}</tbody>
            </table>{filteredMovements.length === 0 && <p className={styles.emptyState}>No cash activity matches this search. Try another name or reference.</p>}</div>
            <footer className={styles.tableFooter}><span>Showing {filteredMovements.length} of {movements.length} movements</span><span>Times shown in Manila time</span></footer>
          </section>

          <section className={styles.historySection} aria-labelledby="history-heading">
            <div className={styles.sectionTop}>
              <div><p className={styles.sectionLabel}>ALL DATES</p><h2 id="history-heading">Shift history</h2><p>Closed drawers and their reconciliation status.</p></div>
              {role === "accounting" && <span className={styles.reviewPill}>1 awaiting reconciliation</span>}
            </div>
            <div className={styles.tableWrap}><table>
              <thead><tr><th scope="col">Shift</th><th scope="col">Date</th><th scope="col">Opened by</th><th scope="col" className={styles.amountColumn}>Expected</th><th scope="col" className={styles.amountColumn}>Counted</th><th scope="col">Status</th><th scope="col"><span className={styles.visuallyHidden}>Actions</span></th></tr></thead>
              <tbody>{shifts.map((shift) => <tr key={shift.id}>
                <td><strong>{shift.id}</strong></td><td>{shift.date}</td><td>{shift.staff}</td><td className={styles.amountColumn}>{peso(shift.expected)}</td><td className={styles.amountColumn}>{peso(shift.counted)}</td><td><span className={`${styles.historyStatus} ${shift.status === "Reconciled" ? styles.reconciledStatus : styles.reviewStatus}`}>{shift.status}</span></td>
                <td className={styles.rowAction}><button type="button" onClick={() => { setSelectedShift(selectedShift === shift.id ? null : shift.id); setMessage(""); }}>{selectedShift === shift.id ? "Close" : "Details"}</button>{role === "accounting" && shift.status === "Awaiting review" && <button type="button" onClick={() => { setSelectedShift(shift.id); setMessage("Reconciliation preview selected. No record was changed."); }}>Review</button>}</td>
              </tr>)}</tbody>
            </table></div>
            {selectedShiftRecord && <div className={styles.shiftDetail} role="status"><FileText size={17} aria-hidden="true" /><span><strong>{selectedShiftRecord.id} · {selectedShiftRecord.status}</strong><small>{selectedShiftRecord.date} · Expected {peso(selectedShiftRecord.expected)} · Counted {peso(selectedShiftRecord.counted)} · {selectedShiftRecord.counted < selectedShiftRecord.expected ? "Short by" : selectedShiftRecord.counted > selectedShiftRecord.expected ? "Over by" : "Balanced at"} {peso(Math.abs(selectedShiftRecord.counted - selectedShiftRecord.expected))}</small></span><button type="button" onClick={() => setSelectedShift(null)}>Dismiss</button></div>}
            <footer className={styles.tableFooter}><span>3 illustrative shifts · all dates</span></footer>
          </section>

          <p className={styles.disclaimer}><ShieldCheck size={15} aria-hidden="true" />Cash totals in the live page are calculated from linked, paid cash activity. This prototype uses illustrative values only.</p>
        </main>
      </div>
    </div>
  );
}
