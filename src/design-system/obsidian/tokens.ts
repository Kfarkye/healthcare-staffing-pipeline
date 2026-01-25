/**
 * Design System Tokens
 * "Obsidian Weissach" Design Language
 * 
 * Single source of truth for the entire application.
 * Import this file and use SYSTEM.* for all styling decisions.
 * 
 * Healthcare Recruiting Edition - Indigo Primary Theme
 * 
 * @version 2.0.0
 */

import type { Transition } from 'framer-motion';

// ============================================================================
// SYSTEM TOKENS
// ============================================================================

export const SYSTEM = {
    // --------------------------------------------------------------------------
    // ANIMATION PRESETS
    // --------------------------------------------------------------------------
    anim: {
        /** Primary spring - buttons, cards, modals, most interactions */
        fluid: {
            type: 'spring',
            damping: 30,
            stiffness: 380,
            mass: 0.8
        } as Transition,

        /** SVG path drawing - checkmarks, progress indicators */
        draw: {
            duration: 0.6,
            ease: "circOut"
        } as Transition,

        /** Shape morphing - expandable sections, accordions */
        morph: {
            type: 'spring',
            damping: 25,
            stiffness: 280
        } as Transition,

        /** Micro interactions - hovers, focus states */
        micro: {
            duration: 0.15,
            ease: [0.4, 0, 0.2, 1]
        } as Transition,

        /** Page/view transitions */
        page: {
            duration: 0.3,
            ease: [0, 0, 0.2, 1]
        } as Transition,

        /** Stagger children animations */
        stagger: {
            staggerChildren: 0.04
        },

        /** Exit animations */
        exit: {
            duration: 0.2,
            ease: [0.4, 0, 1, 1]
        } as Transition,
    },

    // --------------------------------------------------------------------------
    // SURFACE HIERARCHY
    // --------------------------------------------------------------------------
    surface: {
        /** Deepest background - app shell, main container */
        void: 'bg-[#050505]',

        /** Primary cards and containers */
        panel: 'bg-[#080808] border border-white/[0.06]',

        /** Elevated cards - hover states, active items */
        elevated: 'bg-[#0A0A0B] border border-white/[0.08]',

        /** Glassmorphism - headers, navbars, overlays, modals */
        glass: 'bg-white/[0.02] backdrop-blur-[20px] border border-white/[0.05]',

        /** Primary highlight container - indigo accent (default for this app) */
        hud: 'bg-[linear-gradient(180deg,rgba(79,70,229,0.05)_0%,rgba(0,0,0,0)_100%)] border border-indigo-500/20',

        /** Warning/alert container - amber accent */
        hudWarning: 'bg-[linear-gradient(180deg,rgba(251,191,36,0.05)_0%,rgba(0,0,0,0)_100%)] border border-amber-500/20',

        /** Success container - emerald accent */
        hudSuccess: 'bg-[linear-gradient(180deg,rgba(16,185,129,0.05)_0%,rgba(0,0,0,0)_100%)] border border-emerald-500/20',

        /** Error container - red accent */
        hudError: 'bg-[linear-gradient(180deg,rgba(239,68,68,0.05)_0%,rgba(0,0,0,0)_100%)] border border-red-500/20',

        /** Info container - blue accent */
        hudInfo: 'bg-[linear-gradient(180deg,rgba(59,130,246,0.05)_0%,rgba(0,0,0,0)_100%)] border border-blue-500/20',

        /** Premium milled border treatment - inputs, action bars */
        milled: 'border-t border-white/[0.08] border-b border-black/50 border-x border-white/[0.04]',

        /** Interactive hover state */
        hover: 'bg-white/[0.03]',

        /** Active/pressed state */
        active: 'bg-white/[0.05]',
    },

    // --------------------------------------------------------------------------
    // TYPOGRAPHY SCALE
    // --------------------------------------------------------------------------
    type: {
        /** System labels, timestamps, metadata - monospace, uppercase */
        mono: 'font-mono text-[10px] tracking-[0.1em] uppercase text-zinc-500 tabular-nums',

        /** Primary body text */
        body: 'text-[15px] leading-[1.65] tracking-[-0.01em] text-[#A1A1AA]',

        /** Secondary body text - smaller */
        bodySmall: 'text-[13px] leading-[1.6] tracking-[-0.01em] text-[#A1A1AA]',

        /** Primary headings */
        h1: 'text-[13px] font-medium tracking-[-0.02em] text-white',

        /** Secondary headings */
        h2: 'text-[11px] font-medium tracking-[-0.01em] text-zinc-300',

        /** Large display text - verdict numbers, big stats */
        display: 'text-2xl md:text-3xl font-medium text-white tracking-tight leading-none tabular-nums',

        /** Form labels */
        label: 'text-[10px] font-medium uppercase tracking-wider text-zinc-500',

        /** Button text */
        button: 'text-[12px] font-medium tracking-tight',

        /** Chip/tag text */
        chip: 'text-[10px] font-medium tracking-wide uppercase text-zinc-300',

        /** Code/technical text */
        code: 'font-mono text-[14px] text-zinc-300',

        /** Error messages */
        error: 'text-[12px] text-red-400',

        /** Success messages */
        success: 'text-[12px] text-emerald-400',
    },

    // --------------------------------------------------------------------------
    // GEOMETRY (Border Radius)
    // --------------------------------------------------------------------------
    geo: {
        /** Fully rounded - pills, dots, avatars, tags */
        pill: 'rounded-full',

        /** Large cards - main containers, modals, chat widget */
        card: 'rounded-[22px]',

        /** Medium cards - inline cards, tool results */
        cardMedium: 'rounded-[16px]',

        /** Input fields, search bars, text areas */
        input: 'rounded-[24px]',

        /** Standard buttons */
        button: 'rounded-[12px]',

        /** Small buttons, inline actions */
        buttonSmall: 'rounded-[8px]',

        /** Subtle rounding - table cells, list items, code blocks */
        subtle: 'rounded-[6px]',

        /** Toast notifications */
        toast: 'rounded-full',
    },

    // --------------------------------------------------------------------------
    // COLOR PALETTE
    // --------------------------------------------------------------------------
    color: {
        bg: {
            void: '#050505',
            panel: '#080808',
            elevated: '#0A0A0B',
            hover: 'rgba(255,255,255,0.03)',
            active: 'rgba(255,255,255,0.05)',
        },

        text: {
            primary: '#FFFFFF',
            secondary: '#A1A1AA',
            tertiary: '#71717A',
            muted: '#52525B',
            inverted: '#000000',
        },

        border: {
            default: 'rgba(255,255,255,0.06)',
            subtle: 'rgba(255,255,255,0.04)',
            emphasis: 'rgba(255,255,255,0.08)',
            hover: 'rgba(255,255,255,0.10)',
        },

        accent: {
            // Primary - Indigo (Healthcare theme)
            indigo: '#6366F1',
            indigoMuted: 'rgba(99,102,241,0.2)',

            // Success - Emerald
            emerald: '#10B981',
            emeraldMuted: 'rgba(16,185,129,0.2)',

            // Warning - Amber
            amber: '#F59E0B',
            amberMuted: 'rgba(245,158,11,0.2)',

            // Error - Red
            red: '#EF4444',
            redMuted: 'rgba(239,68,68,0.2)',

            // Info - Blue
            blue: '#3B82F6',
            blueMuted: 'rgba(59,130,246,0.2)',
        },
    },

    // --------------------------------------------------------------------------
    // SHADOWS
    // --------------------------------------------------------------------------
    shadow: {
        /** Floating elements - toasts, dropdowns */
        float: 'shadow-[0_8px_24px_rgba(0,0,0,0.5)]',

        /** Cards */
        card: 'shadow-[0_4px_12px_rgba(0,0,0,0.3)]',

        /** Modals, overlays */
        modal: 'shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]',

        /** Buttons on hover */
        button: 'shadow-[0_2px_10px_rgba(0,0,0,0.1)]',

        /** Glowing active states */
        glowIndigo: 'shadow-[0_0_8px_rgba(99,102,241,0.8)]',
        glowEmerald: 'shadow-[0_0_8px_rgba(16,185,129,0.8)]',
        glowAmber: 'shadow-[0_0_8px_rgba(245,158,11,0.8)]',
        glowWhite: 'shadow-[0_0_15px_rgba(255,255,255,0.2)]',
        glowRed: 'shadow-[0_0_8px_rgba(239,68,68,0.8)]',
    },

    // --------------------------------------------------------------------------
    // SPACING (8px Grid)
    // --------------------------------------------------------------------------
    spacing: {
        px: '1px',
        0: '0',
        0.5: '2px',
        1: '4px',
        1.5: '6px',
        2: '8px',
        2.5: '10px',
        3: '12px',
        3.5: '14px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
        20: '80px',
        24: '96px',
    },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SystemTokens = typeof SYSTEM;
export type AnimationPreset = keyof typeof SYSTEM.anim;
export type SurfaceVariant = keyof typeof SYSTEM.surface;
export type TypeVariant = keyof typeof SYSTEM.type;
export type GeoVariant = keyof typeof SYSTEM.geo;
export type AccentColor = keyof typeof SYSTEM.color.accent;
