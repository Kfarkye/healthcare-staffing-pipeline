// src/types/prospect.ts
export type VisibleColumnId = 'New' | 'Contacted' | 'Responded' | 'Final Updates';
export type ArchiveStatusId = 'Submittal Ready' | 'Not Interested';
export type StatusId = VisibleColumnId | ArchiveStatusId;

export interface Prospect {
  id: number;
  candidate_id?: number;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  profession: string | null;
  status: StatusId;
  home_state: string | null;
  licenses: string[] | null;
  notes: string | null;
  recruiter?: string | null;
  order?: number;
  references_verified?: number;
  profile_complete?: boolean;
  available_start_date?: string | null;
  rto_notes?: string | null;
  reassignment_requested_at?: string | null;
  created_at?: string;
  updated_at?: string;
  followup_stage?: string | null;
}

export interface ColumnDefinition {
  id: VisibleColumnId;
  label: string;
  color: string;
  description: string;
}

export interface Stats {
  total: number;
  ready: number;
  submittalReady: number;
  notInterested: number;
}

export interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export type ModalType = 'add' | 'edit' | 'detail' | 'email' | 'batch_reference' | null;
