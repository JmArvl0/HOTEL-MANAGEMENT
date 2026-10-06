"use client";

import { useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { UserRound, Settings, LogOut, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/notification-sound";
import { Modal } from "@/components/ui/Modal";

export interface HavenAccountModalProps {
  open: boolean;
  onClose: () => void;
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  roleLabel?: string;
  avatarInitials?: string;
  profileHref?: string;
  onOpenSecurity?: () => void;
  onOpenSettings?: () => void;
  showSoundToggle?: boolean;
  onSignOut: () => void | Promise<void>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * HavenAccountModal — Standardized Rooted Account Modal
 * Globally unified across Customer, Staff/Manager, Admin, and Owner accounts.
 * Provides a modal dialog experience with a dimmed background overlay,
 * hero identity card, accessible keyboard navigation, and consistent actions.
 */
export function HavenAccountModal({
  open,
  onClose,
  user,
  roleLabel,
  avatarInitials,
  profileHref,
  onOpenSecurity,
  onOpenSettings,
  showSoundToggle = false,
  onSignOut,
  returnFocusRef,
  className = "",
}: HavenAccountModalProps) {
  const [soundOn, setSoundOn] = useState<boolean>(() => (typeof window !== "undefined" ? isSoundEnabled() : true));

  useEffect(() => {
    if (open) {
      setSoundOn(isSoundEnabled());
    }
  }, [open]);

  const initials = avatarInitials || (user.name ?? user.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Account"
      description="Manage your account profile, preferences, and session."
      size="sm"
      headerVariant="branded"
      returnFocusRef={returnFocusRef as RefObject<HTMLElement>}
      className={`haven-account-dialog ${className}`.trim()}
    >
      <div className="customer-account-popover profile-popover haven-account-modal-body">
        {/* Profile Hero Card */}
        <div className="haven-account-hero-card">
          <div className="haven-account-avatar-wrap" aria-hidden="true">
            <span className="haven-account-avatar-mark">{initials}</span>
          </div>
          <div className="haven-account-info-wrap">
            <p>
              <strong>{user.name ?? "Haven guest"}</strong>
              <small>{user.email ?? "Signed in"}</small>
            </p>
            {roleLabel && (
              <span className="haven-account-badge">{roleLabel}</span>
            )}
          </div>
        </div>

        {/* Action Items List */}
        <div className="haven-account-items-group" aria-label="Account options">
          {profileHref && (
            <Link
              href={profileHref}
              className="haven-account-row-item"
              onClick={onClose}
            >
              <span className="haven-account-row-icon" aria-hidden="true">
                <UserRound size={16} />
              </span>
              <div className="haven-account-row-copy">
                <span className="haven-account-row-title">My Profile</span>
                <small className="haven-account-row-hint" aria-hidden="true">Personal details &amp; contact info</small>
              </div>
              <ChevronRight size={15} className="haven-account-row-chevron" aria-hidden="true" />
            </Link>
          )}

          {onOpenSecurity && (
            <button
              type="button"
              className="haven-account-row-item"
              onClick={onOpenSecurity}
            >
              <span className="haven-account-row-icon" aria-hidden="true">
                <Settings size={16} />
              </span>
              <div className="haven-account-row-copy">
                <span className="haven-account-row-title">Account security</span>
                <small className="haven-account-row-hint" aria-hidden="true">Password &amp; security preferences</small>
              </div>
              <ChevronRight size={15} className="haven-account-row-chevron" aria-hidden="true" />
            </button>
          )}

          {onOpenSettings && (
            <button
              type="button"
              className="haven-account-row-item"
              onClick={onOpenSettings}
            >
              <span className="haven-account-row-icon" aria-hidden="true">
                <Settings size={16} />
              </span>
              <div className="haven-account-row-copy">
                <span className="haven-account-row-title">Settings</span>
                <small className="haven-account-row-hint" aria-hidden="true">System settings &amp; preferences</small>
              </div>
              <ChevronRight size={15} className="haven-account-row-chevron" aria-hidden="true" />
            </button>
          )}

          {showSoundToggle && (
            <button
              type="button"
              role="switch"
              aria-checked={soundOn}
              aria-label={`Notification sound ${soundOn ? "on" : "off"}`}
              className="haven-account-row-item haven-account-sound-item"
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
              }}
            >
              <span className="haven-account-row-icon" aria-hidden="true">
                {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </span>
              <div className="haven-account-row-copy">
                <span className="haven-account-row-title">Notification sound</span>
                <small className="haven-account-row-hint" aria-hidden="true">Play chime for incoming events</small>
              </div>
              <span className={`haven-sound-pill ${soundOn ? "sound-active" : "sound-muted"}`} aria-hidden="true">
                {soundOn ? "On" : "Off"}
              </span>
            </button>
          )}

          <button
            type="button"
            className="haven-account-row-item haven-account-row-danger"
            onClick={() => {
              onClose();
              void onSignOut();
            }}
          >
            <span className="haven-account-row-icon" aria-hidden="true">
              <LogOut size={16} />
            </span>
            <div className="haven-account-row-copy">
              <span className="haven-account-row-title">Sign Out</span>
              <small className="haven-account-row-hint" aria-hidden="true">End your current session</small>
            </div>
            <LogOut size={15} className="haven-account-row-chevron" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
