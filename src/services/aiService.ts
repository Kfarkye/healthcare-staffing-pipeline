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

    async sendCommand(message: string, history: ChatMessage[] = [], _attachment?: { base64: string; mimeType: string }, context?: any, metadata?: any): Promise<{ text: string, history: ChatMessage[] }> {
        const { data: sessionRes } = await supabase.auth.getSession();
        const accessToken = sessionRes?.session?.access_token ?? '';

        // Ensure history is an array
        const safeHistory = Array.isArray(history) ? history : [];

        // Format history for the Edge Function
        const formattedHistory = safeHistory.map(msg => ({
            role: msg.role,
            parts: msg.parts || [{ text: '' }],
        }));

        try {
            // Call Supabase Edge Function (already working with proper Gemini schema)
            const { data, error } = await supabase.functions.invoke('chat-command-center', {
                headers: {
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: {
                    message,
                    history: formattedHistory,
                    context,
                    metadata,
                },
            });

            if (error) {
                console.error('[AIService] Edge function error:', error);
                throw new Error(error.message || 'Failed to send command');
            }

            // Extract text from response
            const responseText = data?.text || data?.response || '';

            // Build updated history
            const newHistory: ChatMessage[] = [
                ...safeHistory,
                { role: 'user', parts: [{ text: message }], metadata },
                { role: 'model', parts: [{ text: responseText }] }
            ];

            return { text: responseText, history: newHistory };

        } catch (err: any) {
            console.error('[AIService] sendCommand failed:', err);
            throw new Error(err.message || 'Failed to send command');
        }
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
