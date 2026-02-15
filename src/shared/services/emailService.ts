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
                subject: `${click.specialty} - ${payPackage.facility_name} | $${(payPackage.gross_weekly_pay || 0).toLocaleString()}/week`,
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
                subject: `${prospect.specialty} - ${payPackage.facility_name} | $${(payPackage.gross_weekly_pay || 0).toLocaleString()}/week`,
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

I am reaching out to share a new ${record.specialty} assignment in ${pkg.city} that matches your experience.

Facility: ${pkg.facility_name}
Location: ${pkg.city}, ${pkg.state}
Assignment Dates: ${this.formatDate(pkg.start_date)} - ${this.formatDate(pkg.end_date)}
Shifts: ${pkg.shift_type} (${pkg.hours_per_week} hrs/wk)

Pay Package:
- Taxable Hourly Rate: $${pkg.taxable_hourly_rate?.toFixed(2)}/hr
- Meals & Housing Stipend: $${this.formatCurrency(pkg.stipend)}/week
- Total Gross Weekly Pay: $${this.formatCurrency(pkg.gross_weekly_pay)}/week

To move forward, just confirm (and if you have any updated certs or licenses, just send them my way—I will handle the upload):
- Available to start ${this.formatDate(pkg.start_date)}?
- Any time-off during the assignment?
- Is your Aya profile current?

Let me know and I can get you submitted right away.

Thank you!

Kofi Farkye
Senior Recruiter, Fulfillment Specialist
P: 858-529-7267 Ext: 17017
CC: Tiffany Chavez – Tiffany.Chavez@ayahealthcare.com`;
    }
    
    private static getInitialOutreachTemplate(firstName: string, click: Click): string {
        return `Hi ${firstName},

I am reaching out to share a ${click.specialty} opportunity in ${click.job_state} that matches your experience.

Specialty: ${click.specialty}
Location: ${click.job_state}
Job ID: ${click.job_id}

This position is moving quickly — I can share the full pay package and get you submitted right away.

Let me know if you are interested and I will send over all the details.

Thank you!

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
        const date = new Date(`${dateString}T00:00:00`);
        if (Number.isNaN(date.getTime())) return 'ASAP';
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${date.getFullYear()}`;
    }
    
    private static formatCurrency(amount: number | null): string {
        return (amount || 0).toLocaleString();
    }
}