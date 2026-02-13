/* ============================================================================
   CommandCenterV2.tsx
   "Obsidian Weissach" — Healthcare Staffing Edition (v3.1 - Elite Production)
   
   Updates:
   ├─ FIXED: Removed invalid 'id' prop from MessageBubble (prevents React warning)
   ├─ ENHANCED: Outlook Deep Link (Auto-copy body + CRLF fix for formatting)
   ├─ UX: "Alive" Pulse Grid in empty state, Non-blocking Scroll Masks
   ├─ PERF: SSR-Safe LayoutEffects, Memoized Markdown Tree
   └─ SAFETY: Strict 413 Payload Guards & Error Recovery
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
    FileText, Users, Activity, ChevronRight,
    Zap, Loader2, Image as ImageIcon, ExternalLink, Mail, Globe, Camera
} from 'lucide-react';

// Obsidian Weissach Design System
import {
    SYSTEM, cn, triggerHaptic, copyToClipboard as systemCopyToClipboard,
    FilmGrain, OrbitalRadar, ToastProvider, useToast,
} from '../design-system/obsidian';

import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { useFileUpload, type Attachment } from '../features/command-center-chat/hooks/useFileUpload';
import { usePinnedScroll } from '../features/command-center-chat/hooks/usePinnedScroll';
import { useLayout } from '../context/LayoutContext';

// ============================================================================
// 0. CONSTANTS & CONFIG
// ============================================================================

// Vercel Payload Safety Limit (4MB safe buffer against 4.5MB limit)
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

// Regex Patterns (Compiled once for O(1) performance)
const REGEX_EMAIL = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const REGEX_NOVA_ID = /^\d{6,8}$/;
const REGEX_ATTACHMENT = /\[Attached:\s*([^\]]+)\]\(([^)]+)\)/g;
const REGEX_VERDICT = /VERDICT:\s*(STRONG MATCH|REVIEW NEEDED|NOT A FIT)/i;
const REGEX_INSIGHT = /(?:INSIGHT|ASSESSMENT|KEY QUALIFICATIONS):\s*(.+)/is;

/**
 * CRITICAL: Strip all markdown formatting from text for Outlook-ready plain text.
 * This ensures email bodies don't render with bold/italic/bullets even if LLM outputs markdown.
 */
