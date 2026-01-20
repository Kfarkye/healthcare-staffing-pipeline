/**
 * Builds a deep link for composing an email in Outlook Web.
 */
export const buildOutlookLink = (to: string, cc: string | undefined, subject: string, body: string): string => {
    const encodeParam = (s: string): string => encodeURIComponent(s ?? '');

    return `https://outlook.office.com/mail/deeplink/compose?to=${encodeParam(to)}${cc ? `&cc=${encodeParam(cc)}` : ''
        }&subject=${encodeParam(subject)}&body=${encodeParam(body)}`;
};

/**
 * Extracts potential email fields from AI text to help populate the Outlook deep link.
 * Simple heuristic for POC; can be expanded.
 */
export const extractEmailFields = (text: string) => {
    let to = '';
    let subject = '';
    let body = text;

    // Try to find a 'To:' line
    const toMatch = text.match(/To:\s*(.*)/i);
    if (toMatch) {
        to = toMatch[1].trim();
        body = body.replace(/To:\s*.*\n?/i, '').trim();
    }

    // Try to find a 'Subject:' line
    const subjectMatch = text.match(/Subject:\s*(.*)/i);
    if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = body.replace(/Subject:\s*.*\n?/i, '').trim();
    }

    return { to, subject, body: body.trim() };
};
