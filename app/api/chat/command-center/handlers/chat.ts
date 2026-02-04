/**
 * ════════════════════════════════════════════════════════════════════════════════
 * CHAT HANDLER — General Conversation & Tools
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Handles all non-email intents:
 * - General chat
 * - Database actions (with tools)
 * - Campaign workflows
 * - Search queries
 *
 * @module handlers/chat
 * @version 1.0.0
 */

import { generateText, streamText } from 'ai';
import type {
    HandlerInput,
    HandlerOutput,
    HandlerContext,
    IntentType,
    NormalizedMessage,
} from '../types/index';
import { Intent, TemplateType } from '../types/index';
import { CONFIG, MODEL_CONFIG } from '../lib/config';
import { buildEmail } from '../lib/email-builder';
import { extractCandidateData, extractCandidateDataFromMessages, extractNovaLinkFromMessages } from '../lib/extractor';

// ════════════════════════════════════════════════════════════════════════════════
// System Prompts
// ════════════════════════════════════════════════════════════════════════════════

const RECRUITER_IDENTITY = `You are a strategic partner for a healthcare recruiter. Be direct, actionable, and focused on moving candidates through the pipeline.`;

const PROMPTS: Record<string, string> = {
    [Intent.DATABASE_ACTION]: `${RECRUITER_IDENTITY}

TASK: Help with database lookups and candidate searches.

When providing Nova links, use get_nova_link. It supports both:
- Candidate links (candidate_id or nova_url + optional section)
- Global Nova pages (page or custom_path)

TOOLS:
- lookup_candidate: Find candidates by ID, email, or name.
- add_candidate: Add a new candidate/prospect to the system.
- update_candidate: Update an existing candidate/prospect.
- add_candidate_note: Leave a note on a candidate/prospect.
- get_candidate_notes: Fetch recent candidate notes.
- get_nova_link: Build Nova links (candidate or global pages).
- get_state_board_link: Return state board verification links.
- upsert_state_board_link: Save or update a state board link.

RULES:
1. If the user asks to add a candidate, use add_candidate.
2. If the user asks to update a candidate, use update_candidate.
3. If the user asks to leave/add/log a note, use add_candidate_note.
4. If the user asks for note history, use get_candidate_notes.
5. If the user asks for Nova links or Nova pages, use get_nova_link.
6. If the user asks for state board verification links, use get_state_board_link.
7. If the user asks to add a candidate AND draft a reassignment email, do both in one response:
   - Call add_candidate first.
   - Then draft the reassignment email using this format:
     To: ${CONFIG.teamEmails.reassignments}
     Subject: Please Reassign - {Candidate Name}
     Body:
     Hi Team,

     Can we please reassign {Candidate Name}?

     Nova link: {Nova Link}
     Email: {Candidate Email if available}

     Thank you!
   - If add_candidate fails due to missing candidate_id/nova_url, ask for it but still draft the email with "Nova link: [Nova link needed]".
8. Do NOT claim the candidate was added unless add_candidate returns ok=true.
9. If add_candidate fails, clearly say it was not added and ask for candidate_id or Nova URL.
10. If required fields are missing, ask ONE concise follow-up question.

Be concise. Lead with the answer.`,

    [Intent.CAMPAIGN_WORKFLOW]: `${RECRUITER_IDENTITY}

TASK: Help design outreach campaigns and workflows.

Provide numbered steps. Include timing and safeguards. Be specific about targeting criteria.`,

    [Intent.SEARCH_QUERY]: `${RECRUITER_IDENTITY}

TASK: Answer questions about recruiting, healthcare staffing, or market conditions.

Lead with the direct answer. Be concise.`,

    [Intent.GENERAL_CHAT]: `${RECRUITER_IDENTITY}

TASK: Provide recruiting strategy advice.

Be direct and actionable. Focus on what moves the needle.`,

    [Intent.EDIT_CONTENT]: `${RECRUITER_IDENTITY}

TASK: Based on the user's request and image, either:
- Polish/edit an existing email draft
- Draft a reply to a received message
- Clean up or reformat content

Guidelines:
1. Read the image carefully to understand the context
2. Follow the user's specific instructions (e.g., "replying a day late", "sent over to piedmont")
3. Extract the recipient name and email if visible in the image
4. Keep the tone professional but warm
5. Preserve any specific details mentioned by the user
6. If drafting a reply, make it concise and actionable
7. Do NOT include any signature or contact block (the email client already adds it)
8. If a previous draft is provided, edit that draft directly and keep its structure.
9. Do NOT invent new details or a brand-new email when the user asked for a small edit.

OUTPUT FORMAT (use when producing an email):
To: [email if visible]
Subject: [appropriate subject based on context]

[Email body]
`,

    [Intent.UNKNOWN]: `${RECRUITER_IDENTITY}

The request is unclear. Ask ONE specific clarifying question to understand what is needed.`,
};

