/* ============================================================================
   CommandCenterV2.tsx
   "Obsidian Weissach" — Healthcare Staffing Edition (v2.0)
   
   Architecture:
   ├─ SYSTEM: Design tokens (anim, surface, type, geo)
   ├─ Premium Visuals: FilmGrain, OrbitalRadar, ThinkingPill
   ├─ Intelligence Artifacts: CandidateVerdict, AssessmentHUD
   ├─ Message System: MessageBubble with tool result integration
   └─ Input Deck: Milled border treatment, minimal icons
   
   Ported from Drip's ChatWidget with recruiting-specific terminology.
   No betting logic. Blue/Indigo theme.
============================================================================ */

import {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    memo,
    type FC,
    type ReactNode,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
    X,
    Minimize2,
    Maximize2,
    ArrowUp,
    Copy,
    Check,
    Square,
    Paperclip,
    Search,
    FileText,
    DollarSign,
    Users,
    Activity,
    Calendar,
    ChevronRight,
    Zap,
    File,
    Loader2,
    Image as ImageIcon,
    AlertCircle,
} from 'lucide-react';

// Obsidian Weissach Design System
import {
    SYSTEM,
    cn,
    triggerHaptic,
    copyToClipboard,
    FilmGrain,
    OrbitalRadar,
    ToastProvider,
    useToast,
} from '../design-system/obsidian';

import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { useFileUpload, type Attachment } from '../features/command-center-chat/hooks/useFileUpload';
import { useLayout } from '../context/LayoutContext';

// ============================================================================
// DESIGN SYSTEM NOTE:
// SYSTEM tokens, utilities (cn, generateId, triggerHaptic), and shared components
// (FilmGrain, OrbitalRadar, ToastProvider) are imported from @/design-system/obsidian
// ============================================================================

// ============================================================================
// TOAST SYSTEM - Using design system's ToastProvider and useToast hook
// ============================================================================

// ============================================================================
// COPY BUTTON (Icon-based version for inline use)
// Note: Design system has text-based CopyButton; this is icon-based for compact UI
// ============================================================================

const CopyButton: FC<{ content: string }> = memo(({ content }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        const success = await copyToClipboard(content);
        if (success) {
            setCopied(true);
            triggerHaptic();
            setTimeout(() => setCopied(false), 1500);
        }
    }, [content]);

    return (
        <button
            onClick={handleCopy}
            className={cn(
                'p-1.5 rounded-md transition-all duration-200',
                copied
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'
            )}
        >
            {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
    );
});
CopyButton.displayName = 'CopyButton';

// ============================================================================
// 6. INTELLIGENCE ARTIFACTS (Recruiting-Specific)
// ============================================================================

/**
 * CandidateVerdict - Premium card for match assessments
 * Replaces Drip's "VerdictTicket" with recruiting terminology
 */
interface CandidateVerdictProps {
    verdict: 'STRONG MATCH' | 'REVIEW NEEDED' | 'NOT A FIT';
    details?: string;
}

const CandidateVerdict: FC<CandidateVerdictProps> = memo(({ verdict, details }) => {
    const verdictColors = {
        'STRONG MATCH': {
            dot: 'bg-emerald-500',
            text: 'text-emerald-500',
            border: 'border-emerald-500/20',
            bg: 'bg-emerald-500/10',
        },
        'REVIEW NEEDED': {
            dot: 'bg-amber-500',
            text: 'text-amber-500',
            border: 'border-amber-500/20',
            bg: 'bg-amber-500/10',
        },
        'NOT A FIT': {
            dot: 'bg-rose-500',
            text: 'text-rose-500',
            border: 'border-rose-500/20',
            bg: 'bg-rose-500/10',
        },
    };

    const colors = verdictColors[verdict];

    return (
        <motion.div
            layout
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SYSTEM.anim.fluid}
            className={cn(
                'my-6 relative overflow-hidden rounded-[18px] bg-[#0A0A0B] shadow-2xl group select-none',
                SYSTEM.surface.milled
            )}
        >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.03)_45%,transparent_50%)] bg-[length:200%_100%] animate-[shimmer_5s_infinite_linear] pointer-events-none" />

            {/* Header */}
            <div className="px-6 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <span className={SYSTEM.type.mono}>Candidate Assessment</span>
                <div className={cn('flex items-center gap-2 px-2 py-0.5 rounded-full', colors.bg, colors.border, 'border')}>
                    <span className={cn('w-1 h-1 rounded-full animate-pulse', colors.dot)} />
                    <span className={cn('text-[9px] font-bold tracking-wider uppercase', colors.text)}>
                        {verdict === 'STRONG MATCH' ? 'Proceed' : verdict === 'REVIEW NEEDED' ? 'Review' : 'Pass'}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="relative p-6 flex items-start gap-4">
                <div className="flex-1">
                    <div className="text-2xl md:text-3xl font-medium text-white tracking-tight leading-none mb-1 tabular-nums">
                        {verdict}
                    </div>
                    {details && (
                        <div className="text-[13px] text-zinc-400 mt-3 leading-relaxed">
                            {details}
                        </div>
                    )}
                    <div className={cn('text-[10px] uppercase tracking-wider font-mono mt-3', colors.text)}>
                        {verdict === 'STRONG MATCH' ? 'Ready for Interview' :
                            verdict === 'REVIEW NEEDED' ? 'Additional Screening Required' :
                                'Does Not Meet Requirements'}
                    </div>
                </div>
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02]">
                    {verdict === 'STRONG MATCH' ? (
                        <motion.svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-emerald-400"
                        >
                            <motion.path
                                d="M20 6L9 17l-5-5"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={SYSTEM.anim.draw}
                            />
                        </motion.svg>
                    ) : verdict === 'REVIEW NEEDED' ? (
                        <span className="text-amber-400 text-lg font-bold">?</span>
                    ) : (
                        <X size={20} className="text-rose-400" />
                    )}
                </div>
            </div>
        </motion.div>
    );
});
CandidateVerdict.displayName = 'CandidateVerdict';

