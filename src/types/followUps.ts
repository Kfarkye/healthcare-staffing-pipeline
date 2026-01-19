// ============================================================================
// Follow-Up System Types
// ============================================================================

export type FollowUpType = 'active' | 'rotation';

export type FollowUpStatusCategory = 'overdue' | 'today' | 'upcoming' | 'future';

export interface FollowUp {
  id: string;
  candidate_id: number;
  recruiter_id: string;
  follow_up_type: FollowUpType;
  scheduled_date: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpDashboard extends FollowUp {
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  candidate_specialty: string | null;
  candidate_profession: string | null;
  candidate_status: string | null;
  candidate_nova_url: string | null;
  recruiter_email: string;
  recruiter_name: string;
}

export interface CreateFollowUpParams {
  candidate_id: number;
  follow_up_type: FollowUpType;
  scheduled_date: string;
  notes?: string;
}

export interface FollowUpDigest {
  recruiter_id: string;
  recruiter_email: string;
  recruiter_name: string;
  follow_ups: FollowUpDashboard[];
  overdue_count: number;
  today_count: number;
  upcoming_count: number;
}

export interface FollowUpFilters {
  type?: FollowUpType;
  status?: 'completed' | 'pending';
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface FollowUpStats {
  total: number;
  overdue: number;
  today: number;
  upcoming: number;
  completed: number;
  byType: {
    active: number;
    rotation: number;
  };
}
