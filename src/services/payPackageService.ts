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

    return `Hi ${firstName},

I have an excellent ${click.specialty} opportunity at ${click.facility_name} that matches your profile perfectly.

📍 Location: ${click.job_city}, ${click.job_state}
📅 Start Date: ${click.start_date || 'ASAP'}
⏰ Schedule: ${click.shift_type || '3x12'} (${pkg.hours_per_week} hours/week)

💰 PAY PACKAGE:
Taxable Hourly: $${pkg.taxable_hourly_rate.toFixed(2)}/hr
Weekly Meals: $${pkg.meals_weekly.toFixed(2)}
Weekly Housing: $${pkg.housing_weekly.toFixed(2)}
Total Weekly: $${pkg.gross_weekly_pay.toFixed(2)}

This position is moving quickly - I can submit you today if you're available.

Best,
Kofi Farkye
Senior Recruiter
858-529-7267 Ext: 17017
Kofi.Farkye@ayahealthcare.com`;
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
    const startDate = click.start_date || 'ASAP';
    const endDate = click.end_date || '13 weeks from start';

    // Determine shift description
    const shiftDescription = this.getShiftDescription(click.shift_type, pkg.hours_per_week);

    return {
      subject: `${click.specialty} - ${click.job_city}, ${click.job_state} - Job #${click.job_id}`,

      body: `Hi ${firstName},

Thanks for your interest in the ${click.specialty} position at ${click.facility_name}. Here's the full breakdown — this looks like an excellent match for your background:

Facility: ${click.facility_name}
Location: ${click.job_city}, ${click.job_state}
Assignment Dates: ${startDate} – ${endDate}
Shifts & Hours: ${shiftDescription} (${pkg.hours_per_week} hours/week)

Pay Package:
Taxable Hourly Rate: $${pkg.taxable_hourly_rate.toFixed(2)}/hr
Meals & Housing Stipend: $${pkg.total_stipend.toFixed(2)}/week
Total Gross Weekly Pay: $${pkg.gross_weekly_pay.toFixed(2)}

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm:
- Are you available to start ${startDate}?
- Do you have any time-off requests during the contract?
- Is your Aya profile current (work history, certs, skills checklist)?

Please let me know if you have any questions.

Thank you!

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017
Email: Kofi.Farkye@ayahealthcare.com`
    };
  },

  /**
   * Helper to format shift description
   */
  getShiftDescription(shiftType?: string, hoursPerWeek?: number): string {
    if (!shiftType) {
      if (hoursPerWeek === 36) return '3x12';
      if (hoursPerWeek === 40) return '4x10 or 5x8';
      if (hoursPerWeek === 48) return '4x12';
      return 'Standard';
    }

    // Clean up shift type for display
    if (shiftType.includes('3x12 N')) return '3x12 Nights';
    if (shiftType.includes('3x12 D')) return '3x12 Days';
    if (shiftType.includes('4x10')) return '4x10 Days';
    if (shiftType.includes('5x8')) return '5x8 Days';

    return shiftType;
  }
};