/**
 * AssessmentHUD - Tactical insights panel
 * Replaces Drip's "TacticalHUD" with recruiting terminology
 */
const AssessmentHUD: FC<{ content: string; title?: string }> = memo(({ content, title = 'Match Insight' }) => (
    <motion.div
        layout
        initial={{ x: -5, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={SYSTEM.anim.fluid}
        className={cn(
            'my-6 relative overflow-hidden rounded-r-[16px]',
            'border-l-[3px] border-l-indigo-500/80',
            'shadow-[20px_0_40px_-10px_rgba(99,102,241,0.05)]',
            SYSTEM.surface.hud
        )}
    >
        <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
                <Activity size={14} className="text-indigo-400" />
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                    {title}
                </span>
            </div>
            <div className="text-[14px] text-indigo-100/90 leading-[1.6] font-medium tracking-wide">
                {content}
            </div>
        </div>
    </motion.div>
));
AssessmentHUD.displayName = 'AssessmentHUD';

// ============================================================================
// 7. THINKING PILL (Status Indicator)
// ============================================================================

const RECRUITING_PHASES = [
    'SEARCHING DATABASE',
    'ANALYZING MATCH',
    'CALCULATING PACKAGE',
    'DRAFTING RESPONSE',
];

interface ThinkingPillProps {
    onStop?: () => void;
    status?: 'thinking' | 'streaming' | 'grounding';
}

const ThinkingPill: FC<ThinkingPillProps> = memo(({ onStop, status = 'thinking' }) => {
    const [phaseIndex, setPhaseIndex] = useState(0);

    useEffect(() => {
        if (status === 'thinking') {
            const interval = setInterval(() => {
                setPhaseIndex((prev) => (prev + 1) % RECRUITING_PHASES.length);
            }, 2200);
            return () => clearInterval(interval);
        }
    }, [status]);

    const displayText =
        status === 'streaming'
            ? 'LIVE STREAM'
            : status === 'grounding'
                ? 'SOURCING'
                : RECRUITING_PHASES[phaseIndex];

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={SYSTEM.anim.fluid}
            className={cn(
                'absolute bottom-[100%] left-1/2 -translate-x-1/2 mb-6 z-30',
                'flex items-center gap-3 px-4 py-2 rounded-full',
                'bg-[#050505] border border-white/10 shadow-2xl'
            )}
        >
            <OrbitalRadar />
            <AnimatePresence mode="wait">
                <motion.span
                    key={displayText}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    className={cn(SYSTEM.type.mono, 'text-zinc-300 min-w-[120px] text-center')}
                >
                    {displayText}
                </motion.span>
            </AnimatePresence>
            {onStop && (
                <button
                    onClick={onStop}
                    className="ml-1 text-zinc-600 hover:text-zinc-200 transition-colors"
                >
                    <Square size={10} />
                </button>
            )}
        </motion.div>
    );
});
ThinkingPill.displayName = 'ThinkingPill';

// ============================================================================
// 8. SMART CHIPS (Recruiting Context)
// ============================================================================

interface SmartChip {
    icon: ReactNode;
    label: string;
    query: string;
}

const RECRUITING_CHIPS: SmartChip[] = [
    { icon: <Search size={12} />, label: 'Find Candidates', query: 'Find candidates for this position.' },
    { icon: <FileText size={12} />, label: 'Screen Resume', query: 'Screen this resume and provide assessment.' },
    { icon: <DollarSign size={12} />, label: 'Analyze Pay', query: 'Calculate competitive pay package for this role.' },
    { icon: <Calendar size={12} />, label: 'Schedule', query: 'Help me schedule an interview.' },
];

const SmartChips: FC<{ onSelect: (query: string) => void }> = memo(({ onSelect }) => (
    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide px-1">
        {RECRUITING_CHIPS.map((chip, index) => (
            <motion.button
                key={chip.label}
                onClick={() => {
                    triggerHaptic();
                    onSelect(chip.query);
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, ...SYSTEM.anim.fluid }}
                whileHover={{ scale: 1.02, y: -1, backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    'flex-shrink-0 flex items-center gap-2 px-3.5 py-2',
                    'bg-white/[0.03] border border-white/[0.08]',
                    'transition-all backdrop-blur-sm',
                    SYSTEM.geo.pill
                )}
            >
                <span className="text-zinc-400">{chip.icon}</span>
                <span className="text-[10px] font-medium text-zinc-300 tracking-wide uppercase">
                    {chip.label}
                </span>
            </motion.button>
        ))}
    </div>
));
SmartChips.displayName = 'SmartChips';

// ============================================================================
// 8.5. EMAIL CARD (Elite Email Draft Renderer)
// ============================================================================

interface EmailCardProps {
    to?: string;
    subject: string;
    body: string;
}

/**
 * Linkify email addresses in text, converting them to clickable mailto links
 */
const linkifyEmails = (text: string): React.ReactNode => {
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const parts = text.split(emailRegex);

    return parts.map((part, index) => {
        if (emailRegex.test(part)) {
            // Reset regex lastIndex since we're testing again
            emailRegex.lastIndex = 0;
            return (
                <a
                    key={index}
                    href={`mailto:${part}`}
                    className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/30 underline-offset-2 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }
        return part;
    });
};

const EmailCard: FC<EmailCardProps> = memo(({ to, subject, body }) => {
    const [copiedField, setCopiedField] = useState<'to' | 'subject' | 'body' | 'all' | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const copyToClipboard = useCallback(async (text: string, field: 'to' | 'subject' | 'body' | 'all') => {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        triggerHaptic();
        setTimeout(() => setCopiedField(null), 2000);
    }, []);

    const openInMail = useCallback(() => {
        // Build mailto URL with recipient if available
        const recipient = to || '';
        const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
        triggerHaptic();
    }, [to, subject, body]);

    // Parse body for proper line breaks and clean up
    const formattedBody = body
        .replace(/  \n/g, '\n') // Convert markdown line breaks
        .replace(/^---\s*$/gm, '') // Remove stray horizontal rules
        .trim();

    // Determine if body is long (needs expand/collapse)
    const isLongBody = formattedBody.length > 600 || formattedBody.split('\n').length > 15;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SYSTEM.anim.fluid}
            className={cn(
                'rounded-[20px] overflow-hidden',
                'bg-white/[0.02] backdrop-blur-md',
                'border border-white/[0.08]',
                'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]'
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                        <FileText size={14} className="text-indigo-400" />
                    </div>
                    <span className={cn(SYSTEM.type.mono, 'text-indigo-400')}>Email Draft</span>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => copyToClipboard(`${to ? `To: ${to}\n` : ''}Subject: ${subject}\n\n${formattedBody}`, 'all')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-lg',
                        'bg-white/[0.06] hover:bg-white/[0.1] transition-all',
                        'text-[11px] font-medium',
                        copiedField === 'all' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-300'
                    )}
                >
                    {copiedField === 'all' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedField === 'all' ? 'Copied!' : 'Copy All'}
                </motion.button>
            </div>

            {/* To Line (conditional) */}
            {to && (
                <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px]')}>To</span>
                            <p className="text-[14px] font-medium text-white mt-0.5">{to}</p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.08)' }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => copyToClipboard(to, 'to')}
                            className={cn(
                                'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                                'bg-white/[0.04] hover:bg-white/[0.08]',
                                copiedField === 'to' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400'
                            )}
                        >
                            {copiedField === 'to' ? <Check size={14} /> : <Copy size={14} />}
                        </motion.button>
                    </div>
                </div>
            )}

            {/* Subject Line */}
            <div className="px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <span className={cn(SYSTEM.type.mono, 'text-zinc-500 text-[10px]')}>Subject</span>
                        <p className="text-[14px] font-medium text-white mt-0.5 line-clamp-2">{subject}</p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => copyToClipboard(subject, 'subject')}
                        className={cn(
                            'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                            'bg-white/[0.04] hover:bg-white/[0.08]',
                            copiedField === 'subject' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400'
                        )}
                    >
                        {copiedField === 'subject' ? <Check size={14} /> : <Copy size={14} />}
                    </motion.button>
                </div>
            </div>

            {/* Body Content */}
            <div className="px-5 py-4 relative">
                <div className="flex items-start justify-between gap-3">
                    <div className={cn(
                        'flex-1 min-w-0 relative',
                        !isExpanded && isLongBody && 'max-h-[280px] overflow-hidden'
                    )}>
                        <div className={cn(SYSTEM.type.body, 'text-[#C4C4C4] whitespace-pre-wrap leading-relaxed')}>
                            {linkifyEmails(formattedBody)}
                        </div>
                        {/* Fade gradient for collapsed state */}
                        {!isExpanded && isLongBody && (
                            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0A0A0B] to-transparent pointer-events-none" />
                        )}
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.08)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => copyToClipboard(formattedBody, 'body')}
                        className={cn(
                            'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                            'bg-white/[0.04] hover:bg-white/[0.08]',
                            copiedField === 'body' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400'
                        )}
                    >
                        {copiedField === 'body' ? <Check size={14} /> : <Copy size={14} />}
                    </motion.button>
                </div>

                {/* Show More / Less toggle */}
                {isLongBody && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-3 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                        {isExpanded ? '↑ Show Less' : '↓ Show Full Email'}
                    </button>
                )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-white/[0.06] bg-white/[0.02]">
                <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(99, 102, 241, 0.15)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={openInMail}
                    className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                        'bg-indigo-500/10 border border-indigo-500/20',
                        'text-indigo-400 text-[12px] font-medium',
                        'transition-all duration-200'
                    )}
                >
                    <ArrowUp size={14} className="rotate-45" />
                    Open in Mail
                </motion.button>
            </div>
        </motion.div>
    );
});
EmailCard.displayName = 'EmailCard';

