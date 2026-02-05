/**
 * Command Center Chat Hook
 *
 * Elite Production Implementation:
 * - 60fps Render Throttling (prevents UI freeze)
 * - Stable Deep Compare for Context (prevents dependency thrash)
 * - Ref-based State Management (prevents stale closures)
 * - Dual Protocol Stream Parsing (AI SDK data-stream + JSON event stream)
 * - Multimodal Support (base64 files: images/PDFs/text)
 *
 * @version 4.0.2 - Fixes:
 * - No more "silent" guard failures (guards surface UI error)
 * - Dedupe lock clears immediately on failed/aborted requests (retry works instantly)
 * - Flushes trailing buffer when stream ends (prevents dropped last line / empty replies)
 * - Better finishReason error surfacing (uses event.error/message when present)
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * File attachment for multimodal messages (images, PDFs, text files)
 * Base64 encoded file data (without data: prefix)
 */
export interface FileAttachment {
    base64: string;
    mimeType: string;
    fileName?: string;
}

/** @deprecated Use FileAttachment instead */
export type ImageAttachment = FileAttachment;

export type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'file'; mimeType: string; data: string; fileName?: string };

export interface CommandCenterMessage {
    id: string;
    role: 'user' | 'assistant';
    /** Text content for display (always string for UI rendering) */
    content: string;
    /** Multimodal parts sent to API (includes files) */
    parts?: MessagePart[];
    createdAt?: Date;
    toolInvocations?: any[];
}

export interface CommandCenterContext {
    [key: string]: any;
}

export interface UseCommandCenterChatOptions {
    context?: CommandCenterContext;
    onError?: (error: Error) => void;
    onToolCall?: (toolName: string, args: any) => void;
}

export interface SendMessageOptions {
    /** Hidden system context (e.g., mode chip) - sent to API but not shown in transcript */
    systemContext?: string;
    /** Router mode (drives deterministic Tier 0 behavior server-side). */
    mode?: 'default' | 'cold_outreach' | 'batch_reassign' | 'reply_mode';
    /** When true, mode is locked and Tier 0 routing overrides. */
    modeLocked?: boolean;
    /** Link-only attachments (e.g., when base64 is skipped for payload safety). */
    attachmentLinks?: Array<{ url: string; mimeType: string; fileName?: string }>;
    /** Called once the request is accepted (after in-flight guard passes). */
    onAccepted?: () => void;
    /**
     * Force bypasses duplicate-payload guard.
     * Used for reload / explicit retries.
     */
    force?: boolean;
}

export interface UseCommandCenterChatReturn {
    messages: CommandCenterMessage[];
    isLoading: boolean;
    isStreaming: boolean;
    error: string | null;
    sendMessage: (content: string, attachments?: ImageAttachment[], options?: SendMessageOptions) => Promise<void>;
    clearChat: () => void;
    stop: () => void;
    reload: () => void;
    status: 'idle' | 'loading' | 'streaming' | 'error';
}

// ============================================================================
// UTILITIES
// ============================================================================

const STORAGE_KEY = 'command_center_messages_v1';
const REFRESH_MARKER = '[[REFRESH_DASHBOARD]]';
const PROSPECT_UPSERT_RX = /\[\[PROSPECT_UPSERT:([^\]]+)\]\]/g;

function generateId(): string {
    return typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
}

/**
 * FNV-1a hash (fast, deterministic) for payload fingerprinting.
 */
function fnv1a32(input: string): string {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return String(h >>> 0);
}

/**
 * Safer stable serialization:
 * - sorts object keys (deterministic)
 * - handles cycles
 * - preserves Dates
 * - marks functions/undefined (so equality matches intent)
 */
