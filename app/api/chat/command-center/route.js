/**
 * ════════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER — Simplified Route Handler (v5.0.0)
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE:
 * 1. LLM extracts structured data (JSON only)
 * 2. email-builder.js assembles final email (code only)
 * 3. No LLM involvement in formatting
 *
 * This eliminates markdown leakage permanently.
 *
 * @version 5.0.0
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

import { createCommandCenterTools } from './tools.js';
import { classify, Intent } from './lib/router.js';
import { getPromptForIntent } from './lib/prompts.js';
import {
    buildEmail,
    detectTemplateType,
    formatEmailResponse,
    formatStructuredResponse
} from './lib/email-builder.js';

// ════════════════════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MODEL = 'gemini-3-flash-preview';
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-trace-id',
    'Cache-Control': 'no-store',
};

// ════════════════════════════════════════════════════════════════════════════════
// Data Extraction Prompt (LLM only extracts, never formats)
// ════════════════════════════════════════════════════════════════════════════════

const EXTRACTION_PROMPT = `You are a data extraction agent. Extract structured data from the image or text.

OUTPUT FORMAT: JSON only. No markdown. No explanation.

SCHEMA:
{
    "candidateName": string | null,
    "candidateEmail": string | null,
    "facility": string | null,
    "location": string | null,
    "specialty": string | null,
    "startDate": string | null,
    "endDate": string | null,
    "shifts": string | null,
    "hoursPerWeek": string | null,
    "hourlyRate": string | null,
    "stipend": string | null,
    "weeklyTotal": string | null
}

RULES:
1. Extract exactly what you see. Do not infer.
2. For money, extract the number only (e.g., "22.50" not "$22.50/hr")
3. For dates, use MM/DD/YYYY format
4. If a field is not visible, set it to null
5. Output ONLY the JSON object, nothing else`;

// ════════════════════════════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════════════════════════════

const EnvSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    const lastIndex = messages.length - 1;

    return messages.map((msg, index) => {
        let parts = [];

        if (typeof msg.content === 'string') {
            parts.push({ type: 'text', text: msg.content });
        } else if (Array.isArray(msg.content)) {
            parts.push(...msg.content);
        }

        // Handle attachments
        const attachments = [...(msg.experimental_attachments || []), ...(msg.attachments || [])];
        for (const att of attachments) {
            const isImage = att.contentType?.startsWith('image/');
            if (isImage) {
                if (index !== lastIndex) {
                    parts.push({ type: 'text', text: '[Image from previous turn]' });
                } else if (att.url) {
                    parts.push({ type: 'image', image: new URL(att.url) });
                } else if (att.data) {
                    const mime = att.contentType || 'image/jpeg';
                    const prefix = att.data.startsWith('data:') ? '' : `data:${mime};base64,`;
                    parts.push({ type: 'image', image: `${prefix}${att.data}` });
                }
            }
        }

        const content = parts.filter(Boolean);
        return { role: msg.role, content: content.length ? content : '' };
    });
}

function hasImage(messages) {
    const last = messages[messages.length - 1];
    if (!last || !Array.isArray(last.content)) return false;
    return last.content.some(p => p.type === 'image');
}

function createResponse(text, traceId) {
    const blockId = `msg-${randomUUID()}`;
    const stream = createUIMessageStream({
        async execute({ writer }) {
            writer.write({ type: 'data', value: { traceId, status: 'ok' } });
            writer.write({ type: 'text-start', id: blockId });
            writer.write({ type: 'text-delta', id: blockId, delta: text });
            writer.write({ type: 'text-end', id: blockId });
        },
    });
    return createUIMessageStreamResponse({ status: 200, headers: { ...HEADERS, 'x-trace-id': traceId }, stream });
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════════════════════════════════════════

export async function OPTIONS() {
    return new Response(null, { status: 204, headers: HEADERS });
}

export async function POST(request) {
    const traceId = request.headers.get('x-trace-id') || randomUUID();

    // 1. Validate environment
    const env = EnvSchema.safeParse({
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
    });

    if (!env.success) {
        return new Response(JSON.stringify({ error: 'Configuration error', traceId }), { status: 500, headers: HEADERS });
    }

    // 2. Parse request
    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON', traceId }), { status: 400, headers: HEADERS });
    }

    const { messages, context, systemContext, mode, modeLocked } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'Messages required', traceId }), { status: 400, headers: HEADERS });
    }

    // 3. Initialize clients
    const supabase = createClient(env.data.SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY);
    const google = createGoogleGenerativeAI({ apiKey: env.data.GOOGLE_GENERATIVE_AI_API_KEY });

    const normalizedMessages = normalizeMessages(messages);
    const lastMsg = normalizedMessages[normalizedMessages.length - 1];
    const inputText = Array.isArray(lastMsg?.content)
        ? lastMsg.content.filter(p => p.type === 'text').map(p => p.text).join('\n')
        : '';
    const imagePresent = hasImage(normalizedMessages);

    console.log(`[${traceId}] Input: "${inputText.slice(0, 50)}..." hasImage=${imagePresent} mode=${mode}`);

    // 4. Classify intent
    const classification = await classify({
        message: inputText || (imagePresent ? 'Process this image' : ''),
        history: normalizedMessages,
        mode: mode || 'default',
        modeLocked: Boolean(modeLocked),
        hasImage: imagePresent,
    });

    console.log(`[${traceId}] Intent: ${classification.intent} fastPath=${classification.fastPath}`);

    // ════════════════════════════════════════════════════════════════════════
    // 5. EMAIL GENERATION PATH (Deterministic)
    // ════════════════════════════════════════════════════════════════════════

    if (classification.intent === Intent.DRAFT_OUTREACH || classification.intent === Intent.DRAFT_EMAIL) {
        try {
            let extractedData = {};

            // 5a. If image present, extract data via LLM
            if (imagePresent) {
                console.log(`[${traceId}] Extracting data from image...`);

                const extraction = await generateText({
                    model: google(MODEL, { safetySettings: SAFETY_SETTINGS }),
                    system: EXTRACTION_PROMPT,
                    messages: normalizedMessages,
                    temperature: 0.1,
                });

                // Parse JSON from response
                const jsonMatch = extraction.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        extractedData = JSON.parse(jsonMatch[0]);
                        console.log(`[${traceId}] Extracted: ${Object.keys(extractedData).filter(k => extractedData[k]).length} fields`);
                    } catch (e) {
                        console.warn(`[${traceId}] JSON parse failed: ${e.message}`);
                    }
                }
            }

            // 5b. Merge with any context provided
            const mergedData = { ...extractedData, ...(context || {}) };

            // 5c. Detect template type from message + mode
            const templateType = detectTemplateType(inputText, systemContext || '');
            console.log(`[${traceId}] Template: ${templateType}`);

            // 5d. Build email using code (NO LLM)
            const email = buildEmail(templateType, mergedData);

            // 5e. Format response
            const responseText = formatEmailResponse(email);

            console.log(`[${traceId}] Email built. Complete=${email.isComplete} Missing=${email.missing.join(',')}`);

            return createResponse(responseText, traceId);

        } catch (error) {
            console.error(`[${traceId}] Email generation failed:`, error.message);
            // Fall through to general chat
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6. GENERAL CHAT PATH (LLM handles content AND formatting)
    // Only used for non-email intents
    // ════════════════════════════════════════════════════════════════════════

    const systemPrompt = getPromptForIntent(classification.intent);
    const tools = classification.requiresTools ? createCommandCenterTools(supabase) : undefined;

    try {
        const result = await generateText({
            model: google(MODEL, { safetySettings: SAFETY_SETTINGS }),
            system: systemPrompt,
            messages: normalizedMessages,
            tools,
            temperature: 0.7,
        });

        return createResponse(result.text || 'No response generated.', traceId);

    } catch (error) {
        console.error(`[${traceId}] Generation failed:`, error.message);
        return new Response(JSON.stringify({ error: 'Processing failed', traceId }), { status: 500, headers: HEADERS });
    }
}
