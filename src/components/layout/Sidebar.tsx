// ============================================================================
// src/components/Sidebar.tsx
// JONY IVE CLARITY: Every element earns its place
// ============================================================================

import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ROUTE_CONFIG } from '../../config/routes';
import { CATEGORIES } from '../../config/constants';

// ============================================================================
// DESIGN SYSTEM - Single source of truth
// ============================================================================

const DESIGN = {
  space: {
    xs: '0.5rem',    // 8px
    sm: '0.75rem',   // 12px
    md: '1rem',      // 16px
    lg: '1.25rem',   // 20px
  },
  text: {
    label: 'text-[11px] font-semibold uppercase tracking-wider text-slate-400',
    nav: 'text-[13px] font-medium text-slate-700',
    navActive: 'text-[13px] font-semibold text-white',
    brand: 'text-lg font-semibold text-slate-900 tracking-tight',
    action: 'text-[11px] font-medium text-slate-600',
  },
  colors: {
    primary: 'slate-900',
    primaryHover: 'slate-100',
    border: 'slate-200/70',
    background: 'white',
    accent: 'blue-600',
  },
  elevation: {
    nav: 'shadow-[0_1px_1px_rgba(0,0,0,0.11),0_2px_4px_rgba(0,0,0,0.09)]',
    card: 'shadow-sm',
  },
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    full: 'rounded-full',
  },
  transition: 'transition-all duration-150 ease-out',
};

// ============================================================================
// BRAND ICON - Clear visual identity
// ============================================================================

const BrandIcon: React.FC = () => (
  <div
    className={`relative w-9 h-9 ${DESIGN.radius.md} bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center ${DESIGN.elevation.nav}`}
    role="img"
    aria-label="Pipeline logo"
  >
    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-70" />
    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    <span
      className="relative text-white font-bold text-base tracking-tight z-10"
      style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)' }}
    >
      P
    </span>
  </div>
);

// ============================================================================
// ACTION BAR - Primary quick actions
// ============================================================================

interface ActionButtonProps {
  id: string;
  title: string;
  href: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ id, title, href }) => (
  <a
    href={href}
    target={href.startsWith('http') ? '_blank' : '_self'}
    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
    className={`
      flex items-center justify-center w-12 h-12 ${DESIGN.radius.md} ${DESIGN.transition}
      bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 active:scale-[0.95]
      font-semibold text-base
    `}
    aria-label={title}
    title={title}
  >
    {id}
  </a>
);

const ActionBar: React.FC = () => (
  <div className="px-3 py-3 border-b border-slate-200/70" role="toolbar" aria-label="Quick actions">
    <div className="flex items-center gap-2">
      <ActionButton id="T" title="Open Teams" href="msteams:" />
      <ActionButton id="O" title="Open Outlook Calendar" href="https://outlook.office.com/calendar/" />
      <ActionButton id="R" title="Open RingCentral" href="https://app.ringcentral.com" />
    </div>
  </div>
);

// ============================================================================
// QUICK LINKS - External resources
// ============================================================================

interface QuickLinkProps {
  label: string;
  href: string;
}

const QuickLink: React.FC<QuickLinkProps> = ({ label, href }) => {
  const isExternal = href.startsWith('http');

  return (
    <a
      href={href}
      target={isExternal ? '_blank' : '_self'}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className={`
        group flex items-center justify-between px-3 py-2 ${DESIGN.radius.sm} 
        text-slate-700 hover:bg-slate-50 hover:text-slate-900 ${DESIGN.transition}
        active:scale-[0.98]
      `}
      aria-label={label}
    >
      <span className="text-[13px] font-medium">{label}</span>
      <ChevronRight
        size={15}
        strokeWidth={2}
        className="text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-slate-400 transition-all -translate-x-2 group-hover:translate-x-0"
      />
    </a>
  );
};

const QUICK_LINKS_DATA = [
  { label: 'Tickets', href: 'https://nova.ayahealthcare.com/#/travelx/tickets' },
  { label: 'Search', href: 'https://nova.ayahealthcare.com/#/recruiting/search-all-candidates' },
  { label: 'Live', href: 'https://nova.ayahealthcare.com/#/recruiting/live-nurses-new' },
  { label: 'Deals', href: 'https://nova.ayahealthcare.com/#/recruiting/deals' },
  { label: 'Jobs', href: 'https://nova.ayahealthcare.com/#/recruiting/jobs' },
] as const;

const QuickLinks: React.FC = () => (
  <div className="px-2" role="navigation" aria-label="Quick links">
    <div className="px-3 mb-2">
      <h3 className={DESIGN.text.label}>Quick Links</h3>
    </div>
    <nav className="space-y-0.5">
      {QUICK_LINKS_DATA.map((link) => (
        <QuickLink key={link.label} label={link.label} href={link.href} />
      ))}
    </nav>
  </div>
);

