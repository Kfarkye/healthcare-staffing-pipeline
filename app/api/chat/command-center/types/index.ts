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
    PAY_PACKAGE: 'pay_package',
    DOC_REQUEST: 'doc_request',
    REFERENCE_REQUEST: 'reference_request',
    WORKING_TRAVELER: 'working_traveler',
    REENGAGED_TRAVELER: 'reengaged_traveler',
    LICENSING: 'licensing',
    REASSIGNMENT: 'reassignment',
    OFFER_DETAILS: 'offer_details',
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
