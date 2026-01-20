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
    FileText,
    ShieldCheck,
    Share2,
    Lock,
    Globe,
    Search,
    Users,
    Target,
    Shield,
    Heart,
    Award,
    Send,
    MessageCircle,
    ExternalLink
} from 'lucide-react';
import { AIService, ChatMessage } from '../../services/aiService';
import { supabase } from '../../lib/supabase';
import {
    generateKey,
    exportKey,
    importKey,
    encryptData,
    decryptData,
    type EncryptedPackage
} from '../../lib/crypto';

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

/* Form & Input Styles */
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
padding: 10px 12px;
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

/* Button & Tool Styles */
.btn {
display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;
padding: 12px 20px;
font-size: 13px;
font-weight: 600;
cursor: pointer;
transition: all var(--transition-base);
border-radius: ${tokens.radii.md};
border: none;
white-space: nowrap;
}

.btn--sm { padding: 6px 12px; font-size: 11px; }
.btn--primary { background: var(--color-accent-primary); color: white; }
.btn--primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn--ghost { background: transparent; color: var(--color-ink-secondary); border: 1px solid rgba(0,0,0,0.1); }
.btn--ghost:hover { background: var(--color-surface-tertiary); color: var(--color-accent-primary); border-color: var(--color-accent-primary); }
.btn--accent { background: var(--color-accent-highlight); color: var(--color-ink-primary); }
.btn--accent:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(201, 169, 98, 0.2); }

.tool-actions {
display: flex;
flex-wrap: wrap;
gap: ${tokens.spacing[4]};
padding-top: ${tokens.spacing[8]};
border-top: 1px solid rgba(0,0,0,0.05);
}

.cloud-status {
display: flex;
align-items: center;
gap: 8px;
margin-top: ${tokens.spacing[4]};
padding: ${tokens.spacing[3]} ${tokens.spacing[4]};
background: #f8fafc;
border-radius: ${tokens.radii.md};
font-size: 12px;
color: var(--color-ink-secondary);
}

.cloud-link-box {
display: flex;
align-items: center;
gap: 8px;
margin-top: ${tokens.spacing[4]};
padding: ${tokens.spacing[2]};
background: white;
border: 1px solid var(--color-accent-highlight);
border-radius: ${tokens.radii.md};
}

.share-url {
flex: 1;
font-family: var(--font-mono);
font-size: 11px;
color: var(--color-ink-tertiary);
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}

/* ========================================================================
   RESEARCH CHAT
   ======================================================================== */

.research-chat {
background: var(--color-surface-elevated);
border-radius: ${tokens.radii.xl};
box-shadow: var(--shadow-card);
border: 1px solid rgba(0,0,0,0.04);
overflow: hidden;
display: flex;
flex-direction: column;
height: 480px;
}

.research-chat__messages {
flex: 1;
overflow-y: auto;
padding: ${tokens.spacing[6]};
display: flex;
flex-direction: column;
gap: ${tokens.spacing[4]};
}

.research-chat__empty {
flex: 1;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
text-align: center;
color: var(--color-ink-tertiary);
}

.research-chat__suggestions {
display: flex;
flex-wrap: wrap;
gap: ${tokens.spacing[2]};
margin-top: ${tokens.spacing[4]};
justify-content: center;
}

.research-chat__suggestions button {
padding: 8px 14px;
background: var(--color-surface-tertiary);
border: 1px solid rgba(0,0,0,0.08);
border-radius: ${tokens.radii.full};
font-size: 12px;
color: var(--color-ink-secondary);
cursor: pointer;
transition: all var(--transition-fast);
}

.research-chat__suggestions button:hover {
background: var(--color-accent-primary);
color: white;
border-color: var(--color-accent-primary);
}

.research-chat__message {
display: flex;
}

.research-chat__message--user {
justify-content: flex-end;
}

.research-chat__message--model {
justify-content: flex-start;
}

