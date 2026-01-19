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
  engagement_id?: number;
  prospect_id?: number;
  candidate_id?: number;
  contract_id?: number;
  job_id?: number;
  facility_id?: number;
  
  // Personal Info
  full_name?: string;
  email?: string;
  phone?: string;
  
  // Specialty & Location
  primary_specialty?: string;
  engagement_specialty?: string;
  home_state?: string;
  facility_name?: string;
  location_city?: string;
  location_state?: string;
  
  // Metadata
  licenses?: string[];
  recruiter?: string;
  submitted_at?: string;
  days_since_submitted?: number;
  stage?: string;
  raw_status?: string;
  tab?: TabId;
  source_type?: SourceType;
  is_active_submittal?: boolean;
  is_weekly_priority?: boolean;
  other_engagements_count?: number;
  engagement_notes?: string;
  nova_url?: string;
  available_start_date?: string;
  
  // Contract Info (for retention/extension candidates)
  current_contract_start_date?: string;  // ← FIXED: Match SQL field name
  current_contract_end_date?: string;    // ← FIXED: Match SQL field name
  
  // Account Team
  am_name?: string;
  ac_name?: string;
  extension_stage?: string;
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

/**
 * Bridge type for modal components expecting Prospect shape
 * Eliminates need for 'as any' casts
 */
export type ProspectLike = {
  id: number;
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
  engagement_id: number;
  prospect_id: number;
  candidate_id: number;
  tab: TabId;
  source_type: SourceType;
  is_active_submittal: boolean;
}>;

/**
 * Convert ClinicianRow to ProspectLike for modal consumption
 */
export function toProspectLike(row: ClinicianRow): ProspectLike {
  return {
    id: row.prospect_id ?? row.engagement_id ?? row.candidate_id ?? 0,
    full_name: row.full_name ?? 'Unknown',
    email: row.email ?? null,
    phone: row.phone ?? null,
    primary_specialty: row.primary_specialty ?? row.engagement_specialty ?? null,
    facility_name: row.facility_name ?? null,
    location_city: row.location_city ?? null,
    location_state: row.location_state ?? null,
    nova_url: row.nova_url ?? null,
    engagement_id: row.engagement_id,
    prospect_id: row.prospect_id,
    candidate_id: row.candidate_id,
    tab: row.tab,
    source_type: row.source_type,
    is_active_submittal: row.is_active_submittal,
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