/**
 * URL Context Grounding Hook
 *
 * Extracts candidate context from the current page URL so the command center
 * can send it with every API request. This means the API has candidate data
 * without needing to query the database.
 *
 * Supported URL patterns:
 *   - Nova: nova.ayahealthcare.com/#/recruiting/candidates/{id}/...
 *   - Dashboard: /prospects?id={id}&name=...
 *   - Dashboard: /candidates/{id}
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UrlCandidateContext {
    /** Nova candidate ID extracted from URL */
    candidateId?: number;
    /** Full Nova URL if available */
    novaUrl?: string;
    /** Source of the context */
    source: 'url' | 'none';
}

const NOVA_CANDIDATE_PATTERN = /\/candidates?\/(\d+)/i;
const QUERY_ID_PATTERN = /[?&](?:candidate_id|id)=(\d+)/i;

function extractFromUrl(): UrlCandidateContext {
    if (typeof window === 'undefined') return { source: 'none' };

    const href = window.location.href;
    const hash = window.location.hash;

    // Check hash first (Nova SPA uses hash routing)
    const hashMatch = hash.match(NOVA_CANDIDATE_PATTERN);
    if (hashMatch?.[1]) {
        const id = Number(hashMatch[1]);
        if (Number.isFinite(id) && id > 0) {
            return {
                candidateId: id,
                novaUrl: href,
                source: 'url',
            };
        }
    }

    // Check pathname
    const pathMatch = window.location.pathname.match(NOVA_CANDIDATE_PATTERN);
    if (pathMatch?.[1]) {
        const id = Number(pathMatch[1]);
        if (Number.isFinite(id) && id > 0) {
            return { candidateId: id, source: 'url' };
        }
    }

    // Check query params
    const queryMatch = window.location.search.match(QUERY_ID_PATTERN);
    if (queryMatch?.[1]) {
        const id = Number(queryMatch[1]);
        if (Number.isFinite(id) && id > 0) {
            return { candidateId: id, source: 'url' };
        }
    }

    return { source: 'none' };
}

/**
 * Hook that provides URL-grounded candidate context.
 * Re-extracts when the URL changes (hash or popstate navigation).
 */
export function useUrlCandidateContext(): UrlCandidateContext {
    const [context, setContext] = useState<UrlCandidateContext>(() => extractFromUrl());
    const contextRef = useRef(context);
    contextRef.current = context;

    const handleNavigation = useCallback(() => {
        const updated = extractFromUrl();
        if (updated.candidateId !== contextRef.current.candidateId) {
            setContext(updated);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('hashchange', handleNavigation);
        window.addEventListener('popstate', handleNavigation);
        return () => {
            window.removeEventListener('hashchange', handleNavigation);
            window.removeEventListener('popstate', handleNavigation);
        };
    }, [handleNavigation]);

    return context;
}
