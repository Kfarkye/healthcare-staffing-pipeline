/* ============================================================================
   RecruitingPanels.tsx  v4
   Domain-Specific Tab Content — Healthcare Staffing

   Engineering contract:
   ─ Stripe     Each panel validates its own data shape. If a required field
                is missing, the row doesn't render — but the panel does.
   ─ Amazon     `classify()` uses exact match map, not substring search.
                "not active" never matches "active".
   ─ Google     MAX_SOURCES=20, MAX_PIPELINE_ROWS=50. Enforced with slice.
                Dev warning on exceed.
   ─ Toyota     No `as` casts in this file. Panels accept typed props
                and handle missing fields individually.

   Performance (carried from v3):
   ─ Zero framer-motion. Pure content components.
   ─ Inline SVG icon paths. No lucide-react import.
   ─ Every panel is memo'd, keyed by data identity.

   Tokens (shared with DecisionCard v4):
   ─ Radius     20 card · 12 interactive · full badge
   ─ Ring       0.04 rest · 0.08 hover · 0.12 active
   ─ Text       white primary · zinc-400 secondary · zinc-600 tertiary
   ─ Type       9 label · 11 button · 13 body · 20 value · 24 headline
============================================================================ */

import React, { memo, type FC } from 'react';

// ── Budgets ────────────────────────────────────────────────────────────────

const MAX_SOURCES = 20;
const MAX_PIPELINE_ROWS = 50;
const MAX_LICENSES = 12;
const MAX_REQUIRED_ITEMS = 8;

function budgetSlice<T>(arr: T[], max: number, label: string): T[] {
    if (arr.length <= max) return arr;
    if (process.env.NODE_ENV !== 'production') {
        console.warn(`[RecruitingPanels] ${label}: ${arr.length} items exceeds budget of ${max}. Truncating.`);
    }
    return arr.slice(0, max);
}

// ── Status Classification (exact match, not substring) ─────────────────────

type Signal = 'go' | 'hold' | 'stop' | 'muted';

const SIGNAL_CLASS: Record<Signal, string> = {
    go:    'bg-emerald-500/10 text-emerald-400 ring-emerald-500/12',
    hold:  'bg-amber-500/10 text-amber-400 ring-amber-500/12',
    stop:  'bg-rose-500/10 text-rose-400 ring-rose-500/12',
    muted: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/12',
};

/** Exact lowercase match. No ambiguity. No substring collision. */
const STATUS_MAP: Record<string, Signal> = {
    // go
    'active': 'go', 'interested': 'go', 'ready': 'go',
    'strong match': 'go', 'confirmed': 'go', 'available': 'go', 'submitted': 'go',
    // hold
    'pending': 'hold', 'hold': 'hold', 'review': 'hold',
    'review needed': 'hold', 'interviewing': 'hold', 'offer': 'hold',
    // stop
    'declined': 'stop', 'rejected': 'stop', 'dnr': 'stop',
    'expired': 'stop', 'not a fit': 'stop', 'inactive': 'stop', 'cancelled': 'stop',
};

function classify(raw?: string): Signal {
    if (!raw) return 'muted';
    return STATUS_MAP[raw.toLowerCase().trim()] ?? 'muted';
}

// ── Inline SVG icon component ──────────────────────────────────────────────

