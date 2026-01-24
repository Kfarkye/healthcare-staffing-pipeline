import { supabase } from '../lib/supabase';

export interface TailoredReplyResponse {
    reply: string;
    analysis: string;
    suggested_action: string;
}

export interface ChatMessage {
    role: 'user' | 'model' | 'function';
    parts: {
        text?: string;
        thought?: boolean;
        functionCall?: { name: string; args: any };
        functionResponse?: { name: string; response: any };
    }[];
    metadata?: any;
}

export interface CommandResponse {
    role: 'model';
    parts: { text: string }[];
}

class AIServiceClass {
    async generateTailoredReply(incomingText: string, context: any = {}): Promise<TailoredReplyResponse> {
        const { data: sessionRes } = await supabase.auth.getSession();
        const accessToken = sessionRes?.session?.access_token ?? '';

        const { data, error } = await supabase.functions.invoke('generate-tailored-reply', {
            headers: {
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
                incomingText,
                context
            },
        });

        if (error) {
            console.error('[AIService] Error calling generate-tailored-reply:', error);
            throw new Error(error.message || 'Failed to generate tailored reply');
        }

        return data as TailoredReplyResponse;
    }

    async sendCommand(message: string, history: ChatMessage[] = [], attachment?: { base64: string; mimeType: string }, context?: any, metadata?: any): Promise<{ text: string, history: ChatMessage[] }> {
        const { data: sessionRes } = await supabase.auth.getSession();
        const accessToken = sessionRes?.session?.access_token ?? '';

        // Ensure history is an array
        const safeHistory = Array.isArray(history) ? history : [];

        // Convert history to AI SDK message format
        const messages = [
            ...safeHistory.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts?.[0]?.text || '',
            })),
            { role: 'user', content: message }
        ];

        const response = await fetch('/api/chat/command-center', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
                messages,
                context,
                metadata,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[AIService] Error calling command-center:', errorData);
            throw new Error(errorData.error || 'Failed to send command');
        }

        // Read the streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                fullText += decoder.decode(value, { stream: true });
            }
        }

        // Parse the streamed response - AI SDK streams data prefixed with "0:", "2:", etc.
        const textContent = fullText
            .split('\n')
            .filter(line => line.startsWith('0:'))
            .map(line => {
                try {
                    return JSON.parse(line.slice(2));
                } catch {
                    return '';
                }
            })
            .join('');

        // Build updated history
        const newHistory: ChatMessage[] = [
            ...safeHistory,
            { role: 'user', parts: [{ text: message }], metadata },
            { role: 'model', parts: [{ text: textContent }] }
        ];

        return { text: textContent, history: newHistory };
    }


    async sendResearchQuery(message: string, history: ChatMessage[] = []): Promise<any> {
        const { data, error } = await supabase.functions.invoke('research-chat', {
            body: {
                message,
                history
            },
        });

        if (error) {
            console.error('[AIService] Error calling research-chat:', error);
            throw new Error(error.message || 'Failed to perform research');
        }

        return data;
    }

    async extractPayPackageFromImage(imageBase64: string, mimeType: string = 'image/png'): Promise<any> {
        const { data, error } = await supabase.functions.invoke('extract-pay-package', {
            body: {
                imageBase64,
                mimeType
            },
        });

        if (error) {
            console.error('[AIService] Error calling extract-pay-package:', error);
            throw new Error(error.message || 'Failed to extract data from image');
        }

        return data;
    }
}

export const AIService = new AIServiceClass();
