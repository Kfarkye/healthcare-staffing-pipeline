/**
 * ════════════════════════════════════════════════════════════════════════════════
 * EMAIL BUILDER — Deterministic Email Assembly Engine
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE PRINCIPLE:
 * - LLM extracts structured data (JSON)
 * - Code assembles final email string
 * - Zero LLM involvement in formatting
 *
 * This eliminates markdown leakage permanently.
 *
 * @module app/api/chat/command-center/lib/email-builder
 * @version 1.0.0
 */

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Type Definitions
// ════════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PayPackageData
 * @property {string|null} candidateName
 * @property {string|null} candidateEmail
 * @property {string|null} facility
 * @property {string|null} location
 * @property {string|null} specialty
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {string|null} shifts
 * @property {string|null} hoursPerWeek
 * @property {string|null} hourlyRate
 * @property {string|null} stipend
 * @property {string|null} weeklyTotal
 * @property {string[]} [missing]
 */

/**
 * @typedef {Object} EmailOutput
 * @property {string} to
 * @property {string} subject
 * @property {string} body
 * @property {string[]} missing
 * @property {boolean} isComplete
 */

/**
 * @typedef {Object} DocRequestData
 * @property {string|null} candidateName
 * @property {string|null} candidateEmail
 * @property {string|null} facility
 * @property {string[]} documents
 */

/**
 * @typedef {Object} ReferenceRequestData
 * @property {string|null} candidateName
 * @property {string|null} candidateEmail
 */

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Configuration
// ════════════════════════════════════════════════════════════════════════════════