// ============================================================================
// 8.6. USER ATTACHMENT (Inline Thumbnail for User Messages)
// ============================================================================

interface UserAttachmentProps {
    filename: string;
    url: string;
}

const UserAttachment: FC<UserAttachmentProps> = memo(({ filename, url }) => {
    const isImage = /\.(png|jpg|jpeg|gif|webp|heic)$/i.test(filename);
    const isPDF = /\.pdf$/i.test(filename);

    return (
        <motion.a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            className={cn(
                'flex items-center gap-3 mt-3 p-2 rounded-xl',
                'bg-black/20 border border-white/10',
                'hover:bg-black/30 transition-all cursor-pointer group'
            )}
        >
            {isImage ? (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0">
                    <img
                        src={url}
                        alt={filename}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Maximize2 size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            ) : (
                <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    {isPDF ? (
                        <FileText size={20} className="text-rose-400" />
                    ) : (
                        <File size={20} className="text-zinc-400" />
                    )}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-[12px] text-indigo-400 truncate group-hover:text-indigo-300 transition-colors">
                    {filename}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                    {isImage ? 'Image' : isPDF ? 'PDF Document' : 'Attachment'}
                </p>
            </div>
        </motion.a>
    );
});
UserAttachment.displayName = 'UserAttachment';

// ============================================================================
// 9. MESSAGE BUBBLE
// ============================================================================

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    toolInvocations?: any[];
}

const MessageBubble: FC<MessageBubbleProps> = memo(({ role, content, isStreaming, toolInvocations }) => {
    const isUser = role === 'user';
    const { showToast } = useToast(); // From design system

    // Parse special content patterns
    const renderContent = useMemo(() => {
        if (!content) return null;

        // For USER messages: Check for attachment pattern [Attached: Filename](url)
        if (isUser) {
            const attachmentPattern = /\[Attached:\s*([^\]]+)\]\(([^)]+)\)/g;
            const attachments: { filename: string; url: string }[] = [];
            let match;
            while ((match = attachmentPattern.exec(content)) !== null) {
                attachments.push({ filename: match[1].trim(), url: match[2] });
            }

            if (attachments.length > 0) {
                // Get the text content without attachment links
                const textContent = content.replace(attachmentPattern, '').trim();

                return (
                    <>
                        {textContent && (
                            <p className={cn(SYSTEM.type.body, 'text-[#1a1a1a]')}>{textContent}</p>
                        )}
                        {attachments.map((att, idx) => (
                            <UserAttachment key={idx} filename={att.filename} url={att.url} />
                        ))}
                    </>
                );
            }
        }

        // Check for EMAIL DRAFT pattern (new structured format)
        // Flexible parsing: extracts optional To:, required Subject:, and body content
        const emailDraftHeader = content.match(/^#\s*EMAIL\s*DRAFT[\r\n]+/i);
        if (emailDraftHeader) {
            // Extract To: (optional)
            const toMatch = content.match(/\*\*To:\*\*\s*([^\r\n]+)/i);
            const to = toMatch ? toMatch[1].trim() : undefined;

            // Extract Subject: (required)
            const subjectMatch = content.match(/\*\*Subject:\*\*\s*([^\r\n]+)/i);
            if (subjectMatch) {
                const subject = subjectMatch[1].trim();

                // Extract body: everything after first --- separator, before trailing ---
                const bodyMatch = content.match(/---[\r\n]+([\s\S]+?)(?:[\r\n]+---[\r\n]*(?:$|[\r\n])|$)/);
                let body = bodyMatch ? bodyMatch[1].trim() : '';

                // Clean body: remove IMPORTANT rules text if present
                body = body.replace(/[\r\n]+IMPORTANT[\s\S]*$/i, '').trim();

                // Check if there's remaining content after the email (AI follow-up)
                const lastSeparatorIdx = content.lastIndexOf('---');
                let remainingContent = '';
                if (lastSeparatorIdx > content.indexOf('---')) {
                    remainingContent = content.slice(lastSeparatorIdx + 3).replace(/^[\r\n]+/g, '').trim();
                    // Don't include IMPORTANT rules as remaining content
                    if (remainingContent.startsWith('IMPORTANT')) {
                        remainingContent = '';
                    }
                }

                return (
                    <>
                        <EmailCard to={to} subject={subject} body={body} />
                        {remainingContent && (
                            <div className="mt-4">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        p: ({ children }) => (
                                            <p className={cn(SYSTEM.type.body, 'text-[#A1A1AA]', 'mb-4 last:mb-0')}>
                                                {children}
                                            </p>
                                        ),
                                        strong: ({ children }) => (
                                            <strong className="font-semibold text-white">{children}</strong>
                                        ),
                                        hr: () => null, // Suppress stray horizontal rules
                                    }}
                                >
                                    {remainingContent}
                                </ReactMarkdown>
                            </div>
                        )}
                    </>
                );
            }
        }

        // Check for legacy [SUBJECT][BODY] format (backwards compatibility)
        const legacyEmailMatch = content.match(/\[SUBJECT\]([\s\S]*?)\[\/SUBJECT\]\s*\[BODY\]([\s\S]*?)\[\/BODY\]/i);
        if (legacyEmailMatch) {
            const subject = legacyEmailMatch[1].trim();
            const body = legacyEmailMatch[2].trim();
            return <EmailCard subject={subject} body={body} />;
        }

        // Check for verdict pattern: "VERDICT: STRONG MATCH"
        const verdictMatch = content.match(/VERDICT:\s*(STRONG MATCH|REVIEW NEEDED|NOT A FIT)/i);
        if (verdictMatch) {
            const verdict = verdictMatch[1].toUpperCase() as CandidateVerdictProps['verdict'];
            const details = content.replace(verdictMatch[0], '').trim();
            return <CandidateVerdict verdict={verdict} details={details || undefined} />;
        }

        // Check for insight pattern: "INSIGHT:" or "ASSESSMENT:"
        const insightMatch = content.match(/(?:INSIGHT|ASSESSMENT|KEY QUALIFICATIONS):\s*(.+)/is);
        if (insightMatch) {
            return <AssessmentHUD content={insightMatch[1].trim()} />;
        }

        // Default markdown rendering
        return (
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => (
                        <p className={cn(SYSTEM.type.body, isUser ? 'text-[#1a1a1a]' : 'text-[#A1A1AA]', 'mb-4 last:mb-0')}>
                            {children}
                        </p>
                    ),
                    strong: ({ children }) => (
                        <strong className="font-semibold text-white">{children}</strong>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/20 underline-offset-4 transition-colors"
                        >
                            {children}
                        </a>
                    ),
                    ul: ({ children }) => <ul className="space-y-2 mb-4 ml-1">{children}</ul>,
                    li: ({ children }) => (
                        <li className="flex gap-3 items-start pl-1">
                            <span className="mt-2 w-1 h-1 bg-zinc-700 rounded-full shrink-0" />
                            <span className={SYSTEM.type.body}>{children}</span>
                        </li>
                    ),
                    code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                            <code className="px-1.5 py-0.5 bg-white/10 rounded text-[13px] font-mono text-indigo-300">
                                {children}
                            </code>
                        ) : (
                            <code className="block p-4 bg-[#0A0A0B] rounded-lg text-[13px] font-mono text-zinc-300 overflow-x-auto">
                                {children}
                            </code>
                        );
                    },
                    // Handle horizontal rules (---) for better email section separation
                    hr: () => <div className="my-4 border-t border-white/[0.06]" />,
                    // Handle h1 headers
                    h1: ({ children }) => (
                        <h1 className="text-[16px] font-bold text-white mb-3">{children}</h1>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        );
    }, [content, isUser]);

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={SYSTEM.anim.fluid}
            className={cn('flex flex-col mb-10 w-full relative group', isUser ? 'items-end' : 'items-start')}
        >
            {/* Assistant label */}
            {!isUser && (content || isStreaming) && (
                <div className="flex items-center gap-2 mb-2 ml-1">
                    <div className="w-[3px] h-[3px] bg-zinc-600 rounded-full" />
                    <span className={SYSTEM.type.mono}>Command Center</span>
                </div>
            )}

            {/* Message content */}
            <div
                className={cn(
                    'relative max-w-[92%] md:max-w-[88%]',
                    isUser
                        ? 'bg-white text-black rounded-[20px] rounded-tr-md shadow-[0_2px_10px_rgba(0,0,0,0.1)] px-5 py-3.5'
                        : 'bg-transparent text-white px-0'
                )}
            >
                <div className={cn('prose prose-invert max-w-none', isUser && 'prose-p:text-black/90')}>
                    {renderContent}
                </div>

                {/* Streaming indicator */}
                {isStreaming && !content && (
                    <div className="flex items-center gap-2">
                        <OrbitalRadar />
                        <span className={SYSTEM.type.mono}>Processing...</span>
                    </div>
                )}

                {/* Copy button (assistant only) */}
                {!isUser && !isStreaming && content && (
                    <div className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                        <CopyButton content={content} />
                    </div>
                )}
            </div>

            {/* Tool results */}
            {toolInvocations && toolInvocations.length > 0 && (
                <div className="w-full mt-4 space-y-3">
                    {toolInvocations.map((tool: any, idx: number) => (
                        <ToolResultCard key={idx} toolName={tool.toolName} result={tool.result} state={tool.state} />
                    ))}
                </div>
            )}
        </motion.div>
    );
});
MessageBubble.displayName = 'MessageBubble';

