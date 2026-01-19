// ============================================================================
// src/types/email.ts
// Centralized type re-exports for email modal system.
// Prevents circular dependencies and provides single source of truth.
// ============================================================================

// Re-export existing types instead of duplicating
export type { TabId, ClinicianRow } from './submittals';
export type { Prospect } from '../shared/types/database';

// AssignmentEmailModal types
export type TemplateType =
  | 'outreach'
  | 'interested'
  | 'extension_request'
  | 'margin_approval'
  | 'reimbursement'
  | 'benefits'
  | '401k';

export interface Contract {
  id?: number;
  candidate_name?: string | null;
  candidate_email?: string | null;
  email?: string | null;
  facility_name?: string | null;
  specialty?: string | null;
  end_date?: string | null;
  status?: 'Active' | 'Closed' | 'Offered' | string;
  actual_margin?: number | null;
  extension_stage?: TemplateType | null;
  am_ac?: string | null;
  nova_url?: string | null;
  candidate_id?: string | number | null;
  phone?: string | null;
}

export type ModalView = 'composer' | 'reimbursement' | 'margin_extract' | 'extension_extract';

// Dashboard state types
export type ActiveEmailModal = null | 'prospect' | 'assignment';

// ActiveAssignment type for transformer
export interface ActiveAssignment {
  id: number;
  candidate_id?: number | null;
  candidate_name: string;
  email?: string | null;
  phone?: string | null;
  facility_name?: string | null;
  specialty?: string | null;
  end_date?: string | null;
  days_to_end: number;
  extension_stage?: TemplateType;
  is_looking_for_new_facility?: boolean;
  is_exiting?: boolean;
  actual_margin?: number | null;
  am_name?: string | null;
  ac_name?: string | null;
  nova_url?: string | null;
}