"use client";

import { Modal } from "./Modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { PasswordForm } from "@/components/account/account-forms";

// Shared account Settings dialog for the staff shells (manager / owner /
// admin previously carried three identical inline copies). Pure presentation —
// the theme toggle and password form keep their own behavior.
export function SettingsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      description="Appearance and password for your account."
      size="sm"
      headerVariant="branded"
    >
      <div className="settings-body">
        <div className="settings-theme-row">
          <div><b>Appearance</b><small>Switch between dark and light themes.</small></div>
          <ThemeToggle />
        </div>
        <h3>Password</h3>
        <PasswordForm />
      </div>
    </Modal>
  );
}