// ============================================================================
// 10. TOOL RESULT CARD
// ============================================================================

interface ToolResultCardProps {
    toolName: string;
    result: any;
    state: string;
}

const ToolResultCard: FC<ToolResultCardProps> = memo(({ toolName, result, state }) => {
    const [expanded, setExpanded] = useState(false);
    const isComplete = state === 'result';

    const formatToolName = (name: string) => {
        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn('rounded-[16px] overflow-hidden', SYSTEM.surface.panel)}
        >
            <button
                onClick={() => isComplete && setExpanded(!expanded)}
                disabled={!isComplete}
                className={cn(
                    'w-full px-4 py-3 flex items-center justify-between text-left',
                    'transition-colors duration-150',
                    isComplete && 'hover:bg-white/[0.02] cursor-pointer'
                )}
            >
                <div className="flex items-center gap-3">
                    <span className={cn(SYSTEM.type.mono, isComplete ? 'text-indigo-400' : 'text-zinc-500')}>
                        {isComplete ? 'Result' : 'Running'}
                    </span>
                    <span className={cn(SYSTEM.type.h1)}>{formatToolName(toolName)}</span>
                </div>

                {!isComplete ? (
                    <OrbitalRadar />
                ) : (
                    <ChevronRight
                        size={14}
                        className={cn('text-zinc-500 transition-transform', expanded && 'rotate-90')}
                    />
                )}
            </button>

            <AnimatePresence>
                {expanded && isComplete && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 border-t border-white/[0.04]">
                            <pre className="text-xs font-mono text-zinc-400 overflow-x-auto pt-3 whitespace-pre-wrap">
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
// 11. ATTACHMENT PREVIEW
// ============================================================================

interface AttachmentPreviewProps {
    attachments: Attachment[];
    onRemove: (id: string) => void;
}

const AttachmentPreview: FC<AttachmentPreviewProps> = memo(({ attachments, onRemove }) => {
    if (attachments.length === 0) return null;

    const getFileIcon = (mimeType: string) => {
        if (mimeType === 'application/pdf') return <FileText size={20} className="text-rose-400" />;
        if (mimeType.includes('word') || mimeType.includes('document')) return <FileText size={20} className="text-blue-400" />;
        if (mimeType.startsWith('image/')) return <ImageIcon size={20} className="text-emerald-400" />;
        return <File size={20} className="text-zinc-400" />;
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
        >
            {attachments.map((att) => (
                <motion.div
                    key={att.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                        'relative flex-shrink-0 group',
                        'rounded-xl overflow-hidden',
                        'bg-white/[0.03] border border-white/[0.08]',
                        att.uploadError && 'border-rose-500/50'
                    )}
                >
                    {/* Preview content */}
                    <div className="flex items-center gap-2 p-2 pr-8">
                        {att.previewUrl ? (
                            <img
                                src={att.previewUrl}
                                alt={att.fileName}
                                className="w-10 h-10 rounded-lg object-cover"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center">
                                {getFileIcon(att.mimeType)}
                            </div>
                        )}
                        <div className="flex flex-col min-w-0">
                            <span className="text-[11px] text-zinc-300 truncate max-w-[100px]">
                                {att.fileName}
                            </span>
                            <span className={cn(
                                SYSTEM.type.mono,
                                'text-[9px]',
                                att.uploadError ? 'text-rose-400' : att.isUploading ? 'text-amber-400' : 'text-zinc-500'
                            )}>
                                {att.uploadError ? 'Failed' : att.isUploading ? 'Uploading...' : formatSize(att.fileSize)}
                            </span>
                        </div>
                    </div>

                    {/* Upload indicator */}
                    {att.isUploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Loader2 size={16} className="text-indigo-400 animate-spin" />
                        </div>
                    )}

                    {/* Error indicator */}
                    {att.uploadError && (
                        <div className="absolute top-1 left-1">
                            <AlertCircle size={12} className="text-rose-400" />
                        </div>
                    )}

                    {/* Remove button */}
                    <button
                        onClick={() => onRemove(att.id)}
                        className={cn(
                            'absolute top-1 right-1',
                            'w-5 h-5 rounded-full',
                            'bg-black/60 hover:bg-rose-500/80',
                            'flex items-center justify-center',
                            'opacity-0 group-hover:opacity-100 transition-opacity'
                        )}
                    >
                        <X size={10} className="text-white" />
                    </button>
                </motion.div>
            ))}
        </motion.div>
    );
});
AttachmentPreview.displayName = 'AttachmentPreview';

// ============================================================================
// 12. INPUT DECK (with File Upload)
// ============================================================================

interface InputDeckProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    isProcessing: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    // File upload props
    attachments: Attachment[];
    onRemoveAttachment: (id: string) => void;
    isDragActive: boolean;
    isUploading: boolean;
    dragHandlers: {
        onDragEnter: (e: React.DragEvent) => void;
        onDragOver: (e: React.DragEvent) => void;
        onDragLeave: (e: React.DragEvent) => void;
        onDrop: (e: React.DragEvent) => void;
    };
    handlePaste: (e: React.ClipboardEvent) => void;
    triggerFileSelect: () => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    onFilesSelected: (files: FileList | null) => void;
}

