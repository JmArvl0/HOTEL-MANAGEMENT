"use client";

import { useEffect, useRef, useState, forwardRef } from "react";
import { ChevronRight, Settings, Volume2, VolumeX, LogOut } from "lucide-react";

interface ProfilePopoverAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  isCheckbox?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  submenu?: ProfilePopoverAction[];
}

interface ProfilePopoverProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    avatarUrl?: string;
    avatarInitials?: string;
  };
  roleLabel?: string;
  actions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';
    isCheckbox?: boolean;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    submenu?: ProfilePopoverAction[];
  }>;
  soundEnabled?: boolean;
  onSoundToggle?: (enabled: boolean) => void;
  onSignOut: () => void | Promise<void>;
  onSettings?: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  variant?: 'customer' | 'staff';
  className?: string;
  avatar?: React.ReactNode;
  footer?: React.ReactNode;
}

const ProfilePopover = forwardRef<HTMLDivElement, ProfilePopoverProps>(({
  user,
  roleLabel,
  actions = [],
  soundEnabled,
  onSoundToggle,
  onSignOut,
  onSettings,
  triggerRef,
  open,
  onClose,
  variant = 'staff',
  className = "",
  avatar,
  footer,
}, forwardedRef) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState<string | null>(null);

  // Focus management
  useEffect(() => {
    if (open && popoverRef.current) {
      const focusable = popoverRef.current.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled):not([hidden]), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        (focusable[0] as HTMLElement).focus();
      }
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const menuItems = 'button:is([role="menuitem"], [role="menuitemcheckbox"]):not(:disabled):not([hidden])';
      const selector = isSubmenuOpen
        ? `${menuItems}[data-submenu="${isSubmenuOpen}"]`
        : `${menuItems}:not([data-submenu])`;
      
      const items = popoverRef.current?.querySelectorAll<HTMLButtonElement>(selector);
      if (!items?.length) return;
      
      const currentIndex = Array.from(items).findIndex(el => el === document.activeElement);
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % items.length;
          (items[nextIndex] as HTMLElement).focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          (items[prevIndex] as HTMLElement).focus();
          break;
        case 'ArrowRight':
          if (isSubmenuOpen) return;
          e.preventDefault();
          const currentItem = items[currentIndex];
          if (currentItem?.dataset.submenu) {
            setIsSubmenuOpen(currentItem.dataset.submenu);
          }
          break;
        case 'ArrowLeft':
          if (!isSubmenuOpen) return;
          e.preventDefault();
          setIsSubmenuOpen(null);
          break;
        case 'Escape':
          if (isSubmenuOpen) {
            e.preventDefault();
            setIsSubmenuOpen(null);
          } else {
            e.preventDefault();
            triggerRef.current?.focus();
            onClose();
          }
          break;
        case 'Home':
          e.preventDefault();
          (items[0] as HTMLElement).focus();
          break;
        case 'End':
          e.preventDefault();
          (items[items.length - 1] as HTMLElement).focus();
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmenuOpen]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const popover = popoverRef.current;
      const trigger = triggerRef.current;
      if (popover && !popover.contains(e.target as Node) && 
          trigger && !trigger.contains(e.target as Node)) {
        triggerRef.current?.focus();
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, triggerRef, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const popover = popoverRef.current;
      if (!popover) return;
      
      const focusable = popover.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([hidden]), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        (last as HTMLElement).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        (first as HTMLElement).focus();
      }
    };
    
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  const initials = user?.avatarInitials || (user?.name ?? user?.email ?? "U").slice(0, 2).toUpperCase();

  // Collect all actions
  const allActions: ProfilePopoverAction[] = [
    ...(onSettings ? [{ label: "Settings", icon: <Settings size={16} />, onClick: () => { onSettings(); } }] : []),
    ...actions.map(a => ({ ...a, onClick: a.onClick ?? (() => {}) })),
    ...(typeof soundEnabled === 'boolean' && onSoundToggle ? [{
      label: soundEnabled ? "Sound On" : "Sound Off",
      icon: soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />,
      isCheckbox: true,
      checked: soundEnabled,
      onChange: onSoundToggle,
      onClick: () => {},
    }] : []),
    {
      label: "Sign Out",
      icon: <LogOut size={16} />,
      variant: 'danger' as const,
      onClick: () => { onSignOut(); },
    },
  ];

  return (
    <div
      ref={(el) => {
        if (forwardedRef) {
          if (typeof forwardedRef === 'function') forwardedRef(el);
          else if (forwardedRef) forwardedRef.current = el;
        }
      }}
      className={`profile-popover-wrapper ${className}`}
    >
      {/* Arrow */}
      <div className="profile-popover-arrow" aria-hidden="true" />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        className={`profile-popover ${variant === 'customer' ? 'variant-customer' : 'variant-staff'} ${className}`}
        role="menu"
        aria-label="Account menu"
      >
        {/* Header */}
        <div className="profile-popover-header">
          <div className="profile-popover-avatar" aria-hidden="true">
            {avatar || (user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="profile-avatar-image" />
            ) : (
              <span className="profile-avatar-mark">{user?.avatarInitials || initials}</span>
            ))}
          </div>
          <div className="profile-popover-info">
            <p className="profile-popover-name">{user?.name ?? "User"}</p>
            {user?.email && <p className="profile-popover-email">{user.email}</p>}
            {roleLabel && <p className="profile-popover-role">{roleLabel}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="profile-popover-list">
          {allActions.map((action) => (
            action.submenu ? (
              <div key={action.label} className="profile-popover-submenu-wrapper">
                <button
                  type="button"
                  role="menuitem"
                  className="profile-popover-item has-submenu"
                  onClick={() => setIsSubmenuOpen(action.label)}
                  data-submenu={action.label}
                  aria-haspopup="true"
                  aria-expanded={isSubmenuOpen === action.label}
                >
                  <span className="profile-popover-item-icon" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="profile-popover-item-label">{action.label}</span>
                  <ChevronRight size={14} className="profile-popover-item-chevron" />
                </button>
                {isSubmenuOpen === action.label && (
                  <div className="profile-popover-submenu" role="menu" aria-label={`${action.label} submenu`}>
                    {action.submenu?.map((subAction: ProfilePopoverAction) => (
                      <button
                        key={subAction.label}
                        type="button"
                        role={subAction.isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
                        aria-checked={subAction.checked}
                        className={`profile-popover-item profile-popover-submenu-item${subAction.variant === 'danger' ? ' profile-popover-item--danger' : ''}`}
                        onClick={() => {
                          if (subAction.isCheckbox) { subAction.onChange?.(!subAction.checked); return; }
                          subAction.onClick?.();
                          setIsSubmenuOpen(null);
                          onClose?.();
                        }}
                        data-submenu={action.label}
                      >
                        <span className="profile-popover-item-icon" aria-hidden="true">
                          {subAction.icon}
                        </span>
                        <span className="profile-popover-item-label">{subAction.label}</span>
                      </button>
                    ))}
                    <div className="profile-popover-submenu-backdrop" onClick={() => setIsSubmenuOpen(null)} />
                  </div>
                )}
              </div>
            ) : (
              <button
                key={action.label}
                type="button"
                role={action.isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={action.checked}
                className={`profile-popover-item${action.variant === 'danger' ? ' profile-popover-item--danger' : ''}`}
                onClick={() => {
                  if (action.isCheckbox) { action.onChange?.(!action.checked); return; }
                  action.onClick?.();
                  onClose();
                }}
              >
                <span className="profile-popover-item-icon" aria-hidden="true">
                  {action.icon}
                </span>
                <span className="profile-popover-item-label">{action.label}</span>
              </button>
        )))}
      </div>

        {/* Footer */}
        {footer && (
          <div className="profile-popover-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
});

ProfilePopover.displayName = "ProfilePopover";

export { ProfilePopover };
export type { ProfilePopoverProps, ProfilePopoverAction };