.research-chat__bubble {
max-width: 85%;
padding: ${tokens.spacing[4]};
border-radius: ${tokens.radii.lg};
font-size: 14px;
line-height: 1.6;
}

.research-chat__message--user .research-chat__bubble {
background: var(--color-accent-primary);
color: white;
border-bottom-right-radius: 4px;
}

.research-chat__message--model .research-chat__bubble {
background: var(--color-surface-secondary);
color: var(--color-ink-primary);
border-bottom-left-radius: 4px;
}

.research-chat__bubble--loading {
display: flex;
gap: 6px;
padding: 16px 20px;
}

.research-chat__dot {
width: 8px;
height: 8px;
background: var(--color-ink-tertiary);
border-radius: 50%;
animation: pulse 1.2s ease-in-out infinite;
}

.research-chat__dot:nth-child(2) { animation-delay: 0.2s; }
.research-chat__dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes pulse {
0%, 100% { opacity: 0.4; transform: scale(0.8); }
50% { opacity: 1; transform: scale(1); }
}

.research-chat__citations {
margin-top: ${tokens.spacing[3]};
padding-top: ${tokens.spacing[3]};
border-top: 1px solid rgba(0,0,0,0.08);
display: flex;
flex-wrap: wrap;
gap: ${tokens.spacing[2]};
align-items: center;
}

.research-chat__citations-label {
font-size: 10px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--color-ink-tertiary);
}

.research-chat__citations a {
display: inline-flex;
align-items: center;
gap: 4px;
padding: 4px 10px;
background: rgba(45, 90, 69, 0.1);
color: var(--color-accent-primary);
font-size: 11px;
border-radius: ${tokens.radii.sm};
text-decoration: none;
transition: background var(--transition-fast);
}

.research-chat__citations a:hover {
background: rgba(45, 90, 69, 0.2);
}

.research-chat__input-area {
display: flex;
gap: ${tokens.spacing[3]};
padding: ${tokens.spacing[4]};
border-top: 1px solid rgba(0,0,0,0.05);
background: var(--color-surface-secondary);
}

.research-chat__input {
flex: 1;
padding: 12px 16px;
background: white;
border: 1px solid rgba(0,0,0,0.1);
border-radius: ${tokens.radii.lg};
font-size: 14px;
transition: border-color var(--transition-fast);
}

.research-chat__input:focus {
outline: none;
border-color: var(--color-accent-primary);
}

.research-chat__input::placeholder {
color: var(--color-ink-muted);
}

.research-chat__send {
width: 48px;
height: 48px;
background: var(--color-accent-primary);
color: white;
border: none;
border-radius: ${tokens.radii.lg};
cursor: pointer;
display: flex;
align-items: center;
justify-content: center;
transition: all var(--transition-fast);
}

.research-chat__send:hover:not(:disabled) {
transform: translateY(-1px);
box-shadow: 0 4px 12px rgba(45, 90, 69, 0.3);
}

.research-chat__send:disabled {
opacity: 0.5;
cursor: not-allowed;
}

/* ========================================================================
   LIFECYCLE ROADMAP
   ======================================================================== */

.lifecycle-timeline {
display: flex;
flex-direction: column;
gap: ${tokens.spacing[6]};
max-width: 800px;
margin: 0 auto;
padding: ${tokens.spacing[8]} 0;
}

.lifecycle-step {
display: flex;
gap: ${tokens.spacing[8]};
}

.lifecycle-step__marker {
display: flex;
flex-direction: column;
align-items: center;
flex-shrink: 0;
}

.lifecycle-step__icon {
width: 48px;
height: 48px;
border-radius: ${tokens.radii.full};
background: white;
border: 4px solid var(--color-surface-secondary);
display: flex;
align-items: center;
justify-content: center;
color: white;
z-index: 2;
padding: 10px;
}

.lifecycle-step__line {
flex: 1;
width: 2px;
background: var(--color-surface-tertiary);
margin: ${tokens.spacing[2]} 0;
}