const InputDeck: FC<InputDeckProps> = memo(
    ({
        value,
        onChange,
        onSend,
        onStop,
        isProcessing,
        inputRef,
        attachments,
        onRemoveAttachment,
        isDragActive,
        isUploading,
        dragHandlers,
        handlePaste,
        triggerFileSelect,
        fileInputRef,
        onFilesSelected,
    }) => {
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

        const canSend = (value.trim() || attachments.length > 0) && !isUploading;

        return (
            <motion.div
                layout
                className={cn(
                    'flex flex-col p-1.5 relative overflow-hidden',
                    'transition-all duration-300',
                    SYSTEM.geo.input,
                    'bg-[#0A0A0B] shadow-2xl',
                    SYSTEM.surface.milled,
                    // Focus-within glow
                    'focus-within:border-indigo-500/30',
                    'focus-within:shadow-[0_0_20px_-5px_rgba(99,102,241,0.15)]',
                    // Drag active state
                    isDragActive && 'border-indigo-500/50 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] scale-[1.01]'
                )}
                transition={SYSTEM.anim.fluid}
                {...dragHandlers}
            >
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => onFilesSelected(e.target.files)}
                />

                {/* Attachment previews */}
                <AnimatePresence>
                    {attachments.length > 0 && (
                        <div className="px-2 pt-2">
                            <AttachmentPreview
                                attachments={attachments}
                                onRemove={onRemoveAttachment}
                            />
                        </div>
                    )}
                </AnimatePresence>

                {/* Main input row */}
                <div className="flex items-end gap-2">
                    {/* Attach button */}
                    <button
                        onClick={triggerFileSelect}
                        disabled={isProcessing}
                        className={cn(
                            'p-3.5 rounded-[18px] transition-colors',
                            'text-zinc-500 hover:text-white hover:bg-white/5',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                        aria-label="Attach file"
                    >
                        <Paperclip size={18} strokeWidth={1.5} />
                    </button>

                    {/* Textarea */}
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
                            'flex-1 bg-transparent border-none outline-none resize-none py-4',
                            'min-h-[52px] max-h-[120px]',
                            SYSTEM.type.body,
                            'text-white placeholder:text-zinc-500',
                            'disabled:opacity-50',
                            isDragActive && 'placeholder:text-indigo-400'
                        )}
                    />

                    {/* Send/Stop button */}
                    <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => (isProcessing ? onStop() : onSend())}
                        disabled={!isProcessing && !canSend}
                        className={cn(
                            'p-3 rounded-[18px] transition-all duration-300',
                            canSend || isProcessing
                                ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                                : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                        )}
                    >
                        {isProcessing ? (
                            <Square size={18} className="animate-pulse" />
                        ) : isUploading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <ArrowUp size={18} strokeWidth={2.5} />
                        )}
                    </motion.button>
                </div>

                {/* Drag overlay */}
                <AnimatePresence>
                    {isDragActive && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-indigo-500/5 border-2 border-dashed border-indigo-500/30 rounded-[24px] pointer-events-none flex items-center justify-center"
                        >
                            <div className="flex items-center gap-2 text-indigo-400">
                                <Paperclip size={20} />
                                <span className="text-[13px] font-medium">Drop to attach</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        );
    }
);
InputDeck.displayName = 'InputDeck';

