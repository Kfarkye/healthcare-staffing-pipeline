// ============================================================================
// /src/shared/types/database.ts
// SINGLE SOURCE OF TRUTH FOR ALL PROSPECT TYPES
// ============================================================================

import { BaseRecord } from './index';

// ============================================================================
// STATUS TYPES
// All possible status values used across the application
// ============================================================================

export type ProspectStatus =
    | 'New'
    | 'Contacted'
    | 'Responded'
    | 'Interested'
    | 'Not Interested'
    | 'Submitted'
    | 'Submittal Ready'
    | 'Final Updates'
    | 'Profile Updates'
    | 'Hired'
    | 'Stalled';

// Status groupings for different views
export const KANBAN_STATUSES = ['New', 'Contacted', 'Interested', 'Profile Updates', 'Submittal Ready', 'Submitted'] as const;
export const ARCHIVE_STATUSES = ['Not Interested', 'Hired'] as const;
export const EXIT_STATUSES = ['Stalled', 'Final Updates'] as const;

export type KanbanStatus = typeof KANBAN_STATUSES[number];
export type ArchiveStatus = typeof ARCHIVE_STATUSES[number];
export type ExitStatus = typeof EXIT_STATUSES[number];

// ============================================================================
// CLICK TYPE (for priority_interested_clicks table)
// ============================================================================

export interface Click extends BaseRecord {
    id: number;
    application_id: number;
    application_date: string;
    job_id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_homestate: string;
    job_city: string;
    job_state: string;
    profession: string;
    specialty: string;
    recruiter_name: string;
    recruiter_email: string;
    last_note: string;
    last_note_date: string | null;
    last_note_by: string | null;
    status: string;
    recruiter_contacted_recently: boolean;
    days_since_application: number;
    // Optional fields from enrichment
    pay_range?: string;
    facility_name?: string;
    shift_type?: string;
    start_date?: string;
    end_date?: string;
}

// ============================================================================
// PROSPECT TYPE
// Unified type for the prospects table - covers all use cases
// ============================================================================

export interface Prospect extends BaseRecord {
    // Core identification
    id: number;
    candidate_id?: number | null;           // Optional - may not exist for manually added

    // Basic contact info
    name: string;
    email: string | null;
    phone: string | null;

    // Professional info
    specialty: string | null;
    profession: string | null;

    // Status & workflow
    status: ProspectStatus;
    order?: number;                         // For kanban ordering
    followup_stage?: string | null;

    // Location & licensing
    home_state?: string | null;
    licenses?: string[] | null;

    // Assignment details
    notes: string | null;
    rto_notes?: string | null;
    recruiter?: string | null;
    recruiter_id?: string | null;
    source?: string | null;
    priority?: string | null;

    // Profile completeness tracking
    references_verified?: number;
    profile_complete?: boolean;
    profile_update_notes?: string | null;

    // Dates
    available_start_date?: string | null;
    last_contacted_at?: string | null;
    last_response_at?: string | null;
    next_follow_up_date?: string | null;
    reassignment_requested_at?: string | null;

    // Nova/external integration
    nova_url?: string | null;

    // Job/facility association
    facility?: string | null;
    job_id?: string | null;

    // Template/extraction data
    template_file_path?: string | null;
    template_extracted_data?: any | null;
    template_uploaded_at?: string | null;

    // Exits dashboard fields
    exit_bucket?: 'Stalled' | 'Break' | 'Perm' | null;
    soft_deleted?: boolean;
    soft_deleted_at?: string | null;

    // Specialty ranking fields
    specialty_rank?: number | null;
    shift_preference?: string | null;
    last_placement?: string | null;
    contract_end_date?: string | null;
    pool_notes?: string | null;
    facility_tags?: string[] | null;
    has_worked_before?: boolean;

    // Extended metadata
    metadata?: Record<string, any> | null;

    // Diamond verification (Aya-specific)
    is_diamond_verified?: boolean;

    // Client-side calculated fields (not in DB)
    profile_score?: number;
}

// ============================================================================
// CANDIDATE NOTES
// ============================================================================

export interface CandidateNote extends BaseRecord {
    id: string;
    prospect_id: number;
    author_id?: string | null;
    note_type?: string | null;
    content: string;
    created_at: string;
    updated_at?: string | null;
}

// ============================================================================
// PAY PACKAGE TYPE
// ============================================================================

export interface PayPackage extends BaseRecord {
    id: number;
    job_id: string;
    facility_name: string | null;
    city: string | null;
    state: string | null;
    start_date: string | null;
    end_date: string | null;
    shift_type: string | null;
    hours_per_week: number | null;
    completion_bonus: number | null;
    taxable_hourly_rate: number | null;
    stipend: number | null;
    gross_weekly_pay: number | null;
    meals_weekly?: number | null;
    housing_weekly?: number | null;
    total_stipend?: number | null;
    specialty?: string | null;
    source?: string;
}

// ============================================================================
// TOAST & UI TYPES
// ============================================================================

export interface Toast {
    message: string;
    type: 'success' | 'error' | 'info';
}

export type ModalType = 'add' | 'edit' | 'detail' | 'email' | 'batch_reference' | 'batch_reassignment' | null;

// ============================================================================
// COLUMN DEFINITION (for Kanban views)
// ============================================================================

export interface ColumnDefinition {
    id: KanbanStatus;
    label: string;
    color: string;
    description: string;
}
