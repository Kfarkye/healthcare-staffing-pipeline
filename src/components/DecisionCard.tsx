/* ============================================================================
   DecisionCard.tsx  v5
   Universal Decision Surface — Obsidian Weissach

   Decision flow contract:
   ─ Stripe     Every interaction has an outcome. Actions go through
                idle → loading → success | error. The card acknowledges.
   ─ Bloomberg  Key stats rendered at glance level, not buried in tabs.
                Typed schema: label + value + optional signal. Decision
                data lives where the decision happens.
   ─ Notion     Headline, value, stats are tappable entities, not display
                text. Objects become actions.
   ─ Apple      Card does ONE thing: present a decision and take an action.
                Drawer is depth, not breadth. Max 4 tabs.
   ─ Amazon     Primary action is visually dominant. One tap from card
                appearance to work completed. Everything needed to decide
                is above the fold (above the drawer).

   Engineering (carried from v4):
   ─ Zero framer-motion. CSS grid drawer. Lazy tabs. Error boundary.
   ─ Tab budget enforced (4). Tab dedup. SSR-safe styles.
   ─ Summary truncation. Resize listener. Ref cleanup.

   Tokens:
   ─ Radius     20 card · 12 interactive · full badge
   ─ Ring       0.04 rest · 0.08 hover · 0.12 active
   ─ Text       white primary · zinc-400 secondary · zinc-600 tertiary
   ─ Type       9 label · 11 button/stat · 13 body · 20 value · 24 headline
   ─ Duration   150ms interaction · 250ms layout · 350ms entrance
============================================================================ */

import React, {
    useState, useCallback, useRef, useEffect, useTransition,
    useInsertionEffect, memo, Component,
    type FC, type ReactNode, type ErrorInfo,
} from 'react';

// ── Budgets ────────────────────────────────────────────────────────────────

const MAX_TABS = 4;
const MAX_STATS = 6;
const SUMMARY_TRUNCATE = 500;

// ── Tokens ─────────────────────────────────────────────────────────────────

const TONE = {
    positive: { dot: 'bg-emerald-500', text: 'text-emerald-400', pill: 'bg-emerald-500/8 ring-emerald-500/12' },
    neutral:  { dot: 'bg-amber-500',   text: 'text-amber-400',   pill: 'bg-amber-500/8 ring-amber-500/12' },
    negative: { dot: 'bg-rose-500',    text: 'text-rose-400',    pill: 'bg-rose-500/8 ring-rose-500/12' },
} as const;

const SIGNAL_CLASS = {
    go:    'text-emerald-400',
    hold:  'text-amber-400',
    stop:  'text-rose-500',
    muted: 'text-zinc-500',
} as const;

// ── Types ──────────────────────────────────────────────────────────────────

export type VerdictTone = keyof typeof TONE;
export type Signal = keyof typeof SIGNAL_CLASS;

/** Outcome of an action — drives card-level feedback. */
export type ActionOutcome = 'idle' | 'loading' | 'success' | 'error';

export interface ActionButton {
    label: string;
    onClick: () => void;
    /** Lifecycle state — drives spinner, checkmark, or error icon. */
    outcome?: ActionOutcome;
    disabled?: boolean;
}

/** Bloomberg glance stat — key decision data at scan level. */
export interface GlanceStat {
    label: string;
    value: string;
    /** Color signal — go/hold/stop/muted. */
    signal?: Signal;
    /** Makes this stat a tappable entity (Notion: objects → actions). */
    onClick?: () => void;
}

export interface DrawerTab {
    id: string;
    label: string;
    content: ReactNode | (() => ReactNode);
}

export interface DecisionCardProps {
    /** Category — THE PICK, THE MATCH, THE TRADE */
    label: string;
    /** Primary subject. Tappable if onHeadlineClick provided. */
    headline: string;
    onHeadlineClick?: () => void;
    /** Monospace qualifier — odds, rate, price. Tappable if onValueClick. */
    value?: string;
    onValueClick?: () => void;
    /** Status verdict badge */
    verdict?: { tone: VerdictTone; label: string };
    /** Bloomberg glance stats — above the fold, at the point of decision. Max 6. */
    stats?: GlanceStat[];
    /** Thesis paragraph — truncated at 500 chars. */
    summary?: string | ReactNode;
    /** Primary CTA — TAIL, SUBMIT, BUY. Visually dominant. */
    primaryAction?: ActionButton;
    /** Secondary CTA — FADE, PASS, SKIP. Visually recessive. */
    secondaryAction?: ActionButton;
    /** Share handler */
    onShare?: () => void;
    /** Drawer toggle label. Default: ANALYSIS */
    drawerLabel?: string;
    /** Tabbed drawer depth. Max 4 tabs enforced. */
    tabs?: DrawerTab[];
    /** Single-panel drawer */
    drawerContent?: ReactNode | (() => ReactNode);
    /** Start drawer open */
    defaultOpen?: boolean;
}

