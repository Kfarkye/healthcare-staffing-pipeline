// ============================================================================
// src/components/handbook/TravelerHandbook.tsx
// ============================================================================
//
// Stealth Traveler Handbook
// A premium, public-facing resource guide for healthcare travel professionals.
// Designed to establish recruiter authority through exceptional design quality.
//
// Architecture: Single-file component with co-located styles for portability.
// Design System: Editorial luxury meets clinical precision.
// Performance: CSS-only animations, no external dependencies beyond Lucide.
//
// ============================================================================

import React, { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import {
    Home,
    DollarSign,
    ArrowRight,
    MapPin,
    Clock,
    Sparkles,
    Copy,
    Plus,
    Trash2,
    Download,
    Upload,
    FileText,
    ExternalLink,
    ShieldCheck
} from 'lucide-react';

// ============================================================================
// DESIGN TOKENS
// ============================================================================

const tokens = {
    colors: {
        // Core palette - warm neutrals with surgical precision
        ink: {
            primary: '#1a1a1a',
            secondary: '#4a4a4a',
            tertiary: '#7a7a7a',
            muted: '#a0a0a0',
        },
        surface: {
            primary: '#fefefe',
            secondary: '#f8f7f5',
            tertiary: '#f0eeea',
            elevated: '#ffffff',
        },
        accent: {
            primary: '#2d5a45',      // Deep forest - trust, growth
            secondary: '#4a7c59',    // Sage
            tertiary: '#6b9b7a',     // Moss
            highlight: '#c9a962',    // Antique gold - premium touch
            highlightMuted: '#e8d9a8',
        },
        semantic: {
            success: '#3d7a5a',
            warning: '#b8860b',
            info: '#4a6fa5',
        },
        gradient: {
            hero: 'linear-gradient(135deg, #1a1a1a 0%, #2d3a35 50%, #1a1a1a 100%)',
            card: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(248,247,245,1) 100%)',
            accent: 'linear-gradient(135deg, #2d5a45 0%, #4a7c59 100%)',
        },
    },
    typography: {
        families: {
            display: "'Playfair Display', 'Georgia', serif",
            body: "'Source Code 3', 'Source Sans 3', 'Helvetica Neue', sans-serif",
            mono: "'JetBrains Mono', 'SF Mono', monospace",
        },
        scale: {
            xs: '0.75rem',
            sm: '0.875rem',
            base: '1rem',
            lg: '1.125rem',
            xl: '1.25rem',
            '2xl': '1.5rem',
            '3xl': '1.875rem',
            '4xl': '2.25rem',
            '5xl': '3rem',
            '6xl': '3.75rem',
            '7xl': '4.5rem',
        },
        leading: {
            tight: '1.1',
            snug: '1.25',
            normal: '1.5',
            relaxed: '1.625',
            loose: '1.75',
        },
        tracking: {
            tighter: '-0.05em',
            tight: '-0.025em',
            normal: '0',
            wide: '0.05em',
            wider: '0.1em',
            widest: '0.2em',
        },
    },
    spacing: {
        px: '1px',
        0: '0',
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        32: '8rem',
    },
    radii: {
        none: '0',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        full: '9999px',
    },
    shadows: {
        sm: '0 1px 2px rgba(0,0,0,0.04)',
        md: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
        lg: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.02)',
        xl: '0 20px 25px -5px rgba(0,0,0,0.06), 0 10px 10px -5px rgba(0,0,0,0.02)',
        inner: 'inset 0 2px 4px rgba(0,0,0,0.03)',
        card: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
        cardHover: '0 1px 3px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.08)',
    },
    transitions: {
        fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
        base: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
        slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
        spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
} as const;

// ============================================================================
// STYLES - Embedded for single-file portability
// ============================================================================

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

/* ========================================================================
CSS RESET & BASE
======================================================================== */

.handbook-root *,
.handbook-root *::before,
.handbook-root *::after {
box-sizing: border-box;
margin: 0;
padding: 0;
}

.handbook-root {
--color-ink-primary: ${tokens.colors.ink.primary};
--color-ink-secondary: ${tokens.colors.ink.secondary};
--color-ink-tertiary: ${tokens.colors.ink.tertiary};
--color-ink-muted: ${tokens.colors.ink.muted};
--color-surface-primary: ${tokens.colors.surface.primary};
--color-surface-secondary: ${tokens.colors.surface.secondary};
--color-surface-tertiary: ${tokens.colors.surface.tertiary};
--color-surface-elevated: ${tokens.colors.surface.elevated};
--color-accent-primary: ${tokens.colors.accent.primary};
--color-accent-secondary: ${tokens.colors.accent.secondary};
--color-accent-tertiary: ${tokens.colors.accent.tertiary};
--color-accent-highlight: ${tokens.colors.accent.highlight};
--color-accent-highlight-muted: ${tokens.colors.accent.highlightMuted};

--font-display: ${tokens.typography.families.display};
--font-body: ${tokens.typography.families.body};
--font-mono: ${tokens.typography.families.mono};

--shadow-card: ${tokens.shadows.card};
--shadow-card-hover: ${tokens.shadows.cardHover};

--transition-fast: ${tokens.transitions.fast};
--transition-base: ${tokens.transitions.base};
--transition-slow: ${tokens.transitions.slow};
--transition-spring: ${tokens.transitions.spring};

font-family: var(--font-body);
font-size: 16px;
line-height: ${tokens.typography.leading.normal};
color: var(--color-ink-primary);
background-color: var(--color-surface-primary);
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
overflow-x: hidden;
}

