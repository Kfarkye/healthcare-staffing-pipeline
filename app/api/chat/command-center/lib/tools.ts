/**
 * Command Center Tools
 *
 * Server-side tool definitions for LLM actions.
 *
 * All prospect operations go through the /api/data/prospects REST
 * endpoint via fetch() — the tools are consumers of the endpoints,
 * not direct database clients.
 */

import { z } from 'zod';
import { CONFIG } from './config';

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
/*  Endpoint helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * GET /api/data/prospects with optional query params.
 * Returns { rows: ProspectRecord[] }
 */
async function fetchProspects(
  origin: string,
  params?: Record<string, string>
): Promise<{ rows: any[]; error?: string }> {
  const url = new URL('/api/data/prospects', origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) return { rows: [], error: body?.error || `HTTP ${res.status}` };
  return { rows: body?.rows || [] };
}

/**
 * POST /api/data/prospects  (action: "create")
 * Returns { data: ProspectRecord }
 */
async function postProspect(
  origin: string,
  payload: Record<string, any>
): Promise<{ data: any; error?: string }> {
  const res = await fetch(`${origin}/api/data/prospects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', ...payload }),
  });
  const body = await res.json();
  if (!res.ok) return { data: null, error: body?.error || `HTTP ${res.status}` };
  return { data: body?.data || null };
}

/**
 * PATCH /api/data/prospects  (requires id)
 * Returns { data: ProspectRecord }
 */
async function patchProspect(
  origin: string,
  id: number,
  updates: Record<string, any>
): Promise<{ data: any; error?: string }> {
  const res = await fetch(`${origin}/api/data/prospects`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  const body = await res.json();
  if (!res.ok) return { data: null, error: body?.error || `HTTP ${res.status}` };
  return { data: body?.data || null };
}

/**
 * Resolve a prospect's internal id from candidate_id or email
 * by querying the endpoint.
 */
async function resolveProspectId(
  origin: string,
  input: { prospect_id?: number; candidate_id?: number; email?: string }
): Promise<number | null> {
  if (input.prospect_id) return input.prospect_id;

  if (input.candidate_id) {
    const { rows } = await fetchProspects(origin, {
      candidate_id: String(input.candidate_id),
      limit: '1',
    });
    return rows[0]?.id ?? null;
  }

  if (input.email) {
    const { rows } = await fetchProspects(origin, {
      email: input.email,
      limit: '1',
    });
    return rows[0]?.id ?? null;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Tool factory                                                       */
/* ------------------------------------------------------------------ */

export interface ToolsConfig {
  /** Origin URL for internal API calls (e.g. "http://localhost:3000") */
  origin: string;
  logger?: { info?: Function; warn?: Function; error?: Function };
}

export function createCommandCenterTools(config: ToolsConfig) {
  const { origin, logger } = config;

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

        const params: Record<string, string> = {};
        if (args.candidate_id) params.candidate_id = String(args.candidate_id);
        else if (args.email) params.email = String(args.email).trim();
        else if (args.name) params.name = String(args.name).trim();
        if (args.limit) params.limit = String(Math.min(Number(args.limit), 20));

        const { rows, error } = await fetchProspects(origin, params);
        if (error) return { ok: false, error };
        return { ok: true, matches: rows };
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

        // Check for existing record via the endpoint
        const { rows: existing } = await fetchProspects(origin, {
          candidate_id: String(candidateId),
          limit: '1',
        });

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

        if (existing.length > 0) {
          if (!args.update_if_exists) {
            const ex = existing[0];
            return {
              ok: false,
              error: 'Candidate already exists.',
              existing: { id: ex.id, candidate_id: ex.candidate_id, name: ex.name, email: ex.email },
            };
          }

          // Update via PATCH endpoint
          const { data: updated, error: updErr } = await patchProspect(origin, existing[0].id, payload);
          if (updErr) return { ok: false, error: updErr };

          logger?.info?.('tool_add_candidate_updated', {
            candidate_id: candidateId,
            id: updated?.id,
          });

          return { ok: true, action: 'updated', prospect: updated };
        }

        // Create via POST endpoint
        const { data, error } = await postProspect(origin, payload);
        if (error) return { ok: false, error };

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
        const prospectId = await resolveProspectId(origin, {
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

        const { data, error } = await patchProspect(origin, prospectId, cleaned);
        if (error) return { ok: false, error };

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
          const resolved = await resolveProspectId(origin, { candidate_id: candidateId });
          if (!resolved) return { ok: false, error: 'Candidate not found.' };
          prospectId = resolved;
        }

        // Note: candidate_notes don't have a dedicated endpoint yet,
        // so we update the prospect's notes field via the PATCH endpoint.
        const noteContent = String(args.content).trim();
        const { data, error } = await patchProspect(origin, prospectId!, { notes: noteContent });
        if (error) return { ok: false, error };

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
        const prospectId = await resolveProspectId(origin, {
          prospect_id: args.prospect_id,
          candidate_id: args.candidate_id,
          email: args.email,
        });

        if (!prospectId) {
          return { ok: false, error: 'Candidate not found (provide candidate_id, prospect_id, or email).' };
        }

        // Fetch the prospect to get notes field via the endpoint
        const { rows } = await fetchProspects(origin, {
          candidate_id: String(args.candidate_id || ''),
        });

        const prospect = rows.find((r: any) => r.id === prospectId);
        const notes = prospect?.notes ? [{ content: prospect.notes, prospect_id: prospectId }] : [];

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

        // State board links don't have a dedicated endpoint yet.
        // Return a placeholder until the endpoint is created.
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
  };
}
