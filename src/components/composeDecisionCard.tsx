/* ============================================================================
   composeDecisionCard.tsx  v5
   Composition Layer — Response Blocks → DecisionCard

   Decision flow changes:
   ─ Bloomberg  Stats extracted from validated data. Start date, location,
                shift, hourly rate, credential status — all at glance level.
                User decides without opening drawer.
   ─ Notion     Headline and value are entities with optional onClick.
                Stats are entities with optional onClick.
   ─ Apple      Max 4 tabs. Details + Credentials merge into PROFILE.
                Actions surfaced via card buttons, not a tab.
   ─ Amazon     Stats + summary + primary action = everything needed to
                decide. Drawer is optional depth.

   Engineering (carried from v4):
   ─ Discriminated union blocks. Validators. CompositionResult.
   ─ Lazy tab content. Dev warnings. No silent nulls.
============================================================================ */

import React from 'react';
import {
    DecisionCard,
    type DrawerTab,
    type VerdictTone,
    type GlanceStat,
    type Signal,
} from './DecisionCard';
import {
    CandidatePanel,
    PayPackagePanel,
    LicensurePanel,
    PipelinePanel,
    SourcesPanel,
    type CandidateData,
    type PayPackageData,
    type LicensureData,
    type SourceData,
} from './RecruitingPanels';

// ── Block Types ────────────────────────────────────────────────────────────

export interface RawBlock {
    kind: string;
    data: unknown;
}

export type Verdict = 'STRONG MATCH' | 'REVIEW NEEDED' | 'NOT A FIT';

export interface VerdictInfo {
    verdict: Verdict;
    details?: string;
}

const VERDICTS = new Set<string>(['STRONG MATCH', 'REVIEW NEEDED', 'NOT A FIT']);

const TONE_MAP: Record<Verdict, VerdictTone> = {
    'STRONG MATCH': 'positive', 'REVIEW NEEDED': 'neutral', 'NOT A FIT': 'negative',
};
const LABEL_MAP: Record<Verdict, string> = {
    'STRONG MATCH': 'Proceed', 'REVIEW NEEDED': 'Review', 'NOT A FIT': 'Pass',
};
const ACTION_MAP: Record<Verdict, { primary: string; secondary: string }> = {
    'STRONG MATCH': { primary: 'SUBMIT', secondary: 'HOLD' },
    'REVIEW NEEDED': { primary: 'REVIEW', secondary: 'PASS' },
    'NOT A FIT': { primary: 'ARCHIVE', secondary: 'RECONSIDER' },
};

// ── Validators (unchanged from v4) ─────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

function warn(ctx: string, msg: string): void {
    if (process.env.NODE_ENV !== 'production') console.warn(`[compose] ${ctx}: ${msg}`);
}

function validateCandidate(data: unknown): CandidateData | null {
    if (!isObj(data)) { warn('candidate_card', 'not an object'); return null; }
    if (!isStr(data.name)) { warn('candidate_card', 'missing "name"'); return null; }
    return {
        name:       data.name as string,
        specialty:  isStr(data.specialty) ? data.specialty : undefined,
        profession: isStr(data.profession) ? data.profession : undefined,
        status:     isStr(data.status) ? data.status : undefined,
        email:      isStr(data.email) ? data.email : undefined,
        phone:      isStr(data.phone) ? data.phone : undefined,
        home_state: isStr(data.home_state) ? data.home_state : undefined,
        recruiter:  isStr(data.recruiter) ? data.recruiter : undefined,
        licenses:   Array.isArray(data.licenses) ? data.licenses.filter(isStr) : undefined,
        nova_url:   isStr(data.nova_url) ? data.nova_url : undefined,
    };
}

function validatePay(data: unknown): PayPackageData | null {
    if (!isObj(data)) { warn('pay_package_card', 'not an object'); return null; }
    if (data.gross_weekly == null && !isStr(data.facility)) { warn('pay_package_card', 'no content'); return null; }
    return {
        facility:       isStr(data.facility) ? data.facility : undefined,
        location:       isStr(data.location) ? data.location : undefined,
        specialty:      isStr(data.specialty) ? data.specialty : undefined,
        gross_weekly:   typeof data.gross_weekly === 'number' || isStr(data.gross_weekly) ? data.gross_weekly as number | string : undefined,
        taxable_hourly: typeof data.taxable_hourly === 'number' ? data.taxable_hourly : undefined,
        stipend_weekly: typeof data.stipend_weekly === 'number' ? data.stipend_weekly : undefined,
        housing_weekly: typeof data.housing_weekly === 'number' ? data.housing_weekly : undefined,
        meals_weekly:   typeof data.meals_weekly === 'number' ? data.meals_weekly : undefined,
        hours_per_week: typeof data.hours_per_week === 'number' ? data.hours_per_week : undefined,
        shift:          isStr(data.shift) ? data.shift : undefined,
        start_date:     isStr(data.start_date) ? data.start_date : undefined,
        end_date:       isStr(data.end_date) ? data.end_date : undefined,
    };
}

