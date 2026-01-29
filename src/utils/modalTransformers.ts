// ============================================================================
// src/utils/modalTransformers.ts
// Type-safe transformers to convert dashboard row data into modal-specific formats.
// Centralized here to prevent drift across multiple dashboards.
// ============================================================================

import type { ClinicianRow, Prospect, Contract, ActiveAssignment } from '../types/email';

/**
 * Transforms ClinicianRow (from SubmittalsDashboard) into Prospect shape
 * for EmailTemplateModal.
 */
export const toProspectLike = (row: ClinicianRow): Prospect => ({
  id: Number(row.prospect_id) || 0,
  candidate_id: row.candidate_id ? Number(row.candidate_id) : null,
  name: row.full_name || 'Unknown Prospect',
  email: row.email || null,
  phone: row.phone || null,
  specialty: row.primary_specialty || row.engagement_specialty || null,
  home_state: row.home_state || null,
  profession: row.primary_specialty || null,
  available_start_date: row.available_start_date || null,

  // Template-specific fields (initialized to defaults)
  template_extracted_data: null,
  template_file_path: null,
  template_uploaded_at: null,

  // Metadata
  status: (row.raw_status || 'Outreach') as any,
  licenses: Array.isArray(row.licenses) ? row.licenses : null,
  notes: row.engagement_notes || null,
  recruiter: row.recruiter || null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/**
 * Transforms ClinicianRow (from SubmittalsDashboard) into Contract shape
 * for AssignmentEmailModal.
 */
export const toContractData = (row: ClinicianRow): Contract => ({
  candidate_name: row.full_name,
  candidate_email: row.email,
  email: row.email,
  facility_name: row.facility_name,
  specialty: row.primary_specialty || row.engagement_specialty,
  end_date: row.contract_end_date || null,
  status: 'Active',
  actual_margin: null,
  extension_stage: (row.extension_stage || 'outreach') as any,

  // Combine AM/AC names into single field
  am_ac: row.am_name
    ? `${row.am_name}${row.ac_name ? '; ' + row.ac_name : ''}`
    : null,

  nova_url: row.nova_url,
  candidate_id: row.candidate_id,
  phone: row.phone,
});

/**
 * Transforms ActiveAssignment (from ActiveAssignmentsDashboard) into Contract shape
 * for AssignmentEmailModal.
 */
export const assignmentToContract = (assignment: ActiveAssignment): Contract => ({
  id: assignment.id,
  candidate_name: assignment.candidate_name,
  candidate_email: assignment.email,
  email: assignment.email,
  facility_name: assignment.facility_name,
  specialty: assignment.specialty,
  end_date: assignment.end_date,
  status: 'Active',
  actual_margin: assignment.actual_margin,
  extension_stage: assignment.extension_stage || 'outreach',

  // Combine AM/AC names
  am_ac: assignment.am_name
    ? `${assignment.am_name}${assignment.ac_name ? '; ' + assignment.ac_name : ''}`
    : null,

  nova_url: assignment.nova_url,
  candidate_id: assignment.candidate_id,
  phone: assignment.phone,
});

/**
 * Transforms Engagement (from OffersDashboard) into Contract shape
 * for AssignmentEmailModal.
 */
export const engagementToContract = (engagement: any): Contract => ({
  id: Number(engagement.id),
  candidate_name: engagement.candidate_name || 'Unknown',
  candidate_email: engagement.email || null,
  email: engagement.email || null,
  facility_name: engagement.facility_name,
  specialty: engagement.specialty,
  end_date: engagement.start_date || null,
  status: 'Active',
  actual_margin: engagement.actual_margin || null,
  extension_stage: 'outreach',
  am_ac: null,
  nova_url: `https://nova.ayahealthcare.com/#/recruiting/candidates/${engagement.candidate_id}/new-profile/about`,
  candidate_id: String(engagement.candidate_id),
  phone: String(engagement.phone_number || ''),
});