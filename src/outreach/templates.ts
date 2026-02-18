// /outreach/templates.ts
// Pristine, structured, organized. Shared by EmailTemplateModal and OutreachTemplateManager.
// Template metadata (name, category, etc.) comes from the shared catalog (SSOT).

import { getCatalogEntry } from '../lib/template-catalog';

// Re-including the necessary interface/type definition (schema)
export interface ExtractedOfferData {
  name: string;
  email: string;
  facility: string;
  city: string;
  state: string;
  shiftType: string;
  weeklyHours: number;
  startDate: string | null;
  endDate: string | null;
  taxableRate: number;
  weeklyStipend: number;
  grossWeeklyPay: number;
  specialty: string;
  jobId: number | null;
  candidateId: number | null;
  actualMargin?: number | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  generateContent: (data: ExtractedOfferData) => { subject: string; body: string; to?: string; cc?: string };
}

export type TemplateCategory = 'outreach' | 'ops' | 'response';

const currency = (n?: number | null) =>
  n == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));

const shortDate = (ds?: string | null, fallback: string = 'ASAP') => {
  if (!ds) return fallback;
  const d = new Date(`${ds}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? fallback
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrencyRate = (rate?: number | null): string => {
  if (rate == null || Number.isNaN(Number(rate)) || Number(rate) === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(rate));
};

const getFirstName = (fullName: string): string => fullName.split(' ')[0] || '';
const getFacilityName = (name: string): string => name.replace(' at ', ' ').trim();

/**
 * Build an EmailTemplate entry with the display name derived from the shared catalog.
 * Adds emoji prefix based on message type. Falls back to provided fallbackName if catalog miss.
 */
function catalogTemplate(
    id: string,
    generateContent: EmailTemplate['generateContent'],
    fallbackName?: string,
): EmailTemplate {
    const entry = getCatalogEntry(id);
    if (!entry) {
        console.warn(`[outreach/templates] Template "${id}" not in catalog — using fallback name`);
        return { id, name: fallbackName || id, generateContent };
    }
    const prefix = entry.messageType === 'sms' ? '💬 TEXT' : '📧 EMAIL';
    return { id, name: `${prefix}: ${entry.name}`, generateContent };
}

// ----------------------
// Outreach (candidate-facing)
// ----------------------
export const OUTREACH_EMAIL_TEMPLATES: EmailTemplate[] = [
  catalogTemplate('initial_outreach', (d) => ({
      subject: `${d.specialty} Assignment – ${d.facility} | ${currency(d.grossWeeklyPay)}/week`,
      body: `Hi ${d.name.split(' ')[0] || ''},

Thanks for your interest in the ${d.specialty} position at ${d.facility}. Here's the full breakdown — this looks like an excellent match for your background:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${d.shiftType} (${d.weeklyHours} hours/week)

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate)}/hr
Meals & Housing Stipend: ${currency(d.weeklyStipend)}/week
Total Gross Weekly Pay: ${currency(d.grossWeeklyPay)}

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm:
- Are you available to start ${shortDate(d.startDate)}?
- Do you have any time-off requests during the contract?
- Is your Aya profile current (work history, certs, skills checklist)?

Please let me know if you have any questions.

Thank you!`,
    }),
  ),
  catalogTemplate('hourly_rate_outreach', (d) => {
      const firstName = getFirstName(d.name);
      const hourlyRate = formatCurrencyRate(d.taxableRate + (d.weeklyStipend / (d.weeklyHours || 40)));
      const facilityName = getFacilityName(d.facility);

      return {
        subject: `${d.specialty || '[Specialty]'} Assignment – ${facilityName || '[Facility Name]'} | ${hourlyRate}/hr`,
        body: `Hi ${firstName || '[First Name]'},

Thanks for your interest in the ${d.specialty || '[Specialty]'} position at ${facilityName || '[Facility Name]'}.
Here's the full breakdown — this looks like a great match for your background:

Facility: ${facilityName || '[Facility Name]'}
Location: ${d.city || '[City]'}, ${d.state || '[State]'}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${d.shiftType || '[Shift Type]'} (${d.weeklyHours}hrs/week)
Hourly Rate: ${hourlyRate}/hr

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm:

Are you available to start ${shortDate(d.startDate)}?
Do you have any time-off requests during the contract?
Is your Aya profile current (work history, certs, skills checklist)?

