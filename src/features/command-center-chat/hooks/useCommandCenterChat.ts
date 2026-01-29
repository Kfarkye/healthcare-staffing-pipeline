/**
 * Command Center Chat Hook
 * 
 * Elite Production Implementation:
 * - 60fps Render Throttling (prevents UI freeze)
 * - Deep Comparison for Context Stability
 * - Ref-based State Management (prevents stale closures)
 * - Native Text Stream Parsing
 * - Multimodal Vision Support (base64 images)
 * 
 * @version 4.0.0 - Added vision/multimodal support
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * File attachment for multimodal messages (images, PDFs, text files)
 * Gemini 1.5 supports native document understanding
 */
export interface FileAttachment {
    /** Base64 encoded file data (without data: prefix) */
    base64: string;
    /** MIME type (e.g., 'image/png', 'application/pdf', 'text/plain') */
    mimeType: string;
    /** Optional filename for display purposes */
    fileName?: string;
}

/** @deprecated Use FileAttachment instead */
export type ImageAttachment = FileAttachment;

/**
 * Content part for multimodal messages
 */
export type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'file'; mimeType: string; data: string };

export interface CommandCenterMessage {
    id: string;
    role: 'user' | 'assistant';
    /** Text content for display (always string for UI rendering) */
    content: string;
    /** Multimodal parts sent to API (includes images) */
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

export interface UseCommandCenterChatReturn {
    messages: CommandCenterMessage[];
    isLoading: boolean;
    isStreaming: boolean;
    error: string | null;
    /** Send a message with optional image attachments */
    sendMessage: (content: string, attachments?: ImageAttachment[]) => Promise<void>;
    clearChat: () => void;
    stop: () => void;
    reload: () => void;
    status: 'idle' | 'loading' | 'streaming' | 'error';
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
    return typeof crypto !== 'undefined'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);
}

/**
 * Custom hook to memoize context objects using deep equality.
 * Prevents infinite loops when consumers pass inline objects.
 */
