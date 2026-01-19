// ============================================================================
// /src/shared/hooks/useKeyboardShortcuts.ts
// ============================================================================

import { useEffect } from 'react';

interface Shortcut {
    key: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    callback: () => void;
    description?: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            for (const shortcut of shortcuts) {
                const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
                const matchesCtrl = shortcut.ctrlKey ? event.ctrlKey : true;
                const matchesShift = shortcut.shiftKey ? event.shiftKey : true;
                const matchesAlt = shortcut.altKey ? event.altKey : true;
                const matchesMeta = shortcut.metaKey ? event.metaKey : true;
                
                if (matchesKey && matchesCtrl && matchesShift && matchesAlt && matchesMeta) {
                    event.preventDefault();
                    shortcut.callback();
                    break;
                }
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [shortcuts]);
}