/* ========================================================================
ANIMATIONS
======================================================================== */

@keyframes handbook-fade-in {
from { opacity: 0; }
to { opacity: 1; }
}

@keyframes handbook-fade-up {
from {
opacity: 0;
transform: translateY(24px);
}
to {
opacity: 1;
transform: translateY(0);
}
}

@keyframes handbook-fade-down {
from {
opacity: 0;
transform: translateY(-16px);
}
to {
opacity: 1;
transform: translateY(0);
}
}

@keyframes handbook-scale-in {
from {
opacity: 0;
transform: scale(0.96);
}
to {
opacity: 1;
transform: scale(1);
}
}

@keyframes handbook-slide-right {
from {
opacity: 0;
transform: translateX(-20px);
}
to {
opacity: 1;
transform: translateX(0);
}
}

@keyframes handbook-draw-line {
from { width: 0; }
to { width: 100%; }
}

@keyframes handbook-shimmer {
0% { background-position: -200% 0; }
100% { background-position: 200% 0; }
}

@keyframes handbook-float {
0%, 100% { transform: translateY(0); }
50% { transform: translateY(-6px); }
}

@keyframes handbook-pulse-soft {
0%, 100% { opacity: 1; }
50% { opacity: 0.7; }
}

.animate-fade-in {
animation: handbook-fade-in 600ms ease-out forwards;
}

