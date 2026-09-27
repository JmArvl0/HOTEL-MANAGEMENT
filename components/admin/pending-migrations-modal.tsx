"use client";
import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { MigrationLedgerRow } from "@/lib/system-health";

export function PendingMigrationsModal({ open, onClose, pending, onCopied }: {
  open: boolean; onClose: () => void; pending: MigrationLedgerRow[]; onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText("supabase db push"); } catch { /* clipboard unavailable */ }
    setCopied(true);
    onCopied();
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Pending migrations" description={pending.length ? `${pending.length} local migration${pending.length === 1 ? " is" : "s are"} not applied to the live database.` : "Deployment is in sync."}>
      {pending.length === 0 ? (
        <p>No pending migrations. The live database matches the local migration files.</p>
      ) : (
        <div className="sys-pending-scroll"><table aria-label="Pending migrations"><colgroup><col className="col-version" /><col /></colgroup><thead><tr><th>Version</th><th>Filename</th></tr></thead>
          <tbody>{pending.map((row) => {
            const file = `${row.version}_${row.name}.sql`;
            return (
            <tr key={row.version}><td><code className="version-code">{row.version}</code></td><td><code className="sys-pending-file" title={file}>{file}</code></td></tr>
            );
          })}</tbody></table></div>
      )}
      <div className="sys-cli-box">
        <span className="sys-cli-code"><Terminal size={14} aria-hidden="true" />Apply with: <code>supabase db push</code></span>
          <button type="button" className="table-action sys-cli-copy" onClick={copy} aria-label="Copy supabase db push command">
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? "Copied" : "Copy"}
          </button></div>
    </Modal>
  );
}
