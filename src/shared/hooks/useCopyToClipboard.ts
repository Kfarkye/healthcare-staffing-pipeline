// ============================================================================
// /src/shared/hooks/useCopyToClipboard.ts
// ============================================================================

import { useState, useCallback } from 'react';

interface CopyToClipboardReturn {
    copiedText: string | null;
    copiedId: string | number | null;
    copy: (text: string, id?: string | number) => Promise<void>;
    copyWithFeedback: (text: string, id?: string | number, duration?: number) => Promise<void>;
}

export function useCopyToClipboard(): CopyToClipboardReturn {
    const [copiedText, setCopiedText] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | number | null>(null);
    
    const copy = useCallback(async (text: string, id?: string | number) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedText(text);
            if (id !== undefined) {
                setCopiedId(id);
            }
        } catch (error) {
            console.error('Failed to copy:', error);
            throw error;
        }
    }, []);
    
    const copyWithFeedback = useCallback(async (
        text: string, 
        id?: string | number, 
        duration: number = 2000
    ) => {
        await copy(text, id);
        
        setTimeout(() => {
            setCopiedText(null);
            setCopiedId(null);
        }, duration);
    }, [copy]);
    
    return { copiedText, copiedId, copy, copyWithFeedback };
}