function stripMarkdownForEmail(text: string): string {
    if (!text) return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold **text**
        .replace(/__([^_]+)__/g, '$1')       // Bold __text__
        .replace(/\*([^*]+)\*/g, '$1')       // Italic *text*
        .replace(/_([^_]+)_/g, '$1')         // Italic _text_
        .replace(/^\s*[\*\+]\s+/gm, '- ')    // Bullet * or + to -
        .replace(/^\s*•\s*/gm, '- ')         // Unicode bullet to -
        .replace(/^#+\s*/gm, '')             // Headers
        .replace(/`([^`]+)`/g, '$1')         // Inline code
        .replace(/^>\s*/gm, '')              // Blockquotes
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
        .replace(/\r\n/g, '\n')
        .trim();
}

function splitMergedSubjectAndBody(subject: string, body: string): { subject: string; body: string } {
    const cleanSubject = (subject || '').trim();
    let cleanBody = (body || '').trim();
    if (!cleanSubject) return { subject: cleanSubject, body: cleanBody };

    const splitIndexCandidates: number[] = [];

    const greetingMatch = cleanSubject.match(/\b(?:hi|hello|hey)\s+[a-z][^,\n]{0,60},/i);
    if (greetingMatch?.index && greetingMatch.index > 0) {
        splitIndexCandidates.push(greetingMatch.index);
    }

    const sectionRx = /\b(?:pay package:|to move forward\b[^:\n]*:?|facility:|location:|assignment details:|assignment dates?:|shifts?(?:\s*&\s*hours)?:)\b/i;
    const sectionMatch = cleanSubject.match(sectionRx);
    if (sectionMatch?.index && sectionMatch.index > 0) {
        splitIndexCandidates.push(sectionMatch.index);
    }

    if (splitIndexCandidates.length === 0) {
        return { subject: cleanSubject, body: cleanBody };
    }

    const splitAt = Math.min(...splitIndexCandidates);
    const left = cleanSubject.slice(0, splitAt).trim();
    const right = cleanSubject.slice(splitAt).trim();

    if (!left || !right) return { subject: cleanSubject, body: cleanBody };

    cleanBody = cleanBody ? `${right}\n${cleanBody}` : right;
    return { subject: left, body: cleanBody };
}

function normalizeEmailBodyLayout(body: string): string {
    if (!body) return body;
    let text = body.replace(/\r\n/g, '\n').trim();

    text = text.replace(
        /([^\n])\s+(Pay Package:|Assignment Details:|To move forward\b[^:\n]*:?|Facility:|Location:|Assignment Dates?:|Shifts?(?:\s*&\s*Hours)?:)/gi,
        '$1\n\n$2'
    );

    text = text.replace(/([^\n])\s+(-\s+)/g, '$1\n$2');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
}

// Permissive Email Headers (Case insensitive, flexible spacing)
// This catches almost any draft format, even if AI forgets the standard header.
const REGEX_EMAIL_HEADER = /^#?\s*(?:EMAIL|DRAFT)\s*(?:DRAFT|EMAIL)?[\r\n]+/i;
const REGEX_EMAIL_TO = /(?:\*\*|__)?To:(?:\*\*|__)?\s*([^\r\n]+)/i;
const REGEX_EMAIL_SUBJECT = /(?:\*\*|__)?Subject:(?:\*\*|__)?\s*([^\r\n]+)/i;
// Only treat body as delimited when BOTH opening and closing --- are present.
const REGEX_EMAIL_BODY = /(?:^|\n)---[\r\n]+([\s\S]+?)[\r\n]+---(?:\s|$)/;

// New format: [SUBJECT]...[/SUBJECT] [BODY]...[/BODY] (from AI system)
const REGEX_TAG_SUBJECT = /\[SUBJECT\]([\s\S]*?)\[\/SUBJECT\]/i;
const REGEX_TAG_BODY = /\[BODY\]([\s\S]*?)\[\/BODY\]/i;

// Structured email draft JSON format (from email-contract system)
const REGEX_EMAIL_DRAFT_JSON = /\[EMAIL_DRAFT_JSON\]\s*([\s\S]*?)\s*\[\/EMAIL_DRAFT_JSON\]/i;
const REGEX_CLIENT_MARKERS = /\[\[(?:PROSPECT_UPSERT:[^\]]+|REFRESH_DASHBOARD)\]\]/g;

// Defaults (recruiting workflow standard)
const DEFAULT_CC = 'Tiffany.Chavez@ayahealthcare.com';

// Robust email extraction: handles "Name <email>" formats, strips mailto: garbage
function extractFirstEmail(input?: string): string | undefined {
    if (!input) return undefined;
    const m = input.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return m?.[1];
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic']);
const PDF_EXTENSION = 'pdf';

const STATUS_STYLES: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    zinc: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

// ============================================================================
// SHARED AUDIO ENGINE (created once, reused on user gestures)
// ============================================================================
let sharedAudioContext: AudioContext | null = null;

const ensureAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!sharedAudioContext) {
        try {
            sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch {
            return null;
        }
    }
    // Resume if suspended (happens after page load until first user gesture)
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume().catch(() => { });
    }
    return sharedAudioContext;
};

// Audio Cue: 200ms elegant tone - ONLY call on user gesture (click)
const playDraftReadyCue = () => {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880; // A5 - clean, professional
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch {
        // Silent fallback
    }
};

const RECRUITING_PHASES = ['SEARCHING DATABASE', 'ANALYZING MATCH', 'CALCULATING PACKAGE', 'DRAFTING RESPONSE'] as const;

interface ToolInvocation { toolName: string; toolCallId: string; state: 'result' | 'call' | 'pending'; args: any; result?: any; }
interface DragHandlerProps { onDragEnter: (e: ReactDragEvent) => void; onDragOver: (e: ReactDragEvent) => void; onDragLeave: (e: ReactDragEvent) => void; onDrop: (e: ReactDragEvent) => void; }

// ============================================================================
// 1. HELPERS & HOOKS
// ============================================================================

// SSR-Safe Layout Effect
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const useAutoResizeTextArea = (ref: React.RefObject<HTMLTextAreaElement>, value: string) => {
    useIsomorphicLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = '52px'; // Reset to base
        const newHeight = Math.min(Math.max(el.scrollHeight, 52), 160);
        el.style.height = `${newHeight}px`;
    }, [value, ref]);
};

function flattenChildrenText(node: ReactNode): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flattenChildrenText).join('');
    if (typeof node === 'object' && 'props' in node && (node as any).props?.children) return flattenChildrenText((node as any).props.children);
    return '';
}

function stripPaperclip(label: string): string { return label.replace(/^📎\s*/u, '').trim(); }
function getFileExtension(href?: string, label?: string): string {
    const cleanLabel = stripPaperclip(label || '');
    const labelMatch = cleanLabel.match(/\.([a-z0-9]{2,5})$/i);
    if (labelMatch?.[1]) return labelMatch[1].toLowerCase();
    if (href) { try { const path = new URL(href).pathname; const match = path.match(/\.([a-z0-9]{2,5})(?:$|\?)/i); if (match?.[1]) return match[1].toLowerCase(); } catch { } }
    return '';
}

/**
 * Normalize body text for mailto links.
 * Outlook Desktop strictly requires CRLF (%0D%0A) for line breaks.
 */
function normalizeBodyForMailto(body: string): string {
    return body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

// ============================================================================
// 2. VISUAL PRIMITIVES
// ============================================================================

const InlineImageThumbnail: FC<{ href: string; label: string }> = memo(({ href, label }) => {
    const cleanLabel = stripPaperclip(label);
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block my-3 no-underline group max-w-[380px]" onClick={(e) => e.stopPropagation()} title={`Open ${cleanLabel}`}>
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all shadow-lg will-change-transform">
                <div className="relative aspect-video bg-black/50">
                    <img src={href} alt={cleanLabel} loading="lazy" className="absolute inset-0 w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼️</text></svg>'; }} />
                    <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ExternalLink size={12} className="text-white/70" /></div>
                </div>
                <div className="px-3 py-2 flex items-center gap-2 bg-black/20 border-t border-white/5"><ImageIcon size={12} className="text-emerald-400 shrink-0" /><span className="text-[11px] text-zinc-300 truncate">{cleanLabel}</span></div>
            </div>
        </a>
    );
});
InlineImageThumbnail.displayName = 'InlineImageThumbnail';

const InlineFilePill: FC<{ href: string; label: string; isPdf?: boolean }> = memo(({ href, label, isPdf }) => {
    const cleanLabel = stripPaperclip(label);
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 my-2 px-3 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all no-underline max-w-full group mr-2" onClick={(e) => e.stopPropagation()} title={`Open ${cleanLabel}`}>
            {isPdf ? <FileText size={14} className="text-rose-400 shrink-0" /> : <Paperclip size={14} className="text-zinc-400 shrink-0" />}
            <span className="text-[12px] text-zinc-200 truncate">{cleanLabel}</span>
            <ExternalLink size={12} className="text-zinc-500 group-hover:text-indigo-400 transition-colors shrink-0" />
        </a>
    );
});
InlineFilePill.displayName = 'InlineFilePill';

const CopyButton: FC<{ content: string }> = memo(({ content }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(async () => { const success = await systemCopyToClipboard(content); if (success) { setCopied(true); triggerHaptic(); setTimeout(() => setCopied(false), 1500); } }, [content]);
    return <button onClick={handleCopy} aria-label="Copy content" className={cn('p-1.5 rounded-md transition-all duration-200', copied ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5')}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>;
});
CopyButton.displayName = 'CopyButton';

// ============================================================================
// 3. INTELLIGENCE ARTIFACTS
// ============================================================================

const CandidateVerdict: FC<{ verdict: 'STRONG MATCH' | 'REVIEW NEEDED' | 'NOT A FIT'; details?: string }> = memo(({ verdict, details }) => {
    const config = useMemo(() => { switch (verdict) { case 'STRONG MATCH': return { dot: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', label: 'Proceed', sub: 'Ready for Interview', icon: 'check' }; case 'REVIEW NEEDED': return { dot: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500/20', bg: 'bg-amber-500/10', label: 'Review', sub: 'Additional Screening', icon: '?' }; case 'NOT A FIT': default: return { dot: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500/20', bg: 'bg-rose-500/10', label: 'Pass', sub: 'Requirements Not Met', icon: 'x' }; } }, [verdict]);
    return (
        <motion.div layout initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SYSTEM.anim.fluid} className={cn('my-6 relative overflow-hidden rounded-[18px] bg-[#0A0A0B] shadow-2xl group select-none isolate', SYSTEM.surface.milled)}>
            <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.03)_45%,transparent_50%)] bg-[length:200%_100%] animate-[shimmer_5s_infinite_linear] pointer-events-none" />
            <div className="px-6 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <span className={SYSTEM.type.mono}>Candidate Assessment</span>
                <div className={cn('flex items-center gap-2 px-2 py-0.5 rounded-full border', config.bg, config.border)}><span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', config.dot)} /><span className={cn('text-[9px] font-bold tracking-wider uppercase', config.text)}>{config.label}</span></div>
            </div>
            <div className="relative p-6 flex items-start gap-4">
                <div className="flex-1"><div className="text-2xl md:text-3xl font-medium text-white tracking-tight leading-none mb-1 tabular-nums">{verdict}</div>{details && <div className="text-[13px] text-zinc-400 mt-3 leading-relaxed">{details}</div>}<div className={cn('text-[10px] uppercase tracking-wider font-mono mt-3', config.text)}>{config.sub}</div></div>
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02]">{config.icon === 'check' && <Check size={20} className="text-emerald-400" />}{config.icon === '?' && <span className="text-amber-400 text-lg font-bold">?</span>}{config.icon === 'x' && <X size={20} className="text-rose-400" />}</div>
            </div>
        </motion.div>
    );
});
CandidateVerdict.displayName = 'CandidateVerdict';

const AssessmentHUD: FC<{ content: string; title?: string }> = memo(({ content, title = 'Match Insight' }) => (
    <motion.div layout initial={{ x: -5, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={SYSTEM.anim.fluid} className={cn('my-6 relative overflow-hidden rounded-r-[16px] border-l-[3px] border-l-indigo-500/80 shadow-[20px_0_40px_-10px_rgba(99,102,241,0.05)]', SYSTEM.surface.hud)}>
        <div className="p-5"><div className="flex items-center gap-2 mb-3"><Activity size={14} className="text-indigo-400" /><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{title}</span></div><div className="text-[14px] text-indigo-100/90 leading-[1.6] font-medium tracking-wide">{content}</div></div>
    </motion.div>
));
AssessmentHUD.displayName = 'AssessmentHUD';

const ThinkingPill: FC<{ onStop?: () => void; status?: 'thinking' | 'streaming' | 'grounding' }> = memo(({ onStop, status = 'thinking' }) => {
    const [phaseIndex, setPhaseIndex] = useState(0);
    useEffect(() => { if (status === 'thinking') { const i = setInterval(() => setPhaseIndex(p => (p + 1) % RECRUITING_PHASES.length), 2200); return () => clearInterval(i); } }, [status]);
    const txt = status === 'streaming' ? 'LIVE STREAM' : status === 'grounding' ? 'SOURCING' : RECRUITING_PHASES[phaseIndex];
    return (
        <motion.div layout initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} transition={SYSTEM.anim.fluid} className="absolute bottom-[100%] left-1/2 -translate-x-1/2 mb-6 z-30 flex items-center gap-3 px-4 py-2 rounded-full bg-[#050505] border border-white/10 shadow-2xl backdrop-blur-md will-change-transform">
            <OrbitalRadar /><AnimatePresence mode="wait"><motion.span key={txt} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(4px)' }} className={cn(SYSTEM.type.mono, 'text-zinc-300 min-w-[120px] text-center')}>{txt}</motion.span></AnimatePresence>{onStop && <button onClick={onStop} aria-label="Stop Generating" className="ml-1 text-zinc-600 hover:text-zinc-200 p-1"><Square size={10} fill="currentColor" /></button>}
        </motion.div>
    );
});
ThinkingPill.displayName = 'ThinkingPill';

// MODE_CHIPS: Set hidden context flags (not sent as visible text in transcript)
const MODE_CHIPS = [
    { label: 'Working Traveler', context: 'Working Traveler' },
    { label: 'Re-Engaged Traveler', context: 'Re-Engaged Traveler' },
    { label: 'Pay Package Email', context: 'Pay Package Email' },
    { label: 'Reassignment', context: 'Internal Reassignment Request' },
    { label: 'Licensing', context: 'Licensing Request' },
    { label: 'Extension Request', context: 'Extension Request' },
    { label: 'Screen Resume', context: 'Screen Resume' },
    { label: 'Reply Mode', context: 'Reply to Email' },
] as const;

type RouterMode = 'default' | 'cold_outreach' | 'batch_reassign' | 'reply_mode';

const MODE_CONTEXT_TO_ROUTER_MODE: Record<string, RouterMode> = {
    'Pay Package Email': 'cold_outreach',
    'Internal Reassignment Request': 'batch_reassign',
    'Reply to Email': 'reply_mode',
};


const ModeChips: FC<{ value: string; onChange: (v: string) => void }> = memo(({ value, onChange }) => (
    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide px-1">
        {MODE_CHIPS.map((chip, index) => {
            const active = value === chip.context;
            return (
                <motion.button
                    key={chip.label}
                    onClick={() => { triggerHaptic(); onChange(chip.context); }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04, ...SYSTEM.anim.fluid }}
                    whileHover={{ scale: 1.02, y: -1, backgroundColor: 'rgba(255,255,255,0.06)' }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                        'flex-shrink-0 px-3.5 py-2 min-h-[48px] border transition-all backdrop-blur-sm',
                        SYSTEM.geo.pill,
                        active
                            ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                            : 'bg-white/[0.03] border-white/[0.08] text-zinc-300'
                    )}
                >
                    <span className="text-[10px] font-medium tracking-wide uppercase">{chip.label}</span>
                </motion.button>
            );
        })}
    </div>
));
ModeChips.displayName = 'ModeChips';

// ============================================================================
// 4. EMAIL & ATTACHMENT HANDLING (ENHANCED OUTLOOK DEEP LINK)
// ============================================================================

const EmailCard: FC<{ to?: string; cc?: string; subject: string; body: string; signature?: string | null }> = memo(({ to, cc = DEFAULT_CC, subject, body, signature }) => {
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const { showToast } = useToast();

    // CRITICAL FIX: Strip markdown BEFORE any processing
    const cleanBody = useMemo(() => stripMarkdownForEmail(body), [body]);
    const cleanSubject = useMemo(() => stripMarkdownForEmail(subject), [subject]);
    const normalizedBody = useMemo(() => normalizeEmailBodyLayout(cleanBody), [cleanBody]);

    // Body only for copy (no signature - Outlook auto-appends)
    const bodyOnly = useMemo(() => normalizedBody.replace(/  \n/g, '\n').replace(/^---\s*$/gm, '').trim(), [normalizedBody]);

    // Full preview (body + signature) for on-screen display only
    const previewBody = useMemo(() => {
        if (!signature) return bodyOnly;
        return `${bodyOnly}\n\n${signature}`;
    }, [bodyOnly, signature]);

    const isLongBody = previewBody.length > 600 || previewBody.split('\n').length > 15;

    // Premium copy: clipboard + audio cue + haptic (user gesture required)
    // Copies body-only (no signature) since Outlook auto-appends
    const handleQuickCopyAll = useCallback(async () => {
        const fullDraft = `Subject: ${cleanSubject}\n\n${bodyOnly}`;
        const success = await systemCopyToClipboard(fullDraft);
        if (success) {
            setCopiedField('all');
            playDraftReadyCue(); // Audio cue only on user gesture
            triggerHaptic();
            setTimeout(() => setCopiedField(null), 2500);
        } else {
            showToast('Clipboard access blocked. Try manual copy.');
        }
    }, [cleanSubject, bodyOnly, showToast]);

    const handleCopy = useCallback(async (text: string, field: string) => {
        const success = await systemCopyToClipboard(text);
        if (success) {
            setCopiedField(field);
            triggerHaptic();
            setTimeout(() => setCopiedField(null), 2000);
        }
    }, []);

    // Outlook Deep Link Generator (Robust CRLF & Length Guard + CC support)
    // Uses body-only since Outlook auto-appends stored signature
    const handleOpenOutlook = useCallback(() => {
        triggerHaptic();
        playDraftReadyCue(); // Audio cue on mail action too

        // Outlook requires \r\n for line breaks - use body-only (no signature)
        const outlookBody = normalizeBodyForMailto(bodyOnly);
        const safeSubject = encodeURIComponent(cleanSubject);
        const safeBody = encodeURIComponent(outlookBody);
        const safeCc = cc ? `&cc=${encodeURIComponent(cc)}` : '';

        // Use standard mailto. It works best for system default clients (Outlook Desktop/Mac Mail)
        const mailtoLink = `mailto:${to || ''}?subject=${safeSubject}${safeCc}&body=${safeBody}`;

        // Guard against URL length limits (approx 2000 chars is safe)
        if (mailtoLink.length > 2000) {
            handleCopy(bodyOnly, 'all');
            showToast("Draft too long for link. Content copied to clipboard.");
            // Fallback: Open mail client with just subject/to/cc
            window.open(`mailto:${to || ''}?subject=${safeSubject}${safeCc}`, '_blank');
        } else {
            window.open(mailtoLink, '_blank');
        }
    }, [to, cc, cleanSubject, bodyOnly, handleCopy, showToast]);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SYSTEM.anim.fluid} className={cn('rounded-[20px] overflow-hidden bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]')}>
            {/* Header with Quick Copy All button */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/20">
                        <FileText size={14} className="text-indigo-400" />
                    </div>
                    <span className={cn(SYSTEM.type.mono, 'text-indigo-400')}>Email Draft</span>
                </div>
                {/* Premium Quick Copy All button */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleQuickCopyAll}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-[11px] font-medium',
                        copiedField === 'all'
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                            : 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 border border-indigo-500/20 text-indigo-300 hover:from-indigo-500/25 hover:to-purple-500/25'
                    )}
                >
                    {copiedField === 'all' ? (
                        <>
                            <Check size={12} />
                            <span>COPIED</span>
                        </>
                    ) : (
                        <>
                            <Zap size={12} />
                            <span>QUICK COPY</span>
                        </>
                    )}
                </motion.button>
            </div>

            {/* Content */}
            {to && <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01] flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px]')}>To</span><p className="text-[14px] font-medium text-white mt-0.5 select-all">{to}</p></div><button onClick={() => handleCopy(to, 'to')} className="text-zinc-400 hover:text-white p-1">{copiedField === 'to' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button></div>}
            <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01] flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px]')}>Subject</span><p className="text-[14px] font-medium text-white mt-0.5 line-clamp-2 select-all">{cleanSubject}</p></div><button onClick={() => handleCopy(cleanSubject, 'subject')} className="text-zinc-400 hover:text-white p-1">{copiedField === 'subject' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button></div>

            <div className="px-5 py-4 relative group">
                <div className={cn('flex-1 min-w-0 relative', !isExpanded && isLongBody && 'max-h-[280px] overflow-hidden')}>
                    {/* CRITICAL FIX: Render body as plain text, NOT ReactMarkdown */}
                    <div className="text-[14px] text-[#C4C4C4] leading-relaxed whitespace-pre-wrap font-sans">
                        {previewBody.split(/\n\n+/).map((paragraph, i) => (
                            <p key={i} className="mb-4 last:mb-0">
                                {paragraph.split('\n').map((line, j, arr) => (
                                    <React.Fragment key={j}>
                                        {line}
                                        {j < arr.length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                            </p>
                        ))}
                    </div>
                    {!isExpanded && isLongBody && <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0A0A0B] to-transparent pointer-events-none" />}
                </div>
                {isLongBody && <button onClick={() => setIsExpanded(!isExpanded)} className="mt-3 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors">{isExpanded ? '↑ Show Less' : '↓ Show Full Email'}</button>}
            </div>

            {/* Command Bar Footer */}
            <div className="px-4 py-3 border-t border-white/[0.06] bg-white/[0.02] flex items-center gap-2">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleOpenOutlook} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all text-[12px] font-medium group">
                    <Mail size={14} /> Outlook
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                        triggerHaptic();
                        playDraftReadyCue();
                        const ccParam = cc ? `&cc=${encodeURIComponent(cc)}` : '';
                        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1${to ? `&to=${encodeURIComponent(to)}` : ''}${ccParam}&su=${encodeURIComponent(cleanSubject)}&body=${encodeURIComponent(bodyOnly)}`;
                        if (gmailUrl.length > 2000) {
                            handleCopy(bodyOnly, 'all');
                            showToast("Draft too long for link. Content copied to clipboard.");
                            window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}${ccParam}`, '_blank');
                        } else {
                            window.open(gmailUrl, '_blank');
                        }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all text-[12px] font-medium group"
                >
                    <Mail size={14} /> Gmail
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleCopy(bodyOnly, 'body')} className={cn('px-4 py-2 rounded-xl border transition-all text-[12px] font-medium', copiedField === 'body' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-white')}>
                    {copiedField === 'body' ? <span className="flex items-center gap-1.5"><Check size={14} /> Copied</span> : 'Copy Body'}
                </motion.button>
            </div>
        </motion.div>
    );
});
EmailCard.displayName = 'EmailCard';

// ============================================================================
// 4b. NEXT STEPS PANEL (Structured Actions from Email Contract)
// ============================================================================

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
            className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
        >
            <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px] tracking-widest')}>NEXT STEPS</span>
            </div>
            {/* Capped height + scroll to prevent overflow pushing layout */}
            <div
                className="max-h-40 overflow-y-auto px-4 py-3 space-y-2"
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
                {steps.map((step, idx) => (
                    <motion.div
                        key={`${step.type}-${idx}`}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * idx, ...SYSTEM.anim.fluid }}
                    >
                        {step.type === 'open_nova' && step.href && (
                            <a
                                href={step.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => triggerHaptic()}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all group"
                            >
                                <ExternalLink size={14} className="text-indigo-400 shrink-0" />
                                <span className="text-[13px] text-indigo-300 font-medium truncate">{step.label}</span>
                                <ChevronRight size={14} className="ml-auto text-indigo-500/50 group-hover:text-indigo-400 transition-colors shrink-0" />
                            </a>
                        )}
                        {step.type === 'send_email' && step.href && (
                            <a
                                href={step.href}
                                onClick={() => { triggerHaptic(); playDraftReadyCue(); }}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all group"
                            >
                                <Mail size={14} className="text-emerald-400 shrink-0" />
                                <span className="text-[13px] text-emerald-300 font-medium truncate">{step.label}</span>
                                <ChevronRight size={14} className="ml-auto text-emerald-500/50 group-hover:text-emerald-400 transition-colors shrink-0" />
                            </a>
                        )}
                        {(step.type === 'await_docs' || step.type === 'await_availability') && (
                            <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                <Activity size={14} className="text-amber-400 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                    <span className="text-[13px] text-amber-300/80 font-medium">{step.label}</span>
                                    {step.required?.length && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {step.required.map((item, i) => (
                                                <span key={i} className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400/80">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {step.type === 'move_stage' && (
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-500/5 border border-zinc-500/10 opacity-60">
                                <Zap size={14} className="text-zinc-500 shrink-0" />
                                <span className="text-[13px] text-zinc-400 truncate">{step.label}</span>
                                {step.enabled_when && (
                                    <span className="ml-auto text-[10px] text-zinc-600 font-mono shrink-0">when: {step.enabled_when}</span>
                                )}
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
});
NextStepsPanel.displayName = 'NextStepsPanel';

// ============================================================================
// INTEL PANEL — Market Intelligence (Google/Apple Internal Quality)
// ============================================================================

interface IntelData {
    specialty?: string;
    location?: string;
    weeklyPay?: number;
    hourlyRate?: number;
    candidateName?: string;
    novaUrl?: string;
}

interface MarketIntel {
    avgRate: string;
    percentile: number;
    trend: 'up' | 'down' | 'stable';
    confidence: 'high' | 'medium' | 'low';
}

// Mock market data - in production, this would come from a service
const getMarketIntel = (specialty: string, location: string): MarketIntel | null => {
    // Placeholder - would query actual market data in production
    const specialtyRates: Record<string, { base: number; variance: number }> = {
        'RN': { base: 2200, variance: 400 },
        'CNA': { base: 1300, variance: 200 },
        'LPN': { base: 1600, variance: 250 },
        'MA': { base: 1100, variance: 150 },
        'Histology Tech': { base: 2000, variance: 300 },
        'RRT': { base: 2100, variance: 350 },
    };

    // Find matching specialty
    const key = Object.keys(specialtyRates).find(k =>
        specialty?.toLowerCase().includes(k.toLowerCase())
    );

    if (!key) return null;

    const { base, variance } = specialtyRates[key];
    return {
        avgRate: `$${(base - variance / 2).toLocaleString()} - $${(base + variance / 2).toLocaleString()}`,
        percentile: Math.floor(Math.random() * 30) + 50, // 50-80th percentile
        trend: ['up', 'stable', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'stable',
        confidence: 'medium',
    };
};

const IntelPanel: FC<{ intel: IntelData }> = memo(({ intel }) => {
    if (!intel.specialty && !intel.location) return null;

    const marketIntel = intel.specialty && intel.location
        ? getMarketIntel(intel.specialty, intel.location)
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, ...SYSTEM.anim.fluid }}
            className="mt-3 rounded-xl border border-cyan-500/10 bg-gradient-to-b from-cyan-500/[0.03] to-transparent overflow-hidden"
        >
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-cyan-500/10 bg-cyan-500/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className={cn(SYSTEM.type.mono, 'text-cyan-500/70 text-[10px] tracking-widest')}>MARKET INTEL</span>
                </div>
                <span className={cn(SYSTEM.type.mono, 'text-cyan-500/40 text-[9px]')}>LIVE</span>
            </div>

            {/* Intel Grid */}
            <div className="px-4 py-3 space-y-3">
                {/* Market Rate Card */}
                {marketIntel && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <Activity size={14} className="text-emerald-400" />
                            </div>
                            <div>
                                <span className="text-[11px] text-zinc-500 block">Market Range</span>
                                <span className="text-[13px] text-zinc-200 font-medium">{marketIntel.avgRate}/wk</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-full',
                                marketIntel.trend === 'up'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-zinc-500/15 text-zinc-400'
                            )}>
                                {marketIntel.trend === 'up' ? '↑ Rising' : '→ Stable'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Nova Profile Link (Internal Action) */}
                {intel.novaUrl && (
                    <a
                        href={intel.novaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => triggerHaptic()}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15 hover:bg-indigo-500/10 hover:border-indigo-500/25 transition-all group"
                    >
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                            <Users size={14} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="text-[11px] text-zinc-500 block">Candidate Profile</span>
                            <span className="text-[13px] text-indigo-300 font-medium truncate block">
                                {intel.candidateName || 'View in Nova'}
                            </span>
                        </div>
                        <ExternalLink size={14} className="text-indigo-500/50 group-hover:text-indigo-400 transition-colors" />
                    </a>
                )}

                {/* Quick Intel Chips */}
                <div className="flex flex-wrap gap-1.5">
                    {intel.specialty && (
                        <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-zinc-400">
                            {intel.specialty}
                        </span>
                    )}
                    {intel.location && (
                        <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-zinc-400">
                            📍 {stripMarkdownForEmail(intel.location)}
                        </span>
                    )}
                    {intel.weeklyPay && (
                        <span className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400">
                            ${intel.weeklyPay.toLocaleString()}/wk
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
});
IntelPanel.displayName = 'IntelPanel';

// Post-Draft Modifier Chips - one-tap adjustments
const POST_DRAFT_MODIFIERS = [
    { label: '+ Certs', query: 'Also ask them to send their certifications.' },
    { label: '+ Time-off?', query: 'Also ask about any time-off requests for this contract.' },
    { label: '+ Update Aya', query: 'Also ask them to update their profile in the Aya app.' },
    { label: '+ Match tone', query: 'Rewrite this to better match their casual/friendly energy.' },
    { label: '+ Shorter', query: 'Make this more concise - cut the fluff.' },
] as const;

const PostDraftModifiers: FC<{ onModify: (modifier: string) => void }> = memo(({ onModify }) => (
    <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, ...SYSTEM.anim.fluid }}
        className="flex flex-wrap gap-1.5 mt-3"
    >
        <span className={cn(SYSTEM.type.mono, 'text-zinc-600 text-[9px] mr-1 self-center')}>ADJUST:</span>
        {POST_DRAFT_MODIFIERS.map((mod) => (
            <motion.button
                key={mod.label}
                whileHover={{ scale: 1.03, backgroundColor: 'rgba(99,102,241,0.15)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { triggerHaptic(); onModify(mod.query); }}
                className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-[10px] text-zinc-400 hover:text-indigo-300 hover:border-indigo-500/30 transition-all"
            >
                {mod.label}
            </motion.button>
        ))}
    </motion.div>
));

const UserAttachment: FC<{ filename: string; url: string }> = memo(({ filename, url }) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|heic)$/i.test(filename);
    return (
        <motion.a href={url} target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.02 }} className="flex items-center gap-3 mt-3 p-2 rounded-xl bg-black/20 border border-white/10 hover:bg-black/30 transition-all cursor-pointer group will-change-transform">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">{isImage ? <img src={url} alt="" className="w-full h-full object-cover" /> : <FileText size={20} className="text-rose-400" />}</div>
            <div className="flex-1 min-w-0"><p className="text-[12px] text-indigo-400 truncate group-hover:text-indigo-300 transition-colors">{filename}</p><p className="text-[10px] text-zinc-500 mt-0.5">{isImage ? 'Image' : 'Document'}</p></div>
        </motion.a>
    );
});
UserAttachment.displayName = 'UserAttachment';

// ============================================================================
// 5. MESSAGE BUBBLE
// ============================================================================

interface MessageBubbleProps { role: 'user' | 'assistant'; content: string; isStreaming?: boolean; toolInvocations?: ToolInvocation[]; onModify?: (modifier: string) => void; isLatest?: boolean; }
const MessageBubble: FC<MessageBubbleProps> = memo(({ role, content, isStreaming, toolInvocations, onModify, isLatest }) => {
    const isUser = role === 'user';
    // Detect if this message contains an email draft (for showing modifier chips)
    const hasEmailDraft = !isUser && !isStreaming && (
        REGEX_EMAIL_DRAFT_JSON.test(content) ||
        REGEX_TAG_SUBJECT.test(content) ||
        REGEX_EMAIL_SUBJECT.test(content) ||
        REGEX_EMAIL_HEADER.test(content)
    );
    const components: Components = useMemo(() => ({
        p: ({ children }) => <p className={cn(SYSTEM.type.body, isUser ? 'text-[#1a1a1a]' : 'text-[#A1A1AA]', 'mb-4 last:mb-0')}>{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        a: ({ href, children }) => {
            const label = flattenChildrenText(children).trim(); const safeHref = String(href || '').trim();
            if (REGEX_NOVA_ID.test(label)) return <a href={safeHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-zinc-400 hover:text-indigo-400 font-mono text-[12px] group transition-colors">{label}<ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" /></a>;
            const clean = stripPaperclip(label);
            if (label.includes('📎') || /\.[a-z0-9]{2,5}$/i.test(clean)) { const ext = getFileExtension(safeHref, label); return IMAGE_EXTENSIONS.has(ext) ? <InlineImageThumbnail href={safeHref} label={label} /> : <InlineFilePill href={safeHref} label={label} isPdf={ext === PDF_EXTENSION} />; }
            return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/30 underline-offset-4 transition-colors">{children}</a>;
        },
        ul: ({ children }) => <ul className="space-y-2 mb-4 ml-1">{children}</ul>,
        li: ({ children }) => <li className="flex gap-3 items-start pl-1"><span className="mt-2 w-1 h-1 bg-zinc-700 rounded-full shrink-0" /><span className={SYSTEM.type.body}>{children}</span></li>,
        code: ({ children, className }) => !className ? <code className="px-1.5 py-0.5 bg-white/10 rounded text-[13px] font-mono text-indigo-300">{children}</code> : <code className="block p-4 bg-[#0A0A0B] rounded-lg text-[13px] font-mono text-zinc-300 overflow-x-auto">{children}</code>,
        table: ({ children }) => <div className="my-4 rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.02]"><table className="w-full border-collapse">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-white/[0.03] border-b border-white/[0.06]">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-white/[0.04]">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
        th: ({ children }) => <th className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{children}</th>,
        td: ({ children }) => {
            const text = flattenChildrenText(children).trim().toLowerCase();
            let styleKey = null;
            if (['interested', 'active', 'strong match', 'ready'].some(k => text.includes(k))) styleKey = 'emerald';
            else if (['submitted', 'interviewing', 'sourced', 'offer'].some(k => text.includes(k))) styleKey = 'blue';
            else if (['pending', 'review', 'hold', 'waitlist'].some(k => text.includes(k))) styleKey = 'amber';
            else if (['declined', 'rejected', 'not a fit', 'pass'].some(k => text.includes(k))) styleKey = 'rose';
            else if (['archived', 'withdrawn', 'closed'].some(k => text.includes(k))) styleKey = 'zinc';
            else if (['new', 'fresh'].some(k => text.includes(k))) styleKey = 'purple';
            if (styleKey && STATUS_STYLES[styleKey]) return <td className="px-4 py-4"><span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border', STATUS_STYLES[styleKey])}>{flattenChildrenText(children)}</span></td>;
            return <td className="px-4 py-4 text-[13px] text-zinc-300 tabular-nums">{children}</td>;
        }
    }), [isUser]);

    const renderContent = useMemo(() => {
        if (!content) return null;
        const sanitizedContent = content.replace(REGEX_CLIENT_MARKERS, '').trim();
        if (isUser) {
            const attachments: { filename: string; url: string }[] = [];
            let match; REGEX_ATTACHMENT.lastIndex = 0;
            while ((match = REGEX_ATTACHMENT.exec(sanitizedContent)) !== null) attachments.push({ filename: match[1].trim(), url: match[2] });
            if (attachments.length > 0) { const txt = sanitizedContent.replace(REGEX_ATTACHMENT, '').trim(); return <>{txt && <p className={cn(SYSTEM.type.body, 'text-[#1a1a1a]')}>{txt}</p>}{attachments.map((a, i) => <UserAttachment key={i} filename={a.filename} url={a.url} />)}</>; }
        }

        // Pre-process: If content is wrapped in <draft> tags (Chain of Thought), extract it.
        let processedContent = sanitizedContent;
        const draftMatch = sanitizedContent.match(/<draft>([\s\S]*?)<\/draft>/i);
        if (draftMatch) {
            processedContent = draftMatch[1].trim();
        }

        // STRUCTURED EMAIL FORMAT: [EMAIL_DRAFT_JSON]...[/EMAIL_DRAFT_JSON] (from email-contract system)
        const jsonMatch = processedContent.match(REGEX_EMAIL_DRAFT_JSON);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                const email = parsed.email;
                const nextSteps = parsed.next_steps as NextStepAction[];

                if (email?.kind === 'email_draft') {
                    const splitStructured = splitMergedSubjectAndBody(email.subject || '', email.body || '');
                    const normalizedStructuredSubject = splitStructured.subject || '(No Subject)';
                    const normalizedStructuredBody = normalizeEmailBodyLayout(splitStructured.body || '');

                    // Extract intel from email metadata
                    const intel: IntelData = {
                        candidateName: email.to_name || email.meta?.candidate?.name,
                        novaUrl: email.meta?.candidate?.nova_url,
                    };

                    // Extract specialty and location from subject
                    const subjectMatch = normalizedStructuredSubject.match(/^([^-]+)\s*-\s*([^|]+)/);
                    if (subjectMatch) {
                        intel.specialty = subjectMatch[1]?.trim();
                    }

                    // Extract weekly pay from subject
                    const payMatch = normalizedStructuredSubject.match(/\$([0-9,]+)(?:\/wk|\/week)?/i);
                    if (payMatch) {
                        intel.weeklyPay = parseInt(payMatch[1].replace(/,/g, ''), 10);
                    }

                    // Extract location from body
                    const locMatch = normalizedStructuredBody.match(/Location:\s*([^\n]+)/i);
                    if (locMatch) {
                        intel.location = locMatch[1]?.trim();
                    }

                    return (
                        <>
                            <EmailCard
                                to={email.to_email || undefined}
                                cc={email.cc?.[0] || DEFAULT_CC}
                                subject={normalizedStructuredSubject}
                                body={normalizedStructuredBody}
                                signature={email.signature}
                            />
                            <NextStepsPanel steps={nextSteps} />
                        </>
                    );
                }
            } catch (e) {
                console.warn('Failed to parse EMAIL_DRAFT_JSON:', e);
                // Fall through to other parsers
            }
        }

        // NEW FORMAT: [SUBJECT]...[/SUBJECT] [BODY]...[/BODY] (from AI system prompt)
        const tagSubjectMatch = processedContent.match(REGEX_TAG_SUBJECT);
        const tagBodyMatch = processedContent.match(REGEX_TAG_BODY);
        if (tagSubjectMatch && tagBodyMatch) {
            const splitTagged = splitMergedSubjectAndBody(tagSubjectMatch[1].trim(), tagBodyMatch[1].trim());
            const tagSubject = splitTagged.subject;
            const tagBody = normalizeEmailBodyLayout(splitTagged.body);
            // Prefer explicit To: if present, otherwise first email found (using robust extraction)
            const rawTo = processedContent.match(REGEX_EMAIL_TO)?.[1]?.trim();
            const tagTo = extractFirstEmail(rawTo) || extractFirstEmail(processedContent);

            // Extract intel from subject/body
            const intel: IntelData = {};
            const subMatch = tagSubject.match(/^([^-]+)\s*-\s*([^|]+)/);
            if (subMatch) intel.specialty = subMatch[1]?.trim();
            const payMatch = tagSubject.match(/\$([0-9,]+)/);
            if (payMatch) intel.weeklyPay = parseInt(payMatch[1].replace(/,/g, ''), 10);
            const locMatch = tagBody.match(/Location:\s*([^\n]+)/i);
            if (locMatch) intel.location = locMatch[1]?.trim();

            return <>
                <EmailCard to={tagTo} cc={DEFAULT_CC} subject={tagSubject} body={tagBody} />
            </>;
        }

        // Enhanced Email Parsing (Permissive)
        // If header is present OR if we see To/Subject lines, we render the card.
        const emailMatch = processedContent.match(REGEX_EMAIL_HEADER);
        const hasEmailFields = REGEX_EMAIL_TO.test(processedContent) || REGEX_EMAIL_SUBJECT.test(processedContent);

        if (emailMatch || hasEmailFields) {
            const rawTo = processedContent.match(REGEX_EMAIL_TO)?.[1]?.trim();
            const toEmail = extractFirstEmail(rawTo); // Robust: handles "Name <email>" format
            const sub = processedContent.match(REGEX_EMAIL_SUBJECT)?.[1].trim() || '';

            // Body extraction: Try --- delimiters first, fallback to everything after Subject line
            let body = '';
            const bodyMatch = processedContent.match(REGEX_EMAIL_BODY);
            if (bodyMatch) {
                body = bodyMatch[1].trim();
            } else {
                // Fallback: everything after Subject: line
                const subjectIdx = processedContent.search(/Subject:[^\n]*/i);
                if (subjectIdx !== -1) {
                    const afterSubject = processedContent.slice(subjectIdx).replace(/Subject:[^\n]*\n?/i, '');
                    body = afterSubject.trim();
                }
            }

            const splitSubject = splitMergedSubjectAndBody(sub, body);
            const normalizedSubject = splitSubject.subject;
            const normalizedBody = normalizeEmailBodyLayout(splitSubject.body);

            // Final recipient email: explicit To: email wins; fallback = first email in content
            const recipientEmail = toEmail || extractFirstEmail(processedContent);

            // Extract intel from subject/body
            const intel: IntelData = {};
            if (normalizedSubject) {
                const subMatch = normalizedSubject.match(/^([^-]+)\s*-\s*([^|]+)/);
                if (subMatch) intel.specialty = subMatch[1]?.trim();
                const payMatch = normalizedSubject.match(/\$([0-9,]+)/);
                if (payMatch) intel.weeklyPay = parseInt(payMatch[1].replace(/,/g, ''), 10);
            }
            const locMatch = normalizedBody.match(/Location:\s*([^\n]+)/i);
            if (locMatch) intel.location = locMatch[1]?.trim();

            // Render card if we have at least a subject or 'to' field
            // Avoid duplicate rendering: do not attempt to render a "remainder" for header-style drafts
            if (normalizedSubject || recipientEmail) {
                return <>
                    <EmailCard to={recipientEmail} cc={DEFAULT_CC} subject={normalizedSubject || '(No Subject)'} body={normalizedBody} />
                </>;
            }
        }

        const verdictMatch = sanitizedContent.match(REGEX_VERDICT); if (verdictMatch) return <CandidateVerdict verdict={verdictMatch[1].toUpperCase() as any} details={sanitizedContent.replace(verdictMatch[0], '').trim()} />;
        const insightMatch = sanitizedContent.match(REGEX_INSIGHT); if (insightMatch) return <AssessmentHUD content={insightMatch[1].trim()} />;
        return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{sanitizedContent}</ReactMarkdown>;
    }, [content, isUser, components]);

    return (
        <motion.div layout="position" initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={SYSTEM.anim.fluid} className={cn('flex flex-col mb-10 w-full relative group isolate', isUser ? 'items-end' : 'items-start')}>
            {!isUser && (content || isStreaming) && <div className="flex items-center gap-2 mb-2 ml-1"><div className="w-[3px] h-[3px] bg-zinc-600 rounded-full" /><span className={SYSTEM.type.mono}>Command Center</span></div>}
            <div className={cn('relative max-w-[96%] sm:max-w-[92%] md:max-w-[88%]', isUser ? 'bg-white text-black rounded-[20px] rounded-tr-md shadow-[0_2px_10px_rgba(0,0,0,0.1)] px-5 py-3.5' : 'bg-transparent text-white px-0')}>
                <div className={cn('prose prose-invert max-w-none', isUser && 'prose-p:text-black/90')}>{renderContent}</div>
                {isStreaming && !content && <div className="flex items-center gap-2"><OrbitalRadar /><span className={SYSTEM.type.mono}>Processing...</span></div>}
                {!isUser && !isStreaming && content && (
                    <div className="absolute -right-8 top-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity delay-75">
                        <CopyButton content={content} />
                    </div>
                )}
            </div>
            {toolInvocations?.map((tool, idx) => <ToolResultCard key={tool.toolCallId || idx} toolName={tool.toolName} result={tool.result} state={tool.state} />)}
            {/* Post-draft modifier chips - only show on latest assistant message with email */}
            {hasEmailDraft && isLatest && onModify && <PostDraftModifiers onModify={onModify} />}
        </motion.div>
    );
});
MessageBubble.displayName = 'MessageBubble';

const ToolResultCard: FC<{ toolName: string; result: any; state: string }> = memo(({ toolName, result, state }) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const isComplete = state === 'result';
    const displayName = useMemo(() => toolName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '), [toolName]);

    // Auto-copy pay breakdown to clipboard on successful extraction
    useEffect(() => {
        if (!isComplete || !result) return;

        // Detect pay package results (from calculate_pay_package or campaign with pay data)
        if (toolName === 'calculate_pay_package' && result.breakdown) {
            const bd = result.breakdown;
            const payText = [
                `PAY BREAKDOWN`,
                `Weekly Gross: $${bd.weekly_gross || bd.gross_weekly_pay || 'N/A'}`,
                bd.hourly_rate ? `Hourly Rate: $${bd.hourly_rate}/hr` : null,
                bd.housing_stipend ? `Housing Stipend: $${bd.housing_stipend}/week` : null,
                bd.meals_stipend ? `Meals Stipend: $${bd.meals_stipend}/week` : null,
                bd.taxable_hourly ? `Taxable Hourly: $${bd.taxable_hourly}/hr` : null,
            ].filter(Boolean).join('\n');

            navigator.clipboard?.writeText(payText).catch(() => { });
        }

        // Auto-copy campaign summary
        if (toolName === 'create_campaign' && result.campaign_id) {
            const summary = `Campaign Created: ${result.message || ''}\nID: ${result.campaign_id}`;
            navigator.clipboard?.writeText(summary).catch(() => { });
        }
    }, [isComplete, result, toolName]);

    const handleCopyResult = useCallback(async () => {
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [result]);

    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-[16px] overflow-hidden', SYSTEM.surface.panel)}>
            <button onClick={() => isComplete && setExpanded(!expanded)} disabled={!isComplete} className={cn('w-full px-4 py-3 flex items-center justify-between text-left transition-colors', isComplete && 'hover:bg-white/[0.02] cursor-pointer')}>
                <div className="flex items-center gap-3">
                    <span className={cn(SYSTEM.type.mono, isComplete ? 'text-indigo-400' : 'text-zinc-500')}>{isComplete ? 'Result' : 'Running'}</span>
                    <span className={cn(SYSTEM.type.h1)}>{displayName}</span>
                </div>
                {!isComplete ? <OrbitalRadar /> : <ChevronRight size={14} className={cn('text-zinc-500 transition-transform', expanded && 'rotate-90')} />}
            </button>
            <AnimatePresence>
                {expanded && isComplete && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-white/[0.04]">
                            <div className="flex justify-end pt-2">
                                <button onClick={handleCopyResult} className="text-xs text-zinc-500 hover:text-indigo-400 flex items-center gap-1.5 transition-colors">
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <pre className="text-xs font-mono text-zinc-400 overflow-x-auto pt-1 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
});
ToolResultCard.displayName = 'ToolResultCard';

// ============================================================================
// 6. INPUT DECK
// ============================================================================

interface InputDeckProps {
    value: string; onChange: (value: string) => void; onSend: () => void; onStop: () => void; isProcessing: boolean; inputRef: React.RefObject<HTMLTextAreaElement>; attachments: Attachment[]; onRemoveAttachment: (id: string) => void; isDragActive: boolean; isUploading: boolean; dragHandlers: DragHandlerProps; handlePaste: (e: ClipboardEvent) => void; triggerFileSelect: () => void; captureScreenshot: () => void; isCaptureSupported: boolean; fileInputRef: React.RefObject<HTMLInputElement>; onFilesSelected: (files: FileList | null) => void;
}

const InputDeck: FC<InputDeckProps> = memo(({ value, onChange, onSend, onStop, isProcessing, inputRef, attachments, onRemoveAttachment, isDragActive, isUploading, dragHandlers, handlePaste, triggerFileSelect, captureScreenshot, isCaptureSupported, fileInputRef, onFilesSelected }) => {
    useAutoResizeTextArea(inputRef, value);
    const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

    const handleKeyDown = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if ((value.trim() || attachments.length > 0) && !isUploading) onSend(); } if (e.key === 'Escape' && isProcessing) { e.preventDefault(); onStop(); } };
    const canSend = (!!value.trim() || attachments.length > 0) && !isUploading;

    // Close lightbox on Escape
    useEffect(() => {
        if (!lightboxImage) return;
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [lightboxImage]);

    return (
        <>
            {/* Lightbox Modal */}
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
                                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
                            />
                            <div className="absolute -bottom-10 left-0 right-0 text-center text-sm text-zinc-400 truncate px-4">
                                {lightboxImage.name}
                            </div>
                            <button
                                onClick={() => setLightboxImage(null)}
                                className="absolute -top-3 -right-3 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input Deck */}
            <motion.div layout className={cn('flex flex-col p-1.5 relative overflow-hidden transition-all duration-300 will-change-transform backdrop-blur-[40px] saturate-[180%] bg-[#050505]/70 shadow-2xl', SYSTEM.geo.input, SYSTEM.surface.milled, 'focus-within:border-indigo-500/30', isDragActive && 'border-indigo-500/50 scale-[1.01]')} transition={SYSTEM.anim.fluid} {...dragHandlers}>
                <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" className="hidden" onChange={(e) => onFilesSelected(e.target.files)} />
                <AnimatePresence>
                    {attachments.length > 0 && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-2 pt-2">
                            <div className="mb-2 px-1 flex items-center justify-between">
                                <span className="text-[10px] tracking-wide uppercase text-zinc-500">
                                    {attachments.length} Attachment{attachments.length > 1 ? 's' : ''}
                                </span>
                                {isUploading && (
                                    <span className="text-[10px] text-zinc-500">Uploading…</span>
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
                                                    'relative w-[74px] h-[74px] rounded-2xl border overflow-hidden bg-zinc-900/70',
                                                    att.skippedAnalysis ? 'border-amber-500/40' : 'border-white/15',
                                                    att.previewUrl ? 'cursor-zoom-in' : 'cursor-default'
                                                )}
                                            >
                                                {att.previewUrl ? (
                                                    <img
                                                        src={att.previewUrl}
                                                        className="w-full h-full object-cover"
                                                        alt={att.fileName || 'Attachment'}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <FileText size={22} className="text-zinc-500" />
                                                    </div>
                                                )}

                                                {att.isUploading && (
                                                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                                                        <Loader2 size={16} className="animate-spin text-zinc-200" />
                                                    </div>
                                                )}

                                                <div className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-md bg-black/70 border border-white/10 text-[8px] font-medium uppercase text-zinc-200">
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
                <div className="flex items-end gap-2">
                    <button onClick={triggerFileSelect} disabled={isProcessing} className="p-3.5 min-h-[48px] min-w-[48px] rounded-[18px] transition-colors text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-50" aria-label="Attach"><Paperclip size={18} strokeWidth={1.5} /></button>
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
                    <textarea ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder={isDragActive ? 'Drop files here...' : 'Message Command Center...'} rows={1} disabled={isProcessing} className={cn('flex-1 bg-transparent border-none outline-none resize-none py-4 min-h-[52px] max-h-[160px]', SYSTEM.type.body, 'text-white placeholder:text-zinc-500 disabled:opacity-50', isDragActive && 'placeholder:text-indigo-400')} />
                    <motion.button initial={{ scale: 0.9 }} animate={{ scale: 1 }} whileTap={{ scale: 0.92 }} onClick={() => isProcessing ? onStop() : onSend()} disabled={!isProcessing && !canSend} className={cn('p-3 min-h-[48px] min-w-[48px] rounded-[18px] transition-all duration-300', canSend || isProcessing ? 'bg-white text-black' : 'bg-white/5 text-zinc-600 cursor-not-allowed')}>{isProcessing ? <Square size={18} className="animate-pulse" /> : isUploading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}</motion.button>
                </div>
                <AnimatePresence>{isDragActive && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-500/30 rounded-[24px] pointer-events-none flex items-center justify-center backdrop-blur-sm"><div className="flex items-center gap-2 text-indigo-400"><Paperclip size={20} /><span className="text-[13px] font-medium">Drop to attach</span></div></motion.div>}</AnimatePresence>
            </motion.div>
        </>
    );
});
InputDeck.displayName = 'InputDeck';

// ============================================================================
// 7. ERROR BOUNDARY & MAIN WRAPPER
// ============================================================================

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[CommandCenter] Error:', error, info); }
    render() {
        if (this.state.hasError) return <div className="fixed bottom-8 right-8 z-50 p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl backdrop-blur-md"><div className="flex items-center gap-3"><div className="w-2 h-2 bg-rose-500 rounded-full" /><span className="text-rose-400 text-sm font-medium">Command Center error. Please refresh.</span></div></div>;
        return this.props.children;
    }
}

const InnerCommandCenter: FC<{ isOpen: boolean; setIsOpen: (v: boolean) => void }> = ({ isOpen, setIsOpen }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const { workspaceMode, setWorkspaceMode } = useLayout();
    const [inputValue, setInputValue] = useState('');
    const [modeContext, setModeContext] = useState(''); // Hidden mode context from chips
    const [isMobile, setIsMobile] = useState(false);
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const mountedRef = useRef(true);
    const { showToast } = useToast();

    // PERF: ResizeObserver + RAF scroll (eliminates forced reflow during streaming)
    const { containerRef: scrollRef, contentRef, isPinned, scrollToBottomNow } = usePinnedScroll({
        bottomThresholdPx: 100,
    });

    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(max-width: 768px)');
        const update = () => setIsMobile(mq.matches);
        update();
        if (typeof mq.addEventListener === 'function') mq.addEventListener('change', update);
        else mq.addListener(update);
        return () => {
            if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', update);
            else mq.removeListener(update);
        };
    }, []);

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

    const keyboardWasOpenRef = useRef(false);
    useEffect(() => {
        if (!isMobile) return;
        const isOpen = keyboardOffset > 0;
        if (isOpen && !keyboardWasOpenRef.current) {
            scrollToBottomNow();
        }
        keyboardWasOpenRef.current = isOpen;
    }, [isMobile, keyboardOffset, scrollToBottomNow]);

    const isKeyboardOpen = isMobile && keyboardOffset > 0;

    const { messages, isLoading, isStreaming, error, sendMessage, clearChat, stop } = useCommandCenterChat({
        onToolCall: useCallback((toolName: string, args: any) => {
            if (toolName === 'set_ui_state') window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: args }));
            if (['add_prospect', 'update_negotiation', 'create_follow_up'].includes(toolName)) window.dispatchEvent(new CustomEvent('refresh_dashboard'));
        }, []),
    });

    const { attachments, isDragActive, isUploading, addFiles, captureScreenshot, isCaptureSupported, removeFile, clearAll: clearAttachments, dragHandlers, handlePaste, fileInputRef, triggerFileSelect, totalPayloadSize } = useFileUpload({
        onUploadError: (err, file) => { console.error(`Upload error: ${file.name}`, err); showToast(`Upload failed: ${file.name}`); },
    });

    // PATCH 2: Document-level paste capture (single paste target)
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

            const hasImage = Array.from(items).some(i => i.type?.startsWith('image/'));
            if (!hasImage) return; // allow normal text paste

            // Intercept image paste once at capture phase to avoid duplicate add via textarea onPaste.
            clipboardEvent.preventDefault();
            clipboardEvent.stopPropagation();
            handlePaste(clipboardEvent as unknown as React.ClipboardEvent);
        };

        document.addEventListener('paste', onPasteCapture, true);
        return () => document.removeEventListener('paste', onPasteCapture, true);
    }, [isOpen, handlePaste]);

    // PERF: Stable history (frozen during streaming) + isolated streaming message
    // This splits O(N) per-token reconciliation → O(1) by only updating the streaming bubble
    const stableHistory = useMemo(() => {
        // During streaming, exclude the last message (it's rendered separately)
        const endIndex = isStreaming ? Math.max(0, messages.length - 1) : messages.length;
        return messages.slice(0, endIndex).map(msg => ({
            id: msg.id, // Already stable from useCommandCenterChat's generateId()
            role: msg.role as 'user' | 'assistant',
            content: msg.content || '',
            toolInvocations: msg.toolInvocations as ToolInvocation[]
        }));
        // Only recalculate when message count changes (not on every token)
    }, [messages.length, isStreaming]);

    // The streaming message (updates on every token, but only this component re-renders)
    const streamingMessage = isStreaming && messages.length > 0 ? messages[messages.length - 1] : null;

    // 413 PAYLOAD GUARD (Critical Fix)
    const handleSend = useCallback(async (query?: string) => {
        const text = query ?? inputValue.trim();
        if ((!text && attachments.length === 0) || isLoading || isUploading) return;

        let safeFileAttachments = undefined;
        const linkAttachments = attachments
            .filter(a => a.publicUrl && a.mimeType?.startsWith('image/') && (a.skippedAnalysis || !a.base64Data || totalPayloadSize > MAX_PAYLOAD_BYTES))
            .map(a => ({ url: a.publicUrl!, mimeType: a.mimeType, fileName: a.fileName }));

        if (totalPayloadSize > MAX_PAYLOAD_BYTES) {
            const mb = (totalPayloadSize / (1024 * 1024)).toFixed(1);
            showToast(`Payload large (${mb}MB). Sending files as links only.`);
        } else {
            safeFileAttachments = attachments
                .filter(a => a.base64Data && !a.skippedAnalysis)
                .map(a => ({ base64: a.base64Data!, mimeType: a.mimeType, fileName: a.fileName }));
            if (safeFileAttachments.length === 0) safeFileAttachments = undefined;
        }

        let msg = text;
        if (attachments.length > 0) {
            const links = attachments.filter(a => a.publicUrl).map(a => {
                const status = a.skippedAnalysis || (totalPayloadSize > MAX_PAYLOAD_BYTES) ? ' (Link Only)' : '';
                return `[📎 ${a.fileName}](${a.publicUrl})${status}`;
            }).join('\n');
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
            },
        });
    }, [inputValue, attachments, isLoading, isUploading, sendMessage, clearAttachments, showToast, totalPayloadSize, modeContext]);

    const containerStyle = useMemo(() => {
        if (isMinimized) return { height: 48, width: 200, bottom: 32, right: 32, borderRadius: 9999 };
        if (isMobile) return { height: '100dvh', width: '100%', bottom: 0, right: 0, borderRadius: 0 };
        if (workspaceMode === 'full') return { height: '100dvh', width: '100%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        if (workspaceMode === 'split') return { height: '100dvh', width: '50%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        return { height: 'min(840px, 90dvh)', width: 460, bottom: 32, right: 32, borderRadius: 28 };
    }, [isMinimized, isMobile, workspaceMode]);

    if (!isOpen) return (
        <motion.button
            onClick={() => setIsOpen(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
                'fixed z-50 flex items-center gap-3 px-6 py-3 rounded-full bg-[#0A0A0B] border border-white/10 shadow-2xl hover:border-white/20 transition-colors',
                isMobile ? 'left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] justify-center' : 'bottom-8 right-8'
            )}
            aria-label="Open Chat"
        >
            <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
            <span className={SYSTEM.type.h1}>Command Center</span>
        </motion.button>
    );
    if (isMinimized) return (
        <motion.button
            layoutId="chat"
            onClick={() => setIsMinimized(false)}
            className={cn(
                'fixed z-50 flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl border-t border-white/10',
                SYSTEM.surface.glass,
                isMobile ? 'left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] justify-center' : ''
            )}
            style={isMobile ? undefined : { bottom: 32, right: 32 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Expand"
        >
            {isLoading && <OrbitalRadar />}
            <span className={SYSTEM.type.h1}>{isLoading ? 'Working...' : 'Command Center'}</span>
        </motion.button>
    );

    return (
        <LayoutGroup>
            <motion.div layoutId="chat" className={cn('fixed z-50 flex flex-col overflow-hidden isolate border border-white/[0.08] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]', SYSTEM.surface.void)} style={{ ...containerStyle, willChange: 'transform' }}>
                <FilmGrain />
                <header className={cn(
                    'flex items-center justify-between px-4 sm:px-8 shrink-0 z-20 select-none backdrop-blur-[40px] saturate-[180%] bg-[#050505]/60 border-b border-white/[0.08] transition-[padding] duration-150 ease-out',
                    SYSTEM.surface.glass,
                    isKeyboardOpen
                        ? 'pt-[calc(env(safe-area-inset-top)+4px)] pb-1'
                        : 'pt-[calc(env(safe-area-inset-top)+12px)] sm:pt-6 pb-3 sm:pb-2'
                )}>
                    <div className="flex items-center gap-3"><Zap size={16} className="text-indigo-500" /><span className={SYSTEM.type.h1}>Command Center <span className="text-white/30 font-normal ml-1">Weissach</span></span></div>
                    <div className="flex items-center gap-2">
                        {/* PATCH 3: Only show Clear when session has state */}
                        {(messages.length > 0 || attachments.length > 0) && (
                            <button
                                onClick={() => { clearChat(); clearAttachments(); setModeContext(''); }}
                                className="px-3 py-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all text-[11px] font-medium"
                            >
                                Clear
                            </button>
                        )}
                        <button
                            onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')}
                            className={cn('p-2 text-zinc-600 hover:text-white transition-colors', isMobile && 'hidden')}
                        >
                            {workspaceMode === 'floating' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                        </button>
                        <button
                            onClick={() => setIsMinimized(true)}
                            className={cn('p-2 text-zinc-600 hover:text-white transition-colors', isMobile && 'hidden')}
                        >
                            <Minimize2 size={16} />
                        </button>
                        <button onClick={() => { setIsOpen(false); setWorkspaceMode('floating'); }} className="p-2 text-zinc-600 hover:text-white transition-colors"><X size={16} /></button>
                    </div>
                </header>
                <div
                    ref={scrollRef}
                    className="relative flex-1 overflow-y-auto px-4 sm:px-6 pt-3 sm:pt-4 pb-40 sm:pb-44 scroll-smooth no-scrollbar z-10"
                    style={isMobile ? { paddingBottom: 220 + keyboardOffset } : undefined}
                >
                    <div ref={contentRef}>
                        <AnimatePresence mode="popLayout">
                            {stableHistory.length === 0 && !streamingMessage ? (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex flex-col items-center justify-center text-center opacity-40 pt-20">
                                    <div className="w-20 h-20 rounded-[24px] border border-white/10 bg-white/5 flex items-center justify-center mb-6"><Users size={28} className="text-zinc-600" /></div>
                                    <p className={SYSTEM.type.mono}>System Ready</p><p className="text-[13px] text-zinc-600 mt-2 max-w-[280px]">Recruiting intelligence active.</p>
                                    {/* Pulse Grid for "Alive" Feel */}
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
                                </motion.div>
                            ) : (
                                <>
                                    {/* Stable history: frozen during streaming (O(1) reconciliation) */}
                                    {stableHistory.map((msg, idx) => (
                                        <MessageBubble
                                            key={msg.id}
                                            role={msg.role}
                                            content={msg.content}
                                            isStreaming={false}
                                            toolInvocations={msg.toolInvocations}
                                            onModify={handleSend}
                                            isLatest={idx === stableHistory.length - 1 && !streamingMessage}
                                        />
                                    ))}
                                    {/* Streaming message: only this component updates per token */}
                                    {streamingMessage && (
                                        <MessageBubble
                                            key={streamingMessage.id}
                                            role={streamingMessage.role as 'user' | 'assistant'}
                                            content={streamingMessage.content || ''}
                                            isStreaming={true}
                                            toolInvocations={streamingMessage.toolInvocations as ToolInvocation[]}
                                            onModify={handleSend}
                                            isLatest={true}
                                        />
                                    )}
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    {/* Jump to bottom button when user scrolls up */}
                    {!isPinned && (stableHistory.length > 0 || streamingMessage) && (
                        <button
                            onClick={scrollToBottomNow}
                            className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-full bg-black/80 border border-white/10 text-xs text-zinc-300 backdrop-blur-md hover:bg-black/90 transition-all"
                        >
                            Jump to latest
                        </button>
                    )}
                </div>
                <footer
                    className={cn('absolute bottom-0 left-0 right-0 z-30 px-4 sm:px-5 pt-16 sm:pt-20 pb-[max(2rem,env(safe-area-inset-bottom,0.5rem))] bg-gradient-to-t from-[#030303] via-[#030303]/95 to-transparent pointer-events-none')}
                    style={isMobile && keyboardOffset ? { transform: `translateY(-${keyboardOffset}px)`, transition: 'transform 160ms ease' } : undefined}
                >
                    <div className="pointer-events-auto relative">
                        <AnimatePresence>{isLoading && <ThinkingPill onStop={stop} status={isStreaming ? 'streaming' : 'thinking'} />}</AnimatePresence>
                        {/* Mode Pill: Shows selected mode with clear button */}
                        {modeContext && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-3 flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]"
                            >
                                <span className={cn(SYSTEM.type.mono, 'text-[10px] text-zinc-400')}>
                                    Mode: {modeContext}
                                </span>
                                <button
                                    onClick={() => setModeContext('')}
                                    className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition"
                                    aria-label="Clear mode"
                                >
                                    <X size={14} />
                                </button>
                            </motion.div>
                        )}
                        <AnimatePresence>{stableHistory.length < 2 && !streamingMessage && !isLoading && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4"><ModeChips value={modeContext} onChange={setModeContext} /></motion.div>}</AnimatePresence>
                        <InputDeck value={inputValue} onChange={setInputValue} onSend={() => handleSend()} onStop={stop} isProcessing={isLoading} inputRef={inputRef} attachments={attachments} onRemoveAttachment={removeFile} isDragActive={isDragActive} isUploading={isUploading} dragHandlers={dragHandlers} handlePaste={handlePaste} triggerFileSelect={triggerFileSelect} captureScreenshot={() => void captureScreenshot()} isCaptureSupported={isCaptureSupported} fileInputRef={fileInputRef} onFilesSelected={(files) => files && addFiles(files)} />
                        {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-between"><span className="text-[12px] text-rose-400">{error.includes('404') ? '⚡ Cold start. Tap send again.' : `Error: ${error}`}</span><button onClick={() => handleSend()} className="ml-3 px-2 py-1 text-[11px] font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded border border-rose-500/30 transition-colors">Retry</button></motion.div>}
                    </div>
                </footer>
            </motion.div>
        </LayoutGroup>
    );
};

// ============================================================================
// 9. MAIN EXPORT
// ============================================================================

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
