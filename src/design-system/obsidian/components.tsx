/**
 * Shared UI Components
 * "Obsidian Weissach" Design System
 * 
 * Premium components for global use across the application.
 * Healthcare Recruiting Edition - Indigo Primary Theme
 */

import {
    memo,
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    useContext,
    createContext,
    type FC,
    type ReactNode
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SYSTEM } from './tokens';
import { cn, generateId, triggerHaptic, copyToClipboard } from './utils';

// ============================================================================
// FILM GRAIN - Premium texture overlay
// ============================================================================

export const FilmGrain: FC = memo(() => (
    <div
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] mix-blend-overlay"
        aria-hidden="true"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
    />
));

FilmGrain.displayName = 'FilmGrain';

// ============================================================================
// ORBITAL RADAR - Animated loading indicator
// ============================================================================

interface OrbitalRadarProps {
    color?: 'indigo' | 'emerald' | 'amber' | 'red' | 'blue' | 'white';
    size?: 'sm' | 'md' | 'lg';
}

export const OrbitalRadar: FC<OrbitalRadarProps> = memo(({
    color = 'indigo',
    size = 'md'
}) => {
    const colors = {
        indigo: { dot: 'bg-indigo-500', ring: 'border-indigo-500/30', glow: 'shadow-[0_0_8px_rgba(99,102,241,0.8)]' },
        emerald: { dot: 'bg-emerald-500', ring: 'border-emerald-500/30', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.8)]' },
        amber: { dot: 'bg-amber-500', ring: 'border-amber-500/30', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.8)]' },
        red: { dot: 'bg-red-500', ring: 'border-red-500/30', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.8)]' },
        blue: { dot: 'bg-blue-500', ring: 'border-blue-500/30', glow: 'shadow-[0_0_8px_rgba(59,130,246,0.8)]' },
        white: { dot: 'bg-white', ring: 'border-white/30', glow: 'shadow-[0_0_8px_rgba(255,255,255,0.8)]' },
    };

    const sizes = {
        sm: { container: 'w-3 h-3', dot: 'w-0.5 h-0.5' },
        md: { container: 'w-4 h-4', dot: 'w-1 h-1' },
        lg: { container: 'w-6 h-6', dot: 'w-1.5 h-1.5' },
    };

    const c = colors[color];
    const s = sizes[size];

    return (
        <div className={cn("relative flex items-center justify-center", s.container)}>
            <div className={cn("absolute rounded-full", s.dot, c.dot, c.glow)} />
            <motion.div
                className={cn("absolute inset-0 border rounded-full", c.ring)}
                animate={{ scale: [0.8, 1.8], opacity: [1, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            />
        </div>
    );
});

OrbitalRadar.displayName = 'OrbitalRadar';

// ============================================================================
// LOADING DOTS - CSS-only animated dots
// ============================================================================

interface LoadingDotsProps {
    label?: string;
    showLabel?: boolean;
}

export const LoadingDots: FC<LoadingDotsProps> = memo(({
    label = 'Thinking',
    showLabel = true
}) => (
    <div className="flex items-center gap-2">
        {showLabel && (
            <span className={cn(SYSTEM.type.bodySmall, 'text-zinc-500')}>{label}</span>
        )}
        <span className="loading-dots text-zinc-500">
            <span />
            <span />
            <span />
        </span>
    </div>
));

LoadingDots.displayName = 'LoadingDots';

// ============================================================================
// THINKING PILL - Status indicator with cycling labels
// ============================================================================

interface ThinkingPillProps {
    status?: 'thinking' | 'streaming' | 'grounding' | 'error';
    labels?: string[];
    onStop?: () => void;
}

export const ThinkingPill: FC<ThinkingPillProps> = memo(({
    status = 'thinking',
    labels,
    onStop
}) => {
    const [idx, setIdx] = useState(0);

    const defaultLabels: Record<string, string[]> = {
        thinking: ['PROCESSING', 'ANALYZING', 'COMPUTING', 'VERIFYING'],
        streaming: ['LIVE FEED'],
        grounding: ['SOURCING'],
        error: ['ERROR'],
    };

    const currentLabels = labels || defaultLabels[status] || defaultLabels.thinking;
    const text = currentLabels[idx % currentLabels.length];

    useEffect(() => {
        if (status === 'thinking' && currentLabels.length > 1) {
            const i = setInterval(() => setIdx(p => (p + 1) % currentLabels.length), 2200);
            return () => clearInterval(i);
        }
    }, [status, currentLabels.length]);

    const color: OrbitalRadarProps['color'] =
        status === 'error' ? 'red' :
            status === 'streaming' ? 'blue' :
                'indigo';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={SYSTEM.anim.fluid}
            className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-full",
                "bg-[#050505] border border-white/10 shadow-2xl"
            )}
        >
            <OrbitalRadar color={color} />
            <AnimatePresence mode="wait">
                <motion.span
                    key={text}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    className={cn(SYSTEM.type.mono, 'text-zinc-300 min-w-[80px] text-center')}
                >
                    {text}
                </motion.span>
            </AnimatePresence>
            {onStop && (
                <button
                    onClick={onStop}
                    className="ml-1 text-zinc-600 hover:text-zinc-200 transition-colors text-[10px] font-medium"
                >
                    Stop
                </button>
            )}
        </motion.div>
    );
});