Please let me know if you have any questions.

Thank you!`,
      };
    },
  ),
  catalogTemplate('rush_ma_full_details', (d) => {
      const hours =
        d.weeklyHours === 40 ? '5x8s (40 hours/week)' :
          d.weeklyHours === 36 ? '3x12s (36 hours/week)' :
            d.weeklyHours === 48 ? '4x12s (48 hours/week)' :
              `${d.shiftType} (${d.weeklyHours} hours/week)`;

      const comp =
        d.weeklyStipend && d.grossWeeklyPay
          ? `Total Weekly Pay: ${currency(d.grossWeeklyPay)}`
          : `Hourly Rate: ${currency(d.taxableRate)}/hr`;

      return {
        subject: `Medical Assistant – Rush University Medical Center (${d.city}, ${d.state})`,
        body: `Hi ${d.name.split(' ')[0] || ''},

Thanks for your interest in the Medical Assistant opening at Rush University Medical Center. Here are the details:

Facility: Rush University Medical Center
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${hours}
${comp}

This role is moving quickly—I can get you submitted today if everything looks good.

To move forward, please confirm availability for ${shortDate(d.startDate)}, any RTO, and that your Aya profile is current.

When you have a moment, please send a copy of your CMA (NHA, AMT, or AAMA).
I'll also need two supervisory references from the last two years (charge nurse/manager/supervisor). They can email the form to References@ayahealthcare.com and CC me.

Thank you!`,
      };
    },
  ),
  catalogTemplate('reengagement', (d) => ({
      subject: `${d.facility} Assignment in ${d.city}, ${d.state} - ${currency(d.grossWeeklyPay)}/week`,
      body: `Hi ${d.name.split(' ')[0] || ''},

It's been a while, I hope you're doing great!

I was scrolling through assignments and immediately thought of you for this great ${d.specialty} role, given your background. Here are the full details:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours: ${d.shiftType} (${d.weeklyHours} hours/week)

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate)}/hr
Meals & Housing Stipend: ${currency(d.weeklyStipend)}/week
Total Gross Weekly Pay: ${currency(d.grossWeeklyPay)}

This is a highly competitive role, and I'd love to get your file submitted right away.

Are you available to start ${shortDate(d.startDate)}, or when would be the best time for you to start your next travel assignment?

Let me know if you have any questions!

Best,
[Your name]`,
    }),
  ),
  catalogTemplate('working_traveler_interest', (d) => ({
      subject: `${d.specialty} – ${d.facility} | ${currency(d.grossWeeklyPay)}/week`,
      body: `Hi ${d.name.split(' ')[0] || ''},

I saw you clicked interested on this one — here are the details:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Dates: ${shortDate(d.startDate)} - ${shortDate(d.endDate)}
Shift: ${d.shiftType} (${d.weeklyHours} hrs/wk)

Pay: ${currency(d.taxableRate)}/hr + ${currency(d.weeklyStipend)}/wk stipends = ${currency(d.grossWeeklyPay)}/wk

Let me know if you have any time-off needs and I'll get you submitted!

Thank you!`,
    }),
  ),
  catalogTemplate('reengaged_traveler_interest', (d) => ({
      subject: `${d.specialty} – ${d.facility} | ${currency(d.grossWeeklyPay)}/week`,
      body: `Hi ${d.name.split(' ')[0] || ''},

I hope you're doing well! I saw you clicked interested on this one — here are the details:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Dates: ${shortDate(d.startDate)} - ${shortDate(d.endDate)}
Shift: ${d.shiftType} (${d.weeklyHours} hrs/wk)

Pay: ${currency(d.taxableRate)}/hr + ${currency(d.weeklyStipend)}/wk stipends = ${currency(d.grossWeeklyPay)}/wk

Let me know if you have any time-off needs and I'll get you submitted. Happy to jump on a quick call if you'd like to chat through anything!

Thank you!`,
    }),
  ),
  catalogTemplate('competitive_offer', (d) => {
      const enhancedPay = d.grossWeeklyPay * 1.05;

      return {
        subject: `${d.name.split(' ')[0] || ''}, we can beat that offer`,
        body: `Hi ${d.name.split(' ')[0] || ''},

I heard you might be considering another opportunity. Before you make a decision, let me share what we can offer:

