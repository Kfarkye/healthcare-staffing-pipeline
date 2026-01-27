import { tool } from 'ai';
import { z } from 'zod';

/**
 * Command Center Tools (v3.3 - Pristine Production Master)
 * 
 * Architecture:
 * - Fault Tolerance: Promise.allSettled for parallel data fetching
 * - Performance: Chunked Batch Upserts for heavy write operations
 * - Safety: Strict Zod schemas, input sanitization, and UUID type safety
 * - Logic: Full restoration of pipeline analytics and campaign status tools
 */
export function createCommandCenterTools(supabase) {

    /**
     * Helper: Process items in chunks to avoid Supabase payload limits (4.5MB)
     */
    const chunkArray = (array, size) => {
        const chunked = [];
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    };

    return {
        // ============================================================================
        // 1. SYSTEM DIAGNOSTICS
        // ============================================================================

        debug_system: tool({
            description: 'Run a system diagnostic to check database connectivity and table row counts. Use this when searches return unexpected empty results.',
            inputSchema: z.object({}),
            strict: true,
            execute: async () => {
                const results = await Promise.allSettled([
                    supabase.from('prospects').select('*', { count: 'exact', head: true }),
                    supabase.from('travel_candidates').select('*', { count: 'exact', head: true }),
                    supabase.from('communication_templates').select('*', { count: 'exact', head: true }),
                    supabase.from('cold_outreach_campaigns').select('*', { count: 'exact', head: true }),
                ]);

                const [prospects, travelers, templates, campaigns] = results;

                return {
                    status: 'diagnostic_complete',
                    timestamp: new Date().toISOString(),
                    counts: {
                        prospects: prospects.status === 'fulfilled' ? prospects.value.count : 'Error',
                        travel_candidates: travelers.status === 'fulfilled' ? travelers.value.count : 'Error',
                        templates: templates.status === 'fulfilled' ? templates.value.count : 'Error',
                        campaigns: campaigns.status === 'fulfilled' ? campaigns.value.count : 'Error',
                    },
                    health: {
                        db_connection: results.every(r => r.status === 'fulfilled' && !r.value.error),
                        errors: results.filter(r => r.status === 'rejected' || r.value.error).map(r => r.reason || r.value.error.message),
                    }
                };
            },
        }),

        // ============================================================================
        // 2. CANDIDATE SEARCH (Unified & Targeted)
        // ============================================================================

        search_all_candidates: tool({
            description: 'Search for a candidate by name across ALL sources (prospects AND active travelers). This is the PRIMARY search tool.',
            inputSchema: z.object({
                name: z.string().min(1).describe('The candidate name to search for (partial match supported)'),
            }),
            strict: true,
            execute: async ({ name }) => {
                const cleanName = name.trim();

                // Parallel Execution with Fault Tolerance
                const [prospectsResult, travelersResult] = await Promise.allSettled([
                    supabase
                        .from('prospects')
                        .select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url')
                        .ilike('name', `%${cleanName}%`)
                        .limit(15),
                    supabase
                        .from('travel_candidates')
                        .select('id, candidate_id, candidate_name, email, cell_phone, facility, start_date, end_date, contract_status')
                        .ilike('candidate_name', `%${cleanName}%`)
                        .limit(15),
                ]);

                const prospectsData = prospectsResult.status === 'fulfilled' ? (prospectsResult.value.data ?? []) : [];
                const travelersData = travelersResult.status === 'fulfilled' ? (travelersResult.value.data ?? []) : [];

                const prospects = prospectsData.map(p => ({
                    nova_id: p.candidate_id,
                    internal_record_id: p.id,
                    full_name: p.name,
                    info: `${p.specialty || 'Gen'} | ${p.home_state || 'N/A'} | ${p.status}`,
                    status: p.status,
                    email: p.email,
                    nova_url: p.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${p.candidate_id}/new-profile/about`,
                    source: 'prospect',
                }));

                const activeTravelers = travelersData.map(t => ({
                    nova_id: t.candidate_id,
                    internal_record_id: t.id,
                    full_name: t.candidate_name,
                    info: `${t.facility} (${t.contract_status})`,
                    status: t.contract_status,
                    email: t.email,
                    nova_url: `https://nova.ayahealthcare.com/#/recruiting/candidates/${t.candidate_id}/new-profile/about`,
                    source: 'active_traveler',
                }));

                const totalFound = prospects.length + activeTravelers.length;

                const errors = [];
                if (prospectsResult.status === 'rejected') errors.push(`Prospects DB Error: ${prospectsResult.reason}`);
                if (travelersResult.status === 'rejected') errors.push(`Travelers DB Error: ${travelersResult.reason}`);

                return {
                    prospects,
                    active_travelers: activeTravelers,
                    total_found: totalFound,
                    system_warnings: errors.length > 0 ? errors : undefined,
                    message: totalFound === 0
                        ? `No candidates found matching "${name}".`
                        : `Found ${totalFound} candidate(s).`,
                };
            },
        }),

        search_prospects: tool({
            description: 'Search the prospect pipeline specifically. Use for filtering by specialty, state, or status.',
            inputSchema: z.object({
                name: z.string().optional(),
                specialty: z.string().optional(),
                home_state: z.string().optional(),
                status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']).optional(),
            }),
            strict: true,
            execute: async ({ name, specialty, home_state, status }) => {
                let query = supabase.from('prospects').select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url');

                if (name) query = query.ilike('name', `%${name.trim()}%`);
                if (specialty) query = query.ilike('specialty', `%${specialty.trim()}%`);
                if (home_state) query = query.ilike('home_state', `%${home_state.trim()}%`);
                if (status) query = query.eq('status', status);

                const { data, error } = await query.limit(20);
                if (error) return { error: error.message };

                return {
                    prospects: data ?? [],
                    count: data?.length ?? 0,
                };
            },
        }),

        search_travel_list: tool({
            description: 'Search the active traveler list. Use for finding current contractors or upcoming ends.',
            inputSchema: z.object({
                name: z.string().optional(),
                facility: z.string().optional(),
                ending_soon: z.boolean().optional().describe('Filter for contracts ending within 30 days'),
            }),
            strict: true,
            execute: async ({ name, facility, ending_soon }) => {
                let query = supabase.from('travel_candidates').select('id, candidate_id, candidate_name, facility, start_date, end_date, email');

                if (name) query = query.ilike('candidate_name', `%${name.trim()}%`);
                if (facility) query = query.ilike('facility', `%${facility.trim()}%`);
                if (ending_soon) {
                    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    query = query.lte('end_date', thirtyDaysOut).gte('end_date', new Date().toISOString().split('T')[0]);
                }

                const { data, error } = await query.limit(20);
                if (error) return { error: error.message };

                return {
                    travelers: data ?? [],
                    count: data?.length ?? 0,
                };
            },
        }),

        get_prospect_details: tool({
            description: 'Retrieve full profile details for a specific candidate by nova_id (preferred) or name.',
            inputSchema: z.object({
                nova_id: z.number().optional(),
                name: z.string().optional(),
            }),
            strict: true,
            execute: async ({ nova_id, name }) => {
                if (!nova_id && !name) return { error: 'Provide nova_id or name.' };

                // 1. Check Prospects
                let prospectQuery = supabase.from('prospects').select('*');
                if (nova_id) prospectQuery = prospectQuery.eq('candidate_id', nova_id);
                else if (name) prospectQuery = prospectQuery.ilike('name', `%${name.trim()}%`);

                const { data: prospect } = await prospectQuery.maybeSingle();

                if (prospect) {
                    return {
                        ...prospect,
                        nova_url: prospect.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${prospect.candidate_id}/new-profile/about`,
                        source: 'prospect',
                    };
                }

                // 2. Check Travelers
                let travelerQuery = supabase.from('travel_candidates').select('*');
                if (nova_id) travelerQuery = travelerQuery.eq('candidate_id', nova_id);
                else if (name) travelerQuery = travelerQuery.ilike('candidate_name', `%${name.trim()}%`);

                const { data: traveler } = await travelerQuery.maybeSingle();

                if (traveler) {
                    return {
                        ...traveler,
                        full_name: traveler.candidate_name,
                        source: 'active_traveler',
                    };
                }

                return { message: 'Candidate not found.' };
            },
        }),

        // ============================================================================
        // 3. PROSPECT MANAGEMENT
        // ============================================================================

        add_prospect: tool({
            description: 'Create a new prospect record. REQUIRES nova_id.',
            inputSchema: z.object({
                name: z.string().min(1),
                nova_id: z.number().optional(),
                nova_url: z.string().optional(),
                specialty: z.string().optional(),
                home_state: z.string().optional(),
                email: z.string().email().optional(),
                phone: z.string().optional(),
                notes: z.string().optional(),
            }),
            strict: true,
            execute: async ({ name, nova_id, nova_url, specialty, home_state, email, phone, notes }) => {
                let resolvedNovaId = nova_id;
                let resolvedNovaUrl = nova_url;

                // Robust parsing: extract ID from URL
                if (!resolvedNovaId && nova_url) {
                    const match = nova_url.match(/\/candidates\/(\d+)(?:\/|\?|$)/);
                    if (match) resolvedNovaId = parseInt(match[1], 10);
                }

                if (!resolvedNovaId) return { error: 'Nova ID is required. Ask user for ID or Profile URL.' };
                if (!resolvedNovaUrl) resolvedNovaUrl = `https://nova.ayahealthcare.com/#/recruiting/candidates/${resolvedNovaId}/new-profile/about`;

                const { data, error } = await supabase
                    .from('prospects')
                    .insert({
                        name: name.trim(),
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
                return { action: 'PROSPECT_ADDED', prospect: data };
            },
        }),

        update_prospect_status: tool({
            description: 'Move a candidate to a different pipeline stage.',
            inputSchema: z.object({
                nova_id: z.number(),
                new_status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']),
                reason: z.string().optional(),
            }),
            strict: true,
            execute: async ({ nova_id, new_status, reason }) => {
                const { data: current } = await supabase.from('prospects').select('status, notes, name').eq('candidate_id', nova_id).maybeSingle();
                if (!current) return { error: 'Prospect not found.' };

                const timestamp = new Date().toISOString().split('T')[0];
                const auditEntry = reason ? `[${timestamp}] ${current.status} -> ${new_status}: ${reason}` : `[${timestamp}] ${current.status} -> ${new_status}`;
                const updatedNotes = current.notes ? `${current.notes}\n${auditEntry}` : auditEntry;

                const { data, error } = await supabase
                    .from('prospects')
                    .update({ status: new_status, notes: updatedNotes, updated_at: new Date().toISOString() })
                    .eq('candidate_id', nova_id)
                    .select()
                    .single();

                if (error) return { error: error.message };
                return { action: 'STATUS_UPDATED', prospect: data };
            },
        }),

        // ============================================================================
        // 4. COLD OUTREACH CAMPAIGNS
        // ============================================================================

        create_campaign: tool({
            description: 'Initialize a new cold outreach campaign. Returns campaign_id.',
            inputSchema: z.object({
                position_title: z.string(),
                facility_name: z.string(),
                city: z.string(),
                state: z.string().length(2),
                start_date: z.string(),
                end_date: z.string(),
                gross_weekly_pay: z.number().positive(),
                facility_address: z.string().optional(),
                specialty: z.string().optional(),
                job_id: z.string().optional(),
                weeks_length: z.number().optional(),
                shift_type: z.string().optional(),
                hours_per_week: z.number().optional(),
                taxable_hourly_rate: z.number().optional(),
                weekly_housing_stipend: z.number().optional(),
                weekly_meals_stipend: z.number().optional(),
                pay_package_path: z.string().optional(),
                template_id: z.string().uuid().optional(),
                custom_hook: z.string().optional(),
                custom_closing: z.string().optional(),
            }),
            strict: true,
            execute: async (args) => {
                // FIX: Removed 'owner_id' assignment (handled by DB defaults)
                const { data, error } = await supabase
                    .from('cold_outreach_campaigns')
                    .insert({
                        ...args,
                        state: args.state.toUpperCase(),
                        status: 'draft',
                    })
                    .select('id, position_title, facility_name')
                    .single();

                if (error) return { error: error.message };

                return {
                    action: 'CAMPAIGN_CREATED',
                    campaign_id: data.id,
                    message: `Campaign created for ${data.position_title} at ${data.facility_name}.`,
                    next_steps: [`add_recipients(campaign_id: "${data.id}", raw_text: "...")`],
                };
            },
        }),

        add_recipients: tool({
            description: 'Add recipients to a campaign from text/CSV. Robust parsing and deduplication.',
            inputSchema: z.object({
                campaign_id: z.string().uuid(),
                raw_text: z.string(),
            }),
            strict: true,
            execute: async ({ campaign_id, raw_text }) => {
                const { data: campaign } = await supabase.from('cold_outreach_campaigns').select('id').eq('id', campaign_id).maybeSingle();
                if (!campaign) return { error: 'Campaign not found.' };

                const lines = raw_text.split(/[\n\r]+/).filter(line => line.trim());
                const candidates = [];
                const rejected = [];
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

                for (const line of lines) {
                    const emails = line.match(emailRegex);
                    if (!emails?.length) {
                        rejected.push({ line: line.substring(0, 50), reason: 'no_email' });
                        continue;
                    }

                    const email = emails[0].toLowerCase().trim();
                    let namePart = line.replace(email, '').replace(/[,;\t|]+/g, ' ').trim();
                    namePart = namePart.replace(/^[\d\s.-]+/, '');

                    const parts = namePart.split(/\s+/).filter(p => p.length > 0);
                    const first_name = parts[0] || 'Unknown';
                    const last_name = parts.slice(1).join(' ') || null;

                    candidates.push({
                        campaign_id,
                        first_name,
                        last_name,
                        email,
                        email_normalized: email,
                        status: 'pending',
                    });
                }

                if (!candidates.length) return { error: 'No valid emails found.', rejected };

                const { data, error } = await supabase
                    .from('cold_outreach_recipients')
                    .upsert(candidates, { onConflict: 'campaign_id,email_normalized', ignoreDuplicates: true })
                    .select('id');

                if (error) return { error: error.message };
                return { action: 'RECIPIENTS_ADDED', count: data?.length || 0, next_steps: [`generate_blast_emails(campaign_id: "${campaign_id}")`] };
            },
        }),

        generate_blast_emails: tool({
            description: 'Generate personalized emails for pending recipients. Uses optimized batch processing.',
            inputSchema: z.object({ campaign_id: z.string().uuid() }),
            strict: true,
            execute: async ({ campaign_id }) => {
                const { data: campaign } = await supabase
                    .from('cold_outreach_campaigns')
                    .select('*, template:communication_templates(subject_template, body_template)')
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (!campaign) return { error: 'Campaign not found.' };

                const { data: recipients } = await supabase
                    .from('cold_outreach_recipients')
                    .select('id, first_name, last_name, email')
                    .eq('campaign_id', campaign_id)
                    .eq('status', 'pending');

                if (!recipients?.length) return { message: 'No pending recipients.' };

                let { subject_template: sT, body_template: bT } = campaign.template || {};
                if (!sT || !bT) {
                    const { data: def } = await supabase.from('communication_templates').select('subject_template, body_template').eq('name', 'cold_outreach').maybeSingle();
                    sT = sT || def?.subject_template || 'Opportunity: {{position_title}} at {{facility_name}}';
                    bT = bT || def?.body_template || 'Hi {{first_name}},\n\n{{custom_hook}}\n\n{{position_title}} position available...';
                }

                const updates = recipients.map(r => {
                    const vars = {
                        first_name: r.first_name,
                        last_name: r.last_name || '',
                        position_title: campaign.position_title,
                        facility_name: campaign.facility_name,
                        city: campaign.city,
                        state: campaign.state,
                        gross_weekly_pay: campaign.gross_weekly_pay?.toLocaleString() || 'TBD',
                        start_date: campaign.start_date,
                        weeks_length: campaign.weeks_length,
                        custom_hook: campaign.custom_hook || '',
                        custom_closing: campaign.custom_closing || '',
                    };

                    let s = sT, b = bT;
                    for (const [k, v] of Object.entries(vars)) {
                        const reg = new RegExp(`{{${k}}}`, 'gi');
                        s = s.replace(reg, String(v || ''));
                        b = b.replace(reg, String(v || ''));
                    }

                    return {
                        id: r.id,
                        campaign_id: campaign_id,
                        generated_subject: s,
                        generated_body: b,
                        status: 'generated',
                        updated_at: new Date().toISOString(),
                    };
                });

                const chunked = chunkArray(updates, 100);
                let count = 0;
                for (const chunk of chunked) {
                    const { data, error } = await supabase.from('cold_outreach_recipients').upsert(chunk).select('id');
                    if (!error) count += (data?.length || 0);
                }

                await supabase.from('cold_outreach_campaigns').update({ status: 'ready' }).eq('id', campaign_id);
                return { action: 'EMAILS_GENERATED', count, next_steps: [`send_campaign(campaign_id: "${campaign_id}")`] };
            },
        }),

        send_campaign: tool({
            description: 'Generate Outlook mailto links for manual sending.',
            inputSchema: z.object({
                campaign_id: z.string().uuid(),
                batch_size: z.number().default(10),
                offset: z.number().default(0),
            }),
            strict: true,
            execute: async ({ campaign_id, batch_size, offset }) => {
                const { data, count } = await supabase
                    .from('cold_outreach_recipients')
                    .select('id, first_name, last_name, email, generated_subject, generated_body', { count: 'exact' })
                    .eq('campaign_id', campaign_id)
                    .eq('status', 'generated')
                    .range(offset, offset + batch_size - 1);

                if (!data?.length) return { message: 'No emails ready to send.' };

                const links = data.map(r => ({
                    id: r.id,
                    name: `${r.first_name} ${r.last_name || ''}`.trim(),
                    mailto: `mailto:${r.email}?subject=${encodeURIComponent(r.generated_subject)}&body=${encodeURIComponent(r.generated_body)}`
                }));

                if (offset === 0) await supabase.from('cold_outreach_campaigns').update({ status: 'sending' }).eq('id', campaign_id);

                return {
                    action: 'OUTLOOK_LINKS_GENERATED',
                    links,
                    has_more: (count || 0) > (offset + batch_size),
                    total_remaining: Math.max(0, (count || 0) - (offset + batch_size)),
                    next_step: 'mark_recipient_sent',
                };
            },
        }),

        mark_recipient_sent: tool({
            description: 'Mark recipients as sent after clicking links.',
            inputSchema: z.object({
                recipient_ids: z.array(z.string().uuid()).optional(),
                campaign_id: z.string().uuid().optional(),
            }),
            strict: true,
            execute: async ({ recipient_ids, campaign_id }) => {
                const sentAt = new Date().toISOString();
                let query = supabase.from('cold_outreach_recipients').update({ status: 'sent', sent_at: sentAt });

                if (campaign_id) {
                    query = query.eq('campaign_id', campaign_id).eq('status', 'generated');
                    await supabase.from('cold_outreach_campaigns').update({ status: 'sent', sent_at: sentAt }).eq('id', campaign_id);
                } else if (recipient_ids?.length) {
                    query = query.in('id', recipient_ids);
                } else {
                    return { error: 'Provide recipient_ids or campaign_id.' };
                }

                const { data } = await query.select('id');
                return { action: 'RECIPIENTS_MARKED_SENT', count: data?.length || 0 };
            },
        }),

        campaign_status: tool({
            description: 'Get campaign progress statistics. Search by facility, position, or city.',
            inputSchema: z.object({
                campaign_id: z.string().uuid().optional(),
                facility_name: z.string().optional().describe('Search campaigns by facility name'),
                position_title: z.string().optional().describe('Search campaigns by position'),
                city: z.string().optional().describe('Search campaigns by city'),
            }),
            strict: true,
            execute: async ({ campaign_id, facility_name, position_title, city }) => {
                // Specific campaign by ID
                if (campaign_id) {
                    const { data: c } = await supabase.from('cold_outreach_campaigns').select('*').eq('id', campaign_id).maybeSingle();
                    if (!c) return { error: 'Campaign not found.' };

                    const { data: r } = await supabase.from('cold_outreach_recipients').select('status').eq('campaign_id', campaign_id);
                    const counts = {};
                    (r || []).forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);
                    return { action: 'CAMPAIGN_STATUS', campaign: c, stats: counts };
                }

                // Search by filters
                let query = supabase.from('cold_outreach_campaigns').select('id, position_title, facility_name, city, state, status, gross_weekly_pay, start_date, end_date, created_at');

                if (facility_name) query = query.ilike('facility_name', `%${facility_name.trim()}%`);
                if (position_title) query = query.ilike('position_title', `%${position_title.trim()}%`);
                if (city) query = query.ilike('city', `%${city.trim()}%`);

                const { data } = await query.order('created_at', { ascending: false }).limit(10);

                if (!data?.length && (facility_name || position_title || city)) {
                    return {
                        action: 'CAMPAIGNS_LIST',
                        campaigns: [],
                        message: `No campaigns found matching: ${[facility_name, position_title, city].filter(Boolean).join(', ')}`
                    };
                }

                return { action: 'CAMPAIGNS_LIST', campaigns: data || [] };
            },
        }),

        // ============================================================================
        // 5. UTILITIES
        // ============================================================================

        list_email_templates: tool({
            description: 'List available templates.',
            inputSchema: z.object({ category: z.enum(['active', 'prospect', 'retention']).optional() }),
            strict: true,
            execute: async ({ category }) => {
                let query = supabase.from('communication_templates').select('name, category, description').eq('is_active', true).order('category');
                if (category) query = query.eq('category', category);
                const { data, error } = await query;
                if (error) return { error: error.message };
                return { templates: data ?? [], count: data?.length ?? 0 };
            },
        }),

        get_template: tool({
            description: 'Retrieve template content.',
            inputSchema: z.object({ category: z.enum(['active', 'prospect', 'retention']), template_name: z.string() }),
            strict: true,
            execute: async ({ category, template_name }) => {
                const { data, error } = await supabase.from('communication_templates').select('subject_template, body_template, required_variables, description').eq('category', category).eq('name', template_name).eq('is_active', true).maybeSingle();
                if (error) return { error: error.message };
                if (!data) return { error: `Template "${template_name}" not found.` };
                return { action: 'TEMPLATE_RETRIEVED', template: data };
            },
        }),

        get_pipeline_brief: tool({
            description: 'Generate executive summary of candidate pipeline.',
            inputSchema: z.object({}),
            strict: true,
            execute: async () => {
                const { data: prospects, error } = await supabase.from('prospects').select('status, specialty');
                if (error) return { error: error.message };

                const byStatus = {};
                const bySpecialty = {};
                (prospects || []).forEach(p => {
                    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
                    if (p.specialty) bySpecialty[p.specialty] = (bySpecialty[p.specialty] || 0) + 1;
                });

                return { action: 'PIPELINE_BRIEF', total: prospects?.length || 0, by_status: byStatus, by_specialty: bySpecialty };
            },
        }),

        calculate_pay_package: tool({
            description: 'Calculate pay package.',
            inputSchema: z.object({
                target_gross: z.number().positive(),
                state: z.string().length(2),
                city: z.string(),
                hours: z.number().default(36),
                specialty: z.string().optional(),
                profession: z.string().optional().describe('e.g. "RN" (default)'),
            }),
            strict: true,
            execute: async ({ target_gross, state, city, hours, specialty, profession }) => {
                const { data, error } = await supabase.rpc('calculate_pay_package', {
                    p_target_gross: target_gross,
                    p_hours_per_week: hours ?? 36,
                    p_state: state.toUpperCase(),
                    p_city: city,
                    p_profession: profession || 'RN',
                    p_specialty: specialty || 'General',
                    p_job_id: 'generated',
                });

                if (error) return { error: error.message };
                return { action: 'PAY_PACKAGE_CALCULATED', breakdown: data };
            },
        }),

        create_follow_up: tool({
            description: 'Schedule a follow-up task.',
            inputSchema: z.object({
                candidate_id: z.number(),
                scheduled_date: z.string(),
                follow_up_type: z.enum(['active', 'rotation']),
                notes: z.string().optional(),
            }),
            strict: true,
            execute: async (args) => {
                const { data, error } = await supabase.from('follow_ups').insert({
                    prospect_id: args.candidate_id,
                    scheduled_date: args.scheduled_date,
                    follow_up_type: args.follow_up_type,
                    notes: args.notes,
                    status: 'pending',
                }).select().single();
                if (error) return { error: error.message };
                return { message: 'Follow-up created.', task: data };
            },
        }),

        search_knowledge: tool({
            description: 'Search internal knowledge base.',
            inputSchema: z.object({ query: z.string().min(1), category: z.enum(['benefits', 'faq', 'policies']).optional() }),
            strict: true,
            execute: async ({ query, category }) => {
                let dbQuery = supabase.from('knowledge_base').select('title, content, category').or(`title.ilike.%${query}%,content.ilike.%${query}%`).limit(5);
                if (category) dbQuery = dbQuery.eq('category', category);
                const { data, error } = await dbQuery;
                if (error) return { error: error.message };
                return { results: data || [], count: data?.length || 0 };
            },
        }),

        set_ui_state: tool({
            description: 'Update Dashboard UI state.',
            inputSchema: z.object({
                filter_specialty: z.string().optional(),
                filter_status: z.string().optional(),
                search_query: z.string().optional(),
                view_mode: z.enum(['grid', 'list', 'kanban']).optional(),
            }),
            strict: true,
            execute: async (args) => ({ action: 'SET_UI_STATE', state: args, message: 'UI updated.' }),
        }),
    };
}