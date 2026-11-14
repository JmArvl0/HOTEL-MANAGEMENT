"use client";

import { useState } from "react";
import { BarChart3, Download, FileText } from "lucide-react";
import type { DashboardData } from "@/lib/types";
import { PageHeader } from "@/components/ui/Navigation";
import FrontDeskReportsPanel from "./front-desk-reports-panel";
import PerformanceReports from "./performance-reports";

type ReportView = "daily" | "performance";

export default function ManagerReportsWorkspace({ data, initialDate }: { data: DashboardData; initialDate?: string }) {
  const [view, setView] = useState<ReportView>("daily");

  return <section className="manager-reports-workspace" data-reports-view={view}>
    <PageHeader
      variant="band"
      eyebrow="Hotel operations"
      title="Operations & review"
      subtitle="Review property performance and Front Desk reports in one workspace."
      actions={<button type="button" className="btn btn-soft" onClick={() => window.print()}><Download size={16} aria-hidden="true"/>Export current view</button>}
    />
    <div className="manager-report-tabs" role="group" aria-label="Manager report views">
      <button type="button" aria-pressed={view === "daily"} onClick={() => setView("daily")}><FileText size={16} aria-hidden="true"/>Daily report review</button>
      <button type="button" aria-pressed={view === "performance"} onClick={() => setView("performance")}><BarChart3 size={16} aria-hidden="true"/>Performance</button>
    </div>
    <div className="manager-report-content">
      {view === "daily"
        ? <FrontDeskReportsPanel role="manager" initialDate={initialDate} showHeader={false}/>
        : <PerformanceReports data={data} role="manager" showHeader={false} showExport={false}/>}
    </div>
  </section>;
}
