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
import { createClient } from '@supabase/supabase-js';
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
} from './types/index';
import { Intent, ChatMode } from './types/index';
import { classify } from './lib/router';
import { getIntentConfig, HTTP_CONFIG } from './lib/config';
import { handleEmailIntent } from './handlers/email';
import { handleChatIntent } from './handlers/chat';

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
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

const RequestSchema = z.object({
    messages: z.array(z.any()).min(1),
    context: z.record(z.string(), z.any()).optional(),
    systemContext: z.string().optional(),
    mode: z.enum(['default', 'cold_outreach', 'batch_reassign', 'reply_mode']).optional(),
    modeLocked: z.boolean().optional(),
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

        // Handle content
        if (typeof msg.content === 'string') {
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

        // Handle attachments
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

function getInputText(messages: NormalizedMessage[]): string {
    const last = messages[messages.length - 1];
    if (!last) return '';
    return last.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('\n');
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

    const envResult = EnvSchema.safeParse({
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
    });

    if (!envResult.success) {
        logger.error('env_validation_failed', new Error('Missing environment variables'));
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

    const parseResult = RequestSchema.safeParse(body);
    if (!parseResult.success) {
        return createErrorResponse('Invalid request schema', traceId, 400);
    }

    const { messages, context, systemContext, mode, modeLocked } = parseResult.data;

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Initialize Clients
    // ══════════════════════════════════════════════════════════════════════════

    const supabase = createClient(
        envResult.data.SUPABASE_URL,
        envResult.data.SUPABASE_SERVICE_ROLE_KEY
    );

    const google = createGoogleGenerativeAI({
        apiKey: envResult.data.GOOGLE_GENERATIVE_AI_API_KEY
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 4. Normalize Messages
    // ══════════════════════════════════════════════════════════════════════════

    const normalizedMessages = normalizeMessages(messages);
    const inputText = getInputText(normalizedMessages);
    const imagePresent = hasImage(normalizedMessages);

    logger.info('request_received', {
        inputLength: inputText.length,
        hasImage: imagePresent,
        mode,
        modeLocked,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 5. Classify Intent
    // ══════════════════════════════════════════════════════════════════════════

    const classification = await classify({
        message: inputText || (imagePresent ? 'Process this image' : ''),
        history: normalizedMessages,
        mode: (mode || 'default') as ChatModeType,
        modeLocked: Boolean(modeLocked),
        hasImage: imagePresent,
    }, google);

    logger.info('intent_classified', {
        intent: classification.intent,
        templateType: classification.templateType,
        fastPath: classification.fastPath,
        confidence: classification.confidence,
        reason: classification.reason,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Build Handler Context
    // ══════════════════════════════════════════════════════════════════════════

    const handlerContext: HandlerContext = {
        traceId,
        supabase,
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
    };

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Route to Handler
    // ══════════════════════════════════════════════════════════════════════════

    try {
        const intentConfig = getIntentConfig(classification.intent);

        // Email intents → Email Handler
        if (intentConfig.handler === 'email') {
            logger.info('routing_to_email_handler', { intent: classification.intent });

            const result = await handleEmailIntent(
                handlerInput,
                handlerContext,
                classification.templateType
            );

            if (result.type === 'error') {
                return createErrorResponse(result.content, traceId);
            }

            return createTextResponse(result.content, traceId);
        }

        // Tool intents → Chat Handler with tools
        if (intentConfig.handler === 'tools') {
            logger.info('routing_to_tools_handler', { intent: classification.intent });

            // TODO: Import and pass tools from tools.js
            const tools = undefined; // createCommandCenterTools(supabase);

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
            classification.intent
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
