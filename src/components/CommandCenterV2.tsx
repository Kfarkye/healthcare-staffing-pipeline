/* ============================================================================
   CommandCenterV2.tsx
   "Obsidian Weissach" — Healthcare Staffing Edition (v2.8 - 413 Fixed)
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
    Search, FileText, DollarSign, Users, Activity, Calendar, ChevronRight,
    Zap, Loader2, Image as ImageIcon, ExternalLink, Mail,
} from 'lucide-react';

// Obsidian Weissach Design System
import {
    SYSTEM, cn, triggerHaptic, copyToClipboard as systemCopyToClipboard,
    FilmGrain, OrbitalRadar, ToastProvider, useToast,
} from '../design-system/obsidian';

import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { useFileUpload, type Attachment } from '../features/command-center-chat/hooks/useFileUpload';
import { useLayout } from '../context/LayoutContext';

// ============================================================================
// 0. CONSTANTS
// ============================================================================

// Vercel Payload Safety Limit (4MB safe buffer against 4.5MB limit)
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

const REGEX_EMAIL = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const REGEX_NOVA_ID = /^\d{6,8}$/;
const REGEX_ATTACHMENT = /\[Attached:\s*([^\]]+)\]\(([^)]+)\)/g;
const REGEX_VERDICT = /VERDICT:\s*(STRONG MATCH|REVIEW NEEDED|NOT A FIT)/i;
const REGEX_INSIGHT = /(?:INSIGHT|ASSESSMENT|KEY QUALIFICATIONS):\s*(.+)/is;
const REGEX_EMAIL_HEADER = /^#\s*EMAIL\s*DRAFT[\r\n]+/i;
const REGEX_EMAIL_TO = /(?:\*\*)?To:(?:\*\*)?\s*([^\r\n]+)/i;
const REGEX_EMAIL_SUBJECT = /(?:\*\*)?Subject:(?:\*\*)?\s*([^\r\n]+)/i;
const REGEX_EMAIL_BODY = /---[\r\n]+([\s\S]+?)(?:[\r\n]+---[\r\n]*(?:$|[\r\n])|$)/;

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

const RECRUITING_PHASES = ['SEARCHING DATABASE', 'ANALYZING MATCH', 'CALCULATING PACKAGE', 'DRAFTING RESPONSE'] as const;

interface ToolInvocation { toolName: string; toolCallId: string; state: 'result' | 'call' | 'pending'; args: any; result?: any; }
interface DragHandlerProps { onDragEnter: (e: ReactDragEvent) => void; onDragOver: (e: ReactDragEvent) => void; onDragLeave: (e: ReactDragEvent) => void; onDrop: (e: ReactDragEvent) => void; }

// ============================================================================
// 1. HELPERS & HOOKS
// ============================================================================

const useAutoResizeTextArea = (ref: React.RefObject<HTMLTextAreaElement>, value: string) => {
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = '52px';
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

// ============================================================================
// 2. VISUAL PRIMITIVES
// ============================================================================

const InlineImageThumbnail: FC<{ href: string; label: string }> = memo(({ href, label }) => {
    const cleanLabel = stripPaperclip(label);
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block my-3 no-underline group max-w-[380px]" onClick={(e) => e.stopPropagation()} title={`Open ${cleanLabel}`}>
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all shadow-lg">
                <div className="relative aspect-video bg-black/50">
                    <img src={href} alt={cleanLabel} loading="lazy" className="absolute inset-0 w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🖼️</text></svg>'; }} />
                    <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 border border-white/10 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ExternalLink size={12} className="text-white/70" /></div>
                </div>
                <div className="px-3 py-2 flex items-center gap-2 bg-black/20"><ImageIcon size={12} className="text-emerald-400 shrink-0" /><span className="text-[11px] text-zinc-300 truncate">{cleanLabel}</span></div>
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
    return <button onClick={handleCopy} aria-label="Copy" className={cn('p-1.5 rounded-md transition-all duration-200', copied ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5')}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>;
});
CopyButton.displayName = 'CopyButton';

// ============================================================================
// 3. INTELLIGENCE & CARDS
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
        <motion.div layout initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} transition={SYSTEM.anim.fluid} className="absolute bottom-[100%] left-1/2 -translate-x-1/2 mb-6 z-30 flex items-center gap-3 px-4 py-2 rounded-full bg-[#050505] border border-white/10 shadow-2xl backdrop-blur-md">
            <OrbitalRadar /><AnimatePresence mode="wait"><motion.span key={txt} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(4px)' }} className={cn(SYSTEM.type.mono, 'text-zinc-300 min-w-[120px] text-center')}>{txt}</motion.span></AnimatePresence>{onStop && <button onClick={onStop} className="ml-1 text-zinc-600 hover:text-zinc-200 p-1"><Square size={10} fill="currentColor" /></button>}
        </motion.div>
    );
});
ThinkingPill.displayName = 'ThinkingPill';

const SmartChips: FC<{ onSelect: (query: string) => void }> = memo(({ onSelect }) => (
    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide px-1">
        {[{ icon: <Search size={12} />, label: 'Find Candidates', query: 'Find candidates for this position.' }, { icon: <FileText size={12} />, label: 'Screen Resume', query: 'Screen this resume and provide assessment.' }, { icon: <DollarSign size={12} />, label: 'Analyze Pay', query: 'Calculate competitive pay package for this role.' }, { icon: <Calendar size={12} />, label: 'Schedule', query: 'Help me schedule an interview.' }].map((chip, index) => (
            <motion.button key={chip.label} onClick={() => { triggerHaptic(); onSelect(chip.query); }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, ...SYSTEM.anim.fluid }} whileHover={{ scale: 1.02, y: -1, backgroundColor: 'rgba(255,255,255,0.06)' }} whileTap={{ scale: 0.98 }} className={cn('flex-shrink-0 flex items-center gap-2 px-3.5 py-2 bg-white/[0.03] border border-white/[0.08] transition-all backdrop-blur-sm', SYSTEM.geo.pill)}><span className="text-zinc-400">{chip.icon}</span><span className="text-[10px] font-medium text-zinc-300 tracking-wide uppercase">{chip.label}</span></motion.button>
        ))}
    </div>
));
SmartChips.displayName = 'SmartChips';

// ============================================================================
// 4. EMAIL & ATTACHMENT HANDLING
// ============================================================================

const EmailCard: FC<{ to?: string; subject: string; body: string }> = memo(({ to, subject, body }) => {
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const handleCopy = useCallback(async (text: string, field: string) => { await systemCopyToClipboard(text); setCopiedField(field); triggerHaptic(); setTimeout(() => setCopiedField(null), 2000); }, []);
    const formattedBody = useMemo(() => body.replace(/  \n/g, '\n').replace(/^---\s*$/gm, '').trim(), [body]);
    const isLongBody = formattedBody.length > 600 || formattedBody.split('\n').length > 15;
    const outlookLink = useMemo(() => `mailto:${to || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(formattedBody)}`, [to, subject, formattedBody]);
    const handleOpenOutlook = useCallback(() => { triggerHaptic(); window.open(outlookLink, '_blank'); }, [outlookLink]);
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SYSTEM.anim.fluid} className={cn('rounded-[20px] overflow-hidden bg-white/[0.02] backdrop-blur-md border border-white/[0.08] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]')}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center"><FileText size={14} className="text-indigo-400" /></div><span className={cn(SYSTEM.type.mono, 'text-indigo-400')}>Email Draft</span></div><div className="flex items-center gap-2"><motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleOpenOutlook} className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-[11px] font-medium text-zinc-300 bg-white/[0.06] hover:bg-indigo-500/20 hover:text-indigo-300"><Mail size={12} /> Open in Outlook</motion.button><motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleCopy(`${to ? `To: ${to}\n` : ''}Subject: ${subject}\n\n${formattedBody}`, 'all')} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-[11px] font-medium', copiedField === 'all' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-300 bg-white/[0.06] hover:bg-white/[0.1]')}>{copiedField === 'all' ? <Check size={12} /> : <Copy size={12} />} {copiedField === 'all' ? 'Copied!' : 'Copy All'}</motion.button></div></div>
            {to && <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01] flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px]')}>To</span><p className="text-[14px] font-medium text-white mt-0.5">{to}</p></div><button onClick={() => handleCopy(to, 'to')} className="text-zinc-400 hover:text-white">{copiedField === 'to' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button></div>}
            <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01] flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px]')}>Subject</span><p className="text-[14px] font-medium text-white mt-0.5 line-clamp-2">{subject}</p></div><button onClick={() => handleCopy(subject, 'subject')} className="text-zinc-400 hover:text-white">{copiedField === 'subject' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button></div>
            <div className="px-5 py-4 relative group"><div className={cn('flex-1 min-w-0 relative', !isExpanded && isLongBody && 'max-h-[280px] overflow-hidden')}><div className={cn(SYSTEM.type.body, 'text-[#C4C4C4] whitespace-pre-wrap leading-relaxed')}>{formattedBody.split(REGEX_EMAIL).map((part, i) => REGEX_EMAIL.test(part) ? <span key={i} className="text-indigo-400 cursor-pointer underline">{part}</span> : part)}</div>{!isExpanded && isLongBody && <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0A0A0B] to-transparent pointer-events-none" />}</div>{isLongBody && <button onClick={() => setIsExpanded(!isExpanded)} className="mt-3 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors">{isExpanded ? '↑ Show Less' : '↓ Show Full Email'}</button>}</div>
        </motion.div>
    );
});
EmailCard.displayName = 'EmailCard';

const UserAttachment: FC<{ filename: string; url: string }> = memo(({ filename, url }) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|heic)$/i.test(filename);
    return (
        <motion.a href={url} target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.02 }} className="flex items-center gap-3 mt-3 p-2 rounded-xl bg-black/20 border border-white/10 hover:bg-black/30 transition-all cursor-pointer group">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">{isImage ? <img src={url} alt="" className="w-full h-full object-cover" /> : <FileText size={20} className="text-rose-400" />}</div>
            <div className="flex-1 min-w-0"><p className="text-[12px] text-indigo-400 truncate group-hover:text-indigo-300 transition-colors">{filename}</p><p className="text-[10px] text-zinc-500 mt-0.5">{isImage ? 'Image' : 'Document'}</p></div>
        </motion.a>
    );
});
UserAttachment.displayName = 'UserAttachment';

// ============================================================================
// 5. MESSAGE BUBBLE
// ============================================================================

interface MessageBubbleProps { role: 'user' | 'assistant'; content: string; isStreaming?: boolean; toolInvocations?: ToolInvocation[]; }
const MessageBubble: FC<MessageBubbleProps> = memo(({ role, content, isStreaming, toolInvocations }) => {
    const isUser = role === 'user';
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
        if (isUser) {
            const attachments: { filename: string; url: string }[] = [];
            let match; REGEX_ATTACHMENT.lastIndex = 0;
            while ((match = REGEX_ATTACHMENT.exec(content)) !== null) attachments.push({ filename: match[1].trim(), url: match[2] });
            if (attachments.length > 0) { const txt = content.replace(REGEX_ATTACHMENT, '').trim(); return <>{txt && <p className={cn(SYSTEM.type.body, 'text-[#1a1a1a]')}>{txt}</p>}{attachments.map((a, i) => <UserAttachment key={i} filename={a.filename} url={a.url} />)}</>; }
        }
        const emailMatch = content.match(REGEX_EMAIL_HEADER);
        if (emailMatch) {
            const to = content.match(REGEX_EMAIL_TO)?.[1].trim(); const sub = content.match(REGEX_EMAIL_SUBJECT)?.[1].trim(); const body = content.match(REGEX_EMAIL_BODY); const rem = content.split('---').pop()?.replace(/^IMPORTANT[\s\S]*/, '').trim();
            if (sub) return <><EmailCard to={to} subject={sub} body={body ? body[1].trim() : ''} />{rem && <div className="mt-4"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{rem}</ReactMarkdown></div>}</>;
        }
        const verdictMatch = content.match(REGEX_VERDICT); if (verdictMatch) return <CandidateVerdict verdict={verdictMatch[1].toUpperCase() as any} details={content.replace(verdictMatch[0], '').trim()} />;
        const insightMatch = content.match(REGEX_INSIGHT); if (insightMatch) return <AssessmentHUD content={insightMatch[1].trim()} />;
        return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>;
    }, [content, isUser, components]);

    return (
        <motion.div layout="position" initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={SYSTEM.anim.fluid} className={cn('flex flex-col mb-10 w-full relative group isolate', isUser ? 'items-end' : 'items-start')}>
            {!isUser && (content || isStreaming) && <div className="flex items-center gap-2 mb-2 ml-1"><div className="w-[3px] h-[3px] bg-zinc-600 rounded-full" /><span className={SYSTEM.type.mono}>Command Center</span></div>}
            <div className={cn('relative max-w-[92%] md:max-w-[88%]', isUser ? 'bg-white text-black rounded-[20px] rounded-tr-md shadow-[0_2px_10px_rgba(0,0,0,0.1)] px-5 py-3.5' : 'bg-transparent text-white px-0')}>
                <div className={cn('prose prose-invert max-w-none', isUser && 'prose-p:text-black/90')}>{renderContent}</div>
                {isStreaming && !content && <div className="flex items-center gap-2"><OrbitalRadar /><span className={SYSTEM.type.mono}>Processing...</span></div>}
                {!isUser && !isStreaming && content && <div className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity delay-75"><CopyButton content={content} /></div>}
            </div>
            {toolInvocations?.map((tool, idx) => <ToolResultCard key={tool.toolCallId || idx} toolName={tool.toolName} result={tool.result} state={tool.state} />)}
        </motion.div>
    );
});
MessageBubble.displayName = 'MessageBubble';

