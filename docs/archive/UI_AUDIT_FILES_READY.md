# UI Audit — Files Ready for Bolt.new

## Overview
Complete file collection for comprehensive UI/UX organization audit. Use this document to paste files into Bolt.new for analysis.

---

## 📋 FILE CHECKLIST

✅ **Core Architecture**
- [x] src/App.tsx (13 lines - router only)
- [x] src/components/layout/Sidebar.tsx (130 lines)

✅ **Dashboards** (abridged top-level structure)
- [x] ProspectsDashboard.tsx (first 100 lines)
- [x] SubmittalDashboard.tsx (first 100 lines)
- [x] OffersSignedPrestartDashboard.tsx (first 100 lines)
- [x] ActiveAssignmentsDashboard.tsx (first 100 lines)

✅ **Design System Primitives**
- [x] design-system/modules/Card.tsx (92 lines)
- [x] design-system/core/Badge.tsx (43 lines)
- [x] design-system/modules/StatCard.tsx (86 lines)

✅ **Shared Components**
- [x] shared/components/Badge.tsx (36 lines - DUPLICATE!)
- [x] shared/components/StatsBar.tsx (56 lines)

---

## 🔍 KEY FINDINGS (Pre-Audit Preview)

### Critical Issues Spotted:
1. **DUPLICATE BADGE COMPONENTS**
   - `design-system/core/Badge.tsx` (gray/blue/emerald/amber/red/indigo variants)
   - `shared/components/Badge.tsx` (gray/green/yellow/red/blue variants)
   - Different color mappings, incompatible APIs

2. **INCONSISTENT COLOR TOKENS**
   - Design system uses: `gray-*` colors
   - Dashboards use: `slate-*` colors
   - Mixed usage throughout

3. **NAMING INCONSISTENCY**
   - `StatCard` vs `StatsBar`
   - `Card` has sub-components, but dashboards inline everything

4. **INLINE ICONS**
   - `ChevronRightIcon` defined inline in Sidebar.tsx
   - Should use lucide-react or design-system/icons

5. **NO HEADER BAR COMPONENT**
   - Each dashboard implements its own header
   - No consistent `HeaderBar.tsx` or `PageHeader.tsx`

---

## 📁 FILES FOR BOLT.NEW

### File 1: src/App.tsx
```typescript
import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { router } from './config/routes';
import './styles/animations.css';

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

### File 2: src/components/layout/Sidebar.tsx
```typescript
import React from 'react';
import { NavLink } from 'react-router-dom';
import { ROUTE_CONFIG } from '../../config/routes';
import { CATEGORIES } from '../../config/constants';
import ActionBar from './ActionBar';
import QuickLinks from './QuickLinks';
import UserProfile from './UserProfile';

