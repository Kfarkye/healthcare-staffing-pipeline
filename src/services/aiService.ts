import { supabase } from '../lib/supabase';

export interface TailoredReplyResponse {
    reply: string;
    analysis: string;
    suggested_action: string;
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
}

export const AIService = new AIServiceClass();
