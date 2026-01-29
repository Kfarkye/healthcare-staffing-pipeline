/**
 * ============================================================================
 * src/types/submittals.ts
 * Type definitions for submittals dashboard
 * Re-exports ClinicianRow from hook to ensure type consistency
 * ============================================================================
 */

// Import types from hook (single source of truth)
import type { ClinicianRow, Stage, PrimaryState, AgingBucket, EndBucket, TabId, SourceType } from '../hooks/useClinicianDashboard';

// Re-export for consumers
export type { ClinicianRow, Stage, PrimaryState, AgingBucket, EndBucket, TabId, SourceType };


/**
 * Ready sub-tab views
 */
export type ReadySubTab = 'ALL' | 'PRIORITY';

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