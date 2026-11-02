/**
 * Selector helpers for stable element selection
 */

// Navigation selectors
export const navSelectors = {
  sidebar: "nav[data-testid='sidebar'], nav.sidebar, aside[role='navigation']",
  navItem: (label: string) => `nav >> text=${label}`,
  navGroup: (groupId: string) => `[data-nav-group="${groupId}"]`,
  userMenu: "[data-testid='user-menu'], button[aria-label*='user'], button[aria-label*='account'], .user-avatar, .profile-button",
  signOut: "text=Sign out, text=Sign Out, [data-testid='sign-out'], button:has-text('Sign out')",
};

// Dashboard selectors
export const dashboardSelectors = {
  container: "[data-testid='dashboard'], main.dashboard, .dashboard-container",
  metricCard: (metric: string) => `[data-metric="${metric}"], .metric-card:has-text("${metric}")`,
  widget: (widgetName: string) => `[data-widget="${widgetName}"], .widget:has-text("${widgetName}")`,
};

// Action button selectors
export const actionSelectors = {
  checkIn: "button:has-text('Check In'), button:has-text('Check in'), [data-action='check-in']",
  checkOut: "button:has-text('Check Out'), button:has-text('Check out'), [data-action='check-out']",
  roomChange: "button:has-text('Room Change'), button:has-text('Change Room'), [data-action='room-change']",
  extendStay: "button:has-text('Extend'), button:has-text('Extend Stay'), [data-action='extend']",
  collectPayment: "button:has-text('Collect Payment'), button:has-text('Collect'), [data-action='collect-payment']",
  verifyDeposit: "button:has-text('Verify'), button:has-text('Verify Deposit'), [data-action='verify-deposit']",
  processRefund: "button:has-text('Process Refund'), button:has-text('Refund'), [data-action='process-refund']",
  reconcile: "button:has-text('Reconcile'), [data-action='reconcile']",
  generateReport: "button:has-text('Generate Report'), button:has-text('Generate'), [data-action='generate-report']",
  operateTransportation: "button:has-text('Transport'), button:has-text('Schedule'), [data-action='transportation']",
  proposeRate: "button:has-text('Propose Rate'), button:has-text('Propose'), [data-action='propose-rate']",
  reviewApprovals: "button:has-text('Review'), button:has-text('Approve'), [data-action='review-approvals']",
  manageCatalog: "button:has-text('Manage'), button:has-text('Catalog'), [data-action='manage-catalog']",
  performHousekeeping: "button:has-text('Clean'), button:has-text('Inspect'), [data-action='housekeeping']",
  requestManagerApproval: "button:has-text('Request Approval'), button:has-text('Request'), [data-action='request-approval']",
  adjustFolio: "button:has-text('Adjust'), [data-action='adjust-folio']",
  acceptOverpayment: "button:has-text('Accept Overpayment'), [data-action='accept-overpayment']",
  reconcileFinancials: "button:has-text('Reconcile Financials'), [data-action='reconcile-financials']",
  issueDocument: "button:has-text('Issue Document'), button:has-text('Issue'), [data-action='issue-document']",
  operateCashShift: "button:has-text('Cash Shift'), button:has-text('Open Shift'), button:has-text('Close Shift'), [data-action='cash-shift']",
};

// Table selectors
export const tableSelectors = {
  container: "[data-testid='data-table'], table.data-table, .data-table",
  row: "tbody tr, [data-row]",
  cell: (column: string) => `[data-column="${column}"], td:has-text("${column}")`,
  actionButton: (action: string) => `button:has-text("${action}"), [data-action="${action}"]`,
};

// Modal selectors
export const modalSelectors = {
  container: "[role='dialog'], .modal, [data-testid='modal']",
  title: "[role='dialog'] h2, [role='dialog'] h3, .modal-title",
  confirmButton: "button:has-text('Confirm'), button:has-text('Yes'), button:has-text('OK'), [data-testid='confirm']",
  cancelButton: "button:has-text('Cancel'), button:has-text('No'), [data-testid='cancel']",
  closeButton: "button[aria-label='Close'], .modal-close, [data-testid='close']",
};

// Form selectors
export const formSelectors = {
  input: (name: string) => `input[name="${name}"], [data-testid="input-${name}"]`,
  select: (name: string) => `select[name="${name}"], [data-testid="select-${name}"]`,
  textarea: (name: string) => `textarea[name="${name}"], [data-testid="textarea-${name}"]`,
  submit: "button[type='submit'], button:has-text('Save'), button:has-text('Submit')",
};

// Notification selectors
export const notificationSelectors = {
  bell: "[data-testid='notification-bell'], button[aria-label*='notification'], .notification-bell",
  badge: "[data-testid='notification-badge'], .notification-badge, .badge",
  dropdown: "[data-testid='notification-dropdown'], .notification-dropdown, [role='menu']",
  item: "[data-testid='notification-item'], .notification-item",
};

// Guest portal selectors
export const guestPortalSelectors = {
  accountLink: "/account",
  myReservationsLink: "/my-reservations",
  bookingLink: "/booking/search",
  loyaltyLink: "/account/loyalty",
  conciergeButton: "[data-testid='concierge-button'], button:has-text('Ask HAVEN'), .concierge-float",
};

// Page URL helpers
export const pageUrls = {
  managerDashboard: '/manager_dashboard',
  login: '/login',
  register: '/register',
  guestAccount: '/account',
  guestReservations: '/my-reservations',
  guestBooking: '/booking/search',
  section: (section: string) => `/manager_dashboard?section=${section}`,
};