// ============================================================================
// 12. MAIN COMPONENT
// ============================================================================

export const CommandCenterV2: FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const { workspaceMode, setWorkspaceMode } = useLayout();
    const [inputValue, setInputValue] = useState('');
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // AI SDK Chat Hook
    const {
        messages,
        isLoading,
        isStreaming,
        error,
        sendMessage,
        clearChat,
        stop,
        status: _status, // Available for status indicator
    } = useCommandCenterChat({
        onToolCall: (toolName, args) => {
            if (toolName === 'set_ui_state') {
                window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: args }));
            }
            if (['add_prospect', 'update_negotiation', 'create_follow_up'].includes(toolName)) {
                window.dispatchEvent(new CustomEvent('refresh_dashboard'));
            }
        },
    });

    // File Upload Hook
    const {
        attachments,
        isDragActive,
        isUploading,
        addFiles,
        removeFile,
        clearAll: clearAttachments,
        dragHandlers,
        handlePaste,
        fileInputRef,
        triggerFileSelect,
    } = useFileUpload({
        onUploadError: (error, file) => {
            console.error(`[CommandCenterV2] Upload failed for ${file.name}:`, error);
        },
    });

    // Convert messages to display format
    const history = useMemo(
        () =>
            messages.map((msg) => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content || '',
                toolInvocations: msg.toolInvocations,
            })),
        [messages]
    );

    // Auto-scroll logic
    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        setShouldAutoScroll(isAtBottom);
    }, []);

    useEffect(() => {
        if (shouldAutoScroll && scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: isStreaming ? 'auto' : 'smooth',
            });
        }
    }, [history, isStreaming, shouldAutoScroll]);

    // Send handler
    const handleSend = useCallback(
        async (query?: string) => {
            const text = query ?? inputValue.trim();

            // Allow sending if there's text OR attachments
            if (!text && attachments.length === 0) return;
            if (isLoading || isUploading) return;

            // Build image attachments for multimodal AI (base64)
            const imageAttachments = attachments
                .filter(a => a.mimeType.startsWith('image/') && a.base64Data)
                .map(a => ({
                    base64: a.base64Data!,
                    mimeType: a.mimeType,
                    fileName: a.fileName,
                }));

            // Clear input and attachments first
            setInputValue('');
            clearAttachments();
            setShouldAutoScroll(true);
            triggerHaptic();

            // Send with multimodal attachments if present
            if (imageAttachments.length > 0) {
                await sendMessage(text || 'Please analyze this image.', imageAttachments);
            } else {
                await sendMessage(text);
            }
        },
        [inputValue, attachments, isLoading, isUploading, sendMessage, clearAttachments]
    );

    // Container sizing
    const containerStyle = useMemo(() => {
        if (isMinimized) {
            return { height: 48, width: 200, bottom: 32, right: 32, borderRadius: 9999 };
        }
        if (workspaceMode === 'full') {
            return { height: '100dvh', width: '100%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        }
        if (workspaceMode === 'split') {
            return { height: '100dvh', width: '50%', bottom: 0, right: 0, borderRadius: '40px 0 0 40px' };
        }
        return { height: 'min(840px, 90dvh)', width: 460, bottom: 32, right: 32, borderRadius: 28 };
    }, [isMinimized, workspaceMode]);

    // ========== RENDER: Closed ==========
    if (!isOpen) {
        return (
            <motion.button
                onClick={() => setIsOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                    'fixed bottom-8 right-8 z-50',
                    'flex items-center gap-3 px-6 py-3 rounded-full',
                    'bg-[#0A0A0B] border border-white/10 shadow-2xl',
                    'hover:border-white/20 transition-colors'
                )}
            >
                <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                <span className={SYSTEM.type.h1}>Command Center</span>
            </motion.button>
        );
    }

    // ========== RENDER: Minimized ==========
    if (isMinimized) {
        return (
            <motion.button
                layoutId="chat"
                onClick={() => setIsMinimized(false)}
                className={cn(
                    'fixed z-50 flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl',
                    'border-t border-white/10',
                    SYSTEM.surface.glass
                )}
                style={{ bottom: 32, right: 32 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                {isLoading && <OrbitalRadar />}
                <span className={SYSTEM.type.h1}>{isLoading ? 'Working...' : 'Command Center'}</span>
            </motion.button>
        );
    }

    // ========== RENDER: Full Interface ==========
    return (
        <ToastProvider>
            <LayoutGroup>
                <motion.div
                    layoutId="chat"
                    className={cn(
                        'fixed z-50 flex flex-col overflow-hidden isolate',
                        'border border-white/[0.08] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]',
                        SYSTEM.surface.void
                    )}
                    style={containerStyle}
                >
                    {/* Film Grain Overlay */}
                    <FilmGrain />

                    {/* Header */}
                    <header
                        className={cn(
                            'flex items-center justify-between px-8 pt-6 pb-2 shrink-0 z-20 select-none',
                            SYSTEM.surface.glass
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <Zap size={16} className="text-indigo-500" />
                            <span className={SYSTEM.type.h1}>
                                Command Center
                                <span className="text-white/30 font-normal ml-1">Weissach</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={clearChat}
                                className="px-3 py-1.5 text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all text-[11px] font-medium"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')}
                                className="p-2 text-zinc-600 hover:text-white transition-colors"
                            >
                                {workspaceMode === 'floating' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            </button>
                            <button
                                onClick={() => setIsMinimized(true)}
                                className="p-2 text-zinc-600 hover:text-white transition-colors"
                            >
                                <Minimize2 size={16} />
                            </button>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setWorkspaceMode('floating');
                                }}
                                className="p-2 text-zinc-600 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </header>

                    {/* Message Area */}
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="relative flex-1 overflow-y-auto px-6 pt-4 pb-44 scroll-smooth no-scrollbar z-10"
                    >
                        <AnimatePresence mode="popLayout">
                            {history.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="h-full flex flex-col items-center justify-center text-center opacity-40 pt-20"
                                >
                                    <div className="w-20 h-20 rounded-[24px] border border-white/10 bg-white/5 flex items-center justify-center mb-6">
                                        <Users size={28} className="text-zinc-600" />
                                    </div>
                                    <p className={SYSTEM.type.mono}>System Ready</p>
                                    <p className="text-[13px] text-zinc-600 mt-2 max-w-[280px]">
                                        Search candidates, analyze matches, draft outreach, calculate packages.
                                    </p>
                                </motion.div>
                            ) : (
                                history.map((msg, i) => (
                                    <MessageBubble
                                        key={i}
                                        role={msg.role}
                                        content={msg.content}
                                        isStreaming={isStreaming && i === history.length - 1 && msg.role === 'assistant'}
                                        toolInvocations={msg.toolInvocations}
                                    />
                                ))
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer */}
                    <footer
                        className={cn(
                            'absolute bottom-0 left-0 right-0 z-30 px-5 pt-20',
                            'pb-[max(2rem,env(safe-area-inset-bottom,0.5rem))]',
                            'bg-gradient-to-t from-[#030303] via-[#030303]/95 to-transparent',
                            'pointer-events-none'
                        )}
                    >
                        <div className="pointer-events-auto relative">
                            {/* Thinking Pill */}
                            <AnimatePresence>
                                {isLoading && (
                                    <ThinkingPill
                                        onStop={stop}
                                        status={isStreaming ? 'streaming' : 'thinking'}
                                    />
                                )}
                            </AnimatePresence>

                            {/* Smart Chips (show when empty or few messages) */}
                            <AnimatePresence>
                                {history.length < 2 && !isLoading && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="mb-4"
                                    >
                                        <SmartChips onSelect={handleSend} />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Input Deck */}
                            <InputDeck
                                value={inputValue}
                                onChange={setInputValue}
                                onSend={() => handleSend()}
                                onStop={stop}
                                isProcessing={isLoading}
                                inputRef={inputRef}
                                // File upload props
                                attachments={attachments}
                                onRemoveAttachment={removeFile}
                                isDragActive={isDragActive}
                                isUploading={isUploading}
                                dragHandlers={dragHandlers}
                                handlePaste={handlePaste}
                                triggerFileSelect={triggerFileSelect}
                                fileInputRef={fileInputRef}
                                onFilesSelected={(files) => files && addFiles(files)}
                            />

                            {/* Error display */}
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-3 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg"
                                >
                                    <span className="text-[12px] text-rose-400">Error: {error}</span>
                                </motion.div>
                            )}
                        </div>
                    </footer>
                </motion.div>
            </LayoutGroup>
        </ToastProvider>
    );
};

export default CommandCenterV2;
