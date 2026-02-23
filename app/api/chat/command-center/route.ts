/**
 * ════════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER — Main Route Handler
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Clean orchestration layer. No business logic here.
 *
 * Flow:
 * 1. Validate request
 * 2. Classify intent
 * 3. Route to handler
 * 4. Return response
 *
 * @module route
 * @version 3.0.0
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import type {
    APIRequest,
    NormalizedMessage,
    MessageContent,
    HandlerInput,
    HandlerContext,
    Logger,
    ChatModeType,
    MessageTypeValue,
    TemplateTypeValue,
} from './types/index';
import { Intent, ChatMode, MessageType, TemplateType } from './types/index';
import { classify } from './lib/router';
import { getIntentConfig, HTTP_CONFIG } from './lib/config';
import { createCommandCenterTools } from './lib/tools';
import { handleEmailIntent } from './handlers/email';
import { handleChatIntent } from './handlers/chat';
import { getCatalogEntry } from '@/lib/template-catalog';

// ════════════════════════════════════════════════════════════════════════════════
// Runtime Configuration
// ════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ════════════════════════════════════════════════════════════════════════════════
// Validation
// ════════════════════════════════════════════════════════════════════════════════

const EnvSchema = z.object({
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.string(), z.any()).optional(),
    systemContext: z.string().optional(),
    mode: z.enum(['default', 'cold_outreach', 'batch_reassign', 'reply_mode']).optional(),
    modeLocked: z.boolean().optional(),
    messageType: z.enum(['auto', 'email', 'sms', 'slack', 'other']).optional(),
    templateType: z.string().optional(),
});

// ════════════════════════════════════════════════════════════════════════════════
// Logger
// ════════════════════════════════════════════════════════════════════════════════

function createLogger(traceId: string): Logger {
    const startTime = Date.now();

    const log = (level: string, event: string, data?: Record<string, any>, error?: Error | unknown) => {
        const payload: Record<string, any> = {
            ts: new Date().toISOString(),
            lvl: level,
            trace: traceId,
            ms: Date.now() - startTime,
            event,
            ...data,
        };
        if (error) {
            payload.err = {
                msg: error instanceof Error ? error.message : String(error),
                name: error instanceof Error ? error.name : 'Error',
            };
        }
        console.log(JSON.stringify(payload));
    };

    return {
        info: (event, data) => log('INFO', event, data),
        warn: (event, data) => log('WARN', event, data),
        error: (event, error, data) => log('ERROR', event, data, error),
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// Message Normalization
// ════════════════════════════════════════════════════════════════════════════════

function normalizeMessages(messages: any[]): NormalizedMessage[] {
    if (!Array.isArray(messages)) return [];
    const lastIndex = messages.length - 1;

    return messages.map((msg, index) => {
        const parts: MessageContent[] = [];

        // Handle 'parts' array format (from useCommandCenterChat hook)
        if (Array.isArray(msg.parts)) {
            for (const part of msg.parts) {
                if (part.type === 'text' && typeof part.text === 'string') {
                    parts.push({ type: 'text', text: part.text });
                } else if (part.type === 'file' && part.data) {
                    // File parts (images, PDFs, etc.) - only include for last message
                    if (index === lastIndex && part.mimeType?.startsWith('image/')) {
                        const prefix = part.data.startsWith('data:') ? '' : `data:${part.mimeType};base64,`;
                        parts.push({ type: 'image', image: `${prefix}${part.data}` });
                    }
                }
            }
        }
        // Handle 'content' format (string or array)
        else if (typeof msg.content === 'string') {
            parts.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' || typeof part.text === 'string') {
                    parts.push({ type: 'text', text: part.text || '' });
                } else if (part.type === 'image') {
                    if (index === lastIndex) {
                        parts.push({ type: 'image', image: part.image || part.url });
                    }
                }
            }
        }

        // Handle attachments (legacy format)
        const attachments = [...(msg.experimental_attachments || []), ...(msg.attachments || [])];
        for (const att of attachments) {
            if (att.contentType?.startsWith('image/') && index === lastIndex) {
                if (att.url) {
                    parts.push({ type: 'image', image: att.url });
                } else if (att.data) {
                    const mime = att.contentType || 'image/jpeg';
                    const prefix = att.data.startsWith('data:') ? '' : `data:${mime};base64,`;
                    parts.push({ type: 'image', image: `${prefix}${att.data}` });
                }
            }
        }

        return {
            role: msg.role as 'user' | 'assistant' | 'system',
            content: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
        };
    });
}

function hasImage(messages: NormalizedMessage[]): boolean {
    const last = messages[messages.length - 1];
    if (!last) return false;
    return last.content.some(c => c.type === 'image');
}

function sanitizeInputText(text: string): string {
    if (!text) return '';

    return text
        // Strip markdown attachment links occasionally injected by UI copies.
        .replace(/\[📎[^\]]+\]\([^)]+\)/g, '')
        // Strip standalone attachment indicator lines.
        .replace(/^\s*📎\s*[^\n]+$/gim, '')
        // Strip bare filenames commonly appended after image uploads.
        .replace(/^\s*image\.(?:png|jpe?g|gif|webp|heic|pdf)\s*$/gim, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getInputText(messages: NormalizedMessage[]): string {
    const last = messages[messages.length - 1];
    if (!last) return '';
    const mergedText = last.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    return sanitizeInputText(mergedText);
}

function detectMessageType(inputText: string, explicit?: MessageTypeValue): MessageTypeValue {
    if (explicit && explicit !== MessageType.AUTO) return explicit;
    const text = (inputText || '').toLowerCase();
    if (!text) return MessageType.AUTO;

    const hasSlackSignal =
        /\bslack\b/.test(text) ||
        /@here\b/.test(text) ||
        /@channel\b/.test(text) ||
        /<@[\w.-]+>/.test(text);
    if (hasSlackSignal) return MessageType.SLACK;

    const hasSmsSignal = /\b(sms|text|texting)\b/.test(text);
    const hasPhone = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text);
    if (hasSmsSignal || (hasPhone && !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text))) {
        return MessageType.SMS;
    }

    const hasEmailSignal =
        /\bemail\b/.test(text) ||
        /\bsubject\b/.test(text) ||
        /\bto:\b/.test(text) ||
        /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);

    if (hasEmailSignal) return MessageType.EMAIL;

    return MessageType.AUTO;
}

// ════════════════════════════════════════════════════════════════════════════════
// Response Helpers
// ════════════════════════════════════════════════════════════════════════════════

function createTextResponse(text: string, traceId: string) {
    const blockId = `msg-${randomUUID()}`;

    const stream = createUIMessageStream({
        async execute({ writer }) {
            writer.write({ type: 'text-start', id: blockId });
            writer.write({ type: 'text-delta', id: blockId, delta: text });
            writer.write({ type: 'text-end', id: blockId });
        },
    });

    return createUIMessageStreamResponse({
        status: 200,
        headers: { ...HTTP_CONFIG.headers, 'x-trace-id': traceId },
        stream,
    });
}

function createErrorResponse(message: string, traceId: string, status: number = 500) {
    return new Response(
        JSON.stringify({ error: message, traceId }),
        { status, headers: HTTP_CONFIG.headers }
    );
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════════════════════════════════════════

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: HTTP_CONFIG.headers });
}

export async function POST(request: Request) {
    const traceId = request.headers.get('x-trace-id') || randomUUID();
    const logger = createLogger(traceId);

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Validate Environment
    // ══════════════════════════════════════════════════════════════════════════

    // Support multiple env var naming conventions
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    const envResult = EnvSchema.safeParse({
        GOOGLE_GENERATIVE_AI_API_KEY: googleKey,
    });

    if (!envResult.success) {
        logger.error('env_validation_failed', new Error('Missing environment variables'), {
            hasGoogleKey: !!googleKey,
            zodErrors: envResult.error.flatten().fieldErrors,
        });
        return createErrorResponse('Configuration error', traceId);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Parse Request
    // ══════════════════════════════════════════════════════════════════════════

    let body: APIRequest;
    try {
        body = await request.json();
    } catch {
        return createErrorResponse('Invalid JSON', traceId, 400);
    }

    // DEBUG: Log raw request body structure
    const lastRawMsg = body?.messages?.[body?.messages?.length - 1];
    logger.info('raw_request_body', {
        hasMessages: !!body?.messages,
        messageCount: body?.messages?.length ?? 0,
        firstMessageKeys: body?.messages?.[0] ? Object.keys(body.messages[0]) : [],
        lastMessageKeys: lastRawMsg ? Object.keys(lastRawMsg) : [],
        hasParts: !!lastRawMsg?.parts,
        hasContent: !!lastRawMsg?.content,
        partsCount: lastRawMsg?.parts?.length ?? 0,
        partTypes: lastRawMsg?.parts?.map((p: any) => ({ type: p.type, hasMime: !!p.mimeType, hasData: !!p.data, dataLen: p.data?.length ?? 0 })) ?? [],
    });

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
        return createErrorResponse('Invalid request schema', traceId, 400);
    }

    const { messages, context, systemContext, mode, modeLocked, messageType, templateType } = parseResult.data;

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Initialize Clients
    // ══════════════════════════════════════════════════════════════════════════

    const google = createGoogleGenerativeAI({
        apiKey: envResult.data.GOOGLE_GENERATIVE_AI_API_KEY
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Normalize Messages
    // ══════════════════════════════════════════════════════════════════════════

    const normalizedMessages = normalizeMessages(messages);
    const inputText = getInputText(normalizedMessages);
    const imagePresent = hasImage(normalizedMessages);

    // DEBUG: Log normalized message details
    const lastMsg = normalizedMessages[normalizedMessages.length - 1];
    logger.info('normalized_last_message', {
        normalizedCount: normalizedMessages.length,
        lastMsgContentCount: lastMsg?.content?.length ?? 0,
        lastMsgContentTypes: lastMsg?.content?.map(c => c.type) ?? [],
        imagePresent,
        inputTextPreview: inputText.substring(0, 100),
    });

    const resolvedMessageType = detectMessageType(inputText, messageType as MessageTypeValue | undefined);

    logger.info('request_received', {
        inputLength: inputText.length,
        hasImage: imagePresent,
        mode,
        modeLocked,
        messageType: resolvedMessageType,
        messageCount: messages.length,
        lastMessageRole: messages[messages.length - 1]?.role,
        lastMessageContentType: typeof messages[messages.length - 1]?.content,
        lastMessageHasParts: Array.isArray(messages[messages.length - 1]?.parts),
        lastMessagePartsCount: messages[messages.length - 1]?.parts?.length ?? 0,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Classify Intent
    // ══════════════════════════════════════════════════════════════════════════

    let classification = await classify({
        message: inputText || (imagePresent ? 'Process this image' : ''),
        history: normalizedMessages,
        mode: (mode || 'default') as ChatModeType,
        modeLocked: Boolean(modeLocked),
        hasImage: imagePresent,
        modeContext: systemContext || '',
    }, google, logger, traceId);

    const reassignmentSignal =
        /\breassign(?:ment)?\b/i.test(inputText) ||
        /internal\s+reassignment\s+request/i.test(systemContext || '');

    if (reassignmentSignal && classification.intent !== Intent.REASSIGNMENT_REQUEST) {
        logger.warn('intent_override_applied', {
            fromIntent: classification.intent,
            toIntent: Intent.REASSIGNMENT_REQUEST,
            reason: 'Reassignment signal override',
        });
        classification = {
            ...classification,
            intent: Intent.REASSIGNMENT_REQUEST,
            templateType: TemplateType.REASSIGNMENT,
            requiresExtraction: false,
            requiresTools: true,
            confidence: Math.max(classification.confidence, 0.9),
            reason: 'Reassignment signal override',
            fastPath: true,
        };
    }

    // If an explicit templateType was provided (from template picker),
    // resolve the correct intent from the catalog — don't hard-route to DRAFT_EMAIL.
    if (templateType) {
        const catalogEntry = getCatalogEntry(templateType);
        if (catalogEntry) {
            const resolvedIntent = catalogEntry.intent as typeof classification.intent;
            logger.info('template_type_override', {
                explicitTemplate: templateType,
                resolvedIntent,
                originalIntent: classification.intent,
                messageType: catalogEntry.messageType,
                internalOnly: catalogEntry.internalOnly,
            });
            classification = {
                ...classification,
                intent: resolvedIntent,
                templateType: templateType as TemplateTypeValue,
                fastPath: true,
                confidence: 1.0,
                reason: `Explicit template: ${templateType} → ${resolvedIntent}`,
            };
        } else {
            logger.warn('template_type_not_in_catalog', {
                explicitTemplate: templateType,
                fallback: 'classification_unchanged',
            });
        }
    }

    logger.info('intent_classified', {
        intent: classification.intent,
        templateType: classification.templateType,
        fastPath: classification.fastPath,
        confidence: classification.confidence,
        reason: classification.reason,
        debug: classification.debug,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Build Handler Context
    // ══════════════════════════════════════════════════════════════════════════

    const handlerContext: HandlerContext = {
        traceId,
        supabase: null, // No longer used — tools go through /api/data/* endpoints
        google,
        logger,
    };

    const handlerInput: HandlerInput = {
        messages: normalizedMessages,
        inputText,
        hasImage: imagePresent,
        mode: (mode || 'default') as ChatModeType,
        modeContext: systemContext || '',
        userContext: context || {},
        messageType: resolvedMessageType,
        templateType: templateType as TemplateTypeValue | undefined,
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Route to Handler
    // ══════════════════════════════════════════════════════════════════════════

    try {
        const intentConfig = getIntentConfig(classification.intent);
        const origin = new URL(request.url).origin;
        const tools = intentConfig.requiresTools ? createCommandCenterTools({ origin, logger }) : undefined;

        // Email intents → Email Handler
        if (intentConfig.handler === 'email') {
            logger.info('routing_to_email_handler', { intent: classification.intent, explicitTemplate: templateType });

            const result = await handleEmailIntent(
                handlerInput,
                handlerContext,
                (templateType as TemplateTypeValue) || classification.templateType,
                classification.intent
            );

            if (result.type === 'error') {
                return createErrorResponse(result.content, traceId);
            }

            return createTextResponse(result.content, traceId);
        }

        // Tool intents → Chat Handler with tools
        if (intentConfig.handler === 'tools') {
            logger.info('routing_to_tools_handler', { intent: classification.intent });

            const result = await handleChatIntent(
                handlerInput,
                handlerContext,
                classification.intent,
                tools
            );

            if (result.type === 'error') {
                return createErrorResponse(result.content, traceId);
            }

            return createTextResponse(result.content, traceId);
        }

        // Chat intents → Chat Handler
        logger.info('routing_to_chat_handler', { intent: classification.intent });

        const result = await handleChatIntent(
            handlerInput,
            handlerContext,
            classification.intent,
            tools
        );

        if (result.type === 'error') {
            return createErrorResponse(result.content, traceId);
        }

        return createTextResponse(result.content, traceId);

    } catch (error) {
        logger.error('handler_error', error as Error, { intent: classification.intent });
        return createErrorResponse('Processing failed', traceId);
    }
}
