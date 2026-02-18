/**
 * ════════════════════════════════════════════════════════════════════════════════
 * COMMAND CENTER — Type Definitions
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for all data shapes in the system.
 * Import these types everywhere to catch errors at build time.
 *
 * @module types/index
 * @version 1.0.0
 */

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Core Enums
// ════════════════════════════════════════════════════════════════════════════════

export const Intent = {
    DRAFT_OUTREACH: 'DRAFT_OUTREACH',
    DRAFT_EMAIL: 'DRAFT_EMAIL',
    OFFER_DETAILS: 'OFFER_DETAILS',
    EDIT_CONTENT: 'EDIT_CONTENT',
    LICENSING_REQUEST: 'LICENSING_REQUEST',
    REASSIGNMENT_REQUEST: 'REASSIGNMENT_REQUEST',
    DATABASE_ACTION: 'DATABASE_ACTION',
    CAMPAIGN_WORKFLOW: 'CAMPAIGN_WORKFLOW',
    SEARCH_QUERY: 'SEARCH_QUERY',
    GENERAL_CHAT: 'GENERAL_CHAT',
    UNKNOWN: 'UNKNOWN',
} as const;

export type IntentType = typeof Intent[keyof typeof Intent];

export const ChatMode = {
    DEFAULT: 'default',
    COLD_OUTREACH: 'cold_outreach',
    BATCH_REASSIGN: 'batch_reassign',
    REPLY_MODE: 'reply_mode',
} as const;

export type ChatModeType = typeof ChatMode[keyof typeof ChatMode];

export const TemplateType = {
    // Core pipeline templates (backend builders)
    PAY_PACKAGE: 'pay_package',
    DOC_REQUEST: 'doc_request',
    REFERENCE_REQUEST: 'reference_request',
    WORKING_TRAVELER: 'working_traveler',
    REENGAGED_TRAVELER: 'reengaged_traveler',
    LICENSING: 'licensing',
    REASSIGNMENT: 'reassignment',
    OFFER_DETAILS: 'offer_details',
    MARGIN_APPROVAL: 'margin_approval',
    // Outreach email templates
    INITIAL_OUTREACH: 'initial_outreach',
    HOURLY_RATE_OUTREACH: 'hourly_rate_outreach',
    RUSH_MA_FULL_DETAILS: 'rush_ma_full_details',
    REENGAGEMENT: 'reengagement',
    WORKING_TRAVELER_INTEREST: 'working_traveler_interest',
    REENGAGED_TRAVELER_INTEREST: 'reengaged_traveler_interest',
    COMPETITIVE_OFFER: 'competitive_offer',
    REFERRAL_REQUEST: 'referral_request',
    SUBMISSION_WITH_REFERENCES: 'submission_with_references',
    PAY_PACKAGE_SNIPPET: 'pay_package_snippet',
    // SMS templates
    TEXT_QUICK_PITCH: 'text_quick_pitch',
    TEXT_FOLLOWUP: 'text_followup',
    TEXT_URGENT: 'text_urgent',
    TEXT_LAST_CHANCE: 'text_last_chance',
    TEXT_SUBMITTED: 'text_submitted',
    TEXT_OFFER_RECEIVED: 'text_offer_received',
    TEXT_SUBMISSION_GENERAL: 'text_submission_general',
    // Ops templates (frontend variants)
    OPS_REASSIGNMENT: 'ops_reassignment',
    OPS_DOCUMENTS_AND_REFERENCES: 'ops_documents_and_references',
    OPS_LICENSING_INFO: 'ops_licensing_info',
    // Response templates
    RESPONSE_LTC_AND_REFERENCES: 'response_ltc_and_references',
} as const;

export type TemplateTypeValue = typeof TemplateType[keyof typeof TemplateType];

export const MessageType = {
    AUTO: 'auto',
    EMAIL: 'email',
    SMS: 'sms',
    SLACK: 'slack',
    OTHER: 'other',
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];

export const TemplateCategory = {
    OUTREACH: 'outreach',
    OPS: 'ops',
    RESPONSE: 'response',
    SNIPPET: 'snippet',
} as const;

export type TemplateCategoryValue = typeof TemplateCategory[keyof typeof TemplateCategory];

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Extracted Data Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Data extracted from pay package images/context
 */
export interface PayPackageData {
    candidateName: string | null;
    candidateEmail: string | null;
    facility: string | null;
    location: string | null;
    specialty: string | null;
    startDate: string | null;
    endDate: string | null;
    shifts: string | null;
    hoursPerWeek: string | null;
    hourlyRate: string | null;
    stipend: string | null;
    weeklyTotal: string | null;
    requirements?: string[];
}

