import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { ChatMessage, ChatRequest, ChatResponse } from '../types';

export function useCommandCenterChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setIsLoading(true);
        setError(null);

        try {
            const { data: sessionRes } = await supabase.auth.getSession();
            const accessToken = sessionRes?.session?.access_token;

            const { data, error: invokeError } = await supabase.functions.invoke('ai-chat', {
                headers: {
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: {
                    messages: newMessages,
                    primary_provider: 'gemini',
                    secondary_provider: 'openai',
                    temperature: 0.7,
                    max_tokens: 1024
                } as ChatRequest,
            });

            if (invokeError) throw invokeError;

            const chatResponse = data as ChatResponse;
            if (chatResponse.error) {
                throw new Error(chatResponse.text || chatResponse.error.message);
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: chatResponse.text,
                provider: chatResponse.provider,
                model: chatResponse.model
            } as any]);
        } catch (err: any) {
            console.error('[CommandCenterChat] Error:', err);
            setError(err.message || "Failed to send message");
        } finally {
            setIsLoading(false);
        }
    }, [messages]);

    const clearChat = () => setMessages([]);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearChat
    };
}
