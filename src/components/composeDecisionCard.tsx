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
    followUps?: EmailFollowUp[];
}

export interface EmailHandlers {
    onOpenOutlook: () => void;
    onCopy: () => void;
    onShare?: () => void;
}

// ── Email Display Derivation ────────────────────────────────────────────────
// Pure function: derives what the RECRUITER sees on the card surface.
// Never mutates the original subject/body — those go to Outlook untouched.

interface EmailCardDisplay {
    cardHeadline: string;
    cardValue: string | undefined;
    summary: string;
}

function deriveEmailDisplay(subject: string, body: string): EmailCardDisplay {
    let cardHeadline = subject;
    let cardValue: string | undefined;

    // Strip RE:/FW: prefix for display
    cardHeadline = cardHeadline.replace(/^(?:RE|FW|FWD):\s*/i, '').trim();

    // Extract dollar value — prefer /wk or /week suffixed amounts
    const weeklyMatch = cardHeadline.match(/\$[\d,]+(?:\.\d{2})?(?:\/wk|\/week)/i);
    const bareMatch = cardHeadline.match(/\$[\d,]+(?:\.\d{2})?/);
    const valueMatch = weeklyMatch || bareMatch;

    if (valueMatch) {
        cardValue = valueMatch[0];
        // Normalize to /wk for compact display
        cardValue = cardValue.replace(/\/week$/i, '/wk');

        // Strip the dollar portion AND any preceding delimiter from headline
        // Handles: "Role - Facility | $2,389.20/week"
        //          "Role - Facility $2,389.20"
        //          "Role | $2,389.20/week"
        cardHeadline = cardHeadline
            .replace(/\s*[|–—]\s*\$[\d,]+(?:\.\d{2})?(?:\/\w+)?/i, '')   // " | $..."
            .replace(/\s+\$[\d,]+(?:\.\d{2})?(?:\/\w+)?/i, '')            // " $..." fallback
            .replace(/[\s|–—-]+$/, '')                                      // trailing delimiters
            .trim();
    }

    const summary = extractFirstSubstantiveLine(body);

    return {
        cardHeadline: cardHeadline || '(No Subject)',
        cardValue,
        summary,
    };
}

const SKIP_LINE_RE = /^(?:Hi |Hello |Hey |Dear |Hope you|Here is |I wanted to|Thank you|Thanks for|I hope this|Just wanted to|I'm reaching out)/i;

function extractFirstSubstantiveLine(body: string, maxLen = 120): string {
    const lines = body.split('\n').map(l => l.trim()).filter(Boolean);

    const substantive = lines.find(line =>
        line.length > 15 && !SKIP_LINE_RE.test(line)
    );

    if (!substantive) return lines[0]?.slice(0, maxLen) ?? '';

    return substantive.length > maxLen
        ? substantive.slice(0, maxLen - 1) + '…'
        : substantive;
}

/** Follow-ups tab content — tappable next-step actions. */
const FollowUpsList: React.FC<{ items: EmailFollowUp[] }> = ({ items }) => (
    <div className="space-y-1.5">
        {items.map((item, idx) => (
            <button
                key={item.label}
                onClick={item.onClick}
                className={[
                    'w-full text-left px-4 py-2.5 rounded-[12px]',
                    'bg-white/[0.02] ring-1 ring-white/[0.04]',
                    'hover:bg-white/[0.05] hover:ring-white/[0.08]',
                    'transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50',
                    idx === 0 ? 'text-zinc-300 hover:text-white' : 'text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
            >
                <span className="text-[11px] leading-none font-medium tracking-[0.02em]">{item.label}</span>
            </button>
        ))}
    </div>
);

/** Full email draft — rendered with original subject + recipient + body (all untouched). */
const EmailDraftPanel: React.FC<{ subject: string; to?: string; body: string }> = ({ subject, to, body }) => (
    <div className="space-y-3">
        <div className="flex items-start gap-2.5">
            <span className="text-[9px] font-medium tracking-[0.04em] uppercase text-zinc-600 mt-px shrink-0">Subject</span>
            <span className="text-[13px] text-zinc-300 font-medium leading-snug">{subject}</span>
        </div>
        {to && (
            <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-medium tracking-[0.04em] uppercase text-zinc-600">To</span>
                <span className="text-[11px] text-zinc-400 font-mono truncate">{to}</span>
            </div>
        )}
        <div className="text-[13px] text-zinc-400 leading-[1.7] whitespace-pre-wrap break-words">
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

    // 1. Derive DISPLAY fields (for the card surface — never sent to Outlook)
    const display = deriveEmailDisplay(emailData.subject, emailData.body);

    // 2. Build glance stats — recipient is always first (it's the variable)
    const stats: GlanceStat[] = [];

    if (emailData.recipient) {
        stats.push({ label: 'To', value: emailData.recipient });
    }

    // Location if parseable from body: "City, ST ZIP" or "City ST ZIP"
    const locationMatch = emailData.body.match(
        /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*,?\s*([A-Z]{2})\s+(\d{5})/
    );
    if (locationMatch) {
        stats.push({ label: 'Location', value: `${locationMatch[1]}, ${locationMatch[2]}` });
    }

    // 3. Build tabs — DRAFT tab gets ORIGINAL subject + body (untouched)
    const tabs: DrawerTab[] = [];

    tabs.push({
        id: 'draft',
        label: 'Draft',
        content: () => (
            <EmailDraftPanel
                subject={emailData.subject}
                to={emailData.recipient}
                body={emailData.body}
            />
        ),
    });

    if (emailData.followUps && emailData.followUps.length > 0) {
        tabs.push({
            id: 'refine',
            label: 'Refine',
            content: () => <FollowUpsList items={emailData.followUps!} />,
        });
    }

    // 4. Assemble DecisionCard with DERIVED display fields
    //    Handlers use ORIGINAL emailData (via closure in CommandCenterV2)
    const element = (
        <DecisionCard
            label="THE DRAFT"
            headline={display.cardHeadline}
            value={display.cardValue}
            stats={stats.length > 0 ? stats : undefined}
            summary={display.summary}
            primaryAction={{ label: 'OPEN IN OUTLOOK', onClick: handlers.onOpenOutlook }}
            secondaryAction={{ label: 'COPY', onClick: handlers.onCopy }}
            onShare={handlers.onShare}
            drawerLabel="DETAILS"
            tabs={tabs}
        />
    );

    return { status: 'success', element, tabCount: tabs.length, statCount: stats.length };
}

export function hasDecisionCardData(blocks: RawBlock[]): boolean {
    return blocks.some(b => KNOWN_KINDS.has(b.kind));
}

export function isVerdict(s: string): s is Verdict {
    return VERDICTS.has(s);
}
