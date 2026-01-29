// ============================================================================
// src/lib/constants.ts
// ULTIMATE PRODUCTION VERSION
// Shared application constants for Submittals Dashboard
// ============================================================================

// ============================================================================
// WEEKLY PRIORITY BOARD
// ============================================================================

/**
 * The three columns in the weekly priority board
 * Prospects move through these stages: This Week → Offer Out → Signed
 */
export const PRIORITY_STATUSES = ['This Week', 'Offer Out', 'Signed / Accepted'] as const;

/**
 * Maximum number of prospects that can be in priority at once
 * This enforces focused attention on top candidates
 */
export const MAX_WEEKLY_PROSPECTS = 15;

/**
 * Type for priority status values
 */
export type PriorityStatus = typeof PRIORITY_STATUSES[number];

// ============================================================================
// DASHBOARD TABS
// ============================================================================

/**
 * Main dashboard tab identifiers
 */
export const TAB_IDS = ['READY', 'SUBMITTED', 'OFFER', 'PRESTART'] as const;

/**
 * Type for tab IDs
 */
export type TabId = typeof TAB_IDS[number];

/**
 * Ready sub-tab identifiers
 */
export const READY_SUB_TABS = ['ALL', 'PRIORITY'] as const;

/**
 * Type for Ready sub-tab IDs
 */
export type ReadySubTabId = typeof READY_SUB_TABS[number];

// ============================================================================
// STATUS BADGE STYLING
// ============================================================================

/**
 * Tailwind classes for different status badge types
 * Used for consistent badge styling across the application
 */
export const STATUS_BADGE_STYLES = {
  // Source types
  PROSPECT: 'bg-blue-50 text-blue-700',
  TRANSITIONING: 'bg-purple-50 text-purple-700',
  ACTIVE: 'bg-green-50 text-green-700',
  EXTENSION: 'bg-amber-50 text-amber-700',

  // Stage types
  READY: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-50 text-blue-700',
  OFFER: 'bg-orange-50 text-orange-700',
  PRESTART: 'bg-green-50 text-green-700',

  // Priority types
  THIS_WEEK: 'bg-purple-50 text-purple-700',
  OFFER_OUT: 'bg-orange-50 text-orange-700',
  SIGNED: 'bg-green-50 text-green-700',

  // Default
  DEFAULT: 'bg-slate-100 text-slate-700',
} as const;

// ============================================================================
// ANIMATION CONFIGURATION
// ============================================================================

/**
 * Animation delay per card in milliseconds
 * Creates staggered fade-in effect for card lists
 */
export const CARD_ANIMATION_DELAY = 15;

/**
 * Maximum animation delay to prevent excessive wait times
 */
export const MAX_ANIMATION_DELAY = 150;

/**
 * Animation duration in milliseconds
 */
export const ANIMATION_DURATION = 400;

// ============================================================================
// QUERY CONFIGURATION
// ============================================================================

/**
 * Default limit for dashboard queries
 * Balances performance with comprehensive data display
 */
export const DEFAULT_DASHBOARD_LIMIT = 500;

/**
 * Limit for available prospects in priority modal
 * Prevents overwhelming UI with too many options
 */
export const AVAILABLE_PROSPECTS_LIMIT = 100;

/**
 * React Query stale time (ms)
 * How long data is considered fresh before refetching
 */
export const PRIORITY_QUERY_STALE_TIME = 30000; // 30 seconds
export const AVAILABLE_QUERY_STALE_TIME = 60000; // 60 seconds

// ============================================================================
// UI CONSTANTS
// ============================================================================

/**
 * Toast notification duration in milliseconds
 */
export const TOAST_DURATION = 3000;

/**
 * Search input debounce delay in milliseconds
 */
export const SEARCH_DEBOUNCE_DELAY = 300;

/**
 * Modal animation duration in milliseconds
 */
export const MODAL_ANIMATION_DURATION = 300;

// ============================================================================
// SOURCE TYPE ENUM
// ============================================================================

/**
 * Possible source types for candidates
 */
export const SOURCE_TYPES = {
  PROSPECT: 'PROSPECT',
  TRANSITIONING: 'TRANSITIONING',
  EXTENSION_REQUEST: 'EXTENSION_REQUEST',
  EXTENSION_SIGNED: 'EXTENSION_SIGNED',
} as const;

export type SourceType = keyof typeof SOURCE_TYPES;

// ============================================================================
// STAGE DESCRIPTIONS
// ============================================================================

/**
 * User-facing descriptions for each stage
 */
export const STAGE_DESCRIPTIONS = {
  READY: 'Available talent ready to submit to facilities',
  SUBMITTED: 'Awaiting response from facilities',
  OFFER: 'Offers received, awaiting signatures',
  PRESTART: 'Accepted offers, preparing to start',
} as const;

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Minimum search query length before triggering search
 */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Maximum file upload size in bytes (if applicable)
 */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// API ENDPOINTS (if using custom API)
// ============================================================================

/**
 * Base API URL (uses Next.js env variable)
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Feature flags for gradual rollout
 */
export const FEATURE_FLAGS = {
  WEEKLY_PRIORITY_ENABLED: true,
  ADVANCED_FILTERS_ENABLED: false,
  BULK_ACTIONS_ENABLED: false,
  ANALYTICS_ENABLED: true,
} as const;

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Standardized error messages
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  PERMISSION_DENIED: 'You don\'t have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'A server error occurred. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  LIMIT_EXCEEDED: `Cannot exceed ${MAX_WEEKLY_PROSPECTS} priority prospects per week.`,
} as const;

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================

/**
 * Standardized success messages
 */
export const SUCCESS_MESSAGES = {
  PROSPECT_ADDED: 'Prospect added to priority successfully',
  PROSPECT_MOVED: 'Prospect moved successfully',
  PROSPECT_UPDATED: 'Prospect updated successfully',
  RESET_COMPLETE: 'Weekly priority board reset successfully',
} as const;