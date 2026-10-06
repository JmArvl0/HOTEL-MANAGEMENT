"use client";

import React, { useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  CircleDollarSign,
  Users,
  Search,
  Filter,
  Download,
  Plus,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
  MoreVertical,
  ExternalLink,
} from "lucide-react";
import {
  ComponentCard,
  StatCard,
  TailAdminPageHeader,
  TailAdminButton,
  TailAdminBadge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TailAdminInput,
  TailAdminSelect,
  TailAdminTabs,
  TailAdminAlert,
  TailAdminEmptyState,
  TailAdminSkeleton,
  TailAdminPagination,
} from "@/components/ui/tailadmin-haven";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const sampleChartData = [
  { day: "Mon", booked: 72, occupancy: 68 },
  { day: "Tue", booked: 78, occupancy: 74 },
  { day: "Wed", booked: 85, occupancy: 82 },
  { day: "Thu", booked: 80, occupancy: 79 },
  { day: "Fri", booked: 92, occupancy: 90 },
  { day: "Sat", booked: 98, occupancy: 95 },
  { day: "Sun", booked: 88, occupancy: 86 },
];

const sampleReservations = [
  {
    id: "RSV-2026-001",
    guest: "Alexander Wright",
    room: "Suite 401",
    type: "Deluxe King",
    checkIn: "2026-10-06",
    checkOut: "2026-10-10",
    total: "₱32,000",
    status: "confirmed",
    badgeColor: "success" as const,
  },
  {
    id: "RSV-2026-002",
    guest: "Maria Santos",
    room: "Room 205",
    type: "Executive Suite",
    checkIn: "2026-10-06",
    checkOut: "2026-10-08",
    total: "₱18,500",
    status: "checked_in",
    badgeColor: "primary" as const,
  },
  {
    id: "RSV-2026-003",
    guest: "David Chen",
    room: "Room 108",
    type: "Superior Twin",
    checkIn: "2026-10-07",
    checkOut: "2026-10-12",
    total: "₱24,000",
    status: "pending",
    badgeColor: "warning" as const,
  },
  {
    id: "RSV-2026-004",
    guest: "Elena Rostova",
    room: "Suite 502",
    type: "Presidential Suite",
    checkIn: "2026-10-08",
    checkOut: "2026-10-15",
    total: "₱85,000",
    status: "confirmed",
    badgeColor: "success" as const,
  },
  {
    id: "RSV-2026-005",
    guest: "John Doe",
    room: "Room 312",
    type: "Deluxe King",
    checkIn: "2026-10-05",
    checkOut: "2026-10-06",
    total: "₱8,000",
    status: "cancelled",
    badgeColor: "error" as const,
  },
];