${d.facility} - ${d.city}, ${d.state}
• ${currency(enhancedPay)}/week (enhanced rate)
• Completion bonus available
• Guaranteed hours
• Day 1 health benefits
• Free private housing option

Plus, with Aya you get:
• 24/7 clinical support
• License reimbursement
• Travel reimbursement up to $500

Can we talk for 5 minutes? I think you'll be pleasantly surprised.

[Your name]`,
      };
    },
  ),
  catalogTemplate('referral_request', (d) => ({
      subject: `${d.name.split(' ')[0] || ''}, know any ${d.specialty}s looking?`,
      body: `Hi ${d.name.split(' ')[0] || ''},

Quick question — do you know any other ${d.specialty}s who might be looking for their next assignment?

I have this great opportunity at ${d.facility}:
• ${currency(d.grossWeeklyPay)}/week
• ${d.city}, ${d.state}
• ${d.shiftType} shift

If you refer someone who takes an assignment, you'll get a $500 referral bonus!

Even if this specific role isn't a fit, I have others. Any names come to mind?

Thanks!
[Your name]`,
    }),
  ),
  catalogTemplate('text_quick_pitch', (d) => {
      const formatDate = (ds: string | null) => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
      const formatEndDate = (ds: string | null) => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';

      return {
        subject: 'Text Message',
        body: `Hi ${d.name.split(' ')[0] || ''}! Quick heads up on an amazing opportunity:

Facility: ${d.facility}
Location: ${d.city}, ${d.state}
Assignment Dates: ${formatDate(d.startDate)} – ${formatEndDate(d.endDate)}
Shifts & Hours/Week: ${d.shiftType} (${d.weeklyHours || 36} hours/week)
Specialty: ${d.specialty}

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate || 0)}/hr
Total Weekly Stipends: ${currency(d.weeklyStipend || 0)}
Total Gross Weekly Pay for ${d.weeklyHours || 36} Hours Worked: ${currency(d.grossWeeklyPay)}

