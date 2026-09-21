"use client";

import Link from "next/link";
import { forwardRef, useMemo, useState, type RefObject } from "react";
import { Bell, CalendarDays, ChevronRight, List, type LucideIcon } from "lucide-react";
import { HavenSelect } from "@/components/ui/haven-select";
import { Modal } from "@/components/ui/Modal";
import {
  BELL_PREVIEW_LIMIT,
  NOTIFICATION_HOTEL_TIME_ZONE,
  NOTIFICATION_TYPE_ICONS,
  RECENCY_GROUP_LABELS,
  filterNotificationsByHotelDay,
  groupNotificationsByRecency,
  hotelDayKey,
  hotelTodayKey,
  previewNotifications,
  relativeTime,
  resolveNotificationDay,
  splitUnreadRead,
} from "@/lib/notifications";

export interface HavenNotification {
  id: string;
  title: string;
  detail?: string | null;
  createdAt: string;
  href?: string | null;
  readAt?: string | null;
  type?: string | null;
  reference?: string | null;
}

export type HavenNotificationDensity = "customer" | "internal";

const clockFmt = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: NOTIFICATION_HOTEL_TIME_ZONE,
});

function formatClock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : clockFmt.format(date);
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

function createdTime(value: unknown): number {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

interface HavenNotificationBellProps {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  buttonRef?: RefObject<HTMLButtonElement>;
  className?: string;
  badgeClassName?: string;
}

export const HavenNotificationBell = forwardRef<HTMLButtonElement, HavenNotificationBellProps>(function HavenNotificationBell({
  count,
  expanded,
  onToggle,
  buttonRef,
  className = "",
  badgeClassName = "",
}, forwardedRef) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <button
      ref={buttonRef ?? forwardedRef}
      type="button"
      className={`haven-notification-bell ${className}`.trim()}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      title="Notifications"
      onClick={onToggle}
    >
      <Bell size={18} aria-hidden="true" />
      {count > 0 && (
        <i className={`haven-notification-badge ${badgeClassName}`.trim()} aria-hidden="true">
          {count > 99 ? "99+" : count}
        </i>
      )}
    </button>
  );
});

export function HavenNotificationItem({
  item,
  onOpen,
  variant = "relative",
  density = "customer",
}: {
  item: HavenNotification;
  onOpen?: (item: HavenNotification) => void;
  variant?: "relative" | "clock";
  density?: HavenNotificationDensity;
}) {
  const unread = !item.readAt;
  const Icon: LucideIcon = item.type && item.type in NOTIFICATION_TYPE_ICONS
    ? NOTIFICATION_TYPE_ICONS[item.type as keyof typeof NOTIFICATION_TYPE_ICONS]
    : Bell;
  const body = (
    <>
      <span className="cnr-icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="cnr-copy">
        <span className="cnr-title">
          {item.title}
          {unread && <i className="cnr-dot" role="img" aria-label="Unread" />}
        </span>
        {item.detail && <span className="cnr-detail">{item.detail}</span>}
        <span className="cnr-meta">
          {item.reference && <span className="cnr-reference">{item.reference}</span>}
          <time dateTime={item.createdAt}>
            {variant === "clock" ? formatClock(item.createdAt) : relativeTime(item.createdAt)}
          </time>
        </span>
      </span>
      {(item.href || onOpen) && <ChevronRight size={15} aria-hidden="true" className="cnr-chevron" />}
    </>
  );
  const className = `cnr density-${density}${unread ? " is-unread" : ""}${item.href || onOpen ? " is-actionable" : ""}`;
  if (item.href) {
    return <Link className={className} href={item.href} onClick={() => onOpen?.(item)}>{body}</Link>;
  }
  if (onOpen) {
    return <button type="button" className={className} onClick={() => onOpen(item)}>{body}</button>;
  }
  return <div className={className}>{body}</div>;
}