function validateLicensure(data: unknown): LicensureData | null {
    if (!isObj(data)) { warn('licensure_card', 'not an object'); return null; }
    return {
        candidate_name: isStr(data.candidate_name) ? data.candidate_name : undefined,
        state:          isStr(data.state) ? data.state : undefined,
        profession:     isStr(data.profession) ? data.profession : undefined,
        license_status: isStr(data.license_status) ? data.license_status : undefined,
        license_number: isStr(data.license_number) ? data.license_number : undefined,
        expiration:     isStr(data.expiration) ? data.expiration : undefined,
        board_url:      isStr(data.board_url) ? data.board_url : undefined,
    };
}

function validatePipeline(data: unknown): { columns: string[]; rows: Record<string, unknown>[] } | null {
    if (!isObj(data)) { warn('pipeline_table', 'not an object'); return null; }
    if (!Array.isArray(data.columns) || !data.columns.length) { warn('pipeline_table', 'no columns'); return null; }
    if (!Array.isArray(data.rows) || !data.rows.length) { warn('pipeline_table', 'no rows'); return null; }
    return { columns: data.columns.filter(isStr), rows: data.rows.filter(isObj) };
}

function validateSources(data: unknown): SourceData[] | null {
    if (!Array.isArray(data) || !data.length) return null;
    const valid: SourceData[] = [];
    for (const item of data) {
        if (isObj(item) && typeof item.index === 'number' && isStr(item.label) && isStr(item.url)) {
            valid.push({ index: item.index, label: item.label as string, url: item.url as string });
        }
    }
    return valid.length > 0 ? valid : null;
}

const KNOWN_KINDS = new Set([
    'candidate_card', 'pay_package_card', 'licensure_card',
    'pipeline_table', 'citation_set', 'next_steps',
]);

// ── Stats Extraction (Bloomberg) ───────────────────────────────────────────
//
// Surfaces the 4-6 data points needed to decide without opening the drawer.
// Each stat is optionally tappable (Notion entity linking).

function extractStats(
    candidate: CandidateData | null,
    pay: PayPackageData | null,
    license: LicensureData | null,
    handlers?: {
        onLocationClick?: () => void;
        onCredentialClick?: () => void;
        onFacilityClick?: () => void;
    },
): GlanceStat[] {
    const stats: GlanceStat[] = [];

    // Location — always relevant
    const location = candidate?.home_state || pay?.location;
    if (location) {
        stats.push({ label: 'Location', value: location, onClick: handlers?.onLocationClick });
    }

    // Hourly rate — what the traveler earns per hour
    if (pay?.taxable_hourly != null) {
        stats.push({ label: 'Hourly', value: `$${pay.taxable_hourly}/hr`, signal: 'go' as Signal });
    }

    // Shift — critical for matching
    if (pay?.shift) {
        stats.push({ label: 'Shift', value: pay.shift });
    }

    // Start date — urgency signal
    if (pay?.start_date) {
        stats.push({ label: 'Start', value: pay.start_date });
    }

    // Credential status — go/hold/stop signal
    if (license?.license_status) {
        const signal: Signal =
            license.license_status === 'active' ? 'go' :
            license.license_status === 'expired' ? 'stop' :
            license.license_status === 'pending' ? 'hold' : 'muted';
        const label = license.state ? `${license.state} License` : 'License';
        stats.push({
            label,
            value: license.license_status === 'active' ? 'Active'
                 : license.license_status === 'expired' ? 'Expired'
                 : license.license_status === 'pending' ? 'Pending'
                 : 'Unknown',
            signal,
            onClick: handlers?.onCredentialClick,
        });
    }

    // Facility — where the assignment is
    if (pay?.facility) {
        stats.push({ label: 'Facility', value: pay.facility, onClick: handlers?.onFacilityClick });
    }

    return stats;
}

// ── Headline Extraction ────────────────────────────────────────────────────

function extractHeadline(
    candidate: CandidateData | null,
    pay: PayPackageData | null,
): { headline: string; value?: string } {
    const fmtPay = (v: number | string) => `$${typeof v === 'number' ? v.toLocaleString() : v}/wk`;

    if (candidate?.name) {
        return {
            headline: [candidate.name, candidate.specialty].filter(Boolean).join(', '),
            value: pay?.gross_weekly != null ? fmtPay(pay.gross_weekly) : undefined,
        };
    }
    if (pay?.facility) {
        return {
            headline: pay.facility,
            value: pay.gross_weekly != null ? fmtPay(pay.gross_weekly) : undefined,
        };
    }
    return { headline: 'Assessment' };
}

