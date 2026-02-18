/**
 * ════════════════════════════════════════════════════════════════════════════════
 * EMAIL BUILDER — Deterministic Email Assembly
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Pure functions that assemble emails from structured data.
 * Zero LLM involvement. Zero markdown possibility.
 *
 * @module lib/email-builder
 * @version 2.0.0
 */

import type {
    PayPackageData,
    DocRequestData,
    ReferenceRequestData,
    LicensingRequestData,
    ReassignmentRequestData,
    MarginApprovalData,
    OfferDetailsData,
    EmailOutput,
    TemplateTypeValue,
    MessageTypeValue,
} from '../types/index';

import { TemplateType, MessageType } from '../types/index';
import { CONFIG, buildNovaUrl } from './config';

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Utility Functions
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Extract first name from full name
 */
export function getFirstName(fullName: string | null): string {
    if (!fullName) return CONFIG.defaults.greeting;
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || CONFIG.defaults.greeting;
}

/**
 * Format currency value
 */
export function formatCurrency(value: string | null): string {
    if (!value) return '';
    const num = String(value).replace(/[^0-9.]/g, '');
    if (!num) return '';
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return '';
    if (parsed % 1 !== 0) {
        return '$' + parsed.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return '$' + parsed.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format hourly rate
 */
export function formatHourlyRate(value: string | null): string {
    const formatted = formatCurrency(value);
    return formatted ? `${formatted}/hr` : '';
}

/**
 * Format weekly amount
 */
export function formatWeekly(value: string | null): string {
    const formatted = formatCurrency(value);
    return formatted ? `${formatted}/week` : '';
}

/**
 * Parse location into city and state
 */
export function parseLocation(location: string | null): { city: string; state: string } {
    if (!location) return { city: '', state: '' };
    const parts = location.split(',').map(p => p.trim());
    return { city: parts[0] || '', state: parts[1] || '' };
}

function appendRequirementsSection(lines: string[], requirements?: string[] | null) {
    if (!requirements || requirements.length === 0) return;
    lines.push('Key Requirements / Notes:');
    for (const req of requirements) {
        lines.push(`- ${req}`);
    }
    lines.push('');
}

/**
 * Get missing required fields
 */
function getMissing(data: Record<string, any>, required: string[]): string[] {
    return required.filter(field => {
        const value = data[field];
        return value === null || value === undefined || value === '';
    });
}

/**
 * Create base email output
 */
function createOutput(
    templateType: TemplateTypeValue,
    to: string,
    subject: string,
    body: string,
    missing: string[]
): EmailOutput {
    return {
        to,
        cc: [CONFIG.defaults.cc],
        subject,
        body,
        missing,
        isComplete: missing.length === 0,
        templateType,
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Email Builders
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Build pay package outreach email
 */
export function buildPayPackageEmail(data: PayPackageData): EmailOutput {
    const firstName = getFirstName(data.candidateName);
    const { city, state } = parseLocation(data.location);
    const hours = data.hoursPerWeek || CONFIG.defaults.hoursPerWeek;
    const missing = getMissing(data, ['facility', 'location', 'startDate', 'weeklyTotal']);

    // Subject
    const weeklyPay = formatWeekly(data.weeklyTotal);
    const hasRequirements = Array.isArray(data.requirements) && data.requirements.length > 0;
    const specialty = data.specialty || (hasRequirements ? 'Assignment' : 'Position');
    const facilityLabel = data.facility || (city || state ? `${city}${city && state ? ', ' : ''}${state}` : null);
    let baseTitle = facilityLabel ? `${specialty} - ${facilityLabel}` : `${specialty} Details`;
    if (!data.specialty && !facilityLabel && !weeklyPay) baseTitle = 'Assignment Details';
    const subject = weeklyPay ? `${baseTitle} | ${weeklyPay}` : baseTitle;

    // Body
    const lines: string[] = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('Here is one option that matches your background:');
    lines.push('');

    const roleLabel = data.specialty || 'Assignment';
    const locationStr = city && state ? `${city}, ${state}` : (city || state || 'Location TBD');
    const header = [data.facility || 'Facility TBD', locationStr].filter(Boolean).join(' | ');
    lines.push(header);
    if (data.weeklyTotal) lines.push(`- Gross Pay: ${formatWeekly(data.weeklyTotal)}`);
    lines.push(`- Role: ${roleLabel}`);
    if (data.hourlyRate || data.stipend) {
        const breakdown = [
            data.hourlyRate ? `Taxable ${formatHourlyRate(data.hourlyRate)}` : null,
            data.stipend ? `Stipend ${formatWeekly(data.stipend)}` : null,
        ].filter(Boolean).join(' + ');
        if (breakdown) lines.push(`- Pay Breakdown: ${breakdown}`);
    }
    if (data.startDate || data.endDate) {
        lines.push(`- Assignment Dates: ${[data.startDate, data.endDate].filter(Boolean).join(' - ')}`);
    }
    if (data.shifts) lines.push(`- Shift: ${data.shifts} (${hours} hrs/wk)`);
    lines.push(`- Why this fits: ${roleLabel} demand is active in this market and aligns with your profile.`);
    lines.push('');

    appendRequirementsSection(lines, data.requirements);

    lines.push(`Reply with "interested" plus your start-date window${data.startDate ? ` (target ${data.startDate})` : ''} and I can submit right away.`);
    lines.push('');
    lines.push('Thank you!');
    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return createOutput(
        TemplateType.PAY_PACKAGE,
        data.candidateEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build working traveler email
 */
export function buildWorkingTravelerEmail(data: PayPackageData): EmailOutput {
    const firstName = getFirstName(data.candidateName);
    const { city, state } = parseLocation(data.location);
    const hours = data.hoursPerWeek || CONFIG.defaults.hoursPerWeek;
    const missing = getMissing(data, ['facility', 'weeklyTotal']);

    const specialty = data.specialty || 'Position';
    const weeklyPay = formatWeekly(data.weeklyTotal);
    const subject = weeklyPay
        ? `${specialty} - ${data.facility || 'Facility'} | ${weeklyPay}`
        : `${specialty} - ${data.facility || 'Facility'}`;

    const lines: string[] = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('Quick breakdown below:');
    lines.push('');

    const header = [data.facility || 'Facility TBD', [city, state].filter(Boolean).join(', ') || 'Location TBD']
        .filter(Boolean)
        .join(' | ');
    lines.push(header);
    if (data.weeklyTotal) lines.push(`- Gross Pay: ${formatWeekly(data.weeklyTotal)}`);
    lines.push(`- Role: ${specialty}`);
    if (data.hourlyRate || data.stipend) {
        const parts: string[] = [];
        if (data.hourlyRate) parts.push(`Taxable ${formatHourlyRate(data.hourlyRate)}`);
        if (data.stipend) parts.push(`Stipend ${formatWeekly(data.stipend)}`);
        lines.push(`- Pay Breakdown: ${parts.join(' + ')}`);
    }
    if (data.startDate || data.endDate) lines.push(`- Dates: ${[data.startDate, data.endDate].filter(Boolean).join(' - ')}`);
    if (data.shifts) lines.push(`- Shift: ${data.shifts} (${hours} hrs/wk)`);
    lines.push('- Why this fits: solid match to your recent interests and availability profile.');
    lines.push('');

    appendRequirementsSection(lines, data.requirements);

    lines.push('Reply with your availability and any time-off so I can submit immediately.');
    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return createOutput(
        TemplateType.WORKING_TRAVELER,
        data.candidateEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build re-engaged traveler email
 */
export function buildReengagedTravelerEmail(data: PayPackageData): EmailOutput {
    const firstName = getFirstName(data.candidateName);
    const { city, state } = parseLocation(data.location);
    const hours = data.hoursPerWeek || CONFIG.defaults.hoursPerWeek;
    const missing = getMissing(data, ['facility', 'weeklyTotal']);

    const specialty = data.specialty || 'Position';
    const weeklyPay = formatWeekly(data.weeklyTotal);
    const subject = weeklyPay
        ? `${specialty} - ${data.facility || 'Facility'} | ${weeklyPay}`
        : `${specialty} - ${data.facility || 'Facility'}`;

    const lines: string[] = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('Great to reconnect — here is a role you may want to review:');
    lines.push('');

    const header = [data.facility || 'Facility TBD', [city, state].filter(Boolean).join(', ') || 'Location TBD']
        .filter(Boolean)
        .join(' | ');
    lines.push(header);
    if (data.weeklyTotal) lines.push(`- Gross Pay: ${formatWeekly(data.weeklyTotal)}`);
    lines.push(`- Role: ${specialty}`);
    if (data.hourlyRate || data.stipend) {
        const parts: string[] = [];
        if (data.hourlyRate) parts.push(`Taxable ${formatHourlyRate(data.hourlyRate)}`);
        if (data.stipend) parts.push(`Stipend ${formatWeekly(data.stipend)}`);
        lines.push(`- Pay Breakdown: ${parts.join(' + ')}`);
    }
    if (data.startDate || data.endDate) lines.push(`- Dates: ${[data.startDate, data.endDate].filter(Boolean).join(' - ')}`);
    if (data.shifts) lines.push(`- Shift: ${data.shifts} (${hours} hrs/wk)`);
    lines.push('- Why this fits: aligns with your profile and current market demand.');
    lines.push('');

    appendRequirementsSection(lines, data.requirements);

    lines.push('Reply with your preferred option and start-date window, and I will move this forward today.');
    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return createOutput(
        TemplateType.REENGAGED_TRAVELER,
        data.candidateEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build document request email
 */
export function buildDocRequestEmail(data: DocRequestData): EmailOutput {
    const firstName = getFirstName(data.candidateName);
    const missing = getMissing(data, ['candidateName']);

    const subject = data.facility
        ? `Documents Needed for Submission - ${data.facility}`
        : 'Documents Needed for Submission';

    const lines: string[] = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('To move forward with your submission, I need the following:');
    lines.push('');

    if (data.documents && data.documents.length > 0) {
        data.documents.forEach(doc => lines.push(`- ${doc}`));
    } else {
        lines.push('- Updated resume');
        lines.push('- BLS card (AHA preferred - send what you have and we will confirm facility requirement)');
    }
    lines.push('- Best interview times this week (include time zone)');
    lines.push('');
    lines.push('Send these over and I will get you submitted right away.');
    return createOutput(
        TemplateType.DOC_REQUEST,
        data.candidateEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build reference request email
 */
export function buildReferenceRequestEmail(data: ReferenceRequestData): EmailOutput {
    const firstName = getFirstName(data.candidateName);
    const missing = getMissing(data, ['candidateName']);

    const subject = 'References Needed for Your Submission';

    const lines: string[] = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('Before I can submit you, I need to confirm your references:');
    lines.push('');
    lines.push('- Are you okay with facilities reaching out to your references directly?');
    lines.push('- Are your references current and will they respond promptly?');
    lines.push('- Do you need to update or add any references?');
    lines.push('');
    lines.push('Let me know and I will move forward with your submission.');
    return createOutput(
        TemplateType.REFERENCE_REQUEST,
        data.candidateEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build licensing request email (internal)
 */
export function buildLicensingRequestEmail(data: LicensingRequestData): EmailOutput {
    const missing = getMissing(data, ['specialty', 'state']);

    const subject = `Licensing - ${data.specialty || 'Specialty'}/${data.state || 'State'}`;

    const lines: string[] = [];

    lines.push('Hi Team,');
    lines.push('');
    lines.push(`Can I please have licensing information for ${data.specialty || '[Specialty]'} in ${data.state || '[State]'}?`);
    lines.push('');
    lines.push('Thank you!');
    return createOutput(
        TemplateType.LICENSING,
        CONFIG.teamEmails.licensing,
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build reassignment request email (internal)
 */
export function buildReassignmentRequestEmail(data: ReassignmentRequestData): EmailOutput {
    const missing = getMissing(data, ['candidateName', 'novaId']);

    const subject = `Please Reassign - ${data.candidateName || 'Candidate'}`;
    const novaUrl = data.novaId ? buildNovaUrl(data.novaId) : '[Nova link needed]';

    const lines: string[] = [];

    lines.push('Hi Team,');
    lines.push('');
    lines.push(`Can we please reassign ${data.candidateName || '[Candidate Name]'}?`);
    lines.push('');
    lines.push(`Nova link: ${novaUrl}`);
    if (data.candidateEmail) lines.push(`Email: ${data.candidateEmail}`);
    lines.push('');
    lines.push('Thank you!');
    return createOutput(
        TemplateType.REASSIGNMENT,
        CONFIG.teamEmails.reassignments,
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build margin approval email (internal)
 */
export function buildMarginApprovalEmail(data: MarginApprovalData): EmailOutput {
    const missing = getMissing(data, [
        'candidateName',
        'marginPercentage',
        'reason',
        'placementType',
        'premiumNeeded',
        'sentToComp',
        'approverEmail',
    ]);

    const marginRaw = data.marginPercentage ? String(data.marginPercentage).replace(/%/g, '').trim() : '';
    const marginLabel = marginRaw ? `${marginRaw}%` : 'Margin %';
    const subject = `Margin Approval: ${data.candidateName || 'Candidate'} - ${marginLabel}`;

    const lines: string[] = [];

    lines.push('Hi Team,');
    lines.push('');
    lines.push(`Reason needed for approval? ${data.reason || '[Reason needed]'}`);
    lines.push(`Is this a New Placement, Extension, or Change of Contract? ${data.placementType || '[Placement type]'}`);
    lines.push(`Is premium approval needed? ${data.premiumNeeded || '[Y/N]'}`);

    if (data.why && data.why !== data.reason) {
        lines.push(`Why? ${data.why}`);
    }

    lines.push(`Was this sent to Comp Info (Y/N)? ${data.sentToComp || '[Y/N]'}`);

    if (data.distroResponse) {
        lines.push(`Distro response: ${data.distroResponse}`);
    }

    if (data.novaUrl) {
        lines.push(`Nova link: ${data.novaUrl}`);
    }

    if (data.facility) {
        lines.push(`Facility: ${data.facility}`);
    }

    return createOutput(
        TemplateType.MARGIN_APPROVAL,
        data.approverEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

/**
 * Build offer details email
 */
export function buildOfferDetailsEmail(data: OfferDetailsData): EmailOutput {
    const firstName = getFirstName(data.candidateName);
    const missing = getMissing(data, ['facility', 'candidateName', 'weeklyTotal']);

    const subject = `Offer: ${data.facility || 'Facility'} - ${data.location || 'Location'}`;

    const lines: string[] = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push(`Congratulations on your offer with ${data.facility || 'the facility'}. Here are the details:`);
    lines.push('');

    if (data.facility) lines.push(`Hospital: ${data.facility}`);
    if (data.address) lines.push(`Address: ${data.address}`);
    if (data.bedCount) lines.push(`Number of Beds: ${data.bedCount}`);
    if (data.specialty) lines.push(`Specialty: ${data.specialty}`);
    if (data.startDate || data.endDate) {
        lines.push(`Assignment Dates: ${[data.startDate, data.endDate].filter(Boolean).join(' - ')}`);
    }
    if (data.shifts) lines.push(`Shifts and Hours/Week: ${data.shifts}`);
    lines.push('Insurance: Standard Medical, Dental and Vision benefits');
    lines.push('');

    if (data.hourlyRate) lines.push(`Taxable Hourly Rate: ${formatHourlyRate(data.hourlyRate)}`);
    if (data.mealsStipend) lines.push(`Weekly Meals Stipend: ${formatWeekly(data.mealsStipend)}`);
    if (data.housingStipend) lines.push(`Weekly Housing Stipend: ${formatWeekly(data.housingStipend)}`);
    if (data.stipend) lines.push(`Total Weekly Stipends (Meals and Housing): ${formatWeekly(data.stipend)}`);
    if (data.weeklyTotal) lines.push(`Total Gross Weekly Pay: ${formatWeekly(data.weeklyTotal)}`);
    lines.push('');

    lines.push('Next Steps:');
    lines.push('1. Reply "Confirmed" to this email.');
    lines.push('2. Login to Aya to sign the contract (it will appear shortly).');
    lines.push('3. If anything is missing, send a photo of the missing item and I will upload it.');
    lines.push('');
    lines.push('Thank you,');
    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return createOutput(
        TemplateType.OFFER_DETAILS,
        data.candidateEmail || '',
        subject,
        lines.join('\n'),
        missing
    );
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Template Router
// ════════════════════════════════════════════════════════════════════════════════
// NOTE: For the full unified template registry (30+ templates including SMS,
// frontend outreach, ops, and response templates), use template-registry.ts.
// The builders below are the core pipeline templates used by the chat handlers.

const TEMPLATE_BUILDERS: Partial<Record<TemplateTypeValue, (data: any) => EmailOutput>> = {
    [TemplateType.PAY_PACKAGE]: buildPayPackageEmail,
    [TemplateType.DOC_REQUEST]: buildDocRequestEmail,
    [TemplateType.REFERENCE_REQUEST]: buildReferenceRequestEmail,
    [TemplateType.WORKING_TRAVELER]: buildWorkingTravelerEmail,
    [TemplateType.REENGAGED_TRAVELER]: buildReengagedTravelerEmail,
    [TemplateType.LICENSING]: buildLicensingRequestEmail,
    [TemplateType.REASSIGNMENT]: buildReassignmentRequestEmail,
    [TemplateType.MARGIN_APPROVAL]: buildMarginApprovalEmail,
    [TemplateType.OFFER_DETAILS]: buildOfferDetailsEmail,
};

/**
 * Build email using specified template
 */
export function buildEmail(
    templateType: TemplateTypeValue,
    data: Record<string, any>,
    messageType: MessageTypeValue = MessageType.EMAIL
): EmailOutput {
    const builder = TEMPLATE_BUILDERS[templateType];
    const email = builder ? builder(data) : buildPayPackageEmail(data as PayPackageData);
    const resolvedMessageType = messageType === MessageType.AUTO ? MessageType.EMAIL : messageType;
    email.messageType = resolvedMessageType;
    return email;
}

/**
 * Detect template type from message content
 */
export function detectTemplateType(message: string, modeContext: string = ''): TemplateTypeValue {
    const text = `${message} ${modeContext}`.toLowerCase();

    // Mode context takes priority
    if (text.includes('working traveler')) return TemplateType.WORKING_TRAVELER;
    if (text.includes('re-engaged') || text.includes('reengaged')) return TemplateType.REENGAGED_TRAVELER;
    if (text.includes('reassignment') || text.includes('reassign')) return TemplateType.REASSIGNMENT;
    if (text.includes('licensing')) return TemplateType.LICENSING;
    if (text.includes('margin approval') || /\bmargin\b.*%/.test(text)) return TemplateType.MARGIN_APPROVAL;
    if (text.includes('offer detail')) return TemplateType.OFFER_DETAILS;

    // Content-based detection
    if (/\b(reference|references)\b/.test(text)) return TemplateType.REFERENCE_REQUEST;
    if (/\b(document|documents|bls|acls|resume|certification)\b/.test(text)) return TemplateType.DOC_REQUEST;

    return TemplateType.PAY_PACKAGE;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Response Formatters
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Format email as plain text for API response
 */
function formatBodyForMessageType(body: string, messageType: MessageTypeValue): string {
    const resolvedMessageType = messageType === MessageType.AUTO ? MessageType.EMAIL : messageType;
    if (resolvedMessageType === MessageType.SMS) {
        const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
        const filtered = lines.filter((line) => !/^hi\s+/i.test(line) && !/^thank(s| you)/i.test(line));
        return filtered.slice(0, 6).join(' ');
    }
    if (resolvedMessageType === MessageType.SLACK) {
        const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
        return lines.join('\n');
    }
    return body;
}

export function formatEmailText(email: EmailOutput): string {
    const messageType = email.messageType === MessageType.AUTO ? MessageType.EMAIL : (email.messageType || MessageType.EMAIL);
    const body = formatBodyForMessageType(email.body, messageType);
    if (messageType !== MessageType.EMAIL) {
        return `<draft>\n${body}\n</draft>`;
    }
    const lines: string[] = [];
    if (email.to) lines.push(`To: ${email.to}`);
    lines.push(`Subject: ${email.subject}`);
    lines.push('');
    lines.push(body);
    return `<draft>\n${lines.join('\n')}\n</draft>`;
}

/**
 * Format email as structured JSON for frontend
 */
export function formatEmailStructured(email: EmailOutput): object {
    const messageType = email.messageType === MessageType.AUTO ? MessageType.EMAIL : (email.messageType || MessageType.EMAIL);
    const body = formatBodyForMessageType(email.body, messageType);
    return {
        kind: 'email_draft',
        email: {
            to: email.to || null,
            cc: email.cc,
            subject: messageType === MessageType.EMAIL ? email.subject : '',
            body,
        },
        metadata: {
            templateType: email.templateType,
            isComplete: email.isComplete,
            missingFields: email.missing,
            extractedAt: new Date().toISOString(),
            messageType,
        },
    };
}