// ============================================================================
// USER PROFILE - Identity and status
// ============================================================================

const UserProfile: React.FC = () => (
  <div className="px-3">
    <button
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 ${DESIGN.radius.md}
        hover:bg-slate-50 ${DESIGN.transition} active:scale-[0.98]
      `}
      aria-label="User profile"
    >
      <div className={`w-8 h-8 ${DESIGN.radius.full} bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm ${DESIGN.elevation.card}`}>
        KF
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 truncate">
          Kofi Farkye
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          Senior Recruiter
        </div>
      </div>
    </button>
  </div>
);

// ============================================================================
// NAVIGATION LINK - Single purpose, clear state
// ============================================================================

interface NavItemProps {
  path: string;
  label: string;
  delay: number;
}

const NavItem: React.FC<NavItemProps> = ({ path, label, delay }) => (
  <NavLink
    to={path}
    className={({ isActive }) =>
      `group relative w-full flex items-center justify-between px-3 py-2.5 ${DESIGN.radius.md} text-left overflow-hidden ${DESIGN.transition} ${isActive
        ? `bg-${DESIGN.colors.primary} text-white`
        : `${DESIGN.text.nav} hover:bg-${DESIGN.colors.primaryHover} hover:text-slate-900 active:scale-[0.98]`
      }`
    }
    style={{ animationDelay: `${delay}ms` }}
    aria-label={label}
  >
    {({ isActive }) => (
      <>
        {/* Subtle gradient overlay on active state */}
        {isActive && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50" />
        )}

        {/* Label */}
        <span className={`relative z-10 ${isActive ? DESIGN.text.navActive : DESIGN.text.nav}`}>
          {label}
        </span>

        {/* Direction indicator - appears on hover or when active */}
        <div
          className={`relative z-10 ${DESIGN.transition} ${isActive
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0'
            }`}
        >
          <ChevronRight size={15} strokeWidth={2.5} />
        </div>
      </>
    )}
  </NavLink>
);

// ============================================================================
// NAVIGATION SECTION - Grouped by purpose
// ============================================================================

interface NavSectionProps {
  category: string;
  index: number;
}

const NavSection: React.FC<NavSectionProps> = ({ category, index }) => {
  const routes = ROUTE_CONFIG.filter(route => route.category === category);

  if (routes.length === 0) return null;

  return (
    <section
      className="mb-6 animate-fadeInUp"
      style={{ animationDelay: `${index * 50}ms` }}
      aria-labelledby={`category-${category.replace(/\s+/g, '-').toLowerCase()}`}
    >
      {/* Section Header */}
      <div className="px-5 mb-2">
        <h2
          id={`category-${category.replace(/\s+/g, '-').toLowerCase()}`}
          className={DESIGN.text.label}
        >
          {category}
        </h2>
      </div>

      {/* Navigation Links */}
      <nav className="space-y-1 px-2">
        {routes.map((route, viewIndex) => (
          <NavItem
            key={route.path}
            path={route.path}
            label={route.label}
            delay={index * 50 + viewIndex * 30}
          />
        ))}
      </nav>
    </section>
  );
};

// ============================================================================
// SIDEBAR - Main navigation container
// ============================================================================

export function Sidebar(): JSX.Element {
  return (
    <aside
      className={`w-72 bg-${DESIGN.colors.background} border-r border-${DESIGN.colors.border} flex flex-col shrink-0 animate-slideInLeft`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Brand Header */}
      <header className={`h-16 flex items-center px-5 border-b border-${DESIGN.colors.border}`}>
        <div className="flex items-center gap-2.5">
          <BrandIcon />
          <span className={DESIGN.text.brand}>Pipeline</span>
        </div>
      </header>

      {/* Action Bar - Quick actions */}
      <ActionBar />

      {/* Navigation Sections - Scrollable content */}
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar min-h-0">
        {CATEGORIES.map((category, index) => (
          <NavSection key={category} category={category} index={index} />
        ))}
      </div>

      {/* Footer - Quick links and user profile - Always visible */}
      <footer className="shrink-0 border-t border-slate-200/70 py-3 space-y-4 bg-white">
        <QuickLinks />
        <UserProfile />
      </footer>
    </aside>
  );
}

// ============================================================================
// ANIMATIONS - Defined in animations.css
// ============================================================================
/*
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-slideInLeft {
  animation: slideInLeft 0.2s ease-out;
}

.animate-fadeInUp {
  animation: fadeInUp 0.15s ease-out forwards;
}

.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}
*/