// ── Composition Result ─────────────────────────────────────────────────────

export type CompositionResult =
    | { status: 'success'; element: React.ReactElement; tabCount: number; statCount: number }
    | { status: 'empty';   reason: string }
    | { status: 'error';   errors: string[] };

// ── Composer ───────────────────────────────────────────────────────────────

export function composeRecruitingCard(
    rawBlocks: RawBlock[],
    verdictInfo?: VerdictInfo | null,
    handlers?: {
        onSubmit?: () => void;
        onPass?: () => void;
        onShare?: () => void;
        /** Entity navigation */
        onCandidateClick?: () => void;
        onValueClick?: () => void;
        onLocationClick?: () => void;
        onCredentialClick?: () => void;
        onFacilityClick?: () => void;
    },
): CompositionResult {
    const errors: string[] = [];

    if (verdictInfo && !VERDICTS.has(verdictInfo.verdict)) {
        errors.push(`Unknown verdict: "${verdictInfo.verdict}"`);
    }

    for (const block of rawBlocks) {
        if (!KNOWN_KINDS.has(block.kind)) {
            warn('compose', `Unknown block kind "${block.kind}"`);
        }
    }

    // ── Validate at boundary ──
    const candidate = validateCandidate(rawBlocks.find(b => b.kind === 'candidate_card')?.data);
    const pay       = validatePay(rawBlocks.find(b => b.kind === 'pay_package_card')?.data);
    const license   = validateLicensure(rawBlocks.find(b => b.kind === 'licensure_card')?.data);
    const pipeline  = validatePipeline(rawBlocks.find(b => b.kind === 'pipeline_table')?.data);
    const sources   = validateSources(rawBlocks.find(b => b.kind === 'citation_set')?.data);

    // ── Bloomberg stats ──
    const stats = extractStats(candidate, pay, license, {
        onLocationClick: handlers?.onLocationClick,
        onCredentialClick: handlers?.onCredentialClick,
        onFacilityClick: handlers?.onFacilityClick,
    });

    // ── Build tabs — max 4, merged for single purpose ──
    // Apple: PROFILE (candidate+license) | PACKAGE | PIPELINE | SOURCES
    const tabs: DrawerTab[] = [];

    // PROFILE = candidate details + credential status in one view
    if (candidate || license) {
        tabs.push({
            id: 'profile',
            label: 'Profile',
            content: () => (
                <div className="space-y-4">
                    {candidate && <CandidatePanel data={candidate} />}
                    {candidate && license && <div className="h-px bg-white/[0.04]" />}
                    {license && <LicensurePanel data={license} />}
                </div>
            ),
        });
    }

    if (pay) {
        tabs.push({
            id: 'package',
            label: 'Package',
            content: () => <PayPackagePanel data={pay} />,
        });
    }

    if (pipeline) {
        tabs.push({
            id: 'pipeline',
            label: 'Pipeline',
            content: () => <PipelinePanel columns={pipeline.columns} rows={pipeline.rows} />,
        });
    }

    if (sources) {
        tabs.push({
            id: 'sources',
            label: 'Sources',
            content: () => <SourcesPanel sources={sources} />,
        });
    }

    // ── Decide outcome ──
    if (!tabs.length && !verdictInfo && !stats.length) {
        return { status: 'empty', reason: 'No valid blocks, verdict, or stats to compose' };
    }

    if (errors.length > 0) {
        return { status: 'error', errors };
    }

    const { headline, value } = extractHeadline(candidate, pay);
    const v = verdictInfo?.verdict;
    const actionCfg = v ? ACTION_MAP[v] : undefined;

    const element = (
        <DecisionCard
            label="THE MATCH"
            headline={headline}
            onHeadlineClick={handlers?.onCandidateClick}
            value={value}
            onValueClick={handlers?.onValueClick}
            verdict={v ? { tone: TONE_MAP[v], label: LABEL_MAP[v] } : undefined}
            stats={stats.length > 0 ? stats : undefined}
            summary={verdictInfo?.details}
            primaryAction={actionCfg && handlers?.onSubmit ? {
                label: actionCfg.primary,
                onClick: handlers.onSubmit,
            } : undefined}
            secondaryAction={actionCfg && handlers?.onPass ? {
                label: actionCfg.secondary,
                onClick: handlers.onPass,
            } : undefined}
            onShare={handlers?.onShare}
            drawerLabel="DETAILS"
            tabs={tabs.length > 0 ? tabs : undefined}
        />
    );

    return { status: 'success', element, tabCount: tabs.length, statCount: stats.length };
}

// ── Email Composition ─────────────────────────────────────────────────────

export interface EmailFollowUp {
    label: string;
    onClick: () => void;
}