/**
 * Data for document request emails
 */
export interface DocRequestData {
    candidateName: string | null;
    candidateEmail: string | null;
    facility: string | null;
    documents: string[];
}

/**
 * Data for reference request emails
 */
export interface ReferenceRequestData {
    candidateName: string | null;
    candidateEmail: string | null;
}

/**
 * Data for licensing request emails
 */
export interface LicensingRequestData {
    specialty: string | null;
    state: string | null;
}

/**
 * Data for reassignment request emails
 */
export interface ReassignmentRequestData {
    candidateName: string | null;
    candidateEmail: string | null;
    novaId: string | null;
}

/**
 * Data for margin approval emails (internal)
 */
export interface MarginApprovalData {
    candidateName: string | null;
    marginPercentage: string | null;
    reason: string | null;
    placementType: string | null;
    premiumNeeded: string | null;
    sentToComp: string | null;
    approverEmail: string | null;
    novaUrl?: string | null;
    facility?: string | null;
    why?: string | null;
    distroResponse?: string | null;
}

/**
 * Data for offer details emails
 */
export interface OfferDetailsData extends PayPackageData {
    address: string | null;
    bedCount: string | null;
    mealsStipend: string | null;
    housingStipend: string | null;
}

/**
 * Union type for all email data types
 */
export type EmailData =
    | PayPackageData
    | DocRequestData
    | ReferenceRequestData
    | LicensingRequestData
    | ReassignmentRequestData
    | MarginApprovalData
    | OfferDetailsData;

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Email Output Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Standard email output from any builder function
 */
export interface EmailOutput {
    to: string;
    cc: string[];
    subject: string;
    body: string;
    missing: string[];
    isComplete: boolean;
    templateType: TemplateTypeValue;
    messageType?: MessageTypeValue;
}

/**
 * SMS output from a template builder
 */
export interface SmsOutput {
    to: string;
    body: string;
    missing: string[];
    isComplete: boolean;
    templateType: TemplateTypeValue;
    messageType: 'sms';
}

/**
 * Union type for all template output types
 */
export type TemplateOutput = EmailOutput | SmsOutput;

/**
 * Unified template definition for the registry
 */
export interface TemplateDefinition {
    id: TemplateTypeValue;
    name: string;
    category: TemplateCategoryValue;
    messageType: MessageTypeValue;
    internalOnly: boolean;
    requiredFields: string[];
    description?: string;
    build: (data: Record<string, any>) => TemplateOutput;
}

/**
 * Structured response for frontend rendering
 */
export interface EmailDraftResponse {
    kind: 'email_draft';
    email: {
        to: string | null;
        cc: string[];
        subject: string;
        body: string;
        signature: string | null;
    };
    metadata: {
        templateType: TemplateTypeValue;
        isComplete: boolean;
        missingFields: string[];
        extractedAt: string;
        messageType?: MessageTypeValue;
    };
    nextSteps: NextStepAction[];
}

/**
 * Actions the frontend can render as buttons
 */
