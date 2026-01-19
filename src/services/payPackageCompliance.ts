import { supabase } from '../lib/supabase';

interface ComplianceCheck {
  min_wage: number;
  aya_minimum: number;
  ca_healthcare_min: number | null;
  market_rate: number | null;
  final_rate: number;
  source: string;
  job_id: string;
  specialty: string;
  location: string;
}

export const payPackageComplianceService = {
  async getCompliantRate(
    jobId: string,
    specialty: string,
    city: string,
    state: string
  ): Promise<ComplianceCheck> {
    const { data, error } = await supabase
      .rpc('get_compliant_pay_rate', {
        p_job_id: jobId,
        p_specialty: specialty,
        p_city: city,
        p_state: state,
        p_facility_type: 'Hospital'
      });

    if (error) {
      console.error('Compliance check failed:', error);
      // Return safe defaults
      return {
        min_wage: 15.00,
        aya_minimum: 20.00,
        ca_healthcare_min: null,
        market_rate: null,
        final_rate: 20.00,
        source: 'Default',
        job_id: jobId,
        specialty: specialty,
        location: `${city}, ${state}`
      };
    }

    return data as ComplianceCheck;
  },

  async createCompliantPackage(click: any): Promise<any> {
    // Get compliant rates
    const compliance = await this.getCompliantRate(
      click.job_id,
      click.specialty,
      click.job_city,
      click.job_state
    );

    // Calculate stipend based on location
    const stipend = this.getLocationStipend(click.job_state);
    const hoursPerWeek = 36;
    
    // Create package with compliant rates
    const packageData = {
      job_id: click.job_id,
      facility_name: `${click.job_city} Medical Center`,
      city: click.job_city,
      state: click.job_state,
      specialty: click.specialty,
      start_date: 'ASAP',
      end_date: '13 weeks',
      shift_type: '3x12 Days/Nights',
      hours_per_week: hoursPerWeek,
      taxable_hourly_rate: compliance.final_rate,
      stipend: stipend,
      completion_bonus: this.getSpecialtyBonus(click.specialty),
      gross_weekly_pay: (compliance.final_rate * hoursPerWeek) + stipend,
      min_wage_applied: compliance.min_wage,
      min_wage_source: compliance.source,
      source: 'auto_generated'
    };

    const { data, error } = await supabase
      .from('pay_packages')
      .insert(packageData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getLocationStipend(state: string): number {
    const stipends: Record<string, number> = {
      'CA': 1400,
      'NY': 1300,
      'WA': 1200,
      'TX': 900,
      'FL': 850,
      'DEFAULT': 1000
    };
    return stipends[state] || stipends.DEFAULT;
  },

  getSpecialtyBonus(specialty: string): number {
    if (specialty.includes('ICU')) return 7500;
    if (specialty.includes('ER')) return 6000;
    if (specialty.includes('OR')) return 6500;
    if (specialty.includes('RN')) return 5000;
    if (specialty.includes('PT') || specialty.includes('OT')) return 3000;
    return 2000;
  }
};