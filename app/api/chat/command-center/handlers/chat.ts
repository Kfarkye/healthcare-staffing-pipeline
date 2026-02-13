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
    MessageTypeValue,
} from '../types/index';
import { Intent, TemplateType, MessageType } from '../types/index';
import { CONFIG, MODEL_CONFIG, buildNovaUrl } from '../lib/config';
import { buildEmail } from '../lib/email-builder';
import {
    logModelResponseError,
    logModelResponseReceived,
    logModelSelected,
} from '../lib/model-logging';
import {
    extractCandidateData,
    extractCandidateDataFromMessages,
    extractCandidateNameFromMessages,
    extractNovaLinkFromMessages
} from '../lib/extractor';

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
const PROSPECT_UPSERT_PREFIX = '[[PROSPECT_UPSERT:';
const PROSPECT_UPSERT_SUFFIX = ']]';

const EDIT_INSTRUCTION_RX = /\b(remove|omit|leave\s+out|shorter|tone|polish|rewrite|revise|edit|fix|tweak|adjust|cut|trim|clean\s*up|change|replace|swap)\b/i;
const CONTEXT_UPDATE_RX = /\b(update|fyi|new\s+info|correction|approved|denied|declined|confirmed|extension|rate|offer|accepted|rejected|start\s+date|end\s+date|shift|facility|location|pay|stipend|weekly|bonus|rto|time[-\s]?off)\b/i;
const ADD_DETAIL_RX = /\b(add|include|mention|note|also|plus|insert)\b/i;
const CONTINUE_DRAFT_RX = /\b(rest\s+of|the\s+rest|finish|complete|full|entire|continue|resume|remaining|keep\s+going|carry\s+on)\b/i;

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

    const draftTagMatch = text.match(/<draft>([\s\S]*?)<\/draft>/i);
    if (draftTagMatch?.[1]) {
        return draftTagMatch[1].trim();
    }

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

function getMessageTypeRules(messageType?: MessageTypeValue): string {
    if (!messageType || messageType === MessageType.AUTO || messageType === MessageType.EMAIL) return '';
    if (messageType === MessageType.SMS) {
        return `
FORMAT: SMS
- No subject line
- No formal greeting or sign-off
- 1–3 short sentences, <= 360 chars`;
    }
    if (messageType === MessageType.SLACK) {
        return `
FORMAT: Slack
- No subject line
- Brief, skimmable, 1–4 short lines
- No formal greeting or sign-off`;
    }
    return `
FORMAT: Plain message (no subject)`;
}

function shouldRegenerateDraft(text: string): boolean {
    if (!text) return false;
    const hasUpdate = CONTEXT_UPDATE_RX.test(text);
    if (!hasUpdate) return false;
    const hasEditOnly = EDIT_INSTRUCTION_RX.test(text) && !ADD_DETAIL_RX.test(text);
    return !hasEditOnly;
}

function isContinuationRequest(text: string): boolean {
    if (!text) return false;
    return CONTINUE_DRAFT_RX.test(text);
}