export interface NextStepAction {
    type: 'open_nova' | 'send_email' | 'await_docs' | 'await_response' | 'move_stage';
    label: string;
    href?: string;
    required?: string[];
    enabled_when?: string;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Router Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Input to the classifier
 */
export interface ClassifyInput {
    message: string;
    history: NormalizedMessage[];
    mode: ChatModeType;
    modeLocked: boolean;
    hasImage: boolean;
    modeContext?: string;
}

/**
 * Output from the classifier
 */
export interface ClassifyResult {
    intent: IntentType;
    templateType: TemplateTypeValue | null;
    requiresExtraction: boolean;
    requiresTools: boolean;
    confidence: number;
    reason: string;
    fastPath: boolean;
    debug?: {
        messageLength?: number;
        hasImage?: boolean;
        lastEmailFound?: boolean;
        lastEmailScanDepth?: number;
        isShortFollowup?: boolean;
        isEditFollowup?: boolean;
        isContinuation?: boolean;
        isContextUpdate?: boolean;
    };
}

/**
 * Normalized message format for internal processing
 */
export interface NormalizedMessage {
    role: 'user' | 'assistant' | 'system';
    content: MessageContent[];
}

export type MessageContent =
    | { type: 'text'; text: string }
    | { type: 'image'; image: string | URL };

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 5: Handler Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Context passed to all handlers
 */
export interface HandlerContext {
    traceId: string;
    supabase: any; // SupabaseClient type
    google: any;   // GoogleGenerativeAI type
    logger: Logger;
}

/**
 * Standard handler function signature
 */
export type IntentHandler = (
    input: HandlerInput,
    context: HandlerContext
) => Promise<HandlerOutput>;

/**
 * Input to intent handlers
 */
export interface HandlerInput {
    messages: NormalizedMessage[];
    inputText: string;
    hasImage: boolean;
    mode: ChatModeType;
    modeContext: string;
    userContext: Record<string, any>;
    messageType?: MessageTypeValue;
    /** Explicit template type from template picker (bypasses classification). */
    templateType?: TemplateTypeValue;
}

/**
 * Output from intent handlers
 */
export interface HandlerOutput {
    type: 'email' | 'chat' | 'error';
    content: string;
    structured?: EmailDraftResponse;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    name: string;
    args: Record<string, any>;
    result?: any;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 6: Configuration Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Recruiter signature configuration
 */
export interface SignatureConfig {
    name: string;
    title: string;
    phone: string;
    extension: string;
    assistant: {
        name: string;
        email: string;
    };
}

/**
 * Intent routing configuration
 */
export interface IntentConfig {
    intent: IntentType;
    templateType: TemplateTypeValue | null;
    handler: 'email' | 'chat' | 'tools';
    requiresExtraction: boolean;
    requiresTools: boolean;
}

/**
 * Application configuration
 */
export interface AppConfig {
    signature: SignatureConfig;
    teamEmails: {
        licensing: string;
        reassignments: string;
    };
    defaults: {
        hoursPerWeek: string;
        greeting: string;
        cc: string;
    };
    nova: {
        baseUrl: string;
        candidatePath: string;
        profileSuffix: string;
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 7: Logger Interface
// ════════════════════════════════════════════════════════════════════════════════

export interface Logger {
    info(event: string, data?: Record<string, any>): void;
    warn(event: string, data?: Record<string, any>): void;
    error(event: string, error: Error | unknown, data?: Record<string, any>): void;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 8: API Request/Response Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Incoming API request body
 */
export interface APIRequest {
    messages: any[]; // Raw messages from client
    context?: Record<string, any>;
    systemContext?: string;
    mode?: ChatModeType;
    modeLocked?: boolean;
    messageType?: MessageTypeValue;
}

/**
 * API error response
 */
export interface APIError {
    error: string;
    details?: string;
    traceId: string;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 9: Utility Types
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Make specific properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Extract non-null fields
 */
export type NonNullFields<T> = {
    [K in keyof T]: NonNullable<T[K]>;
};

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
    | { success: true; data: T }
    | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 10: Rich Response Blocks
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Structured response block — the AI handler emits these as tagged JSON in the
 * text stream. The frontend extracts and renders each block as the appropriate
 * component (card, table, citation footer, etc.).
 *
 * Wire format: [RESPONSE_BLOCK:<kind>]{...json...}[/RESPONSE_BLOCK]
 */
export type ResponseBlock =
    | { kind: 'candidate_card'; data: CandidateCardData }
    | { kind: 'pipeline_table'; data: PipelineTableData }
    | { kind: 'licensure_card'; data: LicensureCardData }
    | { kind: 'pay_package_card'; data: PayPackageCardData }
    | { kind: 'citation_set'; data: CitationData[] };

export interface CandidateCardData {
    candidate_id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    specialty?: string | null;
    profession?: string | null;
    home_state?: string | null;
    status: string;
    nova_url?: string | null;
    recruiter?: string | null;
    licenses?: string[];
    notes_preview?: string | null;
    engagement_level?: string | null;
}

export interface PipelineTableData {
    title: string;
    columns: string[];
    rows: Array<Record<string, string | number | null>>;
    source_table: string;
}

export interface LicensureCardData {
    candidate_name: string;
    state: string;
    profession: string;
    license_status: 'active' | 'expired' | 'pending' | 'not_found';
    board_url?: string | null;
    expiration?: string | null;
    license_number?: string | null;
    nova_url?: string | null;
}

export interface PayPackageCardData {
    candidate_name?: string | null;
    facility: string;
    location: string;
    specialty: string;
    gross_weekly: number;
    taxable_hourly?: number | null;
    stipend_weekly?: number | null;
    housing_weekly?: number | null;
    meals_weekly?: number | null;
    hours_per_week: number;
    shift?: string | null;
    start_date?: string | null;
    end_date?: string | null;
}

export interface CitationData {
    index: number;
    label: string;
    url: string;
    source_type: 'nova' | 'state_board' | 'database' | 'external';
}