export interface EmailData {
    subject: string;
    body: string;
    recipient?: string;
    contextPills?: Array<{ label: string; value?: string }>;
    followUps?: EmailFollowUp[];
}

export interface EmailHandlers {
    onOpenOutlook: () => void;
    onCopy: () => void;
    onShare?: () => void;
    onFollowUp?: (label: string) => void;
}

const MAX_EMAIL_SUMMARY_CHARS = 280;

function extractEmailHeadline(subject: string): { headline: string; value?: string } {
    // Strip RE:/FW: prefixes for cleaner display
    const clean = subject.replace(/^(?:RE|FW|FWD):\s*/i, '').trim();
    // Extract dollar amount if present
    const payMatch = subject.match(/\$([0-9,]+(?:\.\d{2})?(?:\/wk|\/week)?)/i);
    return {
        headline: clean || '(No Subject)',
        value: payMatch ? payMatch[0] : undefined,
    };
}

function truncateEmailBody(body: string): string {
    const lines = body.split('\n').filter(l => l.trim().length > 0);
    let result = '';
    for (const line of lines) {
        if (result.length + line.length > MAX_EMAIL_SUMMARY_CHARS) {
            result = result.trim();
            if (result.length > 0 && !result.endsWith('…')) result += '…';
            break;
        }
        result += (result ? ' ' : '') + line.trim();
    }
    return result || body.slice(0, MAX_EMAIL_SUMMARY_CHARS).trim() + '…';
}

/** Follow-ups tab content — tappable next-step prompts (ghost bubble style). */
const FollowUpsList: React.FC<{ items: EmailFollowUp[] }> = ({ items }) => (
    <div className="space-y-1.5">
        {items.map((item, idx) => (
            <button
                key={item.label}
                onClick={item.onClick}
                className={[
                    'w-full text-left px-4 py-2.5 rounded-2xl rounded-tr-[6px]',
                    'transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                    idx === 0
                        ? 'bg-white/[0.04] ring-1 ring-white/[0.1] text-zinc-300 hover:bg-white/[0.07] hover:ring-white/[0.16] hover:text-white'
                        : 'bg-white/[0.02] ring-1 ring-white/[0.06] text-zinc-500 hover:bg-white/[0.05] hover:ring-white/[0.12] hover:text-zinc-300',
                ].join(' ')}
            >
                <span className="text-[12.5px] leading-none font-medium">{item.label}</span>
            </button>
        ))}
    </div>
);

/** Full email body — rendered as preformatted text with recipient header. */
const EmailDraftPanel: React.FC<{ body: string; recipient?: string }> = ({ body, recipient }) => (
    <div className="space-y-3">
        {recipient && (
            <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-semibold tracking-[0.1em] uppercase text-zinc-600">To</span>
                <span className="text-[12px] text-zinc-400 font-mono truncate">{recipient}</span>
            </div>
        )}
        <div className="text-[13px] text-zinc-300 leading-[1.75] whitespace-pre-wrap break-words">
            {body}
        </div>
    </div>
);

export function composeEmailCard(
    emailData: EmailData,
    handlers: EmailHandlers,
): CompositionResult {
    if (!isStr(emailData.subject) && !isStr(emailData.body)) {
        return { status: 'empty', reason: 'Email has no subject or body' };
    }

    const { headline, value } = extractEmailHeadline(emailData.subject);
    const summary = truncateEmailBody(emailData.body);

    // ── Build tabs (max 2 for email) ──
    const tabs: DrawerTab[] = [];

    tabs.push({
        id: 'draft',
        label: 'Draft',
        content: () => (
            <EmailDraftPanel body={emailData.body} recipient={emailData.recipient} />
        ),
    });

    if (emailData.followUps && emailData.followUps.length > 0) {
        tabs.push({
            id: 'follow-ups',
            label: 'Follow-Ups',
            content: () => <FollowUpsList items={emailData.followUps!} />,
        });
    }

    const element = (
        <DecisionCard
            label="THE DRAFT"
            headline={headline}
            value={value}
            verdict={{ tone: 'positive' as VerdictTone, label: 'Ready' }}
            summary={summary}
            primaryAction={{ label: 'OPEN IN OUTLOOK', onClick: handlers.onOpenOutlook }}
            secondaryAction={{ label: 'COPY', onClick: handlers.onCopy }}
            onShare={handlers.onShare}
            drawerLabel="DETAILS"
            tabs={tabs}
        />
    );

    return { status: 'success', element, tabCount: tabs.length, statCount: 0 };
}

export function hasDecisionCardData(blocks: RawBlock[]): boolean {
    return blocks.some(b => KNOWN_KINDS.has(b.kind));
}

export function isVerdict(s: string): s is Verdict {
    return VERDICTS.has(s);
}