const Ico: FC<{ d: string; size?: number; className?: string }> = ({ d, size = 12, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={className} aria-hidden="true">
        <path d={d} />
    </svg>
);

const ICON = {
    mail:   'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
    phone:  'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
    pin:    'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    user:   'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    ext:    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    dollar: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    file:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
    chevR:  'M9 18l6-6-6-6',
    clock:  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2',
    zap:    'M13 2L3 14h9l-1 10 10-12h-9l1-10',
} as const;

// ── Types ──────────────────────────────────────────────────────────────────

export interface CandidateData {
    name: string;
    specialty?: string;
    profession?: string;
    status?: string;
    email?: string;
    phone?: string;
    home_state?: string;
    recruiter?: string;
    licenses?: string[];
    nova_url?: string;
}

export interface PayPackageData {
    facility?: string;
    location?: string;
    specialty?: string;
    gross_weekly?: number | string;
    taxable_hourly?: number;
    stipend_weekly?: number;
    housing_weekly?: number;
    meals_weekly?: number;
    hours_per_week?: number;
    shift?: string;
    start_date?: string;
    end_date?: string;
    // Margin calculator fields
    margin_url?: string;
    actual_margin?: number;
    account_manager?: string;
    contract_weeks?: number;
    contract_commission?: number;
    ot_pay_rate?: number;
}

export interface LicensureData {
    candidate_name?: string;
    state?: string;
    profession?: string;
    license_status?: 'active' | 'expired' | 'pending' | string;
    license_number?: string;
    expiration?: string;
    board_url?: string;
}

export interface NextStepAction {
    type: 'open_nova' | 'await_docs' | 'await_availability' | 'move_stage' | 'send_email';
    label: string;
    href?: string;
    required?: string[];
    stage?: string;
    enabled_when?: string;
}

export interface SourceData {
    index: number;
    label: string;
    url: string;
}

// ── Shared atoms ───────────────────────────────────────────────────────────

const Chip: FC<{ signal?: Signal; children: React.ReactNode }> = ({ signal = 'muted', children }) => (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full ring-1 text-[10px] font-semibold shrink-0 ${SIGNAL_CLASS[signal]}`}>
        {children}
    </span>
);

const Row: FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
    <div className="flex items-center justify-between py-0.5">
        <span className="text-[11px] text-zinc-600">{label}</span>
        <span className={`text-[12px] text-zinc-300 ${mono ? 'tabular-nums font-mono' : 'font-medium'}`}>{children}</span>
    </div>
);

const SectionLabel: FC<{ icon: string; children: React.ReactNode; className?: string }> = ({ icon, children, className }) => (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
        <Ico d={icon} size={10} className="text-zinc-600" />
        <span className="text-[9px] font-semibold tracking-[0.1em] uppercase text-zinc-600">{children}</span>
    </div>
);

// ── Link atom (Tailwind purge-safe static themes) ──────────────────────────

const LINK_THEME = {
    indigo: {
        wrap: 'bg-indigo-500/[0.04] ring-indigo-500/10 hover:bg-indigo-500/[0.08] hover:ring-indigo-500/18',
        dot:  'bg-indigo-500/10',
        ico:  'text-indigo-400',
        text: 'text-indigo-300/70 group-hover:text-indigo-300',
        chev: 'text-indigo-500/20 group-hover:text-indigo-400/60',
    },
    emerald: {
        wrap: 'bg-emerald-500/[0.04] ring-emerald-500/10 hover:bg-emerald-500/[0.08] hover:ring-emerald-500/18',
        dot:  'bg-emerald-500/10',
        ico:  'text-emerald-400',
        text: 'text-emerald-300/70 group-hover:text-emerald-300',
        chev: 'text-emerald-500/20 group-hover:text-emerald-400/60',
    },
    cyan: {
        wrap: 'bg-cyan-500/[0.04] ring-cyan-500/10 hover:bg-cyan-500/[0.08] hover:ring-cyan-500/18',
        dot:  'bg-cyan-500/10',
        ico:  'text-cyan-400',
        text: 'text-cyan-300/70 group-hover:text-cyan-300',
        chev: 'text-cyan-500/20 group-hover:text-cyan-400/60',
    },
} as const;

type LinkColor = keyof typeof LINK_THEME;

const ActionLink: FC<{ href: string; icon: string; color: LinkColor; children: React.ReactNode }> = ({ href, icon, color, children }) => {
    const t = LINK_THEME[color];
    return (
        <a href={href} target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-2.5 p-3 rounded-[10px] ring-1 transition-all duration-150 group ${t.wrap}`}>
            <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0 ${t.dot}`}>
                <Ico d={icon} size={12} className={t.ico} />
            </div>
            <span className={`text-[11px] font-medium flex-1 truncate transition-colors duration-150 ${t.text}`}>
                {children}
            </span>
            <Ico d={ICON.chevR} size={12} className={`transition-colors duration-150 shrink-0 ${t.chev}`} />
        </a>
    );
};

// ── DETAILS Panel ──────────────────────────────────────────────────────────

export const CandidatePanel: FC<{ data: CandidateData }> = memo(({ data }) => {
    const meta = [data.specialty, data.profession].filter(Boolean).join(' · ');
    const licenses = data.licenses ? budgetSlice(data.licenses, MAX_LICENSES, 'licenses') : [];

    return (
        <div className="space-y-3">
            {(meta || data.status) && (
                <div className="flex items-center justify-between">
                    {meta && <span className="text-[11px] text-zinc-500 font-medium">{meta}</span>}
                    {data.status && <Chip signal={classify(data.status)}>{data.status}</Chip>}
                </div>
            )}

            <div className="space-y-2.5 pt-1">
                {data.email && (
                    <div className="flex items-center gap-2.5">
                        <Ico d={ICON.mail} size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400 font-mono truncate">{data.email}</span>
                    </div>
                )}
                {data.phone && (
                    <div className="flex items-center gap-2.5">
                        <Ico d={ICON.phone} size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400 font-mono">{data.phone}</span>
                    </div>
                )}
                {data.home_state && (
                    <div className="flex items-center gap-2.5">
                        <Ico d={ICON.pin} size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400">{data.home_state}</span>
                    </div>
                )}
                {data.recruiter && (
                    <div className="flex items-center gap-2.5">
                        <Ico d={ICON.user} size={11} className="text-zinc-600 shrink-0" />
                        <span className="text-[12px] text-zinc-400">{data.recruiter}</span>
                    </div>
                )}
            </div>

            {licenses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {licenses.map((lic, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md ring-1 ring-cyan-500/15 bg-cyan-500/[0.06] text-[10px] text-cyan-400/80 font-medium">
                            {lic}
                        </span>
                    ))}
                </div>
            )}

            {data.nova_url && <ActionLink href={data.nova_url} icon={ICON.ext} color="indigo">View in Nova</ActionLink>}
        </div>
    );
});
CandidatePanel.displayName = 'CandidatePanel';

// ── PACKAGE Panel ──────────────────────────────────────────────────────────

export const PayPackagePanel: FC<{ data: PayPackageData }> = memo(({ data }) => {
    const formatGross = (v: number | string) =>
        typeof v === 'number' ? v.toLocaleString() : v;

    return (
        <div className="space-y-3">
            {(data.facility || data.location) && (
                <div>
                    <SectionLabel icon={ICON.dollar} className="mb-1.5">Pay Package</SectionLabel>
                    {data.facility && <h4 className="text-[14px] font-semibold text-white">{data.facility}</h4>}
                    {(data.location || data.specialty) && (
                        <span className="text-[11px] text-zinc-500 font-medium">
                            {[data.location, data.specialty].filter(Boolean).join(' · ')}
                        </span>
                    )}
                </div>
            )}

            {data.gross_weekly != null && (
                <div className="flex items-baseline gap-1 pt-1">
                    <span className="text-[28px] font-semibold text-emerald-400 tabular-nums tracking-tight">
                        ${formatGross(data.gross_weekly)}
                    </span>
                    <span className="text-[11px] text-zinc-600 font-medium">/week</span>
                </div>
            )}

            <div className="space-y-1">
                {data.taxable_hourly != null && <Row label="Taxable Hourly" mono>${data.taxable_hourly}/hr</Row>}
                {data.stipend_weekly != null && <Row label="Stipend" mono>${data.stipend_weekly}/wk</Row>}
                {data.housing_weekly != null && <Row label="Housing" mono>${data.housing_weekly}/wk</Row>}
                {data.meals_weekly != null && <Row label="M&IE" mono>${data.meals_weekly}/wk</Row>}
                {data.hours_per_week != null && (
                    <>
                        <div className="h-px bg-white/[0.03] my-1.5" />
                        <Row label="Hours/Week" mono>{data.hours_per_week}</Row>
                    </>
                )}
                {data.shift && <Row label="Shift">{data.shift}</Row>}
            </div>

            {(data.start_date || data.end_date) && (
                <div className="flex gap-5 pt-2 border-t border-white/[0.04]">
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

            {(data.actual_margin != null || data.account_manager || data.contract_weeks != null || data.ot_pay_rate != null || data.contract_commission != null) && (
                <div className="space-y-1 pt-2 border-t border-white/[0.04]">
                    <SectionLabel icon={ICON.zap} className="mb-1.5">Margin Intel</SectionLabel>
                    {data.actual_margin != null && <Row label="Actual Margin" mono>{data.actual_margin}%</Row>}
                    {data.account_manager && <Row label="Acct Manager">{data.account_manager}</Row>}
                    {data.contract_weeks != null && <Row label="Contract" mono>{data.contract_weeks} wks</Row>}
                    {data.ot_pay_rate != null && <Row label="OT Rate" mono>${data.ot_pay_rate}/hr</Row>}
                    {data.contract_commission != null && <Row label="Commission" mono>${data.contract_commission.toLocaleString()}</Row>}
                </div>
            )}

            {data.margin_url && <ActionLink href={data.margin_url} icon={ICON.ext} color="emerald">View Margin Calculator</ActionLink>}
        </div>
    );
});
PayPackagePanel.displayName = 'PayPackagePanel';

// ── CREDENTIALS Panel ──────────────────────────────────────────────────────

export const LicensurePanel: FC<{ data: LicensureData }> = memo(({ data }) => {
    const signal: Signal =
        data.license_status === 'active' ? 'go' :
        data.license_status === 'expired' ? 'stop' :
        data.license_status === 'pending' ? 'hold' : 'muted';

    const displayStatus =
        data.license_status === 'active' ? 'Active' :
        data.license_status === 'expired' ? 'Expired' :
        data.license_status === 'pending' ? 'Pending' : 'Unknown';

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <SectionLabel icon={ICON.shield}>Licensure</SectionLabel>
                <Chip signal={signal}>{displayStatus}</Chip>
            </div>

            {data.candidate_name && (
                <h4 className="text-[14px] font-semibold text-white">{data.candidate_name}</h4>
            )}

            <div className="grid grid-cols-2 gap-3">
                {data.state && (
                    <div>
                        <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">State</span>
                        <span className="text-[13px] text-zinc-300 font-medium">{data.state}</span>
                    </div>
                )}
                {data.profession && (
                    <div>
                        <span className="text-[9px] font-medium tracking-[0.06em] uppercase text-zinc-600 block">Profession</span>
                        <span className="text-[13px] text-zinc-300 font-medium">{data.profession}</span>
                    </div>
                )}
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

            {data.board_url && <ActionLink href={data.board_url} icon={ICON.ext} color="cyan">Verify on State Board</ActionLink>}
        </div>
    );
});
LicensurePanel.displayName = 'LicensurePanel';

// ── PIPELINE Panel ─────────────────────────────────────────────────────────

export const PipelinePanel: FC<{ columns: string[]; rows: Record<string, unknown>[] }> = memo(({ columns, rows: rawRows }) => {
    if (!columns.length || !rawRows.length) return null;
    const rows = budgetSlice(rawRows, MAX_PIPELINE_ROWS, 'pipeline rows');

    return (
        <div className="overflow-x-auto -mx-1">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-white/[0.02]">
                        {columns.map(col => (
                            <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-zinc-600 uppercase tracking-wider whitespace-nowrap">
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                    {rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-white/[0.02] transition-colors duration-100">
                            {columns.map(col => {
                                const val = String(row[col] ?? '');
                                const sig = classify(val);
                                return (
                                    <td key={col} className="px-3 py-2.5">
                                        {sig !== 'muted'
                                            ? <Chip signal={sig}>{val}</Chip>
                                            : <span className="text-[12px] text-zinc-300 tabular-nums">{val}</span>
                                        }
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
});
PipelinePanel.displayName = 'PipelinePanel';

// ── ACTIONS Panel ──────────────────────────────────────────────────────────

export const ActionsPanel: FC<{ steps: NextStepAction[] }> = memo(({ steps }) => {
    if (!steps?.length) return null;

    return (
        <div className="space-y-1.5">
            {steps.map((step, i) => {
                if ((step.type === 'open_nova' || step.type === 'send_email') && step.href) {
                    const color: LinkColor = step.type === 'open_nova' ? 'indigo' : 'emerald';
                    const icon = step.type === 'open_nova' ? ICON.ext : ICON.mail;
                    return <ActionLink key={i} href={step.href} icon={icon} color={color}>{step.label}</ActionLink>;
                }

                if (step.type === 'await_docs' || step.type === 'await_availability') {
                    const reqs = step.required
                        ? budgetSlice(step.required, MAX_REQUIRED_ITEMS, 'required items')
                        : [];
                    return (
                        <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] bg-amber-500/[0.03] ring-1 ring-amber-500/10">
                            <Ico d={ICON.clock} size={12} className="text-amber-400/60 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <span className="text-[12px] text-amber-300/70 font-medium">{step.label}</span>
                                {reqs.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {reqs.map((item, j) => (
                                            <span key={j} className="px-1.5 py-0.5 rounded ring-1 ring-amber-500/12 bg-amber-500/[0.06] text-[9px] font-medium text-amber-400/60">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }

                if (step.type === 'move_stage') {
                    return (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] opacity-40">
                            <Ico d={ICON.zap} size={12} className="text-zinc-600 shrink-0" />
                            <span className="text-[12px] text-zinc-500 truncate flex-1">{step.label}</span>
                            {step.enabled_when && (
                                <span className="text-[9px] text-zinc-700 font-mono shrink-0">when: {step.enabled_when}</span>
                            )}
                        </div>
                    );
                }

                // Unknown action type — dev warning, render nothing
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(`[ActionsPanel] Unknown step type: "${step.type}"`);
                }
                return null;
            })}
        </div>
    );
});
ActionsPanel.displayName = 'ActionsPanel';

// ── SOURCES Panel ──────────────────────────────────────────────────────────

export const SourcesPanel: FC<{ sources: SourceData[] }> = memo(({ sources: rawSources }) => {
    if (!rawSources?.length) return null;
    const sources = budgetSlice(rawSources, MAX_SOURCES, 'sources');

    return (
        <div className="space-y-1">
            <SectionLabel icon={ICON.file} className="mb-2.5">
                {rawSources.length} Source{rawSources.length !== 1 ? 's' : ''}
                {rawSources.length > MAX_SOURCES && (
                    <span className="text-zinc-700 ml-1">(showing {MAX_SOURCES})</span>
                )}
            </SectionLabel>
            {sources.map((src, i) => (
                <a
                    key={`${src.index}-${i}`}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 group py-1.5"
                >
                    <span className="text-[10px] text-zinc-600 font-mono tabular-nums shrink-0">[{src.index}]</span>
                    <span className="text-[11px] text-zinc-500 group-hover:text-zinc-300 transition-colors duration-150 truncate">
                        {src.label}
                    </span>
                    <Ico d={ICON.ext} size={8} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0" />
                </a>
            ))}
        </div>
    );
});
SourcesPanel.displayName = 'SourcesPanel';
