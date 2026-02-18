/**
 * Pipeline Queries
 * Shared Supabase query builders for the candidate web.
 * Used by both REST endpoints and Gemini tool executions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function url(type: string, id: string): string {
    return `/api/pipeline/${type}/${id}`;
}

function daysBetween(a: string, b: string): number {
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

// ── Candidate: full profile (the "URL") ─────────────────────────────────────

export async function getCandidateProfile(sb: SupabaseClient, id: string) {
    const { data: c, error } = await sb
        .from('candidates')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!c) return { ok: false as const, error: 'Candidate not found' };

    // Parallel queries for related data
    const [certs, licenses, submittals, assignments, payPackages, contacts, notes] = await Promise.all([
        sb.from('certifications').select('name, status, expiration_date').eq('candidate_id', id),
        sb.from('licenses').select('state, status, is_compact, expiration_date, license_type').eq('candidate_id', id),
        sb.from('submittals')
            .select('id, status, submitted_at, interview_date, offer_date, job_id, facility_id, facilities(name), jobs(title)')
            .eq('candidate_id', id)
            .not('status', 'in', '("withdrawn","cancelled","rejected")')
            .order('submitted_at', { ascending: false })
            .limit(10),
        sb.from('assignments')
            .select('id, facility_id, start_date, end_date, status, weekly_gross, end_reason, would_rehire, facilities(name)')
            .eq('candidate_id', id)
            .order('start_date', { ascending: false })
            .limit(10),
        sb.from('pay_packages')
            .select('id, weekly_gross, status, presented_at, facility_id, facilities(name)')
            .eq('candidate_id', id)
            .order('presented_at', { ascending: false })
            .limit(5),
        sb.from('contact_log')
            .select('channel, direction, subject, body_preview, contacted_at')
            .eq('candidate_id', id)
            .order('contacted_at', { ascending: false })
            .limit(1),
        sb.from('notes')
            .select('content, note_type, created_at')
            .eq('candidate_id', id)
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    // Compute availability status
    const activeAssignment = (assignments.data || []).find((a: any) => a.status === 'active');
    const endingSoon = activeAssignment?.end_date && daysBetween(today(), activeAssignment.end_date) <= 30;
    const availStatus = activeAssignment
        ? (endingSoon ? 'ending_soon' : 'on_assignment')
        : (c.available_date && c.available_date <= today() ? 'available_now' : 'future');

    // Pending extensions
    const pendingExtensions = (assignments.data || [])
        .filter((a: any) => a.status === 'active' && a.end_date)
        .map((a: any) => ({
            url: url('assignments', a.id),
            facility: (a as any).facilities?.name || 'Unknown',
            current_end: a.end_date,
            extension_offered: true,
            weekly_gross: Number(a.weekly_gross) || 0,
        }));

    // Connections
    const connections: { type: string; url: string; label: string }[] = [];
    for (const a of (assignments.data || []) as any[]) {
        connections.push({
            type: 'facility',
            url: url('facilities', a.facility_id),
            label: `${a.facilities?.name || 'Unknown'} (${a.status})`,
        });
    }
    for (const pp of (payPackages.data || []) as any[]) {
        connections.push({
            type: 'pay_package',
            url: url('pay-packages', pp.id),
            label: `$${Number(pp.weekly_gross).toLocaleString()}/wk ${pp.facilities?.name || ''} (${pp.status})`,
        });
    }

    const lastContact = (contacts.data || [])[0] || null;

    return {
        ok: true as const,
        candidate: {
            url: url('candidates', c.id),
            type: 'candidate',
            identity: {
                id: c.id,
                nova_id: c.nova_id,
                name: `${c.first_name} ${c.last_name}`,
                email: c.email,
                phone: c.phone,
                preferred_contact: c.preferred_contact,
            },
            clinical: {
                specialty: c.specialty,
                sub_specialty: c.sub_specialty,
                profession: c.profession,
                years_experience: c.years_experience ? Number(c.years_experience) : null,
                certifications: (certs.data || []).map((cert: any) => ({
                    name: cert.name,
                    status: cert.status,
                    expires: cert.expiration_date,
                })),
                licenses: (licenses.data || []).map((lic: any) => ({
                    state: lic.state,
                    status: lic.status,
                    compact: lic.is_compact,
                    expires: lic.expiration_date,
                })),
            },
            preferences: {
                locations: c.preferred_locations || [],
                shift: c.preferred_shift,
                pay_floor_weekly: c.pay_floor ? Number(c.pay_floor) : null,
                housing: c.housing_pref,
                travel_radius_miles: c.travel_radius_miles,
                time_off_requests: c.time_off_requests,
            },
            availability: {
                status: availStatus,
                current_assignment_ends: activeAssignment?.end_date || null,
                available_date: c.available_date,
                days_until_available: c.available_date ? Math.max(0, daysBetween(today(), c.available_date)) : null,
                open_to_extension: endingSoon || false,
            },
            pipeline: {
                active_submittals: (submittals.data || []).map((s: any) => ({
                    url: url('submittals', s.id),
                    facility: (s as any).facilities?.name || 'Unknown',
                    facility_url: url('facilities', s.facility_id),
                    job_title: (s as any).jobs?.title || 'Unknown',
                    status: s.status,
                    interview_date: s.interview_date,
                    submitted_at: s.submitted_at,
                })),
                pending_offers: (submittals.data || [])
                    .filter((s: any) => s.status === 'offer_extended' || s.status === 'offer_pending')
                    .map((s: any) => ({
                        url: url('submittals', s.id),
                        facility: (s as any).facilities?.name || 'Unknown',
                        status: s.status,
                        offer_date: s.offer_date,
                    })),
                pending_extensions: pendingExtensions,
            },
            history: {
                total_assignments: (assignments.data || []).length,
                assignments: (assignments.data || []).map((a: any) => ({
                    url: url('assignments', a.id),
                    facility: (a as any).facilities?.name || 'Unknown',
                    facility_url: url('facilities', a.facility_id),
                    dates: `${a.start_date} → ${a.end_date || 'ongoing'}`,
                    status: a.status,
                    weekly_gross: a.weekly_gross ? Number(a.weekly_gross) : null,
                    end_reason: a.end_reason,
                    would_rehire: a.would_rehire,
                })),
            },
            relationship: {
                communication_style: c.communication_style,
                last_contact: lastContact ? {
                    date: lastContact.contacted_at,
                    channel: lastContact.channel,
                    direction: lastContact.direction,
                    preview: lastContact.body_preview || lastContact.subject,
                } : null,
                notes_summary: c.notes_summary,
                action_close_rule: c.action_close_rule,
            },
            connections,
        },
    };
}

// ── Candidate: history ──────────────────────────────────────────────────────

export async function getCandidateHistory(sb: SupabaseClient, candidateId: string) {
    const [assignments, submittals, contacts, payPackages] = await Promise.all([
        sb.from('assignments')
            .select('*, facilities(name)')
            .eq('candidate_id', candidateId)
            .order('start_date', { ascending: false }),
        sb.from('submittals')
            .select('*, facilities(name), jobs(title)')
            .eq('candidate_id', candidateId)
            .order('submitted_at', { ascending: false }),
        sb.from('contact_log')
            .select('*')
            .eq('candidate_id', candidateId)
            .order('contacted_at', { ascending: false })
            .limit(50),
        sb.from('pay_packages')
            .select('*, facilities(name)')
            .eq('candidate_id', candidateId)
            .order('presented_at', { ascending: false }),
    ]);

    return {
        ok: true,
        candidate_id: candidateId,
        assignments: assignments.data || [],
        submittals: submittals.data || [],
        contacts: contacts.data || [],
        pay_packages: payPackages.data || [],
    };
}

// ── Candidate: availability check ───────────────────────────────────────────

export async function getCandidateAvailability(sb: SupabaseClient, candidateId: string) {
    const [candidate, licenses, activeAssignments] = await Promise.all([
        sb.from('candidates')
            .select('available_date, ldw, preferred_locations, preferred_shift, pay_floor, housing_pref, travel_radius_miles, time_off_requests')
            .eq('id', candidateId)
            .maybeSingle(),
        sb.from('licenses')
            .select('state, status, is_compact, expiration_date')
            .eq('candidate_id', candidateId),
        sb.from('assignments')
            .select('end_date, facility_id, facilities(name)')
            .eq('candidate_id', candidateId)
            .eq('status', 'active'),
    ]);

    return {
        ok: true,
        candidate_id: candidateId,
        preferences: candidate.data || {},
        licenses: licenses.data || [],
        active_assignments: activeAssignments.data || [],
    };
}

// ── Search candidates ───────────────────────────────────────────────────────

interface SearchFilters {
    specialty?: string;
    license_state?: string;
    available_before?: string;
    certification?: string;
    preferred_location?: string;
    has_compact?: boolean;
    limit?: number;
}

export async function searchCandidates(sb: SupabaseClient, filters: SearchFilters) {
    const limit = Math.min(filters.limit || 20, 50);

    let query = sb
        .from('candidates')
        .select('id, nova_id, first_name, last_name, email, phone, specialty, sub_specialty, profession, years_experience, preferred_locations, preferred_shift, pay_floor, available_date, ldw, communication_style')
        .limit(limit);

    if (filters.specialty) {
        query = query.ilike('specialty', `%${filters.specialty}%`);
    }
    if (filters.available_before) {
        query = query.lte('available_date', filters.available_before);
    }
    if (filters.preferred_location) {
        query = query.contains('preferred_locations', [filters.preferred_location]);
    }

    const { data: candidates, error } = await query.order('available_date', { ascending: true });
    if (error) return { ok: false as const, error: error.message };

    let results = candidates || [];

    // Post-filter by license state or compact (requires join)
    if (filters.license_state || filters.has_compact) {
        const candidateIds = results.map((c: any) => c.id);
        if (candidateIds.length > 0) {
            let licQuery = sb
                .from('licenses')
                .select('candidate_id, state, is_compact, status')
                .in('candidate_id', candidateIds)
                .eq('status', 'active');

            if (filters.license_state) {
                licQuery = licQuery.eq('state', filters.license_state.toUpperCase());
            }
            if (filters.has_compact) {
                licQuery = licQuery.eq('is_compact', true);
            }

            const { data: matchingLicenses } = await licQuery;
            const validCandidateIds = new Set((matchingLicenses || []).map((l: any) => l.candidate_id));
            results = results.filter((c: any) => validCandidateIds.has(c.id));
        }
    }

    // Post-filter by certification
    if (filters.certification) {
        const candidateIds = results.map((c: any) => c.id);
        if (candidateIds.length > 0) {
            const { data: matchingCerts } = await sb
                .from('certifications')
                .select('candidate_id')
                .in('candidate_id', candidateIds)
                .ilike('name', `%${filters.certification}%`)
                .eq('status', 'active');

            const validCandidateIds = new Set((matchingCerts || []).map((cert: any) => cert.candidate_id));
            results = results.filter((c: any) => validCandidateIds.has(c.id));
        }
    }

    return {
        ok: true as const,
        count: results.length,
        candidates: results.map((c: any) => ({
            url: url('candidates', c.id),
            id: c.id,
            nova_id: c.nova_id,
            name: `${c.first_name} ${c.last_name}`,
            specialty: c.specialty,
            profession: c.profession,
            years_experience: c.years_experience ? Number(c.years_experience) : null,
            available_date: c.available_date,
            preferred_locations: c.preferred_locations || [],
            preferred_shift: c.preferred_shift,
            pay_floor: c.pay_floor ? Number(c.pay_floor) : null,
        })),
    };
}

// ── Active pipeline ─────────────────────────────────────────────────────────

interface PipelineFilters {
    specialty?: string;
    status?: string;
    available_within_days?: number;
}

export async function getActivePipeline(sb: SupabaseClient, filters: PipelineFilters) {
    // Get active submittals with candidate + facility + job data
    let query = sb
        .from('submittals')
        .select('id, status, submitted_at, interview_date, offer_date, candidates(id, first_name, last_name, specialty, available_date, phone, email), facilities(name), jobs(title)')
        .not('status', 'in', '("withdrawn","cancelled","rejected","offer_declined")');

    if (filters.status && filters.status !== 'all') {
        const statusMap: Record<string, string[]> = {
            submitted: ['submitted', 'under_review'],
            interviewing: ['interview_scheduled', 'interview_complete'],
            offer_pending: ['offer_pending', 'offer_extended'],
            active: ['submitted', 'under_review', 'interview_scheduled', 'interview_complete', 'offer_pending', 'offer_extended'],
        };
        const statuses = statusMap[filters.status] || [filters.status];
        query = query.in('status', statuses);
    }

    const { data: submittals, error } = await query.order('submitted_at', { ascending: false }).limit(50);
    if (error) return { ok: false as const, error: error.message };

    let results = submittals || [];

    // Filter by specialty
    if (filters.specialty) {
        results = results.filter((s: any) =>
            s.candidates?.specialty?.toLowerCase().includes(filters.specialty!.toLowerCase())
        );
    }

    // Filter by availability
    if (filters.available_within_days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + filters.available_within_days);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        results = results.filter((s: any) =>
            s.candidates?.available_date && s.candidates.available_date <= cutoffStr
        );
    }

    // Also get ending-soon assignments if status is 'ending_soon' or 'all'
    let endingSoon: any[] = [];
    if (!filters.status || filters.status === 'all' || filters.status === 'ending_soon') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 30);
        const { data: ending } = await sb
            .from('assignments')
            .select('id, end_date, status, weekly_gross, candidates(id, first_name, last_name, specialty), facilities(name)')
            .eq('status', 'active')
            .lte('end_date', cutoff.toISOString().slice(0, 10))
            .order('end_date', { ascending: true });
        endingSoon = ending || [];
    }

    return {
        ok: true as const,
        active_submittals: results.map((s: any) => ({
            url: url('submittals', s.id),
            candidate: s.candidates ? `${s.candidates.first_name} ${s.candidates.last_name}` : 'Unknown',
            candidate_url: s.candidates ? url('candidates', s.candidates.id) : null,
            specialty: s.candidates?.specialty,
            facility: s.facilities?.name || 'Unknown',
            job_title: s.jobs?.title || 'Unknown',
            status: s.status,
            submitted_at: s.submitted_at,
            interview_date: s.interview_date,
        })),
        ending_soon: endingSoon.map((a: any) => ({
            url: url('assignments', a.id),
            candidate: a.candidates ? `${a.candidates.first_name} ${a.candidates.last_name}` : 'Unknown',
            candidate_url: a.candidates ? url('candidates', a.candidates.id) : null,
            facility: a.facilities?.name || 'Unknown',
            end_date: a.end_date,
            days_remaining: daysBetween(today(), a.end_date),
            weekly_gross: a.weekly_gross ? Number(a.weekly_gross) : null,
        })),
    };
}

// ── Facility profile ────────────────────────────────────────────────────────

export async function getFacilityProfile(sb: SupabaseClient, id: string) {
    const { data: facility, error } = await sb
        .from('facilities')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!facility) return { ok: false as const, error: 'Facility not found' };

    const [openJobs, recentAssignments] = await Promise.all([
        sb.from('jobs')
            .select('id, title, specialty, shift, hours_per_week, start_date, status, bill_rate')
            .eq('facility_id', id)
            .eq('status', 'open')
            .order('start_date', { ascending: true }),
        sb.from('assignments')
            .select('id, start_date, end_date, status, weekly_gross, would_rehire, candidates(id, first_name, last_name, specialty)')
            .eq('facility_id', id)
            .order('start_date', { ascending: false })
            .limit(20),
    ]);

    return {
        ok: true as const,
        facility: {
            url: url('facilities', facility.id),
            type: 'facility',
            ...facility,
            open_jobs: (openJobs.data || []).map((j: any) => ({
                url: url('jobs', j.id),
                ...j,
            })),
            past_candidates: (recentAssignments.data || []).map((a: any) => ({
                url: url('assignments', a.id),
                candidate: a.candidates ? `${a.candidates.first_name} ${a.candidates.last_name}` : 'Unknown',
                candidate_url: a.candidates ? url('candidates', a.candidates.id) : null,
                dates: `${a.start_date} → ${a.end_date || 'ongoing'}`,
                status: a.status,
                would_rehire: a.would_rehire,
            })),
        },
    };
}

// ── Stale submittals ────────────────────────────────────────────────────────

export async function getStaleSubmittals(sb: SupabaseClient, staleHours = 48) {
    const cutoff = new Date(Date.now() - staleHours * 3600_000).toISOString();

    const { data, error } = await sb
        .from('submittals')
        .select('id, status, submitted_at, updated_at, candidates(id, first_name, last_name, specialty), facilities(name), jobs(title)')
        .in('status', ['submitted', 'under_review', 'interview_scheduled'])
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(30);

    if (error) return { ok: false as const, error: error.message };

    return {
        ok: true as const,
        stale_hours: staleHours,
        submittals: (data || []).map((s: any) => ({
            url: url('submittals', s.id),
            candidate: s.candidates ? `${s.candidates.first_name} ${s.candidates.last_name}` : 'Unknown',
            facility: s.facilities?.name || 'Unknown',
            job_title: s.jobs?.title || 'Unknown',
            status: s.status,
            submitted_at: s.submitted_at,
            last_updated: s.updated_at,
            hours_stale: Math.round((Date.now() - new Date(s.updated_at).getTime()) / 3_600_000),
        })),
    };
}

// ── Upcoming extensions ─────────────────────────────────────────────────────

export async function getUpcomingExtensions(sb: SupabaseClient, withinDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);

    const { data, error } = await sb
        .from('assignments')
        .select('id, start_date, end_date, status, weekly_gross, candidates(id, first_name, last_name, specialty, communication_style), facilities(name)')
        .eq('status', 'active')
        .lte('end_date', cutoff.toISOString().slice(0, 10))
        .gte('end_date', today())
        .order('end_date', { ascending: true });

    if (error) return { ok: false as const, error: error.message };

    return {
        ok: true as const,
        within_days: withinDays,
        assignments: (data || []).map((a: any) => ({
            url: url('assignments', a.id),
            candidate: a.candidates ? `${a.candidates.first_name} ${a.candidates.last_name}` : 'Unknown',
            candidate_url: a.candidates ? url('candidates', a.candidates.id) : null,
            specialty: a.candidates?.specialty,
            facility: a.facilities?.name || 'Unknown',
            end_date: a.end_date,
            days_remaining: daysBetween(today(), a.end_date),
            weekly_gross: a.weekly_gross ? Number(a.weekly_gross) : null,
        })),
    };
}

// ── Write: log contact ──────────────────────────────────────────────────────

interface LogContactInput {
    candidate_id: string;
    channel: string;
    direction: string;
    subject?: string;
    outcome?: string;
    body_preview?: string;
    related_job_id?: string;
    related_submittal_id?: string;
}

export async function logContact(sb: SupabaseClient, input: LogContactInput) {
    const { data, error } = await sb
        .from('contact_log')
        .insert([{
            candidate_id: input.candidate_id,
            channel: input.channel,
            direction: input.direction,
            subject: input.subject || null,
            outcome: input.outcome || null,
            body_preview: input.body_preview || null,
            related_job_id: input.related_job_id || null,
            related_submittal_id: input.related_submittal_id || null,
        }])
        .select('id, candidate_id, channel, direction, outcome, contacted_at')
        .single();

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, contact: data };
}

// ── Write: add note ─────────────────────────────────────────────────────────

interface AddNoteInput {
    content: string;
    note_type?: string;
    candidate_id?: string;
    facility_id?: string;
    submittal_id?: string;
    assignment_id?: string;
    job_id?: string;
}

export async function addNote(sb: SupabaseClient, input: AddNoteInput) {
    const { data, error } = await sb
        .from('notes')
        .insert([{
            content: input.content,
            note_type: input.note_type || 'general',
            candidate_id: input.candidate_id || null,
            facility_id: input.facility_id || null,
            submittal_id: input.submittal_id || null,
            assignment_id: input.assignment_id || null,
            job_id: input.job_id || null,
        }])
        .select('id, content, note_type, created_at')
        .single();

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, note: data };
}

// ── Fuzzy candidate lookup by name ──────────────────────────────────────────

export async function resolveCandidateByName(sb: SupabaseClient, name: string) {
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    let query = sb
        .from('candidates')
        .select('id, nova_id, first_name, last_name, email, specialty')
        .limit(5);

    if (firstName && lastName) {
        query = query.ilike('first_name', `%${firstName}%`).ilike('last_name', `%${lastName}%`);
    } else {
        // Single word — search both columns
        query = query.or(`first_name.ilike.%${firstName}%,last_name.ilike.%${firstName}%`);
    }

    const { data, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, matches: data || [] };
}
