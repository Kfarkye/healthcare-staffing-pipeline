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
} from '../types/index';
import { Intent } from '../types/index';
import { MODEL_CONFIG } from '../lib/config';

// ════════════════════════════════════════════════════════════════════════════════
// System Prompts
// ════════════════════════════════════════════════════════════════════════════════

const RECRUITER_IDENTITY = `You are a strategic partner for a healthcare recruiter. Be direct, actionable, and focused on moving candidates through the pipeline.`;

const PROMPTS: Record<string, string> = {
    [Intent.DATABASE_ACTION]: `${RECRUITER_IDENTITY}

TASK: Help with database lookups and candidate searches.

When providing Nova links, use the full format:
https://nova.ayahealthcare.com/#/recruiting/candidates/{ID}/new-profile/about

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

TASK: Clean up and polish the email draft shown in the image.

Rules:
1. Extract the recipient name from the user's request if mentioned (e.g., "to Precious" means address it to Precious)
2. If recipient name is given but no email, still use "Hi [Name]," as the greeting
3. Preserve the original intent, pay details, and key information from the draft
4. Fix any typos, grammar issues, or awkward phrasing
5. Remove fluff and make it professional yet warm
6. Keep all specific details (facility, dates, pay rates, shifts)
7. Maintain a clean, professional email format

OUTPUT FORMAT:
To: [email if available, otherwise leave blank]
Subject: [role] - [facility] | [pay if available]

[Polished email body]

---
If missing email, end with: "📧 Need recipient email to complete"`,

    [Intent.UNKNOWN]: `${RECRUITER_IDENTITY}

The request is unclear. Ask ONE specific clarifying question to understand what is needed.`,
};

function getPrompt(intent: IntentType): string {
    return PROMPTS[intent] || PROMPTS[Intent.GENERAL_CHAT];
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
        const systemPrompt = getPrompt(intent);

        logger.info('chat_handler_start', { intent, hasTools: !!tools });

        // Guard: Handle empty input gracefully
        if (!input.inputText && !input.hasImage) {
            return {
                type: 'chat',
                content: 'How can I help you today? I can draft emails, search candidates, or answer recruiting questions.',
            };
        }

        const result = await generateText({
            model: google(MODEL_CONFIG.primary, {
                safetySettings: MODEL_CONFIG.safetySettings
            }),
            system: systemPrompt,
            messages: input.messages as any,
            tools,
            temperature: MODEL_CONFIG.chat.temperature,
            maxRetries: MODEL_CONFIG.chat.maxRetries,
        });

        const toolCalls = result.toolCalls?.map(tc => ({
            name: tc.toolName,
            args: 'args' in tc ? tc.args : {},
            result: undefined, // Would be populated if we executed tools
        }));

        logger.info('chat_handler_complete', {
            intent,
            hasToolCalls: (toolCalls?.length || 0) > 0,
            responseLength: result.text?.length || 0
        });

        return {
            type: 'chat',
            content: result.text || 'No response generated.',
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
    const systemPrompt = getPrompt(intent);

    logger.info('chat_stream_start', { intent, hasTools: !!tools });

    return streamText({
        model: google(MODEL_CONFIG.primary, {
            safetySettings: MODEL_CONFIG.safetySettings
        }),
        system: systemPrompt,
        messages: input.messages as any,
        tools,
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
