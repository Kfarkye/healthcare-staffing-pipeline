/**
 * Pipeline Tools — Gemini function declarations for the candidate web.
 *
 * These tools give Gemini structured access to the pipeline database.
 * Every tool returns structured JSON that maps to a URL in the entity graph.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    getCandidateProfile,
    getCandidateHistory,
    searchCandidates,
    getActivePipeline,
    getFacilityProfile,
    getStaleSubmittals,
    getUpcomingExtensions,
    logContact,
    addNote,
    resolveCandidateByName,
} from './pipeline-queries';

type Logger = { info?: Function; warn?: Function; error?: Function };

export function createPipelineTools(supabase: SupabaseClient, logger?: Logger) {
    return {
        get_active_pipeline: {
            description:
                'Get all candidates currently in the active pipeline with their status, specialty, availability, and pending actions. Use this when the recruiter asks about their pipeline, who needs follow-up, or what\'s pending.',
            parameters: z.object({
                specialty: z.string().optional().describe('Filter by specialty (e.g. "Med-Surg", "ICU", "OR")'),
                status: z.enum(['all', 'active', 'submitted', 'interviewing', 'offer_pending', 'ending_soon']).optional().describe('Filter by pipeline stage. Default: "all"'),
                available_within_days: z.number().optional().describe('Only show candidates available within N days'),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_get_active_pipeline', { filters: args });
                return getActivePipeline(supabase, {
                    specialty: args.specialty,
                    status: args.status || 'all',
                    available_within_days: args.available_within_days,
                });
            },
        },

        get_candidate: {
            description:
                'Get the full profile for a specific candidate including clinical profile, preferences, assignment history, active submittals, contact history, and relationship notes. Use this when the recruiter mentions a candidate by name or ID, or when drafting personalized communications.',
            parameters: z.object({
                candidate_id: z.string().optional().describe('Candidate UUID'),
                name: z.string().optional().describe('Candidate name for fuzzy lookup if ID not provided'),
            }),
            execute: async (args: any) => {
                let candidateId = args.candidate_id;

                // Fuzzy lookup by name
                if (!candidateId && args.name) {
                    const lookup = await resolveCandidateByName(supabase, args.name);
                    if (!lookup.ok) return lookup;
                    if (lookup.matches.length === 0) return { ok: false, error: `No candidate found matching "${args.name}"` };
                    if (lookup.matches.length > 1) {
                        return {
                            ok: false,
                            error: 'Multiple candidates match. Please specify.',
                            matches: lookup.matches.map((m: any) => ({
                                id: m.id,
                                name: `${m.first_name} ${m.last_name}`,
                                specialty: m.specialty,
                                email: m.email,
                            })),
                        };
                    }
                    candidateId = lookup.matches[0].id;
                }

                if (!candidateId) return { ok: false, error: 'Provide candidate_id or name.' };

                logger?.info?.('tool_get_candidate', { candidate_id: candidateId });
                return getCandidateProfile(supabase, candidateId);
            },
        },

        get_candidate_history: {
            description:
                'Get the complete interaction history for a candidate — all assignments, submittals, pay packages, and contact log. Use this when the recruiter needs context about past interactions.',
            parameters: z.object({
                candidate_id: z.string().describe('Candidate UUID'),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_get_candidate_history', { candidate_id: args.candidate_id });
                return getCandidateHistory(supabase, args.candidate_id);
            },
        },

        get_facility: {
            description:
                'Get facility details including typical rates, requirements, account manager info, and which candidates have worked there. Use this when the recruiter asks about a facility or needs rate context.',
            parameters: z.object({
                facility_id: z.string().optional().describe('Facility UUID'),
                name: z.string().optional().describe('Facility name for fuzzy lookup'),
            }),
            execute: async (args: any) => {
                let facilityId = args.facility_id;

                if (!facilityId && args.name) {
                    const { data } = await supabase
                        .from('facilities')
                        .select('id, name')
                        .ilike('name', `%${args.name}%`)
                        .limit(5);

                    if (!data?.length) return { ok: false, error: `No facility found matching "${args.name}"` };
                    if (data.length > 1) {
                        return { ok: false, error: 'Multiple facilities match. Please specify.', matches: data };
                    }
                    facilityId = data[0].id;
                }

                if (!facilityId) return { ok: false, error: 'Provide facility_id or name.' };

                logger?.info?.('tool_get_facility', { facility_id: facilityId });
                return getFacilityProfile(supabase, facilityId);
            },
        },

        search_candidates: {
            description:
                'Search across all candidates by specialty, location preference, license state, availability, or certification. Use this when the recruiter needs to find candidates for a role.',
            parameters: z.object({
                specialty: z.string().optional(),
                license_state: z.string().optional().describe('State abbreviation (e.g. "OR", "CA")'),
                available_before: z.string().optional().describe('ISO date — candidates available by this date'),
                certification: z.string().optional().describe('Required certification (e.g. "BLS", "ECMO")'),
                preferred_location: z.string().optional().describe('Location preference keyword'),
                has_compact: z.boolean().optional().describe('Filter to compact license holders only'),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_search_candidates', { filters: args });
                return searchCandidates(supabase, args);
            },
        },

        get_upcoming_extensions: {
            description:
                'Get all assignments ending within a date range, showing extension eligibility and candidate details. Use this when the recruiter asks about extensions or upcoming availability.',
            parameters: z.object({
                within_days: z.number().optional().describe('Assignments ending within N days. Default: 30'),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_get_upcoming_extensions', { within_days: args.within_days });
                return getUpcomingExtensions(supabase, args.within_days || 30);
            },
        },

        get_stale_submittals: {
            description:
                'Get submittals that haven\'t been updated in more than the specified hours. Use this when the recruiter asks what needs follow-up or what\'s stalled.',
            parameters: z.object({
                stale_hours: z.number().optional().describe('Hours without update to consider stale. Default: 48'),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_get_stale_submittals', { stale_hours: args.stale_hours });
                return getStaleSubmittals(supabase, args.stale_hours || 48);
            },
        },

        log_contact: {
            description:
                'Record a contact event (call, email, text) with a candidate. Use this when the recruiter tells you they reached out or received a message.',
            parameters: z.object({
                candidate_id: z.string().describe('Candidate UUID'),
                channel: z.enum(['phone', 'email', 'text', 'teams', 'voicemail']),
                direction: z.enum(['outbound', 'inbound']),
                subject: z.string().optional(),
                outcome: z.enum(['connected', 'voicemail', 'no_answer', 'sent', 'received', 'replied']).optional(),
                body_preview: z.string().optional().describe('Brief summary of what was discussed'),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_log_contact', { candidate_id: args.candidate_id, channel: args.channel });
                return logContact(supabase, args);
            },
        },

        add_pipeline_note: {
            description:
                'Add a note to any entity (candidate, facility, submittal, assignment). Use this when the recruiter shares information that should be remembered.',
            parameters: z.object({
                candidate_id: z.string().optional(),
                facility_id: z.string().optional(),
                submittal_id: z.string().optional(),
                assignment_id: z.string().optional(),
                content: z.string().describe('The note content'),
                note_type: z.enum(['general', 'clinical', 'preference', 'red_flag', 'relationship', 'compliance']).optional(),
            }),
            execute: async (args: any) => {
                logger?.info?.('tool_add_pipeline_note', { type: args.note_type });
                return addNote(supabase, args);
            },
        },
    };
}