function stableSerialize(value: any): string {
    const seen = new WeakSet<object>();

    const walk = (v: any): any => {
        if (v === null) return null;

        const t = typeof v;

        if (t === 'string' || t === 'number' || t === 'boolean') return v;
        if (t === 'bigint') return { $bigint: String(v) };
        if (t === 'undefined') return { $undefined: true };
        if (t === 'function') return { $function: true };
        if (t === 'symbol') return { $symbol: true };

        if (v instanceof Date) return { $date: v.toISOString() };

        if (Array.isArray(v)) return v.map(walk);

        if (t === 'object') {
            if (seen.has(v)) return { $circular: true };
            seen.add(v);

            const keys = Object.keys(v).sort();
            const out: Record<string, any> = {};
            for (const k of keys) out[k] = walk(v[k]);
            return out;
        }

        return v;
    };

    return JSON.stringify(walk(value));
}

/**
 * Deep-compare memoization to stabilize inline objects (context).
 * Uses stable serialization; avoids infinite loops and dependency thrash.
 */
function useDeepCompareMemoize<T>(value: T): T {
    const ref = useRef<{ serialized: string; value: T } | null>(null);
    const serialized = stableSerialize(value);

    if (!ref.current || ref.current.serialized !== serialized) {
        ref.current = { serialized, value };
    }

    return ref.current.value;
}

function normalizeAttachments(input?: ImageAttachment[]): ImageAttachment[] {
    if (!input || input.length === 0) return [];

    const out: ImageAttachment[] = [];
    for (const raw of input) {
        if (!raw) continue;

        const mimeType = String((raw as any).mimeType ?? '').trim();
        const base64 = String((raw as any).base64 ?? '');
        const fileName = (raw as any).fileName ? String((raw as any).fileName) : undefined;

        if (!mimeType || !base64) {
            // Fail fast with a real UI error; do not deadlock inFlightRef.
            throw new Error('Attachment is missing mimeType or base64 data.');
        }

        out.push({ mimeType, base64, fileName });
    }

    return out;
}

/**
 * Stronger payload fingerprint:
 * - includes text
 * - includes attachment metadata + size + short head/tail sample to differentiate same-count files
 */
function fingerprintPayload(content: string, attachments?: ImageAttachment[]): string {
    const text = content.trim();
    const atts = attachments ?? [];
    const attSig = atts
        .map((a) => {
            const head = a.base64.slice(0, 24);
            const tail = a.base64.slice(-24);
            return `${a.mimeType}|${a.fileName ?? ''}|len=${a.base64.length}|h=${head}|t=${tail}`;
        })
        .join('||');

    return fnv1a32(`${text}||count=${atts.length}||${attSig}`);
}

function safeString(x: any): string {
    if (typeof x === 'string') return x;
    try {
        return JSON.stringify(x);
    } catch {
        return String(x);
    }
}

/**
 * Stream line processor shared by loop + final flush.
 */
