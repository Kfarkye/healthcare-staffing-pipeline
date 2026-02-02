// ============================================================================
// src/hooks/useMountedRef.ts
// Prevents setState after unmount - avoids React memory leak warnings
// ============================================================================

import { useEffect, useRef } from 'react';

/**
 * Returns a ref that tracks whether the component is mounted.
 * Use this to guard async state updates that might complete after unmount.
 * 
 * @example
 * const mountedRef = useMountedRef();
 * 
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (mountedRef.current) {
 *       setData(data);
 *     }
 *   });
 * }, []);
 */
export function useMountedRef() {
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    return mountedRef;
}
