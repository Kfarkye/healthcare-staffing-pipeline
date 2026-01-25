/**
 * Obsidian Weissach Design System
 * Main Export File
 * 
 * Usage:
 * import { SYSTEM, cn, FilmGrain, ThinkingPill } from '@/design-system/obsidian';
 * 
 * Or import specific modules:
 * import { SYSTEM } from '@/design-system/obsidian/tokens';
 * import { cn } from '@/design-system/obsidian/utils';
 */

// ============================================================================
// TOKENS
// ============================================================================

export { SYSTEM } from './tokens';
export type {
    SystemTokens,
    AnimationPreset,
    SurfaceVariant,
    TypeVariant,
    GeoVariant,
    AccentColor,
} from './tokens';

// ============================================================================
// UTILITIES
// ============================================================================

export {
    cn,
    generateId,
    triggerHaptic,
    tryParseJson,
    truncate,
    formatToolName,
    copyToClipboard,
    isScrolledToBottom,
    scrollToBottom,
    debounce,
    throttle,
} from './utils';

// ============================================================================
// COMPONENTS
// ============================================================================

export {
    // Texture & Effects
    FilmGrain,

    // Loading States
    OrbitalRadar,
    LoadingDots,
    ThinkingPill,

    // Cards & Containers
    VerdictTicket,
    TacticalHUD,

    // Interactive
    SmartChips,
    CopyButton,

    // Status
    StatusDot,

    // Layout
    EmptyState,

    // Providers & Hooks
    ToastProvider,
    useToast,
} from './components';

// ============================================================================
// CSS (import separately in your global CSS)
// ============================================================================

// To use animations, add this to your index.css:
// @import './design-system/obsidian/animations.css';