Please let me know if you would like to be submitted or if you have any questions.`,
      };
    },
  ),
  catalogTemplate('text_followup', (d) => ({
      subject: 'Text Message',
      body: `Hi ${d.name.split(' ')[0] || ''} - Just circling back on the ${d.specialty} position at ${d.facility} (${currency(d.grossWeeklyPay)}/wk). Still interested? Let me know either way so I can update my notes. Thanks!`,
    }),
  ),
  catalogTemplate('text_urgent', (d) => {
      const formatDate = (dateString: string | null) => {
        if (!dateString) return 'ASAP';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      };

      return {
        subject: 'Text Message',
        body: `${d.name.split(' ')[0] || ''} - URGENT: ${d.facility} needs ${d.specialty} by ${formatDate(d.startDate)}. ${currency(d.grossWeeklyPay)}/wk. They're deciding TODAY. Can you talk now? Call me at [phone] or reply YES.`,
      };
    },
  ),
  catalogTemplate('text_last_chance', (d) => ({
      subject: 'Text Message',
      body: `${d.name.split(' ')[0] || ''} - Final call on ${d.facility} (${currency(d.grossWeeklyPay)}/wk). They're deciding by EOD. Reply YES if interested, NO if not. Thanks!`,
    }),
  ),
  catalogTemplate('text_submitted', (d) => ({
      subject: 'Text Message',
      body: `${d.name.split(' ')[0] || ''} - Great news! You're submitted to ${d.facility}. They typically respond within 24-48 hours. I'll text you as soon as I hear back. Fingers crossed!`,
    }),
  ),
  catalogTemplate('text_offer_received', (d) => ({
      subject: 'Text Message',
      body: `${d.name.split(' ')[0] || ''} - OFFER IN! ${d.facility} wants you! ${currency(d.grossWeeklyPay)}/week confirmed. Call me ASAP to review details: [phone]`,
    }),
  ),
  catalogTemplate('text_submission_general', (d) => {
      const firstName = getFirstName(d.name);
      const facilityName = getFacilityName(d.facility);
      const mealsStipend = d.weeklyStipend ? (d.weeklyStipend * 0.4).toFixed(0) : '—';
      const housingStipend = d.weeklyStipend ? (d.weeklyStipend * 0.6).toFixed(0) : '—';

      return {
        subject: 'Text Message',
        body: `Hey ${firstName}, I just submitted you for this one in ${d.city}, ${d.state}.

Facility: ${facilityName}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours/Week: ${d.shiftType} (${d.weeklyHours}/week)
Specialty: ${d.specialty}

Pay Package:
${currency(d.taxableRate)}/hr taxable + $${mealsStipend}/wk meals + $${housingStipend}/wk housing
= ~${currency(d.grossWeeklyPay)}/wk total for ${d.weeklyHours} hours

Let me know if you have any questions or if you're not interested in this one.

Thank you!`,
      };
    },
  ),
  catalogTemplate('submission_with_references', (d) => {
      const firstName = getFirstName(d.name);
      const facilityName = getFacilityName(d.facility);
      const mealsStipend = d.weeklyStipend ? currency(d.weeklyStipend * 0.4) : '—';
      const housingStipend = d.weeklyStipend ? currency(d.weeklyStipend * 0.6) : '—';
      const totalStipends = d.weeklyStipend ? currency(d.weeklyStipend) : '—';

      return {
        subject: `${facilityName} – Application Submitted`,
        body: `Hi ${firstName},

Thanks for chatting with me today about the position at ${facilityName}.

Facility: ${facilityName}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours/Week: ${d.shiftType} (${d.weeklyHours} hours/week)
Specialty: ${d.specialty}

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate)}/hr
Weekly Meals Stipend: ${mealsStipend}
Weekly Housing Stipend: ${housingStipend}
Total Weekly Stipends (Meals + Housing): ${totalStipends}
Total Gross Weekly Pay for ${d.weeklyHours} Hours Worked: ${currency(d.grossWeeklyPay)}

I've submitted your application and will keep you posted as soon as I hear back.

Reference Instructions:
To help your application move forward, please ask a supervisor (Team Lead, Charge Nurse, Unit Manager, or Director) to complete the attached reference form and email it to References@ayahealthcare.com, CC'ing me at Kofi.Farkye@ayahealthcare.com for tracking.

I will also recommend more assignments to you as they come in.

Please let me know if you have any questions.`,
      };
    },
  ),
  catalogTemplate('pay_package_snippet', (d) => {
      const facilityName = getFacilityName(d.facility);
      const mealsStipend = d.weeklyStipend ? currency(d.weeklyStipend * 0.4) : '—';
      const housingStipend = d.weeklyStipend ? currency(d.weeklyStipend * 0.6) : '—';
      const totalStipends = d.weeklyStipend ? currency(d.weeklyStipend) : '—';

      return {
        subject: 'Pay Package & Facility Info',
        body: `Facility: ${facilityName}
Location: ${d.city}, ${d.state}
Assignment Dates: ${shortDate(d.startDate)} – ${shortDate(d.endDate)}
Shifts & Hours/Week: ${d.shiftType} (${d.weeklyHours} hours/week)
Specialty: ${d.specialty}

Pay Package:
Taxable Hourly Rate: ${currency(d.taxableRate)}/hr
Weekly Meals Stipend: ${mealsStipend}
Weekly Housing Stipend: ${housingStipend}
Total Weekly Stipends (Meals + Housing): ${totalStipends}
Total Gross Weekly Pay for ${d.weeklyHours} Hours Worked: ${currency(d.grossWeeklyPay)}`,
      };
    },
  ),
];

