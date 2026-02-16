// ============================================================================
// /src/shared/services/dataService.ts
// ============================================================================

import { supabase } from './supabase';
import type { Click, Prospect, PayPackage } from '../types/database';

export class DataService {
    // ========== CLICKS ==========
    static async getClicks() {
        const { data, error } = await supabase
            .from('priority_interested_clicks')
            .select('*')
            .order('application_date', { ascending: false });
        
        if (error) throw error;
        return data as Click[];
    }
    
    static async updateClick(id: number, updates: Partial<Click>) {
        const { data, error } = await supabase
            .from('priority_interested_clicks')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data as Click;
    }
    
    // ========== PROSPECTS ==========
    static async getProspects() {
        const { data, error } = await supabase
            .from('prospects')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data as Prospect[];
    }
    
    static async createProspect(prospect: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>) {
        const { data, error } = await supabase
            .from('prospects')
            .insert(prospect)
            .select()
            .single();
        
        if (error) throw error;
        return data as Prospect;
    }
    
    static async updateProspect(id: number, updates: Partial<Prospect>) {
        const { data, error } = await supabase
            .from('prospects')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data as Prospect;
    }
    
    // ========== PAY PACKAGES (Shared) ==========
    static async getPayPackage(jobId: string): Promise<PayPackage | null> {
        const { data, error } = await supabase
            .from('pay_packages')
            .select('*')
            .eq('job_id', jobId)
            .maybeSingle();
            
        if (error) {
            console.error(`Error fetching pay package for Job ID ${jobId}:`, error.message);
            return null;
        }
        
        return data as PayPackage | null;
    }
    
    static async createPayPackage(pkg: Omit<PayPackage, 'id' | 'created_at' | 'updated_at'>) {
        const { data, error } = await supabase
            .from('pay_packages')
            .insert(pkg)
            .select()
            .single();
        
        if (error) throw error;
        return data as PayPackage;
    }
    
    static async updatePayPackage(id: number, updates: Partial<PayPackage>) {
        const { data, error } = await supabase
            .from('pay_packages')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data as PayPackage;
    }
    
    // ========== CROSS-DASHBOARD OPERATIONS ==========
    static async convertClickToProspect(clickId: number): Promise<Prospect> {
        // Get the click data
        const { data: click } = await supabase
            .from('priority_interested_clicks')
            .select('*')
            .eq('id', clickId)
            .single();
        
        if (!click) throw new Error('Click not found');
        
        // Create a prospect from the click
        return await this.createProspect({
            candidate_id: click.application_id,
            name: click.candidate_name,
            email: click.candidate_email,
            phone: null,
            specialty: click.specialty,
            recruiter: click.recruiter_name,
            notes: `Converted from interested click on ${new Date().toLocaleDateString()}`,
            status: 'New',
            facility: null,
            job_id: click.job_id,
            profession: click.profession
        });
    }
    
    // ========== AUTO-PROSPECT FROM OUTREACH ==========

    /**
     * Ensure a prospect record exists when outreach is initiated.
     * If a prospect with this email already exists, updates last_contacted_at.
     * If not, creates one with status 'Contacted'.
     * Fire-and-forget — callers don't need to await.
     */
    static async ensureProspectFromOutreach(data: {
        email: string;
        name?: string;
        specialty?: string;
        facility?: string;
        location?: string;
    }): Promise<Prospect | null> {
        const email = data.email?.trim().toLowerCase();
        if (!email) return null;

        try {
            // Check if prospect already exists
            const { data: existing } = await supabase
                .from('prospects')
                .select('*')
                .ilike('email', email)
                .maybeSingle();

            if (existing) {
                // Update contact timestamp
                const { data: updated } = await supabase
                    .from('prospects')
                    .update({
                        last_contacted_at: new Date().toISOString(),
                        ...(existing.status === 'New' ? { status: 'Contacted' } : {}),
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                return (updated as Prospect) ?? (existing as Prospect);
            }

            // Create new prospect from outreach data
            const { data: created, error } = await supabase
                .from('prospects')
                .insert({
                    name: data.name || email.split('@')[0],
                    email,
                    phone: null,
                    specialty: data.specialty || null,
                    profession: null,
                    status: 'Contacted',
                    facility: data.facility || null,
                    notes: `Auto-created from outreach on ${new Date().toLocaleDateString()}`,
                    source: 'command-center',
                    last_contacted_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) throw error;
            return created as Prospect;
        } catch (err) {
            console.error('[DataService] ensureProspectFromOutreach failed:', err);
            return null;
        }
    }

    static async getCandidateHistory(email: string) {
        // Get all clicks for this candidate
        const { data: clicks } = await supabase
            .from('priority_interested_clicks')
            .select('*')
            .eq('candidate_email', email);
        
        // Get all prospects for this candidate
        const { data: prospects } = await supabase
            .from('prospects')
            .select('*')
            .eq('email', email);
        
        return {
            clicks: clicks || [],
            prospects: prospects || [],
            totalInteractions: (clicks?.length || 0) + (prospects?.length || 0)
        };
    }
}