.lifecycle-step:last-child .lifecycle-step__line {
display: none;
}

.lifecycle-step__content {
flex: 1;
background: var(--color-surface-elevated);
padding: ${tokens.spacing[6]};
border-radius: ${tokens.radii.xl};
box-shadow: var(--shadow-card);
border: 1px solid rgba(0,0,0,0.03);
transition: transform var(--transition-normal);
}

.lifecycle-step:hover .lifecycle-step__content {
transform: translateX(8px);
}

.lifecycle-step__phase {
font-family: var(--font-mono);
font-size: 10px;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.1em;
color: var(--color-ink-tertiary);
display: block;
margin-bottom: ${tokens.spacing[2]};
}

.lifecycle-step__title {
font-family: var(--font-display);
font-size: ${tokens.typography.scale['2xl']};
font-weight: 700;
color: var(--color-ink-primary);
margin-bottom: ${tokens.spacing[2]};
}

.lifecycle-step__description {
font-size: 15px;
color: var(--color-ink-secondary);
margin-bottom: ${tokens.spacing[5]};
line-height: 1.6;
}

.lifecycle-step__list {
list-style: none;
padding: 0;
margin: 0;
display: flex;
flex-direction: column;
gap: ${tokens.spacing[3]};
}

.lifecycle-step__item {
display: flex;
gap: ${tokens.spacing[3]};
font-size: 14px;
color: var(--color-ink-primary);
line-height: 1.5;
}