// ── Inline SVGs ────────────────────────────────────────────────────────────

const Chevron: FC = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const ShareArrow: FC = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
    </svg>
);

const SpinnerIcon: FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const CheckIcon: FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const XIcon: FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

// ── Styles ─────────────────────────────────────────────────────────────────

const STYLE_ID = 'dc-v5';
const CSS = `
@keyframes dc-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.dc-card{animation:dc-in .35s cubic-bezier(.23,1,.32,1) both}
.dc-grid{display:grid;grid-template-rows:0fr;transition:grid-template-rows .25s cubic-bezier(.23,1,.32,1)}
.dc-grid[data-open="true"]{grid-template-rows:1fr}
.dc-grid-inner{overflow:hidden}
.dc-ind{transition:transform .2s cubic-bezier(.23,1,.32,1),width .2s cubic-bezier(.23,1,.32,1)}
@keyframes dc-flash{0%{opacity:1}50%{opacity:.6}100%{opacity:1}}
.dc-outcome{animation:dc-flash .4s ease}
`;

function useStyles() {
    useInsertionEffect(() => {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }, []);
}

// ── Error Boundary ─────────────────────────────────────────────────────────

interface BoundaryState { error: Error | null }

class PanelBoundary extends Component<{ tabId: string; children: ReactNode }, BoundaryState> {
    state: BoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): BoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[DecisionCard] Panel "${this.props.tabId}" threw:`, error, info.componentStack);
        }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="py-4 px-2 text-center">
                    <p className="text-[11px] text-zinc-600">Failed to load panel</p>
                    {process.env.NODE_ENV !== 'production' && (
                        <p className="text-[10px] text-rose-500/60 font-mono mt-1 break-all">
                            {this.state.error.message}
                        </p>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolve(c: ReactNode | (() => ReactNode)): ReactNode {
    return typeof c === 'function' ? c() : c;
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function enforceBudget<T>(arr: T[], max: number, name: string): T[] {
    if (arr.length <= max) return arr;
    if (process.env.NODE_ENV !== 'production') {
        console.warn(`[DecisionCard] ${arr.length} ${name} exceeds budget of ${max}. Dropping excess.`);
    }
    return arr.slice(0, max);
}

function deduplicateTabs(tabs: DrawerTab[]): DrawerTab[] {
    const seen = new Set<string>();
    return tabs.filter(t => {
        if (seen.has(t.id)) {
            if (process.env.NODE_ENV !== 'production') console.warn(`[DecisionCard] Duplicate tab "${t.id}" dropped.`);
            return false;
        }
        seen.add(t.id);
        return true;
    });
}

// ── Action Button Sub-Component ────────────────────────────────────────────

const OUTCOME_ICON: Record<ActionOutcome, FC | null> = {
    idle: null,
    loading: SpinnerIcon,
    success: CheckIcon,
    error: XIcon,
};

const ActionBtn: FC<{
    action: ActionButton;
    variant: 'primary' | 'secondary';
}> = memo(({ action, variant }) => {
    const outcome = action.outcome ?? 'idle';
    const busy = outcome === 'loading';
    const done = outcome === 'success' || outcome === 'error';
    const off = action.disabled || busy;
    const Icon = OUTCOME_ICON[outcome];

    const base = 'flex-1 h-11 rounded-[12px] ring-1 text-[11px] font-semibold tracking-[0.1em] uppercase transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2';

    const style = variant === 'primary'
        ? off
            ? `${base} bg-white/[0.03] ring-white/[0.04] text-zinc-600 cursor-not-allowed`
            : done && outcome === 'success'
                ? `${base} bg-emerald-500/[0.08] ring-emerald-500/[0.12] text-emerald-400 dc-outcome`
                : done && outcome === 'error'
                    ? `${base} bg-rose-500/[0.08] ring-rose-500/[0.12] text-rose-400 dc-outcome`
                    : `${base} bg-white/[0.07] ring-white/[0.08] hover:bg-white/[0.11] hover:ring-white/[0.12] text-white`
        : off
            ? `${base} ring-white/[0.02] text-zinc-700 cursor-not-allowed`
            : `${base} ring-white/[0.04] hover:ring-white/[0.08] text-zinc-600 hover:text-zinc-400`;

    return (
        <button
            onClick={off ? undefined : action.onClick}
            disabled={off}
            aria-busy={busy || undefined}
            className={style}
        >
            {Icon && <Icon />}
            {action.label}
        </button>
    );
});

// ── Glance Stats Row ───────────────────────────────────────────────────────

const StatsRow: FC<{ stats: GlanceStat[] }> = memo(({ stats }) => {
    if (!stats.length) return null;
    const bounded = enforceBudget(stats, MAX_STATS, 'stats');

    return (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {bounded.map((stat, i) => {
                const colorClass = stat.signal ? SIGNAL_CLASS[stat.signal] : 'text-zinc-300';
                const Tag = stat.onClick ? 'button' : 'div';

                return (
                    <Tag
                        key={`${stat.label}-${i}`}
                        onClick={stat.onClick}
                        className={`flex items-baseline gap-1.5 group ${
                            stat.onClick ? 'cursor-pointer' : ''
                        }`}
                    >
                        <span className="text-[9px] font-medium tracking-[0.04em] uppercase text-zinc-600">
                            {stat.label}
                        </span>
                        <span className={`text-[13px] tabular-nums font-medium ${colorClass} ${
                            stat.onClick ? 'group-hover:underline underline-offset-2 decoration-current/30' : ''
                        }`}>
                            {stat.value}
                        </span>
                    </Tag>
                );
            })}
        </div>
    );
});

// ── Component ──────────────────────────────────────────────────────────────

export const DecisionCard: FC<DecisionCardProps> = memo(function DecisionCard({
    label, headline, onHeadlineClick, value, onValueClick,
    verdict, stats, summary,
    primaryAction, secondaryAction, onShare,
    drawerLabel = 'ANALYSIS', tabs: rawTabs, drawerContent,
    defaultOpen = false,
}) {
    useStyles();

    const tabs = rawTabs ? enforceBudget(deduplicateTabs(rawTabs), MAX_TABS, 'tabs') : undefined;

    const [open, setOpen] = useState(defaultOpen);
    const [activeTab, setActiveTab] = useState(tabs?.[0]?.id ?? '');
    const [, startTransition] = useTransition();
    const hasDrawer = Boolean(tabs?.length || drawerContent);
    const tone = verdict ? TONE[verdict.tone] : null;

    // Guard: activeTab must be valid
    const validTab = tabs?.some(t => t.id === activeTab) ? activeTab : tabs?.[0]?.id ?? '';
    useEffect(() => {
        if (validTab !== activeTab) setActiveTab(validTab);
    }, [validTab, activeTab]);

    // ── Tab indicator ──
    const barRef = useRef<HTMLDivElement>(null);
    const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const indRef = useRef<HTMLDivElement>(null);

    const syncIndicator = useCallback(() => {
        const bar = barRef.current;
        const btn = btnRefs.current.get(validTab);
        const ind = indRef.current;
        if (!bar || !btn || !ind) {
            if (ind) ind.style.width = '0px';
            return;
        }
        const bx = bar.getBoundingClientRect().left;
        const br = btn.getBoundingClientRect();
        const pad = 12;
        ind.style.transform = `translateX(${br.left - bx + pad}px)`;
        ind.style.width = `${br.width - pad * 2}px`;
    }, [validTab]);

    useEffect(() => {
        syncIndicator();
        window.addEventListener('resize', syncIndicator);
        return () => window.removeEventListener('resize', syncIndicator);
    }, [syncIndicator, open]);

    useEffect(() => {
        const refs = btnRefs.current;
        return () => { refs.clear(); };
    }, []);

    const toggle = useCallback(() => {
        startTransition(() => setOpen(p => !p));
    }, [startTransition]);

    // Lazy panel
    const tabDef = tabs?.find(t => t.id === validTab);
    const panel = drawerContent
        ? resolve(drawerContent)
        : tabDef ? resolve(tabDef.content) : null;

    // Truncate
    const trimmedSummary = typeof summary === 'string'
        ? truncate(summary, SUMMARY_TRUNCATE)
        : summary;

    // ── Derived: has the primary action reached an outcome? ──
    const primaryOutcome = primaryAction?.outcome ?? 'idle';
    const cardDone = primaryOutcome === 'success' || primaryOutcome === 'error';

    return (
        <article
            className="dc-card rounded-[20px] bg-[#0A0A0B] ring-1 ring-white/[0.04] overflow-hidden"
            data-outcome={cardDone ? primaryOutcome : undefined}
        >

            {/* ── Header ── */}
            <div className="px-6 pt-5">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[9px] font-semibold tracking-[0.14em] uppercase text-zinc-600">
                        {label}
                    </span>
                    {tone && verdict && (
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 ${tone.pill}`}>
                            <span className={`w-[5px] h-[5px] rounded-full ${tone.dot}`} />
                            <span className={`text-[9px] font-semibold tracking-[0.08em] uppercase ${tone.text}`}>
                                {verdict.label}
                            </span>
                        </span>
                    )}
                </div>

                {/* Headline + Value — tappable entities (Notion) */}
                <div className="flex items-baseline gap-3 flex-wrap">
                    {onHeadlineClick ? (
                        <button
                            onClick={onHeadlineClick}
                            className="text-[24px] font-semibold text-white tracking-[-0.025em] leading-[1.1] hover:underline underline-offset-4 decoration-white/20 transition-all duration-150 text-left"
                        >
                            {headline}
                        </button>
                    ) : (
                        <h2 className="text-[24px] font-semibold text-white tracking-[-0.025em] leading-[1.1]">
                            {headline}
                        </h2>
                    )}
                    {value && (
                        onValueClick ? (
                            <button
                                onClick={onValueClick}
                                className="text-[20px] font-mono font-normal text-zinc-500 tracking-[-0.01em] whitespace-nowrap hover:text-zinc-300 transition-colors duration-150"
                            >
                                {value}
                            </button>
                        ) : (
                            <span className="text-[20px] font-mono font-normal text-zinc-600 tracking-[-0.01em] whitespace-nowrap">
                                {value}
                            </span>
                        )
                    )}
                </div>

                {/* Glance stats — Bloomberg density, above the fold */}
                {stats && stats.length > 0 && (
                    <div className="mt-3">
                        <StatsRow stats={stats} />
                    </div>
                )}

                <div className="mt-5 h-px bg-white/[0.04]" />
            </div>

            {/* Summary */}
            {trimmedSummary && (
                <div className="px-6 pt-4">
                    {typeof trimmedSummary === 'string'
                        ? <p className="text-[13px] text-zinc-400 leading-[1.7]">{trimmedSummary}</p>
                        : trimmedSummary}
                </div>
            )}

            {/* ── Actions — primary visually dominant (Amazon one-click) ── */}
            {(primaryAction || secondaryAction || onShare) && (
                <div className="px-6 pt-5 pb-5 flex items-center gap-3">
                    {primaryAction && (
                        <ActionBtn action={primaryAction} variant="primary" />
                    )}
                    {secondaryAction && (
                        <ActionBtn action={secondaryAction} variant="secondary" />
                    )}
                    {onShare && (
                        <button
                            onClick={onShare}
                            aria-label="Share"
                            className="h-11 w-11 rounded-[12px] ring-1 ring-white/[0.04] hover:ring-white/[0.08] text-zinc-600 hover:text-zinc-400 flex items-center justify-center transition-all duration-150 active:scale-[0.96] shrink-0"
                        >
                            <ShareArrow />
                        </button>
                    )}
                </div>
            )}

            {/* ── Drawer — depth, not breadth (Apple single-purpose) ── */}
            {hasDrawer && (
                <div className="px-4 pb-4">
                    <button
                        onClick={toggle}
                        aria-expanded={open}
                        className={`w-full flex items-center justify-center gap-2 h-10 rounded-[12px] ring-1 transition-all duration-150 ${
                            open
                                ? 'bg-emerald-500/[0.04] ring-emerald-500/[0.08] text-emerald-400'
                                : 'ring-white/[0.04] text-zinc-600 hover:text-zinc-400 hover:ring-white/[0.08]'
                        }`}
                    >
                        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase">
                            {drawerLabel}
                        </span>
                        <span
                            className={`inline-flex transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                            style={{ transitionTimingFunction: 'cubic-bezier(0.23,1,0.32,1)' }}
                        >
                            <Chevron />
                        </span>
                    </button>

                    <div className="dc-grid" data-open={open} role="region" aria-hidden={!open}>
                        <div className="dc-grid-inner">
                            {tabs && tabs.length > 1 && (
                                <div
                                    ref={barRef}
                                    className="relative flex mt-4 border-b border-white/[0.04] overflow-x-auto"
                                    role="tablist"
                                    style={{ scrollbarWidth: 'none' }}
                                >
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            ref={el => {
                                                if (el) btnRefs.current.set(tab.id, el);
                                                else btnRefs.current.delete(tab.id);
                                            }}
                                            onClick={() => setActiveTab(tab.id)}
                                            role="tab"
                                            aria-selected={validTab === tab.id}
                                            aria-controls={`dc-panel-${tab.id}`}
                                            className={`relative shrink-0 px-4 pb-3 pt-1 text-[11px] font-medium tracking-[0.04em] uppercase transition-colors duration-150 ${
                                                validTab === tab.id ? 'text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                    <div
                                        ref={indRef}
                                        className="dc-ind absolute bottom-0 h-px bg-zinc-400"
                                        style={{ width: 0 }}
                                        aria-hidden="true"
                                    />
                                </div>
                            )}

                            <div className="pt-4 pb-2 px-2" role="tabpanel" id={`dc-panel-${validTab}`}>
                                {open && (
                                    <PanelBoundary tabId={validTab} key={validTab}>
                                        {panel}
                                    </PanelBoundary>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
});

export default DecisionCard;
