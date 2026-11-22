"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import type { CommandCenterData } from "@/lib/command-center";
import frame from "./forecast-evaluation-panel.module.css";
import styles from "./phase-two.module.css";

export type CommandDestination = "rooms" | "arrivals" | "departures" | "housekeeping" | "maintenance" | "requests" | "transport" | "finance" | "stock" | "approvals" | "forecast" | "reports";
const amount = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const num = (value: number | null | undefined) => value ?? "—";
const peso = (value: number | null | undefined) => value == null ? "—" : amount.format(value);
const prettyDate = (date: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export default function HotelCommandCenter({ role, onNavigate, onScan }: {
  role: "manager" | "owner";
  onNavigate: (destination: CommandDestination, id?: string) => void;
  onScan?: () => void;
}) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [error, setError] = useState(false);
  const [request, setRequest] = useState(0);
  const [completed, setCompleted] = useState(-1);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetchPublic("/api/staff/command-center", { cache: "no-store", signal: controller.signal });
        const body = await readResponse(response);
        if (controller.signal.aborted) return;
        if (!response.ok || !body?.data) { setError(true); return; }
        setData(body.data);
        setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setCompleted(request); }
    }
    void load();
    return () => controller.abort();
  }, [request]);
  const busy = request !== completed;
  const go = (destination: CommandDestination, label: string, id?: string) => <button type="button" className={styles.link} onClick={() => onNavigate(destination, id)}>{label} <ArrowUpRight size={13} aria-hidden="true" /></button>;
  const board = data?.board.data;
  const work = data?.work.data;
  const stock = data?.stock.data;
  const latest = data ? [data.board.at, data.work.at, data.approvals.at, data.money.at, data.stock.at, data.alerts.at].filter(Boolean).sort().at(-1) : null;
  const timeLabel = (stamp: string) => new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: data?.zone ?? "Asia/Manila" }).format(new Date(stamp));
  const occupancy = board?.serviceable ? `${Math.round(board.occupied / board.serviceable * 100)}%` : "—";

  return <div className={styles.layout}>
    <section className={frame.panel} aria-label="Hotel snapshot">
      <header className={frame.header}>
        <div><h3>Hotel Command Center</h3><p>{data ? `${prettyDate(data.today)} · ${data.zone}${latest ? ` · Updated ${timeLabel(latest)}` : ""}` : "Today’s hotel operations"}</p></div>
        <div className={styles.actions}>{go("reports", "View reports")}{onScan && <button className="btn btn-soft" type="button" onClick={onScan}>Scan QR</button>}<button className="btn btn-soft" type="button" disabled={busy} onClick={() => setRequest(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> {busy ? "Refreshing…" : "Refresh"}</button></div>
      </header>
      {error && <p className={frame.scope} role="alert">{data ? "Refresh failed. Showing the last successful snapshot." : "Hotel operations could not be loaded. Use Refresh to try again."}</p>}
      {data && !board && <p className={frame.scope} role="status">Room and reservation data is unavailable. Use Refresh to try again.</p>}
      <dl className={frame.scorecard} style={{ marginTop: 16 }}>
        <div><dt>{go("rooms", "Live occupancy")}</dt><dd>{occupancy}</dd><small>{num(board?.occupied)} of {num(board?.serviceable)} serviceable rooms</small></div>
        <div><dt>{go("arrivals", "Arrivals today")}</dt><dd>{num(board?.arrivalRemaining)}<small> / {num(board?.arrivalTotal)}</small></dd><small>Still to arrive</small></div>
        <div><dt>{go("departures", "Departures today")}</dt><dd>{num(board?.departureRemaining)}<small> / {num(board?.departureTotal)}</small></dd><small>Still to check out</small></div>
        <div><dt>{go("rooms", "Rooms ready", "available")}</dt><dd>{num(board?.ready)}</dd><small>{num(board?.dirty)} dirty · {num(board?.blocked)} blocked</small></div>
      </dl>
    </section>

    <div className={styles.split}>
      <section className={frame.panel}>
        <h3 className={styles.heading}>Today’s arrivals and departures</h3>
        {(["arrivals", "departures"] as const).map(kind => <div key={kind} className={styles.block}>
          <h4>{go(kind, kind === "arrivals" ? "Arrivals queue" : "Departures queue")}</h4>
          <ul className={styles.rows}>{board?.[kind].map(row => <li className={styles.row} key={row.id}>
            <span>{role === "manager" ? go(kind, row.reference, row.id) : <b>{row.reference}</b>}<small>{row.room ? `Room ${row.room}` : "No room assigned"}{kind === "arrivals" && row.time ? ` · ${row.time}` : ""}</small></span>
            <span>{row.readiness}</span>
          </li>)}</ul>
          <p>{!board ? "Unavailable" : board[kind].length ? `Showing ${board[kind].length} of ${kind === "arrivals" ? board.arrivalRemaining : board.departureRemaining} remaining` : "No stays waiting in this queue."}</p>
        </div>)}
      </section>

      <section className={`${frame.panel} ${styles.priority}`}>
        <h3 className={styles.heading}>Needs attention</h3>
        <ul className={styles.rows}>
          <li className={styles.row}>{go("maintenance", "Critical maintenance")}<strong>{num(work?.criticalMaintenance)}</strong></li>
          <li className={styles.row}>{go("requests", "Overdue guest requests")}<strong>{num(work?.overdueRequests)}</strong></li>
          <li className={styles.row}>{go("housekeeping", "Overdue housekeeping")}<strong>{num(work?.overdueHousekeeping)}</strong></li>
          <li className={styles.row}>{go("approvals", role === "owner" ? "Owner approvals" : "Manager approvals")}<strong>{num(data?.approvals.data)}</strong></li>
          <li className={styles.row}>{role === "manager" ? go("stock", "Items at or below reorder point") : "Items at or below reorder point"}<strong>{num(stock?.low)}</strong></li>
          {role === "owner" && Boolean(stock?.lowStock.length) && <li><details className={frame.details}><summary>Low-stock supplies</summary><ul className={styles.rows}>{stock?.lowStock.map(item => <li className={styles.row} key={item.id}>{item.name}<strong>{item.quantity} {item.unit}</strong></li>)}</ul>{(stock?.low ?? 0) > 8 && <p>Showing the first 8 supplies.</p>}</details></li>}
          {data?.alerts.data?.map(alert => <li key={alert.date} className={styles.row}><span>{go("forecast", `${prettyDate(alert.date)} · High occupancy`)}<small>{alert.quality} data · {timeLabel(alert.generatedAt)} · {prettyDate(alert.issuedOn)}</small></span><strong>{alert.occupancy}%</strong></li>)}
          {stock?.forecast.map(item => <li key={item.itemId} className={styles.row}><span>{role === "manager" ? go("stock", `${item.name} shortage forecast`) : `${item.name} shortage forecast`}<small>Through {prettyDate(stock.through)} · {item.dataQuality} data{data?.stock.at ? ` · ${timeLabel(data.stock.at)}` : ""}</small></span><strong>{item.projectedShortage} {item.unit}</strong></li>)}
          {data && !data.alerts.data && <li className={styles.row}>Occupancy forecast unavailable</li>}
        </ul>
      </section>
    </div>

    <div className={styles.split}>
      <section className={frame.panel}><h3 className={styles.heading}>Department queues</h3><ul className={styles.rows}>
        {([["housekeeping", "Housekeeping backlog"], ["maintenance", "Open maintenance"], ["requests", "Pending guest requests"], ["transport", "Transportation today"]] as const).map(([key, label]) => {
          const at = work?.freshness[key];
          return <li key={key} className={styles.row}><span>{go(key, label)}<small>{at ? `Updated ${timeLabel(at)}` : "Unavailable"}</small></span><strong>{num(work?.[key === "transport" ? "trips" : key])}</strong></li>;
        })}
      </ul></section>
      <section className={frame.panel}><h3 className={styles.heading}>Financial snapshot</h3>
        <p className={styles.description}>{data?.money.data?.date ? `Operating date ${prettyDate(data.money.data.date)}` : data?.money.at ? "Operating day has not been activated." : "Financial snapshot unavailable."}</p>
        <ul className={styles.rows}><li className={styles.row}>{go("finance", "Settled collections")}<strong>{peso(data?.money.data?.received)}</strong></li><li className={styles.row}>{go("finance", "Outstanding folio balance")}<strong>{peso(data?.money.data?.outstanding)}</strong></li></ul>
      </section>
    </div>
  </div>;
}
