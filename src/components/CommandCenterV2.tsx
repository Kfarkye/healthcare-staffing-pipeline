/* ============================================================================
   CommandCenterV2.tsx
   "Obsidian Weissach" — Healthcare Staffing Edition (v4.6 - Production)

   Architecture:
   ├─ §0  Constants, Config, Regex Engine
   ├─ §1  Helpers, Hooks, Audio
   ├─ §2  Visual Primitives (Thumbnails, Pills, Copy)
   ├─ §3  Intelligence Artifacts (Verdict, HUD, Thinking)
   ├─ §4  Email System (Card, Parser, Outreach Formatter)
   ├─ §5  Intel & Action Panels (Next Steps, Market Intel)
   ├─ §6  Message Bubble & Tool Results
   ├─ §7  Input Deck
   ├─ §8  Shell (Error Boundary, Layout, Scroll)
   └─ §9  Export

   Changelog v4.6 (Micro-Detail Polish):
   ├─ UX: InlineImageThumbnail — loading skeleton shimmer, proper error fallback
   │  (replaces emoji SVG with clean vector placeholder), image fade-in on load,
   │  subtle bottom vignette, file extension badge, refined proportions (18px radius,
   │  16:10 aspect, restrained 1.02 hover scale, brightness boost)
   ├─ UX: UserAttachment — larger 56px thumbnail, file type badge overlay,
   │  external link affordance, refined ring/radius treatment
   ├─ UX: InlineFilePill — tighter icon-to-text proportions, larger 32px icon
   │  container, refined hover transitions
   ├─ UX: InputDeck attachment thumbnails — refined 72px/14px radius,
   │  ring-based borders, hover scale on preview images
   ├─ UX: Lightbox — larger radius (2xl), system-level shadow, refined close button
   ├─ UX: CandidateVerdict — tighter display type (20/24px), larger status circle,
   │  pulsing status dot, heavier icon strokes
   ├─ UX: EmailCard — refined subject typography (13.5px semibold), taller action
   │  bar buttons (40px), ghost ring on copy hover, smoother transitions
   ├─ UX: EmailBody — warmer greeting size (15px), refined section header labels
   │  (9px/0.12em tracking), tighter bullet dot alignment
   ├─ UX: PostDraftActions — larger tap targets (py-2.5), smoother stagger (0.1s),
   │  font-medium labels, subtle scale on hover
   ├─ UX: ToolResultCard — system-level spring animation, refined dot pulse
   ├─ UX: Empty state — embedded quick-launch workflow links (Nova, Outlook, Pipeline)
   ├─ UX: IntelPanel — refined Nova profile card with chevron affordance, larger
   │  icon container, improved label hierarchy
   ├─ UX: NextStepsPanel — refined link padding, softer ring values, text transitions
   ├─ UX: Header — refined brand label (9px uppercase tracking), tighter Clear button
   ├─ UX: Nova ID links — hover background highlight, larger gap
   ├─ UX: Standard markdown links — refined underline offset (3px), decoration transitions
   ├─ UX: Mode chips — rounded-[10px], softer active glow, faster stagger
   ├─ UX: Assistant label — refined dot size (1.5px), tighter tracking
   ├─ PERF: will-change-transform on image thumbnails for GPU compositing
   ├─ A11Y: focus-visible ring on all interactive elements (links, buttons, chips)
   ├─ A11Y: UserAttachment image alt text now uses filename (was empty)
   ├─ A11Y: Vignette gradient hidden in error state (no longer overlaps placeholder)
   ├─ A11Y: Workflow link touch targets increased to min-h 36px
   ├─ PERF: Removed unnecessary will-change-transform from UserAttachment
   └─ VERSION: 4.5 → 4.6

   Changelog v4.5 (Polish Pass):
   ├─ FIX: Removed dead mountedRef (allocated but never read)
   ├─ FIX: ToolResultCard clipboard — removed silent-fail auto-copy useEffect
   │  (modern browsers block clipboard writes outside user gestures), hardened
   │  manual copy with systemCopyToClipboard + haptic feedback
   ├─ FIX: File input reset — allows re-selecting the same file (cleared after onChange)
   ├─ FIX: AnimatePresence keys — empty state and message list now keyed for
   │  proper enter/exit transitions
   ├─ UX: Focus management — input auto-focuses on panel open, returns focus
   │  after message send (the UI anticipates intent)
   ├─ UX: Error boundary upgraded with retry button (no more dead-end "refresh")
   ├─ A11Y: Added aria-labels to close button and error retry
   └─ HYGIENE: Version bump, changelog, dead code removal

   Changelog v4.4:
   ├─ UX: EmailCard stripped to 3 elements (subject, body, 2-button action bar)
   ├─ UX: PostDraftActions redesigned as contextual copilot — ghost user-bubble
   │  shape, visual confidence gradient, tap choreography with fired state
   ├─ FIX: Subject-body merge — 5-tier heuristic split (greeting, section header,
   │  body-opener phrases, sentence boundary, length guard)
   ├─ FIX: Bullet detection — added asterisk bullets and numbered lists
   ├─ FIX: Format 3 metadata leak (CC/BCC/From/Date stripped from body)
   ├─ FIX: HighlightedText global regex .test() alternating failure
   ├─ FIX: selectContextualActions gate labels synced with DRAFT_ACTION_POOL
   ├─ INTEL: Contextual action scoring engine (coveredBy regex, mode boost/penalty,
   │  length gate, formality gate, max 3 shown)
   ├─ PERF: Memoized email parsing pipeline (regex runs once, not per-render)
   └─ SAFETY: Strict 413 Payload Guards, SSR-safe hooks, Error Recovery
============================================================================ */

import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    memo,
    useLayoutEffect,
    Component,
    type FC,
    type ReactNode,
    type KeyboardEvent as ReactKeyboardEvent,
    type DragEvent as ReactDragEvent,
    type ClipboardEvent,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
    X, Minimize2, Maximize2, ArrowUp, Copy, Check, Square, Paperclip,
    FileText, Users, Activity, ChevronRight, ChevronDown,
    Zap, Loader2, Image as ImageIcon, ExternalLink, Mail, Camera,
    Shield, DollarSign, Phone, MapPin, MessageSquare,
} from 'lucide-react';

import {
    SYSTEM, cn, triggerHaptic, copyToClipboard as systemCopyToClipboard,
    FilmGrain, OrbitalRadar, ToastProvider, useToast,
} from '../design-system/obsidian';

import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { useFileUpload, type Attachment } from '../features/command-center-chat/hooks/useFileUpload';
import { usePinnedScroll } from '../features/command-center-chat/hooks/usePinnedScroll';
import { useLayout } from '../context/LayoutContext';


// ============================================================================
// §0  CONSTANTS & CONFIG
// ============================================================================

/** Vercel Payload Safety Limit (4 MB buffer against 4.5 MB hard limit) */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Compiled Regex (module-level, allocated once)
// ---------------------------------------------------------------------------
const REGEX_NOVA_ID        = /^\d{6,8}$/;
const REGEX_ATTACHMENT     = /\[(?:Attached:\s*|📎\s*)([^\]]+)\]\((?:<([^>]+)>|([^)]+))\)/g;
const REGEX_VERDICT        = /VERDICT:\s*(STRONG MATCH|REVIEW NEEDED|NOT A FIT)/i;
const REGEX_INSIGHT        = /(?:INSIGHT|ASSESSMENT|KEY QUALIFICATIONS):\s*(.+)/is;
const REGEX_CLIENT_MARKERS = /\[\[(?:PROSPECT_UPSERT:[^\]]+|REFRESH_DASHBOARD)\]\]/g;

// Email format detection (permissive, case-insensitive)
const REGEX_EMAIL_HEADER   = /^#?\s*(?:EMAIL|DRAFT)\s*(?:DRAFT|EMAIL)?[\r\n]+/i;
const REGEX_EMAIL_TO       = /(?:\*\*|__)?To:(?:\*\*|__)?\s*([^\r\n]+)/i;
const REGEX_EMAIL_SUBJECT  = /(?:\*\*|__)?Subject:(?:\*\*|__)?\s*([^\r\n]+)/i;
const REGEX_EMAIL_BODY     = /(?:^|\n)---[\r\n]+([\s\S]+?)[\r\n]+---(?:\s|$)/;
const REGEX_TAG_SUBJECT    = /\[SUBJECT\]([\s\S]*?)\[\/SUBJECT\]/i;
const REGEX_TAG_BODY       = /\[BODY\]([\s\S]*?)\[\/BODY\]/i;
const REGEX_EMAIL_DRAFT_JSON = /\[EMAIL_DRAFT_JSON\]\s*([\s\S]*?)\s*\[\/EMAIL_DRAFT_JSON\]/i;

// Rich response block extraction
const REGEX_RESPONSE_BLOCK = /\[RESPONSE_BLOCK:(\w+)\]([\s\S]*?)\[\/RESPONSE_BLOCK\]/g;

interface ParsedResponseBlock {
    kind: string;
    data: any;
}

function extractResponseBlocks(content: string): {
    blocks: ParsedResponseBlock[];
    prose: string;
} {
    const blocks: ParsedResponseBlock[] = [];
    const prose = content.replace(REGEX_RESPONSE_BLOCK, (_, kind, json) => {
        try { blocks.push({ kind, data: JSON.parse(json) }); }
        catch { /* skip malformed blocks */ }
        return '';
    }).trim();
    REGEX_RESPONSE_BLOCK.lastIndex = 0;
    return { blocks, prose };
}

// Recruiting workflow defaults
const DEFAULT_CC = 'Tiffany.Chavez@ayahealthcare.com';

// File type sets
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic']);
const PDF_EXTENSION = 'pdf';

const STATUS_STYLES: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    blue:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
    amber:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    rose:    'bg-rose-500/15 text-rose-400 border-rose-500/30',
    purple:  'bg-purple-500/15 text-purple-400 border-purple-500/30',
    zinc:    'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const RECRUITING_PHASES = [
    'SEARCHING DATABASE',
    'ANALYZING MATCH',
    'CALCULATING PACKAGE',
    'DRAFTING RESPONSE',
] as const;


// ============================================================================
// §1  HELPERS, HOOKS & AUDIO
// ============================================================================

// ---------------------------------------------------------------------------
// SSR-Safe Layout Effect
// ---------------------------------------------------------------------------
const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ---------------------------------------------------------------------------
// Text / Email helpers
// ---------------------------------------------------------------------------

/** Strip all markdown formatting → Outlook-safe plain text */
function stripMarkdownForEmail(text: string): string {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/^\s*[\*\+]\s+/gm, '- ')
        .replace(/^\s*•\s*/gm, '- ')
        .replace(/^#+\s*/gm, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^>\s*/gm, '')
        .replace(/\[([^\]]+)\]\((?:<[^>]+>|[^)]+)\)/g, '$1')
        .replace(/\r\n/g, '\n')
        .trim();
}

/** Extract clean email from "Name <email>" or raw strings */
function extractFirstEmail(input?: string): string | undefined {
    if (!input) return undefined;
    const m = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return m?.[1];
}

function sanitizeHref(
    href?: string,
    opts: { allowRelative?: boolean; allowMailto?: boolean } = {},
): string | null {
    if (!href) return null;
    const value = href.trim();
    if (!value || /[\u0000-\u001F\u007F]/.test(value)) return null;

    const { allowRelative = false, allowMailto = false } = opts;
    if (allowRelative && (/^(?:\/|\.{1,2}\/)/.test(value) || value.startsWith('#'))) {
        return value;
    }

    try {
        const parsed = new URL(value, 'https://example.invalid');
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return value;
        if (allowMailto && parsed.protocol === 'mailto:') return value;
        return null;
    } catch {
        return null;
    }
}

function escapeMarkdownLinkLabel(label: string): string {
    return label
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\r?\n/g, ' ')
        .trim();
}

function toMarkdownLinkTarget(url: string): string {
    return /[\s()]/.test(url) ? `<${url.replace(/>/g, '%3E')}>` : url;
}

/**
 * Split subject lines that accidentally merged with body content.
 * Detects greetings, section headers, body-opener phrases, and
 * sentence boundaries that leaked into subject.
 *
 * Heuristics (priority order):
 *   1. Greeting prefix (Hi/Hello/Hey/Dear + name,)
 *   2. Section header keyword (Pay Package:, Facility:, etc.)
 *   3. Body-opener phrase (I am, Please, Thank you, As discussed, etc.)
 *   4. Sentence boundary (. + space + uppercase after char 15+)
 *   5. Length guard (>120 chars → split at first sentence boundary)
 */
function splitMergedSubjectAndBody(
    subject: string,
    body: string,
): { subject: string; body: string } {
    const cleanSubject = (subject || '').trim();
    let cleanBody = (body || '').trim();
    if (!cleanSubject) return { subject: cleanSubject, body: cleanBody };

    const splitCandidates: number[] = [];

    // 1. Greeting prefix: "Hi Solomon," / "Hello team," / "Dear Kofi,"
    const greetingMatch = cleanSubject.match(
        /\b(?:Hi|Hello|Hey|Dear)\s+[A-Z][^,\n]{0,60},/i,
    );
    if (greetingMatch?.index != null && greetingMatch.index > 0) {
        splitCandidates.push(greetingMatch.index);
    }

    // 2. Section header keyword (synced with SECTION_HEADER_RX)
    const sectionRx =
        /\b(?:Pay Package:|To move forward\b[^:\n]*:?|Facility:|Location:|Assignment Details:|Assignment Dates?:|Shifts?(?:\s*&\s*Hours)?:|Benefits:|Requirements:|Compensation:|Schedule:|Contract Details:|Next Steps:|Important Notes?:|Details:|Overview:)\b/i;
    const sectionMatch = cleanSubject.match(sectionRx);
    if (sectionMatch?.index != null && sectionMatch.index > 0) {
        splitCandidates.push(sectionMatch.index);
    }

    // 3. Body-opener phrase: common first-sentence patterns that are never subjects
    const bodyOpenerRx =
        /\b(?:I am|I'm|I just|I wanted|I hope|I would|I'd|Please\s+(?:take|let|find|see|review|note|feel)|Thank you|Thanks for|As (?:discussed|we|per|mentioned)|Per our|We (?:have|are|wanted)|Here (?:are|is)|Congratulations|Sorry for|My (?:apologies|condolences)|Attached (?:is|are|you)|Following up|Just (?:wanted|checking|following|a quick))\b/i;
    const openerMatch = cleanSubject.match(bodyOpenerRx);
    if (openerMatch?.index != null && openerMatch.index > 3) {
        splitCandidates.push(openerMatch.index);
    }

    // 4. Sentence boundary: ". [A-Z]" or "! [A-Z]" or "? [A-Z]" after pos 10
    const sentenceRx = /[.!?]\s+[A-Z]/g;
    let sentenceMatch: RegExpExecArray | null;
    while ((sentenceMatch = sentenceRx.exec(cleanSubject)) !== null) {
        const splitPos = sentenceMatch.index + 1; // after the punctuation
        if (splitPos >= 10) {
            splitCandidates.push(splitPos);
            break; // take first boundary
        }
    }

    // 5. Length guard: if >120 chars with no other splits, force at first ". "
    if (splitCandidates.length === 0 && cleanSubject.length > 120) {
        const forceSplit = cleanSubject.indexOf('. ');
        if (forceSplit > 10) {
            splitCandidates.push(forceSplit + 1);
        }
    }

    if (splitCandidates.length === 0) {
        return { subject: cleanSubject, body: cleanBody };
    }

    const splitAt = Math.min(...splitCandidates);
    const left = cleanSubject.slice(0, splitAt).trim();
    const right = cleanSubject.slice(splitAt).trim();

    // Guard: left must be a plausible subject (>=5 chars) and right must have content
    if (!left || left.length < 5 || !right) {
        return { subject: cleanSubject, body: cleanBody };
    }

    cleanBody = cleanBody ? `${right}\n\n${cleanBody}` : right;
    return { subject: left, body: cleanBody };
}

