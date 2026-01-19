// ============================================================================
// ENUMS - String literal unions matching Postgres ENUM types
// ============================================================================

export const JOB_STATUS = ['Open', 'On Hold', 'Filled', 'Cancelled'] as const;
export type JobStatus = typeof JOB_STATUS[number];

export const SPECIALTY = ['RN', 'LPN', 'CNA', 'Tech', 'Therapist'] as const;
export type Specialty = typeof SPECIALTY[number];

export const SHIFT_TYPE = ['Days', 'Nights', 'Rotating', 'Evenings'] as const;
export type ShiftType = typeof SHIFT_TYPE[number];

export const ENGAGEMENT_STATUS = ['Offered', 'Accepted', 'Active', 'Completed', 'Cancelled'] as const;
export type EngagementStatus = typeof ENGAGEMENT_STATUS[number];

export const EXIT_REASON = [
  'Personal Reasons',
  'Contract Completed',
  'Facility Decision',
  'Performance Issue',
  'Rate Negotiation',
  'Scheduling Conflict',
  'Better Offer',
  'Relocation',
  'Other'
] as const;
export type ExitReason = typeof EXIT_REASON[number];

export const EXIT_TYPE = ['Voluntary', 'Involuntary'] as const;
export type ExitType = typeof EXIT_TYPE[number];

// ============================================================================
// TABLE TYPES - Matching Supabase schema
// ============================================================================

export interface Facility {
  id: number;
  name: string;
  city: string;
  state: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  facility_id: number;
  status: JobStatus;
  specialty: Specialty;
  shift: ShiftType;
  hours_per_week: number;
  start_date: string; // YYYY-MM-DD
  duration_weeks: number;
  created_at: string;
  updated_at: string;
}

export interface Engagement {
  id: number;
  prospect_id: number;
  job_id: number;
  status: EngagementStatus;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface Exit {
  id: number;
  prospect_id: number;
  engagement_id: number | null;
  exit_type: ExitType;
  exit_reason: ExitReason;
  exit_date: string; // YYYY-MM-DD
  eligible_for_rehire: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// EXTENDED TYPES - With joined relations for display
// ============================================================================

export interface JobWithFacility extends Job {
  facility?: Pick<Facility, 'name' | 'city' | 'state'>;
}

export interface EngagementWithRelations extends Engagement {
  prospect?: { name: string };
  job?: JobWithFacility;
}

export interface ExitWithRelations extends Exit {
  prospect?: { name: string };
  engagement?: { start_date: string; end_date: string };
}

// ============================================================================
// FORM INPUT TYPES - For create/update operations
// ============================================================================

export type FacilityInput = Omit<Facility, 'id' | 'created_at' | 'updated_at'>;

export type JobInput = Omit<Job, 'id' | 'created_at' | 'updated_at'>;

export type EngagementInput = Omit<Engagement, 'id' | 'created_at' | 'updated_at'>;

export type ExitInput = Omit<Exit, 'id' | 'created_at' | 'updated_at'>;
