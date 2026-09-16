"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { HavenSelect } from "@/components/ui/haven-select";
import {
  NOTIFICATION_HOTEL_TIME_ZONE,
  filterNotificationsByHotelDay,
  hotelDayKey,
  hotelTodayKey,
  resolveNotificationDay,
  splitUnreadRead,
} from "@/lib/notifications";

export interface NotificationHistoryItem {
  id: string;
  title: string;
  detail?: string | null;
  createdAt: string;
  href?: string | null;
  readAt?: string | null;
}

interface NotificationHistoryModalProps {
  open: boolean;
  onClose: () => void;
  items: readonly NotificationHistoryItem[];
  loading?: boolean;
  /** Fired when the reader opens an item (parent marks it read, then navigates/switches module and closes). */
  onOpenItem?: (item: NotificationHistoryItem) => void;
  /** Date-scoped bulk read ("Mark this day as read" sends the visible day's unread ids). */
  onMarkDayRead?: (dayKey: string, ids: string[]) => void;
  returnFocusRef?: React.RefObject<HTMLElement>;
  /** Test seam: override today's hotel-day key (defaults to the live Manila day). */
  todayKey?: string;
}

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: NOTIFICATION_HOTEL_TIME_ZONE,
});

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : timeFmt.format(date);
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: NOTIFICATION_HOTEL_TIME_ZONE,
  });
}

export function NotificationHistoryModal({
  open,
  onClose,
  items,
  loading,
  onOpenItem,
  onMarkDayRead,
  returnFocusRef,
  todayKey: todayKeyProp,
}: NotificationHistoryModalProps) {
  const todayKey = useMemo(() => todayKeyProp ?? hotelTodayKey(), [todayKeyProp]);
  const [daySel, setDaySel] = useState<"today" | "yesterday" | "specific">("today");
  const [specific, setSpecific] = useState("");

  const dayKey = daySel === "specific" ? resolveNotificationDay(specific || todayKey, todayKey) : resolveNotificationDay(daySel, todayKey);
  const dayItems = useMemo(() => filterNotificationsByHotelDay(items, dayKey), [items, dayKey]);
  const { unread, read } = useMemo(() => splitUnreadRead(dayItems), [dayItems]);

  // Keep the specific-date input bounded to real hotel days already loaded.
  const loadedDays = useMemo(() => {
    const days = new Set<string>();
    for (const item of items) {
      const key = hotelDayKey(item.createdAt);
      if (key) days.add(key);
    }
    return [...days].sort().reverse();
  }, [items]);

  const dayOptions = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    ...loadedDays
      .filter((day) => day !== todayKey && day !== resolveNotificationDay("yesterday", todayKey))
      .slice(0, 7)
      .map((day) => ({ value: day, label: formatDayLabel(day) })),
    { value: "specific", label: "Specific date…" },
  ];

  const renderItem = (item: NotificationHistoryItem, isUnread: boolean) => (
    <li key={item.id} className={`nh-item${isUnread ? " is-unread" : ""}`}>
      <span className="nh-icon" aria-hidden="true">
        {isUnread ? <Bell size={16} /> : <Check size={16} />}
      </span>
      <div className="nh-copy">
        <p className="nh-title">
          {isUnread && (
            <i className="nh-dot" aria-label="Unread" role="img" />
          )}
          {item.title}
        </p>
        {item.detail && <p className="nh-detail">{item.detail}</p>}
        <p className="nh-meta">
          {item.createdAt && <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>}
        </p>
      </div>
      {(item.href || onOpenItem) && (
        item.href ? (
          <Link
            className="nh-view"
            href={item.href}
            onClick={() => onOpenItem?.(item)}
          >
            View
          </Link>
        ) : (
          <button type="button" className="nh-view" onClick={() => onOpenItem?.(item)}>
            View
          </button>
        )
      )}
    </li>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Notifications"
      description="Review your notification history."
      size="xl"
      headerVariant="branded"
      className="nh-modal"
      returnFocusRef={returnFocusRef}
    >
      <div className="nh-filters">
        <HavenSelect
          value={daySel === "specific" && specific && dayOptions.some((o) => o.value === specific) ? specific : daySel}
          onChange={(value) => {
            if (value === "today" || value === "yesterday" || value === "specific") setDaySel(value);
            else {
              setSpecific(value);
              setDaySel("specific");
            }
          }}
          ariaLabel="Filter notifications by day"
          leadingIcon={<CalendarDays size={16} aria-hidden="true" />}
          options={dayOptions}
        />
        {daySel === "specific" && (
          <input
            type="date"
            className="nh-date"
            aria-label="Choose a specific date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(specific) ? specific : ""}
            max={todayKey}
            onChange={(event) => setSpecific(event.target.value)}
          />
        )}
        {onMarkDayRead && (
          <button
            type="button"
            className="nh-mark"
            disabled={loading || unread.length === 0}
            onClick={() => onMarkDayRead(dayKey, unread.map((item) => item.id))}
          >
            Mark this day as read
          </button>
        )}
      </div>
      <p className="nh-showing">Showing notifications from {formatDayLabel(dayKey)}</p>
      {loading ? (
        <p className="nh-empty" role="status">Loading notifications…</p>
      ) : dayItems.length === 0 ? (
        <p className="nh-empty">No notifications for this day.</p>
      ) : (
        <>
          <section aria-label="Unread notifications">
            <h3 className="nh-section">
              Unread <span className="nh-count">{unread.length}</span>
            </h3>
            {unread.length === 0 ? (
              <p className="nh-empty">No unread notifications.</p>
            ) : (
              <ul className="nh-list">{unread.map((item) => renderItem(item, true))}</ul>
            )}
          </section>
          <section aria-label="Read notifications">
            <h3 className="nh-section">
              Read <span className="nh-count">{read.length}</span>
            </h3>
            {read.length === 0 ? (
              <p className="nh-empty">No read notifications yet.</p>
            ) : (
              <ul className="nh-list">{read.map((item) => renderItem(item, false))}</ul>
            )}
          </section>
        </>
      )}
    </Modal>
  );
}
