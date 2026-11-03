// Type-safe wrapper for selectors-map.json with template functions
import selectorsJson from './selectors-map.json' with { type: 'json' };

const raw = selectorsJson as RawSelectors;

// Helper to interpolate template strings
function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] || `{${key}}`);
}

export const selectors = {
  navigation: {
    sidebar: raw.navigation.sidebar,
    navItem: (label: string) => interpolate(raw.navigation.navItem, { label }),
    navGroup: (groupId: string) => interpolate(raw.navigation.navGroup, { groupId }),
    userMenu: raw.navigation.userMenu,
    signOut: raw.navigation.signOut,
  },
  dashboard: {
    container: raw.dashboard.container,
    metricCard: (metric: string) => interpolate(raw.dashboard.metricCard, { metric }),
    widget: (widgetName: string) => interpolate(raw.dashboard.widget, { widgetName }),
  },
  pages: raw.pages,
  actions: raw.actions,
  tables: {
    container: raw.tables.container,
    row: raw.tables.row,
    cell: (column: string) => interpolate(raw.tables.cell, { column }),
    actionButton: (action: string) => interpolate(raw.tables.actionButton, { action }),
  },
  modals: raw.modals,
  forms: {
    input: (name: string) => interpolate(raw.forms.input, { name }),
    select: (name: string) => interpolate(raw.forms.select, { name }),
    textarea: (name: string) => interpolate(raw.forms.textarea, { name }),
    submit: raw.forms.submit,
  },
  notifications: raw.notifications,
  guestPortal: raw.guestPortal,
} as const;

interface RawSelectors {
  navigation: {
    sidebar: string;
    navItem: string;
    navGroup: string;
    userMenu: string;
    signOut: string;
  };
  dashboard: {
    container: string;
    metricCard: string;
    widget: string;
  };
  pages: Record<string, string>;
  actions: Record<string, string>;
  tables: {
    container: string;
    row: string;
    cell: string;
    actionButton: string;
  };
  modals: {
    container: string;
    title: string;
    confirmButton: string;
    cancelButton: string;
    closeButton: string;
  };
  forms: {
    input: string;
    select: string;
    textarea: string;
    submit: string;
  };
  notifications: {
    bell: string;
    badge: string;
    dropdown: string;
    item: string;
  };
  guestPortal: {
    accountLink: string;
    myReservationsLink: string;
    bookingLink: string;
    loyaltyLink: string;
    conciergeButton: string;
  };
}