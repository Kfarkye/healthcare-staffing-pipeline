// ============================================================================
// /src/shared/services/emailService.ts
// ============================================================================

import type { Click, Prospect, PayPackage } from '../types/database';

export class EmailService {
    static generateOutlookUrl(to: string, subject: string, body: string, cc?: string): string {
        const params = new URLSearchParams({
            to: to,
            subject: subject,
            body: body,
            ...(cc && { cc })
        });
        
        return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
    }
    
    static generateClickEmail(click: Click, payPackage: PayPackage | null): { subject: string; body: string } {
        const firstName = click.candidate_name.split(' ')[0];
        
        if (payPackage) {
            return {
                subject: `${click.specialty} Assignment - Job #${click.job_id}`,
                body: this.getFullDetailsTemplate(firstName, click, payPackage)
            };
        }
        
        return {
            subject: `${click.specialty} Opportunity - Job #${click.job_id}`,
            body: this.getInitialOutreachTemplate(firstName, click)
        };
    }
    
    static generateProspectEmail(prospect: Prospect, payPackage: PayPackage | null): { subject: string; body: string } {
        const firstName = prospect.name.split(' ')[0];
        
        if (payPackage && prospect.job_id) {
            return {
                subject: `${prospect.specialty} Position - ${payPackage.facility_name}`,
                body: this.getFullDetailsTemplate(firstName, prospect, payPackage)
            };
        }
        
        return {
            subject: `Healthcare Opportunity for ${firstName}`,
            body: this.getProspectOutreachTemplate(firstName, prospect)
        };
    }
    
    private static getFullDetailsTemplate(
        firstName: string, 
        record: Click | Prospect, 
        pkg: PayPackage
    ): string {
        return `Hi ${firstName},

Thanks for your interest in the ${record.specialty} position at ${pkg.facility_name}. Here's the full breakdown — this looks like an excellent match for your background:

Facility: ${pkg.facility_name}
Location: ${pkg.city}, ${pkg.state}
Assignment Dates: ${this.formatDate(pkg.start_date)} – ${this.formatDate(pkg.end_date)}
Shifts & Hours: ${pkg.shift_type} (${pkg.hours_per_week}/week)

Pay Package:
$${this.formatCurrency(pkg.completion_bonus)} Completion Bonus
Taxable Hourly Rate: $${pkg.taxable_hourly_rate?.toFixed(2)}
Meals & Housing Stipend: $${this.formatCurrency(pkg.stipend)}
Total Gross Weekly Pay: $${this.formatCurrency(pkg.gross_weekly_pay)}

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm the following:

Are you available to start on or around ${this.formatDate(pkg.start_date)}?
Do you have any time-off requests during the contract?
Is your Aya profile current (work history, certs, skills checklist)?

Let me know and I'll take it from there.

Best,

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017
CC: Tiffany Chavez – Tiffany.Chavez@ayahealthcare.com`;
    }
    
    private static getInitialOutreachTemplate(firstName: string, click: Click): string {
        return `Hi ${firstName},

I hope this message finds you well!

I came across your profile and wanted to reach out about a ${click.specialty} opportunity that might be a great fit for you.

Job Details:
• Specialty: ${click.specialty}
• Location: ${click.job_state}
• Job ID: ${click.job_id}

I'd love to discuss the full pay package and details with you. This position is moving quickly, and I think your background would be perfect for it.

Would you have a few minutes for a quick call to discuss? I can share all the specifics including the competitive pay rate, benefits, and start date.

Looking forward to hearing from you!

Best,

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017
Email: Kofi.Farkye@ayahealthcare.com`;
    }
    
    private static getProspectOutreachTemplate(firstName: string, prospect: Prospect): string {
        return `Hi ${firstName},

I wanted to reach out regarding some exciting ${prospect.specialty || 'healthcare'} opportunities we have available.

Based on your background, I think you'd be a great fit for several positions we're currently filling. We have opportunities with:

• Competitive pay rates
• Flexible assignment lengths
• Locations across the country
• Comprehensive benefits from day one

I'd love to learn more about what you're looking for in your next assignment and share some specific opportunities that match your preferences.

Do you have 10-15 minutes this week for a quick call?

Best,

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017
Email: Kofi.Farkye@ayahealthcare.com`;
    }
    
    private static formatDate(dateString: string | null): string {
        if (!dateString) return 'ASAP';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
    }
    
    private static formatCurrency(amount: number | null): string {
        return (amount || 0).toLocaleString();
    }
}