/**
 * Normalize email body layout: ensure section headers get breathing room,
 * bullets start on new lines, and triple-newlines collapse.
 */
function normalizeEmailBodyLayout(body: string): string {
    if (!body) return body;
    let text = body.replace(/\r\n/g, '\n').trim();

    // Force double-newline before known section headers (synced with SECTION_HEADER_RX)
    text = text.replace(
        /([^\n])\s+(Pay Package:|Assignment Details:|To move forward\b[^:\n]*:?|Facility:|Location:|Assignment Dates?:|Shifts?(?:\s*&\s*Hours)?:|Next Steps:|Benefits:|Requirements:|Compensation:|Schedule:|Contract Details:|Important Notes?:|Details:|Overview:)/gi,
        '$1\n\n$2',
    );

    // Force newline before bullet items (dash, asterisk, numbered)
    text = text.replace(/([^\n])\s+(-\s+)/g, '$1\n$2');
    text = text.replace(/([^\n])\s+(\*\s+)/g, '$1\n$2');
    text = text.replace(/([^\n])\s+(\d{1,2}[.)]\s+)/g, '$1\n$2');

    // Collapse excessive blank lines
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
}

/** Outlook Desktop requires CRLF for mailto body line breaks */
function normalizeBodyForMailto(body: string): string {
    return body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function flattenChildrenText(node: ReactNode): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flattenChildrenText).join('');
    if (typeof node === 'object' && 'props' in node && (node as any).props?.children) {
        return flattenChildrenText((node as any).props.children);
    }
    return '';
}

function stripPaperclip(label: string): string {
    return label.replace(/^📎\s*/u, '').trim();
}

function getFileExtension(href?: string, label?: string): string {
    const cleanLabel = stripPaperclip(label || '');
    const labelMatch = cleanLabel.match(/\.([a-z0-9]{2,5})$/i);
    if (labelMatch?.[1]) return labelMatch[1].toLowerCase();
    if (href) {
        try {
            const path = new URL(href).pathname;
            const match = path.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
            if (match?.[1]) return match[1].toLowerCase();
        } catch { /* invalid URL, fall through */ }
    }
    return '';
}

/**
 * Transform machine-generated filenames into clean human-readable labels.
 */
function humanizeFilename(filename: string): string {
    if (!filename) return 'Attachment';

    const stripped = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
    if (!stripped) return 'Attachment';

    if (/^(?:screenshot|screen[_ -]?shot|capture|grab)/i.test(stripped)) {
        return 'Screenshot';
    }
    if (/^(?:IMG|DSC|DCIM|DJI|photo|image|pic)[_\s-]?\d/i.test(stripped)) {
        return 'Photo';
    }
    if (/^(?:clipboard|paste|pasted)[_\s-]?/i.test(stripped)) {
        return 'Clipboard Image';
    }

    let cleaned = stripped;

    cleaned = cleaned.replace(/[_\s-]?\d{10,13}$/g, '');
    cleaned = cleaned.replace(/^\d{10,13}[_\s-]?/g, '');
    cleaned = cleaned.replace(
        /[_\s-]?\d{4}[-_]?\d{2}[-_]?\d{2}(?:[-_T]?\d{2}[-_:]?\d{2}[-_:]?\d{2})?[_\s-]?/g,
        ' ',
    );
    cleaned = cleaned.replace(/[_\s-][0-9a-f]{8,}(?:[_\s-][0-9a-f]{4,}){0,4}/gi, '');
    cleaned = cleaned.replace(/[_-]+/g, ' ');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    if (!cleaned || cleaned.length < 2) return 'Attachment';

    cleaned = cleaned.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return cleaned;
}

// ---------------------------------------------------------------------------
// Auto-resize textarea hook
// ---------------------------------------------------------------------------
const useAutoResizeTextArea = (
    ref: React.RefObject<HTMLTextAreaElement>,
    value: string,
) => {
    useIsomorphicLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = '52px';
        const newHeight = Math.min(Math.max(el.scrollHeight, 52), 160);
        el.style.height = `${newHeight}px`;
    }, [value, ref]);
};

// ---------------------------------------------------------------------------
// Shared Audio Engine (created once, reused on user gestures)
// ---------------------------------------------------------------------------
let sharedAudioContext: AudioContext | null = null;

const ensureAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!sharedAudioContext) {
        try {
            sharedAudioContext = new (
                window.AudioContext || (window as any).webkitAudioContext
            )();
        } catch {
            return null;
        }
    }
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
};

/** 200 ms A5 sine tone — only call on user gesture (click/tap) */
const playDraftReadyCue = () => {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch { /* silent fallback */ }
};


// ============================================================================
// §1b  TYPES
// ============================================================================

interface ToolInvocation {
    toolName: string;
    toolCallId: string;
    state: 'result' | 'call' | 'pending';
    args: any;
    result?: any;
}

interface DragHandlerProps {
    onDragEnter: (e: ReactDragEvent) => void;
    onDragOver: (e: ReactDragEvent) => void;
    onDragLeave: (e: ReactDragEvent) => void;
    onDrop: (e: ReactDragEvent) => void;
}

type RouterMode = 'default' | 'cold_outreach' | 'batch_reassign' | 'reply_mode';


// ============================================================================
// §2  VISUAL PRIMITIVES
// ============================================================================

// ---------------------------------------------------------------------------
// Inline image thumbnail (renders inside markdown)
// ---------------------------------------------------------------------------
const InlineImageThumbnail: FC<{ href: string; label: string }> = memo(
    ({ href, label }) => {
        const cleanLabel = stripPaperclip(label);
        const safeHref = sanitizeHref(href);
        const [loaded, setLoaded] = useState(false);
        const [errored, setErrored] = useState(false);
        const ext = getFileExtension(safeHref || href, label).toUpperCase() || 'IMG';
        if (!safeHref) {
            return (
                <div className="my-3 px-3 py-2 rounded-xl ring-1 ring-rose-500/20 bg-rose-500/[0.05] text-[11px] text-rose-300">
                    Invalid attachment link: {cleanLabel}
                </div>
            );
        }
        return (
            <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block my-4 no-underline group max-w-[340px] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-[18px]"
                onClick={(e) => e.stopPropagation()}
                title={`Open ${cleanLabel}`}
            >
                <div className="rounded-[18px] overflow-hidden ring-1 ring-white/[0.06] hover:ring-white/[0.12] bg-[#080809] transition-all duration-500 ease-out shadow-[0_2px_16px_-4px_rgba(0,0,0,0.6)] hover:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.7)] will-change-transform">
                    <div className="relative aspect-[16/10] bg-[#050506]">
                        {/* Loading skeleton */}
                        {!loaded && !errored && (
                            <div className="absolute inset-0 bg-[linear-gradient(110deg,#0a0a0b_30%,#111113_50%,#0a0a0b_70%)] bg-[length:200%_100%] animate-[shimmer_2s_infinite_linear]" />
                        )}
                        {!errored ? (
                            <img
                                src={safeHref}
                                alt={cleanLabel}
                                loading="lazy"
                                onLoad={() => setLoaded(true)}
                                className={cn(
                                    'absolute inset-0 w-full h-full object-contain transition-all duration-700 ease-out',
                                    'group-hover:scale-[1.02] group-hover:brightness-110',
                                    loaded ? 'opacity-100' : 'opacity-0',
                                )}
                                onError={() => setErrored(true)}
                            />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <ImageIcon size={24} className="text-zinc-700" strokeWidth={1.5} />
                                <span className="text-[9px] font-medium tracking-[0.08em] uppercase text-zinc-700">Preview unavailable</span>
                            </div>
                        )}
                        {/* Subtle bottom vignette for text contrast (hidden on error) */}
                        {!errored && (
                            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#080809]/60 to-transparent pointer-events-none" />
                        )}
                        {/* External link indicator */}
                        <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-[10px] bg-black/60 ring-1 ring-white/[0.08] backdrop-blur-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-100 scale-90">
                            <ExternalLink size={11} className="text-white/80" />
                        </div>
                    </div>
                    <div className="px-3.5 py-2 flex items-center gap-2.5 border-t border-white/[0.04]">
                        <ImageIcon size={11} className="text-indigo-400/50 shrink-0" />
                        <span className="text-[11px] text-zinc-500 truncate flex-1 group-hover:text-zinc-400 transition-colors duration-300">{cleanLabel}</span>
                        <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-zinc-700 shrink-0">{ext}</span>
                    </div>
                </div>
            </a>
        );
    },
);
InlineImageThumbnail.displayName = 'InlineImageThumbnail';

// ---------------------------------------------------------------------------
// Inline file pill (PDF, DOCX, etc.)
// ---------------------------------------------------------------------------
const InlineFilePill: FC<{ href: string; label: string; isPdf?: boolean }> = memo(
    ({ href, label, isPdf }) => {
        const cleanLabel = stripPaperclip(label);
        const safeHref = sanitizeHref(href);
        if (!safeHref) {
            return (
                <span className="inline-flex my-2 px-3 py-2 rounded-xl ring-1 ring-rose-500/20 bg-rose-500/[0.05] text-[11px] text-rose-300">
                    Invalid file link: {cleanLabel}
                </span>
            );
        }
        const ext = getFileExtension(safeHref, label);
        return (
            <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 my-2.5 px-3 py-2.5 rounded-[14px] ring-1 ring-white/[0.06] bg-[#080809] hover:bg-white/[0.03] hover:ring-white/[0.12] transition-all duration-300 no-underline max-w-full group mr-2 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                onClick={(e) => e.stopPropagation()}
                title={`Open ${cleanLabel}`}
            >
                <div className={cn(
                    'w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 transition-colors duration-300',
                    isPdf ? 'bg-rose-500/10 group-hover:bg-rose-500/15' : 'bg-zinc-500/8 group-hover:bg-zinc-500/12',
                )}>
                    {isPdf
                        ? <FileText size={14} className="text-rose-400" />
                        : <Paperclip size={14} className="text-zinc-400" />
                    }
                </div>
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-[12px] text-zinc-300 truncate group-hover:text-white transition-colors duration-200 font-medium">
                        {cleanLabel}
                    </span>
                    {ext && (
                        <span className="text-[8px] font-bold tracking-[0.08em] uppercase text-zinc-600 shrink-0">
                            {ext}
                        </span>
                    )}
                </div>
                <ExternalLink size={11} className="text-zinc-700 group-hover:text-zinc-400 transition-colors duration-200 shrink-0" />
            </a>
        );
    },
);
InlineFilePill.displayName = 'InlineFilePill';

// ---------------------------------------------------------------------------
// Copy button (used on message hover)
// ---------------------------------------------------------------------------
const CopyButton: FC<{ content: string }> = memo(({ content }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        const success = await systemCopyToClipboard(content);
        if (success) {
            setCopied(true);
            triggerHaptic();
            setTimeout(() => setCopied(false), 2000);
        }
    }, [content]);

    return (
        <button
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy content'}
            className={cn(
                'p-1.5 rounded-[8px] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                copied
                    ? 'text-emerald-400 bg-emerald-500/12 ring-1 ring-emerald-500/25 scale-105'
                    : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] active:scale-90',
            )}
        >
            {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} />}
        </button>
    );
});
CopyButton.displayName = 'CopyButton';

// ---------------------------------------------------------------------------
// User-uploaded attachment thumbnail
// ---------------------------------------------------------------------------
const UserAttachment: FC<{ filename: string; url: string }> = memo(
    ({ filename, url }) => {
        const isImage = /\.(png|jpg|jpeg|gif|webp|heic|bmp|svg)$/i.test(filename);
        const safeUrl = sanitizeHref(url);
        const ext = getFileExtension(safeUrl || url, filename).toUpperCase() || (isImage ? 'IMG' : 'DOC');
        const displayName = humanizeFilename(filename);
        const [loaded, setLoaded] = useState(false);
        const [errored, setErrored] = useState(false);

        if (!safeUrl) return null;

        // ── Image Attachment: Hero Layout ──
        if (isImage) {
            return (
                <motion.a
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={SYSTEM.anim.fluid}
                    className="block mt-2 -mx-1 no-underline group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-[14px]"
                    onClick={(e) => e.stopPropagation()}
                    title={`Open ${displayName}`}
                >
                    <div className="rounded-[14px] overflow-hidden ring-1 ring-black/[0.08] transition-all duration-400 ease-out hover:ring-black/[0.14] will-change-transform">
                        {/* ── Image Hero — edge-to-edge, no internal padding ── */}
                        <div className="relative aspect-[16/10] bg-[#E8E8E8] overflow-hidden">
                            {/* Shimmer skeleton */}
                            {!loaded && !errored && (
                                <div className="absolute inset-0 bg-[linear-gradient(110deg,#E0E0E0_30%,#EEEEEE_50%,#E0E0E0_70%)] bg-[length:200%_100%] animate-[shimmer_2s_infinite_linear]" />
                            )}

                            {!errored ? (
                                <img
                                    src={safeUrl}
                                    alt={displayName}
                                    loading="lazy"
                                    onLoad={() => setLoaded(true)}
                                    onError={() => setErrored(true)}
                                    className={cn(
                                        'absolute inset-0 w-full h-full object-cover',
                                        'transition-all duration-500 ease-out',
                                        'group-hover:scale-[1.02] group-hover:brightness-[1.04]',
                                        loaded ? 'opacity-100' : 'opacity-0',
                                    )}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#F0F0F0]">
                                    <ImageIcon size={18} className="text-[#C0C0C0]" strokeWidth={1.5} />
                                    <span className="text-[8px] font-semibold tracking-[0.08em] uppercase text-[#B0B0B0]">
                                        Preview unavailable
                                    </span>
                                </div>
                            )}

                            {/* Subtle vignette — contrast for badges */}
                            {!errored && loaded && (
                                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
                            )}

                            {/* Extension badge — bottom-left, frosted, always visible */}
                            <div className="absolute left-2.5 bottom-2.5 px-2 py-[3px] rounded-[5px] bg-black/55 backdrop-blur-sm text-[7.5px] font-bold tracking-[0.08em] uppercase text-white/90 shadow-sm">
                                {ext}
                            </div>

                            {/* External link — top-right, hover-only */}
                            <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-[7px] bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300 shadow-sm">
                                <ExternalLink size={10} className="text-white/85" />
                            </div>
                        </div>

                        {/* ── Label bar — whisper weight ── */}
                        <div className="px-3 py-[5px] bg-[#F0F0F0]">
                            <span className="text-[10.5px] text-[#999] font-medium tracking-[0.01em] group-hover:text-[#777] transition-colors duration-300">
                                {displayName}
                            </span>
                        </div>
                    </div>
                </motion.a>
            );
        }

        return (
            <motion.a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, scale: 0.97, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={SYSTEM.anim.fluid}
                className={cn(
                    'flex items-center gap-3 mt-2.5 p-3 no-underline group outline-none',
                    'rounded-[14px] bg-[#ECECEC]',
                    'ring-1 ring-black/[0.05]',
                    'hover:bg-[#E4E4E4] hover:ring-black/[0.08]',
                    'transition-all duration-300',
                    'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
                    'hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]',
                    'focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                )}
                onClick={(e) => e.stopPropagation()}
                title={`Open ${displayName}`}
            >
                <div className={cn(
                    'w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0',
                    'transition-colors duration-300',
                    ext === 'PDF'
                        ? 'bg-rose-500/10 group-hover:bg-rose-500/15'
                        : 'bg-black/[0.04] group-hover:bg-black/[0.06]',
                )}>
                    {ext === 'PDF'
                        ? <FileText size={16} className="text-rose-500/80" strokeWidth={1.8} />
                        : <Paperclip size={16} className="text-[#888]" strokeWidth={1.8} />
                    }
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-[#333] font-medium truncate group-hover:text-[#111] transition-colors duration-200">
                        {displayName}
                    </p>
                    <p className="text-[9px] text-[#999] font-medium tracking-[0.04em] uppercase mt-0.5">
                        {ext} Document
                    </p>
                </div>

                <ExternalLink
                    size={12}
                    className="text-[#CCC] group-hover:text-[#888] transition-colors duration-200 shrink-0 mr-0.5"
                />
            </motion.a>
        );
    },
);
UserAttachment.displayName = 'UserAttachment';


// ============================================================================
// §3  INTELLIGENCE ARTIFACTS
// ============================================================================

// ---------------------------------------------------------------------------
// Candidate Verdict Card
// ---------------------------------------------------------------------------
const CandidateVerdict: FC<{
    verdict: 'STRONG MATCH' | 'REVIEW NEEDED' | 'NOT A FIT';
    details?: string;
}> = memo(({ verdict, details }) => {
    const config = useMemo(() => {
        switch (verdict) {
            case 'STRONG MATCH':
                return {
                    dot: 'bg-emerald-500', text: 'text-emerald-500',
                    ring: 'ring-emerald-500/20', bg: 'bg-emerald-500/8',
                    label: 'Proceed', sub: 'Ready for Interview',
                };
            case 'REVIEW NEEDED':
                return {
                    dot: 'bg-amber-500', text: 'text-amber-500',
                    ring: 'ring-amber-500/20', bg: 'bg-amber-500/8',
                    label: 'Review', sub: 'Additional Screening',
                };
            case 'NOT A FIT':
            default:
                return {
                    dot: 'bg-rose-500', text: 'text-rose-500',
                    ring: 'ring-rose-500/20', bg: 'bg-rose-500/8',
                    label: 'Pass', sub: 'Requirements Not Met',
                };
        }
    }, [verdict]);

    return (
        <motion.div
            layout
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SYSTEM.anim.fluid}
            className="my-6 relative overflow-hidden rounded-[18px] bg-[#080809] ring-1 ring-white/[0.06] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)] group select-none isolate"
        >
            {/* Shimmer */}
            <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.02)_45%,transparent_50%)] bg-[length:200%_100%] animate-[shimmer_6s_infinite_linear] pointer-events-none" />

            {/* Header */}
            <div className="px-6 py-3 border-b border-white/[0.04] flex items-center justify-between">
                <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-zinc-600">
                    Candidate Assessment
                </span>
                <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1',
                    config.bg, config.ring,
                )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', config.dot)} />
                    <span className={cn('text-[9px] font-bold tracking-[0.08em] uppercase', config.text)}>
                        {config.label}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="relative p-6 flex items-start gap-5">
                <div className="flex-1 min-w-0">
                    <div className="text-[20px] md:text-[24px] font-semibold text-white tracking-[-0.03em] leading-none">
                        {verdict}
                    </div>
                    {details && (
                        <div className="text-[13px] text-zinc-500 mt-3.5 leading-[1.7] max-w-[90%]">
                            {details}
                        </div>
                    )}
                    <div className={cn('text-[9px] font-bold tracking-[0.1em] uppercase mt-4', config.text)}>
                        {config.sub}
                    </div>
                </div>
                <div className={cn(
                    'w-11 h-11 rounded-full ring-1 flex items-center justify-center shrink-0',
                    config.bg, config.ring,
                )}>
                    {verdict === 'STRONG MATCH' && <Check size={18} className="text-emerald-400" strokeWidth={2.5} />}
                    {verdict === 'REVIEW NEEDED' && <span className="text-amber-400 text-[14px] font-bold">?</span>}
                    {verdict === 'NOT A FIT' && <X size={18} className="text-rose-400" strokeWidth={2.5} />}
                </div>
            </div>
        </motion.div>
    );
});
CandidateVerdict.displayName = 'CandidateVerdict';