function buildEditPrompt(
    basePrompt: string,
    draftContext: string,
    options: { mode: 'edit' | 'regenerate' | 'continue'; updateText?: string; messageType?: MessageTypeValue }
): string {
    const formatRules = getMessageTypeRules(options.messageType);
    if (options.mode === 'regenerate') {
        return `${basePrompt}

PREVIOUS DRAFT (reference only):
${draftContext}

NEW FACTS (must be incorporated):
${options.updateText || '[No new facts provided]'}

REWRITE RULES:
- Produce a fresh draft incorporating the new facts.
- Replace outdated details from the prior draft.
- Keep the tone and intent consistent.
${formatRules}`;
    }

    if (options.mode === 'continue') {
        return `${basePrompt}

PREVIOUS DRAFT:
${draftContext}

USER REQUEST:
${options.updateText || '[No request provided]'}

CONTINUATION RULES:
- Return the COMPLETE draft (Subject + full body), not just a partial snippet.
- Keep all existing details, and finish the missing portion.
- Do NOT add new facts unless explicitly asked.
${formatRules}`;
    }

    return `${basePrompt}

PREVIOUS DRAFT (edit this directly, keep the structure):
${draftContext}

EDITING RULES:
- Apply ONLY the user's requested changes.
- Keep subject/body unless the user explicitly asked to change them.
- Do not create a new email or add new details.
${formatRules}`;
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
    const labeledMatch = text.match(/\b(?:candidate|nova)\s*(?:id)?\s*[:#]?\s*(\d{6,8})\b/i);
    if (labeledMatch?.[1]) {
        const id = Number(labeledMatch[1]);
        return Number.isFinite(id) ? id : null;
    }
    const idMatch = text.match(/\b(\d{6,8})\b/);
    if (idMatch?.[1]) {
        const compact = text.replace(/\s+/g, ' ').trim();
        const hasLetters = /[a-z]/i.test(compact);
        if (!hasLetters || compact.length <= 24) {
            const id = Number(idMatch[1]);
            return Number.isFinite(id) ? id : null;
        }
    }
    return null;
}

function extractEmailFromText(text: string): string | null {
    if (!text) return null;
    const match = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match?.[1] || null;
}

function extractNovaUrlFromText(text: string): string | null {
    if (!text) return null;
    const directMatch = text.match(/https?:\/\/(?:www\.)?nova\.ayahealthcare\.com\/#\/[^\s)]+/i);
    if (directMatch?.[0]) return directMatch[0];
    const bareMatch = text.match(/nova\.ayahealthcare\.com\/#\/[^\s)]+/i);
    if (bareMatch?.[0]) return `https://${bareMatch[0].replace(/^\/+/, '')}`;
    const hashMatch = text.match(/#\/recruiting\/candidates?\/\d+\/[^\s)]+/i);
    if (hashMatch?.[0]) return `${CONFIG.nova.baseUrl}${hashMatch[0]}`;
    return null;
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
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const invalid = new Set([
        'her',
        'him',
        'them',
        'this',
        'that',
        'candidate',
        'prospect',
        'system',
        'add',
        'save',
        'enter',
        'register',
        'onboard',
        'the',
        'to',
        'in',
        'unknown',
        'n/a',
    ]);
    const filtered = tokens.filter((token) => {
        const lower = token.toLowerCase();
        if (lower.length < 2) return false;
        if (invalid.has(lower)) return false;
        return true;
    });
    if (filtered.length === 0) return null;
    return toTitleCaseName(filtered.slice(0, 4).join(' '));
}

function isSingleTokenName(name: string | null): boolean {
    if (!name) return false;
    return name.trim().split(/\s+/).filter(Boolean).length < 2;
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

function stripDraftWrapper(text: string): string {
    if (!text) return text;
    let current = text.trim();

    // Prefer the first explicit draft block if present.
    const tagged = current.match(/<draft>\s*([\s\S]*?)\s*<\/draft>/i);
    if (tagged?.[1]) {
        current = tagged[1].trim();
    }

    // Remove any leftover or malformed draft tags.
    current = current.replace(/<\/?draft>/gi, '').trim();

    return current;
}

function shouldUsePreviousDraftContext(input: HandlerInput, lastDraft: string | null): boolean {
    if (!lastDraft) return false;
    if (!input.hasImage) return true;

    const text = (input.inputText || '').toLowerCase();
    if (!text) return false;

    // With screenshots, only reuse previous draft when the user clearly asks to edit prior copy.
    if (CONTINUE_DRAFT_RX.test(text)) return true;
    if (EDIT_INSTRUCTION_RX.test(text)) return true;
    if (/\b(this|above|previous|last)\b/.test(text)) return true;

    return false;
}

function buildProspectUpsertMarker(prospect: any): string {
    if (!prospect || typeof prospect !== 'object') return '';
    const payload = {
        id: prospect.id,
        candidate_id: prospect.candidate_id ?? null,
        name: prospect.name ?? null,
        email: prospect.email ?? null,
        phone: prospect.phone ?? null,
        status: prospect.status ?? null,
        created_at: prospect.created_at ?? null,
        updated_at: prospect.updated_at ?? null,
        nova_url: prospect.nova_url ?? null,
        specialty: prospect.specialty ?? null,
        profession: prospect.profession ?? null,
        recruiter: prospect.recruiter ?? null,
    };
    if (payload.id == null) return '';
    const encoded = encodeURIComponent(JSON.stringify(payload));
    return `${PROSPECT_UPSERT_PREFIX}${encoded}${PROSPECT_UPSERT_SUFFIX}`;
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
            let candidateNovaUrl: string | null = extractNovaUrlFromText(text);
            const extractionLogMeta = {
                logger,
                traceId,
                intent,
                isFallback: false,
                reason: 'primary',
            };

            if (input.hasImage) {
                const extracted = await extractCandidateDataFromMessages(input.messages, google, extractionLogMeta);
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
                const extracted = await extractCandidateData(text, google, extractionLogMeta);
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

            if (input.hasImage && (!candidateName || isSingleTokenName(candidateName))) {
                const nameOnly = await extractCandidateNameFromMessages(input.messages, google, extractionLogMeta);
                if (nameOnly.success && nameOnly.data?.candidateName) {
                    const cleaned = sanitizeCandidateName(nameOnly.data.candidateName);
                    if (cleaned) candidateName = cleaned;
                }
            }

            if (input.hasImage && !candidateId && !candidateNovaUrl) {
                const linkExtracted = await extractNovaLinkFromMessages(input.messages, google, extractionLogMeta);
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

            const novaProfileUrl =
                candidateNovaUrl ||
                (candidateId ? buildNovaUrl(String(candidateId)) : null);
            const upsertMarker = buildProspectUpsertMarker(addResult.prospect);
            const actionWord = addResult.action === 'updated' ? 'updated' : 'added';
            const confirmationLines = [
                `Candidate ${candidateName} ${actionWord} successfully.`,
                novaProfileUrl ? `Nova Profile: ${novaProfileUrl}` : null,
            ]
                .filter(Boolean)
                .join(' ');

            if (!isReassign) {
                return {
                    type: 'chat',
                    content: `${confirmationLines} ${upsertMarker} ${REFRESH_MARKER}`.trim(),
                };
            }

            const novaIdForEmail = candidateId
                ? String(candidateId)
                : candidateNovaUrl
                ? String(extractCandidateIdFromText(candidateNovaUrl) || '')
                : null;
            const email = buildEmail(TemplateType.REASSIGNMENT, {
                candidateName: candidateName,
                candidateEmail: candidateEmail,
                novaId: novaIdForEmail || null,
            });

            const tagged = `[SUBJECT]${email.subject}[/SUBJECT]\\n[BODY]${email.body}[/BODY]\\n\\n${confirmationLines} ${upsertMarker} ${REFRESH_MARKER}`.trim();
            return {
                type: 'chat',
                content: tagged,
            };
        }

        const lastDraft = intent === Intent.EDIT_CONTENT ? getLastAssistantDraft(input.messages) : null;
        const usePreviousDraftContext = intent === Intent.EDIT_CONTENT && shouldUsePreviousDraftContext(input, lastDraft);
        const basePrompt = PROMPTS[intent] || PROMPTS[Intent.GENERAL_CHAT];
        const regenerate = intent === Intent.EDIT_CONTENT && usePreviousDraftContext ? shouldRegenerateDraft(input.inputText || '') : false;
        const continuation = intent === Intent.EDIT_CONTENT && usePreviousDraftContext ? isContinuationRequest(input.inputText || '') : false;
        const editMode = intent === Intent.EDIT_CONTENT
            ? (continuation ? 'continue' : regenerate ? 'regenerate' : usePreviousDraftContext ? 'edit' : 'none')
            : 'none';
        const systemPrompt =
            intent === Intent.EDIT_CONTENT && usePreviousDraftContext && lastDraft
                ? buildEditPrompt(basePrompt, lastDraft, {
                    mode: continuation ? 'continue' : regenerate ? 'regenerate' : 'edit',
                    updateText: input.inputText || '',
                    messageType: input.messageType,
                })
                : basePrompt + getMessageTypeRules(input.messageType);

        logger.info('chat_handler_start', {
            intent,
            hasTools: !!tools,
            hasLastDraft: !!lastDraft,
            usePreviousDraftContext,
            editMode,
            messageType: input.messageType,
        });

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

        const modelName = MODEL_CONFIG.primary;
        const modelSelection = logModelSelected({
            logger,
            model: modelName,
            intent,
            isFallback: false,
            reason: 'primary',
        });

        let result: Awaited<ReturnType<typeof generateText>>;
        try {
            result = await generateText({
                model: google(modelName, {
                    safetySettings: MODEL_CONFIG.safetySettings
                }),
                system: systemPrompt,
                messages: input.messages as any,
                tools,
                toolChoice: tools ? 'auto' : undefined,
                temperature: MODEL_CONFIG.chat.temperature,
                maxRetries: MODEL_CONFIG.chat.maxRetries,
            });
            logModelResponseReceived(modelSelection, result);
        } catch (error) {
            logModelResponseError(modelSelection, error);
            throw error;
        }

        const toolCalls = result.toolCalls?.map(tc => ({
            name: tc.toolName,
            args: 'args' in tc ? tc.args : {},
            result: undefined, // Would be populated if we executed tools
        }));

        let text = result.text || '';
        if (intent === Intent.EDIT_CONTENT) {
            text = stripDraftWrapper(text);
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
    const usePreviousDraftContext = intent === Intent.EDIT_CONTENT && shouldUsePreviousDraftContext(input, lastDraft);
    const basePrompt = PROMPTS[intent] || PROMPTS[Intent.GENERAL_CHAT];
    const regenerate = intent === Intent.EDIT_CONTENT && usePreviousDraftContext ? shouldRegenerateDraft(input.inputText || '') : false;
    const continuation = intent === Intent.EDIT_CONTENT && usePreviousDraftContext ? isContinuationRequest(input.inputText || '') : false;
    const editMode = intent === Intent.EDIT_CONTENT
        ? (continuation ? 'continue' : regenerate ? 'regenerate' : usePreviousDraftContext ? 'edit' : 'none')
        : 'none';
    const systemPrompt =
        intent === Intent.EDIT_CONTENT && usePreviousDraftContext && lastDraft
            ? buildEditPrompt(basePrompt, lastDraft, {
                mode: continuation ? 'continue' : regenerate ? 'regenerate' : 'edit',
                updateText: input.inputText || '',
                messageType: input.messageType,
            })
            : basePrompt + getMessageTypeRules(input.messageType);

    logger.info('chat_stream_start', {
        intent,
        hasTools: !!tools,
        hasLastDraft: !!lastDraft,
        usePreviousDraftContext,
        editMode,
        messageType: input.messageType,
    });

    const modelName = MODEL_CONFIG.primary;
    const modelSelection = logModelSelected({
        logger,
        model: modelName,
        intent,
        isFallback: false,
        reason: 'primary',
    });
    let responseLogged = false;
    const logOnce = (result?: any, extra: Record<string, any> = {}) => {
        if (responseLogged) return;
        responseLogged = true;
        logModelResponseReceived(modelSelection, result, extra);
    };

    return streamText({
        model: google(modelName, {
            safetySettings: MODEL_CONFIG.safetySettings
        }),
        system: systemPrompt,
        messages: input.messages as any,
        tools,
        toolChoice: tools ? 'auto' : undefined,
        temperature: MODEL_CONFIG.chat.temperature,
        maxRetries: MODEL_CONFIG.chat.maxRetries,
        onFinish: (event: any) => {
            const { text, finishReason } = event || {};
            logOnce(event, { finishReason });
            logger.info('chat_stream_complete', {
                intent,
                finishReason,
                responseLength: text?.length || 0
            });
        },
        onError: (event: any) => {
            const err = event?.error ?? event;
            logOnce(undefined, { error: err instanceof Error ? err.message : String(err) });
        },
    });
}

// ════════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════════

export default handleChatIntent;
