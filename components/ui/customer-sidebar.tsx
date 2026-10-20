"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CarTaxiFront, CircleHelp, Compass, Home, LogOut, ReceiptText, Settings, UserRound } from "lucide-react";
import { SidebarCore } from "@/components/ui/sidebar-core";
import Link from "next/link";

export interface CustomerSidebarProps {
  pathname: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobile: boolean;
  onToggleMobile: () => void;
  brandMark: React.ReactNode;
  user?: { name?: string | null; email?: string | null };
}

const NAV = [
  { href: "/account", label: "Overview", icon: <Home size={18} />, exact: true },
  { href: "/account/find-room", label: "Find a Room", icon: <Compass size={18} /> },
  { href: "/my-reservations", label: "My Reservations", icon: <CalendarDays size={18} /> },
  { href: "/account/transportation", label: "Transportation", icon: <CarTaxiFront size={18} /> },
  { href: "/account/payments", label: "Payments & Folio", icon: <ReceiptText size={18} /> },
  { href: "/account/requests", label: "Guest Requests", icon: <Settings size={18} /> },
  { href: "/account/loyalty", label: "HAVEN Rewards", icon: <UserRound size={18} /> },
];

const HELP = { href: "/account/help", label: "Help & Support", icon: <CircleHelp size={18} /> };

function isCustomerNavActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname.startsWith(href + "/") || pathname === href;
}

export function CustomerSidebar({ pathname, collapsed, onToggleCollapse, mobile, onToggleMobile, brandMark, user }: CustomerSidebarProps) {
  const [helpActive, setHelpActive] = useState(false);
  
  const items = [
    ...NAV.map(item => ({
      key: item.href,
      label: item.label,
      icon: item.icon,
      active: pathname === item.href || pathname.startsWith(item.href + "/"),
      onClick: () => {},
    })),
    {
      key: "/account/help",
      label: "Help & Support",
      icon: <CircleHelp size={18} />,
      active: false,
      onClick: () => {},
    },
  ];
  
const brand = {
    mark: <span className="brand-mark">{brandMark}</span>,
    copy: <Link href="/" className="customer-brand-copy">HAVEN<small>HOTEL & RESIDENCES</small></Link>,
  };
  
  const footer = (
    <Link
      href="/account/help"
      className="customer-bottom-link"
      title={collapsed ? "Help & Support" : undefined}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span>Help & Support</span>
    </Link>
  );
  
  return (
    <SidebarCore
      items={[
        { key: "/account", label: "Overview", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> },
        { key: "/account/find-room", label: "Find a Room", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> },
        { key: "/my-reservations", label: "My Reservations", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
        { key: "/account/transportation", label: "Transportation", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-6l1-8z" /></svg> },
        { key: "/account/payments", label: "Payments & Folio", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
        { key: "/account/requests", label: "Guest Requests", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg> },
        { key: "/account/loyalty", label: "HAVEN Rewards", icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="17 11 19 13 22 10" /></svg> },
      ]}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      brand={{
        mark: <span className="brand-mark">{brandMark}</span>,
        copy: <Link href="/" className="customer-brand-copy">HAVEN<small>HOTEL & RESIDENCES</small></Link>,
      }}
      footer={<Link href="/account/help" className="customer-bottom-link" title={collapsed ? "Help & Support" : undefined}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg><span>Help & Support</span></Link>}
    />
  );
}