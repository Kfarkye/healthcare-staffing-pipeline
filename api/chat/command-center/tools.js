import { tool } from 'ai';
import { z } from 'zod';

/**
 * Command Center Tools
 * 
 * Architecture Notes:
 * - All tools use `inputSchema` (Zod) per Vercel AI SDK docs
 * - `strict: true` enforces schema validation at provider level
 * - Descriptions follow Google best practices: action verb + context + examples
 * 
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 * @see https://ai.google.dev/gemini-api/docs/function-calling#best-practices
 */
export function createCommandCenterTools(supabase) {
    return {
        // ============================================================================
        // DIAGNOSTIC TOOLS
        // ============================================================================

        /**
         * System diagnostic tool for debugging data visibility issues.
         * Should be called when searches return unexpected empty results.
         */
        debug_system: tool({
            description: 'Run a system diagnostic to check database connectivity and table row counts. Use this tool when searches return no results unexpectedly, to determine if the issue is data availability or query logic.',
            inputSchema: z.object({}),
            strict: true,
            execute: async () => {
                const [prospects, travelers, templates] = await Promise.all([
                    supabase.from('prospects').select('*', { count: 'exact', head: true }),
                    supabase.from('travel_candidates').select('*', { count: 'exact', head: true }),
                    supabase.from('communication_templates').select('*', { count: 'exact', head: true }),
                ]);

                return {
                    status: 'diagnostic_complete',
                    counts: {
                        prospects: prospects.count ?? 0,
                        travel_candidates: travelers.count ?? 0,
                        communication_templates: templates.count ?? 0,
                    },
                    errors: {
                        prospects: prospects.error?.message ?? null,
                        travel_candidates: travelers.error?.message ?? null,
                        communication_templates: templates.error?.message ?? null,
                    },
                };
            },
        }),

        // ============================================================================
        // CANDIDATE SEARCH TOOLS
        // ============================================================================

        /**
         * Unified search across all candidate sources.
         * This is the PRIMARY search tool - use it first for any name lookup.
         */
        search_all_candidates: tool({
            description: 'Search for a candidate by name across ALL sources (prospects AND active travelers). This is the DEFAULT tool for finding any person. Returns matches from both the prospect pipeline and currently working travelers.',
            inputSchema: z.object({
                name: z.string().min(1).describe('The candidate name to search for (partial match supported, e.g., "John" or "Smith")'),
            }),
            strict: true,
            execute: async ({ name }) => {
                // Parallel queries for performance
                const [prospectsResult, travelersResult] = await Promise.all([
                    supabase
                        .from('prospects')
                        .select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url')
                        .ilike('name', `%${name}%`)
                        .limit(10),
                    supabase
                        .from('travel_candidates')
                        .select('id, candidate_id, candidate_name, email, cell_phone, facility, start_date, end_date, contract_status')
                        .ilike('candidate_name', `%${name}%`)
                        .limit(10),
                ]);

                const prospects = (prospectsResult.data ?? []).map(p => ({
                    ...p,
                    source: 'prospect',
                }));

                const activeTravelers = (travelersResult.data ?? []).map(t => ({
                    candidate_id: t.candidate_id,
                    name: t.candidate_name,
                    email: t.email,
                    phone: t.cell_phone,
                    facility_name: t.facility,
                    start_date: t.start_date,
                    end_date: t.end_date,
                    status: t.contract_status,
                    source: 'active_traveler',
                }));

                const totalFound = prospects.length + activeTravelers.length;

                if (prospectsResult.error || travelersResult.error) {
                    return {
                        error: prospectsResult.error?.message || travelersResult.error?.message,
                        partial_results: { prospects, active_travelers: activeTravelers, total_found: totalFound },
                    };
                }

                return {
                    prospects,
                    active_travelers: activeTravelers,
                    total_found: totalFound,
                    message: totalFound === 0
                        ? `No candidates found matching "${name}". Try a different spelling or use debug_system to verify data availability.`
                        : `Found ${totalFound} candidate(s) matching "${name}".`,
                };
            },
        }),

        /**
         * Search specifically within the prospect pipeline (new/unconverted leads).
         */
        search_prospects: tool({
            description: 'Search the prospect pipeline for NEW candidates who are NOT yet on assignment. Use this for filtering by specialty, status, or home state. For general name lookups, use search_all_candidates instead.',
            inputSchema: z.object({
                name: z.string().optional().describe('Filter by name (partial match)'),
                specialty: z.string().optional().describe('Filter by clinical specialty (e.g., "ICU", "Med Surg", "ER")'),
                home_state: z.string().optional().describe('Filter by home state (e.g., "CA", "TX")'),
                status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']).optional().describe('Filter by pipeline status'),
            }),
            strict: true,
            execute: async ({ name, specialty, home_state, status }) => {
                let query = supabase
                    .from('prospects')
                    .select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url');

                if (name) query = query.ilike('name', `%${name}%`);
                if (specialty) query = query.ilike('specialty', `%${specialty}%`);
                if (home_state) query = query.ilike('home_state', `%${home_state}%`);
                if (status) query = query.eq('status', status);

                const { data, error } = await query.limit(20);

                if (error) return { error: error.message };

                return {
                    prospects: data ?? [],
                    count: data?.length ?? 0,
                    message: data?.length === 0
                        ? 'No prospects found matching the specified criteria.'
                        : `Found ${data.length} prospect(s).`,
                };
            },
        }),

        /**
         * Search the active traveler list (currently on assignment).
         */
        search_travel_list: tool({
            description: 'Search the working traveler list for candidates currently on assignment. Use this to find extension candidates, check contract end dates, or filter by facility. Returns active travelers only.',
            inputSchema: z.object({
                name: z.string().optional().describe('Filter by candidate name'),
                facility: z.string().optional().describe('Filter by facility name'),
                ending_soon: z.boolean().optional().describe('Set to true to filter to contracts ending within 30 days'),
            }),
            strict: true,
            execute: async ({ name, facility, ending_soon }) => {
                let query = supabase.from('travel_candidates').select('*');

                if (name) query = query.ilike('candidate_name', `%${name}%`);
                if (facility) query = query.ilike('facility', `%${facility}%`);
                if (ending_soon) {
                    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    query = query.lte('end_date', thirtyDaysOut);
                }

                const { data, error } = await query.limit(20);

                if (error) return { error: error.message };

                return {
                    travelers: data ?? [],
                    count: data?.length ?? 0,
                    message: data?.length === 0
                        ? 'No active travelers found matching the criteria.'
                        : `Found ${data.length} active traveler(s).`,
                };
            },
        }),

        /**
         * Get detailed profile for a specific candidate.
         */
        get_prospect_details: tool({
            description: 'Retrieve the full profile for a specific candidate by their candidate_id or name. Searches both prospects and active travelers. Use this after search_all_candidates to get complete details.',
            inputSchema: z.object({
                candidate_id: z.number().optional().describe('The numeric candidate ID (Nova ID)'),
                name: z.string().optional().describe('The candidate name to search for'),
            }),
            strict: true,
            execute: async ({ candidate_id, name }) => {
                if (!candidate_id && !name) {
                    return { error: 'Either candidate_id or name must be provided.' };
                }

                // Try prospects first
                let prospectQuery = supabase.from('prospects').select('*');
                if (candidate_id) prospectQuery = prospectQuery.eq('candidate_id', candidate_id);
                else if (name) prospectQuery = prospectQuery.ilike('name', `%${name}%`);

                const { data: prospect } = await prospectQuery.maybeSingle();
                if (prospect) {
                    return { ...prospect, source: 'prospect' };
                }

                // Fallback to travel_candidates
                let travelerQuery = supabase.from('travel_candidates').select('*');
                if (candidate_id) travelerQuery = travelerQuery.eq('candidate_id', candidate_id);
                else if (name) travelerQuery = travelerQuery.ilike('candidate_name', `%${name}%`);

                const { data: traveler } = await travelerQuery.maybeSingle();
                if (traveler) {
                    return {
                        ...traveler,
                        name: traveler.candidate_name,
                        source: 'active_traveler',
                    };
                }

                return { message: 'Candidate not found in prospects or active travelers.' };
            },
        }),

        // ============================================================================
        // PROSPECT MANAGEMENT TOOLS
        // ============================================================================

        /**
         * Add a new prospect to the pipeline.
         */
        add_prospect: tool({
            description: 'Create a new prospect record in the pipeline. Use this when the user explicitly asks to add or create a new candidate. Requires at minimum a name.',
            inputSchema: z.object({
                name: z.string().min(1).describe('Full name of the candidate (required)'),
                specialty: z.string().optional().describe('Clinical specialty (e.g., "RN", "LPN", "CNA")'),
                home_state: z.string().optional().describe('Home state abbreviation (e.g., "CA")'),
                email: z.string().email().optional().describe('Email address'),
                phone: z.string().optional().describe('Phone number'),
                notes: z.string().optional().describe('Initial notes or context about this candidate'),
                candidate_id: z.number().optional().describe('External Nova candidate ID if known'),
                nova_url: z.string().url().optional().describe('Full Nova profile URL'),
            }),
            strict: true,
            execute: async ({ name, specialty, home_state, email, phone, notes, candidate_id, nova_url }) => {
                const { data, error } = await supabase
                    .from('prospects')
                    .insert({
                        name,
                        specialty,
                        home_state,
                        email,
                        phone,
                        notes,
                        status: 'New',
                        candidate_id: candidate_id ?? Math.floor(Date.now() / 1000),
                        nova_url,
                    })
                    .select()
                    .single();

                if (error) return { error: error.message };

                return {
                    action: 'PROSPECT_ADDED',
                    prospect: data,
                    message: `Successfully added ${name} to the prospect pipeline.`,
                };
            },
        }),

        // ============================================================================
        // COMMUNICATION TEMPLATE TOOLS
        // ============================================================================

        /**
         * List available email/SMS templates.
         */
        list_email_templates: tool({
            description: 'Retrieve a list of all available communication templates (email, SMS). Use this to show the user what templates are available before drafting a message.',
            inputSchema: z.object({
                category: z.enum(['active', 'prospect', 'retention']).optional().describe('Filter by template category'),
            }),
            strict: true,
            execute: async ({ category }) => {
                let query = supabase
                    .from('communication_templates')
                    .select('name, category, description')
                    .eq('is_active', true)
                    .order('category');

                if (category) query = query.eq('category', category);

                const { data, error } = await query;

                if (error) return { error: error.message };
                if (!data?.length) return { message: 'No templates found.' };

                return {
                    templates: data,
                    count: data.length,
                };
            },
        }),

        /**
         * Retrieve a specific template with its content.
         */
        get_template: tool({
            description: 'Retrieve the full content of a specific communication template by category and name. Use this to get the subject line and body text for drafting messages.',
            inputSchema: z.object({
                category: z.enum(['active', 'prospect', 'retention']).describe('The template category'),
                template_name: z.string().describe('The template name (e.g., "extension_request", "cold_outreach")'),
            }),
            strict: true,
            execute: async ({ category, template_name }) => {
                const { data, error } = await supabase
                    .from('communication_templates')
                    .select('subject_template, body_template, required_variables, description')
                    .eq('category', category)
                    .eq('name', template_name)
                    .eq('is_active', true)
                    .maybeSingle();

                if (error) return { error: error.message };
                if (!data) return { error: `Template "${template_name}" not found in category "${category}".` };

                return {
                    action: 'TEMPLATE_RETRIEVED',
                    template: {
                        subject: data.subject_template,
                        body: data.body_template,
                        required_variables: data.required_variables,
                        description: data.description,
                    },
                    instructions: 'Replace {{placeholders}} with actual candidate data. Use get_prospect_details to look up any missing information.',
                };
            },
        }),

        // ============================================================================
        // PIPELINE ANALYTICS TOOLS
        // ============================================================================

        /**
         * Get executive pipeline summary.
         */
        get_pipeline_brief: tool({
            description: 'Generate an executive summary of the current candidate pipeline. Returns counts by status and specialty. Use this for "give me a pipeline brief" or "how many candidates do we have" requests.',
            inputSchema: z.object({}),
            strict: true,
            execute: async () => {
                const { data: prospects, error } = await supabase
                    .from('prospects')
                    .select('status, specialty');

                if (error) return { error: error.message };
                if (!prospects?.length) {
                    return { message: 'No prospects in the pipeline.', total: 0, by_status: {}, by_specialty: {} };
                }

                const byStatus = {};
                const bySpecialty = {};

                prospects.forEach(p => {
                    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
                    if (p.specialty) {
                        bySpecialty[p.specialty] = (bySpecialty[p.specialty] || 0) + 1;
                    }
                });

                return {
                    action: 'PIPELINE_BRIEF',
                    total: prospects.length,
                    by_status: byStatus,
                    by_specialty: bySpecialty,
                };
            },
        }),

        // ============================================================================
        // PAY CALCULATION TOOLS
        // ============================================================================

        /**
         * Calculate GSA-compliant pay package.
         */
        calculate_pay_package: tool({
            description: 'Calculate a GSA-compliant pay package breakdown from a target weekly gross. Returns hourly rate, stipends, and take-home estimates.',
            inputSchema: z.object({
                target_gross: z.number().positive().describe('Target weekly gross pay in dollars'),
                state: z.string().length(2).describe('Work state abbreviation (e.g., "CA", "TX")'),
                city: z.string().describe('City name for GSA rate lookup'),
                hours: z.number().positive().optional().default(36).describe('Hours per week (default: 36)'),
                specialty: z.string().optional().describe('Clinical specialty for rate adjustments'),
            }),
            strict: true,
            execute: async ({ target_gross, state, city, hours, specialty }) => {
                const { data, error } = await supabase.rpc('calculate_pay_package', {
                    p_target_gross: target_gross,
                    p_hours_per_week: hours ?? 36,
                    p_state: state.toUpperCase(),
                    p_city: city,
                    p_profession: 'RN',
                    p_specialty: specialty ?? 'General',
                    p_job_id: 'generated',
                });

                if (error) return { error: error.message };

                return {
                    action: 'PAY_PACKAGE_CALCULATED',
                    breakdown: data,
                    parameters: { target_gross, state, city, hours: hours ?? 36, specialty },
                };
            },
        }),

        // ============================================================================
        // FOLLOW-UP & SCHEDULING TOOLS
        // ============================================================================

        /**
         * Schedule a follow-up for a candidate.
         */
        create_follow_up: tool({
            description: 'Schedule a follow-up task for a specific candidate. Creates a reminder in the system for the specified date.',
            inputSchema: z.object({
                candidate_id: z.number().describe('The prospect/candidate ID to follow up with'),
                scheduled_date: z.string().describe('The follow-up date in ISO format (e.g., "2026-01-30")'),
                follow_up_type: z.enum(['active', 'rotation']).describe('Type of follow-up'),
                notes: z.string().optional().describe('Notes or context for the follow-up'),
            }),
            strict: true,
            execute: async ({ candidate_id, scheduled_date, follow_up_type, notes }) => {
                const { data, error } = await supabase
                    .from('follow_ups')
                    .insert({
                        prospect_id: candidate_id,
                        scheduled_date,
                        follow_up_type,
                        notes,
                        status: 'pending',
                    })
                    .select()
                    .single();

                if (error) return { error: error.message };

                return {
                    action: 'FOLLOW_UP_CREATED',
                    follow_up: data,
                    message: `Follow-up scheduled for ${scheduled_date}.`,
                };
            },
        }),

        // ============================================================================
        // KNOWLEDGE BASE TOOLS
        // ============================================================================

        /**
         * Search the internal knowledge base.
         */
        search_knowledge: tool({
            description: 'Search the internal knowledge base for policies, FAQs, benefits information, and company guidelines. Use this when the user asks about Aya policies or benefits.',
            inputSchema: z.object({
                query: z.string().min(1).describe('The search query (e.g., "health insurance", "PTO policy")'),
                category: z.enum(['benefits', 'faq', 'policies']).optional().describe('Filter by knowledge category'),
            }),
            strict: true,
            execute: async ({ query, category }) => {
                let dbQuery = supabase
                    .from('knowledge_base')
                    .select('*')
                    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
                    .limit(5);

                if (category) dbQuery = dbQuery.eq('category', category);

                const { data, error } = await dbQuery;

                if (error) return { error: error.message };
                if (!data?.length) return { message: 'No relevant knowledge base articles found.' };

                return {
                    results: data,
                    count: data.length,
                };
            },
        }),

        // ============================================================================
        // UI STATE TOOLS
        // ============================================================================

        /**
         * Update dashboard UI state (filters, view mode).
         */
        set_ui_state: tool({
            description: 'Update the dashboard UI state including filters, search query, and view mode. Use this when the user wants to change what they see in the dashboard.',
            inputSchema: z.object({
                filter_specialty: z.string().optional().describe('Filter the view by specialty'),
                filter_status: z.string().optional().describe('Filter the view by status'),
                search_query: z.string().optional().describe('Set the search query'),
                view_mode: z.enum(['grid', 'list', 'kanban']).optional().describe('Change the view mode'),
            }),
            strict: true,
            execute: async (args) => {
                // This is a client-side action marker - the frontend interprets this
                return {
                    action: 'SET_UI_STATE',
                    state: args,
                    message: 'UI state update requested.',
                };
            },
        }),
    };
}
