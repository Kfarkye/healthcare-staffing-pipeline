/**
 * useDeepLink — Parse URL search params to auto-open Command Center with a pre-selected template.
 *
 * Supported URL params:
 *   chat=1            — auto-open the panel
 *   template=<id>     — pre-select a template (validated against catalog)
 *   name=<string>     — candidate name
 *   email=<string>    — candidate email
 *   facility=<string> — facility name
 *   specialty=<string> — specialty
 *   location=<string> — location
 *   novaId=<string>   — Nova ID
 *
 * Example:
 *   /prospects?chat=1&template=pay_package&name=Jane+Doe&facility=UCLA
 *
 * Usage:
 *   const deepLink = useDeepLink();
 *   // deepLink.shouldOpen — true if chat=1
 *   // deepLink.template   — { id, name } or null
 *   // deepLink.context    — extracted context params
 *   // deepLink.inputHint  — pre-filled input text from context
 *   // deepLink.consume()  — clears deep link params from URL
 */

import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getCatalogEntry } from '@/lib/template-catalog';

/** Params consumed by deep link (removed from URL after use) */
const DEEP_LINK_PARAMS = ['chat', 'template', 'name', 'email', 'facility', 'specialty', 'location', 'novaId'] as const;

type DeepLinkParam = typeof DEEP_LINK_PARAMS[number];

export interface DeepLinkContext {
    candidateName?: string;
    candidateEmail?: string;
    facility?: string;
    specialty?: string;
    location?: string;
    novaId?: string;
}

export interface DeepLinkResult {
    /** Whether the panel should auto-open */
    shouldOpen: boolean;
    /** Pre-selected template (validated against catalog) */
    template: { id: string; name: string } | null;
    /** Extracted context params for the template */
    context: DeepLinkContext;
    /** Human-readable input hint built from context */
    inputHint: string;
    /** Remove deep link params from URL (call after consuming) */
    consume: () => void;
    /** Whether deep link params were present at all */
    hasParams: boolean;
}

function buildInputHint(
    templateName: string | undefined,
    ctx: DeepLinkContext,
): string {
    const parts: string[] = [];

    if (templateName) parts.push(templateName);
    if (ctx.candidateName) parts.push(`for ${ctx.candidateName}`);
    if (ctx.facility) parts.push(`at ${ctx.facility}`);
    if (ctx.specialty) parts.push(`(${ctx.specialty})`);
    if (ctx.location) parts.push(`in ${ctx.location}`);

    return parts.join(' ');
}

export function useDeepLink(): DeepLinkResult {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const consumedRef = useRef(false);

    const result = useMemo<Omit<DeepLinkResult, 'consume'>>(() => {
        // Don't re-parse after consuming
        if (consumedRef.current) {
            return { shouldOpen: false, template: null, context: {}, inputHint: '', hasParams: false };
        }

        const chatParam = searchParams.get('chat');
        const templateParam = searchParams.get('template');

        const hasParams = DEEP_LINK_PARAMS.some(p => searchParams.has(p));
        if (!hasParams) {
            return { shouldOpen: false, template: null, context: {}, inputHint: '', hasParams: false };
        }

        const shouldOpen = chatParam === '1' || chatParam === 'true' || !!templateParam;

        // Validate template against catalog
        let template: { id: string; name: string } | null = null;
        if (templateParam) {
            const entry = getCatalogEntry(templateParam);
            if (entry) {
                template = { id: entry.id, name: entry.name };
            }
        }

        // Extract context params
        const context: DeepLinkContext = {};
        const name = searchParams.get('name');
        const email = searchParams.get('email');
        const facility = searchParams.get('facility');
        const specialty = searchParams.get('specialty');
        const location = searchParams.get('location');
        const novaId = searchParams.get('novaId');

        if (name) context.candidateName = name;
        if (email) context.candidateEmail = email;
        if (facility) context.facility = facility;
        if (specialty) context.specialty = specialty;
        if (location) context.location = location;
        if (novaId) context.novaId = novaId;

        const inputHint = buildInputHint(template?.name, context);

        return { shouldOpen, template, context, inputHint, hasParams };
    }, [searchParams]);

    const consume = useCallback(() => {
        if (consumedRef.current) return;
        consumedRef.current = true;

        // Strip deep link params, preserve others (tab, view, q, etc.)
        const params = new URLSearchParams(searchParams.toString());
        for (const key of DEEP_LINK_PARAMS) {
            params.delete(key);
        }
        const remaining = params.toString();
        router.replace(`${pathname}${remaining ? `?${remaining}` : ''}`, { scroll: false });
    }, [searchParams, router, pathname]);

    return { ...result, consume };
}
