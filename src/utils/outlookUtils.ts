/**
 * Builds a deep link for composing an email in Outlook Web.
 */
export const buildOutlookLink = (to: string, cc: string | undefined, subject: string, body: string): string => {
    const encodeParam = (s: string): string => encodeURIComponent(s ?? '');
    const cleanSubject = stripMarkdown(subject);
    const cleanBody = stripMarkdown(body);

    return `https://outlook.office.com/mail/deeplink/compose?to=${encodeParam(to)}${cc ? `&cc=${encodeParam(cc)}` : ''
        }&subject=${encodeParam(cleanSubject)}&body=${encodeParam(cleanBody)}`;
};

/**
 * Strips basic markdown artifacts (asterisks, etc.) for clean copy-pasting.
 */
export const stripMarkdown = (text: string): string => {
    return text
        .replace(/^#{1,6}\s*/gm, '')     // Headers (# to ######)
        .replace(/\*\*(.*?)\*\*/g, '$1') // Bold **text**
        .replace(/\*\*([^*]+)$/gm, '$1') // Unclosed bold at line end
        .replace(/^\*\*([^*]+)/gm, '$1') // Unclosed bold at line start
        .replace(/\*(.*?)\*/g, '$1')     // Italic *text*
        .replace(/^\s*[-*]\s+/gm, '• ')  // List items (- or *)
        .replace(/`([^`]+)`/g, '$1')     // Inline code
        .replace(/\n{3,}/g, '\n\n')      // Normalize excessive newlines
        .trim();
};

/**
 * Extracts potential email fields from AI text.
 * Improved to handle text that may not have formal 'To:' or 'Subject:' labels.
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

    // If no subject was found, but it looks like a recruiter email, set a default
    if (!subject) {
        if (text.toLowerCase().includes('hi ') || text.toLowerCase().includes('hello ')) {
            subject = "Quick question / Outreach from Aya Healthcare";
        }
    }

    return { to, subject, body: body.trim() };
};

/**
 * Heuristic to detect if a block of text is likely an email draft.
 */
export const isLikelyEmail = (text: string): boolean => {
    const t = text.toLowerCase();
    const markers = [
        'subject:',
        'hi ',
        'hello ',
        'best,',
        'talk soon',
        'sincerely',
        'kofi farkye',
        'fulfillment specialist'
    ];
    return markers.some(m => t.includes(m));
};
