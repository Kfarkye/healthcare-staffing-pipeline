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
         * 
         * IMPORTANT: Returns nova_id (the Nova system ID) which should be used for:
         * - Building Nova profile URLs
         * - Updating candidate status
         * - All cross-system references
         */
        search_all_candidates: tool({
            description: 'Search for a candidate by name across ALL sources (prospects AND active travelers). This is the DEFAULT tool for finding any person. Returns nova_id (the Nova candidate ID), full_name, and nova_url for each match.',
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

                // SANITIZED OUTPUT: Explicitly map fields to avoid ID confusion
                // nova_id = the Nova system candidate ID (use this for URLs and updates)
                // internal_record_id = Supabase row ID (internal use only)
                const prospects = (prospectsResult.data ?? []).map(p => ({
                    nova_id: p.candidate_id,
                    internal_record_id: p.id,
                    full_name: p.name,
                    specialty: p.specialty,
                    home_state: p.home_state,
                    status: p.status,
                    email: p.email,
                    phone: p.phone,
                    nova_url: p.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${p.candidate_id}/new-profile/about`,
                    source: 'prospect',
                }));

                const activeTravelers = (travelersResult.data ?? []).map(t => ({
                    nova_id: t.candidate_id,
                    internal_record_id: t.id,
                    full_name: t.candidate_name,
                    email: t.email,
                    phone: t.cell_phone,
                    facility_name: t.facility,
                    start_date: t.start_date,
                    end_date: t.end_date,
                    status: t.contract_status,
                    nova_url: `https://nova.ayahealthcare.com/#/recruiting/candidates/${t.candidate_id}/new-profile/about`,
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
                    note: 'Use nova_id for Nova profile links and status updates. The nova_url field contains the direct link to the candidate profile.',
                };
            },
        }),

        /**
         * Search specifically within the prospect pipeline (new/unconverted leads).
         */
        search_prospects: tool({
            description: 'Search the prospect pipeline for NEW candidates who are NOT yet on assignment. Use this for filtering by specialty, status, or home state. For general name lookups, use search_all_candidates instead. Returns nova_id for each prospect.',
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

                // SANITIZED OUTPUT: Map to consistent field names
                const prospects = (data ?? []).map(p => ({
                    nova_id: p.candidate_id,
                    internal_record_id: p.id,
                    full_name: p.name,
                    specialty: p.specialty,
                    home_state: p.home_state,
                    status: p.status,
                    email: p.email,
                    phone: p.phone,
                    nova_url: p.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${p.candidate_id}/new-profile/about`,
                }));

                return {
                    prospects,
                    count: prospects.length,
                    message: prospects.length === 0
                        ? 'No prospects found matching the specified criteria.'
                        : `Found ${prospects.length} prospect(s).`,
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
            description: 'Retrieve the full profile for a specific candidate by their nova_id (Nova candidate ID) or name. Searches both prospects and active travelers. Use this after search_all_candidates to get complete details.',
            inputSchema: z.object({
                nova_id: z.number().optional().describe('The Nova candidate ID (from search results)'),
                name: z.string().optional().describe('The candidate name to search for'),
            }),
            strict: true,
            execute: async ({ nova_id, name }) => {
                if (!nova_id && !name) {
                    return { error: 'Either nova_id or name must be provided.' };
                }

                // Try prospects first
                let prospectQuery = supabase.from('prospects').select('*');
                if (nova_id) prospectQuery = prospectQuery.eq('candidate_id', nova_id);
                else if (name) prospectQuery = prospectQuery.ilike('name', `%${name}%`);

                const { data: prospect } = await prospectQuery.maybeSingle();
                if (prospect) {
                    // SANITIZED OUTPUT: Explicit field mapping
                    return {
                        nova_id: prospect.candidate_id,
                        internal_record_id: prospect.id,
                        full_name: prospect.name,
                        email: prospect.email,
                        phone: prospect.phone,
                        specialty: prospect.specialty,
                        profession: prospect.profession,
                        home_state: prospect.home_state,
                        status: prospect.status,
                        notes: prospect.notes,
                        nova_url: prospect.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${prospect.candidate_id}/new-profile/about`,
                        recruiter: prospect.recruiter,
                        created_at: prospect.created_at,
                        updated_at: prospect.updated_at,
                        source: 'prospect',
                    };
                }

                // Fallback to travel_candidates
                let travelerQuery = supabase.from('travel_candidates').select('*');
                if (nova_id) travelerQuery = travelerQuery.eq('candidate_id', nova_id);
                else if (name) travelerQuery = travelerQuery.ilike('candidate_name', `%${name}%`);

                const { data: traveler } = await travelerQuery.maybeSingle();
                if (traveler) {
                    return {
                        nova_id: traveler.candidate_id,
                        internal_record_id: traveler.id,
                        full_name: traveler.candidate_name,
                        email: traveler.email,
                        phone: traveler.cell_phone,
                        facility_name: traveler.facility,
                        start_date: traveler.start_date,
                        end_date: traveler.end_date,
                        contract_status: traveler.contract_status,
                        nova_url: `https://nova.ayahealthcare.com/#/recruiting/candidates/${traveler.candidate_id}/new-profile/about`,
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
         * IMPORTANT: Requires either nova_id or nova_url to ensure valid Nova ID.
         */
        add_prospect: tool({
            description: 'Create a new prospect record in the pipeline. REQUIRES either the Nova candidate ID (nova_id) or the Nova profile URL (nova_url). Ask the user for this information if not provided.',
            inputSchema: z.object({
                name: z.string().min(1).describe('Full name of the candidate (required)'),
                nova_id: z.number().optional().describe('The Nova candidate ID (required if nova_url not provided)'),
                nova_url: z.string().optional().describe('Full Nova profile URL (e.g., https://nova.ayahealthcare.com/#/recruiting/candidates/1234567/new-profile/about)'),
                specialty: z.string().optional().describe('Clinical specialty (e.g., "RN", "LPN", "CNA")'),
                home_state: z.string().optional().describe('Home state abbreviation (e.g., "CA")'),
                email: z.string().email().optional().describe('Email address'),
                phone: z.string().optional().describe('Phone number'),
                notes: z.string().optional().describe('Initial notes or context about this candidate'),
            }),
            strict: true,
            execute: async ({ name, nova_id, nova_url, specialty, home_state, email, phone, notes }) => {
                // Extract nova_id from URL if not provided directly
                let resolvedNovaId = nova_id;
                let resolvedNovaUrl = nova_url;

                if (!resolvedNovaId && nova_url) {
                    // Extract ID from URL pattern: /candidates/{id}/
                    const match = nova_url.match(/\/candidates\/(\d+)\//);
                    if (match) {
                        resolvedNovaId = parseInt(match[1], 10);
                    }
                }

                // Require a valid Nova ID
                if (!resolvedNovaId) {
                    return {
                        error: 'Nova ID is required. Please provide either nova_id or a valid nova_url.',
                        suggestion: 'Ask the user for the Nova profile URL or candidate ID from the Nova system.',
                    };
                }

                // Generate nova_url if not provided
                if (!resolvedNovaUrl) {
                    resolvedNovaUrl = `https://nova.ayahealthcare.com/#/recruiting/candidates/${resolvedNovaId}/new-profile/about`;
                }

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
                        candidate_id: resolvedNovaId,
                        nova_url: resolvedNovaUrl,
                    })
                    .select()
                    .single();

                if (error) return { error: error.message };

                return {
                    action: 'PROSPECT_ADDED',
                    prospect: {
                        nova_id: data.candidate_id,
                        internal_record_id: data.id,
                        full_name: data.name,
                        status: data.status,
                        nova_url: data.nova_url,
                    },
                    message: `Successfully added ${name} (Nova ID: ${resolvedNovaId}) to the prospect pipeline.`,
                };
            },
        }),

        /**
         * Update a prospect's pipeline status (move candidate).
         * This is the PRIMARY tool for moving candidates between stages.
         */
        update_prospect_status: tool({
            description: 'Move a candidate to a different pipeline stage by updating their status. Use this when the user says "move to Interested", "mark as Contacted", or similar status change requests. Requires the nova_id from search results.',
            inputSchema: z.object({
                nova_id: z.number().describe('The Nova candidate ID (from search results). This is the nova_id field, NOT internal_record_id.'),
                new_status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']).describe('The target pipeline status to move the candidate to'),
                reason: z.string().optional().describe('Optional reason for the status change (will be appended to notes for audit trail)'),
            }),
            strict: true,
            execute: async ({ nova_id, new_status, reason }) => {
                // First, get current prospect to verify it exists and get current state
                const { data: current, error: fetchError } = await supabase
                    .from('prospects')
                    .select('id, candidate_id, name, status, notes')
                    .eq('candidate_id', nova_id)
                    .maybeSingle();

                if (fetchError) return { error: fetchError.message };
                if (!current) {
                    return {
                        error: `No prospect found with nova_id ${nova_id}. Please verify the ID from search results.`,
                        suggestion: 'Use search_all_candidates to find the correct nova_id for this candidate.',
                    };
                }

                const previousStatus = current.status;

                // Build updated notes with audit trail
                const timestamp = new Date().toISOString().split('T')[0];
                const auditEntry = reason
                    ? `[${timestamp}] Status: ${previousStatus} → ${new_status}. Reason: ${reason}`
                    : `[${timestamp}] Status: ${previousStatus} → ${new_status}`;
                const updatedNotes = current.notes
                    ? `${current.notes}\n${auditEntry}`
                    : auditEntry;

                // Perform the update
                const { data, error } = await supabase
                    .from('prospects')
                    .update({
                        status: new_status,
                        notes: updatedNotes,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('candidate_id', nova_id)
                    .select('id, candidate_id, name, specialty, status, email, phone, notes, nova_url')
                    .single();

                if (error) return { error: error.message };

                // Return sanitized output
                return {
                    action: 'STATUS_UPDATED',
                    previous_status: previousStatus,
                    new_status: new_status,
                    prospect: {
                        nova_id: data.candidate_id,
                        internal_record_id: data.id,
                        full_name: data.name,
                        specialty: data.specialty,
                        status: data.status,
                        email: data.email,
                        phone: data.phone,
                        nova_url: data.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${data.candidate_id}/new-profile/about`,
                    },
                    audit_entry: auditEntry,
                    message: `Successfully moved ${data.name} from "${previousStatus}" to "${new_status}".`,
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

        // ============================================================================
        // COLD OUTREACH BLAST TOOLS
        // ============================================================================

        /**
         * Create a new cold outreach campaign.
         * Sets owner_id for RLS compliance.
         */
        create_campaign: tool({
            description: 'Create a new cold outreach campaign for a travel healthcare position. Provide job details, pay package info, and optional template/hook. Returns campaign_id for adding recipients.',
            inputSchema: z.object({
                position_title: z.string().describe('Job title (e.g., "Exercise Physiologist", "ICU RN")'),
                facility_name: z.string().describe('Facility name (e.g., "Sparrow Eaton Hospital")'),
                city: z.string().describe('City name'),
                state: z.string().length(2).describe('State abbreviation (e.g., "MI", "CA")'),
                start_date: z.string().describe('Contract start date (ISO format: YYYY-MM-DD)'),
                end_date: z.string().describe('Contract end date (ISO format: YYYY-MM-DD)'),
                gross_weekly_pay: z.number().positive().describe('Total weekly gross pay in dollars'),
                // Optional fields
                facility_address: z.string().optional().describe('Facility street address'),
                specialty: z.string().optional().describe('Specialty code (e.g., "SPORT", "ICU")'),
                job_id: z.string().optional().describe('Aya Job ID for reference'),
                weeks_length: z.number().optional().describe('Contract length in weeks'),
                shift_type: z.string().optional().describe('Shift type: Day, Night, or Rotating'),
                hours_per_week: z.number().optional().describe('Hours per week'),
                taxable_hourly_rate: z.number().optional().describe('Taxable hourly rate'),
                weekly_housing_stipend: z.number().optional().describe('Weekly housing stipend'),
                weekly_meals_stipend: z.number().optional().describe('Weekly meals stipend'),
                pay_package_path: z.string().optional().describe('Storage path for pay package screenshot'),
                template_id: z.string().uuid().optional().describe('Template UUID to use for emails'),
                custom_hook: z.string().optional().describe('Custom opening line for emails'),
                custom_closing: z.string().optional().describe('Custom closing for emails'),
            }),
            strict: true,
            execute: async (args) => {
                // Note: Running with Service Role Key - no user session available
                // Default owner for single-user system
                const owner_id = 'kofi.farkye';

                const { data, error } = await supabase
                    .from('cold_outreach_campaigns')
                    .insert({
                        position_title: args.position_title,
                        facility_name: args.facility_name,
                        city: args.city,
                        state: args.state.toUpperCase(),
                        start_date: args.start_date,
                        end_date: args.end_date,
                        gross_weekly_pay: args.gross_weekly_pay,
                        facility_address: args.facility_address,
                        specialty: args.specialty,
                        job_id: args.job_id,
                        weeks_length: args.weeks_length,
                        shift_type: args.shift_type,
                        hours_per_week: args.hours_per_week,
                        taxable_hourly_rate: args.taxable_hourly_rate,
                        weekly_housing_stipend: args.weekly_housing_stipend,
                        weekly_meals_stipend: args.weekly_meals_stipend,
                        pay_package_path: args.pay_package_path,
                        template_id: args.template_id,
                        custom_hook: args.custom_hook,
                        custom_closing: args.custom_closing,
                        owner_id: owner_id,
                        status: 'draft',
                    })
                    .select()
                    .single();

                if (error) return { error: error.message };

                return {
                    action: 'CAMPAIGN_CREATED',
                    campaign_id: data.id,
                    position: `${data.position_title} at ${data.facility_name}`,
                    location: `${data.city}, ${data.state}`,
                    pay: `$${data.gross_weekly_pay}/week`,
                    status: data.status,
                    message: `Campaign created. Use add_recipients to add candidates, then generate_blast_emails to create personalized content.`,
                    next_steps: [
                        `add_recipients(campaign_id: "${data.id}", raw_text: "paste candidate list")`,
                        `generate_blast_emails(campaign_id: "${data.id}")`,
                    ],
                };
            },
        }),

        /**
         * Add recipients to a campaign from raw text.
         * Handles fuzzy parsing and enforces dedupe via email_normalized.
         */
        add_recipients: tool({
            description: 'Add recipients to a cold outreach campaign from pasted text. Parses names and emails from messy input. Deduplicates by email to prevent double-sends. Returns count of inserted, skipped (duplicates), and rejected entries.',
            inputSchema: z.object({
                campaign_id: z.string().uuid().describe('The campaign ID to add recipients to'),
                raw_text: z.string().describe('Raw pasted text containing candidate names and emails. Accepts various formats: CSV, tab-separated, or freeform text.'),
            }),
            strict: true,
            execute: async ({ campaign_id, raw_text }) => {
                // Verify campaign exists and user owns it
                const { data: campaign, error: campaignError } = await supabase
                    .from('cold_outreach_campaigns')
                    .select('id, position_title')
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (campaignError) return { error: campaignError.message };
                if (!campaign) return { error: `Campaign ${campaign_id} not found or access denied.` };

                // Parse raw text into candidates
                // Supports: "First Last, email@example.com" | "First Last\temail" | CSV rows
                const lines = raw_text.split(/[\n\r]+/).filter(line => line.trim());
                const candidates = [];
                const rejected = [];

                // Email regex
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

                for (const line of lines) {
                    const emails = line.match(emailRegex);
                    if (!emails || emails.length === 0) {
                        rejected.push({ line: line.substring(0, 50), reason: 'no_email_found' });
                        continue;
                    }

                    const email = emails[0].toLowerCase().trim();

                    // Extract name: everything before the email, cleaned up
                    let name = line.replace(email, '').replace(/[,\t|;]+/g, ' ').trim();
                    // Remove common noise
                    name = name.replace(/^[\d\s.,-]+/, '').trim();

                    // Split into first/last
                    const nameParts = name.split(/\s+/).filter(p => p.length > 0);
                    const first_name = nameParts[0] || 'Unknown';
                    const last_name = nameParts.slice(1).join(' ') || null;

                    candidates.push({
                        campaign_id,
                        first_name,
                        last_name,
                        email,
                        email_normalized: email.toLowerCase().trim(),
                        status: 'pending',
                    });
                }

                if (candidates.length === 0) {
                    return {
                        error: 'No valid candidates found in the provided text.',
                        rejected,
                        suggestion: 'Ensure each line contains at least one email address.',
                    };
                }

                // Insert with ON CONFLICT DO NOTHING (dedupe)
                const { data: inserted, error: insertError } = await supabase
                    .from('cold_outreach_recipients')
                    .upsert(candidates, {
                        onConflict: 'campaign_id,email_normalized',
                        ignoreDuplicates: true,
                    })
                    .select('id, first_name, last_name, email');

                if (insertError) return { error: insertError.message };

                const insertedCount = inserted?.length || 0;
                const dedupedCount = candidates.length - insertedCount;

                return {
                    action: 'RECIPIENTS_ADDED',
                    campaign_id,
                    inserted: insertedCount,
                    deduped: dedupedCount,
                    rejected: rejected.length,
                    rejected_details: rejected.length > 0 ? rejected.slice(0, 5) : undefined,
                    message: `Added ${insertedCount} recipients. ${dedupedCount} duplicates skipped. ${rejected.length} lines rejected (no email).`,
                    next_step: insertedCount > 0
                        ? `generate_blast_emails(campaign_id: "${campaign_id}")`
                        : 'Fix rejected entries and try again.',
                };
            },
        }),

        /**
         * Generate personalized emails for all pending recipients in a campaign.
         * Uses template + job details to create unique subject/body.
         */
        generate_blast_emails: tool({
            description: 'Generate personalized email content for all pending recipients in a campaign. Uses the campaign template (or default cold_outreach) to create unique subject lines and bodies. Updates recipient status to "generated".',
            inputSchema: z.object({
                campaign_id: z.string().uuid().describe('The campaign ID to generate emails for'),
            }),
            strict: true,
            execute: async ({ campaign_id }) => {
                // Get campaign with template
                const { data: campaign, error: campaignError } = await supabase
                    .from('cold_outreach_campaigns')
                    .select(`
                        *,
                        template:communication_templates(subject_template, body_template)
                    `)
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (campaignError) return { error: campaignError.message };
                if (!campaign) return { error: `Campaign ${campaign_id} not found or access denied.` };

                // Get pending recipients
                const { data: recipients, error: recipientError } = await supabase
                    .from('cold_outreach_recipients')
                    .select('id, first_name, last_name, email, specialty')
                    .eq('campaign_id', campaign_id)
                    .eq('status', 'pending');

                if (recipientError) return { error: recipientError.message };
                if (!recipients?.length) {
                    return { message: 'No pending recipients to generate emails for.', generated_count: 0 };
                }

                // Get template (use linked or fetch default)
                let subjectTemplate = campaign.template?.subject_template;
                let bodyTemplate = campaign.template?.body_template;

                if (!subjectTemplate || !bodyTemplate) {
                    // Fallback to default cold_outreach template
                    const { data: defaultTemplate } = await supabase
                        .from('communication_templates')
                        .select('subject_template, body_template')
                        .eq('name', 'cold_outreach')
                        .eq('is_active', true)
                        .maybeSingle();

                    if (defaultTemplate) {
                        subjectTemplate = subjectTemplate || defaultTemplate.subject_template;
                        bodyTemplate = bodyTemplate || defaultTemplate.body_template;
                    }
                }

                // Default templates if none found
                if (!subjectTemplate) {
                    subjectTemplate = 'Exciting {{position_title}} opportunity in {{city}}, {{state}} - ${{gross_weekly_pay}}/week';
                }
                if (!bodyTemplate) {
                    bodyTemplate = `Hi {{first_name}},

{{custom_hook}}

I'm reaching out about an exciting {{position_title}} position at {{facility_name}} in {{city}}, {{state}}.

**Contract Details:**
- Start Date: {{start_date}}
- Duration: {{weeks_length}} weeks
- Gross Weekly Pay: ${{ gross_weekly_pay }}

{{custom_closing}}

Best regards,
Kofi Farkye
Healthcare Recruiter`;
                }

                // Generate personalized content for each recipient
                const updates = recipients.map(recipient => {
                    const variables = {
                        first_name: recipient.first_name,
                        last_name: recipient.last_name || '',
                        position_title: campaign.position_title,
                        facility_name: campaign.facility_name,
                        city: campaign.city,
                        state: campaign.state,
                        start_date: campaign.start_date,
                        end_date: campaign.end_date,
                        weeks_length: campaign.weeks_length || 'TBD',
                        gross_weekly_pay: campaign.gross_weekly_pay?.toLocaleString() || 'TBD',
                        custom_hook: campaign.custom_hook || "I came across your profile and thought you'd be a great fit.",
                        custom_closing: campaign.custom_closing || "Let me know if you'd like to learn more!",
                    };

                    // Replace {{placeholders}}
                    let subject = subjectTemplate;
                    let body = bodyTemplate;
                    for (const [key, value] of Object.entries(variables)) {
                        const regex = new RegExp(`{{${key}}}`, 'gi');
                        subject = subject.replace(regex, String(value));
                        body = body.replace(regex, String(value));
                    }

                    return {
                        id: recipient.id,
                        generated_subject: subject,
                        generated_body: body,
                        status: 'generated',
                    };
                });

                // Batch update recipients
                let successCount = 0;
                for (const update of updates) {
                    const { error } = await supabase
                        .from('cold_outreach_recipients')
                        .update({
                            generated_subject: update.generated_subject,
                            generated_body: update.generated_body,
                            status: update.status,
                        })
                        .eq('id', update.id);

                    if (!error) successCount++;
                }

                // Update campaign status
                await supabase
                    .from('cold_outreach_campaigns')
                    .update({ status: 'ready' })
                    .eq('id', campaign_id);

                return {
                    action: 'EMAILS_GENERATED',
                    campaign_id,
                    generated_count: successCount,
                    total_recipients: recipients.length,
                    campaign_status: 'ready',
                    message: `Generated ${successCount} personalized emails. Campaign is ready to send.`,
                    next_step: `send_campaign(campaign_id: "${campaign_id}")`,
                    preview: updates.length > 0 ? {
                        subject: updates[0].generated_subject,
                        body_preview: updates[0].generated_body.substring(0, 200) + '...',
                    } : null,
                };
            },
        }),

        /**
         * Generate Outlook deep links for campaign emails.
         * Returns mailto: links for manual sending via Outlook (IT restriction workaround).
         */
        send_campaign: tool({
            description: 'Generate Outlook mailto links for all recipients with status "generated". Returns clickable deep links for manual sending via Outlook. Use this when ready to send the campaign.',
            inputSchema: z.object({
                campaign_id: z.string().uuid().describe('The campaign ID to generate send links for'),
                batch_size: z.number().optional().default(10).describe('Number of mailto links to return per batch (default: 10)'),
                offset: z.number().optional().default(0).describe('Offset for pagination (default: 0)'),
            }),
            strict: true,
            execute: async ({ campaign_id, batch_size, offset }) => {
                // Verify campaign
                const { data: campaign, error: campaignError } = await supabase
                    .from('cold_outreach_campaigns')
                    .select('id, status, position_title, facility_name')
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (campaignError) return { error: campaignError.message };
                if (!campaign) return { error: `Campaign ${campaign_id} not found or access denied.` };

                // Get recipients ready to send (generated status)
                const { data: recipients, error: recipientError, count } = await supabase
                    .from('cold_outreach_recipients')
                    .select('id, first_name, last_name, email, generated_subject, generated_body', { count: 'exact' })
                    .eq('campaign_id', campaign_id)
                    .eq('status', 'generated')
                    .range(offset, offset + batch_size - 1);

                if (recipientError) return { error: recipientError.message };
                if (!recipients?.length) {
                    // Check if all are already sent
                    const { count: sentCount } = await supabase
                        .from('cold_outreach_recipients')
                        .select('id', { count: 'exact', head: true })
                        .eq('campaign_id', campaign_id)
                        .eq('status', 'sent');

                    if (sentCount > 0) {
                        return {
                            message: 'All recipients have been sent. Campaign complete.',
                            campaign_id,
                            sent_count: sentCount,
                        };
                    }

                    return {
                        error: 'No recipients ready to send. Run generate_blast_emails first.',
                        campaign_id,
                        recipients_ready: 0,
                    };
                }

                // Generate Outlook mailto deep links
                // NOTE: Must use encodeURIComponent (not URLSearchParams) because mailto
                // requires %20 for spaces, while URLSearchParams uses + which shows literally
                const outlookLinks = recipients.map(r => {
                    const parts = [];
                    if (r.generated_subject) {
                        parts.push(`subject=${encodeURIComponent(r.generated_subject)}`);
                    }
                    if (r.generated_body) {
                        parts.push(`body=${encodeURIComponent(r.generated_body)}`);
                    }

                    return {
                        id: r.id,
                        name: `${r.first_name} ${r.last_name || ''}`.trim(),
                        email: r.email,
                        mailto_link: `mailto:${r.email}?${parts.join('&')}`,
                    };
                });

                // Update campaign status if first batch
                if (offset === 0) {
                    await supabase
                        .from('cold_outreach_campaigns')
                        .update({ status: 'sending' })
                        .eq('id', campaign_id);
                }

                const totalRemaining = (count || 0) - batch_size;
                const hasMore = totalRemaining > 0;

                return {
                    action: 'OUTLOOK_LINKS_GENERATED',
                    campaign_id,
                    campaign: `${campaign.position_title} at ${campaign.facility_name}`,
                    batch: {
                        offset,
                        count: recipients.length,
                        total_remaining: Math.max(0, totalRemaining),
                        has_more: hasMore,
                    },
                    outlook_links: outlookLinks,
                    message: `Generated ${recipients.length} Outlook links. Click each to open in Outlook and send.`,
                    next_step: hasMore
                        ? `send_campaign(campaign_id: "${campaign_id}", offset: ${offset + batch_size})`
                        : 'Mark recipients as sent after clicking all links.',
                    instructions: 'Click each mailto link to open Outlook with pre-filled email. After sending, use mark_recipient_sent to update status.',
                };
            },
        }),

        /**
         * Get campaign status and recipient counts.
         */
        campaign_status: tool({
            description: 'Get the status of a cold outreach campaign including recipient counts by status (pending, generated, sent, opened, replied). Use this to monitor campaign progress.',
            inputSchema: z.object({
                campaign_id: z.string().uuid().optional().describe('Specific campaign ID to check. If not provided, returns all recent campaigns.'),
            }),
            strict: true,
            execute: async ({ campaign_id }) => {
                if (campaign_id) {
                    // Get specific campaign
                    const { data: campaign, error: campaignError } = await supabase
                        .from('cold_outreach_campaigns')
                        .select('*')
                        .eq('id', campaign_id)
                        .maybeSingle();

                    if (campaignError) return { error: campaignError.message };
                    if (!campaign) return { error: `Campaign ${campaign_id} not found or access denied.` };

                    // Get recipient counts by status
                    const { data: recipients, error: recipientError } = await supabase
                        .from('cold_outreach_recipients')
                        .select('status')
                        .eq('campaign_id', campaign_id);

                    if (recipientError) return { error: recipientError.message };

                    const counts = {
                        pending: 0,
                        generated: 0,
                        sent: 0,
                        opened: 0,
                        replied: 0,
                        bounced: 0,
                        skipped: 0,
                    };

                    (recipients || []).forEach(r => {
                        if (counts.hasOwnProperty(r.status)) {
                            counts[r.status]++;
                        }
                    });

                    return {
                        action: 'CAMPAIGN_STATUS',
                        campaign: {
                            id: campaign.id,
                            position: `${campaign.position_title} at ${campaign.facility_name}`,
                            location: `${campaign.city}, ${campaign.state}`,
                            pay: `$${campaign.gross_weekly_pay}/week`,
                            status: campaign.status,
                            created_at: campaign.created_at,
                            sent_at: campaign.sent_at,
                        },
                        recipients: {
                            total: recipients?.length || 0,
                            ...counts,
                        },
                    };
                } else {
                    // Get all recent campaigns
                    const { data: campaigns, error } = await supabase
                        .from('cold_outreach_campaigns')
                        .select('id, position_title, facility_name, city, state, status, created_at, sent_at')
                        .order('created_at', { ascending: false })
                        .limit(10);

                    if (error) return { error: error.message };

                    return {
                        action: 'CAMPAIGNS_LIST',
                        campaigns: (campaigns || []).map(c => ({
                            id: c.id,
                            position: `${c.position_title} at ${c.facility_name}`,
                            location: `${c.city}, ${c.state}`,
                            status: c.status,
                            created_at: c.created_at,
                            sent_at: c.sent_at,
                        })),
                        count: campaigns?.length || 0,
                        message: campaigns?.length
                            ? `Found ${campaigns.length} recent campaigns.`
                            : 'No campaigns found. Use create_campaign to start one.',
                    };
                }
            },
        }),

        /**
         * Mark recipients as sent after clicking Outlook links.
         * Used for manual send tracking.
         */
        mark_recipient_sent: tool({
            description: 'Mark one or more recipients as "sent" after manually sending via Outlook. Call this after clicking the mailto links to update tracking status.',
            inputSchema: z.object({
                recipient_ids: z.array(z.string().uuid()).optional().describe('Array of recipient IDs to mark as sent'),
                campaign_id: z.string().uuid().optional().describe('Mark ALL generated recipients in this campaign as sent'),
            }),
            strict: true,
            execute: async ({ recipient_ids, campaign_id }) => {
                if (!recipient_ids && !campaign_id) {
                    return { error: 'Either recipient_ids or campaign_id must be provided.' };
                }

                const sentAt = new Date().toISOString();
                let updated = 0;

                if (campaign_id) {
                    // Mark all generated recipients in the campaign as sent
                    const { data, error } = await supabase
                        .from('cold_outreach_recipients')
                        .update({ status: 'sent', sent_at: sentAt })
                        .eq('campaign_id', campaign_id)
                        .eq('status', 'generated')
                        .select('id');

                    if (error) return { error: error.message };
                    updated = data?.length || 0;

                    // Update campaign status if all sent
                    if (updated > 0) {
                        await supabase
                            .from('cold_outreach_campaigns')
                            .update({ status: 'sent', sent_at: sentAt })
                            .eq('id', campaign_id);
                    }
                } else if (recipient_ids) {
                    // Mark specific recipients
                    for (const id of recipient_ids) {
                        const { error } = await supabase
                            .from('cold_outreach_recipients')
                            .update({ status: 'sent', sent_at: sentAt })
                            .eq('id', id);

                        if (!error) updated++;
                    }
                }

                return {
                    action: 'RECIPIENTS_MARKED_SENT',
                    updated_count: updated,
                    sent_at: sentAt,
                    message: `Marked ${updated} recipient(s) as sent.`,
                };
            },
        }),
    };
}
