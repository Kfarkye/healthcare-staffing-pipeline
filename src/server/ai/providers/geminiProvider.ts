import { ChatRequest, ChatResponse } from '../../../features/command-center-chat/types';

export async function callGemini(req: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const model = "gemini-3-pro-preview"; // Defaulting to the requested model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: req.messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        })),
        generationConfig: {
            temperature: req.temperature ?? 0.7,
            maxOutputTokens: req.max_tokens ?? 1024,
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw {
            code: `GEMINI_${response.status}`,
            message: errorData.error?.message || response.statusText,
            retryable: [429, 502, 503, 504].includes(response.status)
        };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
        schema_version: "chat.v1",
        message_id: crypto.randomUUID(),
        provider: 'gemini',
        model,
        text,
        usage: {
            prompt_tokens: result.usageMetadata?.promptTokenCount || 0,
            completion_tokens: result.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: result.usageMetadata?.totalTokenCount || 0
        }
    };
}
