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

import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    memo,
    createContext,
    useContext,
    type FC,
    type ReactNode,
    type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence, LayoutGroup, type Transition } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
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
} from 'lucide-react';

import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { useLayout } from '../context/LayoutContext';

// ============================================================================
// 1. WEISSACH DESIGN SYSTEM (Indigo Theme for Healthcare)
// ============================================================================

const SYSTEM = {
    anim: {
        fluid: { type: 'spring', damping: 30, stiffness: 380, mass: 0.8 } as Transition,
        draw: { duration: 0.6, ease: 'circOut' } as Transition,
        morph: { type: 'spring', damping: 25, stiffness: 280 } as Transition,
    },
    surface: {
        void: 'bg-[#050505]',
        panel: 'bg-[#080808] border border-white/[0.06]',
        glass: 'bg-white/[0.02] backdrop-blur-[20px] border border-white/[0.05]',
        hud: 'bg-[linear-gradient(180deg,rgba(79,70,229,0.05)_0%,rgba(0,0,0,0)_100%)] border border-indigo-500/20',
        milled: 'border-t border-white/[0.08] border-b border-black/50 border-x border-white/[0.04]',
    },
    type: {
        mono: 'font-mono text-[10px] tracking-[0.1em] uppercase text-zinc-500 tabular-nums',
        body: 'text-[15px] leading-[1.65] tracking-[-0.01em] text-[#A1A1AA]',
        h1: 'text-[13px] font-medium tracking-[-0.02em] text-white',
    },
    geo: {
        pill: 'rounded-full',
        card: 'rounded-[22px]',
        input: 'rounded-[24px]',
    },
};

// ============================================================================
// 2. UTILITIES
// ============================================================================

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

function generateId(): string {
    return typeof crypto !== 'undefined'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);
}

function triggerHaptic(): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(4);
    }
}

// ============================================================================
// 3. PREMIUM VISUALS
// ============================================================================

/**
 * FilmGrain - Subtle noise overlay for premium aesthetic
 * Uses inline SVG to avoid network requests
 */
const FilmGrain = memo(() => (
    <div
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] mix-blend-overlay"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
    />
));
FilmGrain.displayName = 'FilmGrain';

/**
 * OrbitalRadar - Pulsing indicator for active states
 * Pure CSS animation, no JS overhead
 */
const OrbitalRadar = memo(() => (
    <div className="relative w-4 h-4 flex items-center justify-center">
        <div className="absolute w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
        <motion.div
            className="absolute inset-0 border border-indigo-500/30 rounded-full"
            animate={{ scale: [0.8, 1.8], opacity: [1, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
    </div>
));
OrbitalRadar.displayName = 'OrbitalRadar';

// ============================================================================
// 4. TOAST SYSTEM
// ============================================================================

interface ToastContextType {
    showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<{ id: string; message: string } | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const showToast = useCallback((message: string) => {
        const id = generateId();
        setToast({ id, message });
        triggerHaptic();

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setToast((current) => (current?.id === id ? null : current));
        }, 2500);
    }, []);

    const contextValue = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={SYSTEM.anim.fluid}
                        className={cn(
                            'absolute bottom-28 left-1/2 -translate-x-1/2 z-[70]',
                            'flex items-center gap-3 px-4 py-2.5',
                            'bg-[#0A0A0A] border border-white/10 rounded-full',
                            'shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                        )}
                    >
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,1)]" />
                        <span className="text-[12px] font-medium text-white tracking-tight">
                            {toast.message}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </ToastContext.Provider>
    );
};

// ============================================================================
// 5. COPY BUTTON
// ============================================================================

const CopyButton: FC<{ content: string }> = memo(({ content }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        triggerHaptic();
        setTimeout(() => setCopied(false), 1500);
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
    const _toast = useContext(ToastContext); // Available for future toast notifications

    // Parse special content patterns
    const renderContent = useMemo(() => {
        if (!content) return null;

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
// 11. INPUT DECK
// ============================================================================

interface InputDeckProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    isProcessing: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement>;
}

const InputDeck: FC<InputDeckProps> = memo(
    ({ value, onChange, onSend, onStop, isProcessing, inputRef }) => {
        const handleKeyDown = (e: ReactKeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (value.trim()) onSend();
            }
            if (e.key === 'Escape' && isProcessing) {
                e.preventDefault();
                onStop();
            }
        };

        return (
            <motion.div
                layout
                className={cn(
                    'flex flex-col gap-2 p-1.5 relative overflow-hidden transition-colors duration-500',
                    SYSTEM.geo.input,
                    'bg-[#0A0A0B] shadow-2xl',
                    SYSTEM.surface.milled
                )}
                transition={SYSTEM.anim.fluid}
            >
                <div className="flex items-end gap-2">
                    {/* Attach button */}
                    <button className="p-3.5 rounded-[18px] text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
                        <Paperclip size={18} strokeWidth={1.5} />
                    </button>

                    {/* Textarea */}
                    <textarea
                        ref={inputRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about candidates, jobs, or pay packages..."
                        rows={1}
                        disabled={isProcessing}
                        className={cn(
                            'flex-1 bg-transparent border-none outline-none resize-none py-4',
                            'min-h-[52px] max-h-[120px]',
                            SYSTEM.type.body,
                            'text-white placeholder:text-zinc-600',
                            'disabled:opacity-50'
                        )}
                    />

                    {/* Send/Stop button */}
                    <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => (isProcessing ? onStop() : onSend())}
                        disabled={!isProcessing && !value.trim()}
                        className={cn(
                            'p-3 rounded-[18px] transition-all duration-300',
                            value.trim() || isProcessing
                                ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                                : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                        )}
                    >
                        {isProcessing ? (
                            <Square size={18} className="animate-pulse" />
                        ) : (
                            <ArrowUp size={18} strokeWidth={2.5} />
                        )}
                    </motion.button>
                </div>

                {/* Keyboard hint */}
                <div className="px-4 pb-1">
                    <span className={cn(SYSTEM.type.mono, 'text-zinc-700')}>
                        Enter to send · Shift+Enter for new line · Esc to stop
                    </span>
                </div>
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
            if (!text || isLoading) return;

            setInputValue('');
            setShouldAutoScroll(true);
            triggerHaptic();
            await sendMessage(text);
        },
        [inputValue, isLoading, sendMessage]
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
                            'absolute bottom-0 left-0 right-0 z-30 px-5 pb-8 pt-20',
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
