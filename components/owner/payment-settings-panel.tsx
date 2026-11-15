"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/Navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DepositMethodSwitch } from "@/components/ui/deposit-method-switch";
import { OwnerEmpty, OwnerTablePanel, formatOwnerDate } from "@/components/owner/owner-primitives";
import type { DepositMethod } from "@/lib/online-checkout";

type PaymentSettings = {
  depositMethod: DepositMethod;
  version: number;
  xenditConfigured: boolean;
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
  trail: { id: number; created_at: string; actorName: string; action: string; reason: string | null }[];
};

export default function PaymentSettingsPanel({ notify }: { notify: (message: string, tone?: "info" | "success" | "warning" | "error") => void }) {
  const [data, setData] = useState<PaymentSettings | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetchPublic("/api/owner/data?section=payments", { cache: "no-store" });
      const body = await readResponse(response);
      if (!response.ok) {
        setError(userMessage(body.error, "Unable to load payment settings."));
        return;
      }
      setData(body.data);
    } catch {
      setError("Unable to load payment settings.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = data?.depositMethod === "xendit" && data.xenditConfigured;

  return (
    <div className="owner-payment-settings">
      <PageHeader
        variant="default"
        title="Payment Settings"
        subtitle="Manage online checkout for new reservations."
        actions={data && <StatusBadge status={active ? "paid" : "expired"} label={active ? "Active" : "Inactive"} />}
      />
      {error && (
        <div className="owner-form-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-soft" onClick={load}>Retry</button>
        </div>
      )}
      {data ? (
        <>
          <section className="data-panel owner-panel">
            <dl className="system-health-config">
              <DepositMethodSwitch key={data.version} current={data.depositMethod} version={data.version} xenditOn={data.xenditConfigured} notify={notify} onRefresh={load} />
              {data.lastUpdated && (
                <div className="deposit-method-switch">
                  <dt>Last updated</dt>
                  <dd>{formatOwnerDate(data.lastUpdated)}{data.lastUpdatedBy ? ` by ${data.lastUpdatedBy}` : ""}</dd>
                </div>
              )}
            </dl>
          </section>
          <OwnerTablePanel
            title="Configuration history"
            noun="changes"
            rows={data.trail.map((entry) => ({ ...entry, id: String(entry.id) }))}
            columns={[
              { key: "created_at", header: "When", render: (row) => formatOwnerDate(row.created_at) },
              { key: "actorName", header: "Changed by", render: (row) => String(row.actorName ?? "—") },
              { key: "action", header: "Change", render: (row) => row.action === "admin_update_deposit_method" ? "Checkout mode" : "Payment destination" },
              { key: "reason", header: "Reason", render: (row) => String(row.reason ?? "—") },
            ]}
            empty={<OwnerEmpty icon={<CreditCard size={22} />} title="No changes recorded" body="Payment configuration changes will appear here." />}
          />
        </>
      ) : !error && <p role="status">Loading payment settings…</p>}
    </div>
  );
}