const ToolResultCard: FC<{ toolName: string; result: any; state: string }> = memo(({ toolName, result, state }) => {
    const [expanded, setExpanded] = useState(false); const isComplete = state === 'result'; const displayName = useMemo(() => toolName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '), [toolName]);
    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-[16px] overflow-hidden', SYSTEM.surface.panel)}>
            <button onClick={() => isComplete && setExpanded(!expanded)} disabled={!isComplete} className={cn('w-full px-4 py-3 flex items-center justify-between text-left transition-colors', isComplete && 'hover:bg-white/[0.02] cursor-pointer')}><div className="flex items-center gap-3"><span className={cn(SYSTEM.type.mono, isComplete ? 'text-indigo-400' : 'text-zinc-500')}>{isComplete ? 'Result' : 'Running'}</span><span className={cn(SYSTEM.type.h1)}>{displayName}</span></div>{!isComplete ? <OrbitalRadar /> : <ChevronRight size={14} className={cn('text-zinc-500 transition-transform', expanded && 'rotate-90')} />}</button>
            <AnimatePresence>{expanded && isComplete && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="px-4 pb-4 border-t border-white/[0.04]"><pre className="text-xs font-mono text-zinc-400 overflow-x-auto pt-3 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre></div></motion.div>}</AnimatePresence>
        </motion.div>
    );
});
ToolResultCard.displayName = 'ToolResultCard';

// ============================================================================
// 6. INPUT DECK
// ============================================================================

interface InputDeckProps {
    value: string; onChange: (value: string) => void; onSend: () => void; onStop: () => void; isProcessing: boolean; inputRef: React.RefObject<HTMLTextAreaElement>; attachments: Attachment[]; onRemoveAttachment: (id: string) => void; isDragActive: boolean; isUploading: boolean; dragHandlers: DragHandlerProps; handlePaste: (e: ClipboardEvent) => void; triggerFileSelect: () => void; fileInputRef: React.RefObject<HTMLInputElement>; onFilesSelected: (files: FileList | null) => void;
}

const InputDeck: FC<InputDeckProps> = memo(({ value, onChange, onSend, onStop, isProcessing, inputRef, attachments, onRemoveAttachment, isDragActive, isUploading, dragHandlers, handlePaste, triggerFileSelect, fileInputRef, onFilesSelected }) => {
    useAutoResizeTextArea(inputRef, value);
    const handleKeyDown = (e: ReactKeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if ((value.trim() || attachments.length > 0) && !isUploading) onSend(); } if (e.key === 'Escape' && isProcessing) { e.preventDefault(); onStop(); } };
    const canSend = (!!value.trim() || attachments.length > 0) && !isUploading;
    return (
        <motion.div layout className={cn('flex flex-col p-1.5 relative overflow-hidden transition-all duration-300 will-change-transform', SYSTEM.geo.input, 'bg-[#0A0A0B] shadow-2xl', SYSTEM.surface.milled, 'focus-within:border-indigo-500/30', isDragActive && 'border-indigo-500/50 scale-[1.01]')} transition={SYSTEM.anim.fluid} {...dragHandlers}>
            <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" className="hidden" onChange={(e) => onFilesSelected(e.target.files)} />
            <AnimatePresence>
                {attachments.length > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-2 pt-2">
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {attachments.map((att) => (
                                <div key={att.id} className={cn("relative group flex-shrink-0 w-14 h-14 rounded-xl bg-white/5 border overflow-hidden", att.skippedAnalysis ? "border-amber-500/50" : "border-white/10")}>
                                    {att.previewUrl ? <img src={att.previewUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" /> : <div className="w-full h-full flex items-center justify-center"><FileText size={20} className="text-zinc-500" /></div>}
                                    {att.isUploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-indigo-400" /></div>}
                                    {att.skippedAnalysis && !att.isUploading && <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-[8px] font-bold text-black text-center py-0.5">LINK ONLY</div>}
                                    <button onClick={() => onRemoveAttachment(att.id)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={16} className="text-white" /></button>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex items-end gap-2">
                <button onClick={triggerFileSelect} disabled={isProcessing} className="p-3.5 rounded-[18px] transition-colors text-zinc-500 hover:text-white hover:bg-white/5 disabled:opacity-50" aria-label="Attach"><Paperclip size={18} strokeWidth={1.5} /></button>
                <textarea ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder={isDragActive ? 'Drop files here...' : 'Message Command Center...'} rows={1} disabled={isProcessing} className={cn('flex-1 bg-transparent border-none outline-none resize-none py-4 min-h-[52px] max-h-[160px]', SYSTEM.type.body, 'text-white placeholder:text-zinc-500 disabled:opacity-50', isDragActive && 'placeholder:text-indigo-400')} />
                <motion.button initial={{ scale: 0.9 }} animate={{ scale: 1 }} whileTap={{ scale: 0.92 }} onClick={() => isProcessing ? onStop() : onSend()} disabled={!isProcessing && !canSend} className={cn('p-3 rounded-[18px] transition-all duration-300', canSend || isProcessing ? 'bg-white text-black' : 'bg-white/5 text-zinc-600 cursor-not-allowed')}>{isProcessing ? <Square size={18} className="animate-pulse" /> : isUploading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}</motion.button>
            </div>
            <AnimatePresence>{isDragActive && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-500/30 rounded-[24px] pointer-events-none flex items-center justify-center backdrop-blur-sm"><div className="flex items-center gap-2 text-indigo-400"><Paperclip size={20} /><span className="text-[13px] font-medium">Drop to attach</span></div></motion.div>}</AnimatePresence>
        </motion.div>
    );
});
InputDeck.displayName = 'InputDeck';

// ============================================================================
// 7. ERROR BOUNDARY (Prevents White Screen Crashes)
// ============================================================================

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[CommandCenter] Error Boundary caught:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed bottom-8 right-8 z-50 p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-rose-500 rounded-full" />
                        <span className="text-rose-400 text-sm font-medium">Command Center error. Please refresh.</span>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// ============================================================================
// 8. INNER COMMAND CENTER (LOGIC CORE)
// ============================================================================

const InnerCommandCenter: FC<{ isOpen: boolean; setIsOpen: (v: boolean) => void }> = ({ isOpen, setIsOpen }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const { workspaceMode, setWorkspaceMode } = useLayout();
    const [inputValue, setInputValue] = useState('');
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Unmount safety: prevents setState after unmount when stream is active
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Safe to use here because InnerCommandCenter is a child of ToastProvider
    const { showToast } = useToast();

    const { messages, isLoading, isStreaming, error, sendMessage, clearChat, stop } = useCommandCenterChat({
        onToolCall: useCallback((toolName: string, args: any) => {
            if (toolName === 'set_ui_state') window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: args }));
            if (['add_prospect', 'update_negotiation', 'create_follow_up'].includes(toolName)) window.dispatchEvent(new CustomEvent('refresh_dashboard'));
        }, []),
    });

    const { attachments, isDragActive, isUploading, addFiles, removeFile, clearAll: clearAttachments, dragHandlers, handlePaste, fileInputRef, triggerFileSelect, totalPayloadSize } = useFileUpload({
        onUploadError: (err, file) => {
            console.error(`Upload error: ${file.name}`, err);
            showToast(`Upload failed: ${file.name}`);
        },
    });

    const history = useMemo(() => messages.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content || '', toolInvocations: msg.toolInvocations as ToolInvocation[] })), [messages]);

    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
    }, []);

    useLayoutEffect(() => {
        if (!shouldAutoScroll || !scrollRef.current) return;
        const el = scrollRef.current;
        if (isStreaming) el.scrollTop = el.scrollHeight;
        else requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    }, [history, isStreaming, shouldAutoScroll]);

    // 413 PAYLOAD GUARD
    const handleSend = useCallback(async (query?: string) => {
        const text = query ?? inputValue.trim();
        if ((!text && attachments.length === 0) || isLoading || isUploading) return;

        let safeFileAttachments = undefined;

        if (totalPayloadSize > MAX_PAYLOAD_BYTES) {
            const mb = (totalPayloadSize / (1024 * 1024)).toFixed(1);
            showToast(`Payload large (${mb}MB). Sending files as links only.`);
            // safeFileAttachments remains undefined -> Only text/links sent
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

        setInputValue('');
        clearAttachments();
        setShouldAutoScroll(true);
        triggerHaptic();
        await sendMessage(msg, safeFileAttachments);
    }, [inputValue, attachments, isLoading, isUploading, sendMessage, clearAttachments, showToast, totalPayloadSize]);

    const containerStyle = useMemo(() => {
        if (isMinimized) return { height: 48, width: 200, bottom: 32, right: 32, borderRadius: 9999 };
        if (workspaceMode === 'full') return { height: '100dvh', width: '100%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        if (workspaceMode === 'split') return { height: '100dvh', width: '50%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        return { height: 'min(840px, 90dvh)', width: 460, bottom: 32, right: 32, borderRadius: 28 };
    }, [isMinimized, workspaceMode]);

    if (!isOpen) return <motion.button onClick={() => setIsOpen(true)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="fixed bottom-8 right-8 z-50 flex items-center gap-3 px-6 py-3 rounded-full bg-[#0A0A0B] border border-white/10 shadow-2xl hover:border-white/20 transition-colors" aria-label="Open Chat"><div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" /><span className={SYSTEM.type.h1}>Command Center</span></motion.button>;
    if (isMinimized) return <motion.button layoutId="chat" onClick={() => setIsMinimized(false)} className={cn('fixed z-50 flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl border-t border-white/10', SYSTEM.surface.glass)} style={{ bottom: 32, right: 32 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} aria-label="Expand">{isLoading && <OrbitalRadar />}<span className={SYSTEM.type.h1}>{isLoading ? 'Working...' : 'Command Center'}</span></motion.button>;

    return (
        <LayoutGroup>
            <motion.div layoutId="chat" className={cn('fixed z-50 flex flex-col overflow-hidden isolate border border-white/[0.08] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]', SYSTEM.surface.void)} style={containerStyle}>
                <FilmGrain />
                <header className={cn('flex items-center justify-between px-8 pt-6 pb-2 shrink-0 z-20 select-none', SYSTEM.surface.glass)}>
                    <div className="flex items-center gap-3"><Zap size={16} className="text-indigo-500" /><span className={SYSTEM.type.h1}>Command Center <span className="text-white/30 font-normal ml-1">Weissach</span></span></div>
                    <div className="flex items-center gap-2">
                        <button onClick={clearChat} className="px-3 py-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all text-[11px] font-medium">Clear</button>
                        <button onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')} className="p-2 text-zinc-600 hover:text-white transition-colors">{workspaceMode === 'floating' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</button>
                        <button onClick={() => setIsMinimized(true)} className="p-2 text-zinc-600 hover:text-white transition-colors"><Minimize2 size={16} /></button>
                        <button onClick={() => { setIsOpen(false); setWorkspaceMode('floating'); }} className="p-2 text-zinc-600 hover:text-white transition-colors"><X size={16} /></button>
                    </div>
                </header>
                <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto px-6 pt-4 pb-44 scroll-smooth no-scrollbar z-10">
                    <AnimatePresence mode="popLayout">
                        {history.length === 0 ? (<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex flex-col items-center justify-center text-center opacity-40 pt-20"><div className="w-20 h-20 rounded-[24px] border border-white/10 bg-white/5 flex items-center justify-center mb-6"><Users size={28} className="text-zinc-600" /></div><p className={SYSTEM.type.mono}>System Ready</p><p className="text-[13px] text-zinc-600 mt-2 max-w-[280px]">Recruiting intelligence active.</p></motion.div>) : (history.map((msg, i) => <MessageBubble key={i} role={msg.role} content={msg.content} isStreaming={isStreaming && i === history.length - 1 && msg.role === 'assistant'} toolInvocations={msg.toolInvocations} />))}
                    </AnimatePresence>
                </div>
                <footer className={cn('absolute bottom-0 left-0 right-0 z-30 px-5 pt-20 pb-[max(2rem,env(safe-area-inset-bottom,0.5rem))] bg-gradient-to-t from-[#030303] via-[#030303]/95 to-transparent pointer-events-none')}>
                    <div className="pointer-events-auto relative">
                        <AnimatePresence>{isLoading && <ThinkingPill onStop={stop} status={isStreaming ? 'streaming' : 'thinking'} />}</AnimatePresence>
                        <AnimatePresence>{history.length < 2 && !isLoading && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4"><SmartChips onSelect={handleSend} /></motion.div>}</AnimatePresence>
                        <InputDeck value={inputValue} onChange={setInputValue} onSend={() => handleSend()} onStop={stop} isProcessing={isLoading} inputRef={inputRef} attachments={attachments} onRemoveAttachment={removeFile} isDragActive={isDragActive} isUploading={isUploading} dragHandlers={dragHandlers} handlePaste={handlePaste} triggerFileSelect={triggerFileSelect} fileInputRef={fileInputRef} onFilesSelected={(files) => files && addFiles(files)} />
                        {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg"><span className="text-[12px] text-rose-400">Error: {error}</span></motion.div>}
                    </div>
                </footer>
            </motion.div>
        </LayoutGroup>
    );
};

// ============================================================================
// 9. MAIN WRAPPER (CONTEXT PROVIDER + ERROR BOUNDARY)
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
