/**
 * Command Center Tools
 *
 * Server-side tool definitions for LLM actions.
 *
 * Architecture:
 *   - Legacy tools use /api/data/prospects/service (v0)
 *   - Grounding tools use /api/v1/prospects/service (deterministic envelope + lineage)
 *
 * HARD RULE: The LLM cannot draft outreach unless get_prospect_by_id
 * succeeded and returned a schema-valid object. All facts must come
 * from the grounded JSON, never from the model's memory.
 */

import { z } from 'zod';
import { CONFIG } from './config';
import {
  findProspects,
  findProspectBy,
  createProspect,
  updateProspect,
  resolveProspectId,
} from '../../../data/prospects/service';
import {
  getProspectById,
  getProspectByCandidateId,
  searchProspects as searchProspectsV1,
  logEvent,
  getProspectEvents,
} from '../../../v1/prospects/service';
import {
  SearchFiltersSchema,
  LogEventInputSchema,
  EventType,
  ActorType,
  EventSource,
} from '../../../v1/prospects/schemas';

const NOVA_SECTION_PATHS: Record<string, string> = {
  about: '/new-profile/about',
  profile: '/new-profile/about',
};

const NOVA_PAGE_PATHS: Record<string, string> = {
  search: '#/recruiting/search-all-candidates',
  search_all_candidates: '#/recruiting/search-all-candidates',
  live: '#/recruiting/live-nurses-new',
  live_list: '#/recruiting/live-nurses-new',
  livelist: '#/recruiting/live-nurses-new',
  deals: '#/recruiting/deals',
  jobs: '#/recruiting/jobs',
  margins: '#/recruiting/margins',
  contract_requests: '#/recruiting/contract-requests-new',
  contract_requests_new: '#/recruiting/contract-requests-new',
  tickets: '#/travelx/tickets',
  job_openings: '#/recruiting/job-openings/{job_id}',
  job_opening: '#/recruiting/job-openings/{job_id}',
  job: '#/recruiting/jobs/{job_id}',
};

