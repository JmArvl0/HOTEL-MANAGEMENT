"use client";

import { useEffect, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import {
  UserRound,
  Mail,
  Phone,
  Globe,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Save,
  Shield,
  Loader2,
  Check,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import "./customer-profile-modal.css";

export interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
  };
  onOpenSecurity?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onProfileUpdated?: (updated: { name: string }) => void;
}

export function CustomerProfileModal({
  isOpen,
  onClose,
  user,
  onOpenSecurity,
  returnFocusRef,
  onProfileUpdated,
}: CustomerProfileModalProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [mobile, setMobile] = useState("");
  const [nationality, setNationality] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Sync when dialog opens and fetch latest profile from database
  useEffect(() => {
    if (!isOpen) return;

    setName(user.name ?? "");
    setEmail(user.email ?? "");
    setMessage("");
    setError("");

    let active = true;
    setFetching(true);

    fetch("/api/account/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data?.profile) return;
        const p = data.profile;
        if (p.name) setName(p.name);
        if (p.email) setEmail(p.email);
        if (p.mobile) setMobile(p.mobile);
        if (p.nationality) setNationality(p.nationality);
        if (p.address) setAddress(p.address);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setFetching(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, user.name, user.email]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          mobile: mobile.trim(),
          nationality: nationality.trim(),
          address: address.trim(),
        }),
      });

      const body = await response.json();
      setLoading(false);

      if (!response.ok) {
        setError(body.error ?? "Unable to update profile. Please try again.");
        return;
      }

      // Update parent session / router
      onProfileUpdated?.({ name: name.trim() });
      router.refresh();
      setMessage("Profile updated successfully.");
    } catch {
      setLoading(false);
      setError("Network error while saving profile. Please check your connection.");
    }
  }

  const initials = (name || email || "G")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="My Profile"
      description="Manage your guest details, verified contacts, and stay preferences."
      size="md"
      headerVariant="branded"
      portal={true}
      returnFocusRef={returnFocusRef as RefObject<HTMLElement>}
      className="customer-profile-dialog"
    >
      <div className="cpm-body">
        {/* Hero Identity Banner */}
        <div className="cpm-hero-card">
          <div className="cpm-avatar" aria-hidden="true">
            <span>{initials}</span>
            <div className="cpm-avatar-badge" title="Verified Guest">
              <Check size={11} strokeWidth={3} />
            </div>
          </div>
          <div className="cpm-hero-info">
            <h3 className="cpm-hero-name">{name || "Haven Guest"}</h3>
            <p className="cpm-hero-email">{email || "Guest account"}</p>
            <span className="cpm-hero-tag">Verified Guest</span>
          </div>
        </div>

        {/* Status Alerts */}
        {message && (
          <div className="cpm-alert cpm-alert-success" role="status">
            <CheckCircle2 size={16} />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="cpm-alert cpm-alert-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Profile Edit Form */}
        <form className="cpm-form" onSubmit={handleSubmit}>
          <div className="cpm-grid">
            <div className="cpm-field">
              <label htmlFor="cpm-name">
                <UserRound size={13} aria-hidden="true" />
                Full Name
              </label>
              <div className="cpm-input-wrap">
                <UserRound size={15} className="cpm-input-icon" aria-hidden="true" />
                <input
                  id="cpm-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full legal name"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </div>
              <span className="cpm-hint">As printed on your passport or ID.</span>
            </div>

            <div className="cpm-field">
              <label htmlFor="cpm-email">
                <Mail size={13} aria-hidden="true" />
                Email Address
              </label>
              <div className="cpm-input-wrap">
                <Mail size={15} className="cpm-input-icon" aria-hidden="true" />
                <input
                  id="cpm-email"
                  name="email"
                  value={email}
                  disabled
                  aria-readonly="true"
                />
              </div>
              <span className="cpm-hint">Primary booking &amp; account contact.</span>
            </div>

            <div className="cpm-field">
              <label htmlFor="cpm-mobile">
                <Phone size={13} aria-hidden="true" />
                Mobile Number
              </label>
              <div className="cpm-input-wrap">
                <Phone size={15} className="cpm-input-icon" aria-hidden="true" />
                <input
                  id="cpm-mobile"
                  name="mobile"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+63 900 000 0000"
                  maxLength={30}
                  autoComplete="tel"
                />
              </div>
              <span className="cpm-hint">For urgent arrival coordination &amp; SMS.</span>
            </div>

            <div className="cpm-field">
              <label htmlFor="cpm-nationality">
                <Globe size={13} aria-hidden="true" />
                Nationality
              </label>
              <div className="cpm-input-wrap">
                <Globe size={15} className="cpm-input-icon" aria-hidden="true" />
                <input
                  id="cpm-nationality"
                  name="nationality"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="e.g. Filipino, American, etc."
                  maxLength={80}
                />
              </div>
              <span className="cpm-hint">Required for local hotel registry records.</span>
            </div>

            <div className="cpm-field cpm-wide">
              <label htmlFor="cpm-address">
                <MapPin size={13} aria-hidden="true" />
                Home / Billing Address
              </label>
              <div className="cpm-input-wrap">
                <MapPin size={15} className="cpm-input-icon" aria-hidden="true" />
                <textarea
                  id="cpm-address"
                  name="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Province, Country"
                  maxLength={300}
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="cpm-footer">
            <div>
              {onOpenSecurity && (
                <button
                  type="button"
                  className="cpm-btn cpm-btn-security"
                  onClick={() => {
                    onClose();
                    onOpenSecurity();
                  }}
                  title="Open password & sound settings"
                >
                  <Shield size={14} aria-hidden="true" />
                  Account Security
                </button>
              )}
            </div>

            <div className="cpm-footer-right">
              <button
                type="button"
                className="cpm-btn cpm-btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Close
              </button>
              <button
                type="submit"
                className="cpm-btn cpm-btn-primary"
                disabled={loading || fetching}
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} aria-hidden="true" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
