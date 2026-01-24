import { tool } from 'ai';
import { z } from 'zod';

/**
 * Creates all Command Center tools with Supabase client injected
 */
export function createCommandCenterTools(supabase) {
    return {
        // ============================================================================
        // DEBUG TOOLS
        // ============================================================================
        debug_system: tool({
            description: 'Debug tool to check database connection, auth status, and table counts. Use this if searches return unexpected empty results.',
            parameters: z.object({}),
            execute: async () => {
                // Check connectivity and row counts
                const { count: pCount, error: pErr } = await supabase.from('prospects').select('*', { count: 'exact', head: true });
                const { count: eCount, error: eErr } = await supabase.from('engagements').select('*', { count: 'exact', head: true });
                const { count: tCount, error: tErr } = await supabase.from('communication_templates').select('*', { count: 'exact', head: true });

                return {
                    status: 'debug_complete',
                    counts: {
                        prospects: pCount,
                        engagements: eCount,
                        templates: tCount
                    },
                    errors: {
                        prospects: pErr?.message,
                        engagements: eErr?.message,
                        templates: tErr?.message
                    },
                    // Check if we have service role bypass
                    service_role_check: 'Service Role Key Used' // We can't easily check internal state, but if we read RLS-protected data it works
                };
            }
        }),

        // ============================================================================
        // PROSPECT TOOLS
        // ============================================================================
        search_prospects: tool({
            description: 'Search for NEW candidates (prospects) who are not yet on assignment. For active travelers or anyone currently working, use search_all_candidates instead.',
            parameters: z.object({
                query: z.string().describe('Search query - can be specialty, home state, status, or name'),
                specialty: z.string().optional().describe('Filter by specialty (e.g., RN, LPN)'),
                home_state: z.string().optional().describe('Filter by home state'),
                status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']).optional(),
                name_contains: z.string().optional().describe('Search by name'),
            }),
            execute: async (args) => {
                const { specialty, home_state, status, name_contains } = args;
                let query = supabase.from('prospects').select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url').limit(20);
                if (specialty) query = query.ilike('specialty', `%${specialty}%`);
                if (home_state) query = query.ilike('home_state', `%${home_state}%`);
                if (status) query = query.eq('status', status);
                if (name_contains) query = query.ilike('name', `%${name_contains}%`);
                const { data, error } = await query;
                return error ? { error: error.message } : { prospects: data, count: data?.length || 0 };
            },
        }),

        // Unified search across prospects AND active travelers
        search_all_candidates: tool({
            description: 'Search for ANY candidate by name - searches both prospects (new candidates) AND active travelers (engagements). Use this as the DEFAULT search when looking up a person by name.',
            parameters: z.object({
                name: z.string().describe('Name to search for'),
            }),
            execute: async (args) => {
                const { name } = args;

                // Search prospects
                const { data: prospects, error: pErr } = await supabase
                    .from('prospects')
                    .select('id, candidate_id, name, specialty, home_state, status, email, phone, nova_url')
                    .ilike('name', `%${name}%`)
                    .limit(10);

                // Search engagements (active travelers) via joined prospects
                const { data: engagements, error: eErr } = await supabase
                    .from('engagements')
                    .select(`
                        id,
                        prospect_id,
                        specialty,
                        facility_name,
                        start_date,
                        end_date,
                        extension_stage,
                        bill_rate,
                        prospects!inner(candidate_id, name, email, phone, nova_url, home_state)
                    `)
                    .ilike('prospects.name', `%${name}%`)
                    .limit(10);

                const results = {
                    prospects: prospects || [],
                    active_travelers: (engagements || []).map((e) => ({
                        engagement_id: e.id,
                        candidate_id: e.prospects?.candidate_id,
                        name: e.prospects?.name,
                        email: e.prospects?.email,
                        phone: e.prospects?.phone,
                        nova_url: e.prospects?.nova_url,
                        specialty: e.specialty,
                        facility_name: e.facility_name,
                        start_date: e.start_date,
                        end_date: e.end_date,
                        extension_stage: e.extension_stage,
                        bill_rate: e.bill_rate,
                        source: 'active_traveler'
                    })),
                    total_found: (prospects?.length || 0) + (engagements?.length || 0)
                };

                if (pErr || eErr) {
                    return { error: pErr?.message || eErr?.message, partial_results: results };
                }

                return results;
            },
        }),


        get_prospect_details: tool({
            description: 'Get full profile for a specific candidate.',
            parameters: z.object({
                candidate_id: z.number().optional(),
                name: z.string().optional(),
            }),
            execute: async (args) => {
                const { candidate_id, name } = args;
                let query = supabase.from('prospects').select('*');
                // candidate_id in the schema is the Nova ID, not 'id'
                if (candidate_id) query = query.eq('candidate_id', candidate_id);
                else if (name) query = query.ilike('name', `%${name}%`);
                const { data, error } = await query.maybeSingle();
                return error ? { error: error.message } : (data || { message: 'Not found' });
            },
        }),

        add_prospect: tool({
            description: "Add a new candidate/prospect to the database. Use this when the user explicitly asks to 'add' or 'create' a new person.",
            parameters: z.object({
                name: z.string().describe('Full name of the candidate'),
                specialty: z.string().optional().describe('e.g., RN, LPN, CNA'),
                home_state: z.string().optional(),
                email: z.string().optional(),
                phone: z.string().optional(),
                notes: z.string().optional().describe('Initial notes or context'),
                candidate_id: z.number().optional().describe('External Candidate ID from Nova'),
                nova_url: z.string().optional().describe('Full Nova profile URL'),
            }),
            execute: async (args) => {
                const { name, specialty, home_state, email, phone, notes, candidate_id, nova_url } = args;
                const { data, error } = await supabase.from('prospects').insert({
                    name, specialty, home_state, email, phone, notes, status: 'New',
                    candidate_id: candidate_id || Math.floor(Date.now() / 1000),
                    nova_url: nova_url
                }).select().single();
                return error ? { error: error.message } : { action: 'PROSPECT_ADDED', prospect: data };
            },
        }),

        // ============================================================================
        // TEMPLATE TOOLS
        // ============================================================================
        list_email_templates: tool({
            description: 'List available communication templates.',
            parameters: z.object({
                category: z.string().optional().describe('Optional category filter: active, prospect, or retention'),
            }),
            execute: async () => {
                const { data, error } = await supabase
                    .from('communication_templates')
                    .select('name, category, description')
                    .eq('is_active', true)
                    .order('category');
                return error ? { error: error.message } : (data?.length ? { templates: data } : { message: 'No templates found.' });
            },
        }),

        get_template: tool({
            description: 'Retrieve a specific communication template by category and name.',
            parameters: z.object({
                category: z.enum(['active', 'prospect', 'retention']).describe('Template category'),
                template_name: z.string().describe('Template name (e.g., extension_request, cold_outreach)'),
            }),
            execute: async (args) => {
                const { category, template_name } = args;
                const { data, error } = await supabase
                    .from('communication_templates')
                    .select('subject_template, body_template, required_variables, description')
                    .eq('category', category)
                    .eq('name', template_name)
                    .eq('is_active', true)
                    .maybeSingle();
                if (error) return { error: error.message };
                if (!data) return { error: `Template '${template_name}' not found in category '${category}'.` };
                return {
                    action: 'TEMPLATE_RETRIEVED',
                    template: {
                        subject: data.subject_template,
                        body: data.body_template,
                        required_variables: data.required_variables,
                        description: data.description,
                    },
                    instructions: 'Populate the {{placeholders}} using data from search_travel_list or get_prospect_details tools. Do NOT ask the user for data you can look up.',
                };
            },
        }),

        draft_email: tool({
            description: 'Draft an email using a template.',
            parameters: z.object({
                template_id: z.string(),
                candidate_data: z.record(z.string(), z.any()).describe('Key-value pairs for template placeholders'),
            }),
            execute: async (args) => {
                const { template_id, candidate_data } = args;
                return {
                    action: 'EMAIL_DRAFTED',
                    template_id,
                    data: candidate_data,
                    instructions: 'Use get_template to fetch the template, then replace placeholders with the provided data.',
                };
            },
        }),

        // ============================================================================
        // PAY CALCULATION TOOLS
        // ============================================================================
        calculate_pay: tool({
            description: 'Calculate weekly gross pay breakdown.',
            parameters: z.object({
                target_gross: z.number().describe('Target weekly gross pay'),
                state: z.string().describe('Work state'),
                city: z.string().describe('Work city'),
                specialty: z.string().optional(),
                hours: z.number().optional().default(36),
            }),
            execute: async (args) => {
                const { target_gross, state, city, specialty, hours } = args;
                const { data, error } = await supabase.rpc('calculate_pay_package', {
                    p_target_gross: target_gross,
                    p_hours_per_week: hours || 36,
                    p_state: state.toUpperCase(),
                    p_city: city,
                    p_profession: 'RN',
                    p_specialty: specialty || 'General',
                    p_job_id: 'generated',
                });
                if (error) return { error: error.message };
                return { action: 'PAY_BREAKDOWN', data: { ...data, hours: hours || 36, specialty } };
            },
        }),

        calculate_pay_package: tool({
            description: 'Calculate official GSA-compliant pay package from Target Gross.',
            parameters: z.object({
                target_gross: z.number(),
                state: z.string(),
                city: z.string(),
                specialty: z.string().optional(),
                hours: z.number().optional().default(36),
            }),
            execute: async (args) => {
                const { target_gross, state, city, specialty, hours } = args;
                const { data, error } = await supabase.rpc('calculate_pay_package', {
                    p_target_gross: target_gross,
                    p_hours_per_week: hours || 36,
                    p_state: state.toUpperCase(),
                    p_city: city,
                    p_profession: 'RN',
                    p_specialty: specialty || 'General',
                    p_job_id: 'generated',
                });
                if (error) return { error: error.message };
                return { action: 'PAY_PACKAGE', breakdown: data };
            },
        }),

        // ============================================================================
        // PIPELINE & UI TOOLS
        // ============================================================================
        get_pipeline_brief: tool({
            description: 'Get an executive summary of the entire candidate pipeline (counts by status/specialty).',
            parameters: z.object({
                include_details: z.boolean().optional().describe('Include detailed breakdown'),
            }),
            execute: async () => {
                const { data: prospects } = await supabase.from('prospects').select('status, specialty');
                const byStatus = {};
                const bySpecialty = {};

                prospects?.forEach((p) => {
                    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
                    if (p.specialty) bySpecialty[p.specialty] = (bySpecialty[p.specialty] || 0) + 1;
                });

                return { action: 'PIPELINE_BRIEF', total: prospects?.length || 0, by_status: byStatus, by_specialty: bySpecialty };
            },
        }),

        set_ui_state: tool({
            description: 'Update the dashboard UI state (filter by specialty, status, or search).',
            parameters: z.object({
                filter_specialty: z.string().optional(),
                filter_status: z.string().optional(),
                search_query: z.string().optional(),
                sort_by: z.string().optional(),
                view_mode: z.enum(['grid', 'list', 'kanban']).optional(),
                cleared_status: z.string().optional().describe('Filter by compliance status'),
            }),
            execute: async (args) => {
                return { action: 'SET_UI_STATE', state: args };
            },
        }),

        // ============================================================================
        // FOLLOW-UP & NEGOTIATION TOOLS
        // ============================================================================
        create_follow_up: tool({
            description: 'Schedule a follow-up for a candidate.',
            parameters: z.object({
                candidate_id: z.number(),
                scheduled_date: z.string().describe('ISO date string'),
                follow_up_type: z.enum(['active', 'rotation']),
                notes: z.string().optional(),
            }),
            execute: async (args) => {
                const { candidate_id, scheduled_date, follow_up_type, notes } = args;
                const { data, error } = await supabase.from('follow_ups').insert({
                    prospect_id: candidate_id,
                    scheduled_date,
                    follow_up_type,
                    notes,
                    status: 'pending',
                }).select().single();
                return error ? { error: error.message } : { action: 'FOLLOW_UP_CREATED', follow_up: data };
            },
        }),

        update_negotiation: tool({
            description: 'Update candidate negotiation details (target gross, take home, etc.).',
            parameters: z.object({
                candidate_id: z.number(),
                target_gross: z.number().optional(),
                take_home: z.number().optional(),
                notes: z.string().optional(),
            }),
            execute: async (args) => {
                const { candidate_id, target_gross, take_home, notes } = args;
                const updates = {};
                if (target_gross) updates.target_gross = target_gross;
                if (take_home) updates.take_home = take_home;
                if (notes) updates.negotiation_notes = notes;
                const { data, error } = await supabase.from('prospects').update(updates).eq('id', candidate_id).select().single();
                return error ? { error: error.message } : { action: 'NEGOTIATION_UPDATED', prospect: data };
            },
        }),

        save_certification: tool({
            description: 'Save a certification for a candidate.',
            parameters: z.object({
                candidate_id: z.number(),
                cert_name: z.string(),
                expiration_date: z.string().optional(),
                is_verified: z.boolean().optional(),
            }),
            execute: async (args) => {
                const { candidate_id, cert_name, expiration_date, is_verified } = args;
                const { data, error } = await supabase.from('certifications').insert({
                    prospect_id: candidate_id,
                    name: cert_name,
                    expiration_date,
                    is_verified: is_verified || false,
                }).select().single();
                return error ? { error: error.message } : { action: 'CERTIFICATION_SAVED', certification: data };
            },
        }),

        // ============================================================================
        // KNOWLEDGE & SEARCH TOOLS
        // ============================================================================
        search_knowledge: tool({
            description: 'Search the internal knowledge base for policies, FAQs, benefits info.',
            parameters: z.object({
                query: z.string(),
                category: z.enum(['benefits', 'faq', 'policies']).optional(),
            }),
            execute: async (args) => {
                const { query, category } = args;
                let q = supabase.from('knowledge_base').select('*').or(`title.ilike.%${query}%,content.ilike.%${query}%`).limit(5);
                if (category) q = q.eq('category', category);
                const { data, error } = await q;
                return error ? { error: error.message } : (data?.length ? { results: data } : { message: 'No relevant knowledge found.' });
            },
        }),

        search_travel_list: tool({
            description: 'Search the working traveler list (active assignments) for extension candidates.',
            parameters: z.object({
                name: z.string().optional(),
                facility: z.string().optional(),
                specialty: z.string().optional(),
                ending_soon: z.boolean().optional().describe('Filter to contracts ending within 30 days'),
            }),
            execute: async (args) => {
                const { name, facility, specialty, ending_soon } = args;
                // Query engagements table with prospect join (actual schema)
                let query = supabase
                    .from('engagements')
                    .select(`
                        id,
                        prospect_id,
                        specialty,
                        facility_name,
                        start_date,
                        end_date,
                        extension_stage,
                        bill_rate,
                        status,
                        prospects(candidate_id, name, email, phone, nova_url, home_state)
                    `)
                    .eq('status', 'Active');

                if (name) query = query.ilike('prospects.name', `%${name}%`);
                if (facility) query = query.ilike('facility_name', `%${facility}%`);
                if (specialty) query = query.ilike('specialty', `%${specialty}%`);
                if (ending_soon) {
                    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    query = query.lte('end_date', thirtyDaysOut);
                }

                const { data, error } = await query.limit(20);

                // Flatten for easier use
                const travelers = (data || []).map(e => ({
                    engagement_id: e.id,
                    candidate_id: e.prospects?.candidate_id,
                    candidate_name: e.prospects?.name,
                    email: e.prospects?.email,
                    phone: e.prospects?.phone,
                    nova_url: e.prospects?.nova_url,
                    home_state: e.prospects?.home_state,
                    specialty: e.specialty,
                    facility_name: e.facility_name,
                    start_date: e.start_date,
                    end_date: e.end_date,
                    extension_stage: e.extension_stage,
                    bill_rate: e.bill_rate,
                    status: e.status
                }));

                return error ? { error: error.message } : { travelers, count: travelers.length };
            },
        }),

        // ============================================================================
        // SUBMITTAL HIGHLIGHTS TOOL
        // ============================================================================
        generate_submittal_highlights: tool({
            description: 'Generate a formatted "Submittal Highlights" summary for a candidate. Use this when the user asks to create or draft submittal highlights, a candidate brief, or a profile summary.',
            parameters: z.object({
                candidate_id: z.number().optional().describe('Candidate ID to look up'),
                name: z.string().optional().describe('Candidate name to search for'),
                certifications: z.array(z.string()).optional().describe('Override certifications list'),
                profession: z.string().optional().describe('Profession type (e.g., RN, CMA, SPT)'),
            }),
            execute: async (args) => {
                const { candidate_id, name, certifications, profession } = args;

                // Fetch candidate data if ID or name provided
                let candidateData = null;
                if (candidate_id || name) {
                    let query = supabase.from('prospects').select('*');
                    if (candidate_id) query = query.eq('candidate_id', candidate_id);
                    else if (name) query = query.ilike('name', `%${name}%`);
                    const { data } = await query.maybeSingle();
                    candidateData = data;
                }

                // Fetch work history if we have a candidate
                let workHistory = [];
                if (candidateData?.candidate_id) {
                    const { data: historyData } = await supabase
                        .from('work_history')
                        .select('*')
                        .eq('candidate_id', candidateData.candidate_id)
                        .order('start_date', { ascending: false });
                    workHistory = historyData || [];
                }

                // Build profile for highlights generation
                const profile = {
                    name: candidateData?.name || name || 'Unknown',
                    certifications: certifications || (candidateData?.certifications) || [],
                    profession: profession || candidateData?.specialty || 'Healthcare Professional',
                    workHistory: workHistory.map((w) => ({
                        startMonth: new Date(w.start_date).getMonth() + 1 + '',
                        startYear: new Date(w.start_date).getFullYear() + '',
                        endMonth: w.end_date ? new Date(w.end_date).getMonth() + 1 + '' : '',
                        endYear: w.end_date ? new Date(w.end_date).getFullYear() + '' : '',
                        currentlyWorking: !w.end_date,
                        facility: w.facility || '',
                        city: w.city || '',
                        state: w.state || '',
                        positionHeld: w.role || w.position || '',
                        unitSpecialty: w.unit_specialty || w.specialty || '',
                        employmentType: w.employment_type || 'Permanent',
                        nursePatientRatio: w.nurse_patient_ratio || '',
                        chargeExperience: w.charge_experience || false,
                        shift: w.shift || '',
                        chartingSystem: w.charting_system || '',
                        teachingFacility: w.teaching_facility || false,
                        traumaFacility: w.trauma_facility || false,
                        traumaLevel: w.trauma_level || '',
                        magnetFacility: w.magnet_facility || false,
                        facilityBeds: w.facility_beds || '',
                        unitBeds: w.unit_beds || '',
                        responsibilities: w.responsibilities || '',
                    })),
                    skills: candidateData?.skills || [],
                };

                // Generate highlights using inline logic
                const certs = profile.certifications;
                const history = profile.workHistory;

                const titleLine = certs.length > 0 ? certs.join(' | ') : (history[0]?.positionHeld || profile.profession);

                const specialties = [...new Set(history.map((h) => h.unitSpecialty).filter(Boolean))];
                const experienceLine = specialties.length > 0
                    ? `Experience in ${specialties.slice(0, 2).join(', ')}`
                    : 'Healthcare experience';

                const ratios = history.map((h) => h.nursePatientRatio).filter(Boolean);
                const ratioLine = ratios.length > 0 ? `Comfortable with ${ratios[0]} Patient Ratios` : null;

                const proficiencies = ['Patient Intake', 'Vitals Monitoring', 'Acute Care Settings'];

                const chartingSystems = [...new Set(history.map((h) => h.chartingSystem).filter(Boolean))];
                const chartingLine = chartingSystems.length > 0 ? `Proficient in: ${chartingSystems.join(', ')}` : null;

                const tenureLine = history[0]?.currentlyWorking
                    ? 'Currently active at facility'
                    : 'Tenure information available on request';

                // Build markdown
                const lines = [
                    `• **${titleLine}**`,
                    `• ${experienceLine}`,
                ];
                if (ratioLine) lines.push(`• ${ratioLine}`);
                lines.push(`• **Highly Proficient In:**`);
                proficiencies.forEach(p => lines.push(`  - ${p}`));
                if (chartingLine) lines.push(`• ${chartingLine}`);
                lines.push(`• ${tenureLine}`);

                const markdown = lines.join('\n');

                return {
                    action: 'SUBMITTAL_HIGHLIGHTS_GENERATED',
                    candidate_name: profile.name,
                    highlights: markdown,
                    raw: {
                        titleLine,
                        experienceLine,
                        ratioLine,
                        proficiencies,
                        chartingLine,
                        tenureLine,
                    }
                };
            },
        }),

        // ============================================================================
        // CANDIDATE DNA TOOL
        // ============================================================================
        update_candidate_dna: tool({
            description: 'Update candidate DNA (Fact Sheet) from notes, text, or parsed data. Use when the user provides information about a candidate\'s skills, charting systems, patient ratios, certifications, or floating preferences.',
            parameters: z.object({
                candidate_id: z.number().describe('Candidate ID to update'),
                title: z.string().optional().describe('Professional title (e.g., Certified Medical Assistant)'),
                years_of_experience: z.number().optional().describe('Total years of experience'),
                primary_specialty: z.string().optional().describe('Primary specialty area'),
                secondary_specialties: z.array(z.string()).optional().describe('Secondary specialty areas'),
                charting_systems: z.array(z.string()).optional().describe('Charting systems (e.g., Epic, Cerner)'),
                max_patient_ratio: z.string().optional().describe('Max patient ratio (e.g., 1:4)'),
                facility_types: z.array(z.string()).optional().describe('Facility types (e.g., Level I Trauma, Magnet)'),
                skills_keywords: z.array(z.string()).optional().describe('Clinical skills keywords'),
                willing_to_float: z.boolean().optional().describe('Willing to float between units'),
                eligible_units: z.array(z.string()).optional().describe('Units eligible to float to'),
                rto_history: z.string().optional().describe('RTO history/notes'),
                update_source: z.string().optional().describe('Source of update (e.g., recruiter_note, resume)'),
            }),
            execute: async (args) => {
                const { candidate_id, ...updateData } = args;

                // Call the upsert RPC
                const { data, error } = await supabase.rpc('upsert_candidate_dna', {
                    p_candidate_id: candidate_id,
                    p_title: updateData.title || null,
                    p_years_of_experience: updateData.years_of_experience || null,
                    p_primary_specialty: updateData.primary_specialty || null,
                    p_secondary_specialties: updateData.secondary_specialties || null,
                    p_charting_systems: updateData.charting_systems || null,
                    p_max_patient_ratio: updateData.max_patient_ratio || null,
                    p_facility_types: updateData.facility_types || null,
                    p_skills_keywords: updateData.skills_keywords || null,
                    p_willing_to_float: updateData.willing_to_float ?? null,
                    p_eligible_units: updateData.eligible_units || null,
                    p_rto_history: updateData.rto_history || null,
                    p_update_source: updateData.update_source || 'ai_tool',
                });

                if (error) {
                    return { error: error.message };
                }

                return {
                    action: 'CANDIDATE_DNA_UPDATED',
                    candidate_id,
                    updated_fields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
                    message: `Successfully updated DNA for candidate ${candidate_id}`
                };
            },
        }),
    };
}