ThinkingPill.displayName = 'ThinkingPill';

// ============================================================================
// VERDICT TICKET - Premium result card
// ============================================================================

interface VerdictTicketProps {
    content: string;
    label?: string;
    status?: 'verified' | 'pending' | 'error';
    sublabel?: string;
}

export const VerdictTicket: FC<VerdictTicketProps> = memo(({
    content,
    label = 'Result',
    status = 'verified',
    sublabel
}) => {
    const statusConfig = {
        verified: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-500', text: 'text-emerald-500', label: 'Verified' },
        pending: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-500', text: 'text-amber-500', label: 'Pending' },
        error: { bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-500', text: 'text-red-500', label: 'Error' },
    };

    const c = statusConfig[status];

    return (
        <motion.div
            layout
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SYSTEM.anim.fluid}
            className={cn(
                "relative overflow-hidden",
                SYSTEM.geo.cardMedium,
                "bg-[#0A0A0B] shadow-2xl",
                SYSTEM.surface.milled
            )}
        >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.03)_45%,transparent_50%)] bg-[length:200%_100%] animate-shimmer pointer-events-none" />

            {/* Header */}
            <div className="px-6 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <span className={SYSTEM.type.mono}>{label}</span>
                <div className={cn("flex items-center gap-2 px-2 py-0.5 rounded-full border", c.bg, c.border)}>
                    <span className={cn("w-1 h-1 rounded-full", c.dot, status !== 'error' && "animate-pulse")} />
                    <span className={cn("text-[9px] font-bold tracking-wider uppercase", c.text)}>
                        {c.label}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="relative p-6 flex items-start gap-4">
                <div className="flex-1">
                    <div className={SYSTEM.type.display}>{content}</div>
                    {sublabel && (
                        <div className={cn(SYSTEM.type.mono, "mt-3", c.text, "opacity-60")}>{sublabel}</div>
                    )}
                </div>
                {status === 'verified' && (
                    <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02]">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                            <motion.path
                                d="M20 6L9 17l-5-5"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={SYSTEM.anim.draw}
                            />
                        </svg>
                    </div>
                )}
            </div>
        </motion.div>
    );
});

VerdictTicket.displayName = 'VerdictTicket';

// ============================================================================
// TACTICAL HUD - Insight/alert card with accent border
// ============================================================================

interface TacticalHUDProps {
    content: string;
    label?: string;
    variant?: 'indigo' | 'amber' | 'emerald' | 'red' | 'blue';
}