const REFRESH_MARKER = '[[REFRESH_DASHBOARD]]';

function getMessageText(message: NormalizedMessage): string {
    if (!message?.content?.length) return '';
    return message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
        .trim();
}

function extractDraftFromText(text: string): string | null {
    if (!text) return null;

    const jsonMatch = text.match(/\[EMAIL_DRAFT_JSON\]\s*([\s\S]*?)\s*\[\/EMAIL_DRAFT_JSON\]/i);
    if (jsonMatch?.[1]) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            const email = parsed?.email;
            if (email?.subject && email?.body) {
                return `Subject: ${email.subject}\n\n${email.body}`.trim();
            }
        } catch {
            // fall through to other formats
        }
    }

    const subjectMatch = text.match(/\[SUBJECT\]([\s\S]*?)\[\/SUBJECT\]/i);
    const bodyMatch = text.match(/\[BODY\]([\s\S]*?)\[\/BODY\]/i);
    if (subjectMatch?.[1] && bodyMatch?.[1]) {
        return `Subject: ${subjectMatch[1].trim()}\n\n${bodyMatch[1].trim()}`.trim();
    }

    if (/(^|\n)\s*Subject\s*:/i.test(text) || /(^|\n)\s*To\s*:/i.test(text)) {
        return text.trim();
    }

    return null;
}

function getLastAssistantDraft(messages: NormalizedMessage[]): string | null {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (msg?.role !== 'assistant') continue;
        const text = getMessageText(msg);
        const draft = extractDraftFromText(text);
        if (draft) return draft;
    }
    return null;
}

function getPrompt(intent: IntentType, draftContext?: string): string {
    const base = PROMPTS[intent] || PROMPTS[Intent.GENERAL_CHAT];
    if (intent !== Intent.EDIT_CONTENT || !draftContext) return base;
    return `${base}

PREVIOUS DRAFT (edit this directly, keep the structure):
${draftContext}

EDITING RULES:
- Apply ONLY the user's requested changes.
- Keep subject/body unless the user explicitly asked to change them.
- Do not create a new email or add new details.`;
}

function hasAddCandidateIntent(text: string): boolean {
    const t = text.toLowerCase();
    return /\b(?:add|save|enter|register|onboard)\s+(?:candidate|prospect)\b|\b(?:add|save|enter|register|onboard)\s+(?:him|her|them|this)\s*(?:to|in)\s+(?:the\s+)?system\b|\b(?:add|save|enter|register|onboard)\s+(?!note\b)(?:[a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+){0,3})\s+(?:to|in)\s+(?:the\s+)?system\b/i.test(t);
}

function hasReassignIntent(text: string, modeContext?: string): boolean {
    return /\breassign/i.test(text) || /\breassign/i.test(modeContext || '');
}

function extractCandidateIdFromText(text: string): number | null {
    if (!text) return null;
    const urlMatch = text.match(/\/candidates?\/(\d+)/i);
    if (urlMatch?.[1]) {
        const id = Number(urlMatch[1]);
        return Number.isFinite(id) ? id : null;
    }
    const idMatch = text.match(/\b(\d{6,8})\b/);
    if (idMatch?.[1]) {
        const id = Number(idMatch[1]);
        return Number.isFinite(id) ? id : null;
    }
    return null;
}

function extractEmailFromText(text: string): string | null {
    if (!text) return null;
    const match = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match?.[1] || null;
}

function extractNameFromAddRequest(text: string): string | null {
    const match = text.match(/\b(?:add|save|enter|register|onboard)\s+([a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+){0,3})\s+(?:to|in)\s+(?:the\s+)?system\b/i);
    return match?.[1] || null;
}

function toTitleCaseName(name: string): string {
    return name
        .split(/\s+/)
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join(' ')
        .trim();
}

function sanitizeCandidateName(raw: string | null): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/[^a-zA-Z.'-\\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    const lower = cleaned.toLowerCase();
    const invalid = new Set(['her', 'him', 'them', 'this', 'that', 'candidate', 'prospect', 'unknown', 'n/a']);
    if (invalid.has(lower)) return null;
    if (lower.length < 2) return null;
    return toTitleCaseName(cleaned);
}

