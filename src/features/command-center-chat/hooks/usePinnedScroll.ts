/**
 * usePinnedScroll
 * 
 * High-performance scroll management for streaming chat interfaces.
 * Eliminates forced reflow by:
 * 1. Tracking "pinned to bottom" state via passive scroll events (event-driven, not per-render)
 * 2. Using ResizeObserver to detect content growth (no DOM reads in render path)
 * 3. Scheduling scroll writes via requestAnimationFrame (1 write per frame max)
 * 
 * The pattern: Container (overflow:auto) → Content (grows during stream)
 * ResizeObserver watches content, schedules RAF scroll write only when pinned.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

interface UsePinnedScrollOptions {
    /** Distance from bottom (px) to consider "pinned". Default: 64 */
    bottomThresholdPx?: number;
}

interface UsePinnedScrollReturn {
    /** Attach to the scrollable container */
    containerRef: React.RefObject<HTMLDivElement>;
    /** Attach to the content wrapper inside container */
    contentRef: React.RefObject<HTMLDivElement>;
    /** True if user is near bottom (should auto-scroll) */
    isPinned: boolean;
    /** Imperatively scroll to bottom (for "Jump to latest" button) */
    scrollToBottomNow: () => void;
}

export function usePinnedScroll(options: UsePinnedScrollOptions = {}): UsePinnedScrollReturn {
    const bottomThresholdPx = options.bottomThresholdPx ?? 64;

    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Use ref for the "live" value, state for React renders (button visibility)
    const isPinnedRef = useRef(true);
    const [isPinned, setIsPinned] = useState(true);

    // Track pending RAF to avoid scheduling multiple
    const rafIdRef = useRef<number | null>(null);

    const scrollToBottomNow = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, []);

    const scheduleScrollToBottom = useCallback(() => {
        // Only scroll if pinned
        if (!isPinnedRef.current) return;
        // Avoid scheduling multiple RAFs
        if (rafIdRef.current != null) return;

        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            scrollToBottomNow();
        });
    }, [scrollToBottomNow]);

    // Track pinned state from user scroll (passive, no forced layout)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onScroll = () => {
            // Read layout only on user-initiated scroll, not per token
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            const nextPinned = distanceFromBottom <= bottomThresholdPx;

            if (nextPinned !== isPinnedRef.current) {
                isPinnedRef.current = nextPinned;
                setIsPinned(nextPinned);
            }
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        // Initialize state
        onScroll();

        return () => el.removeEventListener('scroll', onScroll);
    }, [bottomThresholdPx]);

    // Auto-scroll when content grows (ResizeObserver, not per-render effect)
    useEffect(() => {
        const content = contentRef.current;
        if (!content) return;

        const ro = new ResizeObserver(() => {
            scheduleScrollToBottom();
        });

        ro.observe(content);

        return () => ro.disconnect();
    }, [scheduleScrollToBottom]);

    // Cleanup RAF on unmount
    useEffect(() => {
        return () => {
            if (rafIdRef.current != null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, []);

    return useMemo(
        () => ({
            containerRef,
            contentRef,
            isPinned,
            scrollToBottomNow,
        }),
        [isPinned, scrollToBottomNow]
    );
}