export const TacticalHUD: FC<TacticalHUDProps> = memo(({
    content,
    label = 'Insight',
    variant = 'indigo'
}) => {
    const colors = {
        indigo: { border: 'border-l-indigo-500/80', text: 'text-indigo-500', content: 'text-indigo-100/90', surface: SYSTEM.surface.hud },
        amber: { border: 'border-l-amber-500/80', text: 'text-amber-500', content: 'text-amber-100/90', surface: SYSTEM.surface.hudWarning },
        emerald: { border: 'border-l-emerald-500/80', text: 'text-emerald-500', content: 'text-emerald-100/90', surface: SYSTEM.surface.hudSuccess },
        red: { border: 'border-l-red-500/80', text: 'text-red-500', content: 'text-red-100/90', surface: SYSTEM.surface.hudError },
        blue: { border: 'border-l-blue-500/80', text: 'text-blue-500', content: 'text-blue-100/90', surface: SYSTEM.surface.hudInfo },
    };

    const c = colors[variant];

    return (
        <motion.div
            layout
            initial={{ x: -5, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={SYSTEM.anim.fluid}
            className={cn(
                "relative overflow-hidden rounded-r-[16px] border-l-[3px]",
                c.border,
                c.surface
            )}
        >
            <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest", c.text)}>
                        {label}
                    </span>
                </div>
                <div className={cn("text-[14px] leading-[1.6] font-medium tracking-wide", c.content)}>
                    {content}
                </div>
            </div>
        </motion.div>
    );
});

TacticalHUD.displayName = 'TacticalHUD';

// ============================================================================
// SMART CHIPS - Quick action buttons
// ============================================================================

interface SmartChipsProps {
    chips?: Array<{ label: string; action: string }>;
    onSelect: (action: string) => void;
}

const DEFAULT_CHIPS = [
    { label: '📋 My Pipeline', action: 'Show my current pipeline' },
    { label: '🔥 Priority Tasks', action: 'What are my priority tasks today?' },
    { label: '📅 Upcoming Expirations', action: 'Show upcoming credential expirations' },
];

export const SmartChips: FC<SmartChipsProps> = memo(({ chips = DEFAULT_CHIPS, onSelect }) => (
    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {chips.map((chip, i) => (
            <motion.button
                key={chip.label}
                onClick={() => {
                    triggerHaptic();
                    onSelect(chip.action);
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, ...SYSTEM.anim.fluid }}
                whileHover={{ scale: 1.02, y: -1, backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    'px-3.5 py-2 bg-white/[0.03] border border-white/[0.08]',
                    'transition-all backdrop-blur-sm whitespace-nowrap',
                    SYSTEM.geo.pill
                )}
            >
                <span className={SYSTEM.type.chip}>{chip.label}</span>
            </motion.button>
        ))}
    </div>
));

SmartChips.displayName = 'SmartChips';

// ============================================================================
// COPY BUTTON - Text-only copy to clipboard
// ============================================================================

interface CopyButtonProps {
    content: string;
    className?: string;
}

export const CopyButton: FC<CopyButtonProps> = memo(({ content, className }) => {
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
                "px-2 py-1 transition-all duration-200",
                SYSTEM.geo.subtle,
                SYSTEM.type.mono,
                copied
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5",
                className
            )}
        >
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
});

CopyButton.displayName = 'CopyButton';

// ============================================================================
// TOAST SYSTEM
// ============================================================================

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
    showToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => { } });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [toast, setToast] = useState<Toast | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
        const id = generateId();
        setToast({ id, message, type });
        triggerHaptic();

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setToast(current => current?.id === id ? null : current);
        }, 2500);
    }, []);

    const colors = {
        success: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]',
        error: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]',
        info: 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,1)]',
    };

    return (
        <ToastContext.Provider value={useMemo(() => ({ showToast }), [showToast])}>
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
                            'fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]',
                            'flex items-center gap-3 px-4 py-2.5',
                            'bg-[#0A0A0A] border border-white/10',
                            SYSTEM.geo.toast,
                            SYSTEM.shadow.float
                        )}
                    >
                        <div className={cn("w-1.5 h-1.5 rounded-full", colors[toast.type])} />
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
// STATUS DOT - Simple status indicator
// ============================================================================

interface StatusDotProps {
    status: 'online' | 'offline' | 'busy' | 'away';
    size?: 'sm' | 'md' | 'lg';
    pulse?: boolean;
}

export const StatusDot: FC<StatusDotProps> = memo(({
    status,
    size = 'md',
    pulse = true
}) => {
    const colors = {
        online: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
        offline: 'bg-zinc-500',
        busy: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
        away: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    };

    const sizes = {
        sm: 'w-1.5 h-1.5',
        md: 'w-2 h-2',
        lg: 'w-3 h-3',
    };

    return (
        <div
            className={cn(
                "rounded-full",
                colors[status],
                sizes[size],
                pulse && status !== 'offline' && "animate-pulse"
            )}
        />
    );
});

StatusDot.displayName = 'StatusDot';

// ============================================================================
// EMPTY STATE
// ============================================================================

interface EmptyStateProps {
    title?: string;
    description?: string;
    children?: ReactNode;
}

export const EmptyState: FC<EmptyStateProps> = memo(({
    title = 'No data',
    description,
    children
}) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-full flex flex-col items-center justify-center text-center py-12"
    >
        <div className={cn(
            "w-20 h-20 flex items-center justify-center mb-6",
            SYSTEM.geo.cardMedium,
            "border border-white/10 bg-white/5"
        )}>
            <div className="w-1 h-1 bg-white/40 rounded-full shadow-[0_0_20px_white]" />
        </div>
        <p className={SYSTEM.type.mono}>{title}</p>
        {description && (
            <p className={cn(SYSTEM.type.bodySmall, "mt-2 max-w-[280px] opacity-60")}>
                {description}
            </p>
        )}
        {children && <div className="mt-6">{children}</div>}
    </motion.div>
));

EmptyState.displayName = 'EmptyState';
