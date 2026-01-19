import { supabase } from './supabase';

export interface TransitionResult {
  success: boolean;
  error?: string;
  old_stage?: string;
  new_stage?: string;
  old_status?: string;
  new_status?: string;
  candidate_name?: string;
  facility_name?: string;
}

export const moveAssignmentStage = async (
  assignmentId: number,
  newStage: string
): Promise<TransitionResult> => {
  const { data, error } = await supabase.rpc('update_assignment_stage', {
    p_assignment_id: assignmentId,
    p_new_stage: newStage,
  });

  if (error) {
    console.error('Failed to update assignment stage:', error);
    throw new Error(error.message);
  }

  if (!data.success) {
    throw new Error(data.error || 'Failed to update stage');
  }

  return data;
};

export const moveProspectStatus = async (
  prospectId: number,
  newStatus: string
): Promise<TransitionResult> => {
  const { data, error } = await supabase.rpc('update_prospect_status', {
    p_prospect_id: prospectId,
    p_new_status: newStatus,
  });

  if (error) {
    console.error('Failed to update prospect status:', error);
    throw new Error(error.message);
  }

  if (!data.success) {
    throw new Error(data.error || 'Failed to update status');
  }

  return data;
};

export const getTransitionHistory = async (
  entityType: 'assignment' | 'prospect',
  entityId: number,
  limit = 10
) => {
  const column = entityType === 'assignment' ? 'assignment_id' : 'prospect_id';

  const { data, error } = await supabase
    .from('stage_transitions')
    .select(`
      *,
      user:user_id(email, full_name)
    `)
    .eq(column, entityId)
    .order('transitioned_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
};