function useDeepCompareMemoize(value: any) {
    const ref = useRef<any>(null);
    if (JSON.stringify(value) !== JSON.stringify(ref.current)) {
        ref.current = value;
    }
    return ref.current;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommandCenterChat(
    options: UseCommandCenterChatOptions = {}
): UseCommandCenterChatReturn {
    const { context, onError, onToolCall: _onToolCall } = options;

    // Stabilize context to prevent dependency thrashing
    const stableContext = useDeepCompareMemoize(context);

    const [messages, setMessages] = useState<CommandCenterMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs ensure we always access the latest state inside async closures
    const abortControllerRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<CommandCenterMessage[]>([]);

    // Sync ref with state automatically
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => abortControllerRef.current?.abort();
    }, []);

    // ========================================================================
    // SEND MESSAGE
    // ========================================================================

    const sendMessage = useCallback(async (content: string, attachments?: ImageAttachment[]) => {
        // Allow sending if there's text OR attachments
        if (!content.trim() && (!attachments || attachments.length === 0)) return;

        // 1. Cancel active request
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // 2. Build multimodal parts for API
        const parts: MessagePart[] = [];

        // Add text part if present
        if (content.trim()) {
            parts.push({ type: 'text', text: content });
        }

        // Add file parts (images, PDFs, documents)
        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                parts.push({
                    type: 'file',
                    mimeType: att.mimeType,
                    data: att.base64,
                });
            }
        }

        // 3. Build display content (text + attachment indicators)
        let displayContent = content;
        if (attachments && attachments.length > 0) {
            const attachmentNames = attachments
                .map(a => a.fileName || 'Attachment')
                .join(', ');
            displayContent = content
                ? `${content}\n\n📎 ${attachmentNames}`
                : `📎 ${attachmentNames}`;
        }

        const userMessage: CommandCenterMessage = {
            id: generateId(),
            role: 'user',
            content: displayContent,
            parts, // Include multimodal parts
            createdAt: new Date(),
        };

        const assistantMessage: CommandCenterMessage = {
            id: generateId(),
            role: 'assistant',
            content: '',
            createdAt: new Date(),
        };

        // 4. Optimistic Update
        const newHistory = [...messagesRef.current, userMessage, assistantMessage];
        setMessages(newHistory);

        setIsLoading(true);
        setIsStreaming(false);
        setError(null);

        try {
            // 5. Build API request with multimodal support
            const requestMessages = newHistory.slice(0, -1).map(m => {
                // If message has parts (multimodal), send parts
                if (m.parts && m.parts.length > 0) {
                    return {
                        role: m.role,
                        parts: m.parts,
                    };
                }
                // Otherwise send simple content
                return {
                    role: m.role,
                    content: m.content,
                };
            });

            const response = await fetch('/api/chat/command-center', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
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

            setIsStreaming(true);

            // 3. Dual Protocol Parser — handles both AI SDK formats
            // - Data-Stream Protocol: "0:..." = text, "2:..." = metadata
            // - UI Message Stream: {"type":"text-delta","delta":"..."} JSON objects
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let accumulatedText = '';
            let buffer = ''; // Buffer for incomplete lines
            let lastRenderTime = 0;
            const RENDER_THROTTLE_MS = 16; // Cap at ~60fps

            while (true) {
                const { done, value } = await reader.read();
                if (done || signal.aborted) break;

                // Decode chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete lines (both protocols use newline delimiters)
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Try UI Message Stream protocol first (JSON objects)
                    if (line.startsWith('{')) {
                        try {
                            const event = JSON.parse(line);
                            if (event.type === 'text-delta' && typeof event.delta === 'string') {
                                accumulatedText += event.delta;
                            }
                            // text-start, text-end, data-* events are ignored (metadata)
                            continue;
                        } catch {
                            // Not valid JSON, try data-stream protocol
                        }
                    }

                    // Fallback: Data-Stream Protocol ("CHANNEL:PAYLOAD")
                    const colonIndex = line.indexOf(':');
                    if (colonIndex === -1) continue;

                    const channel = line.slice(0, colonIndex);
                    const payload = line.slice(colonIndex + 1);

                    // Channel 0 = Text content (what we display)
                    if (channel === '0') {
                        try {
                            const text = JSON.parse(payload);
                            if (typeof text === 'string') {
                                accumulatedText += text;
                            }
                        } catch {
                            // If not valid JSON, use raw (fallback for plain text)
                            accumulatedText += payload;
                        }
                    }
                    // Channel 2 = Metadata, Channel 9 = Error — ignore for display
                }

                // Throttle React state updates
                if (Date.now() - lastRenderTime > RENDER_THROTTLE_MS) {
                    setMessages(prev => {
                        const updated = [...prev];
                        const lastIdx = updated.length - 1;
                        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                            updated[lastIdx] = {
                                ...updated[lastIdx],
                                content: accumulatedText,
                            };
                        }
                        return updated;
                    });
                    lastRenderTime = Date.now();
                }
            }

            // Final sync to ensure no dropped content
            if (!signal.aborted) {
                setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                        updated[lastIdx] = {
                            ...updated[lastIdx],
                            content: accumulatedText,
                        };
                    }
                    return updated;
                });
            }

        } catch (err: any) {
            if (err.name === 'AbortError') return;

            console.error('[CommandCenterChat] Error:', err);
            setError(err.message || 'An error occurred');
            onError?.(err);

            // Rollback empty assistant message
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && !last.content) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            if (!signal.aborted) {
                setIsLoading(false);
                setIsStreaming(false);
            }
        }
    }, [stableContext, onError]);

    // ========================================================================
    // ACTIONS
    // ========================================================================

    const clearChat = useCallback(() => {
        abortControllerRef.current?.abort();
        setMessages([]);
        setError(null);
    }, []);

    const stop = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
        setIsStreaming(false);
    }, []);

    const reload = useCallback(() => {
        const history = messagesRef.current;
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            const keepIdx = history.findIndex(m => m.id === lastUserMsg.id);
            if (keepIdx !== -1) {
                setMessages(history.slice(0, keepIdx));
                sendMessage(lastUserMsg.content);
            }
        }
    }, [sendMessage]);

    const status = error ? 'error' : isStreaming ? 'streaming' : isLoading ? 'loading' : 'idle';

    return { messages, isLoading, isStreaming, error, sendMessage, clearChat, stop, reload, status };
}

export default useCommandCenterChat;
