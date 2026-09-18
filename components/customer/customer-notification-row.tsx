"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notificationIcon, relativeTime } from "@/lib/notifications";

export interface CustomerNotificationItem {
  id: string;
  title: string;
  detail?: string | null;
  createdAt: string;
  href?: string | null;
  readAt?: string | null;
  type?: string | null;
}

// One rendering of a customer notification, shared by the bell dropdown and
// the All-notifications modal so both surfaces can never disagree on content.
export function CustomerNotificationRow({
  item,
  onOpen,
}: {
  item: CustomerNotificationItem;
  onOpen?: (item: CustomerNotificationItem) => void;
}) {
  const unread = !item.readAt;
  const Icon = notificationIcon(item.type);
  const body = (
    <>
      <span className="cnr-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="cnr-copy">
        <span className="cnr-title">
          {item.title}
          {unread && <i className="cnr-dot" role="img" aria-label="Unread" />}
        </span>
        {item.detail && <span className="cnr-detail">{item.detail}</span>}
        <span className="cnr-meta">
          <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
        </span>
      </span>
      {item.href && <ChevronRight size={15} aria-hidden="true" className="cnr-chevron" />}
    </>
  );
  const className = `cnr${unread ? " is-unread" : ""}${item.href ? " is-actionable" : ""}`;
  if (item.href) {
    return (
      <Link className={className} href={item.href} onClick={() => onOpen?.(item)}>
        {body}
      </Link>
    );
  }
  if (onOpen) {
    return (
      <button type="button" className={className} onClick={() => onOpen(item)}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