const CONFIG = Object.freeze({
    signature: {
        name: 'Kofi Farkye',
        title: 'Senior Recruiter, Fulfillment Specialist',
        phone: '858-529-7267',
        extension: '17017',
        assistant: {
            name: 'Tiffany Chavez',
            email: 'Tiffany.Chavez@ayahealthcare.com'
        }
    },
    defaults: {
        hoursPerWeek: '36',
        greeting: 'there'
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Utility Functions
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Extract first name from full name
 * @param {string|null} fullName
 * @returns {string}
 */
function getFirstName(fullName) {
    if (!fullName) return CONFIG.defaults.greeting;
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || CONFIG.defaults.greeting;
}

/**
 * Format currency consistently
 * @param {string|null} value
 * @returns {string}
 */
function formatCurrency(value) {
    if (!value) return '';
    // Remove existing formatting, keep numbers and decimal
    const num = String(value).replace(/[^0-9.]/g, '');
    if (!num) return '';
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return '';
    // Format with commas and 2 decimal places if has cents, otherwise whole number
    if (parsed % 1 !== 0) {
        return '$' + parsed.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return '$' + parsed.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format hourly rate
 * @param {string|null} value
 * @returns {string}
 */
function formatHourlyRate(value) {
    const formatted = formatCurrency(value);
    if (!formatted) return '';
    return formatted + '/hr';
}

/**
 * Format weekly amount
 * @param {string|null} value
 * @returns {string}
 */
function formatWeekly(value) {
    const formatted = formatCurrency(value);
    if (!formatted) return '';
    return formatted + '/week';
}

/**
 * Parse location into city and state
 * @param {string|null} location
 * @returns {{city: string, state: string}}
 */
function parseLocation(location) {
    if (!location) return { city: '', state: '' };
    const parts = location.split(',').map(p => p.trim());
    return {
        city: parts[0] || '',
        state: parts[1] || ''
    };
}

/**
 * Build signature block
 * @returns {string}
 */
function buildSignature() {
    const { name, title, phone, extension, assistant } = CONFIG.signature;
    return [
        '',
        'Please include my recruiter assistant on all email communications:',
        `${assistant.name} - ${assistant.email}`,
        '',
        name,
        title,
        `P: ${phone} Ext: ${extension}`
    ].join('\n');
}

/**
 * Collect missing required fields
 * @param {Object} data
 * @param {string[]} requiredFields
 * @returns {string[]}
 */
function getMissingFields(data, requiredFields) {
    return requiredFields.filter(field => {
        const value = data[field];
        return value === null || value === undefined || value === '';
    });
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Email Templates (Pure Functions)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Build pay package outreach email
 * @param {PayPackageData} data
 * @returns {EmailOutput}
 */
export function buildPayPackageEmail(data) {
    const firstName = getFirstName(data.candidateName);
    const { city, state } = parseLocation(data.location);
    const hours = data.hoursPerWeek || CONFIG.defaults.hoursPerWeek;

    // Track missing fields
    const requiredFields = ['facility', 'location', 'startDate', 'endDate', 'weeklyTotal'];
    const missing = getMissingFields(data, requiredFields);

    // Build subject
    const specialty = data.specialty || data.facility || 'Position';
    const weeklyPay = formatWeekly(data.weeklyTotal);
    const subject = weeklyPay
        ? `${specialty} - ${data.facility || 'Facility'} | ${weeklyPay}`
        : `${specialty} - ${data.facility || 'Facility'}`;

    // Build body sections
    const lines = [];

    // Greeting
    lines.push(`Hi ${firstName},`);
    lines.push('');

    // Intro
    lines.push(`I came across your profile and thought you would be a great fit for this ${specialty} opening at ${data.facility || 'the facility'}.`);
    lines.push('');

    // Job Details Block
    if (data.facility) lines.push(`Facility: ${data.facility}`);
    if (city || state) lines.push(`Location: ${city}${city && state ? ', ' : ''}${state}`);
    if (data.startDate || data.endDate) {
        const dates = [data.startDate, data.endDate].filter(Boolean).join(' - ');
        lines.push(`Assignment Dates: ${dates}`);
    }
    if (data.shifts) {
        lines.push(`Shifts: ${data.shifts}${hours ? ` (${hours} hrs/wk)` : ''}`);
    }
    lines.push('');

    // Pay Package Block
    const hasPayData = data.hourlyRate || data.stipend || data.weeklyTotal;
    if (hasPayData) {
        lines.push('Pay Package:');
        if (data.hourlyRate) lines.push(`- Taxable Hourly Rate: ${formatHourlyRate(data.hourlyRate)}`);
        if (data.stipend) lines.push(`- Meals and Housing Stipend: ${formatWeekly(data.stipend)}`);
        if (data.weeklyTotal) lines.push(`- Total Gross Weekly Pay: ${formatWeekly(data.weeklyTotal)}`);
        lines.push('');
    }

    // CTA Block
    lines.push('To move forward, confirm:');
    lines.push(`- Available to start ${data.startDate || 'on the start date'}?`);
    lines.push('- Any time-off during the assignment?');
    lines.push('- Is your Aya profile current?');
    lines.push('');

    // Closing
    lines.push('Reply with the 3 confirmations above and I will get you submitted right away.');

    // Signature
    lines.push(buildSignature());

    // Missing fields note (only if missing)
    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return {
        to: data.candidateEmail || '',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

/**
 * Build document request email
 * @param {DocRequestData} data
 * @returns {EmailOutput}
 */
export function buildDocRequestEmail(data) {
    const firstName = getFirstName(data.candidateName);
    const missing = getMissingFields(data, ['candidateName']);

    const subject = data.facility
        ? `Documents Needed for Submission - ${data.facility}`
        : 'Documents Needed for Submission';

    const lines = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('To move forward with your submission, I need the following:');
    lines.push('');

    // Document list
    if (data.documents && data.documents.length > 0) {
        data.documents.forEach(doc => {
            lines.push(`- ${doc}`);
        });
    } else {
        lines.push('- Updated resume');
        lines.push('- BLS card (AHA preferred - send what you have and we will confirm facility requirement)');
    }
    lines.push('- Best interview times this week (include time zone)');
    lines.push('');

    lines.push('Send these over and I will get you submitted right away.');

    lines.push(buildSignature());

    return {
        to: data.candidateEmail || '',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

/**
 * Build reference request email
 * @param {ReferenceRequestData} data
 * @returns {EmailOutput}
 */
export function buildReferenceRequestEmail(data) {
    const firstName = getFirstName(data.candidateName);
    const missing = getMissingFields(data, ['candidateName']);

    const subject = 'References Needed for Your Submission';

    const lines = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('Before I can submit you, I need to confirm your references:');
    lines.push('');
    lines.push('- Are you okay with facilities reaching out to your references directly?');
    lines.push('- Are your references current and will they respond promptly?');
    lines.push('- Do you need to update or add any references?');
    lines.push('');
    lines.push('Let me know and I will move forward with your submission.');

    lines.push(buildSignature());

    return {
        to: data.candidateEmail || '',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

/**
 * Build working traveler interest email
 * @param {PayPackageData} data
 * @returns {EmailOutput}
 */
export function buildWorkingTravelerEmail(data) {
    const firstName = getFirstName(data.candidateName);
    const { city, state } = parseLocation(data.location);
    const hours = data.hoursPerWeek || CONFIG.defaults.hoursPerWeek;

    const requiredFields = ['facility', 'weeklyTotal'];
    const missing = getMissingFields(data, requiredFields);

    const specialty = data.specialty || 'Position';
    const weeklyPay = formatWeekly(data.weeklyTotal);
    const subject = weeklyPay
        ? `${specialty} - ${data.facility || 'Facility'} | ${weeklyPay}`
        : `${specialty} - ${data.facility || 'Facility'}`;

    const lines = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('I saw you clicked interested on this one - here are the details:');
    lines.push('');

    if (data.facility) lines.push(`Facility: ${data.facility}`);
    if (city || state) lines.push(`Location: ${city}${city && state ? ', ' : ''}${state}`);
    if (data.startDate || data.endDate) {
        const dates = [data.startDate, data.endDate].filter(Boolean).join(' - ');
        lines.push(`Dates: ${dates}`);
    }
    if (data.shifts) lines.push(`Shift: ${data.shifts} (${hours} hrs/wk)`);
    lines.push('');

    if (data.hourlyRate || data.stipend || data.weeklyTotal) {
        const payParts = [];
        if (data.hourlyRate) payParts.push(formatHourlyRate(data.hourlyRate));
        if (data.stipend) payParts.push(`${formatWeekly(data.stipend)} stipends`);
        if (data.weeklyTotal) payParts.push(`${formatWeekly(data.weeklyTotal)}`);
        lines.push(`Pay: ${payParts.join(' + ')}`);
        lines.push('');
    }

    lines.push('Let me know if you have any time-off needs and I will get you submitted.');

    lines.push(buildSignature());

    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return {
        to: data.candidateEmail || '',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

/**
 * Build re-engaged traveler interest email
 * @param {PayPackageData} data
 * @returns {EmailOutput}
 */
export function buildReengagedTravelerEmail(data) {
    const firstName = getFirstName(data.candidateName);
    const { city, state } = parseLocation(data.location);
    const hours = data.hoursPerWeek || CONFIG.defaults.hoursPerWeek;

    const requiredFields = ['facility', 'weeklyTotal'];
    const missing = getMissingFields(data, requiredFields);

    const specialty = data.specialty || 'Position';
    const weeklyPay = formatWeekly(data.weeklyTotal);
    const subject = weeklyPay
        ? `${specialty} - ${data.facility || 'Facility'} | ${weeklyPay}`
        : `${specialty} - ${data.facility || 'Facility'}`;

    const lines = [];

    lines.push(`Hi ${firstName},`);
    lines.push('');
    lines.push('I hope you are doing well! I saw you clicked interested on this one - here are the details:');
    lines.push('');

    if (data.facility) lines.push(`Facility: ${data.facility}`);
    if (city || state) lines.push(`Location: ${city}${city && state ? ', ' : ''}${state}`);
    if (data.startDate || data.endDate) {
        const dates = [data.startDate, data.endDate].filter(Boolean).join(' - ');
        lines.push(`Dates: ${dates}`);
    }
    if (data.shifts) lines.push(`Shift: ${data.shifts} (${hours} hrs/wk)`);
    lines.push('');

    if (data.hourlyRate || data.stipend || data.weeklyTotal) {
        const payParts = [];
        if (data.hourlyRate) payParts.push(formatHourlyRate(data.hourlyRate));
        if (data.stipend) payParts.push(`${formatWeekly(data.stipend)} stipends`);
        if (data.weeklyTotal) payParts.push(`${formatWeekly(data.weeklyTotal)}`);
        lines.push(`Pay: ${payParts.join(' + ')}`);
        lines.push('');
    }

    lines.push('Let me know if you have any time-off needs and I will get you submitted. Happy to jump on a quick call if you would like to chat through anything.');

    lines.push(buildSignature());

    if (missing.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`Review needed: ${missing.join(', ')}`);
    }

    return {
        to: data.candidateEmail || '',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

/**
 * Build licensing request email (internal)
 * @param {{specialty: string, state: string}} data
 * @returns {EmailOutput}
 */
export function buildLicensingRequestEmail(data) {
    const missing = getMissingFields(data, ['specialty', 'state']);

    const subject = `Licensing - ${data.specialty || 'Specialty'}/${data.state || 'State'}`;

    const lines = [];

    lines.push('Hi Team,');
    lines.push('');
    lines.push(`Can I please have licensing information for ${data.specialty || '[Specialty]'} in ${data.state || '[State]'}?`);
    lines.push('');
    lines.push('Thank you!');

    lines.push(buildSignature());

    return {
        to: 'LicensingAllied@ayahealthcare.com',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

/**
 * Build reassignment request email (internal)
 * @param {{candidateName: string, novaId: string, candidateEmail?: string}} data
 * @returns {EmailOutput}
 */
export function buildReassignmentRequestEmail(data) {
    const missing = getMissingFields(data, ['candidateName', 'novaId']);

    const subject = `Please Reassign - ${data.candidateName || 'Candidate'}`;

    const novaUrl = data.novaId
        ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${data.novaId}/new-profile/about`
        : '[Nova link needed]';

    const lines = [];

    lines.push('Hi Team,');
    lines.push('');
    lines.push(`Can we please reassign ${data.candidateName || '[Candidate Name]'}?`);
    lines.push('');
    lines.push(`Nova link: ${novaUrl}`);
    if (data.candidateEmail) {
        lines.push(`Email: ${data.candidateEmail}`);
    }
    lines.push('');
    lines.push('Thank you!');

    lines.push(buildSignature());

    return {
        to: 'reassignments@ayahealthcare.com',
        subject,
        body: lines.join('\n'),
        missing,
        isComplete: missing.length === 0
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 5: Template Router
// ════════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'pay_package' | 'doc_request' | 'reference_request' | 'working_traveler' | 'reengaged_traveler' | 'licensing' | 'reassignment'} TemplateType
 */

/**
 * Route to appropriate template based on context
 * @param {string} templateType
 * @param {Object} data
 * @returns {EmailOutput}
 */
export function buildEmail(templateType, data) {
    switch (templateType) {
        case 'pay_package':
            return buildPayPackageEmail(data);
        case 'doc_request':
            return buildDocRequestEmail(data);
        case 'reference_request':
            return buildReferenceRequestEmail(data);
        case 'working_traveler':
            return buildWorkingTravelerEmail(data);
        case 'reengaged_traveler':
            return buildReengagedTravelerEmail(data);
        case 'licensing':
            return buildLicensingRequestEmail(data);
        case 'reassignment':
            return buildReassignmentRequestEmail(data);
        default:
            return buildPayPackageEmail(data);
    }
}

/**
 * Detect template type from user message and mode context
 * @param {string} message
 * @param {string} [modeContext]
 * @returns {TemplateType}
 */
export function detectTemplateType(message, modeContext = '') {
    const text = (message + ' ' + modeContext).toLowerCase();

    // Explicit mode contexts (from chips)
    if (text.includes('working traveler')) return 'working_traveler';
    if (text.includes('re-engaged') || text.includes('reengaged')) return 'reengaged_traveler';
    if (text.includes('reassignment') || text.includes('reassign')) return 'reassignment';
    if (text.includes('licensing')) return 'licensing';

    // Content-based detection
    if (/\b(reference|references)\b/.test(text)) return 'reference_request';
    if (/\b(document|documents|bls|acls|resume|certification)\b/.test(text)) return 'doc_request';
    if (/\b(pay\s*package|outreach|cold\s*email)\b/.test(text)) return 'pay_package';

    // Default
    return 'pay_package';
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 6: Response Formatter
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Format email output for API response
 * @param {EmailOutput} email
 * @returns {string}
 */
export function formatEmailResponse(email) {
    const lines = [];

    if (email.to) {
        lines.push(`To: ${email.to}`);
    }
    lines.push(`Subject: ${email.subject}`);
    lines.push('');
    lines.push(email.body);

    return lines.join('\n');
}

/**
 * Format email output as structured JSON for frontend
 * @param {EmailOutput} email
 * @param {Object} [metadata]
 * @returns {Object}
 */
export function formatStructuredResponse(email, metadata = {}) {
    return {
        kind: 'email_draft',
        email: {
            to: email.to || null,
            subject: email.subject,
            body: email.body,
            cc: [CONFIG.signature.assistant.email]
        },
        metadata: {
            isComplete: email.isComplete,
            missingFields: email.missing,
            ...metadata
        }
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 7: Exports
// ════════════════════════════════════════════════════════════════════════════════

export default {
    buildEmail,
    buildPayPackageEmail,
    buildDocRequestEmail,
    buildReferenceRequestEmail,
    buildWorkingTravelerEmail,
    buildReengagedTravelerEmail,
    buildLicensingRequestEmail,
    buildReassignmentRequestEmail,
    detectTemplateType,
    formatEmailResponse,
    formatStructuredResponse,
    getFirstName,
    formatCurrency,
    formatHourlyRate,
    formatWeekly,
    parseLocation,
    buildSignature
};
