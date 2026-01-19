// ============================================================================
// /src/shared/types/database.ts
// ============================================================================

import { BaseRecord } from './index';

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
}

export interface Prospect extends BaseRecord {
    id: number;
    candidate_id: number;
    name: string;
    email: string | null;
    phone: string | null;
    specialty: string | null;
    recruiter: string | null;
    notes: string | null;
    status: 'New' | 'Contacted' | 'Interested' | 'Not Interested' | 'Submitted' | 'Submittal Ready' | 'Hired';
    facility?: string | null;
    job_id?: string | null;
    profession?: string | null;
    template_file_path?: string | null;
    template_extracted_data?: any | null;
    template_uploaded_at?: string | null;
}

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
}