function applyStreamLine(lineRaw: string, onDelta: (s: string) => void): void {
    const line = lineRaw.trim();
    if (!line) return;

    let payload = line.startsWith('data: ') ? line.slice(6) : line;
    if (!payload || payload === '[DONE]') return;

    // JSON event stream: parse, and only fall through on parse failure.
    if (payload.startsWith('{')) {
        try {
            const event = JSON.parse(payload);

            if (event?.type === 'text-delta' && typeof event.delta === 'string') {
                onDelta(event.delta);
                return;
            }

            if (event?.type === 'finish') {
                // Surface real message if present.
                const finishReason = safeString(event.finishReason ?? '');
                const errMsg = (event.error && safeString(event.error)) || (event.message && safeString(event.message)) || '';

                if (finishReason === 'error') {
                    throw new Error(errMsg || 'Server stream failed with error');
                }

                // ignore normal finishes; caller will finalize
                return;
            }

            // Ignore other JSON events
            return;
        } catch {
            // fall through to data-stream protocol
        }
    }

    // Data-stream protocol: "CHANNEL:PAYLOAD"
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return;

    const channel = payload.slice(0, colonIndex);
    const dataPayload = payload.slice(colonIndex + 1);

    if (channel === '0') {
        // Text payload
        try {
            const text = JSON.parse(dataPayload);
            if (typeof text === 'string') onDelta(text);
        } catch {
            onDelta(dataPayload);
        }
        return;
    }

    if (channel === '9') {
        // Error channel
        try {
            const errMsg = JSON.parse(dataPayload);
            if (typeof errMsg === 'string' && errMsg.trim()) throw new Error(errMsg);
        } catch {
            if (dataPayload.trim()) throw new Error(dataPayload);
        }
    }
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommandCenterChat(options: UseCommandCenterChatOptions = {}): UseCommandCenterChatReturn {
    const { context, onError /* onToolCall reserved */ } = options;

    // Stabilize context to prevent dependency thrashing
    const stableContext = useDeepCompareMemoize(context ?? {});

    const [messages, setMessages] = useState<CommandCenterMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs ensure we always access the latest state inside async closures
    const abortControllerRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<CommandCenterMessage[]>([]);
    const inFlightRef = useRef(false);
    const lastPayloadHashRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && messagesRef.current.length === 0) {
                const restored: CommandCenterMessage[] = parsed.map((m: any) => ({
                    id: String(m.id || generateId()),
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: String(m.content || ''),
                    createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
                }));
                setMessages(restored);
            }
        } catch {
            // ignore restore errors
        }
    }, []);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const trimmed = messages.slice(-50).map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt ? m.createdAt.toISOString() : null,
            }));
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch {
            // ignore persistence errors
        }
    }, [messages]);

    useEffect(() => {
        return () => abortControllerRef.current?.abort();
    }, []);

    // ========================================================================
    // SEND MESSAGE
    // ========================================================================

    const sendMessage = useCallback(
        async (content: string, attachments?: ImageAttachment[], sendOptions?: SendMessageOptions) => {
            const force = Boolean(sendOptions?.force);

            let normalizedAtts: ImageAttachment[] = [];
            let payloadHash: string | null = null;
            let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
            let didDispatchRefresh = false;
            const dispatchedProspects = new Set<string>();

            // Track outcome for dedupe clearing policy
            let didStartStream = false;
            let didFail = false;

            try {
                // Normalize attachments FIRST so we cannot deadlock with inFlightRef set.
                normalizedAtts = normalizeAttachments(attachments);

                const hasText = Boolean(content.trim());
                const hasAtts = normalizedAtts.length > 0;
                if (!hasText && !hasAtts) return;

                // Guard 1: hard in-flight gate
                if (inFlightRef.current) {
                    // No silent fail: surface UI error.
                    setError('Request already in progress. Tap Stop, then retry.');
                    return;
                }

                // Guard 2: duplicate fingerprint (bypassable by force)
                payloadHash = fingerprintPayload(content, normalizedAtts);
                if (!force && lastPayloadHashRef.current === payloadHash) {
                    setError('Duplicate send blocked. Retry after a moment, or use Reload.');
                    return;
                }

                // From here on, guarantee release in finally.
                inFlightRef.current = true;
                lastPayloadHashRef.current = payloadHash;

                abortControllerRef.current = new AbortController();
                const signal = abortControllerRef.current.signal;

                const requestId = generateId();
                console.log(`[CommandCenterChat] Request ${requestId} starting (hash: ${payloadHash})`);

                // Build multimodal parts for API
                const parts: MessagePart[] = [];

                if (hasText) {
                    parts.push({ type: 'text', text: content });
                }

                if (hasAtts) {
                    for (const att of normalizedAtts) {
                        parts.push({
                            type: 'file',
                            mimeType: att.mimeType,
                            data: att.base64,
                            fileName: att.fileName,
                        });
                    }
                }

                // Build display content (keep UI readable; keep parts for true payload)
                let displayContent = content;
                if (hasAtts) {
                    const attachmentNames = normalizedAtts.map((a) => a.fileName || 'Attachment').join(', ');
                    displayContent = hasText ? `${content}\n\n📎 ${attachmentNames}` : `📎 ${attachmentNames}`;
                }

                const userMessage: CommandCenterMessage = {
                    id: generateId(),
                    role: 'user',
                    content: displayContent,
                    parts,
                    createdAt: new Date(),
                };

                const assistantMessage: CommandCenterMessage = {
                    id: generateId(),
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                };

                // Optimistic update
                const newHistory = [...messagesRef.current, userMessage, assistantMessage];
                setMessages(newHistory);

                setIsLoading(true);
                setIsStreaming(true);
                // Intentionally do NOT clear error here; clear only after stream starts successfully.

                // Signal acceptance so the caller can clear input safely.
                try { sendOptions?.onAccepted?.(); } catch { /* no-op */ }

                // TRUNCATE: message-count based (add byte-cap on server for true safety)
                const MAX_HISTORY_MESSAGES = 40;
                const historyForApi = newHistory.slice(0, -1); // exclude placeholder assistant
                const truncatedHistory =
                    historyForApi.length > MAX_HISTORY_MESSAGES ? historyForApi.slice(-MAX_HISTORY_MESSAGES) : historyForApi;

                const attachmentLinks = sendOptions?.attachmentLinks ?? [];

                const requestMessages = truncatedHistory.map((m) => {
                    const msg: any = m.parts && m.parts.length > 0
                        ? { role: m.role, parts: m.parts }
                        : { role: m.role, content: m.content };

                    // Attach link-only files for the current user message (if provided)
                    if (m.id === userMessage.id && attachmentLinks.length > 0) {
                        msg.attachments = attachmentLinks.map((att) => ({
                            contentType: att.mimeType,
                            url: att.url,
                            fileName: att.fileName,
                        }));
                    }

                    return msg;
                });

                // Extract hidden system context (mode chips set this)
                const systemContext = sendOptions?.systemContext?.trim() || '';
                const mode = sendOptions?.mode;
                const modeLocked = sendOptions?.modeLocked;

                const response = await fetch('/api/chat/command-center', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-request-id': requestId,
                    },
                    body: JSON.stringify({
                        systemContext,
                        mode,
                        modeLocked,
                        messages: requestMessages,
                        context: stableContext,
                    }),
                    signal,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Request failed: ${response.status}`);
                }

                if (!response.body) throw new Error('No response body');

                setError(null); // Clear error only once we have a successful stream.

                didStartStream = true;

                reader = response.body.getReader();
                const decoder = new TextDecoder();

                let accumulatedText = '';
                let buffer = '';
                let lastRenderTime = 0;
                const RENDER_THROTTLE_MS = 16;

                const onDelta = (s: string) => {
                    accumulatedText += s;
                };

                const applyClientMarkers = (text: string) => {
                    let output = text;

                    if (output.includes('[[PROSPECT_UPSERT:')) {
                        const matches = Array.from(output.matchAll(PROSPECT_UPSERT_RX));
                        for (const match of matches) {
                            try {
                                const decoded = decodeURIComponent(match[1] || '');
                                const payload = JSON.parse(decoded);
                                const key = payload?.id != null ? String(payload.id) : decoded;
                                if (!dispatchedProspects.has(key) && typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('prospect_upsert', { detail: payload }));
                                    dispatchedProspects.add(key);
                                }
                            } catch {
                                // Ignore malformed markers
                            }
                        }
                        output = output.replace(PROSPECT_UPSERT_RX, '').trim();
                    }

                    if (output.includes(REFRESH_MARKER)) {
                        output = output.replaceAll(REFRESH_MARKER, '').trim();
                        if (!didDispatchRefresh && typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('refresh_dashboard'));
                            didDispatchRefresh = true;
                        }
                    }

                    return output;
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || signal.aborted) break;

                    buffer += decoder.decode(value, { stream: true });

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        // applyStreamLine throws on stream error signals; let it bubble
                        applyStreamLine(line, onDelta);
                    }

                    const now = Date.now();
                    if (now - lastRenderTime > RENDER_THROTTLE_MS) {
                        setMessages((prev) => {
                            const lastIdx = prev.length - 1;
                            if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev;
                            const displayText = applyClientMarkers(accumulatedText);
                            if (prev[lastIdx].content === displayText) return prev;

                            const updated = [...prev];
                            updated[lastIdx] = { ...updated[lastIdx], content: displayText };
                            return updated;
                        });

                        lastRenderTime = now;
                    }
                }

                // Flush trailing buffer (critical if the final frame lacks '\n')
                if (!signal.aborted && buffer.trim()) {
                    applyStreamLine(buffer, onDelta);
                    buffer = '';
                }

                // Final sync (no dropped tail)
                if (!signal.aborted) {
                    if (!accumulatedText.trim()) {
                        throw new Error('No response received. Please try again.');
                    }

                    setMessages((prev) => {
                        const updated = [...prev];
                        const lastIdx = updated.length - 1;
                        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                            const displayText = applyClientMarkers(accumulatedText);
                            updated[lastIdx] = { ...updated[lastIdx], content: displayText };
                        }
                        return updated;
                    });
                }
            } catch (err: any) {
                didFail = true;

                if (err?.name === 'AbortError') return;

                console.error('[CommandCenterChat] Error:', err);
                setError(err?.message || 'An error occurred');
                onError?.(err instanceof Error ? err : new Error(String(err)));

                setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
                    return prev;
                });
            } finally {
                // Release reader resources
                try {
                    await reader?.cancel();
                } catch {
                    // ignore
                }

                abortControllerRef.current = null;
                inFlightRef.current = false;

                // Dedupe clearing policy:
                // - If the request failed or was aborted, clear immediately so retry works instantly.
                // - If it succeeded, keep a short window to prevent accidental double-send.
                if (didFail || !didStartStream) {
                    lastPayloadHashRef.current = null;
                } else {
                    const currentHash = lastPayloadHashRef.current;
                    setTimeout(() => {
                        if (lastPayloadHashRef.current === currentHash) lastPayloadHashRef.current = null;
                    }, 300);
                }

                // Always reset UI flags (stop() already does this, but keep invariant)
                setIsLoading(false);
                setIsStreaming(false);

                console.log('[CommandCenterChat] Request completed');
            }
        },
        [stableContext, onError]
    );

    // ========================================================================
    // ACTIONS
    // ========================================================================

    const clearChat = useCallback(() => {
        abortControllerRef.current?.abort();
        setMessages([]);
        setError(null);
        setIsLoading(false);
        setIsStreaming(false);
        inFlightRef.current = false;
        lastPayloadHashRef.current = null;
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    const stop = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
        setIsStreaming(false);
    }, []);

    const reload = useCallback(() => {
        const history = messagesRef.current;
        const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
        if (!lastUserMsg) return;

        const keepIdx = history.findIndex((m) => m.id === lastUserMsg.id);
        if (keepIdx === -1) return;

        // Reconstruct original input from parts (preserves attachments)
        const textPart = lastUserMsg.parts?.find((p) => p.type === 'text') as { type: 'text'; text: string } | undefined;

        const fileParts =
            lastUserMsg.parts?.filter((p) => p.type === 'file') as
            | Array<{ type: 'file'; mimeType: string; data: string; fileName?: string }>
            | undefined;

        const reconstructedText = textPart?.text ?? '';
        const reconstructedAttachments: ImageAttachment[] | undefined = fileParts?.length
            ? fileParts.map((p) => ({ mimeType: p.mimeType, base64: p.data, fileName: p.fileName }))
            : undefined;

        setMessages(history.slice(0, keepIdx));
        void sendMessage(reconstructedText, reconstructedAttachments, { force: true });
    }, [sendMessage]);

    const status: UseCommandCenterChatReturn['status'] = error
        ? 'error'
        : isStreaming
            ? 'streaming'
            : isLoading
                ? 'loading'
                : 'idle';

    return {
        messages,
        isLoading,
        isStreaming,
        error,
        sendMessage,
        clearChat,
        stop,
        reload,
        status,
    };
}

export default useCommandCenterChat;