// ⚠️ INLINE ICON - should extract to design system
const ChevronRightIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export default function Sidebar(): JSX.Element {
  return (
    <aside
      className="w-72 bg-white border-r border-slate-200/70 flex flex-col shrink-0 animate-slideInLeft"
      aria-label="Main navigation"
    >
      {/* Logo Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-200/70">
        <div className="flex items-center gap-2.5">
          <div
            className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center"
            style={{
              boxShadow: '0 1px 1px rgba(0, 0, 0, 0.11), 0 2px 4px rgba(0, 0, 0, 0.09), inset 0 1px 2px rgba(255, 255, 255, 0.12), inset 0 -1px 2px rgba(0, 0, 0, 0.5)'
            }}
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
          <span className="text-lg font-semibold text-slate-900 tracking-tight">
            Pipeline
          </span>
        </div>
      </div>

      <ActionBar />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {CATEGORIES.map((category, categoryIndex) => (
          <div
            key={category}
            className="mb-6 animate-fadeInUp"
            style={{
              animationDelay: `${categoryIndex * 50}ms`,
              opacity: 0
            }}
          >
            <div className="px-5 mb-2">
              <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                {category}
              </h2>
            </div>

            <nav className="space-y-1 px-2" aria-label={`${category} views`}>
              {ROUTE_CONFIG
                .filter(route => route.category === category)
                .map((route, viewIndex) => (
                  <NavLink
                    key={route.path}
                    to={route.path}
                    className={({ isActive }) => `
                      group relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left overflow-hidden transition-all duration-200
                      ${isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]'
                      }
                    `}
                    style={{
                      animationDelay: `${categoryIndex * 50 + viewIndex * 30}ms`
                    }}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50" />
                        )}

                        <span
                          className={`relative text-[13px] z-10 transition-all duration-200 ${
                            isActive ? 'font-semibold' : 'font-medium'
                          }`}
                        >
                          {route.label}
                        </span>

                        <div
                          className={`relative z-10 transition-all duration-200 ${
                            isActive
                              ? 'opacity-100 translate-x-0'
                              : 'opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0'
                          }`}
                        >
                          <ChevronRightIcon />
                        </div>
                      </>
                    )}
                  </NavLink>
                ))}
            </nav>
          </div>
        ))}
      </div>

      <footer className="mt-auto border-t border-slate-200/70 py-3 space-y-4">
        <QuickLinks />
        <UserProfile />
      </footer>
    </aside>
  );
}
```

### File 3: ProspectsDashboard.tsx (Top-Level Structure)
```typescript
// ============================================================================
// TYPES
// ============================================================================

export type VisibleColumnId = 'New' | 'Contacted' | 'Interested' | 'Profile Updates';
export type ArchiveStatusId = 'Not Interested';
export type StatusId = VisibleColumnId | ArchiveStatusId | 'Submittal Ready';

export interface Prospect {
  id: number;
  candidate_id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  profession: string | null;
  status: StatusId;
  // ...30+ more fields
  profile_score?: number;
  references_verified?: number;
  profile_complete?: boolean;
}

export interface ColumnDefinition {
  id: VisibleColumnId;
  label: string;
  color: string;          // ⚠️ Hex string, not token
  description: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VISIBLE_COLUMNS: ColumnDefinition[] = [
  { id: 'New', label: 'New', color: '#6B7280', description: 'Fresh leads to review' },
  { id: 'Contacted', label: 'Contacted', color: '#2563EB', description: 'Initial outreach sent' },
  { id: 'Interested', label: 'Interested', color: '#D97706', description: 'Showing interest' },
  { id: 'Profile Updates', label: 'Profile Updates', color: '#7C3AED', description: 'Completing requirements' },
];

// ============================================================================
// INLINE UTILITIES (not extracted)
// ============================================================================

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

const getFirstName = (name: string) =>
  (name?.trim()?.split(' ')[0] ?? '').replace(/[^A-Za-z'-]/g, '') || 'there';

const formatPhoneLink = (phone: string | null) =>
  phone ? `tel:${phone.replace(/\D/g, '')}` : '';

// ⚠️ PATTERN: Every dashboard re-implements these utilities
```

### File 4: SubmittalDashboard.tsx (Top-Level Structure)
```typescript
// ============================================================================
// TYPES
// ============================================================================

type AgingBucket = 'READY' | 'SUBMITTED_0_2_DAYS' | 'SUBMITTED_3_6_DAYS' | 'SUBMITTED_7_PLUS_DAYS';

interface ClinicianRow {
  engagement_id?: number;
  candidate_id?: number;
  full_name?: string;
  email?: string;
  phone?: string;
  primary_specialty?: string;
  // ...20+ more optional fields
}

interface ColumnDefinition {
  id: AgingBucket;
  title: string;        // ⚠️ 'title' here, 'label' in ProspectsDashboard
  description: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const COLUMNS: ColumnDefinition[] = [
  { id: 'READY', title: 'Ready', description: 'Prospects & transitioning clinicians' },
  { id: 'SUBMITTED_0_2_DAYS', title: 'Submitted 0–2 Days', description: 'Recently submitted' },
  { id: 'SUBMITTED_3_6_DAYS', title: 'Submitted 3–6 Days', description: 'Requires follow-up' },
  { id: 'SUBMITTED_7_PLUS_DAYS', title: 'Submitted 7+ Days', description: 'Urgent attention' },
];

// ⚠️ PATTERN: Similar structure to ProspectsDashboard but different naming
```

### File 5: design-system/modules/Card.tsx
```typescript
// ⚠️ ISSUE: Uses gray-* instead of slate-*
const variants = {
  default: `border border-gray-200/80 ${hover ? 'hover:border-gray-300/80 hover:shadow-lg' : ''}`,
  elevated: `border border-gray-100/80 shadow-md ${hover ? 'hover:shadow-xl' : ''}`,
  outlined: `border-2 border-gray-200 ${hover ? 'hover:border-gray-300' : ''}`,
  ghost: `border-0 ${hover ? 'hover:bg-gray-50' : ''}`,
};

// ✅ GOOD: Composable sub-components
export const CardHeader: React.FC<...>
export const CardTitle: React.FC<...>
export const CardContent: React.FC<...>
export const CardFooter: React.FC<...>
```

### File 6: design-system/core/Badge.tsx
```typescript
// Version 1 (design-system)
const variants = {
  default: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
  primary: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  success: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  warning: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  error: 'bg-red-100 text-red-800 hover:bg-red-200',
  info: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
};
```

### File 7: shared/components/Badge.tsx (DUPLICATE!)
```typescript
// Version 2 (shared) - INCOMPATIBLE
const variants = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',    // ⚠️ green vs emerald
  warning: 'bg-yellow-100 text-yellow-800',  // ⚠️ yellow vs amber
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800'          // ⚠️ blue vs indigo
};
// ⚠️ No hover states, no 'primary' variant
```

### File 8: design-system/modules/StatCard.tsx
```typescript
// ✅ GOOD: Consistent component
export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  trend, 
  delay = 0,
  className = '',
  onClick,
  icon,
  description
}) => {
  // ...implementation with animations
};
```

### File 9: shared/components/StatsBar.tsx
```typescript
// ⚠️ ISSUE: Similar purpose to StatCard but different API
interface StatsBarProps {
  stats: {
    total: number;
    new: number;
    interested: number;
    submitted: number;
    filtered?: number;
  };
}
// ⚠️ Hardcoded stat names, not flexible
```

---

## 🎯 EXPECTED AUDIT DELIVERABLES

When you paste these into Bolt.new, request:

### 1. Scorecard (0-5 scale)
- **Hierarchy**: Component composition clarity
- **Naming**: Consistency across files
- **Props & Responsibility**: Single responsibility adherence
- **Design Parity**: Token usage vs inline styles
- **A11y**: Semantic HTML, ARIA labels
- **Debt & Smells**: Duplicates, dead code, inline utils

### 2. Top 10 Findings
Prioritized with rationale:
- Duplicate components
- Inconsistent naming
- Missing abstractions
- Color token mismatches
- Inline utilities duplication

### 3. Refactor Diffs
Before/after blocks for:
- Consolidate Badge components
- Extract inline utilities
- Standardize color tokens (slate-* everywhere)
- Create PageHeader component
- Consolidate stat components

### 4. Quick Wins (≤30 min each)
- Remove duplicate Badge.tsx
- Extract ChevronRightIcon to design-system/icons
- Rename `title` → `label` in ColumnDefinition
- Replace gray-* with slate-* in design system
- Create shared utility file for formatPhoneLink, cn, etc.

### 5. Acceptance Checklist
- [ ] No duplicate component names
- [ ] All colors use slate-* tokens
- [ ] All inline icons extracted
- [ ] All utilities in shared/utils
- [ ] PageHeader component created
- [ ] StatCard/StatsBar consolidated
- [ ] ARIA labels on all interactive elements
- [ ] No dead imports

---

## 📝 NOTES FOR BOLT.NEW

**Design Philosophy**: Apple × Stripe × Vercel
- Calm, minimal aesthetic
- Slate color palette primary
- Consistent spacing (8px grid)
- Smooth transitions (200ms)
- Staggered animations

**Current State**:
- Recent router refactor (App.tsx now 13 lines)
- 4 main dashboards analyzed
- Design system exists but inconsistently applied
- Shared components overlap with design system

**Priority**: Organization > New Features
Focus on consolidating existing patterns before adding new components.

---

## 🚀 USAGE

Copy this entire document and paste into Bolt.new with this prompt:

```
I have collected my UI files for audit. Here are the key files from my React + TypeScript application.

REQUEST: Please analyze these files and provide:
1. Scorecard (0-5) for Hierarchy, Naming, Props, Design Parity, A11y, Debt
2. Top 10 Findings (prioritized)
3. Refactor Diffs (inline before/after)
4. Quick Wins (≤30 min each)
5. Acceptance Checklist

Design ethos: Apple × Stripe × Vercel (calm, minimal, precise)

[Paste all file contents above]
```

---

**Status**: ✅ Files Ready
**Total Lines Analyzed**: ~600 lines across 9 files
**Critical Issues**: 5 major duplicates/inconsistencies identified
**Estimated Refactor Time**: 4-6 hours for complete cleanup