.lifecycle-step__item-bullet {
width: 6px;
height: 6px;
border-radius: ${tokens.radii.full};
background: var(--color-accent-primary);
margin-top: 7px;
flex-shrink: 0;
opacity: 0.4;
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


interface LifecycleStep {
    id: string;
    phase: string;
    title: string;
    description: string;
    bulletPoints: string[];
    icon: any;
    accent: string;
}

const LIFECYCLE_STEPS: LifecycleStep[] = [
    {
        id: 'foundation',
        phase: 'Phase 01',
        title: 'The Foundation',
        description: 'Establish your presence and build your tribe before the hunt begins.',
        bulletPoints: [
            'Find your agencies: Always have more than one agency and one recruiter.',
            'Precision Profiles: Fill out profiles completely. Update applications and upload docs early.',
            'The Referral Edge: Quality references set you apart from the crowd.',
            'The Trust Bond: Connect with a recruiter you truly trust; you are in this together.'
        ],
        icon: Users,
        accent: 'var(--color-accent-primary)'
    },
    {
        id: 'acquisition',
        phase: 'Phase 02',
        title: 'The Acquisition',
        description: 'Submission is a volume game backed by deep market intelligence.',
        bulletPoints: [
            'Volume Strategy: Usually takes 7-10 submittals for a single high-quality offer.',
            'Market Intel: Know the facilities and cities you are submitting to.',
            'Risk Management: One bad facility can be the difference between a long career and a short one.'
        ],
        icon: Target,
        accent: 'var(--color-accent-secondary)'
    },
    {
        id: 'readiness',
        phase: 'Phase 03',
        title: 'The Logistics',
        description: 'Secure your fortress and finalize your readiness metrics.',
        bulletPoints: [
            'Compensation Clarity: Know your numbers down to the cent.',
            'Housing Strategy: Consider a hotel for 2 weeks to "scout" before signing a lease.',
            'Rapid Onboarding: Complete onboarding immediately. Never be at the mercy of the labs.'
        ],
        icon: Shield,
        accent: 'var(--color-accent-highlight)'
    },
    {
        id: 'execution',
        phase: 'Phase 04',
        title: 'The Execution',
        description: 'Master the unit dynamics and establish your reputation early.',
        bulletPoints: [
            'Manager Rapport: Get to know your manager and scheduler on day one.',
            'Extreme Flexibility: Being flexible early pays off significantly later.',
            'Social Intelligence: Know your coworkers, but stay far away from the drama.'
        ],
        icon: Award,
        accent: 'var(--color-ink-primary)'
    },
    {
        id: 'continuity',
        phase: 'Phase 05',
        title: 'The Continuity',
        description: 'Maximize your value and secure your next strategic move.',
        bulletPoints: [
            'The 6-Week Pivot: At week 6, connect with your recruiter about extending or moving on.',
            'Negotiation Protocol: Always negotiate the extension; there is always money there.',
            'Legacy Building: Build rapport with managers to establish your "Travel Home Base".'
        ],
        icon: Heart,
        accent: 'var(--color-semantic-success)'
    }
];
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
            className={`${className} ${isVisible ? 'animate-fade-up' : ''} `}
            style={{
                opacity: isVisible ? 1 : 0,
                animationDelay: `${delay} ms`,
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
                <div key={stat.label} className={`stat stagger - ${index + 1} `}>
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
        className={`resource - card resource - card--${resource.variant} `}
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

const LifecycleSection: FC = () => (
    <section id="lifecycle" className="handbook-section">
        <div className="handbook-section__container">
            <AnimatedSection className="handbook-section__header">
                <p className="handbook-section__eyebrow">
                    <Target />
                    Professional Mastery
                </p>
                <h2 className="handbook-section__title">
                    The Traveler Lifecycle
                </h2>
                <p className="handbook-section__description">
                    Success in travel healthcare isn't accidental. It follows a rigorous path of
                    preparation, strategic submittal, and reputation building. Follow this roadmap
                    to maximize your career lifespan.
                </p>
            </AnimatedSection>

            <div className="lifecycle-timeline">
                {LIFECYCLE_STEPS.map((step, index) => (
                    <AnimatedSection
                        key={step.id}
                        className="lifecycle-step"
                        delay={index * 150}
                    >
                        <div className="lifecycle-step__marker" style={{ background: step.accent }}>
                            <step.icon size={20} className="lifecycle-step__icon" />
                            <div className="lifecycle-step__line" />
                        </div>
                        <div className="lifecycle-step__content">
                            <span className="lifecycle-step__phase">{step.phase}</span>
                            <h3 className="lifecycle-step__title">{step.title}</h3>
                            <p className="lifecycle-step__description">{step.description}</p>
                            <ul className="lifecycle-step__list">
                                {step.bulletPoints.map((point, i) => (
                                    <li key={i} className="lifecycle-step__item">
                                        <div className="lifecycle-step__item-bullet" />
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </AnimatedSection>
                ))}
            </div>
        </div>
    </section>
);

const HousingSection: FC = () => (
    <section id="housing" className="handbook-section handbook-section--alt">
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

const CredentialPackSection: FC = () => {
    const [items, setItems] = useState<CredentialItem[]>(() => {
        const saved = localStorage.getItem('traveler_credentials');
        return saved ? JSON.parse(saved) : [];
    });
    const [newItem, setNewItem] = useState<Partial<CredentialItem>>({ type: '' });
    const [isSharing, setIsSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [isRecruiterView, setIsRecruiterView] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Persist to local storage
    useEffect(() => {
        if (!isRecruiterView) {
            localStorage.setItem('traveler_credentials', JSON.stringify(items));
        }
    }, [items, isRecruiterView]);

    // Handle incoming share link
    useEffect(() => {
        const checkShareLink = async () => {
            const hash = window.location.hash;
            if (hash.includes('share=') && hash.includes('key=')) {
                setIsLoading(true);
                setIsRecruiterView(true);
                try {
                    const params = new URLSearchParams(hash.substring(1));
                    const packId = params.get('share');
                    const keyStr = params.get('key');

                    if (!packId || !keyStr) return;

                    const { data, error } = await supabase
                        .from('credential_packs')
                        .select('encrypted_data')
                        .eq('id', packId)
                        .single();

                    if (error || !data) throw new Error('Pack not found or expired');

                    const pkg: EncryptedPackage = JSON.parse(data.encrypted_data);
                    const key = await importKey(keyStr);
                    const decrypted = await decryptData(pkg, key);

                    setItems(JSON.parse(decrypted));
                } catch (err) {
                    console.error('Decryption failed:', err);
                    alert('This credential pack is invalid or has expired (links expire after 7 days).');
                } finally {
                    setIsLoading(false);
                }
            }
        };

        checkShareLink();
    }, []);

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
        setShareUrl(null); // Reset share URL if data changes
    };

    const deleteItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
        setShareUrl(null);
    };

    const generateCloudLink = async () => {
        if (items.length === 0) return;
        setIsSharing(true);
        try {
            const key = await generateKey();
            const keyStr = await exportKey(key);
            const encrypted = await encryptData(JSON.stringify(items), key);

            const { data, error } = await supabase
                .from('credential_packs')
                .insert({
                    encrypted_data: JSON.stringify(encrypted),
                    pack_name: `${items.length} Credentials`
                })
                .select()
                .single();

            if (error) throw error;

            const url = `${window.location.origin}${window.location.pathname}#/share=${data.id}&key=${keyStr}`;
            setShareUrl(url);
        } catch (err) {
            console.error('Cloud share failed:', err);
            alert('Failed to generate secure link. Please try again.');
        } finally {
            setIsSharing(false);
        }
    };

    if (isLoading) {
        return (
            <section className="handbook-section handbook-section--alt">
                <div className="handbook-section__container" style={{ textAlign: 'center', padding: '100px 0' }}>
                    <div className="animate-pulse">
                        <Lock size={48} style={{ margin: '0 auto 24px', opacity: 0.2 }} />
                        <h2 className="handbook-section__title">Decrypting Secure Pack...</h2>
                        <p className="handbook-section__description">Verifying zero-knowledge integrity...</p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section id="credentials" className="handbook-section handbook-section--alt">
            <div className="handbook-section__container">
                <AnimatedSection className="handbook-section__header">
                    <p className="handbook-section__eyebrow">
                        <ShieldCheck />
                        {isRecruiterView ? 'Recruiter Access' : 'Compliance & Readiness'}
                    </p>
                    <h2 className="handbook-section__title">
                        {isRecruiterView ? 'Shared Credential Pack' : 'Credential Snapshot'}
                    </h2>
                    <p className="handbook-section__description">
                        {isRecruiterView
                            ? 'You are viewing a secure, end-to-end encrypted credential summary. This data was decrypted locally in your browser and is not stored on our servers in plaintext.'
                            : 'Organize your professional identity. Track expirations locally and generate a secure, encrypted "Share Pack" for your recruiter. Zero-knowledge architecture ensures even we can\'t see your data.'
                        }
                    </p>
                </AnimatedSection>

                <div className="credential-tool">
                    {!isRecruiterView && (
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
                    )}

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
                                    {!isRecruiterView && (
                                        <div className="credential-card__actions">
                                            <button className="btn btn--ghost btn--sm" onClick={() => deleteItem(item.id)}>
                                                <Trash2 size={12} /> Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="tool-actions">
                        {!isRecruiterView ? (
                            <>
                                <button
                                    className="btn btn--accent"
                                    onClick={generateCloudLink}
                                    disabled={items.length === 0 || isSharing}
                                >
                                    <Share2 size={16} /> {isSharing ? 'Encrypting...' : 'Generate Share Link'}
                                </button>
                                <button className="btn btn--ghost" onClick={() => {
                                    const text = items.map(i => `${i.type}: ${getStatus(i.expirationDate).toUpperCase()}`).join('\n');
                                    navigator.clipboard.writeText(text);
                                    alert('Summary copied!');
                                }}>
                                    <Copy size={16} /> Copy Text Summary
                                </button>
                            </>
                        ) : (
                            <div className="cloud-status">
                                <Globe size={16} />
                                <span>This is a temporary, encrypted view. Links expire after 7 days.</span>
                                <button className="btn btn--primary btn--sm" onClick={() => {
                                    window.location.hash = '';
                                    window.location.reload();
                                }} style={{ marginLeft: 'auto' }}>
                                    Create My Own Pack
                                </button>
                            </div>
                        )}
                    </div>

                    {shareUrl && (
                        <div className="cloud-link-box animate-fade-up">
                            <span className="share-url">{shareUrl}</span>
                            <button className="btn btn--primary btn--sm" onClick={() => {
                                navigator.clipboard.writeText(shareUrl);
                                alert('Encrypted link copied to clipboard!');
                            }}>
                                <Copy size={12} /> Copy
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

const ResearchChatSection: FC = () => {
    const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string; citations?: any[] }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userInput = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userInput }]);
        setIsLoading(true);

        try {
            const result = await AIService.sendResearchQuery(userInput, history);

            const candidate = result?.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text || 'I couldn\'t find an answer. Please try rephrasing.';
            const groundingMeta = candidate?.groundingMetadata;
            const citations = groundingMeta?.groundingChunks?.map((c: any) => ({
                title: c.web?.title || 'Source',
                uri: c.web?.uri || '#'
            })) || [];

            // Update history for context
            setHistory(prev => [
                ...prev,
                { role: 'user', parts: [{ text: userInput }] },
                { role: 'model', parts: [{ text }] }
            ]);

            setMessages(prev => [...prev, { role: 'model', text, citations }]);
        } catch (err) {
            console.error('Research chat error:', err);
            setMessages(prev => [...prev, { role: 'model', text: 'Connection failed. Please try again.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <section id="research" className="handbook-section">
            <div className="handbook-section__container">
                <AnimatedSection className="handbook-section__header">
                    <p className="handbook-section__eyebrow">
                        <Search />
                        Licensing & Facility Intel
                    </p>
                    <h2 className="handbook-section__title">
                        Ask the Research AI
                    </h2>
                    <p className="handbook-section__description">
                        Get instant, cited answers about state licensing timelines, compact states,
                        facility details, and market trends. Powered by grounded web search.
                    </p>
                </AnimatedSection>

                <div className="research-chat">
                    <div ref={scrollRef} className="research-chat__messages">
                        {messages.length === 0 && (
                            <div className="research-chat__empty">
                                <MessageCircle size={40} style={{ opacity: 0.2, marginBottom: '16px' }} />
                                <p>Ask a question to get started</p>
                                <div className="research-chat__suggestions">
                                    <button onClick={() => setInput('How long does it take to get a California RN license?')}>
                                        CA license timeline?
                                    </button>
                                    <button onClick={() => setInput('What are the compact nursing states?')}>
                                        NLC compact states?
                                    </button>
                                    <button onClick={() => setInput('Tell me about Cedars-Sinai Medical Center')}>
                                        Cedars-Sinai info?
                                    </button>
                                </div>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`research-chat__message research-chat__message--${msg.role}`}>
                                <div className="research-chat__bubble">
                                    <p>{msg.text}</p>
                                    {msg.citations && msg.citations.length > 0 && (
                                        <div className="research-chat__citations">
                                            <span className="research-chat__citations-label">Sources:</span>
                                            {msg.citations.map((c, j) => (
                                                <a key={j} href={c.uri} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink size={10} /> {c.title}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="research-chat__message research-chat__message--model">
                                <div className="research-chat__bubble research-chat__bubble--loading">
                                    <span className="research-chat__dot" />
                                    <span className="research-chat__dot" />
                                    <span className="research-chat__dot" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="research-chat__input-area">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about licensing, facilities, or market trends..."
                            className="research-chat__input"
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="research-chat__send"
                        >
                            <Send size={18} />
                        </button>
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
            <ResearchChatSection />
            <LifecycleSection />
            <HousingSection />
            <MoneySection />
            <ChecklistSection />
            <CredentialPackSection />
            <Footer />
        </div>
    );
}
