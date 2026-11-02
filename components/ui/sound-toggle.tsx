"use client";
// Shared notification-sound toggle. Menu-item variant for account-menu
// popovers; row variant for settings surfaces. Default ON (unmuted).
import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/notification-sound";

export function useNotificationSound() {
  const [enabled, setEnabled] = useState<boolean>(() => isSoundEnabled());
  return [enabled, (next: boolean) => { setEnabled(next); setSoundEnabled(next); }] as const;
}

export function SoundToggleMenuItem({ onToggle }: { onToggle?: () => void }) {
  const [enabled, setEnabled] = useNotificationSound();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={enabled}
      aria-label={`Notification sound ${enabled ? "on" : "off"}`}
      onClick={() => {
        setEnabled(!enabled);
        onToggle?.();
      }}
    >
      {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
      Sound {enabled ? "On" : "Off"}
    </button>
  );
}

export function SoundToggleRow() {
  const [enabled, setEnabled] = useNotificationSound();
  return (
    <div className="settings-theme-row">
      <div><b>Notification sound</b><small>Play a tone when a notification arrives.</small></div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Notification sound ${enabled ? "on" : "off"}`}
        onClick={() => setEnabled(!enabled)}
      >
        {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        {enabled ? "On" : "Off"}
      </button>
    </div>
  );
}
