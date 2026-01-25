/**
 * Design System Utilities
 * "Obsidian Weissach" Design Language
 * 
 * Core utility functions used throughout the application.
 * Keep this file focused on pure utility functions.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ============================================================================
// CLASS NAME UTILITIES
// ============================================================================

/**
 * Merge Tailwind CSS classes with conflict resolution.
 * Uses clsx for conditional classes and tailwind-merge for deduplication.
 * 
 * @example
 * cn('px-4 py-2', 'px-6') // => 'py-2 px-6'
 * cn('bg-red-500', isActive && 'bg-blue-500') // => 'bg-blue-500' if isActive
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique identifier.
 * Uses crypto.randomUUID() when available, falls back to Math.random().
 * 
 * @example
 * const id = generateId(); // => '550e8400-e29b-41d4-a716-446655440000'
 */
export function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// ============================================================================
// HAPTIC FEEDBACK
// ============================================================================

/**
 * Trigger subtle haptic feedback on supported devices.
 * Gracefully fails on unsupported browsers.
 * 
 * @example
 * onClick={() => { triggerHaptic(); doAction(); }}
 */
export function triggerHaptic(): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(4);
    }
}

// ============================================================================
// JSON PARSING
// ============================================================================

/**
 * Safely parse JSON with error handling.
 * Returns null on parse failure instead of throwing.
 * 
 * @example
 * const data = tryParseJson<UserData>(jsonString);
 * if (data) { ... }
 */
export function tryParseJson<T = unknown>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Truncate a string to a maximum length with ellipsis.
 * 
 * @example
 * truncate('Hello World', 5) // => 'Hello...'
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength).trim() + '...';
}

/**
 * Format a tool name for display.
 * Converts snake_case to Title Case with spaces.
 * 
 * @example
 * formatToolName('search_candidates') // => 'Search Candidates'
 */
export function formatToolName(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
}

// ============================================================================
// CLIPBOARD
// ============================================================================

/**
 * Copy text to clipboard with error handling.
 * Returns true on success, false on failure.
 * 
 * @example
 * const success = await copyToClipboard(text);
 * if (success) showToast('Copied!');
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for older browsers
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch {
            return false;
        }
    }
}

// ============================================================================
// SCROLL UTILITIES
// ============================================================================

/**
 * Check if an element is scrolled to the bottom.
 * Useful for auto-scroll behavior in chat-like interfaces.
 * 
 * @param element The scrollable element
 * @param threshold Pixels from bottom to consider "at bottom" (default: 100)
 */
export function isScrolledToBottom(element: HTMLElement | null, threshold = 100): boolean {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
}

/**
 * Smooth scroll an element to the bottom.
 * 
 * @param element The scrollable element
 * @param behavior Scroll behavior (default: 'smooth')
 */
export function scrollToBottom(
    element: HTMLElement | null,
    behavior: ScrollBehavior = 'smooth'
): void {
    if (!element) return;
    element.scrollTo({
        top: element.scrollHeight,
        behavior,
    });
}

// ============================================================================
// THROTTLE & DEBOUNCE
// ============================================================================

/**
 * Debounce a function call.
 * Only executes after the specified delay with no new calls.
 * 
 * @example
 * const debouncedSearch = debounce(search, 300);
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle a function call.
 * Executes at most once per specified interval.
 * 
 * @example
 * const throttledScroll = throttle(handleScroll, 100);
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => { inThrottle = false; }, limit);
        }
    };
}