export function HavenNotificationPopover({
  items,
  unreadCount,
  loading = false,
  error = false,
  density = "customer",
  onOpenItem,
  onMarkAllRead,
  onViewAll,
  onRetry,
}: {
  items: readonly HavenNotification[];
  unreadCount: number;
  loading?: boolean;
  error?: boolean;
  density?: HavenNotificationDensity;
  onOpenItem?: (item: HavenNotification) => void;
  onMarkAllRead?: () => void;
  onViewAll: () => void;
  onRetry?: () => void;
}) {
  const preview = previewNotifications(items, BELL_PREVIEW_LIMIT);
  const { unread, read } = splitUnreadRead(preview);
  return (
    <div className={`haven-notification-popover density-${density}`} role="dialog" aria-label="Recent notifications">
      <div className="haven-notification-popover-head">
        <div>
          <strong>Notifications</strong>
          <small>{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</small>
        </div>
        {unreadCount > 0 && onMarkAllRead && (
          <button type="button" className="haven-notification-mark-all" onClick={onMarkAllRead}>Mark all as read</button>
        )}
      </div>
      <div className="haven-notification-preview">
        {loading && !items.length ? (
          <div role="status" aria-label="Loading notifications">
            {Array.from({ length: 3 }, (_, index) => <div className="customer-notif-skeleton" key={index} aria-hidden="true"><i /><div /></div>)}
          </div>
        ) : error && !items.length ? (
          <div className="customer-notifications-empty" role="alert">
            <Bell size={22} aria-hidden="true" />
            <p>We couldn&apos;t load your notifications.</p>
            {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
          </div>
        ) : !preview.length ? (
          <div className="customer-notifications-empty">
            <Bell size={22} aria-hidden="true" />
            <p>You&apos;re all caught up</p>
            <small>No new notifications right now.</small>
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <section className="customer-notif-group" aria-label="Unread notifications">
                <p className="customer-notif-group-label">Unread <span>{unreadCount}</span></p>
                <div className="customer-notif-rows">{unread.map((item) => <HavenNotificationItem key={item.id} item={item} density={density} onOpen={onOpenItem} />)}</div>
              </section>
            )}
            {read.length > 0 && (
              <section className="customer-notif-group" aria-label="Earlier notifications">
                <p className="customer-notif-group-label">Earlier <span>{read.length}</span></p>
                <div className="customer-notif-rows">{read.map((item) => <HavenNotificationItem key={item.id} item={item} density={density} onOpen={onOpenItem} />)}</div>
              </section>
            )}
          </>
        )}
      </div>
      <button type="button" className="haven-notification-view-all" onClick={onViewAll}>
        <List size={16} aria-hidden="true" />
        <span>View all notifications</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

type HistoryTab = "all" | "unread" | "read";

export function HavenNotificationModal({
  open,
  onClose,
  items,
  loading = false,
  density = "customer",
  onOpenItem,
  onMarkAllRead,
  onMarkRead,
  onMarkDayRead,
  onLoadMore,
  hasMore = false,
  returnFocusRef,
  todayKey: todayKeyProp,
}: {
  open: boolean;
  onClose: () => void;
  items: readonly HavenNotification[];
  loading?: boolean;
  density?: HavenNotificationDensity;
  onOpenItem?: (item: HavenNotification) => void;
  onMarkAllRead?: (ids: string[]) => void;
  onMarkRead?: (ids: string[]) => void;
  onMarkDayRead?: (dayKey: string, ids: string[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  returnFocusRef?: RefObject<HTMLElement>;
  todayKey?: string;
}) {
  const todayKey = useMemo(() => todayKeyProp ?? hotelTodayKey(), [todayKeyProp]);
  const [tab, setTab] = useState<HistoryTab>("all");
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  const [daySel, setDaySel] = useState<"all" | "today" | "yesterday" | "specific">("all");
  const [specific, setSpecific] = useState("");
  const unreadTotal = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const readTotal = items.length - unreadTotal;
  const dayKey = daySel === "specific" ? resolveNotificationDay(specific || todayKey, todayKey) : daySel === "all" ? "" : resolveNotificationDay(daySel, todayKey);
  const dayItems = useMemo(() => dayKey ? filterNotificationsByHotelDay(items, dayKey) : items, [items, dayKey]);
  const tabItems = useMemo(() => {
    const filtered = tab === "unread" ? dayItems.filter((item) => !item.readAt) : tab === "read" ? dayItems.filter((item) => Boolean(item.readAt)) : dayItems;
    return [...filtered].sort((a, b) => {
      const delta = createdTime(b.createdAt) - createdTime(a.createdAt);
      return sortDir === "newest" ? delta : -delta;
    });
  }, [dayItems, tab, sortDir]);
  const loadedDays = useMemo(() => [...new Set(items.map((item) => hotelDayKey(item.createdAt)).filter(Boolean))].sort().reverse(), [items]);
  const dayOptions = [
    { value: "all", label: "All dates" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    ...loadedDays.filter((day) => day !== todayKey && day !== resolveNotificationDay("yesterday", todayKey)).slice(0, 7).map((day) => ({ value: day, label: formatDayLabel(day) })),
    { value: "specific", label: "Custom date…" },
  ];
  const recencyGroups = useMemo(() => dayKey ? [] : groupNotificationsByRecency(tabItems, todayKey), [tabItems, dayKey, todayKey]);
  const visibleUnread = useMemo(() => tabItems.filter((item) => !item.readAt), [tabItems]);
  const renderRow = (item: HavenNotification) => <HavenNotificationItem key={item.id} item={item} variant="clock" density={density} onOpen={onOpenItem} />;
  const emptyCopy = dayKey
    ? tab === "unread" ? "No unread notifications for this date." : tab === "read" ? "No read notifications for this date." : "No notifications for this date."
    : tab === "unread" ? "You're all caught up." : tab === "read" ? "No read notifications yet." : "No notifications yet.";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="All notifications"
      description={density === "customer" ? "Stay updated with important information about your reservations, payments, and stay." : "Review the complete set of operational alerts currently available to your role."}
      size="xl"
      headerVariant="branded"
      className={`nh-modal haven-notification-modal density-${density}`}
      returnFocusRef={returnFocusRef}
      portal
    >
      <div className="nh-filters">
        <div className="nh-tabs" role="group" aria-label="Filter notifications">
          {(["all", "unread", "read"] as const).map((value) => (
            <button key={value} type="button" className={`nh-tab${tab === value ? " is-active" : ""}`} aria-pressed={tab === value} onClick={() => setTab(value)}>
              {value === "all" ? "All" : value === "unread" ? "Unread" : "Read"}
              <span>{value === "all" ? items.length : value === "unread" ? unreadTotal : readTotal}</span>
            </button>
          ))}
        </div>
        <HavenSelect
          value={daySel === "specific" && specific && dayOptions.some((option) => option.value === specific) ? specific : daySel}
          onChange={(value) => {
            if (["all", "today", "yesterday", "specific"].includes(value)) setDaySel(value as typeof daySel);
            else { setSpecific(value); setDaySel("specific"); }
          }}
          ariaLabel="Filter notifications by date"
          leadingIcon={<CalendarDays size={16} aria-hidden="true" />}
          options={dayOptions}
        />
        {daySel === "specific" && <input type="date" className="nh-date" aria-label="Choose a custom date" value={/^\d{4}-\d{2}-\d{2}$/.test(specific) ? specific : ""} max={todayKey} onChange={(event) => setSpecific(event.target.value)} />}
        <HavenSelect value={sortDir} onChange={(value) => setSortDir(value === "oldest" ? "oldest" : "newest")} ariaLabel="Sort notifications" className="nh-sort" options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
        {(onMarkAllRead || onMarkRead || onMarkDayRead) && unreadTotal > 0 && <button type="button" className="nh-mark" disabled={loading || visibleUnread.length === 0} onClick={() => { const ids = visibleUnread.map((item) => item.id); if (onMarkAllRead) onMarkAllRead(ids); else if (onMarkRead) onMarkRead(ids); else onMarkDayRead?.(dayKey || todayKey, ids); }}>Mark visible as read</button>}
      </div>
      <div className="nh-body" aria-busy={loading || undefined}>
        {loading && !items.length ? (
          <><p className="nh-empty" role="status">Loading notifications…</p>{Array.from({ length: 4 }, (_, index) => <div className="nh-skeleton" key={index} aria-hidden="true"><i /><div /></div>)}</>
        ) : !tabItems.length ? (
          <div className="nh-empty-state"><Bell size={26} aria-hidden="true" /><strong>{emptyCopy}</strong>{tab === "unread" && <span>No action is needed right now.</span>}</div>
        ) : dayKey ? (
          <><p className="nh-showing">Showing notifications from {formatDayLabel(dayKey)}</p><div className="nh-list">{tabItems.map(renderRow)}</div></>
        ) : (
          <>{recencyGroups.map((group) => <section key={group.key} aria-label={RECENCY_GROUP_LABELS[group.key]} className="nh-recency"><h3 className="nh-section">{RECENCY_GROUP_LABELS[group.key]}</h3><div className="nh-list">{group.items.map(renderRow)}</div></section>)}</>
        )}
        {!loading && tabItems.length > 0 && <div className="nh-footer"><p>{hasMore ? `Showing the most recent ${tabItems.length} notifications` : `Showing all ${tabItems.length} notifications`}</p>{onLoadMore && hasMore && <button type="button" className="nh-more" onClick={onLoadMore}>Load more</button>}</div>}
      </div>
    </Modal>
  );
}