export default function HavenTailAdminVisualTemplate() {
  const [activeTab, setActiveTab] = useState("overview");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showAlert, setShowAlert] = useState(true);

  const tabs = [
    { id: "overview", label: "Overview & Analytics" },
    { id: "tables", label: "Data Tables & Filters", count: 5 },
    { id: "forms", label: "Form Elements & Controls" },
    { id: "ui-elements", label: "UI Components & Badges" },
  ];

  return (
    <div className="space-y-6">
      {/* 1. TailAdmin Standard Page Header with Breadcrumbs */}
      <TailAdminPageHeader
        pageTitle="HAVEN SaaS Visual Template"
        subtitle="Complete TailAdmin Next.js design system standardization for HAVEN Hotel Management System"
        eyebrow="DESIGN SYSTEM SPECIFICATION"
        breadcrumbs={[
          { label: "Dashboard", href: "/manager_dashboard" },
          { label: "Design System", href: "#" },
          { label: "TailAdmin Standard" },
        ]}
        actions={
          <div className="flex items-center gap-3">
            <TailAdminButton
              variant="secondary"
              startIcon={<Download size={15} />}
              onClick={() => alert("Exporting design tokens...")}
            >
              Export Tokens
            </TailAdminButton>
            <TailAdminButton
              variant="primary"
              startIcon={<Plus size={15} />}
              onClick={() => alert("Creating new component...")}
            >
              Add Component
            </TailAdminButton>
          </div>
        }
      />

      {/* 2. Interactive Navigation Tabs */}
      <TailAdminTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Alert Banner Demonstration */}
      {showAlert && (
        <TailAdminAlert
          variant="info"
          title="TailAdmin Design System Active"
          message="All 14 modules are standardized on this design language: consistent rounded-2xl cards, tabular figures, 70px app header, 280px sidebar, and accessible color tokens."
          onClose={() => setShowAlert(false)}
        />
      )}

      {/* TAB 1: OVERVIEW & ANALYTICS */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* TailAdmin Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard
              title="Today's Occupancy"
              value="86.4%"
              hint="42 of 48 rooms occupied"
              icon={<BedDouble size={22} />}
              tone="brand"
              trend={{ value: "+4.2%", isPositive: true }}
            />
            <StatCard
              title="Daily Revenue"
              value="₱184,500"
              hint="Gross revenue collections today"
              icon={<CircleDollarSign size={22} />}
              tone="success"
              trend={{ value: "+12.8%", isPositive: true }}
            />
            <StatCard
              title="In-House Guests"
              value="68"
              hint="Expected departures today: 14"
              icon={<Users size={22} />}
              tone="warning"
              trend={{ value: "-2.1%", isPositive: false }}
            />
            <StatCard
              title="Pending Verification"
              value="3"
              hint="Deposit proofs waiting for Accounting"
              icon={<Clock size={22} />}
              tone="danger"
              badge={<TailAdminBadge color="warning" pulse>3 Actionable</TailAdminBadge>}
            />
          </div>

          {/* Charts & Operational Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ComponentCard
                title="7-Day Booked Occupancy Trend"
                subtitle="Authoritative night-covering stay forecast across room categories"
                action={
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-blue-600" /> Booked
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-gray-400" /> Physical
                    </span>
                  </div>
                }
              >
                <div className="h-72 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sampleChartData}>
                      <defs>
                        <linearGradient id="bookedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "12px",
                          color: "#fff",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="booked"
                        stroke="#1d4ed8"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#bookedGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ComponentCard>
            </div>

            <div className="lg:col-span-1">
              <ComponentCard
                title="Hotel Operations Posture"
                subtitle="Real-time room & front office readiness"
              >
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center font-bold text-xs">
                        CL
                      </div>
                      <div>
                        <b className="text-sm font-semibold text-gray-900 dark:text-white block">
                          Clean & Ready
                        </b>
                        <small className="text-xs text-gray-500">Available for walk-in</small>
                      </div>
                    </div>
                    <span className="text-base font-bold text-gray-900 dark:text-white tabular-nums">
                      34
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center font-bold text-xs">
                        DT
                      </div>
                      <div>
                        <b className="text-sm font-semibold text-gray-900 dark:text-white block">
                          Turnover In Progress
                        </b>
                        <small className="text-xs text-gray-500">Housekeeping queue</small>
                      </div>
                    </div>
                    <span className="text-base font-bold text-gray-900 dark:text-white tabular-nums">
                      8
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center font-bold text-xs">
                        MN
                      </div>
                      <div>
                        <b className="text-sm font-semibold text-gray-900 dark:text-white block">
                          Maintenance Hold
                        </b>
                        <small className="text-xs text-gray-500">Service order diagnosis</small>
                      </div>
                    </div>
                    <span className="text-base font-bold text-gray-900 dark:text-white tabular-nums">
                      2
                    </span>
                  </div>
                </div>
              </ComponentCard>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATA TABLES & FILTERS */}
      {activeTab === "tables" && (
        <div className="space-y-6">
          <ComponentCard
            title="Standardized SaaS Table Grammar"
            subtitle="Flat border-collapse structure, uppercase tracking headers, tabular figures, and status badges"
            action={
              <div className="flex items-center gap-3">
                <TailAdminInput
                  placeholder="Search reservations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  startIcon={<Search size={15} />}
                  className="w-64 !mb-0"
                />
                <TailAdminSelect
                  value={selectedStatus}
                  onChange={setSelectedStatus}
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "confirmed", label: "Confirmed" },
                    { value: "checked_in", label: "Checked In" },
                    { value: "pending", label: "Pending" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                  className="w-40 !mb-0"
                />
              </div>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Guest Name</TableHead>
                  <TableHead>Room & Type</TableHead>
                  <TableHead>Stay Dates</TableHead>
                  <TableHead align="right">Folio Total</TableHead>
                  <TableHead align="center">Status</TableHead>
                  <TableHead align="right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleReservations.map((res) => (
                  <TableRow key={res.id} onClick={() => alert(`View ${res.id}`)}>
                    <TableCell>
                      <b className="font-semibold text-blue-600 dark:text-blue-400">
                        {res.id}
                      </b>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {res.guest}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="block font-medium text-gray-800 dark:text-gray-200">
                          {res.room}
                        </span>
                        <small className="text-xs text-gray-400">{res.type}</small>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {res.checkIn} → {res.checkOut}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <b className="font-bold text-gray-900 dark:text-white tabular-nums">
                        {res.total}
                      </b>
                    </TableCell>
                    <TableCell align="center">
                      <TailAdminBadge color={res.badgeColor}>
                        {res.status.replace("_", " ").toUpperCase()}
                      </TailAdminBadge>
                    </TableCell>
                    <TableCell align="right">
                      <button
                        type="button"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          alert(`Options for ${res.id}`);
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <TailAdminPagination
              currentPage={page}
              totalPages={3}
              totalItems={15}
              pageSize={5}
              onPageChange={setPage}
            />
          </ComponentCard>
        </div>
      )}

      {/* TAB 3: FORM ELEMENTS & CONTROLS */}
      {activeTab === "forms" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ComponentCard
            title="Input Fields & Select Controls"
            subtitle="TailAdmin form controls with HAVEN blue focus ring"
          >
            <div className="space-y-4 pt-2">
              <TailAdminInput
                label="Guest Full Name"
                placeholder="e.g. Maria Clara"
                required
                hint="As printed on government-issued ID"
              />
              <TailAdminInput
                label="Email Address"
                type="email"
                placeholder="guest@haven.test"
                required
              />
              <TailAdminSelect
                label="Room Category"
                value="deluxe"
                onChange={() => {}}
                options={[
                  { value: "deluxe", label: "Deluxe King (₱6,400/night)" },
                  { value: "exec", label: "Executive Suite (₱9,800/night)" },
                  { value: "pres", label: "Presidential Suite (₱18,000/night)" },
                ]}
              />
              <div className="pt-2 flex justify-end gap-3">
                <TailAdminButton variant="secondary">Cancel</TailAdminButton>
                <TailAdminButton variant="primary">Save Changes</TailAdminButton>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard
            title="Empty & Loading States"
            subtitle="Consistent feedback and transition animations"
          >
            <div className="space-y-6 pt-2">
              <TailAdminEmptyState
                icon={<BedDouble size={24} />}
                title="No Stays Found"
                description="No reservations matched the search filter. Clear your query or create a walk-in booking."
                action={
                  <TailAdminButton size="sm" variant="primary">
                    Create Reservation
                  </TailAdminButton>
                }
              />
            </div>
          </ComponentCard>
        </div>
      )}

      {/* TAB 4: UI ELEMENTS & BADGES */}
      {activeTab === "ui-elements" && (
        <div className="space-y-6">
          <ComponentCard
            title="Status Badges & Variants"
            subtitle="Curated 10%-tint soft badges with high contrast readability"
          >
            <div className="flex flex-wrap gap-3 items-center pt-2">
              <TailAdminBadge color="primary">Confirmed</TailAdminBadge>
              <TailAdminBadge color="success">Paid & Clean</TailAdminBadge>
              <TailAdminBadge color="warning" pulse>Pending Review</TailAdminBadge>
              <TailAdminBadge color="error">Blocked / Out of Order</TailAdminBadge>
              <TailAdminBadge color="info">In Progress</TailAdminBadge>
              <TailAdminBadge color="neutral">Archived</TailAdminBadge>
            </div>
          </ComponentCard>

          <ComponentCard
            title="Buttons & Actions"
            subtitle="Purpose-driven button hierarchy: Primary Blue, Outline Neutral, Red Destructive"
          >
            <div className="flex flex-wrap gap-4 items-center pt-2">
              <TailAdminButton variant="primary">Primary Action</TailAdminButton>
              <TailAdminButton variant="secondary">Secondary Action</TailAdminButton>
              <TailAdminButton variant="danger">Destructive Action</TailAdminButton>
              <TailAdminButton variant="ghost">Ghost Button</TailAdminButton>
              <TailAdminButton variant="primary" size="sm">Small</TailAdminButton>
              <TailAdminButton variant="primary" size="lg">Large CTA</TailAdminButton>
              <TailAdminButton variant="primary" loading>Loading...</TailAdminButton>
            </div>
          </ComponentCard>
        </div>
      )}
    </div>
  );
}
