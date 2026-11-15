"use client";

import { userMessage } from "@/lib/errors";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { HavenSelect } from "@/components/ui/haven-select";
import "./download-menu.css";

type DownloadAction = {
  value: string;
  label: string;
  run: () => void | Promise<void>;
  successMessage?: string;
};

export const printDownload = { value: "print", label: "Print / Save as PDF", run: () => window.print() } satisfies DownloadAction;

export function DownloadMenu({ label, actions, disabled, opensUp = false, alignStart = false, className = "" }: {
  label: string;
  actions: readonly DownloadAction[];
  disabled?: boolean;
  opensUp?: boolean;
  alignStart?: boolean;
  className?: string;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean }>();

  async function select(value: string) {
    const action = actions.find(item => item.value === value);
    if (!action || running.current) return;
    running.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      await action.run();
      if (action.successMessage) setFeedback({ message: action.successMessage });
    } catch (error) {
      setFeedback({ message: userMessage(error, "The file could not be prepared. Try again."), error: true });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={`download-menu ${opensUp ? "download-menu-up" : ""} ${alignStart ? "download-menu-start" : ""} ${className}`}>
      <HavenSelect
        value=""
        onChange={select}
        options={actions.map(({ value, label }) => ({ value, label, disabled: busy }))}
        ariaLabel={label}
        placeholder={busy ? "Preparing…" : "Download"}
        leadingIcon={<Download size={16} />}
        disabled={disabled}
      />
      <span className="download-menu-feedback" role={feedback?.error ? "alert" : "status"}>{feedback?.message}</span>
    </div>
  );
}
