// services/payPackageService.ts

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PayPackageResult {
  job_id: string;
  taxable_hourly: number;
  meals_weekly: number;
  housing_weekly: number;
  total_stipend: number;
  gross_weekly: number;
}

export interface PayPackage {
  job_id: string;
  facility_name: string;
  city: string;
  state: string;
  specialty: string;
  hours_per_week: number;
  taxable_hourly_rate: number;
  meals_weekly: number;
  housing_weekly: number;
  total_stipend: number;
  gross_weekly_pay: number;
  shift_type?: string;
  source: string;
  created_at?: string;
  updated_at?: string;
}

export interface ClickData {
  job_id: string;
  facility_name: string;
  job_city: string;
  job_state: string;
  specialty: string;
  profession?: string;
  pay_range?: string;
  shift_type?: string;
  start_date?: string;
  end_date?: string;
}

// ============================================================================
// PAY PACKAGE SERVICE
// ============================================================================

export const payPackageService = {
  /**
   * Calculate pay package using backend function
   */
  async calculatePackage(
    jobId: string,
    state: string,
    city: string,
    profession: string,
    specialty: string,
    targetGross: number,
    hoursPerWeek: number = 36
  ): Promise<PayPackageResult> {
    try {
      const { data, error } = await supabase
        .rpc('calculate_pay_package', {
          p_job_id: jobId,
          p_state: state,
          p_city: city,
          p_profession: profession,
          p_specialty: specialty,
          p_target_gross: targetGross,
          p_hours_per_week: hoursPerWeek
        });

      if (error) {
        console.error('Error calculating package:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to calculate package:', error);
      throw error;
    }
  },

  /**
   * Save calculated package to database
   */
  async savePackage(
    pkg: PayPackageResult,
    click: ClickData
  ): Promise<PayPackage> {
    try {
      const packageData = {
        job_id: pkg.job_id,
        facility_name: click.facility_name,
        city: click.job_city,
        state: click.job_state,
        specialty: click.specialty,
        hours_per_week: 36,
        taxable_hourly_rate: pkg.taxable_hourly,
        meals_weekly: pkg.meals_weekly,
        housing_weekly: pkg.housing_weekly,
        total_stipend: pkg.total_stipend,
        gross_weekly_pay: pkg.gross_weekly,
        shift_type: click.shift_type,
        source: 'auto_calculated'
      };

      const { data, error } = await supabase
        .from('pay_packages')
        .upsert(packageData, {
          onConflict: 'job_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving package:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Failed to save package:', error);
      throw error;
    }
  },

  /**
   * Get existing package by job ID
   */
  async getPackage(jobId: string): Promise<PayPackage | null> {
    try {
      const { data, error } = await supabase
        .from('pay_packages')
        .select('*')
        .eq('job_id', jobId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching package:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch package:', error);
      return null;
    }
  },

  /**
   * Generate package from click data
   */
  async generateFromClick(click: ClickData): Promise<PayPackage> {
    // Parse gross weekly from pay range
    const grossWeekly = this.parseGrossWeekly(click.pay_range);

    // Determine profession from specialty
    const profession = this.determineProfession(click.specialty);

    // Parse hours from shift type
    const hoursPerWeek = this.parseHoursPerWeek(click.shift_type);

    // Calculate the package
    const calculated = await this.calculatePackage(
      click.job_id,
      click.job_state,
      click.job_city,
      profession,
      click.specialty || '',
      grossWeekly,
      hoursPerWeek
    );

    // Save and return
    return await this.savePackage(calculated, click);
  },

  /**
   * Bulk generate packages
   */
  async bulkGenerate(clicks: ClickData[]): Promise<{
    success: PayPackage[];
    failed: { click: ClickData; error: any }[];
  }> {
    const results = {
      success: [] as PayPackage[],
      failed: [] as { click: ClickData; error: any }[]
    };

    for (const click of clicks) {
      try {
        const pkg = await this.generateFromClick(click);
        results.success.push(pkg);
      } catch (error) {
        results.failed.push({ click, error });
      }
    }

    return results;
  },

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Parse gross weekly from pay range string
   */
  parseGrossWeekly(payRange?: string): number {
    if (!payRange) return 0;

    // Remove $ and commas, then parse
    const cleaned = payRange.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  },

  /**
   * Determine profession from specialty
   */
  determineProfession(specialty?: string): string {
    if (!specialty) return 'RESP';

    const upper = specialty.toUpperCase();

    if (upper.includes('RRT') || upper.includes('CRT') || upper === 'RESP') {
      return 'RESP';
    }
    if (upper.includes('MA') || upper.includes('MEDICAL ASSISTANT')) {
      return 'MA';
    }
    if (upper.includes('CST') || upper.includes('OR TECH') || upper.includes('SURGICAL')) {
      return 'SURG';
    }
    if (upper.includes('RN') || upper.includes('NURSE')) {
      return 'RN';
    }
    if (upper.includes('PT') && !upper.includes('SPT')) {
      return 'PT';
    }
    if (upper.includes('OT')) {
      return 'OT';
    }
    if (upper.includes('SLP')) {
      return 'SLP';
    }
    if (upper.includes('LAB') || upper.includes('PHLEBOTOM')) {
      return 'LAB';
    }

    return 'RESP'; // Default
  },

  /**
   * Parse hours per week from shift pattern
   */
  parseHoursPerWeek(shiftType?: string): number {
    if (!shiftType) return 36;

    if (shiftType.includes('3x12')) return 36;
    if (shiftType.includes('4x10')) return 40;
    if (shiftType.includes('5x8')) return 40;
    if (shiftType.includes('4x12')) return 48;
    if (shiftType.includes('2x12') && shiftType.includes('3x12')) return 36;

    return 36; // Default
  },

  /**
   * Generate email body with package details
   */
  generateEmailBody(
    candidateName: string,
    click: ClickData,
    pkg: PayPackage
  ): string {
    const firstName = candidateName.split(' ')[0];

    const fmtStart = this.formatDate(click.start_date);
    const shiftDesc = this.getShiftDescription(click.shift_type, pkg.hours_per_week);

    return `Hi ${firstName},

I am reaching out to share a new ${click.specialty} assignment in ${click.job_city} that matches your experience.

Facility: ${click.facility_name}
Location: ${click.job_city}, ${click.job_state}
Start Date: ${fmtStart}
Shifts: ${shiftDesc} (${pkg.hours_per_week} hrs/wk)

Pay Package:
- Taxable Hourly Rate: $${pkg.taxable_hourly_rate.toFixed(2)}/hr
- Meals & Housing Stipend: $${pkg.total_stipend.toFixed(2)}/week
- Total Gross Weekly Pay: $${pkg.gross_weekly_pay.toFixed(2)}/week

To move forward, just confirm (and if you have any updated certs or licenses, just send them my way—I will handle the upload):
- Available to start ${fmtStart}?
- Any time-off during the assignment?
- Is your Aya profile current?

Let me know and I can get you submitted right away.

Thank you!`;
  },

  /**
   * Generate professional email template with package details
   */
  generateEmailTemplate(
    candidateName: string,
    click: ClickData,
    pkg: PayPackage
  ): { subject: string; body: string } {
    const firstName = candidateName.split(' ')[0];

    // Format dates
    const startDate = this.formatDate(click.start_date);
    const endDate = this.formatDate(click.end_date, '13 weeks from start');

    // Determine shift description
    const shiftDescription = this.getShiftDescription(click.shift_type, pkg.hours_per_week);

    return {
      subject: `${click.specialty} - ${click.facility_name} | $${pkg.gross_weekly_pay.toFixed(2)}/week`,

      body: `Hi ${firstName},

I am reaching out to share a new ${click.specialty} assignment in ${click.job_city} that matches your experience.

Facility: ${click.facility_name}
Location: ${click.job_city}, ${click.job_state}
Assignment Dates: ${startDate} - ${endDate}
Shifts: ${shiftDescription} (${pkg.hours_per_week} hrs/wk)

Pay Package:
- Taxable Hourly Rate: $${pkg.taxable_hourly_rate.toFixed(2)}/hr
- Meals & Housing Stipend: $${pkg.total_stipend.toFixed(2)}/week
- Total Gross Weekly Pay: $${pkg.gross_weekly_pay.toFixed(2)}/week

To move forward, just confirm (and if you have any updated certs or licenses, just send them my way—I will handle the upload):
- Available to start ${startDate}?
- Any time-off during the assignment?
- Is your Aya profile current?

Let me know and I can get you submitted right away.

Thank you!

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017
Email: Kofi.Farkye@ayahealthcare.com`
    };
  },

  /** Format ISO date to MM/DD/YYYY */
  formatDate(ds?: string | null, fallback = 'ASAP'): string {
    if (!ds) return fallback;
    const d = new Date(`${ds}T00:00:00`);
    if (Number.isNaN(d.getTime())) return fallback;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
  },

  /** Expand shorthand: "3x12 N" → "3, 12-hour night shifts" */
  getShiftDescription(shiftType?: string, hoursPerWeek?: number): string {
    const raw = shiftType || (
      hoursPerWeek === 36 ? '3x12' :
      hoursPerWeek === 40 ? '5x8' :
      hoursPerWeek === 48 ? '4x12' : ''
    );
    if (!raw) return 'Standard';
    const m = raw.match(/(\d+)\s*x\s*(\d+)/i);
    if (!m) return raw;
    const count = m[1];
    const hrs = m[2];
    const lower = raw.toLowerCase();
    let label = '';
    if (lower.includes('night') || /\bN\b/.test(raw)) label = ' night';
    else if (lower.includes('evening') || lower.includes('eve') || /\bE\b/.test(raw)) label = ' evening';
    else if (lower.includes('day') || /\bD\b/.test(raw)) label = ' day';
    return `${count}, ${hrs}-hour${label} shifts`;
  }
};