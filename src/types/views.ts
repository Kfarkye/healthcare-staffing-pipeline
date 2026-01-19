// ============================================================================
// View Configuration Types
// ============================================================================

export type ViewId =
  | "prospects"
  | "active"
  | "exits"
  | "submittals"
  | "offers"
  | "priority"
  | "follow-ups"
  | "rankings"
  | "travel"
  | "local"
  | "admin";

export type ViewCategory = "Pipelines" | "Dashboards / Calendars" | "Jobs & Interest" | "Admin";

export interface ViewConfig {
  id: ViewId;
  label: string;
  description: string;
  category: ViewCategory;
  component: React.ComponentType;
}

export const CATEGORIES: ViewCategory[] = [
  "Pipelines",
  "Dashboards / Calendars",
  "Jobs & Interest",
  "Admin",
];export type Category =
  | 'Pipelines'
  | 'Dashboards / Calendars'
  | 'Jobs & Interest'
  | 'Admin';
