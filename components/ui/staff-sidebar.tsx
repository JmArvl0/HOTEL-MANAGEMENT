"use client";

import { useEffect, useState } from "react";
import { Activity, BedDouble, Building2, CalendarDays, CarTaxiFront, ClipboardCheck, FileText, Globe, HeartPulse, Home, KeyRound, Layers, Lock, Mail, MapPin, PanelLeftClose, Pencil, Percent, Receipt, Shield, ShieldCheck, Users, Wrench } from "lucide-react";
import { SidebarCore } from "@/components/ui/sidebar-core";
import Link from "next/link";

export interface StaffSidebarProps {
  section: string;
  onSelect: (section: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  brandMark: React.ReactNode;
  user?: { name?: string | null; role?: string };
}

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: <Activity size={18} />, group: "workspace" },
  { key: "users", label: "Users & Staff", icon: <Users size={18} />, group: "accounts" },
  { key: "roles", label: "Roles & Permissions", icon: <ShieldCheck size={18} />, group: "accounts" },
  { key: "rooms", label: "Room Configuration", icon: <Building2 size={18} />, group: "configuration" },
  { key: "room_types", label: "Room Types", icon: <BedDouble size={18} />, group: "configuration" },
  { key: "transport_services", label: "Transfer Vehicles", icon: <CarTaxiFront size={18} />, group: "configuration" },
  { key: "policy", label: "Hotel Policies", icon: <FileText size={18} />, group: "configuration" },
  { key: "audit", label: "Audit Logs", icon: <FileText size={18} />, group: "governance" },
  { key: "security", label: "Security Events", icon: <Shield size={18} />, group: "governance" },
  { key: "security_config", label: "Security Configuration", icon: <ShieldCheck size={18} />, group: "governance" },
  { key: "password_resets", label: "Password Reset Audit", icon: <KeyRound size={18} />, group: "governance" },
  { key: "reports", label: "Admin Reports", icon: <ClipboardCheck size={18} />, group: "governance" },
  { key: "system", label: "System Health", icon: <HeartPulse size={18} />, group: "governance" },
];

const GROUPS = [
  { id: "workspace", label: "Workspace", sections: ["overview"] },
  { id: "accounts", label: "Accounts", sections: ["users", "roles"] },
  { id: "configuration", label: "Configuration", sections: ["rooms", "room_types", "transport_services", "policy"] },
  { id: "governance", label: "Governance", sections: ["audit", "security", "security_config", "password_resets", "reports", "system"] },
];

export function StaffSidebar({ section, onSelect, collapsed, onToggleCollapse, brandMark, user }: StaffSidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("haven-admin-sidebar-groups") ?? "{}");
      if (saved && typeof saved === "object") setOpenGroups(saved);
    } catch {}
  }, []);
  
  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [id]: !(prev[id] ?? false) };
      localStorage.setItem("haven-admin-sidebar-groups", JSON.stringify(next));
      return next;
    });
  };
  
  const items = GROUPS.flatMap(group => {
    const open = openGroups[group.id] ?? false;
    const groupItems = NAV_ITEMS.filter(item => group.sections.includes(item.key));
    const isActive = group.sections.includes(section);
    const groupOpen = open || isActive;
    
    return [
      <button
        key={`group-${group.id}`}
        className={`nav-group-header ${open || NAV_ITEMS.some(i => group.sections.includes(i.key) && i.key === section) ? "open" : ""}`}
        aria-expanded={open || NAV_ITEMS.some(i => group.sections.includes(i.key) && i.key === section)}
        aria-controls={`nav-group-${group.id}`}
        onClick={() => toggleGroup(group.id)}
      >
        <span className="nav-group-label">{group.label}</span>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nav-group-chevron" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>,
      ...groupItems.map(item => ({
        key: item.key,
        label: item.label,
        icon: item.icon,
        active: item.key === section,
        onClick: () => onSelect(item.key),
      })),
    ];
  });
  
  const brand = {
    mark: <span className="brand-mark">{brandMark}</span>,
    copy: <Link href="/" className="brand-copy" aria-label="Hotel homepage">HAVEN<small>SYSTEM ADMINISTRATION</small></Link>,
  };
  
  return (
    <SidebarCore
      items={NAV_ITEMS.filter(item => GROUPS.flatMap(g => g.sections).includes(item.key))}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      brand={brand}
      footer={<div className="app-sidebar-bottom"><PropertyPill title="HAVEN Hotel & Residences" /></div>}
    />
  );
}

function PropertyPill({ title }: { title: string }) {
  return (
    <div className="property-pill" title={title}>
      <span>HV</span>
      <div className="property-copy"><b>HAVEN</b><small>HOTEL & RESIDENCES</small></div>
    </div>
  );
}