// ---------------------------------------------------------------------------
// Assessment HUD (Insight strip)
// ---------------------------------------------------------------------------
const AssessmentHUD: FC<{ content: string; title?: string }> = memo(
    ({ content, title = 'Match Insight' }) => (
        <motion.div
            layout
            initial={{ x: -6, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={SYSTEM.anim.fluid}
            className="my-6 relative overflow-hidden rounded-r-[16px] border-l-[3px] border-l-indigo-500/50 bg-[#080809] ring-1 ring-white/[0.04] shadow-[12px_0_32px_-8px_rgba(99,102,241,0.04)]"
        >
            <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Activity size={11} className="text-indigo-400/50" />
                    <span className="text-[9px] font-bold text-indigo-500/40 uppercase tracking-[0.1em]">
                        {title}
                    </span>
                </div>
                <div className="text-[13.5px] text-zinc-300 leading-[1.75] font-normal">
                    {content}
                </div>
            </div>
        </motion.div>
    ),
);
AssessmentHUD.displayName = 'AssessmentHUD';

// ---------------------------------------------------------------------------
// Rich Response Cards — CandidateCard, PipelineTable, LicensureCard,
// PayPackageCard, CitationFooter
// ---------------------------------------------------------------------------

const CandidateCard: FC<{ data: any }> = memo(({ data }) => {
    const statusKey =
        ['active', 'interested', 'ready'].some(k => (data.status || '').toLowerCase().includes(k)) ? 'emerald' :
        ['submitted', 'interviewing', 'offer'].some(k => (data.status || '').toLowerCase().includes(k)) ? 'blue' :
        ['pending', 'hold', 'review'].some(k => (data.status || '').toLowerCase().includes(k)) ? 'amber' :
        ['declined', 'rejected', 'dnr'].some(k => (data.status || '').toLowerCase().includes(k)) ? 'rose' :
        ['new', 'fresh'].some(k => (data.status || '').toLowerCase().includes(k)) ? 'purple' : 'zinc';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SYSTEM.anim.fluid}
            className="mt-4 rounded-[20px] ring-1 ring-white/[0.06] bg-[#080809] overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]"
        >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-white truncate">{data.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                        {data.specialty && (
                            <span className="text-[11px] text-zinc-500 font-medium">{data.specialty}</span>
                        )}
                        {data.profession && (
                            <>
                                <span className="text-zinc-700">·</span>
                                <span className="text-[11px] text-zinc-500 font-medium">{data.profession}</span>
                            </>
                        )}
                    </div>
                </div>
                <span className={cn(
                    'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border shrink-0',
                    STATUS_STYLES[statusKey],
                )}>
                    {data.status || 'Unknown'}
                </span>
            </div>

            {/* Details */}
            <div className="px-5 pb-4 space-y-2">
                {data.email && (
                    <div className="flex items-center gap-2">
                        <Mail size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400 font-mono truncate">{data.email}</span>
                    </div>
                )}
                {data.phone && (
                    <div className="flex items-center gap-2">
                        <Phone size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400 font-mono">{data.phone}</span>
                    </div>
                )}
                {data.home_state && (
                    <div className="flex items-center gap-2">
                        <MapPin size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400">{data.home_state}</span>
                    </div>
                )}
                {data.recruiter && (
                    <div className="flex items-center gap-2">
                        <Users size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400">{data.recruiter}</span>
                    </div>
                )}

                {/* License chips */}
                {data.licenses?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {data.licenses.map((lic: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded-md ring-1 ring-cyan-500/20 bg-cyan-500/[0.06] text-[10px] text-cyan-400/80 font-medium">
                                {lic}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Nova link */}
            {data.nova_url && (
                <div className="px-5 pb-4">
                    <a
                        href={data.nova_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-3 rounded-[10px] bg-indigo-500/[0.04] ring-1 ring-indigo-500/10 hover:bg-indigo-500/[0.08] hover:ring-indigo-500/20 transition-all duration-300 group"
                    >
                        <div className="w-7 h-7 rounded-[6px] bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/15 transition-colors duration-300">
                            <ExternalLink size={12} className="text-indigo-400" />
                        </div>
                        <span className="text-[11px] text-indigo-300/70 font-medium flex-1 truncate group-hover:text-indigo-300 transition-colors duration-200">
                            View in Nova
                        </span>
                        <ChevronRight size={12} className="text-indigo-500/20 group-hover:text-indigo-400/60 transition-colors duration-200 shrink-0" />
                    </a>
                </div>
            )}
        </motion.div>
    );
});
CandidateCard.displayName = 'CandidateCard';

const PipelineTableCard: FC<{ data: any }> = memo(({ data }) => {
    const columns: string[] = data.columns || [];
    const rows: Array<Record<string, any>> = data.rows || [];
    if (!columns.length || !rows.length) return null;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SYSTEM.anim.fluid}
            className="mt-4 rounded-[20px] ring-1 ring-white/[0.06] bg-[#080809] overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]"
        >
            {/* Title */}
            {data.title && (
                <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-2">
                    <Activity size={11} className="text-zinc-600" />
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
                        {data.title}
                    </span>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-white/[0.02]">
                            {columns.map((col) => (
                                <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {rows.map((row, ri) => (
                            <tr key={ri} className="hover:bg-white/[0.02] transition-colors">
                                {columns.map((col) => {
                                    const val = String(row[col] ?? '');
                                    const lower = val.toLowerCase();
                                    let chip: string | null = null;
                                    if (['active', 'interested', 'ready', 'strong match'].some(k => lower.includes(k))) chip = 'emerald';
                                    else if (['submitted', 'interviewing', 'sourced', 'offer'].some(k => lower.includes(k))) chip = 'blue';
                                    else if (['pending', 'review', 'hold'].some(k => lower.includes(k))) chip = 'amber';
                                    else if (['declined', 'rejected', 'not a fit'].some(k => lower.includes(k))) chip = 'rose';

                                    return (
                                        <td key={col} className="px-4 py-3">
                                            {chip ? (
                                                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_STYLES[chip])}>
                                                    {val}
                                                </span>
                                            ) : (
                                                <span className="text-[12px] text-zinc-300 tabular-nums">{val}</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
});
PipelineTableCard.displayName = 'PipelineTableCard';

const LicensureCard: FC<{ data: any }> = memo(({ data }) => {
    const statusColor =
        data.license_status === 'active' ? 'emerald' :
        data.license_status === 'expired' ? 'rose' :
        data.license_status === 'pending' ? 'amber' : 'zinc';

    const statusLabel =
        data.license_status === 'active' ? 'Active' :
        data.license_status === 'expired' ? 'Expired' :
        data.license_status === 'pending' ? 'Pending Verification' : 'Not Found';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SYSTEM.anim.fluid}
            className="mt-4 rounded-[20px] ring-1 ring-white/[0.06] bg-[#080809] overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]"
        >
            <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Shield size={13} className="text-cyan-400/50" />
                        <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
                            Licensure
                        </span>
                    </div>
                    <span className={cn(
                        'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border',
                        STATUS_STYLES[statusColor],
                    )}>
                        {statusLabel}
                    </span>
                </div>

                <h4 className="text-[14px] font-semibold text-white">{data.candidate_name}</h4>

                <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                        <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">State</span>
                        <span className="text-[13px] text-zinc-300 font-medium">{data.state}</span>
                    </div>
                    <div>
                        <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">Profession</span>
                        <span className="text-[13px] text-zinc-300 font-medium">{data.profession}</span>
                    </div>
                    {data.license_number && (
                        <div>
                            <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">License #</span>
                            <span className="text-[12px] text-zinc-400 font-mono">{data.license_number}</span>
                        </div>
                    )}
                    {data.expiration && (
                        <div>
                            <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">Expires</span>
                            <span className="text-[12px] text-zinc-400 tabular-nums">{data.expiration}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Board verification link */}
            {data.board_url && (
                <div className="px-5 pb-4">
                    <a
                        href={data.board_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 p-3 rounded-[10px] bg-cyan-500/[0.04] ring-1 ring-cyan-500/10 hover:bg-cyan-500/[0.08] hover:ring-cyan-500/20 transition-all duration-300 group"
                    >
                        <div className="w-7 h-7 rounded-[6px] bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors duration-300">
                            <ExternalLink size={12} className="text-cyan-400" />
                        </div>
                        <span className="text-[11px] text-cyan-300/70 font-medium flex-1 truncate group-hover:text-cyan-300 transition-colors duration-200">
                            Verify on State Board
                        </span>
                        <ChevronRight size={12} className="text-cyan-500/20 group-hover:text-cyan-400/60 transition-colors duration-200 shrink-0" />
                    </a>
                </div>
            )}
        </motion.div>
    );
});
LicensureCard.displayName = 'LicensureCard';

const PayPackageCard: FC<{ data: any }> = memo(({ data }) => (
    <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SYSTEM.anim.fluid}
        className="mt-4 rounded-[20px] ring-1 ring-white/[0.06] bg-[#080809] overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]"
    >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-2">
                <DollarSign size={13} className="text-emerald-400/50" />
                <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500">
                    Pay Package
                </span>
            </div>
            <h4 className="text-[14px] font-semibold text-white">{data.facility}</h4>
            <span className="text-[11px] text-zinc-500 font-medium">{data.location} · {data.specialty}</span>
        </div>

        {/* Hero number */}
        <div className="px-5 pb-3">
            <div className="flex items-baseline gap-1">
                <span className="text-[28px] font-bold text-emerald-400 tabular-nums tracking-tight">
                    ${typeof data.gross_weekly === 'number' ? data.gross_weekly.toLocaleString() : data.gross_weekly}
                </span>
                <span className="text-[11px] text-zinc-500 font-medium">/week</span>
            </div>
        </div>

        {/* Breakdown */}
        <div className="px-5 pb-4 space-y-1.5">
            {data.taxable_hourly != null && (
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Taxable Hourly</span>
                    <span className="text-[12px] text-zinc-300 tabular-nums font-medium">${data.taxable_hourly}/hr</span>
                </div>
            )}
            {data.stipend_weekly != null && (
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Stipend</span>
                    <span className="text-[12px] text-zinc-300 tabular-nums font-medium">${data.stipend_weekly}/wk</span>
                </div>
            )}
            {data.housing_weekly != null && (
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Housing</span>
                    <span className="text-[12px] text-zinc-300 tabular-nums font-medium">${data.housing_weekly}/wk</span>
                </div>
            )}
            {data.meals_weekly != null && (
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">M&IE</span>
                    <span className="text-[12px] text-zinc-300 tabular-nums font-medium">${data.meals_weekly}/wk</span>
                </div>
            )}
            {data.hours_per_week && (
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                    <span className="text-[11px] text-zinc-500">Hours/Week</span>
                    <span className="text-[12px] text-zinc-300 tabular-nums font-medium">{data.hours_per_week}</span>
                </div>
            )}
            {data.shift && (
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">Shift</span>
                    <span className="text-[12px] text-zinc-300 font-medium">{data.shift}</span>
                </div>
            )}
        </div>

        {/* Dates */}
        {(data.start_date || data.end_date) && (
            <div className="px-5 pb-4 flex gap-4">
                {data.start_date && (
                    <div>
                        <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">Start</span>
                        <span className="text-[12px] text-zinc-400 tabular-nums">{data.start_date}</span>
                    </div>
                )}
                {data.end_date && (
                    <div>
                        <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">End</span>
                        <span className="text-[12px] text-zinc-400 tabular-nums">{data.end_date}</span>
                    </div>
                )}
            </div>
        )}
    </motion.div>
));
PayPackageCard.displayName = 'PayPackageCard';

const CitationFooter: FC<{ citations: any[] }> = memo(({ citations }) => {
    if (!citations?.length) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-3 pt-3 border-t border-white/[0.04]"
        >
            <div className="flex items-center gap-1.5 mb-2">
                <FileText size={10} className="text-zinc-600" />
                <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-zinc-600">
                    Sources
                </span>
            </div>
            <div className="space-y-1">
                {citations.map((cite: any, i: number) => (
                    <a
                        key={i}
                        href={cite.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 group"
                    >
                        <span className="text-[10px] text-indigo-400/50 font-mono tabular-nums shrink-0">
                            [{cite.index}]
                        </span>
                        <span className="text-[11px] text-zinc-500 group-hover:text-indigo-300/70 transition-colors duration-200 truncate">
                            {cite.label}
                        </span>
                        <ExternalLink size={8} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0" />
                    </a>
                ))}
            </div>
        </motion.div>
    );
});
CitationFooter.displayName = 'CitationFooter';

// ---------------------------------------------------------------------------
// Thinking Pill (status indicator during generation)
// ---------------------------------------------------------------------------
const ThinkingPill: FC<{
    onStop?: () => void;
    status?: 'thinking' | 'streaming' | 'grounding';
}> = memo(({ onStop, status = 'thinking' }) => {
    const [phaseIndex, setPhaseIndex] = useState(0);

    useEffect(() => {
        if (status === 'thinking') {
            const i = setInterval(
                () => setPhaseIndex((p) => (p + 1) % RECRUITING_PHASES.length),
                2200,
            );
            return () => clearInterval(i);
        }
    }, [status]);

    const txt =
        status === 'streaming' ? 'LIVE STREAM'
        : status === 'grounding' ? 'SOURCING'
        : RECRUITING_PHASES[phaseIndex];

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={SYSTEM.anim.fluid}
            className="absolute bottom-[100%] left-1/2 -translate-x-1/2 mb-6 z-30 flex items-center gap-3 px-4 py-2 rounded-full bg-[#060606] ring-1 ring-white/[0.08] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur-xl will-change-transform"
        >
            <OrbitalRadar />
            <AnimatePresence mode="wait">
                <motion.span
                    key={txt}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.2 }}
                    className="text-[10px] font-semibold tracking-[0.08em] uppercase text-zinc-400 min-w-[120px] text-center"
                >
                    {txt}
                </motion.span>
            </AnimatePresence>
            {onStop && (
                <button
                    onClick={onStop}
                    aria-label="Stop Generating"
                    className="ml-1 p-1.5 rounded-full text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.06] transition-all active:scale-90"
                >
                    <Square size={9} fill="currentColor" />
                </button>
            )}
        </motion.div>
    );
});
ThinkingPill.displayName = 'ThinkingPill';

// ---------------------------------------------------------------------------
// Mode Chips (workflow selector)
// ---------------------------------------------------------------------------
const MODE_CHIPS = [
    { label: 'Working Traveler',    context: 'Working Traveler' },
    { label: 'Re-Engaged Traveler', context: 'Re-Engaged Traveler' },
    { label: 'Pay Package Email',   context: 'Pay Package Email' },
    { label: 'Reassignment',        context: 'Internal Reassignment Request' },
    { label: 'Licensing',           context: 'Licensing Request' },
    { label: 'Extension Request',   context: 'Extension Request' },
    { label: 'Screen Resume',       context: 'Screen Resume' },
    { label: 'Reply Mode',          context: 'Reply to Email' },
] as const;

const MODE_CONTEXT_TO_ROUTER_MODE: Record<string, RouterMode> = {
    'Pay Package Email':            'cold_outreach',
    'Internal Reassignment Request': 'batch_reassign',
    'Reply to Email':               'reply_mode',
};

const ModeChips: FC<{ value: string; onChange: (v: string) => void }> = memo(
    ({ value, onChange }) => (
        <div className="flex gap-1.5 overflow-x-auto pb-3 scrollbar-hide px-0.5">
            {MODE_CHIPS.map((chip, index) => {
                const active = value === chip.context;
                return (
                    <motion.button
                        key={chip.label}
                        onClick={() => { triggerHaptic(); onChange(chip.context); }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.025, ...SYSTEM.anim.fluid }}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        className={cn(
                            'flex-shrink-0 px-3 py-2 rounded-[10px] ring-1 transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                            active
                                ? 'bg-indigo-500/10 ring-indigo-500/25 text-indigo-300 shadow-[0_0_16px_-4px_rgba(99,102,241,0.2)]'
                                : 'bg-white/[0.02] ring-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] hover:ring-white/[0.1]',
                        )}
                    >
                        <span className="text-[10px] font-semibold tracking-[0.04em] uppercase whitespace-nowrap">
                            {chip.label}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    ),
);
ModeChips.displayName = 'ModeChips';

// ---------------------------------------------------------------------------
// Post-Draft Contextual Actions
//
// Philosophy: read the draft, know the workflow, surface only the
// 2-3 actions that are the obvious next move. If the draft already
// mentions certs, don't show "Ask for certs." If you're in a pay
// package flow, references and time-off are the natural follow-ups.
//
// The system thinks the next step so the user doesn't have to.
// ---------------------------------------------------------------------------

interface DraftAction {
    readonly label: string;
    readonly query: string;
}

/** All possible follow-up actions with signal detection */
const DRAFT_ACTION_POOL: ReadonlyArray<DraftAction & {
    /** If any of these patterns exist in the body, this action is already covered → skip */
    readonly coveredBy: RegExp;
    /** Workflow modes where this action is most relevant (empty = always eligible) */
    readonly modes: readonly string[];
    /** Priority weight: higher = shown first when eligible */
    readonly weight: number;
}> = [
    {
        label: 'Send over your certs',
        query: 'Add a line asking them to send over their current certifications when they get a chance. Keep it casual — match my tone.',
        coveredBy: /certif|licensure|credential|compact/i,
        modes: ['Pay Package Email', 'Working Traveler', 'Re-Engaged Traveler', 'Extension Request'],
        weight: 90,
    },
    {
        label: 'Any time-off planned?',
        query: 'Add a line asking if they have any time-off requests or vacation planned during this contract. Casual tone.',
        coveredBy: /time.?off|vacation|pto|holiday.*request|time.*away/i,
        modes: ['Pay Package Email', 'Working Traveler', 'Re-Engaged Traveler', 'Extension Request'],
        weight: 85,
    },
    {
        label: 'Heads-up on references',
        query: 'Add a line letting them know our reference team will be reaching out to their references by email and call, and that this manager def favors verified references. Also mention I have a form they can send to their references to speed things up if they want. Keep it natural and helpful.',
        coveredBy: /reference|verification|verify/i,
        modes: ['Pay Package Email', 'Working Traveler', 'Re-Engaged Traveler'],
        weight: 80,
    },
    {
        label: 'Update your Aya profile',
        query: 'Add a line asking them to make sure their Aya app profile is up to date — skills checklist, work history, all that. Keep it casual.',
        coveredBy: /aya.*(?:app|profile|update)|update.*(?:app|profile)|skills?\s*checklist/i,
        modes: ['Pay Package Email', 'Working Traveler', 'Re-Engaged Traveler'],
        weight: 60,
    },
    {
        label: 'Tighten it up',
        query: 'Cut this down. Remove filler and pleasantries. Keep the key info and my natural voice.',
        coveredBy: /(?!x)x/, // never auto-covered — always eligible if body is long
        modes: [],
        weight: 50,
    },
    {
        label: 'Make it warmer',
        query: 'Rewrite to sound warmer and more conversational — like how I actually text. Less corporate, more human.',
        coveredBy: /(?!x)x/, // never auto-covered
        modes: [],
        weight: 40,
    },
];

const MAX_ACTIONS = 3;

/**
 * Select contextual actions based on what the draft says and which workflow is active.
 * Returns at most MAX_ACTIONS items, prioritized by relevance.
 */
function selectContextualActions(
    draftBody: string,
    modeContext: string,
): DraftAction[] {
    const eligible: Array<DraftAction & { weight: number }> = [];

    for (const action of DRAFT_ACTION_POOL) {
        // Skip if the draft already covers this action
        if (action.coveredBy.test(draftBody)) continue;

        // "Tighten it up" only relevant for long drafts
        if (action.label === 'Tighten it up' && draftBody.length < 400) continue;

        // "Make it warmer" only if the draft feels formal (heuristic: no contractions)
        if (action.label === 'Make it warmer') {
            const hasContractions = /\b(?:I'm|I'd|you're|you'll|we're|don't|won't|can't|didn't|that's|it's|here's|let's)\b/.test(draftBody);
            if (hasContractions) continue;
        }

        // Boost weight if the action's preferred modes include the current mode
        let weight = action.weight;
        if (action.modes.length > 0 && modeContext && action.modes.includes(modeContext)) {
            weight += 20;
        }
        // Slight penalty if action has modes but current mode isn't one of them
        if (action.modes.length > 0 && modeContext && !action.modes.includes(modeContext)) {
            weight -= 15;
        }

        eligible.push({ label: action.label, query: action.query, weight });
    }

    // Sort by weight descending, take top N
    eligible.sort((a, b) => b.weight - a.weight);
    return eligible.slice(0, MAX_ACTIONS).map(({ label, query }) => ({ label, query }));
}

const PostDraftActions: FC<{
    onModify: (modifier: string) => void;
    draftBody: string;
    modeContext: string;
}> = memo(({ onModify, draftBody, modeContext }) => {
    const actions = useMemo(
        () => selectContextualActions(draftBody, modeContext),
        [draftBody, modeContext],
    );
    const [fired, setFired] = useState<string | null>(null);
    const fireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
    }, []);

    const handleTap = useCallback((action: DraftAction) => {
        if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
        setFired(action.label);
        triggerHaptic();
        // Brief glow moment before the message fires
        fireTimeoutRef.current = setTimeout(() => {
            onModify(action.query);
            fireTimeoutRef.current = null;
        }, 120);
    }, [onModify]);

    if (actions.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="flex flex-col items-end gap-[6px] mt-4"
        >
            {actions.map((action, idx) => {
                const isPrimary = idx === 0;
                const isFired = fired === action.label;
                const isFading = fired !== null && !isFired;

                return (
                    <motion.button
                        key={action.label}
                        initial={{ opacity: 0, x: 12, scale: 0.96 }}
                        animate={{
                            opacity: isFading ? 0.25 : 1,
                            x: 0,
                            scale: isFired ? 0.97 : 1,
                        }}
                        transition={{
                            delay: isFading ? 0 : 0.75 + idx * 0.1,
                            duration: 0.45,
                            ease: [0.23, 1, 0.32, 1],
                        }}
                        whileHover={{ x: -4, scale: 1.01 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => handleTap(action)}
                        disabled={fired !== null}
                        className={cn(
                            // Ghost user-bubble: identical shape to user messages
                            // (user = rounded-tr-[6px], these match — unsent messages)
                            'px-4 py-2.5 rounded-2xl rounded-tr-[6px]',
                            'transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                            isFired
                                ? 'bg-indigo-500/20 ring-1 ring-indigo-400/35 text-indigo-200 shadow-[0_0_24px_-4px_rgba(99,102,241,0.25)]'
                                : isPrimary
                                    ? 'bg-white/[0.04] ring-1 ring-white/[0.1] text-zinc-300 hover:bg-white/[0.07] hover:ring-white/[0.16] hover:text-white'
                                    : 'bg-white/[0.02] ring-1 ring-white/[0.06] text-zinc-500 hover:bg-white/[0.05] hover:ring-white/[0.12] hover:text-zinc-300',
                        )}
                    >
                        <span className="text-[12.5px] leading-none font-medium">
                            {action.label}
                        </span>
                    </motion.button>
                );
            })}
        </motion.div>
    );
});
PostDraftActions.displayName = 'PostDraftActions';


// ============================================================================
// §4  EMAIL SYSTEM
// ============================================================================

// ---------------------------------------------------------------------------
// EmailBodyRenderer — Production-grade outreach body formatting
//
// Design intent: Structured plain-text with visual hierarchy.
// Detects section headers (Pay Package:, Location:, etc.), bullet lists,
// greeting lines, and sign-offs — renders each with appropriate spacing
// and subtle visual treatment. No markdown. Pure recruiter-ready output.
// ---------------------------------------------------------------------------

/** Regex to detect recruiter email section headers */
const SECTION_HEADER_RX =
    /^(Pay Package|Assignment Details|Assignment Dates?|Facility|Location|Shifts?\s*(?:&\s*Hours)?|To move forward|Next Steps|Benefits|Requirements|Compensation|Schedule|Contract Details|Important Notes?|Details|Overview)\s*:/i;

/** Regex to detect greeting lines */
const GREETING_RX = /^(?:Hi|Hello|Hey|Good (?:morning|afternoon|evening)|Dear)\s/i;

/** Regex to detect sign-off lines (must be near end of email AND short) */
const SIGNOFF_RX = /^(?:Best|Thanks|Thank you|Regards|Sincerely|Cheers|Talk soon|Looking forward|Warm(?:ly|est)|All the best|Kind regards|Respectfully)/i;

/** Secondary sign-off patterns that only match if they're the entire line (short) */
const SIGNOFF_SECONDARY_RX = /^(?:Let me know|Please (?:don'?t hesitate|feel free)|I'?m? (?:here|available|happy to help))(?:[.!,]?\s*$)/i;

/** Regex to detect bullet lines (dash, dot, asterisk, numbered) */
const BULLET_RX = /^(?:[-•·*]\s+|\d{1,2}[.)]\s+)/;

interface EmailBodyLine {
    type: 'greeting' | 'section-header' | 'bullet' | 'signoff' | 'text' | 'blank';
    content: string;
}

/** Parse email body into typed lines for rendering */
function parseEmailBodyLines(body: string): EmailBodyLine[] {
    const rawLines = body.split('\n');
    const result: EmailBodyLine[] = [];

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            // Collapse consecutive blanks
            if (result.length > 0 && result[result.length - 1].type !== 'blank') {
                result.push({ type: 'blank', content: '' });
            }
            continue;
        }

        if (GREETING_RX.test(trimmed) && i < 3) {
            result.push({ type: 'greeting', content: trimmed });
        } else if (SECTION_HEADER_RX.test(trimmed)) {
            result.push({ type: 'section-header', content: trimmed });
        } else if (BULLET_RX.test(trimmed)) {
            result.push({ type: 'bullet', content: trimmed.replace(BULLET_RX, '') });
        } else if (
            i > rawLines.length - 8 &&
            trimmed.length < 80 &&
            (SIGNOFF_RX.test(trimmed) || SIGNOFF_SECONDARY_RX.test(trimmed))
        ) {
            result.push({ type: 'signoff', content: trimmed });
        } else {
            result.push({ type: 'text', content: trimmed });
        }
    }

    // Trim trailing blanks
    while (result.length > 0 && result[result.length - 1].type === 'blank') {
        result.pop();
    }

    return result;
}

/** Regex to detect dollar amounts for inline highlighting */
const DOLLAR_RX = /(\$[\d,]+(?:\.\d{2})?(?:\/(?:wk|week|hr|hour|day|month))?)/g;

/** Check if a section header is pay/compensation related */
const PAY_SECTION_RX = /^(?:Pay Package|Compensation|Benefits|Weekly|Hourly)/i;

/** Render text with inline dollar highlighting */
const HighlightedText: FC<{ text: string; className?: string }> = memo(({ text, className }) => {
    const parts = text.split(DOLLAR_RX);
    if (parts.length === 1) return <span className={className}>{text}</span>;
    return (
        <span className={className}>
            {parts.map((part, i) =>
                part.startsWith('$') && /^\$[\d,]/.test(part)
                    ? <span key={i} className="text-emerald-400/90 font-medium tabular-nums">{part}</span>
                    : <React.Fragment key={i}>{part}</React.Fragment>
            )}
        </span>
    );
});
HighlightedText.displayName = 'HighlightedText';

/** Render parsed email body with visual hierarchy */
const EmailBodyRenderer: FC<{ body: string; signature?: string | null }> = memo(
    ({ body, signature }) => {
        const lines = useMemo(() => parseEmailBodyLines(body), [body]);
        const signatureLines = useMemo(
            () => (signature ? parseEmailBodyLines(signature) : []),
            [signature],
        );

        const renderLine = (line: EmailBodyLine, idx: number, allLines: EmailBodyLine[]) => {
            const nextReal = allLines.slice(idx + 1).find((l) => l.type !== 'blank');
            const isLastBeforeSignoff = nextReal?.type === 'signoff';

            switch (line.type) {
                case 'blank':
                    return <div key={idx} className="h-3.5" />;

                case 'greeting':
                    return (
                        <p key={idx} className="text-[15px] text-zinc-100 leading-[1.6] tracking-[-0.005em] mb-3.5">
                            {line.content}
                        </p>
                    );

                case 'section-header': {
                    const colonIdx = line.content.indexOf(':');
                    const label = colonIdx >= 0 ? line.content.slice(0, colonIdx + 1) : line.content;
                    const value = colonIdx >= 0 ? line.content.slice(colonIdx + 1).trim() : '';
                    const isPay = PAY_SECTION_RX.test(label);
                    return (
                        <div
                            key={idx}
                            className={cn(
                                'mt-5 mb-2.5 first:mt-0 pl-3.5 border-l-2',
                                isPay
                                    ? 'border-emerald-500/25'
                                    : 'border-indigo-500/15',
                            )}
                        >
                            <span className={cn(
                                'text-[9px] font-bold tracking-[0.12em] uppercase',
                                isPay ? 'text-emerald-400/60' : 'text-indigo-400/50',
                            )}>
                                {label}
                            </span>
                            {value && (
                                <HighlightedText
                                    text={value}
                                    className="text-[14px] text-zinc-200 ml-2.5 font-medium"
                                />
                            )}
                        </div>
                    );
                }

                case 'bullet':
                    return (
                        <div key={idx} className="flex items-start gap-3 py-[2px] pl-4">
                            <span className="mt-[9px] w-[3px] h-[3px] rounded-full bg-zinc-600/80 shrink-0" />
                            <HighlightedText
                                text={line.content}
                                className="text-[13.5px] text-[#B4B4B4] leading-[1.7]"
                            />
                        </div>
                    );

                case 'signoff':
                    return (
                        <p
                            key={idx}
                            className={cn(
                                'text-[14px] text-zinc-400 leading-[1.65]',
                                idx > 0 && allLines[idx - 1]?.type !== 'signoff' && 'mt-4',
                            )}
                        >
                            {line.content}
                        </p>
                    );

                case 'text':
                default:
                    return (
                        <p
                            key={idx}
                            className={cn(
                                'text-[14px] text-[#B8B8B8] leading-[1.7]',
                                isLastBeforeSignoff && 'mb-1',
                            )}
                        >
                            <HighlightedText text={line.content} />
                        </p>
                    );
            }
        };

        return (
            <div className="space-y-0.5 font-sans select-text">
                {lines.map((line, idx) => renderLine(line, idx, lines))}
                {signatureLines.length > 0 && (
                    <>
                        <div className="h-5" />
                        <div className="border-t border-white/[0.05] pt-3 opacity-40">
                            {signatureLines.map((line, idx) => renderLine(line, idx, signatureLines))}
                        </div>
                    </>
                )}
            </div>
        );
    },
);
EmailBodyRenderer.displayName = 'EmailBodyRenderer';

// ---------------------------------------------------------------------------
// EmailCard — Production outreach card
// ---------------------------------------------------------------------------
const EmailCard: FC<{
    to?: string;
    cc?: string;
    subject: string;
    body: string;
    signature?: string | null;
}> = memo(({ to, cc = DEFAULT_CC, subject, body, signature }) => {
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const { showToast } = useToast();

    const cleanSubject = useMemo(() => stripMarkdownForEmail(subject), [subject]);
    const cleanBody = useMemo(() => stripMarkdownForEmail(body), [body]);
    const normalizedBody = useMemo(() => normalizeEmailBodyLayout(cleanBody), [cleanBody]);

    const bodyOnly = useMemo(
        () => normalizedBody.replace(/  \n/g, '\n').replace(/^---\s*$/gm, '').trim(),
        [normalizedBody],
    );

    const previewText = useMemo(() => {
        if (!signature) return bodyOnly;
        return `${bodyOnly}\n\n${signature}`;
    }, [bodyOnly, signature]);

    const isLongBody = previewText.length > 600 || previewText.split('\n').length > 15;
    const hiddenLineCount = isLongBody && !isExpanded
        ? Math.max(0, previewText.split('\n').length - 12)
        : 0;

    /** Copy full draft (subject + body) */
    const handleCopyAll = useCallback(async () => {
        const fullDraft = `Subject: ${cleanSubject}\n\n${bodyOnly}`;
        const success = await systemCopyToClipboard(fullDraft);
        if (success) {
            setCopied(true);
            triggerHaptic();
            playDraftReadyCue();
            setTimeout(() => setCopied(false), 2500);
        } else {
            showToast('Clipboard access blocked.');
        }
    }, [cleanSubject, bodyOnly, showToast]);

    /** Open in Outlook / default mail client */
    const handleOpenOutlook = useCallback(() => {
        triggerHaptic();
        playDraftReadyCue();

        const safeTo = extractFirstEmail(to) || '';
        const safeCcList = (cc || '')
            .split(',')
            .map((entry) => extractFirstEmail(entry))
            .filter((entry): entry is string => Boolean(entry))
            .join(',');
        const outlookBody = normalizeBodyForMailto(bodyOnly);
        const safeSubject = encodeURIComponent(cleanSubject);
        const safeBody = encodeURIComponent(outlookBody);
        const safeCc = safeCcList ? `&cc=${encodeURIComponent(safeCcList)}` : '';
        const mailtoLink = `mailto:${safeTo}?subject=${safeSubject}${safeCc}&body=${safeBody}`;

        if (mailtoLink.length > 2000) {
            handleCopyAll();
            showToast('Draft too long for mailto. Copied to clipboard.');
            window.open(`mailto:${safeTo}?subject=${safeSubject}${safeCc}`, '_blank');
        } else {
            window.open(mailtoLink, '_blank');
        }
    }, [to, cc, cleanSubject, bodyOnly, handleCopyAll, showToast]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SYSTEM.anim.fluid, duration: 0.4 }}
            className="rounded-[20px] overflow-hidden bg-[#080809] ring-1 ring-white/[0.06] hover:ring-white/[0.1] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)_inset] transition-[box-shadow] duration-300"
        >
            {/* ── Subject ── */}
            <div className="px-6 pt-5 pb-3">
                <p className="text-[13.5px] font-semibold text-white select-all line-clamp-2 leading-[1.4] tracking-[-0.01em]">
                    {cleanSubject}
                </p>
            </div>

            {/* ── Body ── */}
            <div className="px-6 pb-5 relative">
                <div className={cn(
                    'min-w-0 relative',
                    !isExpanded && isLongBody && 'max-h-[300px] overflow-hidden',
                )}>
                    <EmailBodyRenderer
                        body={bodyOnly}
                        signature={isExpanded || !isLongBody ? signature : undefined}
                    />
                    {!isExpanded && isLongBody && (
                        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#080809] via-[#080809]/80 to-transparent pointer-events-none" />
                    )}
                </div>
                {isLongBody && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 font-medium transition-all duration-200 group/expand"
                    >
                        <ChevronDown
                            size={13}
                            className={cn(
                                'transition-transform duration-200 group-hover/expand:text-indigo-400',
                                isExpanded && 'rotate-180',
                            )}
                        />
                        <span>
                            {isExpanded
                                ? 'Collapse'
                                : `${hiddenLineCount > 0 ? `${hiddenLineCount} more lines` : 'Show full email'}`
                            }
                        </span>
                    </button>
                )}
            </div>

            {/* ── Action Bar ── */}
            <div className="px-4 py-3 border-t border-white/[0.04] flex items-center gap-2">
                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleOpenOutlook}
                    className="flex-1 flex items-center justify-center gap-2.5 h-10 rounded-[12px] bg-indigo-500/12 ring-1 ring-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:ring-indigo-500/30 hover:text-indigo-200 transition-all duration-300 text-[11px] font-semibold tracking-[0.02em] outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                >
                    <Mail size={13} strokeWidth={1.8} /> Open in Outlook
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={handleCopyAll}
                    className={cn(
                        'h-10 w-10 rounded-[12px] flex items-center justify-center transition-all duration-300 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                        copied
                            ? 'bg-emerald-500/12 ring-1 ring-emerald-500/25 text-emerald-400'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] ring-1 ring-transparent hover:ring-white/[0.06]',
                    )}
                    aria-label="Copy draft"
                >
                    {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} />}
                </motion.button>
            </div>
        </motion.div>
    );
});
EmailCard.displayName = 'EmailCard';


// ============================================================================
// §5  INTEL & ACTION PANELS
// ============================================================================

// ---------------------------------------------------------------------------
// Next Steps Panel (structured actions from email contract)
// ---------------------------------------------------------------------------
interface NextStepAction {
    type: 'open_nova' | 'await_docs' | 'await_availability' | 'move_stage' | 'send_email';
    label: string;
    href?: string;
    required?: string[];
    stage?: string;
    enabled_when?: string;
}

const NextStepsPanel: FC<{ steps: NextStepAction[] }> = memo(({ steps }) => {
    if (!steps?.length) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ...SYSTEM.anim.fluid }}
            className="mt-4 rounded-[14px] ring-1 ring-white/[0.06] bg-[#080809] overflow-hidden"
        >
            <div className="px-4 py-2.5 border-b border-white/[0.04]">
                <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-zinc-600">
                    Next Steps
                </span>
            </div>
            <div
                className="max-h-48 overflow-y-auto px-3 py-2.5 space-y-1.5"
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
                {steps.map((step, idx) => {
                    const safeOpenHref = step.type === 'open_nova' ? sanitizeHref(step.href) : null;
                    const safeSendHref = step.type === 'send_email'
                        ? sanitizeHref(step.href, { allowMailto: true })
                        : null;

                    return (
                    <motion.div
                        key={`${step.type}-${idx}`}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08 * idx, ...SYSTEM.anim.fluid }}
                    >
                        {step.type === 'open_nova' && safeOpenHref && (
                            <a
                                href={safeOpenHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => triggerHaptic()}
                                className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-indigo-500/[0.04] ring-1 ring-indigo-500/10 hover:bg-indigo-500/[0.08] hover:ring-indigo-500/18 transition-all duration-300 group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                            >
                                <ExternalLink size={12} className="text-indigo-400/50 shrink-0" />
                                <span className="text-[12px] text-indigo-300/70 font-medium truncate flex-1 group-hover:text-indigo-300 transition-colors duration-200">
                                    {step.label}
                                </span>
                                <ChevronRight size={12} className="text-indigo-500/20 group-hover:text-indigo-400/60 transition-colors duration-200 shrink-0" />
                            </a>
                        )}
                        {step.type === 'send_email' && safeSendHref && (
                            <a
                                href={safeSendHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => { triggerHaptic(); playDraftReadyCue(); }}
                                className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-emerald-500/[0.04] ring-1 ring-emerald-500/10 hover:bg-emerald-500/[0.08] hover:ring-emerald-500/18 transition-all duration-300 group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                            >
                                <Mail size={12} className="text-emerald-400/50 shrink-0" />
                                <span className="text-[12px] text-emerald-300/70 font-medium truncate flex-1 group-hover:text-emerald-300 transition-colors duration-200">
                                    {step.label}
                                </span>
                                <ChevronRight size={12} className="text-emerald-500/20 group-hover:text-emerald-400/60 transition-colors duration-200 shrink-0" />
                            </a>
                        )}
                        {(step.type === 'await_docs' || step.type === 'await_availability') && (
                            <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-amber-500/[0.03] ring-1 ring-amber-500/10">
                                <Activity size={12} className="text-amber-400/60 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                    <span className="text-[12px] text-amber-300/70 font-medium">
                                        {step.label}
                                    </span>
                                    {step.required?.length ? (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {step.required.map((item, i) => (
                                                <span
                                                    key={i}
                                                    className="px-1.5 py-0.5 rounded ring-1 ring-amber-500/15 bg-amber-500/[0.06] text-[9px] font-medium text-amber-400/60"
                                                >
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                        {step.type === 'move_stage' && (
                            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg opacity-50">
                                <Zap size={12} className="text-zinc-600 shrink-0" />
                                <span className="text-[12px] text-zinc-500 truncate flex-1">{step.label}</span>
                                {step.enabled_when && (
                                    <span className="text-[9px] text-zinc-700 font-mono shrink-0">
                                        when: {step.enabled_when}
                                    </span>
                                )}
                            </div>
                        )}
                    </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
});
NextStepsPanel.displayName = 'NextStepsPanel';

// ---------------------------------------------------------------------------
// Intel Panel — Market context (deterministic, no mock data)
// ---------------------------------------------------------------------------
interface IntelData {
    specialty?: string;
    location?: string;
    weeklyPay?: number;
    hourlyRate?: number;
    candidateName?: string;
    novaUrl?: string;
}

const IntelPanel: FC<{ intel: IntelData }> = memo(({ intel }) => {
    if (!intel.specialty && !intel.location && !intel.novaUrl) return null;
    const safeNovaUrl = sanitizeHref(intel.novaUrl);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, ...SYSTEM.anim.fluid }}
            className="mt-4 rounded-[14px] ring-1 ring-white/[0.06] bg-[#080809] overflow-hidden"
        >
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/40" />
                <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-zinc-600">
                    Context
                </span>
            </div>

            {/* Intel Grid */}
            <div className="px-4 py-3 space-y-2.5">
                {/* Nova Profile Link */}
                {safeNovaUrl && (
                    <a
                        href={safeNovaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => triggerHaptic()}
                        className="flex items-center gap-3 p-3 rounded-[10px] bg-indigo-500/[0.04] ring-1 ring-indigo-500/10 hover:bg-indigo-500/[0.08] hover:ring-indigo-500/20 transition-all duration-300 group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                    >
                        <div className="w-8 h-8 rounded-[8px] bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/15 transition-colors duration-300">
                            <Users size={14} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="text-[9px] font-medium tracking-[0.04em] uppercase text-zinc-600 block">Nova Profile</span>
                            <span className="text-[12px] text-indigo-300/80 font-medium truncate block mt-0.5">
                                {intel.candidateName || 'View in Nova'}
                            </span>
                        </div>
                        <ChevronRight size={13} className="text-indigo-500/25 group-hover:text-indigo-400/60 transition-colors duration-200 shrink-0" />
                    </a>
                )}

                {/* Quick Intel Chips */}
                <div className="flex flex-wrap gap-1.5">
                    {intel.specialty && (
                        <span className="px-2 py-0.5 rounded-md ring-1 ring-white/[0.06] bg-white/[0.02] text-[10px] text-zinc-500 font-medium">
                            {intel.specialty}
                        </span>
                    )}
                    {intel.location && (
                        <span className="px-2 py-0.5 rounded-md ring-1 ring-white/[0.06] bg-white/[0.02] text-[10px] text-zinc-500 font-medium">
                            📍 {stripMarkdownForEmail(intel.location)}
                        </span>
                    )}
                    {intel.weeklyPay && (
                        <span className="px-2 py-0.5 rounded-md ring-1 ring-emerald-500/20 bg-emerald-500/[0.06] text-[10px] text-emerald-400/80 font-semibold tabular-nums">
                            ${intel.weeklyPay.toLocaleString()}/wk
                        </span>
                    )}
                    {intel.hourlyRate && (
                        <span className="px-2 py-0.5 rounded-md ring-1 ring-emerald-500/20 bg-emerald-500/[0.06] text-[10px] text-emerald-400/80 font-semibold tabular-nums">
                            ${intel.hourlyRate}/hr
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
});
IntelPanel.displayName = 'IntelPanel';


// ============================================================================
// §6  MESSAGE BUBBLE & TOOL RESULTS
// ============================================================================

// ---------------------------------------------------------------------------
// Email content parser (extracts EmailCard data from message content)
// ---------------------------------------------------------------------------

interface ParsedEmail {
    to?: string;
    cc?: string;
    subject: string;
    body: string;
    signature?: string | null;
    nextSteps?: NextStepAction[];
    intel?: IntelData;
}

/**
 * Extract intel metadata from subject + body for IntelPanel rendering.
 * Deterministic — no mock data, only what's in the content.
 */
function extractIntel(subject: string, body: string, meta?: any): IntelData {
    const intel: IntelData = {};

    if (meta?.candidate?.name) intel.candidateName = meta.candidate.name;
    if (meta?.candidate?.nova_url) intel.novaUrl = meta.candidate.nova_url;

    // Specialty from subject (pattern: "Specialty - Location | ...")
    const subMatch = subject.match(/^([^-|]+?)(?:\s*[-|])/);
    if (subMatch) intel.specialty = subMatch[1].trim();

    // Weekly pay from subject
    const payMatch = subject.match(/\$([0-9,]+)(?:\/wk|\/week)?/i);
    if (payMatch) intel.weeklyPay = parseInt(payMatch[1].replace(/,/g, ''), 10);

    // Location from body
    const locMatch = body.match(/Location:\s*([^\n]+)/i);
    if (locMatch) intel.location = locMatch[1].trim();

    return intel;
}

/**
 * Attempt to parse message content into a structured email.
 * Tries formats in priority order: JSON → Tag → Header → fallback.
 * Returns null if content isn't an email draft.
 */
function parseEmailFromContent(content: string): ParsedEmail | null {
    // Strip <draft> CoT wrapper if present
    const draftMatch = content.match(/<draft>([\s\S]*?)<\/draft>/i);
    const processed = draftMatch ? draftMatch[1].trim() : content;

    // ── Format 1: [EMAIL_DRAFT_JSON]...[/EMAIL_DRAFT_JSON] ──
    const jsonMatch = processed.match(REGEX_EMAIL_DRAFT_JSON);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            const email = parsed.email;
            const draftKind = parsed?.kind || email?.kind;
            if (draftKind === 'email_draft' && email && typeof email === 'object') {
                const split = splitMergedSubjectAndBody(email.subject || '', email.body || '');
                const normalizedBody = normalizeEmailBodyLayout(split.body || '');
                const toEmail = extractFirstEmail(
                    typeof email.to === 'string'
                        ? email.to
                        : (typeof email.to_email === 'string' ? email.to_email : undefined),
                );
                const ccEmail = (Array.isArray(email.cc)
                    ? email.cc[0]
                    : (typeof email.cc === 'string' ? email.cc : DEFAULT_CC)) || DEFAULT_CC;
                const nextStepsRaw = parsed.next_steps ?? parsed.nextSteps;
                const nextSteps = Array.isArray(nextStepsRaw)
                    ? (nextStepsRaw as NextStepAction[])
                    : undefined;
                return {
                    to: toEmail,
                    cc: ccEmail,
                    subject: split.subject || '(No Subject)',
                    body: normalizedBody,
                    signature: email.signature,
                    nextSteps,
                    intel: extractIntel(
                        split.subject || '',
                        normalizedBody,
                        { candidate: { name: email.to_name, nova_url: email.meta?.candidate?.nova_url } },
                    ),
                };
            }
        } catch (e) {
            console.warn('[EmailParser] Failed to parse EMAIL_DRAFT_JSON:', e);
        }
    }

    // ── Format 2: [SUBJECT]...[/SUBJECT] [BODY]...[/BODY] ──
    const tagSubject = processed.match(REGEX_TAG_SUBJECT);
    const tagBody = processed.match(REGEX_TAG_BODY);
    if (tagSubject && tagBody) {
        const split = splitMergedSubjectAndBody(tagSubject[1].trim(), tagBody[1].trim());
        const normalizedBody = normalizeEmailBodyLayout(split.body);
        const rawTo = processed.match(REGEX_EMAIL_TO)?.[1]?.trim();
        const to = extractFirstEmail(rawTo) || extractFirstEmail(processed);
        return {
            to,
            cc: DEFAULT_CC,
            subject: split.subject,
            body: normalizedBody,
            intel: extractIntel(split.subject, normalizedBody),
        };
    }

    // ── Format 3: EMAIL DRAFT header / To: / Subject: lines ──
    const emailMatch = processed.match(REGEX_EMAIL_HEADER);
    const hasFields = REGEX_EMAIL_TO.test(processed) || REGEX_EMAIL_SUBJECT.test(processed);

    if (emailMatch || hasFields) {
        const rawTo = processed.match(REGEX_EMAIL_TO)?.[1]?.trim();
        const toEmail = extractFirstEmail(rawTo);
        const sub = processed.match(REGEX_EMAIL_SUBJECT)?.[1]?.trim() || '';

        let body = '';
        const bodyDelimited = processed.match(REGEX_EMAIL_BODY);
        if (bodyDelimited) {
            body = bodyDelimited[1].trim();
        } else {
            const subjectIdx = processed.search(/Subject:[^\n]*/i);
            if (subjectIdx !== -1) {
                body = processed.slice(subjectIdx).replace(/Subject:[^\n]*\n?/i, '').trim();
                // Strip any remaining metadata lines (CC:, BCC:, From:, Date:) at top of body
                body = body.replace(
                    /^(?:(?:\*\*|__)?(?:To|CC|BCC|From|Date|Sent|Reply-?To):(?:\*\*|__)?\s*[^\n]*\n?)+/i,
                    '',
                ).trim();
            }
        }

        const split = splitMergedSubjectAndBody(sub, body);
        const normalizedBody = normalizeEmailBodyLayout(split.body);
        const recipientEmail = toEmail || extractFirstEmail(processed);

        if (split.subject || recipientEmail) {
            return {
                to: recipientEmail,
                cc: DEFAULT_CC,
                subject: split.subject || '(No Subject)',
                body: normalizedBody,
                intel: extractIntel(split.subject || '', normalizedBody),
            };
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    toolInvocations?: ToolInvocation[];
    onModify?: (modifier: string) => void;
    isLatest?: boolean;
    modeContext?: string;
}

const MessageBubble: FC<MessageBubbleProps> = memo(
    ({ role, content, isStreaming, toolInvocations, onModify, isLatest, modeContext = '' }) => {
        const isUser = role === 'user';
        const hasUserAttachments = useMemo(() => {
            if (!isUser || !content) return false;
            REGEX_ATTACHMENT.lastIndex = 0;
            const result = REGEX_ATTACHMENT.test(content);
            REGEX_ATTACHMENT.lastIndex = 0;
            return result;
        }, [isUser, content]);

        // Detect email draft and extract body for contextual actions (memoized)
        const draftInfo = useMemo(() => {
            if (isUser || isStreaming || !content) return { hasDraft: false, body: '' };
            const hasDraft = (
                REGEX_EMAIL_DRAFT_JSON.test(content) ||
                REGEX_TAG_SUBJECT.test(content) ||
                REGEX_EMAIL_SUBJECT.test(content) ||
                REGEX_EMAIL_HEADER.test(content)
            );
            if (!hasDraft) return { hasDraft: false, body: '' };

            // Extract raw body for action context — lightweight parse
            const parsed = parseEmailFromContent(content);
            return { hasDraft: true, body: parsed?.body || content };
        }, [content, isUser, isStreaming]);

        // Markdown component overrides
        const components: Components = useMemo(() => ({
            p: ({ children }) => (
                <p className={cn(
                    SYSTEM.type.body,
                    isUser ? 'text-[#1a1a1a]' : 'text-[#A1A1AA]',
                    'mb-4 last:mb-0',
                )}>
                    {children}
                </p>
            ),
            strong: ({ children }) => (
                <strong className="font-semibold text-white">{children}</strong>
            ),
            a: ({ href, children }) => {
                const label = flattenChildrenText(children).trim();
                const safeHref = sanitizeHref(String(href || '').trim(), {
                    allowRelative: true,
                    allowMailto: true,
                });
                if (!safeHref) {
                    return <span className="text-zinc-500">{children}</span>;
                }

                // Citation link — [1], [2], etc.
                if (/^\[\d+\]$/.test(label) && safeHref) {
                    return (
                        <sup>
                            <a
                                href={safeHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-indigo-400/60 hover:text-indigo-300 text-[10px] font-mono no-underline transition-colors duration-200"
                                title={safeHref}
                            >
                                {label}
                            </a>
                        </sup>
                    );
                }

                // Nova ID link
                if (REGEX_NOVA_ID.test(label)) {
                    return (
                        <a
                            href={safeHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-indigo-400 font-mono text-[12px] group transition-all duration-200 px-1 py-0.5 rounded-md hover:bg-indigo-500/[0.06]"
                        >
                            {label}
                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        </a>
                    );
                }

                // File attachment
                const clean = stripPaperclip(label);
                if (label.includes('📎') || /\.[a-z0-9]{2,5}$/i.test(clean)) {
                    const ext = getFileExtension(safeHref, label);
                    return IMAGE_EXTENSIONS.has(ext)
                        ? <InlineImageThumbnail href={safeHref} label={label} />
                        : <InlineFilePill href={safeHref} label={label} isPdf={ext === PDF_EXTENSION} />;
                }

                // Standard link
                return (
                    <a
                        href={safeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/20 hover:decoration-indigo-500/40 underline-offset-[3px] transition-all duration-200"
                    >
                        {children}
                    </a>
                );
            },
            ul: ({ children }) => <ul className="space-y-2 mb-4 ml-1">{children}</ul>,
            li: ({ children }) => (
                <li className="flex gap-3 items-start pl-1">
                    <span className="mt-2 w-1 h-1 bg-zinc-700 rounded-full shrink-0" />
                    <span className={SYSTEM.type.body}>{children}</span>
                </li>
            ),
            code: ({ children, className }) =>
                !className
                    ? <code className="px-1.5 py-0.5 bg-white/10 rounded text-[13px] font-mono text-indigo-300">{children}</code>
                    : <code className="block p-4 bg-[#0A0A0B] rounded-lg text-[13px] font-mono text-zinc-300 overflow-x-auto">{children}</code>,
            table: ({ children }) => (
                <div className="my-4 rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.02]">
                    <table className="w-full border-collapse">{children}</table>
                </div>
            ),
            thead: ({ children }) => (
                <thead className="bg-white/[0.03] border-b border-white/[0.06]">{children}</thead>
            ),
            tbody: ({ children }) => (
                <tbody className="divide-y divide-white/[0.04]">{children}</tbody>
            ),
            tr: ({ children }) => (
                <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>
            ),
            th: ({ children }) => (
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    {children}
                </th>
            ),
            td: ({ children }) => {
                const text = flattenChildrenText(children).trim().toLowerCase();
                let styleKey: string | null = null;
                if (['interested', 'active', 'strong match', 'ready'].some((k) => text.includes(k))) styleKey = 'emerald';
                else if (['submitted', 'interviewing', 'sourced', 'offer'].some((k) => text.includes(k))) styleKey = 'blue';
                else if (['pending', 'review', 'hold', 'waitlist'].some((k) => text.includes(k))) styleKey = 'amber';
                else if (['declined', 'rejected', 'not a fit', 'pass'].some((k) => text.includes(k))) styleKey = 'rose';
                else if (['archived', 'withdrawn', 'closed'].some((k) => text.includes(k))) styleKey = 'zinc';
                else if (['new', 'fresh'].some((k) => text.includes(k))) styleKey = 'purple';

                if (styleKey && STATUS_STYLES[styleKey]) {
                    return (
                        <td className="px-4 py-4">
                            <span className={cn(
                                'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border',
                                STATUS_STYLES[styleKey],
                            )}>
                                {flattenChildrenText(children)}
                            </span>
                        </td>
                    );
                }
                return (
                    <td className="px-4 py-4 text-[13px] text-zinc-300 tabular-nums">{children}</td>
                );
            },
        }), [isUser]);

        // Render content — response blocks, email card, or markdown
        const renderContent = useMemo(() => {
            if (!content) return null;
            const sanitizedContent = content.replace(REGEX_CLIENT_MARKERS, '').trim();

            // User message: check for inline attachments
            if (isUser) {
                const attachments: { filename: string; url: string }[] = [];
                let match;
                REGEX_ATTACHMENT.lastIndex = 0;
                while ((match = REGEX_ATTACHMENT.exec(sanitizedContent)) !== null) {
                    const url = match[2] || match[3];
                    if (!url) continue;
                    attachments.push({ filename: match[1].trim(), url });
                }
                if (attachments.length > 0) {
                    // Strip attachment markdown links completely
                    let txt = sanitizedContent.replace(REGEX_ATTACHMENT, '').trim();
                    // Strip any remaining 📎 emoji artifacts
                    txt = txt.replace(/📎\s*/gu, '').trim();
                    // Strip any bare filenames that match known attachment names
                    for (const att of attachments) {
                        // Escape special regex chars in filename
                        const escaped = att.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        txt = txt.replace(new RegExp(escaped, 'g'), '').trim();
                    }
                    // Collapse leftover whitespace/newlines
                    txt = txt.replace(/\n{3,}/g, '\n\n').trim();

                    return (
                        <>
                            {txt && (
                                <p className={cn(SYSTEM.type.body, 'text-[#1a1a1a]', 'mb-1')}>
                                    {txt}
                                </p>
                            )}
                            {attachments.map((a, i) => (
                                <UserAttachment key={i} filename={a.filename} url={a.url} />
                            ))}
                        </>
                    );
                }
            }

            // ── Rich response blocks ──
            const { blocks, prose } = extractResponseBlocks(sanitizedContent);
            if (blocks.length > 0) {
                return (
                    <>
                        {prose && (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                                {prose}
                            </ReactMarkdown>
                        )}
                        {blocks.map((block, i) => {
                            switch (block.kind) {
                                case 'candidate_card': return <CandidateCard key={i} data={block.data} />;
                                case 'pipeline_table': return <PipelineTableCard key={i} data={block.data} />;
                                case 'licensure_card': return <LicensureCard key={i} data={block.data} />;
                                case 'pay_package_card': return <PayPackageCard key={i} data={block.data} />;
                                case 'citation_set': return <CitationFooter key={i} citations={Array.isArray(block.data) ? block.data : []} />;
                                default: return null;
                            }
                        })}
                    </>
                );
            }

            // ── Legacy: email parsing ──
            const email = parseEmailFromContent(sanitizedContent);
            if (email) {
                return (
                    <>
                        <EmailCard
                            to={email.to}
                            cc={email.cc}
                            subject={email.subject}
                            body={email.body}
                            signature={email.signature}
                        />
                        {email.nextSteps && <NextStepsPanel steps={email.nextSteps} />}
                        {email.intel && <IntelPanel intel={email.intel} />}
                    </>
                );
            }

            // ── Legacy: verdict card ──
            const verdictMatch = sanitizedContent.match(REGEX_VERDICT);
            if (verdictMatch) {
                return (
                    <CandidateVerdict
                        verdict={verdictMatch[1].toUpperCase() as any}
                        details={sanitizedContent.replace(verdictMatch[0], '').trim()}
                    />
                );
            }

            // ── Legacy: insight HUD ──
            const insightMatch = sanitizedContent.match(REGEX_INSIGHT);
            if (insightMatch) {
                return <AssessmentHUD content={insightMatch[1].trim()} />;
            }

            // Default: render as markdown
            return (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {sanitizedContent}
                </ReactMarkdown>
            );
        }, [content, isUser, components]);

        return (
            <motion.div
                layout="position"
                initial={{ opacity: 0, y: 16, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ ...SYSTEM.anim.fluid, duration: 0.35 }}
                className={cn(
                    'flex flex-col mb-8 w-full relative group isolate',
                    isUser ? 'items-end' : 'items-start',
                )}
            >
                {/* Assistant label */}
                {!isUser && (content || isStreaming) && (
                    <div className="flex items-center gap-2 mb-2.5 ml-0.5">
                        <div className="w-1.5 h-1.5 bg-indigo-500/50 rounded-full animate-pulse" />
                        <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-zinc-600">
                            Command Center
                        </span>
                    </div>
                )}

                {/* Bubble */}
                <div className={cn(
                    'relative max-w-[96%] sm:max-w-[92%] md:max-w-[88%] overflow-hidden',
                    isUser
                        ? cn(
                            'bg-[#F5F5F5] text-black rounded-[20px] rounded-tr-[6px]',
                            'shadow-[0_1px_6px_rgba(0,0,0,0.06),0_4px_16px_-4px_rgba(0,0,0,0.1)]',
                            hasUserAttachments ? 'px-3 pt-3.5 pb-1.5' : 'px-5 py-3.5',
                        )
                        : 'bg-transparent text-white px-0',
                )}>
                    <div className={cn('prose prose-invert max-w-none overflow-hidden break-words', isUser && 'prose-p:text-black/85')} style={{ overflowWrap: 'anywhere' }}>
                        {renderContent}
                    </div>
                    {isStreaming && !content && (
                        <div className="flex items-center gap-2.5 py-1">
                            <OrbitalRadar />
                            <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-zinc-500">
                                Processing…
                            </span>
                        </div>
                    )}
                    {!isUser && !isStreaming && content && (
                        <div className="absolute -right-8 top-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 delay-75">
                            <CopyButton content={content} />
                        </div>
                    )}
                </div>

                {/* Tool Results */}
                {toolInvocations?.map((tool, idx) => (
                    <ToolResultCard
                        key={tool.toolCallId || idx}
                        toolName={tool.toolName}
                        result={tool.result}
                        state={tool.state}
                    />
                ))}

                {/* Contextual next-step actions */}
                {draftInfo.hasDraft && isLatest && onModify && (
                    <PostDraftActions
                        onModify={onModify}
                        draftBody={draftInfo.body}
                        modeContext={modeContext}
                    />
                )}
            </motion.div>
        );
    },
);
MessageBubble.displayName = 'MessageBubble';

// ---------------------------------------------------------------------------
// Tool Result Card
// ---------------------------------------------------------------------------
const ToolResultCard: FC<{
    toolName: string;
    result: any;
    state: string;
}> = memo(({ toolName, result, state }) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const isComplete = state === 'result';

    const displayName = useMemo(
        () =>
            toolName
                .replace(/_/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .trim()
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' '),
        [toolName],
    );

    const handleCopyResult = useCallback(async () => {
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        const success = await systemCopyToClipboard(text);
        if (success) {
            setCopied(true);
            triggerHaptic();
            setTimeout(() => setCopied(false), 2000);
        }
    }, [result]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SYSTEM.anim.fluid}
            className="rounded-[14px] overflow-hidden ring-1 ring-white/[0.06] bg-[#080809]"
        >
            <button
                onClick={() => isComplete && setExpanded(!expanded)}
                disabled={!isComplete}
                className={cn(
                    'w-full px-4 py-3 flex items-center justify-between text-left transition-all duration-200',
                    isComplete && 'hover:bg-white/[0.02] cursor-pointer',
                )}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500',
                        isComplete ? 'bg-emerald-500' : 'bg-zinc-600 animate-pulse',
                    )} />
                    <span className="text-[11px] font-semibold tracking-[0.04em] text-zinc-400">
                        {displayName}
                    </span>
                </div>
                {!isComplete
                    ? <OrbitalRadar />
                    : <ChevronRight size={13} className={cn('text-zinc-600 transition-transform duration-300 ease-out', expanded && 'rotate-90')} />
                }
            </button>
            <AnimatePresence>
                {expanded && isComplete && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 border-t border-white/[0.04]">
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={handleCopyResult}
                                    className={cn(
                                        'text-[10px] font-medium flex items-center gap-1.5 transition-all duration-200',
                                        copied
                                            ? 'text-emerald-400'
                                            : 'text-zinc-600 hover:text-zinc-300',
                                    )}
                                >
                                    {copied ? <Check size={11} /> : <Copy size={11} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <pre className="text-[11px] font-mono text-zinc-500 overflow-x-auto pt-1 whitespace-pre-wrap leading-relaxed">
                                {JSON.stringify(result, null, 2)}
                            </pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});
ToolResultCard.displayName = 'ToolResultCard';


// ============================================================================
// §7  INPUT DECK
// ============================================================================

interface InputDeckProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    isProcessing: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    attachments: Attachment[];
    onRemoveAttachment: (id: string) => void;
    isDragActive: boolean;
    isUploading: boolean;
    dragHandlers: DragHandlerProps;
    handlePaste: (e: ClipboardEvent) => void;
    triggerFileSelect: () => void;
    captureScreenshot: () => void;
    isCaptureSupported: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    onFilesSelected: (files: FileList | null) => void;
}

const InputDeck: FC<InputDeckProps> = memo(({
    value, onChange, onSend, onStop, isProcessing, inputRef,
    attachments, onRemoveAttachment, isDragActive, isUploading,
    dragHandlers, handlePaste, triggerFileSelect, captureScreenshot,
    isCaptureSupported, fileInputRef, onFilesSelected,
}) => {
    useAutoResizeTextArea(inputRef, value);
    const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

    const handleKeyDown = (e: ReactKeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if ((value.trim() || attachments.length > 0) && !isUploading) onSend();
        }
        if (e.key === 'Escape' && isProcessing) {
            e.preventDefault();
            onStop();
        }
    };

    const canSend = (!!value.trim() || attachments.length > 0) && !isUploading;

    // Close lightbox on Escape
    useEffect(() => {
        if (!lightboxImage) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightboxImage(null);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [lightboxImage]);

    return (
        <>
            {/* ── Lightbox Modal ── */}
            <AnimatePresence>
                {lightboxImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-8"
                        onClick={() => setLightboxImage(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="relative max-w-[90vw] max-h-[90vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={lightboxImage.url}
                                alt={lightboxImage.name}
                                className="max-w-full max-h-[85vh] rounded-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] object-contain"
                            />
                            <div className="absolute -bottom-12 left-0 right-0 text-center text-[12px] text-zinc-500 truncate px-4 font-medium">
                                {lightboxImage.name}
                            </div>
                            <button
                                onClick={() => setLightboxImage(null)}
                                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-800/90 hover:bg-zinc-700 ring-1 ring-white/[0.1] text-white flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110"
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Input Container ── */}
            <motion.div
                layout
                className={cn(
                    'flex flex-col p-1.5 relative overflow-hidden transition-all duration-300',
                    'will-change-transform backdrop-blur-[40px] saturate-[180%]',
                    'bg-[#060606]/80 shadow-[0_-4px_40px_-8px_rgba(0,0,0,0.5)]',
                    SYSTEM.geo.input,
                    'ring-1 ring-white/[0.06]',
                    'focus-within:ring-indigo-500/25',
                    isDragActive && 'ring-indigo-500/40 scale-[1.005]',
                )}
                transition={SYSTEM.anim.fluid}
                {...dragHandlers}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                        onFilesSelected(e.target.files);
                        e.target.value = '';
                    }}
                />

                {/* Attachment Preview Strip */}
                <AnimatePresence>
                    {attachments.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-2 pt-2"
                        >
                            <div className="mb-2 px-1 flex items-center justify-between">
                                <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-zinc-600">
                                    {attachments.length} File{attachments.length > 1 ? 's' : ''}
                                </span>
                                {isUploading && (
                                    <div className="flex items-center gap-1.5">
                                        <Loader2 size={9} className="animate-spin text-zinc-500" />
                                        <span className="text-[9px] text-zinc-600">Uploading</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {attachments.map((att) => {
                                    const ext = getFileExtension(att.publicUrl || undefined, att.fileName || undefined);
                                    return (
                                        <div key={att.id} className="relative group flex-shrink-0">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onRemoveAttachment(att.id); }}
                                                className="absolute -top-1 -right-1 z-20 w-5 h-5 rounded-full bg-zinc-900/90 border border-white/15 text-zinc-200 hover:bg-zinc-800 flex items-center justify-center transition-colors"
                                                aria-label="Remove attachment"
                                            >
                                                <X size={10} />
                                            </button>
                                            <button
                                                onClick={() => att.previewUrl && setLightboxImage({ url: att.previewUrl, name: att.fileName || 'Attachment' })}
                                                disabled={!att.previewUrl}
                                                className={cn(
                                                    'relative w-[72px] h-[72px] rounded-[14px] overflow-hidden bg-zinc-900/80 ring-1 transition-all duration-200',
                                                    att.skippedAnalysis ? 'ring-amber-500/30' : 'ring-white/[0.1] hover:ring-white/[0.18]',
                                                    att.previewUrl ? 'cursor-zoom-in' : 'cursor-default',
                                                )}
                                            >
                                                {att.previewUrl
                                                    ? <img src={att.previewUrl} className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" alt={att.fileName || 'Attachment'} />
                                                    : <div className="w-full h-full flex items-center justify-center"><FileText size={20} className="text-zinc-600" /></div>
                                                }
                                                {att.isUploading && (
                                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                                                        <Loader2 size={14} className="animate-spin text-zinc-200" />
                                                    </div>
                                                )}
                                                <div className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-[5px] bg-black/75 ring-1 ring-white/[0.08] text-[7px] font-bold tracking-[0.04em] uppercase text-zinc-300">
                                                    {att.skippedAnalysis ? 'Link' : (ext || 'img')}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Input Row */}
                <div className="flex items-end gap-2">
                    <button
                        onClick={triggerFileSelect}
                        disabled={isProcessing}
                        className="p-3.5 min-h-[48px] min-w-[48px] rounded-[18px] transition-colors text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-50"
                        aria-label="Attach"
                    >
                        <Paperclip size={18} strokeWidth={1.5} />
                    </button>
                    {isCaptureSupported && (
                        <button
                            onClick={captureScreenshot}
                            disabled={isProcessing}
                            className="p-3.5 min-h-[48px] min-w-[48px] rounded-[18px] transition-colors text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-50"
                            aria-label="Take Screenshot"
                            title="Take screenshot"
                        >
                            <Camera size={18} strokeWidth={1.5} />
                        </button>
                    )}
                    <textarea
                        ref={inputRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={isDragActive ? 'Drop files here...' : 'Message Command Center...'}
                        rows={1}
                        disabled={isProcessing}
                        className={cn(
                            'flex-1 bg-transparent border-none outline-none resize-none py-4 min-h-[52px] max-h-[160px]',
                            SYSTEM.type.body,
                            'text-white placeholder:text-zinc-500 disabled:opacity-50',
                            isDragActive && 'placeholder:text-indigo-400',
                        )}
                    />
                    <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => (isProcessing ? onStop() : onSend())}
                        disabled={!isProcessing && !canSend}
                        className={cn(
                            'p-3 min-h-[48px] min-w-[48px] rounded-[18px] transition-all duration-300',
                            isProcessing
                                ? 'bg-white text-black ring-2 ring-white/20'
                                : canSend
                                    ? 'bg-white text-black shadow-[0_2px_12px_-2px_rgba(255,255,255,0.15)]'
                                    : 'bg-white/[0.04] text-zinc-700 cursor-not-allowed',
                        )}
                    >
                        {isProcessing
                            ? <Square size={16} className="animate-pulse" />
                            : isUploading
                                ? <Loader2 size={18} className="animate-spin" />
                                : <ArrowUp size={18} strokeWidth={2.5} />
                        }
                    </motion.button>
                </div>

                {/* Drag Overlay */}
                <AnimatePresence>
                    {isDragActive && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-indigo-500/[0.04] ring-2 ring-inset ring-indigo-500/25 rounded-[24px] pointer-events-none flex items-center justify-center backdrop-blur-sm"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                                    <Paperclip size={16} className="text-indigo-400" />
                                </div>
                                <span className="text-[12px] font-medium text-indigo-300">Drop to attach</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </>
    );
});
InputDeck.displayName = 'InputDeck';


// ============================================================================
// §8  SHELL (Error Boundary, Layout, Scroll)
// ============================================================================

class ChatErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[CommandCenter] Error:', error, info);
    }

    private handleRetry = () => {
        this.setState({ hasError: false });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed bottom-8 right-8 z-50 p-6 bg-rose-500/[0.06] ring-1 ring-rose-500/15 rounded-2xl backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-rose-500 rounded-full" />
                        <span className="text-rose-400 text-sm font-medium">
                            Command Center error.
                        </span>
                        <button
                            onClick={this.handleRetry}
                            aria-label="Retry"
                            className="ml-2 px-3 py-1 text-[10px] font-semibold tracking-wide uppercase text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg ring-1 ring-rose-500/20 transition-all duration-200"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// ---------------------------------------------------------------------------
// Inner Command Center
// ---------------------------------------------------------------------------

const InnerCommandCenter: FC<{
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
}> = ({ isOpen, setIsOpen }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const { workspaceMode, setWorkspaceMode } = useLayout();
    const [inputValue, setInputValue] = useState('');
    const [modeContext, setModeContext] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const { showToast } = useToast();

    const {
        containerRef: scrollRef,
        contentRef,
        isPinned,
        scrollToBottomNow,
    } = usePinnedScroll({ bottomThresholdPx: 100 });

    // Focus input when panel opens (the UI should anticipate intent)
    useEffect(() => {
        if (isOpen && !isMinimized) {
            const raf = requestAnimationFrame(() => inputRef.current?.focus());
            return () => cancelAnimationFrame(raf);
        }
    }, [isOpen, isMinimized]);
    // Mobile detection
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 768px)');
        const update = () => setIsMobile(mq.matches);
        update();
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', update);
        } else {
            mq.addListener(update);
        }
        return () => {
            if (typeof mq.removeEventListener === 'function') {
                mq.removeEventListener('change', update);
            } else {
                mq.removeListener(update);
            }
        };
    }, []);

    // Virtual keyboard offset (mobile)
    useEffect(() => {
        if (!isMobile || typeof window === 'undefined') return;
        const vv = window.visualViewport;
        if (!vv) return;
        let raf = 0;
        const update = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
                setKeyboardOffset(offset);
            });
        };
        update();
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
        };
    }, [isMobile]);

    // Scroll to bottom when keyboard opens
    const keyboardWasOpenRef = useRef(false);
    useEffect(() => {
        if (!isMobile) return;
        const isKbOpen = keyboardOffset > 0;
        if (isKbOpen && !keyboardWasOpenRef.current) {
            scrollToBottomNow();
        }
        keyboardWasOpenRef.current = isKbOpen;
    }, [isMobile, keyboardOffset, scrollToBottomNow]);

    const isKeyboardOpen = isMobile && keyboardOffset > 0;

    // Chat hook
    const {
        messages, isLoading, isStreaming, error, sendMessage, clearChat, stop,
    } = useCommandCenterChat({
        onToolCall: useCallback((toolName: string, args: any) => {
            if (toolName === 'set_ui_state') {
                window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: args }));
            }
            if (['add_prospect', 'update_negotiation', 'create_follow_up'].includes(toolName)) {
                window.dispatchEvent(new CustomEvent('refresh_dashboard'));
            }
        }, []),
    });

    // File upload hook
    const {
        attachments, isDragActive, isUploading, addFiles, captureScreenshot,
        isCaptureSupported, removeFile, clearAll: clearAttachments,
        dragHandlers, handlePaste, fileInputRef, triggerFileSelect, totalPayloadSize,
    } = useFileUpload({
        onUploadError: (err, file) => {
            console.error(`Upload error: ${file.name}`, err);
            showToast(`Upload failed: ${file.name}`);
        },
    });

    // Document-level paste capture (single paste target, prevents duplicates)
    useEffect(() => {
        if (!isOpen) return;
        const onPasteCapture = (e: Event) => {
            const clipboardEvent = e as globalThis.ClipboardEvent;
            const items = clipboardEvent.clipboardData?.items;
            if (!items) return;

            const target = clipboardEvent.target as HTMLElement | null;
            const targetTag = target?.tagName?.toLowerCase() || '';
            const targetIsEditable =
                targetTag === 'textarea' ||
                (targetTag === 'input' && (target as HTMLInputElement).type === 'text') ||
                Boolean(target?.isContentEditable);
            if (targetIsEditable) return;

            const hasImage = Array.from(items).some((i) => i.type?.startsWith('image/'));
            if (!hasImage) return;

            clipboardEvent.preventDefault();
            clipboardEvent.stopPropagation();
            handlePaste(clipboardEvent as unknown as React.ClipboardEvent);
        };

        document.addEventListener('paste', onPasteCapture, true);
        return () => document.removeEventListener('paste', onPasteCapture, true);
    }, [isOpen, handlePaste]);

    // Stable history (frozen during streaming) + isolated streaming message
    const stableHistory = useMemo(() => {
        const endIndex = isStreaming ? Math.max(0, messages.length - 1) : messages.length;
        return messages.slice(0, endIndex).map((msg) => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content || '',
            toolInvocations: msg.toolInvocations as ToolInvocation[],
        }));
    }, [messages, isStreaming]);

    const streamingMessage = isStreaming && messages.length > 0
        ? messages[messages.length - 1]
        : null;

    // Send handler with 413 payload guard
    const handleSend = useCallback(async (query?: string) => {
        const text = query ?? inputValue.trim();
        if ((!text && attachments.length === 0) || isLoading || isUploading) return;

        let safeFileAttachments = undefined;
        const linkAttachments = attachments
            .filter((a) =>
                a.publicUrl &&
                a.mimeType?.startsWith('image/') &&
                (a.skippedAnalysis || !a.base64Data || totalPayloadSize > MAX_PAYLOAD_BYTES),
            )
            .map((a) => ({ url: a.publicUrl!, mimeType: a.mimeType, fileName: a.fileName }));

        if (totalPayloadSize > MAX_PAYLOAD_BYTES) {
            const mb = (totalPayloadSize / (1024 * 1024)).toFixed(1);
            showToast(`Payload large (${mb}MB). Sending files as links only.`);
        } else {
            safeFileAttachments = attachments
                .filter((a) => a.base64Data && !a.skippedAnalysis)
                .map((a) => ({ base64: a.base64Data!, mimeType: a.mimeType, fileName: a.fileName }));
            if (safeFileAttachments.length === 0) safeFileAttachments = undefined;
        }

        let msg = text;
        if (attachments.length > 0) {
            const links = attachments
                .flatMap((a) => {
                    const safePublicUrl = sanitizeHref(a.publicUrl);
                    if (!safePublicUrl) return [];
                    const status = a.skippedAnalysis || totalPayloadSize > MAX_PAYLOAD_BYTES ? ' (Link Only)' : '';
                    const safeLabel = escapeMarkdownLinkLabel(a.fileName || 'Attachment');
                    const safeTarget = toMarkdownLinkTarget(safePublicUrl);
                    return [`[📎 ${safeLabel}](${safeTarget})${status}`];
                })
                .join('\n');
            if (links) msg = text ? `${text}\n\n${links}` : `Analyze:\n\n${links}`;
        }

        const routerMode: RouterMode = MODE_CONTEXT_TO_ROUTER_MODE[modeContext] ?? 'default';
        const modeLocked = routerMode !== 'default';

        await sendMessage(msg, safeFileAttachments, {
            systemContext: modeContext,
            mode: routerMode,
            modeLocked,
            attachmentLinks: linkAttachments,
            onAccepted: () => {
                setInputValue('');
                clearAttachments();
                scrollToBottomNow();
                triggerHaptic();
                requestAnimationFrame(() => inputRef.current?.focus());
            },
        });
    }, [inputValue, attachments, isLoading, isUploading, sendMessage, clearAttachments, showToast, totalPayloadSize, modeContext, scrollToBottomNow]);

    // Container sizing
    const containerStyle = useMemo(() => {
        if (isMinimized) return { height: 48, width: 200, bottom: 32, right: 32, borderRadius: 9999 };
        if (isMobile) return { height: '100dvh', width: '100%', bottom: 0, right: 0, borderRadius: 0 };
        if (workspaceMode === 'full') return { height: '100dvh', width: '100%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        if (workspaceMode === 'split') return { height: '100dvh', width: '50%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        return { height: 'min(840px, 90dvh)', width: 460, bottom: 32, right: 32, borderRadius: 28 };
    }, [isMinimized, isMobile, workspaceMode]);

    // ── Closed state ──
    if (!isOpen) {
        return (
            <motion.button
                onClick={() => setIsOpen(true)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className={cn(
                    'fixed z-50 flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#0A0A0B] ring-1 ring-white/[0.08] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)] hover:ring-white/[0.14] transition-all duration-200',
                    isMobile
                        ? 'left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] justify-center'
                        : 'bottom-8 right-8',
                )}
                aria-label="Open Chat"
            >
                <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
                <span className="text-[12px] font-semibold text-white tracking-[-0.01em]">Command Center</span>
            </motion.button>
        );
    }

    // ── Minimized state ──
    if (isMinimized) {
        return (
            <motion.button
                layoutId="chat"
                onClick={() => setIsMinimized(false)}
                className={cn(
                    'fixed z-50 flex items-center gap-2.5 px-5 py-2.5 rounded-full shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.08] bg-[#0A0A0B]/95 backdrop-blur-xl hover:ring-white/[0.14] transition-all duration-200',
                    isMobile
                        ? 'left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] justify-center'
                        : '',
                )}
                style={isMobile ? undefined : { bottom: 32, right: 32 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                aria-label="Expand"
            >
                {isLoading && <OrbitalRadar />}
                <span className="text-[12px] font-semibold text-white tracking-[-0.01em]">
                    {isLoading ? 'Working…' : 'Command Center'}
                </span>
            </motion.button>
        );
    }

    // ── Full panel ──
    return (
        <LayoutGroup>
            <motion.div
                layoutId="chat"
                className={cn(
                    'fixed z-50 flex flex-col overflow-hidden isolate',
                    'ring-1 ring-white/[0.06]',
                    'shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.02)_inset]',
                    'bg-[#030303]',
                )}
                style={{ ...containerStyle, willChange: 'transform' }}
            >
                <FilmGrain />

                {/* ── Header ── */}
                <header
                    className={cn(
                        'flex items-center justify-between px-5 sm:px-8 shrink-0 z-20 select-none',
                        'backdrop-blur-[40px] saturate-[180%] bg-[#050505]/70',
                        'border-b border-white/[0.06] transition-[padding] duration-150 ease-out',
                        isKeyboardOpen
                            ? 'pt-[calc(env(safe-area-inset-top)+4px)] pb-1'
                            : 'pt-[calc(env(safe-area-inset-top)+12px)] sm:pt-5 pb-2.5 sm:pb-2',
                    )}
                >
                    <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-[6px] bg-indigo-500/10 flex items-center justify-center">
                            <Zap size={11} className="text-indigo-500" />
                        </div>
                        <span className="text-[13px] font-semibold text-white tracking-[-0.02em]">
                            Command Center
                        </span>
                        <span className="text-[9px] font-medium text-zinc-700/60 tracking-[0.06em] uppercase">
                            Weissach
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {(messages.length > 0 || attachments.length > 0) && (
                            <button
                                onClick={() => { clearChat(); clearAttachments(); setModeContext(''); }}
                                className="px-2.5 py-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/8 rounded-[8px] transition-all duration-300 text-[9px] font-bold tracking-[0.06em] uppercase"
                            >
                                Clear
                            </button>
                        )}
                        <button
                            onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')}
                            className={cn('p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-all duration-200', isMobile && 'hidden')}
                            aria-label={workspaceMode === 'floating' ? 'Expand to split view' : 'Float panel'}
                        >
                            {workspaceMode === 'floating' ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                        </button>
                        {workspaceMode === 'floating' && (
                            <button
                                onClick={() => setIsMinimized(true)}
                                className={cn('p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-all duration-200', isMobile && 'hidden')}
                                aria-label="Minimize to pill"
                            >
                                <Minimize2 size={14} />
                            </button>
                        )}
                        <button
                            onClick={() => { setIsOpen(false); setWorkspaceMode('floating'); }}
                            className="p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition-all duration-200"
                            aria-label="Close panel"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </header>

                {/* ── Scroll Area ── */}
                <div
                    ref={scrollRef}
                    className="relative flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pt-3 sm:pt-4 pb-40 sm:pb-44 scroll-smooth no-scrollbar z-10"
                    style={isMobile ? { paddingBottom: 220 + keyboardOffset } : undefined}
                >
                    <div ref={contentRef}>
                        <AnimatePresence mode="popLayout">
                            {stableHistory.length === 0 && !streamingMessage ? (
                                <motion.div
                                    key="empty-state"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="h-full flex flex-col items-center justify-center text-center pt-20"
                                >
                                    <motion.div
                                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                        className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 mb-6"
                                    />
                                    <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-zinc-600">
                                        Ready
                                    </p>
                                    <p className="text-[13px] text-zinc-700 mt-1.5 max-w-[240px] leading-relaxed">
                                        Select a mode or type a message to begin.
                                    </p>

                                    {/* Quick Workflow Links */}
                                    <div className="flex flex-wrap items-center justify-center gap-2 mt-8 max-w-[320px]">
                                        {[
                                            { label: 'Nova', icon: Users, href: 'https://nova.ayahealthcare.com/#/recruiting/search-all-candidates', color: 'text-indigo-400/40', hoverColor: 'group-hover:text-indigo-400/70' },
                                            { label: 'Outlook', icon: Mail, href: 'https://outlook.office365.com/mail', color: 'text-blue-400/40', hoverColor: 'group-hover:text-blue-400/70' },
                                            { label: 'RingCentral', icon: Phone, href: 'rcapp://r', color: 'text-orange-400/40', hoverColor: 'group-hover:text-orange-400/70' },
                                            { label: 'Teams', icon: MessageSquare, href: 'msteams://', color: 'text-violet-400/40', hoverColor: 'group-hover:text-violet-400/70' },
                                            { label: 'Pipeline', icon: Activity, href: '/prospects', color: 'text-emerald-400/40', hoverColor: 'group-hover:text-emerald-400/70' },
                                        ].map((link) => (
                                            <a
                                                key={link.label}
                                                href={link.href}
                                                target={link.href.startsWith('http') ? '_blank' : undefined}
                                                rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                                className={cn(
                                                    'group flex items-center gap-1.5 px-3.5 py-2 rounded-lg ring-1 ring-white/[0.04] bg-white/[0.01] min-h-[36px]',
                                                    'hover:bg-white/[0.03] hover:ring-white/[0.08] transition-all duration-300',
                                                    'outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                                                )}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <link.icon size={10} className={cn(link.color, link.hoverColor, 'transition-colors duration-200')} />
                                                <span className="text-[10px] font-medium text-zinc-600 group-hover:text-zinc-400 transition-colors duration-200">{link.label}</span>
                                            </a>
                                        ))}
                                    </div>

                                    {/* Pulse Grid */}
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_50%_40%_at_50%_30%,#000_60%,transparent_100%)] pointer-events-none" />
                                </motion.div>
                            ) : (
                                <React.Fragment key="messages">
                                    {stableHistory.map((msg, idx) => (
                                        <MessageBubble
                                            key={msg.id}
                                            role={msg.role}
                                            content={msg.content}
                                            isStreaming={false}
                                            toolInvocations={msg.toolInvocations}
                                            onModify={handleSend}
                                            isLatest={idx === stableHistory.length - 1 && !streamingMessage}
                                            modeContext={modeContext}
                                        />
                                    ))}
                                    {streamingMessage && (
                                        <MessageBubble
                                            key={streamingMessage.id}
                                            role={streamingMessage.role as 'user' | 'assistant'}
                                            content={streamingMessage.content || ''}
                                            isStreaming={true}
                                            toolInvocations={streamingMessage.toolInvocations as ToolInvocation[]}
                                            onModify={handleSend}
                                            isLatest={true}
                                            modeContext={modeContext}
                                        />
                                    )}
                                </React.Fragment>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Jump to bottom */}
                    <AnimatePresence>
                        {!isPinned && (stableHistory.length > 0 || streamingMessage) && (
                            <motion.button
                                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                onClick={scrollToBottomNow}
                                className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0A0A0B]/90 ring-1 ring-white/[0.08] text-[10px] font-semibold tracking-[0.04em] text-zinc-400 backdrop-blur-xl hover:text-zinc-200 hover:ring-white/[0.14] transition-all duration-300 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
                            >
                                <ArrowUp size={11} className="rotate-180" />
                                Latest
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Footer ── */}
                <footer
                    className="absolute bottom-0 left-0 right-0 z-30 px-4 sm:px-5 pt-16 sm:pt-20 pb-[max(2rem,env(safe-area-inset-bottom,0.5rem))] bg-gradient-to-t from-[#030303] via-[#030303]/95 to-transparent pointer-events-none"
                    style={
                        isMobile && keyboardOffset
                            ? { transform: `translateY(-${keyboardOffset}px)`, transition: 'transform 160ms ease' }
                            : undefined
                    }
                >
                    <div className="pointer-events-auto relative">
                        <AnimatePresence>
                            {isLoading && (
                                <ThinkingPill
                                    onStop={stop}
                                    status={isStreaming ? 'streaming' : 'thinking'}
                                />
                            )}
                        </AnimatePresence>

                        {/* Mode Pill */}
                        {modeContext && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-3 flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-500/[0.04] ring-1 ring-indigo-500/15"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-indigo-500/60" />
                                    <span className="text-[10px] font-semibold tracking-[0.04em] uppercase text-indigo-400/60">
                                        {modeContext}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setModeContext('')}
                                    className="p-1 rounded-md text-zinc-600 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                                    aria-label="Clear mode"
                                >
                                    <X size={12} />
                                </button>
                            </motion.div>
                        )}

                        {/* Mode Chips */}
                        <AnimatePresence>
                            {stableHistory.length < 2 && !streamingMessage && !isLoading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="mb-4"
                                >
                                    <ModeChips value={modeContext} onChange={setModeContext} />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <InputDeck
                            value={inputValue}
                            onChange={setInputValue}
                            onSend={() => handleSend()}
                            onStop={stop}
                            isProcessing={isLoading}
                            inputRef={inputRef}
                            attachments={attachments}
                            onRemoveAttachment={removeFile}
                            isDragActive={isDragActive}
                            isUploading={isUploading}
                            dragHandlers={dragHandlers}
                            handlePaste={handlePaste}
                            triggerFileSelect={triggerFileSelect}
                            captureScreenshot={() => void captureScreenshot()}
                            isCaptureSupported={isCaptureSupported}
                            fileInputRef={fileInputRef}
                            onFilesSelected={(files) => files && addFiles(files)}
                        />

                        {/* Error Bar */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-3 px-4 py-2.5 bg-rose-500/[0.06] ring-1 ring-rose-500/15 rounded-xl flex items-center justify-between"
                            >
                                <span className="text-[11px] text-rose-400/80 font-medium">
                                    {error.includes('404')
                                        ? 'Cold start — tap send again'
                                        : error.length > 80 ? `${error.slice(0, 80)}…` : error
                                    }
                                </span>
                                <button
                                    onClick={() => handleSend()}
                                    aria-label="Retry last message"
                                    className="ml-3 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg ring-1 ring-rose-500/20 transition-all duration-200"
                                >
                                    Retry
                                </button>
                            </motion.div>
                        )}
                    </div>
                </footer>
            </motion.div>
        </LayoutGroup>
    );
};


// ============================================================================
// §9  EXPORT
// ============================================================================

export { humanizeFilename, UserAttachment };

export const CommandCenterV2: FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <ChatErrorBoundary>
            <ToastProvider>
                <InnerCommandCenter isOpen={isOpen} setIsOpen={setIsOpen} />
            </ToastProvider>
        </ChatErrorBoundary>
    );
};

export default CommandCenterV2;
