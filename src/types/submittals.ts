/**
 * ============================================================================
 * src/types/submittals.ts
 * Type definitions for submittals dashboard
 * ============================================================================
 */

/**
 * Base candidate interface from submittals_dashboard view
 * FIXED: Correct field names to match SQL view
 */
export interface ClinicianRow {
  // IDs
  candidate_id: string | number;
  prospect_id: string | number | null;
  engagement_id: string | number | null;
  job_id: string | number | null;
  facility_id: string | number | null;
  contract_id?: string | number | null;

  // Personal Info
  full_name: string | null;
  email: string | null;
  phone: string | null;
  nova_url: string | null;

  // Professional Info
  primary_specialty: string | null;
  engagement_specialty?: string | null;
  home_state: string | null;
  licenses: string[] | null;
  recruiter: string | null;
  available_start_date: string | null;
  profile_complete?: boolean | null;
  references_verified?: number | null;
  rto_notes?: string | null;

  // Engagement/Assignment Details
  facility_name: string | null;
  location_city: string | null;
  location_state: string | null;
  raw_status: string | null;
  stage?: string | null;
  tab?: TabId | null;
  is_current?: boolean | null;
  submitted_at: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_end_date: string | null;
  bill_rate: number | null;
  actual_margin: number | null;
  engagement_notes: string | null;
  seeking_new?: boolean | null;
  am_name: string | null;
  ac_name: string | null;
  extension_stage: string | null;
  is_active_submittal: boolean | null;
  is_weekly_priority: boolean | null;

  // Derived/Aggregated
  primary_state?: string;
  aging_bucket?: string | null;
  days_since_submitted: number | null;
  days_to_end?: number | null;
  end_bucket?: string | null;
  other_engagements_count?: number;
  stage_rank?: number | null;
  source_type: SourceType | null;
  updated_at: string | null;
}

/**
 * Priority candidate from prospects table
 */
export interface PriorityCandidate {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  primary_specialty: string | null;
  source_type: string | null;
  status: string;
  nova_url: string | null;
  updated_at?: string;
}

export type ProspectLike = {
  id: string | number;
  full_name: string;
  email: string | null;
  phone: string | null;
  primary_specialty: string | null;
  facility_name?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  status?: string;
  nova_url?: string | null;
} & Partial<{
  engagement_id: string | number;
  prospect_id: string | number;
  candidate_id: string | number;
  tab: TabId;
  source_type: SourceType;
  is_active_submittal: boolean;
}>;

/**
 * Convert ClinicianRow to ProspectLike for modal consumption
 */
export function toProspectLike(row: ClinicianRow): ProspectLike {
  return {
    id: row.prospect_id ?? row.engagement_id ?? row.candidate_id ?? '0',
    full_name: row.full_name ?? 'Unknown',
    email: row.email ?? null,
    phone: row.phone ?? null,
    primary_specialty: row.primary_specialty ?? row.engagement_specialty ?? null,
    facility_name: row.facility_name ?? null,
    location_city: row.location_city ?? null,
    location_state: row.location_state ?? null,
    nova_url: row.nova_url ?? null,
    engagement_id: row.engagement_id as any,
    prospect_id: row.prospect_id as any,
    candidate_id: row.candidate_id as any,
    tab: (row.tab as any) || undefined,
    source_type: (row.source_type as any) || undefined,
    is_active_submittal: row.is_active_submittal as any,
  };
}

/**
 * Tab identifiers
 */
export type TabId = 'KANBAN' | 'READY' | 'SUBMITTED' | 'OFFER' | 'PRESTART';

/**
 * Ready sub-tab views
 */
export type ReadySubTab = 'ALL' | 'PRIORITY';

/**
 * Source type for candidate origin
 */
export type SourceType =
  | 'Prospect'
  | 'NEW_PROSPECT'
  | 'PROSPECT'
  | 'Retention'
  | 'ACTIVE_LOOKING'
  | 'Extension'
  | 'EXTENSION'
  | 'TRANSITIONING'
  | 'EXTENSION_REQUEST'
  | 'EXTENSION_SIGNED';

/**
 * Tab definition for UI rendering
 */
export interface TabDefinition {
  id: TabId;
  label: string;
  description: string;
}

/**
 * Toast notification types
 */
export interface ToastNotification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

/**
 * Standardized card key generator
 * Eliminates inconsistent key patterns across components
 */
export function getCardKey(row: ClinicianRow, fallbackIndex: number): string {
  return (
    row.engagement_id?.toString() ??
    row.prospect_id?.toString() ??
    row.candidate_id?.toString() ??
    `unknown-${fallbackIndex}`
  );
}