// ----------------------
// Ops (internal / operational emails)
// ----------------------
export const OPS_EMAIL_TEMPLATES: EmailTemplate[] = [
  catalogTemplate('ops_reassignment', (d) => {
      const novaUrl = d.candidateId
        ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${d.candidateId}/new-profile/about`
        : 'Not Available';

      return {
        to: 'reassignments@ayahealthcare.com',
        subject: `Reassignment Request – ${d.name}`,
        body: `Hi Team,

Can we please reassign ${d.name}?

Email: ${d.email || 'Not Available'}
Nova Profile: ${novaUrl}

Thank you!`,
      };
    },
  ),

  // Docs + references (candidate-facing ops)
  catalogTemplate('ops_documents_and_references', (d) => ({
      subject: `Items Needed to Complete Your Application - ${d.specialty} Position`,
      body: `Hi ${d.name.split(' ')[0] || ''},

Awesome — thanks for confirming! 

I'll need a couple more items to complete your file before submission:

• Please send me a copy of your ${d.specialty || 'certification'} so we can keep your file complete.
• I'll also need two supervisory references from the last two years (charge nurse, manager, or supervisor). I've attached a reference form; please have them email it to References@ayahealthcare.com and CC me.

Once we receive your certification and references, I'll move your application forward right away.

Process Timeline:
• Aya's clinical team reviews your file first
• Your profile is then sent to the facility's unit manager
• We typically hear back within 72 hours of submission

Your Benefits as an Aya Traveler:
• Day one medical, dental, and vision coverage
• Industry-leading 401k match (up to 4%)
• License reimbursements
• Sick time
• Dedicated support team — me as your recruiter + Tiffany Chavez (my assistant)

I've attached the reference form and benefits guide as well. Happy to help with any questions.

Thank you!`,
    }),
  ),

  // Licensing info (internal)
  catalogTemplate('ops_licensing_info', (d) => ({
      subject: `Licensing - ${d.specialty} - ${d.state}`,
      body: `Hi Team,

Can I please have licensing information for ${d.specialty} in ${d.state}?

Thank you!`,
    }),
  ),

  // Margin Approval (internal)
  catalogTemplate('margin_approval', (d) => {
      const margin = d.actualMargin != null ? String(d.actualMargin) : '[XX]';
      const signature = `Best,\nKofi Farkye\nSenior Recruiter, Fulfillment Specialist\nP: 858-529-7267 Ext: 17017`;

      return {
        to: 'Colton.Valdez@ayahealthcare.com',
        cc: 'Tiffany.Chavez@ayahealthcare.com',
        subject: `Margin Approval – ${d.name || '[CANDIDATE]'} – ${margin}%`,
        body: [
          `Reason needed for approval? RFM and Fast Distro set TM% at ${margin}%.`,
          `Is this a New Placement, Extension, or Change of Contract? New Placement`,
          `Is premium approval needed? N`,
          `Was this sent to Comp Info (Y/N)? N`,
          '',
          signature
        ].join('\n'),
      };
    },
  ),
];

// ----------------------
// Response (candidate response emails)
// ----------------------
export const RESPONSE_EMAIL_TEMPLATES: EmailTemplate[] = [
  catalogTemplate('response_ltc_and_references', (d) => {
      const getFirstName = (fullName: string) => (fullName?.trim()?.split(' ')[0] ?? '').replace(/[^A-Za-z'-]/g, '') || 'there';

      return {
        to: d.email,
        subject: `Next Steps: ${d.facility || 'Your Application'}`,
        body: `Hi ${getFirstName(d.name)},

Awesome — thanks for confirming!

I'll need a couple more items to complete your file before submission:

• Please send me a copy of your LTC so we can keep your file complete.
• I'll also need two supervisory references from the last two years (charge nurse, manager, or supervisor). I've attached a reference form; please have them email it to References@ayahealthcare.com and CC me.

Once we receive your certification and references, I'll move your application forward right away.

Process Timeline:
• Aya's clinical team reviews your file first
• Your profile is then sent to the facility's unit manager
• We typically hear back within 72 hours of submission

Your Benefits as an Aya Traveler:
• Day one medical, dental, and vision coverage
• Industry-leading 401k match (up to 4%)
• License reimbursements
• Sick time
• Dedicated support team — me as your recruiter + Tiffany Chavez (my assistant)

I've attached the reference form and benefits guide as well. Happy to help with any questions.

Thank you!`,
      };
    },
  ),
];

// ----------------------
// Convenience exports
// ----------------------
export const EMAIL_TEMPLATES = OUTREACH_EMAIL_TEMPLATES; // legacy export (outreach default)

export function getTemplateById(id: string, from: TemplateCategory | 'both' = 'outreach'): EmailTemplate {
  const pools =
    from === 'outreach' ? OUTREACH_EMAIL_TEMPLATES :
      from === 'ops' ? OPS_EMAIL_TEMPLATES :
        from === 'response' ? RESPONSE_EMAIL_TEMPLATES :
          [...OUTREACH_EMAIL_TEMPLATES, ...OPS_EMAIL_TEMPLATES, ...RESPONSE_EMAIL_TEMPLATES];

  return pools.find((t) => t.id === id) || pools[0];
}