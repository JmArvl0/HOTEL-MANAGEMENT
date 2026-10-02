"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { SoundToggleRow } from "@/components/ui/sound-toggle";
import { PasswordForm } from "@/components/account/account-forms";

// Account security used to be a page (/account/settings). Opening it as a modal
// keeps the guest's page — a half-filled booking step, an open folio — exactly
// where it was instead of navigating away and back. /account/settings is still
// reachable directly and still renders the same two blocks.
const AccountSecurityContext = createContext<{ open: () => void } | null>(null);

export function useAccountSecurity() {
  return useContext(AccountSecurityContext);
}

export function AccountSecurityDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Account security"
      description="Change your password and choose whether Haven plays a notification sound."
      size="sm"
      headerVariant="branded"
    >
      <div className="settings-body">
        <SoundToggleRow />
        <h3>Password</h3>
        <PasswordForm />
      </div>
    </Modal>
  );
}

// One dialog instance for the whole shell, with the open flag owned by the shell
// itself (which renders the account menu). Mounted inside .customer-shell (so the
// portal's own form theming and --cp-* tokens reach it) but outside
// .customer-content-header, whose backdrop-filter would otherwise become the
// containing block for the fixed-position dialog. Modal renders null while
// closed, so nothing is added to the DOM until it is opened. Any surface deeper
// in the tree — the My Profile page title — opens the same dialog via the context.
export function AccountSecurityProvider({ isOpen, onOpen, onClose, children }: {
  isOpen: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  const value = useMemo(() => ({ open: onOpen }), [onOpen]);
  return (
    <AccountSecurityContext.Provider value={value}>
      {children}
      <AccountSecurityDialog isOpen={isOpen} onClose={onClose} />
    </AccountSecurityContext.Provider>
  );
}

// Trigger for surfaces inside the shell (the My Profile page title). Outside a
// provider there is nothing to open, so it degrades to the original settings link
// rather than rendering a dead button.
export function AccountSecurityButton({ className, label = "Account security" }: { className?: string; label?: string }) {
  const context = useAccountSecurity();
  if (!context) {
    return <Link className={className} href="/account/settings">{label}</Link>;
  }
  return <button type="button" className={className} onClick={context.open}>{label}</button>;
}
