// ============================================================================
// src/hooks/useEvent.ts
// SSR-safe stable callback identity without stale closures
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a stable function reference that always calls the latest version of the handler.
 * Unlike useCallback, this never triggers re-renders of children that depend on it.
 * 
 * SSR-safe: Uses useEffect instead of useLayoutEffect to avoid Next.js warnings.
 */
export function useEvent<T extends (...args: any[]) => any>(handler: T): T {
    const ref = useRef<T>(handler);

    // SSR-safe (no useLayoutEffect warning in Next.js)
    useEffect(() => {
        ref.current = handler;
    }, [handler]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useCallback(((...args: any[]) => ref.current(...args)) as T, []);
}