function normalizeNovaKey(input?: string | null): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeNovaPath(path?: string | null): string {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#')) return `/${raw}`;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function parseCandidateIdFromNovaUrl(url?: string | null): number | null {
  if (!url) return null;
  const match = url.match(/\/candidates?\/(\d+)/i);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function buildNovaUrl(candidateId: number): string {
  const base = CONFIG.nova.baseUrl;
  const path = CONFIG.nova.candidatePath;
  const suffix = CONFIG.nova.profileSuffix;
  return `${base}${path}/${candidateId}${suffix}`;
}

function normalizeStateAbbr(state?: string | null): string | null {
  if (!state) return null;
  const cleaned = String(state).trim().toUpperCase();
  return cleaned.length === 2 ? cleaned : null;
}

/* ------------------------------------------------------------------ */
/*  Tool factory                                                       */
/* ------------------------------------------------------------------ */

export function createCommandCenterTools(config: { logger?: { info?: Function; warn?: Function; error?: Function } }) {
  const { logger } = config;

  return {
    lookup_candidate: {
      description:
        'Find candidates/prospects by candidate_id, email, or name.',
      parameters: z.object({
        candidate_id: z.number().int().positive().optional(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: async (args: any) => {
        if (!args.candidate_id && !args.email && !args.name) {
          return { ok: false, error: 'Provide candidate_id, email, or name.' };
        }

        const { data, error } = await findProspects({
          candidate_id: args.candidate_id,
          email: args.email ? String(args.email).trim() : undefined,
          name: args.name ? String(args.name).trim() : undefined,
          limit: args.limit,
        });

        if (error) return { ok: false, error: error.message };
        return { ok: true, matches: data };
      },
    },

    add_candidate: {
      description:
        'Add a new candidate/prospect to the system. Requires candidate_id (or nova_url) and name.',
      parameters: z
        .object({
          candidate_id: z.number().int().positive().optional(),
          nova_url: z.string().url().optional(),
          name: z.string().min(1),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          profession: z.string().optional(),
          specialty: z.string().optional(),
          home_state: z.string().optional(),
          notes: z.string().optional(),
          status: z.string().optional(),
          recruiter: z.string().optional(),
          licenses: z.array(z.string()).optional(),
          facility: z.string().optional(),
          followup_stage: z.string().optional(),
          engagement_level: z.string().optional(),
          update_if_exists: z.boolean().optional(),
        })
        .refine((data) => Boolean(data.candidate_id || data.nova_url), {
          message: 'candidate_id or nova_url is required',
        }),
      execute: async (args: any) => {
        const candidateId = args.candidate_id ?? parseCandidateIdFromNovaUrl(args.nova_url);
        if (!candidateId) {
          return { ok: false, error: 'candidate_id is required (or a valid nova_url).' };
        }

        const candidateName = String(args.name || '').trim();
        if (!candidateName) {
          return { ok: false, error: 'name is required.' };
        }

        // Check for existing record via the service
        const { data: existing, error: lookupErr } = await findProspectBy('candidate_id', candidateId);
        if (lookupErr) return { ok: false, error: lookupErr.message };

        const rawNovaUrl = args.nova_url ? String(args.nova_url).trim() : null;
        const normalizedNovaUrl = rawNovaUrl && /^https?:\/\//i.test(rawNovaUrl)
          ? rawNovaUrl
          : buildNovaUrl(candidateId);

        const payload: Record<string, any> = {
          candidate_id: candidateId,
          name: candidateName,
          email: args.email ? String(args.email).toLowerCase().trim() : null,
          phone: args.phone ? String(args.phone).trim() : null,
          profession: args.profession ? String(args.profession).trim() : null,
          specialty: args.specialty ? String(args.specialty).trim() : null,
          home_state: args.home_state ? String(args.home_state).trim().toUpperCase() : null,
          notes: args.notes ? String(args.notes).trim() : null,
          status: args.status ? String(args.status).trim() : 'New',
          recruiter: args.recruiter ? String(args.recruiter).trim() : null,
          licenses: Array.isArray(args.licenses) ? args.licenses : null,
          facility: args.facility ? String(args.facility).trim() : null,
          followup_stage: args.followup_stage ? String(args.followup_stage).trim() : null,
          engagement_level: args.engagement_level ? String(args.engagement_level).trim() : null,
          nova_url: normalizedNovaUrl,
        };

        if (existing) {
          if (!args.update_if_exists) {
            return {
              ok: false,
              error: 'Candidate already exists.',
              existing: { id: existing.id, candidate_id: existing.candidate_id, name: existing.name, email: existing.email },
            };
          }

          const { data: updated, error: updErr } = await updateProspect(existing.id, payload);
          if (updErr) return { ok: false, error: updErr.message };

          logger?.info?.('tool_add_candidate_updated', {
            candidate_id: candidateId,
            id: updated?.id,
          });

          return { ok: true, action: 'updated', prospect: updated };
        }

        const { data, error } = await createProspect(payload);
        if (error) return { ok: false, error: error.message };

        logger?.info?.('tool_add_candidate_created', {
          candidate_id: candidateId,
          id: data?.id,
        });

        return { ok: true, action: 'created', prospect: data };
      },
    },

    update_candidate: {
      description: 'Update an existing candidate/prospect by candidate_id, prospect_id, or email.',
      parameters: z.object({
        prospect_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        profession: z.string().optional(),
        specialty: z.string().optional(),
        home_state: z.string().optional(),
        notes: z.string().optional(),
        status: z.string().optional(),
        recruiter: z.string().optional(),
        licenses: z.array(z.string()).optional(),
        facility: z.string().optional(),
        followup_stage: z.string().optional(),
        engagement_level: z.string().optional(),
        nova_url: z.string().url().optional(),
      }),
      execute: async (args: any) => {
        const prospectId = await resolveProspectId({
          prospect_id: args.prospect_id,
          candidate_id: args.candidate_id,
          email: args.email,
        });

        if (!prospectId) {
          return { ok: false, error: 'Candidate not found (provide candidate_id, prospect_id, or email).' };
        }

        const updates: Record<string, any> = {
          name: args.name ? String(args.name).trim() : undefined,
          email: args.email ? String(args.email).toLowerCase().trim() : undefined,
          phone: args.phone ? String(args.phone).trim() : undefined,
          profession: args.profession ? String(args.profession).trim() : undefined,
          specialty: args.specialty ? String(args.specialty).trim() : undefined,
          home_state: args.home_state ? String(args.home_state).trim().toUpperCase() : undefined,
          notes: args.notes ? String(args.notes).trim() : undefined,
          status: args.status ? String(args.status).trim() : undefined,
          recruiter: args.recruiter ? String(args.recruiter).trim() : undefined,
          licenses: Array.isArray(args.licenses) ? args.licenses : undefined,
          facility: args.facility ? String(args.facility).trim() : undefined,
          followup_stage: args.followup_stage ? String(args.followup_stage).trim() : undefined,
          engagement_level: args.engagement_level ? String(args.engagement_level).trim() : undefined,
          nova_url: args.nova_url ? String(args.nova_url).trim() : undefined,
        };

        const cleaned = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(cleaned).length === 0) {
          return { ok: false, error: 'No update fields provided.' };
        }

        const { data, error } = await updateProspect(prospectId, cleaned);
        if (error) return { ok: false, error: error.message };

        logger?.info?.('tool_update_candidate', { prospect_id: prospectId });
        return { ok: true, prospect: data };
      },
    },

    add_candidate_note: {
      description:
        'Create a note for a candidate/prospect. Requires prospect_id or candidate_id and note content.',
      parameters: z.object({
        prospect_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        note_type: z.string().optional(),
        content: z.string().min(1),
        author_id: z.string().uuid().optional(),
      }),
      execute: async (args: any) => {
        let prospectId = args.prospect_id as number | undefined;
        const candidateId = args.candidate_id as number | undefined;

        if (!prospectId && !candidateId) {
          return { ok: false, error: 'prospect_id or candidate_id is required.' };
        }

        if (!prospectId && candidateId) {
          const resolved = await resolveProspectId({ candidate_id: candidateId });
          if (!resolved) return { ok: false, error: 'Candidate not found.' };
          prospectId = resolved;
        }

        const noteContent = String(args.content).trim();
        const { data, error } = await updateProspect(prospectId!, { notes: noteContent });
        if (error) return { ok: false, error: error.message };

        logger?.info?.('tool_add_candidate_note', { prospect_id: prospectId });
        return { ok: true, note: { content: noteContent, prospect_id: prospectId }, prospect_id: prospectId };
      },
    },

    get_candidate_notes: {
      description: 'Fetch recent notes for a candidate/prospect.',
      parameters: z.object({
        prospect_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        email: z.string().email().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (args: any) => {
        const prospectId = await resolveProspectId({
          prospect_id: args.prospect_id,
          candidate_id: args.candidate_id,
          email: args.email,
        });

        if (!prospectId) {
          return { ok: false, error: 'Candidate not found (provide candidate_id, prospect_id, or email).' };
        }

        // Fetch the prospect to get the notes field
        const { data } = await findProspectBy('id', prospectId);
        const notes = data?.notes ? [{ content: data.notes, prospect_id: prospectId }] : [];
        return { ok: true, prospect_id: prospectId, notes };
      },
    },

    get_nova_link: {
      description:
        'Build a Nova link. Supports candidate profile links, global pages, and optional custom_path.',
      parameters: z.object({
        candidate_id: z.number().int().positive().optional(),
        nova_url: z.string().url().optional(),
        section: z.string().optional(),
        page: z.string().optional(),
        custom_path: z.string().optional(),
        job_id: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async (args: any) => {
        const candidateId = args.candidate_id ?? parseCandidateIdFromNovaUrl(args.nova_url);
        const sectionKey = normalizeNovaKey(args.section);
        const pageKey = normalizeNovaKey(args.page);

        if (candidateId) {
          let path = '';
          if (args.custom_path) {
            path = normalizeNovaPath(args.custom_path);
          } else if (sectionKey) {
            path = NOVA_SECTION_PATHS[sectionKey] || '';
          }

          const base = `${CONFIG.nova.baseUrl}${CONFIG.nova.candidatePath}/${candidateId}`;
          const link = path ? `${base}${path}` : `${base}${CONFIG.nova.profileSuffix}`;

          return {
            ok: true,
            link,
            section: sectionKey || 'about',
            candidate_id: candidateId,
          };
        }

        let pagePath = '';
        if (args.custom_path) {
          pagePath = normalizeNovaPath(args.custom_path);
        } else if (pageKey) {
          pagePath = NOVA_PAGE_PATHS[pageKey] || '';
          if (pagePath && pagePath.includes('{job_id}')) {
            const jobId = args.job_id ? String(args.job_id).trim() : '';
            if (jobId) pagePath = pagePath.replace('{job_id}', jobId);
          }
        }

        if (!pagePath) {
          return {
            ok: false,
            error:
              'Provide candidate_id/nova_url for candidate links, or page/custom_path for global links.',
          };
        }

        const link = `${CONFIG.nova.baseUrl}${pagePath}`;
        return {
          ok: true,
          link,
          page: pageKey || 'custom',
        };
      },
    },

    get_state_board_link: {
      description: 'Return the state board verification link for a given state (and optional profession).',
      parameters: z.object({
        state: z.string().min(2),
        profession: z.string().optional(),
      }),
      execute: async (_args: any) => {
        const state = normalizeStateAbbr(_args.state);
        if (!state) return { ok: false, error: 'State must be a 2-letter code.' };
        return { ok: false, error: 'State board link endpoint not available yet.' };
      },
    },

    upsert_state_board_link: {
      description: 'Create or update a state board verification link.',
      parameters: z.object({
        state: z.string().min(2),
        profession: z.string().optional(),
        url: z.string().url(),
        notes: z.string().optional(),
        source: z.string().optional(),
      }),
      execute: async (_args: any) => {
        const state = normalizeStateAbbr(_args.state);
        if (!state) return { ok: false, error: 'State must be a 2-letter code.' };
        return { ok: false, error: 'State board link endpoint not available yet.' };
      },
    },

    // ================================================================
    // GROUNDING-FIRST TOOLS (v1)
    //
    // These tools return the deterministic envelope with lineage.
    // The LLM MUST use these for any prospect data it presents.
    // It cannot draft outreach, state facts about a candidate,
    // or reference facility/status without first calling one of these.
    // ================================================================

    get_prospect_by_id: {
      description:
        'Get a prospect by their internal ID or candidate_id. Returns the full deterministic envelope with lineage (last event, last contacted, event count). ALWAYS call this before drafting outreach or stating facts about a candidate.',
      parameters: z.object({
        id: z.number().int().positive(),
        lookup_by: z.enum(['id', 'candidate_id']).default('id'),
      }),
      execute: async (args: any) => {
        const lookupFn = args.lookup_by === 'candidate_id'
          ? getProspectByCandidateId
          : getProspectById;

        const { data, error } = await lookupFn(args.id);

        if (error) return { ok: false, error };
        if (!data) return { ok: false, error: 'Prospect not found.' };

        logger?.info?.('tool_get_prospect_by_id', {
          prospect_id: data.data.id,
          lookup_by: args.lookup_by,
        });

        return { ok: true, ...data };
      },
    },

    search_prospects: {
      description:
        'Search prospects with strict filters. No freeform queries. Filter by specialty, status, staleness, tenure, stale trigger (THREE_YEAR_ITCH or GENERAL_STALE), update date range, or name. Use stale_trigger=THREE_YEAR_ITCH to find candidates at a facility >= 2.8 years with stale contact.',
      parameters: z.object({
        specialty: z.array(z.string()).optional(),
        status: z.array(z.string()).optional(),
        stale_after_days: z.number().int().positive().optional(),
        min_years_at_facility: z.number().positive().optional(),
        stale_trigger: z.enum(['THREE_YEAR_ITCH', 'GENERAL_STALE']).optional(),
        updated_after: z.string().optional(),
        updated_before: z.string().optional(),
        name: z.string().optional(),
        limit: z.number().int().positive().max(100).default(20),
        cursor: z.number().int().optional(),
      }),
      execute: async (args: any) => {
        const parsed = SearchFiltersSchema.safeParse(args);
        if (!parsed.success) {
          const issues = parsed.error.issues.map(
            (i: any) => `${i.path.join('.')}: ${i.message}`
          );
          return { ok: false, error: `Invalid filters: ${issues.join('; ')}` };
        }

        const { data, error } = await searchProspectsV1(parsed.data);

        if (error) return { ok: false, error };
        if (!data) return { ok: false, error: 'Search failed.' };

        logger?.info?.('tool_search_prospects', {
          filters: args,
          result_count: data.pagination.count,
        });

        return { ok: true, ...data };
      },
    },

    log_event: {
      description:
        'Log a prospect lifecycle event. Use this to record outreach, status changes, responses, and other actions. This feeds the lineage system.',
      parameters: z.object({
        prospect_id: z.number().int().positive(),
        event_type: z.enum([
          'PROSPECT_CREATED', 'PROSPECT_UPDATED', 'OUTREACH_SENT',
          'OUTREACH_FAILED', 'RESPONSE_RECEIVED', 'STATUS_CHANGED',
          'SUBMITTED', 'INTERVIEW_SCHEDULED', 'OFFERED', 'DECLINED',
          'HIRED', 'NOTE_ADDED', 'FOLLOWUP_SCHEDULED', 'FOLLOWUP_COMPLETED',
        ]),
        actor_type: z.enum(['RECRUITER', 'SYSTEM', 'CANDIDATE']).default('SYSTEM'),
        actor_id: z.string().uuid().optional(),
        payload: z.record(z.unknown()).default({}),
        source: z.enum([
          'MANUAL', 'COMMAND_CENTER', 'NOVA_SYNC',
          'SMS_AUTOMATION', 'EMAIL_AUTOMATION', 'BULK_IMPORT', 'API',
        ]).default('COMMAND_CENTER'),
      }),
      execute: async (args: any) => {
        const parsed = LogEventInputSchema.safeParse(args);
        if (!parsed.success) {
          const issues = parsed.error.issues.map(
            (i: any) => `${i.path.join('.')}: ${i.message}`
          );
          return { ok: false, error: `Invalid event: ${issues.join('; ')}` };
        }

        const { data, error } = await logEvent(parsed.data);

        if (error) return { ok: false, error };

        logger?.info?.('tool_log_event', {
          prospect_id: args.prospect_id,
          event_type: args.event_type,
          event_id: data?.id,
        });

        return { ok: true, event: data };
      },
    },

    get_prospect_events: {
      description:
        'Fetch the event history for a prospect. Returns the append-only event stream in reverse chronological order.',
      parameters: z.object({
        prospect_id: z.number().int().positive(),
        limit: z.number().int().positive().max(100).default(20),
        event_types: z.array(z.string()).optional(),
      }),
      execute: async (args: any) => {
        const { data, error } = await getProspectEvents(
          args.prospect_id,
          { limit: args.limit, eventTypes: args.event_types }
        );

        if (error) return { ok: false, error };

        return {
          ok: true,
          prospect_id: args.prospect_id,
          count: data.length,
          events: data,
        };
      },
    },

    create_outreach_draft: {
      description:
        'Generate an outreach draft for a prospect. HARD RULE: This tool REQUIRES a valid prospect_id. The system will fetch the prospect envelope first to ground the draft in real data. Never call this without a prospect_id.',
      parameters: z.object({
        prospect_id: z.number().int().positive(),
        channel: z.enum(['EMAIL', 'SMS', 'LINKEDIN', 'PHONE']),
        objective: z.string().min(1),
        template_id: z.string().optional(),
      }),
      execute: async (args: any) => {
        // Step 1: Fetch the grounded prospect data
        const { data: envelope, error: lookupErr } = await getProspectById(args.prospect_id);

        if (lookupErr) return { ok: false, error: lookupErr };
        if (!envelope) return { ok: false, error: 'Prospect not found. Cannot draft outreach without grounded data.' };

        // Step 2: Return the grounded context for the LLM to use in drafting
        // The actual draft generation happens in the LLM layer using this data.
        const prospect = envelope.data;
        const lineage = envelope.lineage;

        logger?.info?.('tool_create_outreach_draft', {
          prospect_id: args.prospect_id,
          channel: args.channel,
        });

        return {
          ok: true,
          grounding: {
            prospect,
            lineage,
            channel: args.channel,
            objective: args.objective,
            template_id: args.template_id ?? null,
          },
          instructions: [
            'Draft the outreach using ONLY the data in the "prospect" object above.',
            'Do NOT reference any facility, title, or detail not present in the grounding data.',
            `Candidate name: ${prospect.full_name}`,
            prospect.current_facility ? `Current facility: ${prospect.current_facility}` : 'Current facility: unknown (do not guess)',
            prospect.specialty ? `Specialty: ${prospect.specialty}` : 'Specialty: unknown (do not guess)',
            prospect.years_at_facility !== null
              ? `Years at facility: ${prospect.years_at_facility}`
              : 'Tenure: unknown (do not guess)',
            lineage.last_contacted_at
              ? `Last contacted: ${lineage.last_contacted_at} (${lineage.days_since_contact} days ago)`
              : 'Never contacted before.',
            lineage.stale_trigger === 'THREE_YEAR_ITCH'
              ? 'TRIGGER: 3-year itch detected. Use tenure-based positioning (career progression, senior lead opportunities, new challenges).'
              : lineage.stale_trigger === 'GENERAL_STALE'
              ? 'TRIGGER: General stale. Re-engage with value-first message.'
              : 'No stale trigger active.',
          ],
        };
      },
    },
  };
}
