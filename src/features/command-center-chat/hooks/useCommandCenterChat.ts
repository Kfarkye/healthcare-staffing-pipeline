/**
 * Command Center Chat Hook
 * 
 * Production-grade React hook using native fetch with text streaming.
 * 
 * @version 2.1.0
 */

import { useState, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface CommandCenterMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: Date;
    toolInvocations?: any[];
}

export interface CommandCenterContext {
    activeCandidate?: {
        id: number;
        name: string;
        specialty?: string;
    };
    filters?: {
        status?: string;
        specialty?: string;
    };
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
    sendMessage: (content: string) => Promise<void>;
    clearChat: () => void;
    stop: () => void;
    reload: () => void;
    status: 'idle' | 'loading' | 'streaming' | 'error';
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
    return Math.random().toString(36).substring(2, 15);
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommandCenterChat(
    options: UseCommandCenterChatOptions = {}
): UseCommandCenterChatReturn {
    const { context, onError } = options;

    const [messages, setMessages] = useState<CommandCenterMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    // ========================================================================
    // SEND MESSAGE
    // ========================================================================

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        // Cancel any in-progress request
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const userMessage: CommandCenterMessage = {
            id: generateId(),
            role: 'user',
            content,
            createdAt: new Date(),
        };

        const assistantMessage: CommandCenterMessage = {
            id: generateId(),
            role: 'assistant',
            content: '',
            createdAt: new Date(),
        };

        // Add user message and placeholder for assistant
        setMessages(prev => [...prev, userMessage, assistantMessage]);
        setIsLoading(true);
        setIsStreaming(false);
        setError(null);

        try {
            // Build request body with content format for AI SDK backend
            const requestMessages = [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch('/api/chat/command-center', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: requestMessages,
                    context,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Request failed: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Stream the response
            setIsStreaming(true);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;

                // Update the assistant message with accumulated text
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

            setIsStreaming(false);
            setIsLoading(false);

        } catch (err: any) {
            if (err.name === 'AbortError') {
                // Request was cancelled, don't treat as error
                return;
            }

            console.error('[CommandCenterChat] Error:', err);
            setError(err.message || 'An error occurred');
            onError?.(err);

            // Remove the empty assistant message on error
            setMessages(prev => prev.filter(m => m.content !== '' || m.role !== 'assistant'));
            setIsLoading(false);
            setIsStreaming(false);
        }
    }, [messages, context, onError]);

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
        // Find last user message and resend
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            // Remove last assistant message and resend
            setMessages(prev => prev.slice(0, -1));
            sendMessage(lastUserMsg.content);
        }
    }, [messages, sendMessage]);

    // ========================================================================
    // DERIVED STATE
    // ========================================================================

    const status = error ? 'error' : isStreaming ? 'streaming' : isLoading ? 'loading' : 'idle';

    // ========================================================================
    // RETURN
    // ========================================================================

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

// ============================================================================
// EXPORTS
// ============================================================================

export default useCommandCenterChat;
