import { edgeEndpoint } from './config';
import { supabase } from './auth';
import type { Attachment } from './clipboard';

export type DraftRequest = {
    message: string;
    attachment?: { base64: string; mimeType: string };
    history?: any[];
};

export async function callCommandCenter(payload: DraftRequest): Promise<{ text: string }> {
    const sb = supabase();
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token ?? '';

    if (!token) throw new Error('NO_AUTH');

    const endpoint = edgeEndpoint();
    if (!endpoint) throw new Error('CONFIG');

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('API');

    const json = await res.json();
    const text = (json?.text ?? '').toString().trim();
    if (!text) throw new Error('EMPTY');
    return { text };
}

export function buildAttachment(att: Attachment | null): DraftRequest['attachment'] | undefined {
    if (!att) return undefined;
    return { base64: att.base64, mimeType: att.mimeType };
}