function stripSignatureBlock(text: string): string {
    if (!text) return text;
    const markers = [
        CONFIG.signature?.name,
        CONFIG.signature?.title,
        CONFIG.signature?.phone,
        CONFIG.signature?.assistant?.name,
        CONFIG.signature?.assistant?.email,
    ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());

    if (markers.length === 0) return text;

    const lines = text.split('\n');
    const lowerLines = lines.map((l) => l.trim().toLowerCase());
    let sigStart = -1;

    for (let i = lowerLines.length - 1; i >= 0; i--) {
        const line = lowerLines[i];
        if (!line) continue;
        if (markers.some((m) => line.includes(m))) {
            sigStart = i;
            break;
        }
    }

    if (sigStart === -1) return text;

    const signoffs = ['best', 'best,', 'regards', 'regards,', 'sincerely', 'sincerely,', 'thanks', 'thanks,', 'thank you', 'thank you,'];
    for (let i = sigStart; i >= 0; i--) {
        const line = lowerLines[i];
        if (signoffs.some((s) => line.startsWith(s))) {
            sigStart = i;
            break;
        }
    }

    return lines.slice(0, sigStart).join('\n').trimEnd();
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════════════════════════════════════════

export async function handleChatIntent(
    input: HandlerInput,
    context: HandlerContext,
    intent: IntentType,
    tools?: Record<string, any>
): Promise<HandlerOutput> {
    const { google, logger, traceId } = context;

    try {
        const isAddCandidate = intent === Intent.DATABASE_ACTION && hasAddCandidateIntent(input.inputText || '');
        const isReassign = hasReassignIntent(input.inputText || '', input.modeContext);

        if (isAddCandidate && tools?.add_candidate?.execute) {
            const text = input.inputText || '';
            let candidateName: string | null = extractNameFromAddRequest(text);
            let candidateEmail: string | null = extractEmailFromText(text);
            let candidateId: number | null = extractCandidateIdFromText(text);
            let candidateNovaUrl: string | null = null;

            if (input.hasImage) {
                const extracted = await extractCandidateDataFromMessages(input.messages, google);
                if (extracted.success) {
                    const data = extracted.data;
                    candidateName = candidateName || data.candidateName || null;
                    candidateEmail = candidateEmail || data.candidateEmail || null;
                    candidateNovaUrl = candidateNovaUrl || data.novaUrl || null;
                    if (!candidateId) {
                        if (data.novaId) {
                            const idNum = Number(String(data.novaId).replace(/\\D/g, ''));
                            if (Number.isFinite(idNum) && idNum > 0) candidateId = idNum;
                        } else if (data.novaUrl) {
                            candidateId = extractCandidateIdFromText(String(data.novaUrl));
                        }
                    }
                }
            } else if (text) {
                const extracted = await extractCandidateData(text, google);
                if (extracted.success) {
                    const data = extracted.data;
                    candidateName = candidateName || data.candidateName || null;
                    candidateEmail = candidateEmail || data.candidateEmail || null;
                    candidateNovaUrl = candidateNovaUrl || data.novaUrl || null;
                    if (!candidateId) {
                        if (data.novaId) {
                            const idNum = Number(String(data.novaId).replace(/\\D/g, ''));
                            if (Number.isFinite(idNum) && idNum > 0) candidateId = idNum;
                        } else if (data.novaUrl) {
                            candidateId = extractCandidateIdFromText(String(data.novaUrl));
                        }
                    }
                }
            }

            candidateName = sanitizeCandidateName(candidateName);

            if (input.hasImage && !candidateId && !candidateNovaUrl) {
                const linkExtracted = await extractNovaLinkFromMessages(input.messages, google);
                if (linkExtracted.success) {
                    const data = linkExtracted.data;
                    candidateNovaUrl = candidateNovaUrl || data.novaUrl || null;
                    if (!candidateId && data.novaId) {
                        const idNum = Number(String(data.novaId).replace(/\\D/g, ''));
                        if (Number.isFinite(idNum) && idNum > 0) candidateId = idNum;
                    } else if (!candidateId && data.novaUrl) {
                        candidateId = extractCandidateIdFromText(String(data.novaUrl));
                    }
                }
            }

            if (!candidateId && candidateNovaUrl) {
                candidateId = extractCandidateIdFromText(candidateNovaUrl);
            }

            if (!candidateName && candidateEmail) {
                const nameFromEmail = candidateEmail
                    .split('@')[0]
                    .replace(/[._-]+/g, ' ')
                    .replace(/\d+/g, '')
                    .trim();
                candidateName = sanitizeCandidateName(nameFromEmail);
            }

            if (!candidateId && !candidateNovaUrl) {
                return {
                    type: 'chat',
                    content: 'I need the Nova candidate ID or full Nova URL to add her. Please paste it.',
                };
            }

            if (!candidateName) {
                return {
                    type: 'chat',
                    content: 'I need the candidate name to add them. Please provide the name.',
                };
            }

            const addResult = await tools.add_candidate.execute({
                candidate_id: candidateId ?? undefined,
                nova_url: candidateNovaUrl ?? undefined,
                name: candidateName,
                email: candidateEmail || undefined,
                update_if_exists: true,
            });

            if (!addResult?.ok) {
                return {
                    type: 'chat',
                    content: `Unable to add candidate: ${addResult?.error || 'Unknown error'}`,
                };
            }

            if (!isReassign) {
                return {
                    type: 'chat',
                    content: `Candidate ${candidateName || 'added'} ${addResult.action === 'updated' ? 'updated' : 'added'} successfully. ${REFRESH_MARKER}`,
                };
            }

            const email = buildEmail(TemplateType.REASSIGNMENT, {
                candidateName: candidateName,
                candidateEmail: candidateEmail,
                novaId: candidateId ? String(candidateId) : null,
            });

            const tagged = `[SUBJECT]${email.subject}[/SUBJECT]\\n[BODY]${email.body}[/BODY]\\n\\nCandidate ${addResult.action === 'updated' ? 'updated' : 'added'} in system. ${REFRESH_MARKER}`;
            return {
                type: 'chat',
                content: tagged,
            };
        }

        const lastDraft = intent === Intent.EDIT_CONTENT ? getLastAssistantDraft(input.messages) : null;
        const systemPrompt = getPrompt(intent, lastDraft || undefined);

        logger.info('chat_handler_start', { intent, hasTools: !!tools });

        // Guard: Handle empty input gracefully
        if (!input.inputText && !input.hasImage) {
            return {
                type: 'chat',
                content: 'How can I help you today? I can draft emails, search candidates, or answer recruiting questions.',
            };
        }

        if (intent === Intent.EDIT_CONTENT && !input.hasImage && !lastDraft) {
            return {
                type: 'chat',
                content: 'Please paste the email you want me to edit, and tell me the exact changes you want.',
            };
        }

        const result = await generateText({
            model: google(MODEL_CONFIG.primary, {
                safetySettings: MODEL_CONFIG.safetySettings
            }),
            system: systemPrompt,
            messages: input.messages as any,
            tools,
            toolChoice: tools ? 'auto' : undefined,
            temperature: MODEL_CONFIG.chat.temperature,
            maxRetries: MODEL_CONFIG.chat.maxRetries,
        });

        const toolCalls = result.toolCalls?.map(tc => ({
            name: tc.toolName,
            args: 'args' in tc ? tc.args : {},
            result: undefined, // Would be populated if we executed tools
        }));

        let text = result.text || '';
        if (intent === Intent.EDIT_CONTENT) {
            text = stripSignatureBlock(text);
        }
        if (!text.trim()) {
            const toolResults = (result as any).toolResults as any[] | undefined;
            if (toolResults?.length) {
                const first = toolResults[0];
                const res = first?.result || {};
                if (res?.ok && res?.action === 'created') {
                    text = 'Candidate added successfully.';
                } else if (res?.ok && res?.action === 'updated') {
                    text = 'Candidate updated successfully.';
                } else if (res?.ok && res?.note) {
                    text = 'Note saved successfully.';
                } else if (res?.ok && res?.notes) {
                    text = `Found ${res.notes.length} note(s).`;
                } else if (res?.ok && res?.link) {
                    text = `Here’s the link: ${res.link}`;
                } else if (res?.ok) {
                    text = 'Done.';
                } else if (res?.error) {
                    text = `Unable to complete that: ${res.error}`;
                } else {
                    text = 'Done.';
                }
            }
        }

        logger.info('chat_handler_complete', {
            intent,
            hasToolCalls: (toolCalls?.length || 0) > 0,
            responseLength: text.length || 0
        });

        return {
            type: 'chat',
            content: text || 'No response generated.',
            toolCalls,
        };

    } catch (error) {
        logger.error('chat_handler_error', error as Error, { traceId, intent });

        return {
            type: 'error',
            content: 'Failed to process request. Please try again.',
        };
    }
}

// ════════════════════════════════════════════════════════════════════════════════
// Streaming Handler (for long responses)
// ════════════════════════════════════════════════════════════════════════════════

export function handleChatIntentStreaming(
    input: HandlerInput,
    context: HandlerContext,
    intent: IntentType,
    tools?: Record<string, any>
) {
    const { google, logger } = context;
    const lastDraft = intent === Intent.EDIT_CONTENT ? getLastAssistantDraft(input.messages) : null;
    const systemPrompt = getPrompt(intent, lastDraft || undefined);

    logger.info('chat_stream_start', { intent, hasTools: !!tools });

    return streamText({
        model: google(MODEL_CONFIG.primary, {
            safetySettings: MODEL_CONFIG.safetySettings
        }),
        system: systemPrompt,
        messages: input.messages as any,
        tools,
        toolChoice: tools ? 'auto' : undefined,
        temperature: MODEL_CONFIG.chat.temperature,
        maxRetries: MODEL_CONFIG.chat.maxRetries,
        onFinish: ({ text, finishReason }) => {
            logger.info('chat_stream_complete', {
                intent,
                finishReason,
                responseLength: text?.length || 0
            });
        },
    });
}

// ════════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════════

export default handleChatIntent;