.animate-fade-up {
animation: handbook-fade-up 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.animate-scale-in {
animation: handbook-scale-in 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.animate-slide-right {
animation: handbook-slide-right 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.stagger-1 { animation-delay: 100ms; }
.stagger-2 { animation-delay: 200ms; }
.stagger-3 { animation-delay: 300ms; }
.stagger-4 { animation-delay: 400ms; }
.stagger-5 { animation-delay: 500ms; }
.stagger-6 { animation-delay: 600ms; }

/* Initial state for animated elements */
[data-animate] {
opacity: 0;
}

[data-animate].is-visible {
opacity: 1;
}

/* ========================================================================
HERO SECTION
======================================================================== */

.handbook-hero {
position: relative;
min-height: 85vh;
display: flex;
align-items: center;
justify-content: center;
overflow: hidden;
background: ${tokens.colors.gradient.hero};
}

.handbook-hero__image-container {
position: absolute;
inset: 0;
z-index: 1;
}

.handbook-hero__image {
width: 100%;
height: 100%;
object-fit: cover;
opacity: 0.35;
filter: grayscale(30%) contrast(1.1);
transform: scale(1.02);
transition: transform 8s ease-out, opacity 1s ease-out;
}

.handbook-hero:hover .handbook-hero__image {
transform: scale(1);
}

.handbook-hero__overlay {
position: absolute;
inset: 0;
z-index: 2;
background: linear-gradient(
180deg,
rgba(26, 26, 26, 0.4) 0%,
rgba(26, 26, 26, 0.6) 50%,
rgba(26, 26, 26, 0.9) 100%
);
}

.handbook-hero__grain {
position: absolute;
inset: 0;
z-index: 3;
opacity: 0.03;
pointer-events: none;
background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

.handbook-hero__content {
position: relative;
z-index: 4;
max-width: 900px;
padding: ${tokens.spacing[8]} ${tokens.spacing[6]};
text-align: center;
}

.handbook-hero__eyebrow {
display: inline-flex;
align-items: center;
gap: ${tokens.spacing[2]};
padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
margin-bottom: ${tokens.spacing[6]};
font-family: var(--font-mono);
font-size: ${tokens.typography.scale.xs};
font-weight: 500;
letter-spacing: ${tokens.typography.tracking.widest};
text-transform: uppercase;
color: var(--color-accent-highlight);
background: rgba(201, 169, 98, 0.1);
border: 1px solid rgba(201, 169, 98, 0.2);
border-radius: ${tokens.radii.full};
}

.handbook-hero__title {
font-family: var(--font-display);
font-size: clamp(2.5rem, 8vw, ${tokens.typography.scale['7xl']});
font-weight: 500;
line-height: ${tokens.typography.leading.tight};
letter-spacing: ${tokens.typography.tracking.tight};
color: var(--color-surface-primary);
margin-bottom: ${tokens.spacing[6]};
}

.handbook-hero__title-accent {
font-style: italic;
color: var(--color-accent-highlight);
}

.handbook-hero__subtitle {
max-width: 640px;
margin: 0 auto ${tokens.spacing[8]};
font-size: ${tokens.typography.scale.lg};
font-weight: 300;
line-height: ${tokens.typography.leading.relaxed};
color: rgba(255, 255, 255, 0.75);
}

.handbook-hero__cta-group {
display: flex;
flex-wrap: wrap;
justify-content: center;
gap: ${tokens.spacing[4]};
}

.handbook-hero__cta {
display: inline-flex;
align-items: center;
gap: ${tokens.spacing[2]};
padding: ${tokens.spacing[4]} ${tokens.spacing[6]};
font-family: var(--font-body);
font-size: ${tokens.typography.scale.sm};
font-weight: 600;
letter-spacing: ${tokens.typography.tracking.wide};
text-transform: uppercase;
text-decoration: none;
border-radius: ${tokens.radii.sm};
cursor: pointer;
transition: all var(--transition-base);
}

.handbook-hero__cta--primary {
color: var(--color-ink-primary);
background: var(--color-surface-primary);
border: none;
}

.handbook-hero__cta--primary:hover {
background: var(--color-accent-highlight);
transform: translateY(-2px);
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.handbook-hero__cta--secondary {
color: var(--color-surface-primary);
background: transparent;
border: 1px solid rgba(255, 255, 255, 0.3);
}

.handbook-hero__cta--secondary:hover {
border-color: var(--color-accent-highlight);
color: var(--color-accent-highlight);
}

.handbook-hero__scroll {
position: absolute;
bottom: ${tokens.spacing[8]};
left: 50%;
transform: translateX(-50%);
z-index: 4;
display: flex;
flex-direction: column;
align-items: center;
gap: ${tokens.spacing[2]};
color: rgba(255, 255, 255, 0.5);
font-size: ${tokens.typography.scale.xs};
font-weight: 500;
letter-spacing: ${tokens.typography.tracking.wider};
text-transform: uppercase;
animation: handbook-pulse-soft 2s ease-in-out infinite;
}

.handbook-hero__scroll-line {
width: 1px;
height: 40px;
background: linear-gradient(180deg, rgba(255,255,255,0.5) 0%, transparent 100%);
}

/* ========================================================================
SECTION LAYOUT
======================================================================== */

.handbook-section {
position: relative;
padding: ${tokens.spacing[24]} ${tokens.spacing[6]};
}

.handbook-section--alt {
background: var(--color-surface-secondary);
}

.handbook-section--dark {
background: var(--color-ink-primary);
color: var(--color-surface-primary);
}

.handbook-section__container {
max-width: 1200px;
margin: 0 auto;
}

.handbook-section__header {
max-width: 680px;
margin-bottom: ${tokens.spacing[16]};
}

.handbook-section__header--center {
margin-left: auto;
margin-right: auto;
text-align: center;
}

.handbook-section__eyebrow {
display: inline-flex;
align-items: center;
gap: ${tokens.spacing[2]};
margin-bottom: ${tokens.spacing[4]};
font-family: var(--font-mono);
font-size: ${tokens.typography.scale.xs};
font-weight: 500;
letter-spacing: ${tokens.typography.tracking.widest};
text-transform: uppercase;
color: var(--color-accent-primary);
}

.handbook-section__eyebrow svg {
width: 14px;
height: 14px;
}

.handbook-section--dark .handbook-section__eyebrow {
color: var(--color-accent-highlight);
}

.handbook-section__title {
font-family: var(--font-display);
font-size: clamp(1.875rem, 4vw, ${tokens.typography.scale['4xl']});
font-weight: 500;
line-height: ${tokens.typography.leading.snug};
letter-spacing: ${tokens.typography.tracking.tight};
color: var(--color-ink-primary);
margin-bottom: ${tokens.spacing[4]};
}

.handbook-section--dark .handbook-section__title {
color: var(--color-surface-primary);
}

.handbook-section__description {
font-size: ${tokens.typography.scale.lg};
font-weight: 400;
line-height: ${tokens.typography.leading.relaxed};
color: var(--color-ink-secondary);
}

.handbook-section--dark .handbook-section__description {
color: rgba(255, 255, 255, 0.7);
}

/* ========================================================================
RESOURCE CARDS GRID
======================================================================== */

.handbook-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
gap: ${tokens.spacing[6]};
}

.handbook-grid--2col {
grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
}

.handbook-grid--3col {
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* ========================================================================
RESOURCE CARD
======================================================================== */

.resource-card {
position: relative;
display: flex;
flex-direction: column;
padding: ${tokens.spacing[8]};
background: var(--color-surface-elevated);
border: 1px solid rgba(0, 0, 0, 0.04);
border-radius: ${tokens.radii.xl};
box-shadow: var(--shadow-card);
transition: all var(--transition-base);
overflow: hidden;
}

.resource-card::before {
content: '';
position: absolute;
top: 0;
left: 0;
right: 0;
height: 3px;
background: var(--card-accent, var(--color-accent-primary));
opacity: 0;
transition: opacity var(--transition-base);
}

.resource-card:hover {
transform: translateY(-4px);
box-shadow: var(--shadow-card-hover);
border-color: rgba(0, 0, 0, 0.08);
}

.resource-card:hover::before {
opacity: 1;
}

.resource-card__icon {
display: flex;
align-items: center;
justify-content: center;
width: 56px;
height: 56px;
margin-bottom: ${tokens.spacing[5]};
font-size: 1.75rem;
background: var(--color-surface-tertiary);
border-radius: ${tokens.radii.lg};
transition: all var(--transition-base);
}

.resource-card:hover .resource-card__icon {
transform: scale(1.05);
background: var(--color-accent-highlight-muted);
}

.resource-card__title {
font-family: var(--font-display);
font-size: ${tokens.typography.scale.xl};
font-weight: 600;
line-height: ${tokens.typography.leading.snug};
color: var(--color-ink-primary);
margin-bottom: ${tokens.spacing[3]};
}

.resource-card__description {
flex: 1;
font-size: ${tokens.typography.scale.base};
line-height: ${tokens.typography.leading.relaxed};
color: var(--color-ink-secondary);
margin-bottom: ${tokens.spacing[5]};
}

.resource-card__link {
display: inline-flex;
align-items: center;
gap: ${tokens.spacing[2]};
font-size: ${tokens.typography.scale.sm};
font-weight: 600;
color: var(--color-accent-primary);
text-decoration: none;
transition: all var(--transition-fast);
}

.resource-card__link svg {
width: 16px;
height: 16px;
transition: transform var(--transition-fast);
}

.resource-card__link:hover {
color: var(--color-accent-secondary);
}

.resource-card__link:hover svg {
transform: translateX(4px);
}

/* Card color variants */
.resource-card--forest { --card-accent: #2d5a45; }
.resource-card--sage { --card-accent: #4a7c59; }
.resource-card--gold { --card-accent: #c9a962; }
.resource-card--slate { --card-accent: #4a6fa5; }

/* ========================================================================
MONEY TIPS - ALTERNATING LAYOUT
======================================================================== */

.money-tips {
display: flex;
flex-direction: column;
gap: ${tokens.spacing[8]};
}

.money-tip {
display: grid;
grid-template-columns: auto 1fr;
gap: ${tokens.spacing[6]};
align-items: start;
padding: ${tokens.spacing[8]};
background: var(--color-surface-elevated);
border-radius: ${tokens.radii.xl};
box-shadow: var(--shadow-card);
transition: all var(--transition-base);
}

.money-tip:hover {
box-shadow: var(--shadow-card-hover);
}

.money-tip__number {
display: flex;
align-items: center;
justify-content: center;
width: 48px;
height: 48px;
font-family: var(--font-display);
font-size: ${tokens.typography.scale.xl};
font-weight: 600;
color: var(--color-accent-primary);
background: linear-gradient(135deg, rgba(45, 90, 69, 0.08) 0%, rgba(74, 124, 89, 0.08) 100%);
border-radius: ${tokens.radii.lg};
}

.money-tip__content {
display: flex;
flex-direction: column;
gap: ${tokens.spacing[2]};
}

.money-tip__title {
font-family: var(--font-display);
font-size: ${tokens.typography.scale.xl};
font-weight: 600;
color: var(--color-ink-primary);
}

.money-tip__description {
font-size: ${tokens.typography.scale.base};
line-height: ${tokens.typography.leading.relaxed};
color: var(--color-ink-secondary);
}

.money-tip__highlight {
display: inline;
padding: 0 ${tokens.spacing[1]};
background: linear-gradient(180deg, transparent 60%, var(--color-accent-highlight-muted) 60%);
}

/* ========================================================================
CHECKLIST - TIMELINE STYLE
======================================================================== */

.checklist {
position: relative;
display: flex;
flex-direction: column;
gap: ${tokens.spacing[1]};
max-width: 720px;
}

.checklist::before {
content: '';
position: absolute;
top: 32px;
left: 23px;
bottom: 32px;
width: 2px;
background: linear-gradient(
180deg,
var(--color-accent-primary) 0%,
var(--color-accent-tertiary) 50%,
var(--color-surface-tertiary) 100%
);
border-radius: ${tokens.radii.full};
}

.checklist__item {
position: relative;
display: grid;
grid-template-columns: 48px 1fr;
gap: ${tokens.spacing[5]};
padding: ${tokens.spacing[6]};
background: transparent;
border-radius: ${tokens.radii.lg};
transition: all var(--transition-base);
}

.checklist__item:hover {
background: var(--color-surface-elevated);
}

.checklist__number {
position: relative;
z-index: 1;
display: flex;
align-items: center;
justify-content: center;
width: 48px;
height: 48px;
font-family: var(--font-display);
font-size: ${tokens.typography.scale.lg};
font-weight: 600;
color: var(--color-surface-primary);
background: var(--color-accent-primary);
border-radius: ${tokens.radii.full};
box-shadow: 0 4px 12px rgba(45, 90, 69, 0.25);
transition: all var(--transition-base);
}

.checklist__item:hover .checklist__number {
transform: scale(1.1);
box-shadow: 0 6px 16px rgba(45, 90, 69, 0.35);
}

.checklist__content {
padding-top: ${tokens.spacing[2]};
}

.checklist__title {
font-family: var(--font-display);
font-size: ${tokens.typography.scale.xl};
font-weight: 600;
color: var(--color-ink-primary);
margin-bottom: ${tokens.spacing[2]};
}

.checklist__description {
font-size: ${tokens.typography.scale.base};
line-height: ${tokens.typography.leading.relaxed};
color: var(--color-ink-secondary);
}

/* ========================================================================
STATS BAR
======================================================================== */

.stats-bar {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
gap: ${tokens.spacing[6]};
padding: ${tokens.spacing[12]} ${tokens.spacing[6]};
background: var(--color-ink-primary);
border-radius: ${tokens.radii['2xl']};
}

.stat {
display: flex;
flex-direction: column;
align-items: center;
text-align: center;
padding: ${tokens.spacing[4]};
}

.stat__value {
font-family: var(--font-display);
font-size: ${tokens.typography.scale['4xl']};
font-weight: 500;
color: var(--color-accent-highlight);
line-height: 1;
margin-bottom: ${tokens.spacing[2]};
}

.stat__label {
font-size: ${tokens.typography.scale.sm};
font-weight: 500;
letter-spacing: ${tokens.typography.tracking.wide};
text-transform: uppercase;
color: rgba(255, 255, 255, 0.6);
}

/* ========================================================================
FOOTER
======================================================================== */

.handbook-footer {
position: relative;
padding: ${tokens.spacing[16]} ${tokens.spacing[6]};
background: var(--color-surface-secondary);
border-top: 1px solid var(--color-surface-tertiary);
text-align: center;
}

.handbook-footer__divider {
width: 40px;
height: 2px;
margin: 0 auto ${tokens.spacing[6]};
background: var(--color-accent-highlight);
border-radius: ${tokens.radii.full};
}

.handbook-footer__signature {
font-size: ${tokens.typography.scale.sm};
font-weight: 500;
letter-spacing: ${tokens.typography.tracking.wider};
text-transform: uppercase;
color: var(--color-ink-tertiary);
margin-bottom: ${tokens.spacing[2]};
}

.handbook-footer__name {
display: block;
font-family: var(--font-display);
font-size: ${tokens.typography.scale['2xl']};
font-weight: 500;
font-style: italic;
color: var(--color-ink-primary);
margin-bottom: ${tokens.spacing[1]};
}

.handbook-footer__title {
font-size: ${tokens.typography.scale.sm};
color: var(--color-ink-tertiary);
}

/* ========================================================================
RESPONSIVE ADJUSTMENTS
======================================================================== */

@media (max-width: 768px) {
    .handbook-hero {
        min-height: 90vh;
    }
    .handbook-hero__content {
        padding: ${tokens.spacing[6]} ${tokens.spacing[4]};
    }

    .handbook-section {
        padding: ${tokens.spacing[16]} ${tokens.spacing[4]};
    }

    .handbook-section__header {
        margin-bottom: ${tokens.spacing[10]};
    }

    .checklist::before {
        left: 19px;
    }

    .checklist__item {
        grid-template-columns: 40px 1fr;
        gap: ${tokens.spacing[4]};
        padding: ${tokens.spacing[4]};
    }

    .checklist__number {
        width: 40px;
        height: 40px;
        font-size: ${tokens.typography.scale.base};
    }

    .money-tip {
        grid-template-columns: 1fr;
        gap: ${tokens.spacing[4]};
    }

    .money-tip__number {
        width: 40px;
        height: 40px;
    }
}

/* ========================================================================
CREDENTIAL SNAPSHOT TOOL
======================================================================== */

.credential-tool {
padding: ${tokens.spacing[8]};
background: var(--color-surface-elevated);
border-radius: ${tokens.radii.xl};
box-shadow: var(--shadow-card);
border: 1px solid rgba(0,0,0,0.04);
}

.credential-grid {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
gap: ${tokens.spacing[4]};
margin-bottom: ${tokens.spacing[8]};
}

.credential-card {
padding: ${tokens.spacing[5]};
background: var(--color-surface-secondary);
border: 1px solid rgba(0,0,0,0.05);
border-radius: ${tokens.radii.lg};
transition: all var(--transition-base);
display: flex;
flex-direction: column;
gap: ${tokens.spacing[3]};
}

.credential-card:hover {
transform: translateY(-2px);
box-shadow: var(--shadow-sm);
border-color: var(--color-accent-primary);
}

.credential-card__header {
display: flex;
align-items: center;
justify-content: space-between;
}

.credential-card__type {
font-family: var(--font-display);
font-size: ${tokens.typography.scale.lg};
font-weight: 600;
color: var(--color-ink-primary);
}

.badge {
padding: 2px 8px;
font-size: 10px;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.05em;
border-radius: ${tokens.radii.sm};
}

.badge--active { background: #dcfce7; color: #166534; }
.badge--expiring { background: #fef9c3; color: #854d0e; }
.badge--expired { background: #fee2e2; color: #991b1b; }
.badge--neutral { background: #f1f5f9; color: #475569; }

.credential-card__meta {
display: flex;
flex-direction: column;
gap: 4px;
font-size: ${tokens.typography.scale.xs};
color: var(--color-ink-tertiary);
}

.credential-card__actions {
display: flex;
gap: ${tokens.spacing[2]};
margin-top: auto;
padding-top: ${tokens.spacing[3]};
border-top: 1px solid rgba(0,0,0,0.05);
}

.credential-form {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
gap: ${tokens.spacing[4]};
padding: ${tokens.spacing[6]};
margin-bottom: ${tokens.spacing[8]};
background: var(--color-surface-secondary);
border-radius: ${tokens.radii.lg};
border: 1px dashed var(--color-ink-muted);
}

.form-group {
display: flex;
flex-direction: column;
gap: 4px;
}

.form-label {
font-size: 10px;
font-weight: 700;
color: var(--color-ink-secondary);
text-transform: uppercase;
letter-spacing: 0.05em;
}

.form-input {
padding: 8px 12px;
font-size: 13px;
border: 1px solid rgba(0,0,0,0.1);
border-radius: ${tokens.radii.md};
background: white;
transition: border-color var(--transition-fast);
}

.form-input:focus {
outline: none;
border-color: var(--color-accent-primary);
}

.btn {
display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;
padding: 10px 16px;
font-size: 12px;
font-weight: 600;
cursor: pointer;
transition: all var(--transition-base);
border-radius: ${tokens.radii.md};
border: none;
white-space: nowrap;
}

.btn--sm { padding: 4px 8px; font-size: 10px; }
.btn--primary { background: var(--color-accent-primary); color: white; }
.btn--primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn--ghost { background: transparent; color: var(--color-ink-secondary); border: 1px solid rgba(0,0,0,0.1); }
.btn--ghost:hover { background: var(--color-surface-tertiary); color: var(--color-accent-primary); border-color: var(--color-accent-primary); }
.btn--danger { background: #fee2e2; color: #991b1b; }
.btn--danger:hover { background: #fecaca; }

.tool-actions {
display: flex;
flex-wrap: wrap;
gap: ${tokens.spacing[3]};
padding-top: ${tokens.spacing[8]};
border-top: 1px solid rgba(0,0,0,0.05);
}
`;

// ============================================================================
// DATA - Content Configuration
// ============================================================================

interface HousingResource {
    id: string;
    title: string;
    description: string;
    link: string;
    linkText: string;
    icon: string;
    variant: 'forest' | 'sage' | 'gold' | 'slate';
}

interface MoneyTip {
    title: string;
    content: string;
    highlight?: string;
}

interface ChecklistItem {
    step: number;
    title: string;
    description: string;
}

interface CredentialItem {
    id: string;
    type: string;
    issuer?: string;
    credentialId?: string;
    expirationDate?: string;
    attachmentUrl?: string;
}

const HOUSING_RESOURCES: HousingResource[] = [
    {
        id: 'furnished-finder',
        title: 'Furnished Finder',
        description:
            'The gold standard for travel healthcare housing. Over 150,000 furnished properties tailored for traveling professionals. Leverage the "Housing Request" feature to let landlords compete for you.',
        link: 'https://www.furnishedfinder.com',
        linkText: 'Explore Properties',
        icon: '🏠',
        variant: 'forest',
    },
    {
        id: 'landing',
        title: 'Landing',
        description:
            'Flexible, design-forward apartments across 375+ cities. No long-term leases, seamless app-based booking. The premium choice for travelers who prioritize comfort and aesthetics.',
        link: 'https://www.hellolanding.com',
        linkText: 'Browse Network',
        icon: '🔑',
        variant: 'sage',
    },
    {
        id: 'airbnb',
        title: 'Airbnb / VRBO',
        description:
            'Ideal for initial reconnaissance during your first 2 weeks. Message hosts directly to negotiate monthly rates—verified healthcare workers often secure 20-30% discounts.',
        link: 'https://www.airbnb.com',
        linkText: 'Search Listings',
        icon: '✈️',
        variant: 'gold',
    },
    {
        id: 'facebook-marketplace',
        title: 'Facebook Marketplace',
        description:
            'Local sublets and furnished rentals. Search "Travel Nurse Housing" groups in your destination city. Due diligence is essential: video tour every property before payment.',
        link: 'https://www.facebook.com/marketplace',
        linkText: 'Open Marketplace',
        icon: '💬',
        variant: 'slate',
    },
];

const MONEY_TIPS: MoneyTip[] = [
    {
        title: 'The Tax Home Rule',
        content:
            'Your weekly housing and meal stipends remain tax-free only if you maintain a legitimate tax home—a permanent residence you return to and pay expenses on. This is the foundation of travel pay optimization.',
        highlight: 'tax-free',
    },
    {
        title: 'Maximize Take-Home',
        content:
            'The arbitrage: spend less on housing than your stipend provides. The delta is pure profit. This is how disciplined travelers consistently out-earn staff positions by significant margins.',
        highlight: 'pure profit',
    },
    {
        title: 'Negotiate the Structure',
        content:
            'Scrutinize pay breakdowns, not just weekly totals. Some agencies shift compensation between taxable wages and non-taxable stipends. Ensure your taxable hourly rate remains defensible under audit.',
        highlight: 'pay breakdowns',
    },
];

const FIRST_48_HOURS: ChecklistItem[] = [
    {
        step: 1,
        title: 'Arrive & Establish Base',
        description:
            'Secure your housing, unpack essentials, confirm facility address and parking. Quality rest tonight determines your first impression tomorrow.',
    },
    {
        step: 2,
        title: 'Facility Check-In',
        description:
            'Report to the staffing office with all credentialing documents: license, certifications, government ID. Collect your badge and orientation schedule.',
    },
    {
        step: 3,
        title: 'Map Your Environment',
        description:
            'Locate critical landmarks: break room, charting stations, supply rooms, emergency exits. A 15-minute orientation walk prevents days of inefficiency.',
    },
    {
        step: 4,
        title: 'Establish Local Infrastructure',
        description:
            'Identify your nearest grocery store, pharmacy, gas station, and preferred coffee source. Small logistics compound into major quality-of-life gains.',
    },
];

const STATS = [
    { value: '150K+', label: 'Housing Listings' },
    { value: '375+', label: 'Cities Covered' },
    { value: '13', label: 'Week Contracts' },
    { value: '48hr', label: 'Setup Window' },
];

// ============================================================================
// UTILITY HOOKS
// ============================================================================

function useIntersectionObserver(
    options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement | null>, boolean] {
    const ref = useRef<HTMLElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.unobserve(element);
                }
            },
            { threshold: 0.1, ...options }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [options]);

    return [ref, isVisible];
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StyleInjector: FC = () => (
    <style dangerouslySetInnerHTML={{ __html: styles }} />
);

interface AnimatedSectionProps {
    children: ReactNode;
    className?: string;
    delay?: number;
}

const AnimatedSection: FC<AnimatedSectionProps> = ({
    children,
    className = '',
    delay = 0,
}) => {
    const [ref, isVisible] = useIntersectionObserver();

    return (
        <div
            ref={ref as React.RefObject<HTMLDivElement>}
            className={`${className} ${isVisible ? 'animate-fade-up' : ''}`}
            style={{
                opacity: isVisible ? 1 : 0,
                animationDelay: `${delay}ms`,
            }}
        >
            {children}
        </div>
    );
};

const Hero: FC = () => (
    <section className="handbook-hero">
        <div className="handbook-hero__image-container">
            <img
                src="/traveler_hero.png"
                alt="Modern apartment with city view"
                className="handbook-hero__image"
                loading="eager"
            />
        </div>
        <div className="handbook-hero__overlay" />
        <div className="handbook-hero__grain" />

        <div className="handbook-hero__content">
            <span className="handbook-hero__eyebrow animate-fade-in">
                <Sparkles size={12} />
                Healthcare Travel Intelligence
            </span>

            <h1 className="handbook-hero__title animate-fade-up stagger-1">
                The <span className="handbook-hero__title-accent">Traveler</span>{' '}
                Handbook
            </h1>

            <p className="handbook-hero__subtitle animate-fade-up stagger-2">
                A definitive guide for the modern healthcare traveler. Master your
                logistics, maximize your compensation, and execute flawlessly from day
                one.
            </p>

            <div className="handbook-hero__cta-group animate-fade-up stagger-3">
                <a href="#housing" className="handbook-hero__cta handbook-hero__cta--primary">
                    <Home size={16} />
                    Find Housing
                </a>
                <a href="#money" className="handbook-hero__cta handbook-hero__cta--secondary">
                    <DollarSign size={16} />
                    Optimize Pay
                </a>
            </div>
        </div>

        <div className="handbook-hero__scroll">
            <span>Scroll</span>
            <div className="handbook-hero__scroll-line" />
        </div>
    </section>
);

const StatsBar: FC = () => (
    <AnimatedSection className="handbook-section__container">
        <div className="stats-bar">
            {STATS.map((stat, index) => (
                <div key={stat.label} className={`stat stagger-${index + 1}`}>
                    <span className="stat__value">{stat.value}</span>
                    <span className="stat__label">{stat.label}</span>
                </div>
            ))}
        </div>
    </AnimatedSection>
);

interface ResourceCardProps {
    resource: HousingResource;
    index: number;
}

const ResourceCard: FC<ResourceCardProps> = ({ resource, index }) => (
    <AnimatedSection
        className={`resource-card resource-card--${resource.variant}`}
        delay={index * 100}
    >
        <div className="resource-card__icon">{resource.icon}</div>
        <h3 className="resource-card__title">{resource.title}</h3>
        <p className="resource-card__description">{resource.description}</p>
        <a
            href={resource.link}
            target="_blank"
            rel="noopener noreferrer"
            className="resource-card__link"
        >
            {resource.linkText}
            <ArrowRight />
        </a>
    </AnimatedSection>
);

const HousingSection: FC = () => (
    <section id="housing" className="handbook-section">
        <div className="handbook-section__container">
            <AnimatedSection className="handbook-section__header">
                <p className="handbook-section__eyebrow">
                    <MapPin />
                    Housing & Logistics
                </p>
                <h2 className="handbook-section__title">
                    Secure Your Home Base
                </h2>
                <p className="handbook-section__description">
                    Housing is the primary determinant of assignment satisfaction and
                    financial outcome. These verified platforms represent the current
                    best-in-class options for traveling healthcare professionals.
                </p>
            </AnimatedSection>

            <div className="handbook-grid handbook-grid--2col">
                {HOUSING_RESOURCES.map((resource, index) => (
                    <ResourceCard key={resource.id} resource={resource} index={index} />
                ))}
            </div>
        </div>
    </section>
);

interface MoneyTipCardProps {
    tip: MoneyTip;
    index: number;
}

const MoneyTipCard: FC<MoneyTipCardProps> = ({ tip, index }) => (
    <AnimatedSection className="money-tip" delay={index * 100}>
        <div className="money-tip__number">{index + 1}</div>
        <div className="money-tip__content">
            <h3 className="money-tip__title">{tip.title}</h3>
            <p className="money-tip__description">{tip.content}</p>
        </div>
    </AnimatedSection>
);

const MoneySection: FC = () => (
    <section id="money" className="handbook-section handbook-section--alt">
        <div className="handbook-section__container">
            <AnimatedSection className="handbook-section__header">
                <p className="handbook-section__eyebrow">
                    <DollarSign />
                    Financial Strategy
                </p>
                <h2 className="handbook-section__title">
                    Understand Your Compensation
                </h2>
                <p className="handbook-section__description">
                    Travel healthcare pay structures differ fundamentally from staff
                    positions. Mastering the interplay between taxable wages and tax-free
                    stipends is essential to long-term wealth accumulation.
                </p>
            </AnimatedSection>

            <div className="money-tips">
                {MONEY_TIPS.map((tip, index) => (
                    <MoneyTipCard key={tip.title} tip={tip} index={index} />
                ))}
            </div>
        </div>
    </section>
);

interface ChecklistItemCardProps {
    item: ChecklistItem;
}

const ChecklistItemCard: FC<ChecklistItemCardProps> = ({ item }) => (
    <AnimatedSection className="checklist__item" delay={item.step * 100}>
        <div className="checklist__number">{item.step}</div>
        <div className="checklist__content">
            <h4 className="checklist__title">{item.title}</h4>
            <p className="checklist__description">{item.description}</p>
        </div>
    </AnimatedSection>
);

const ChecklistSection: FC = () => (
    <section id="checklist" className="handbook-section">
        <div className="handbook-section__container">
            <AnimatedSection className="handbook-section__header">
                <p className="handbook-section__eyebrow">
                    <Clock />
                    Operations
                </p>
                <h2 className="handbook-section__title">Your First 48 Hours</h2>
                <p className="handbook-section__description">
                    The initial 48-hour window establishes the trajectory for your entire
                    13-week contract. Execute this blueprint to eliminate friction and
                    establish operational rhythm immediately.
                </p>
            </AnimatedSection>
            <div className="checklist">
                {FIRST_48_HOURS.map((item) => (
                    <ChecklistItemCard key={item.step} item={item} />
                ))}
            </div>
        </div>
    </section>
);

const CredentialSnapshotSection: FC = () => {
    const [items, setItems] = useState<CredentialItem[]>([]);
    const [newItem, setNewItem] = useState<Partial<CredentialItem>>({ type: '' });

    const getStatus = (date?: string) => {
        if (!date) return 'neutral';
        const expiry = new Date(date);
        const now = new Date();
        const diff = expiry.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 3600 * 24));

        if (days < 0) return 'expired';
        if (days <= 30) return 'expiring';
        return 'active';
    };

    const addItem = () => {
        if (!newItem.type) return;
        const item: CredentialItem = {
            id: crypto.randomUUID(),
            type: newItem.type,
            issuer: newItem.issuer,
            credentialId: newItem.credentialId,
            expirationDate: newItem.expirationDate,
            attachmentUrl: newItem.attachmentUrl,
        };
        setItems([...items, item]);
        setNewItem({ type: '' });
    };

    const deleteItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const exportData = () => {
        const data = JSON.stringify(items, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `credential-pack-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (Array.isArray(data)) setItems(data);
            } catch (err) {
                alert('Invalid JSON file');
            }
        };
        reader.readAsText(file);
    };

    const copyShareText = () => {
        if (items.length === 0) return;
        const text = `CREDENTIAL READINESS SNAPSHOT\nGenerated: ${new Date().toLocaleDateString()}\n\n` +
            items.map(i => {
                const status = getStatus(i.expirationDate).toUpperCase();
                return `[${status}] ${i.type}${i.issuer ? ` | ${i.issuer}` : ''}${i.expirationDate ? ` | Exp: ${i.expirationDate}` : ''}${i.attachmentUrl ? `\nLink: ${i.attachmentUrl}` : ''}`;
            }).join('\n\n');

        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    return (
        <section id="credentials" className="handbook-section handbook-section--alt">
            <div className="handbook-section__container">
                <AnimatedSection className="handbook-section__header">
                    <p className="handbook-section__eyebrow">
                        <ShieldCheck />
                        Compliance & Readiness
                    </p>
                    <h2 className="handbook-section__title">Credential Snapshot</h2>
                    <p className="handbook-section__description">
                        Organize your professional identity. Track expirations locally and generate a "Share Pack" for your recruiter in seconds. No server uploads—your data stays in your browser.
                    </p>
                </AnimatedSection>

                <div className="credential-tool">
                    <div className="credential-form">
                        <div className="form-group">
                            <label className="form-label">Type (e.g. BLS, License)</label>
                            <input
                                className="form-input"
                                placeholder="State License"
                                value={newItem.type}
                                onChange={e => setNewItem({ ...newItem, type: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Issuer</label>
                            <input
                                className="form-input"
                                placeholder="AHA, State Board"
                                value={newItem.issuer || ''}
                                onChange={e => setNewItem({ ...newItem, issuer: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Expiration</label>
                            <input
                                className="form-input"
                                type="date"
                                value={newItem.expirationDate || ''}
                                onChange={e => setNewItem({ ...newItem, expirationDate: e.target.value })}
                            />
                        </div>
                        <div className="form-group" style={{ justifyContent: 'end' }}>
                            <button className="btn btn--primary" onClick={addItem}>
                                <Plus size={16} /> Add to Pack
                            </button>
                        </div>
                    </div>

                    <div className="credential-grid">
                        {items.length === 0 && (
                            <div className="credential-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: tokens.colors.ink.tertiary }}>
                                <FileText size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                                <p>Your pack is empty. Add your first credential above.</p>
                            </div>
                        )}
                        {items.map(item => {
                            const status = getStatus(item.expirationDate);
                            return (
                                <div key={item.id} className="credential-card">
                                    <div className="credential-card__header">
                                        <span className="credential-card__type">{item.type}</span>
                                        <span className={`badge badge--${status}`}>{status}</span>
                                    </div>
                                    <div className="credential-card__meta">
                                        {item.issuer && <span>Issuer: {item.issuer}</span>}
                                        {item.credentialId && <span>ID: {item.credentialId}</span>}
                                        {item.expirationDate && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={12} /> {item.expirationDate}
                                            </span>
                                        )}
                                    </div>
                                    <div className="credential-card__actions">
                                        <button className="btn btn--ghost btn--sm" onClick={() => deleteItem(item.id)}>
                                            <Trash2 size={12} /> Remove
                                        </button>
                                        {item.attachmentUrl && (
                                            <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                                                <ExternalLink size={12} /> View
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="tool-actions">
                        <button className="btn btn--primary" onClick={copyShareText} disabled={items.length === 0}>
                            <Copy size={16} /> Copy Share Pack
                        </button>
                        <button className="btn btn--ghost" onClick={exportData} disabled={items.length === 0}>
                            <Download size={16} /> Export JSON
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn--ghost" onClick={() => document.getElementById('import-json')?.click()}>
                                <Upload size={16} /> Import JSON
                            </button>
                            <input
                                id="import-json"
                                type="file"
                                accept=".json"
                                style={{ display: 'none' }}
                                onChange={handleImport}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const Footer: FC = () => (
    <footer className="handbook-footer">
        <div className="handbook-footer__divider" />
        <p className="handbook-footer__signature">Curated for Travelers by</p>
        <span className="handbook-footer__name">Kofi Farkye</span>
        <p className="handbook-footer__title">Senior Healthcare Consultant</p>
    </footer>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TravelerHandbook(): JSX.Element {
    return (
        <div className="handbook-root">
            <StyleInjector />
            <Hero />
            <div style={{ padding: `${tokens.spacing[12]} ${tokens.spacing[6]}` }}>
                <StatsBar />
            </div>
            <HousingSection />
            <MoneySection />
            <ChecklistSection />
            <CredentialSnapshotSection />
            <Footer />
        </div>
    );
}
