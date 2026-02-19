# Healthcare Staffing Pipeline — Full Codebase Audit

**Date:** 2026-02-19
**Scope:** Every file, every integration, every gap

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Supabase Integration Audit](#2-supabase-integration-audit)
3. [Gemini Integration Audit](#3-gemini-integration-audit)
4. [File Tree with Status & Purpose](#4-file-tree-with-status--purpose)
5. [Critical Gap Analysis](#5-critical-gap-analysis--shortest-path)

---

## 1. Architecture Overview

### Framework

**Next.js 15 (App Router)** — migrated from a Vite + React Router SPA. Both routing systems still exist in the codebase.

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (`next@^15.0.0`) with App Router |
| UI | React 18, Tailwind CSS 3, Framer Motion, Lucide icons |
| State | Zustand, TanStack Query v5, React Context |
| AI SDK | Vercel AI SDK v6 (`ai@^6.0.48`), `@ai-sdk/google@^3.0.13`, `@google/genai@^1.21.0` |
| Database | Supabase (PostgreSQL + Edge Functions + Auth + Storage) |
| Auth | Supabase Auth (email/password, JWT) |
| Hosting | **Vercel** (`vercel.json` present, `framework: "nextjs"`, max 60s API duration) |
| Package Manager | npm (lockfile present) |

### Entry Points

| Entry Point | Purpose | Status |
|---|---|---|
| `app/layout.tsx` | **Next.js root layout** — wraps everything in `<Providers>` (QueryClient, AuthProvider, LayoutProvider) | DEPLOYED & WORKING |
| `app/page.tsx` | Root `/` — redirects to `/prospects` | DEPLOYED & WORKING |
| `app/(dashboard)/layout.tsx` | Dashboard shell — Sidebar + animated main content + `<WeissachV2 />` (AI chat panel) | DEPLOYED & WORKING |
| `app/api/chat/command-center/route.ts` | **AI chat API endpoint** — the primary chat route handler | DEPLOYED & WORKING |
| `src/main.tsx` | **Legacy Vite SPA entry** — `createRoot`, React Router. NOT used by Next.js | EXISTS BUT NOT WIRED |
| `src/App.tsx` | **Legacy SPA root** — `RouterProvider` from react-router-dom | EXISTS BUT NOT WIRED |
| `api/chat/route.ts` | **Orphan route file** outside `app/` directory — Next.js won't serve it | EXISTS BUT NOT WIRED |

### Routing (Dual System)

**Active (Next.js App Router):**
- `app/(dashboard)/prospects/page.tsx` → ProspectsDashboard
- `app/(dashboard)/active/page.tsx` → ActiveAssignmentsDashboard
- `app/(dashboard)/submittals/page.tsx` → SubmittalDashboard
- `app/(dashboard)/exits/page.tsx` → ExitsDashboard
- `app/(dashboard)/follow-ups/page.tsx` → FollowUpDashboard
- `app/(dashboard)/travel/page.tsx` → PriorityDashboard
- `app/(dashboard)/local/page.tsx` → LocalJobsDashboard (placeholder)
- `app/(dashboard)/admin/page.tsx` → AdminDashboard (placeholder)
- `app/guide/page.tsx` → TravelerHandbook

**Legacy (exists but not wired to production):**
- `src/config/routes.tsx` — Full `createBrowserRouter` config with lazy-loaded components
- `src/config/routes-next.ts` — Next.js-compatible route metadata (used by Sidebar)

### Workspace Modes

The `LayoutContext` provides three modes: `floating` (default), `split`, `full` — controlling how the AI chat panel coexists with the dashboard.

---

## 2. Supabase Integration Audit

### Client Initialization

| File | Type | Status |
|---|---|---|
| `src/shared/services/supabase.ts` | **Browser client (singleton)** — uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Falls back to placeholder URL during SSG. | DEPLOYED & WORKING |
| `src/lib/supabase.ts` | Re-export of above (`export { supabase }`) | DEPLOYED & WORKING |
| `src/lib/supabase/browser.ts` | Factory function `createBrowserSupabaseClient()` with env validation | EXISTS BUT NOT WIRED (nothing imports it) |
| `src/lib/supabase/server.ts` | Server-side client with cookie-based SSR auth (`@supabase/ssr`) | EXISTS BUT NOT WIRED (no server components use it yet) |
| `src/lib/supabase/assignments.ts` | TanStack Query hooks for active assignments: `useAssignments`, `useUpdateExtensionStage`, etc. | DEPLOYED & WORKING |
| `app/api/chat/command-center/route.ts` | Creates its own `createClient()` with `SUPABASE_SERVICE_ROLE_KEY` per-request | DEPLOYED & WORKING |

### Edge Functions

| Function | AI Model | What It Does | Status |
|---|---|---|---|
| `ai-chat` | Gemini 3 Flash / GPT-4o fallback | General AI chat with provider failover | DEPLOYED (Supabase) — called by legacy `AIService.sendCommand` path, but the main Next.js app uses the Vercel route instead |
| `chat-command-center` | Gemini 3 Pro → Flash fallback | Full tool-calling chat (18 tools: search_prospects, draft_email, calculate_pay, etc.) | DEPLOYED (Supabase) — called by `AIService.sendCommand()` in browser |
| `extension-request-extraction` | Gemini 3 Flash | Extract extension request data from Nova screenshots | DEPLOYED & WORKING |
| `extract-pay-package` | Gemini 3 Pro | Extract pay package from margin calculator screenshots | DEPLOYED & WORKING |
| `extract-receipt` | Gemini 3 Flash | Extract cert/license receipt data from images | DEPLOYED & WORKING |
| `generate-email-template` | Gemini 3 Flash | Screenshot → extracted data → merged with DB template → email draft | DEPLOYED & WORKING |
| `generate-tailored-reply` | Gemini 3 Flash | Generate a "Kofi Farkye" persona reply to candidate messages | DEPLOYED & WORKING |
| `notify-due-followups` | None (pure DB) | Queries overdue follow-ups, generates HTML email digest | DEPLOYED — but email sending is a `console.log` stub (no SendGrid/Resend integrated) |
| `parse-nova-text` | None (regex) | Parse pasted Nova text into structured assignment data | DEPLOYED & WORKING |
| `process-nova-references` | Gemini 3 Flash | Extract references from Nova screenshots | DEPLOYED & WORKING |
| `process-outreach` | Gemini 3 Flash | Generate recruitment emails from job context | DEPLOYED & WORKING |
| `process-screenshot` | Gemini 3 Flash | General screenshot → structured data extraction | DEPLOYED & WORKING |
| `research-chat` | Gemini 3 Flash | Google Search grounded research assistant ("Stealth Intelligence") | DEPLOYED & WORKING |
| `send_email` | None | **STUB** — logs email params, returns success. No email provider wired. | EXISTS BUT NOT WIRED (no actual sending) |

### RPC Functions (from migrations)

| RPC Function | Purpose | Status |
|---|---|---|
| `get_follow_ups_by_recruiter(uuid)` | Fetch follow-ups for a specific recruiter | DEPLOYED |
| `complete_follow_up(uuid)` | Mark follow-up as done (uses `auth.uid()`) | DEPLOYED |
| `reschedule_follow_up(uuid, date)` | Change follow-up date | DEPLOYED |
| `create_follow_up(...)` | Create new follow-up for a candidate | DEPLOYED |
| `calculate_pay_package(...)` | Server-side pay package calculation with state minimums & GSA stipends | DEPLOYED |
| `bulk_update_extension_stage(bigint[], text)` | Batch update extension stages on engagements | DEPLOYED |
| `toggle_assignment_flag(bigint, text, boolean)` | Toggle `is_looking`/`is_exiting` flags | DEPLOYED |
| `set_extension_dates(bigint, date, date)` | Update start/end dates, supports both engagements and travel_candidates | DEPLOYED |

### Database Schema (Tables from migrations)

| Table | Purpose | Status |
|---|---|---|
| `prospects` | Core candidate/prospect records | DEPLOYED & POPULATED |
| `facilities` | Healthcare facility directory | DEPLOYED |
| `jobs` | Job openings linked to facilities | DEPLOYED |
| `engagements` | Candidate-job assignments (Active, Submitted, etc.) | DEPLOYED & POPULATED |
| `actions` | Audit log of actions per engagement | DEPLOYED |
| `exits` | Post-assignment exit records | DEPLOYED |
| `follow_ups` | Scheduled follow-up reminders | DEPLOYED |
| `interested_clicks` | Imported candidate interest signals | DEPLOYED |
| `pay_packages` | Stored pay package breakdowns | DEPLOYED |
| `knowledge_base` | RAG content (benefits, FAQ, policies) | DEPLOYED — seeded with 6 Aya benefits entries |
| `email_templates` | Template definitions for outreach | DEPLOYED |
| `chat_history` | Persistent conversation storage | DEPLOYED |
| `ai_audit_logs` | AI call logging (latency, tokens, errors) | DEPLOYED |
| `candidate_notes` | Per-candidate note log | DEPLOYED |
| `state_board_links` | State board verification URLs | DEPLOYED |
| `travel_candidates` | Imported travel candidate records (synthetic IDs) | DEPLOYED |
| `active_assignments` | Denormalized active assignment cache | DEPLOYED |
| `cold_outreach_blasts` | Batch outreach campaign records | DEPLOYED |
| `credential_packs` | Credential document tracking | DEPLOYED |
| `certifications` | Candidate certifications | DEPLOYED |
| `negotiations` | Pay negotiation tracking | DEPLOYED |
| `communication_templates` | Communication template definitions | DEPLOYED |
| `email_template_definitions` | Base email template storage | DEPLOYED |
| `generated_email_templates` | AI-generated email outputs | DEPLOYED |

### Database Views

| View | Purpose | Status |
|---|---|---|
| `follow_ups_dashboard` | Join follow_ups + prospects + auth.users | DEPLOYED |
| `priority_interested_clicks` | Interested clicks with recency scoring | DEPLOYED |
| `submittals_dashboard` | UNION of prospect submittals + active engagement extensions | DEPLOYED |
| `prospects_dashboard` | Standardized prospect view | DEPLOYED |
| `active_assignments_dashboard` | Active assignments with days_to_end bucketing | DEPLOYED |

---

## 3. Gemini Integration Audit

### How Gemini Is Called

There are **two parallel AI chat paths**:

#### Path A: Vercel API Route (Primary — Next.js)

**File:** `app/api/chat/command-center/route.ts`

| Aspect | Detail |
|---|---|
| SDK | Vercel AI SDK v6 (`ai` package) via `@ai-sdk/google` |
| Model init | `createGoogleGenerativeAI({ apiKey })` |
| Text generation | `generateText()` and `streamText()` from `ai` package |
| Env vars | `GOOGLE_GENERATIVE_AI_API_KEY` (also checks `GOOGLE_API_KEY`, `NEXT_PUBLIC_GEMINI_API_KEY`, `VITE_GEMINI_API_KEY`) |
| Tools | 7 Zod-validated tools (see below) |
| Max duration | 300s (set via `export const maxDuration = 300`) |

**Tools defined in `app/api/chat/command-center/lib/tools.ts`:**

| Tool | DB Table Hit | What It Does |
|---|---|---|
| `lookup_candidate` | `prospects` | Find candidates by ID, email, or name |
| `add_candidate` | `prospects` | Insert or update a prospect |
| `update_candidate` | `prospects` | Update existing prospect fields |
| `add_candidate_note` | `candidate_notes` + `prospects` | Log a note, sync to legacy `notes` field |
| `get_candidate_notes` | `candidate_notes` | Fetch recent notes |
| `get_nova_link` | None (URL builder) | Build Nova platform deep links |
| `get_state_board_link` | `state_board_links` | Lookup state board verification URLs |
| `upsert_state_board_link` | `state_board_links` | Create/update state board links |

**Intent Router (`lib/router.ts`):**
Uses a lightweight Gemini call to classify user intent into one of:
- `GENERAL_CHAT`, `DATABASE_ACTION`, `DRAFT_OUTREACH`, `DRAFT_EMAIL`
- `OFFER_DETAILS`, `LICENSING_REQUEST`, `REASSIGNMENT_REQUEST`
- `COLD_OUTREACH_CAMPAIGN`, `BATCH_REASSIGN`, `REPLY_ANALYSIS`
- `SCREENSHOT_EXTRACTION`, `RESEARCH`, `SUBMITTAL_HIGHLIGHTS`

Then routes to either `handlers/chat.ts` (tools + conversation) or `handlers/email.ts` (template building).

#### Path B: Supabase Edge Function (Legacy)

**File:** `supabase/functions/chat-command-center/index.ts`

| Aspect | Detail |
|---|---|
| SDK | Direct `fetch()` to `generativelanguage.googleapis.com/v1beta` |
| Models | `gemini-3-pro-preview` (primary) → `gemini-3-flash-preview` (fallback) |
| Env var | `GEMINI_API_KEY` |
| Tools | 18 function declarations (search_prospects, calculate_pay, draft_email, etc.) |
| Called by | `src/services/aiService.ts` → `supabase.functions.invoke('chat-command-center')` |

**The Supabase path has MORE tools** than the Vercel path (18 vs 7), including:
- `search_prospects` / `search_all_candidates` / `get_prospect_details`
- `calculate_pay` / `calculate_pay_package`
- `list_email_templates` / `get_template` / `draft_email`
- `create_follow_up` / `search_knowledge` / `google_search`
- `save_certification` / `update_negotiation`
- `get_pipeline_brief` / `set_ui_state` / `search_travel_list`
- `add_prospect` / `generate_submittal_highlights`

#### Which Path Is Active?

The **Vercel route** (`/api/chat/command-center`) is what the production `<WeissachV2 />` component hits via `useCommandCenterChat` hook. The hook posts to `/api/chat/command-center` using `fetch()`.

The **Supabase edge function** path (`AIService.sendCommand`) is the legacy path. Components that still use `AIService` directly (e.g., the old command center) go through this path. But the primary UI (`CommandCenterV2.tsx`) uses the Vercel route.

### Does the AI Actually Call DB Endpoints?

**YES.** Both paths have real, working tool calls:

- **Vercel route tools:** `lookup_candidate`, `add_candidate`, `update_candidate`, `add_candidate_note`, `get_candidate_notes` all execute real Supabase queries against `prospects` and `candidate_notes` tables.
- **Supabase edge function tools:** `search_prospects`, `get_prospect_details`, `create_follow_up`, `calculate_pay_package`, etc. all execute real queries.

The AI is NOT chat-only. It has bidirectional database access.

---

## 4. File Tree with Status & Purpose

### Legend

- **[D]** = DEPLOYED & WORKING
- **[E]** = EXISTS BUT NOT WIRED
- **[P]** = PLANNED BUT NOT BUILT

---

### Root Config

| File | Status | Purpose |
|---|---|---|
| `package.json` | [D] | Dependencies, scripts (`next dev/build/start`) |
| `next.config.js` | [D] | Next.js config: maps env vars, external packages |
| `vercel.json` | [D] | Vercel deployment: nextjs framework, 60s API timeout |
| `tsconfig.json` | [D] | TypeScript config with `@/*` path alias |
| `tailwind.config.js` | [D] | Tailwind with custom animations, typography plugin |
| `postcss.config.js` | [D] | PostCSS: tailwindcss + autoprefixer |
| `.gitignore` | [D] | Standard ignores |
| `next-env.d.ts` | [D] | Next.js type declarations |
| `tsconfig.tsbuildinfo` | [D] | Incremental build cache |

### Root Docs

| File | Status | Purpose |
|---|---|---|
| `README.md` | [E] | Project readme |
| `ARCHITECTURE.md` | [E] | Architecture overview doc |
| `AUDIT_AND_FIX_PLAN.md` | [E] | Previous audit/fix plan |
| `DESIGN_SYSTEM.md` | [E] | Design system documentation |
| `PLAN.md` | [E] | Development plan |

### Root Utility Scripts

| File | Status | Purpose |
|---|---|---|
| `run-migration.js` | [E] | Manual migration runner script |
| `check_views.ts` | [E] | Utility to verify DB views exist |

### `app/` — Next.js App Router (PRODUCTION)

| File | Status | Purpose |
|---|---|---|
| `app/layout.tsx` | [D] | Root layout: HTML shell + Providers |
| `app/page.tsx` | [D] | Root redirect → `/prospects` |
| `app/providers.tsx` | [D] | Client providers: QueryClient, Auth, Layout |
| `app/guide/page.tsx` | [D] | Traveler handbook public page |
| `app/(dashboard)/layout.tsx` | [D] | Dashboard shell: Sidebar + WeissachV2 chat panel |
| `app/(dashboard)/prospects/page.tsx` | [D] | Dynamic import of ProspectsDashboard |
| `app/(dashboard)/active/page.tsx` | [D] | Dynamic import of ActiveAssignmentsDashboard |
| `app/(dashboard)/submittals/page.tsx` | [D] | Dynamic import of SubmittalDashboard |
| `app/(dashboard)/exits/page.tsx` | [D] | Dynamic import of ExitsDashboard |
| `app/(dashboard)/follow-ups/page.tsx` | [D] | Dynamic import of NewFollowUpDashboard |
| `app/(dashboard)/travel/page.tsx` | [D] | Dynamic import of PriorityDashboard |
| `app/(dashboard)/local/page.tsx` | [D] | Dynamic import of LocalJobsDashboard (placeholder) |
| `app/(dashboard)/admin/page.tsx` | [D] | Dynamic import of AdminDashboard (placeholder) |
| `app/(dashboard)/error.tsx` | [D] | Dashboard error boundary |

### `app/api/` — API Routes (PRODUCTION)

| File | Status | Purpose |
|---|---|---|
| `app/api/chat/command-center/route.ts` | [D] | **Primary AI chat endpoint** — POST handler, intent classification, tool routing |
| `app/api/chat/command-center/handlers/chat.ts` | [D] | Chat handler: general conversation, database actions with tools |
| `app/api/chat/command-center/handlers/email.ts` | [D] | Email handler: template-based email drafting |
| `app/api/chat/command-center/lib/config.ts` | [D] | Intent configs, model configs, Nova URLs, team emails |
| `app/api/chat/command-center/lib/tools.ts` | [D] | 7 Zod-validated LLM tools with Supabase execution |
| `app/api/chat/command-center/lib/router.ts` | [D] | Gemini-powered intent classifier |
| `app/api/chat/command-center/lib/extractor.ts` | [D] | Extract candidate data from conversation context |
| `app/api/chat/command-center/lib/response-blocks.ts` | [D] | Build structured response blocks for DecisionCard |
| `app/api/chat/command-center/lib/template-registry.ts` | [D] | 31 email/SMS templates with build functions |
| `app/api/chat/command-center/lib/email-builder.ts` | [D] | Email composition engine with Gemini enhancement |
| `app/api/chat/command-center/lib/model-logging.ts` | [D] | Model selection + error logging utilities |
| `app/api/chat/command-center/types/index.ts` | [D] | TypeScript types for entire command center API |
| `app/api/chat/command-center/README.md` | [E] | Documentation |
| `api/chat/route.ts` | [E] | **ORPHAN** — sits outside `app/` directory, never served by Next.js |

### `src/components/` — React Components

| File | Status | Purpose |
|---|---|---|
| `CommandCenterV2.tsx` | [D] | **"Weissach"** — 3400-line AI chat panel with streaming, email drafts, templates, file upload, decision cards |
| `DecisionCard.tsx` | [D] | Universal decision surface: tabs, stats, actions |
| `RecruitingPanels.tsx` | [D] | Tab content: CandidatePanel, PayPackagePanel, LicensurePanel, PipelinePanel, etc. |
| `composeDecisionCard.tsx` | [D] | Converts response blocks → DecisionCard props |
| `ToolResultRenderer.tsx` | [D] | Renders tool outputs (pipeline brief, pay calc, etc.) |
| `Sidebar.tsx` | [D] | Next.js sidebar with route navigation |
| `ProspectsDashboard.tsx` | [D] | Main prospects Kanban/list view |
| `ActiveAssignmentsDashboard.tsx` | [D] | Active clinicians dashboard with extension tracking |
| `SubmittalDashboard.tsx` | [D] | Submittal pipeline tracker |
| `ExitsDashboard.tsx` | [D] | Exit/offboarding dashboard |
| `NewFollowUpDashboard.tsx` | [D] | Follow-up reminder dashboard |
| `PriorityDashboard.tsx` | [D] | Priority command center (hot list, matching) |
| `PipelineDashboard.tsx` | [D] | Overall pipeline view |
| `Header.tsx` | [D] | App header |
| `ErrorBoundary.tsx` | [D] | Global error boundary |
| `LoadingFallback.tsx` | [D] | Loading skeleton |
| `AuthModal.tsx` | [D] | Login/signup modal |
| `AuthProvider.tsx` | [D] | Auth context provider |
| `UserMenu.tsx` | [D] | User profile dropdown |
| `AddProspect.tsx` | [D] | Add prospect form |
| `ProspectDetailModal.tsx` | [D] | Prospect detail view |
| `AssignmentDetailModal.tsx` | [D] | Assignment detail modal |
| `AssignmentEmailModal.tsx` | [D] | Email modal for assignments |
| `SMSModal.tsx` | [D] | SMS composition modal |
| `QuickOutreachModal.tsx` | [D] | Quick outreach action modal |
| `ContractEditModal.tsx` | [D] | Contract editing |
| `ContractViewModal.tsx` | [D] | Contract viewing |
| `FollowUpCalendar.tsx` | [D] | Calendar view for follow-ups |
| `FollowUpDashboard.tsx` | [D] | Legacy follow-up dashboard |
| `EngagementsDashboard.tsx` | [D] | Engagements listing |
| `FacilitiesDashboard.tsx` | [D] | Facilities directory |
| `JobsDashboard.tsx` | [D] | Jobs listing |
| `JobOpeningsDashboard.tsx` | [D] | Job openings view |
| `OffersDashboard.tsx` | [D] | Offers tracking |
| `OffersSignedPrestartDashboard.tsx` | [D] | Signed/prestart offers |
| `BookingFactoryDashboard.tsx` | [D] | Booking factory workflow |
| `WeeklyPriorityDashboard.tsx` | [D] | Weekly priority board |
| `UnifiedInterestedClicksDashboard.tsx` | [D] | Interested clicks overview |
| `SpecialtyRankingBoard.tsx` | [D] | Specialty-based rankings |
| `ActiveAssignmentUpdater.tsx` | [D] | Assignment update form |
| `CandidateOutreachAutomator.tsx` | [D] | Batch outreach UI |
| `CandidateSync.tsx` | [D] | Candidate data sync |
| `InterestedClicksSync.tsx` | [D] | Interested clicks importer |
| `MarginSync.tsx` | [D] | Margin data sync |
| `MarginApprovalGenerator.tsx` | [D] | Margin approval form |
| `DataExtractor.tsx` | [D] | General data extraction UI |
| `LivelistExtractor.tsx` | [D] | Livelist parsing UI |
| `NovaParserModal.tsx` | [D] | Nova text parser modal |
| `OfferDetailsUpdater.tsx` | [D] | Offer detail editing |
| `OutreachTemplateManager.tsx` | [D] | Template management UI |
| `ReassignmentRequestTool.tsx` | [D] | Reassignment request form |
| `ResumeParser.tsx` | [D] | Resume parsing UI |
| `SubmittalReplyGenerator.tsx` | [D] | Submittal reply drafting |
| `placeholders/AdminDashboard.tsx` | [D] | Placeholder admin page |
| `placeholders/LocalJobsDashboard.tsx` | [D] | Placeholder local jobs page |
| `placeholders/TravelJobsDashboard.tsx` | [E] | Placeholder travel jobs — not routed |

### `src/components/` — Sub-directories

| Directory | Status | Purpose |
|---|---|---|
| `followups/FollowUpModal.tsx` | [D] | Follow-up creation/edit modal |
| `followups/FollowUpPanel.tsx` | [D] | Follow-up panel widget |
| `handbook/TravelerHandbook.tsx` | [D] | Public traveler handbook page |
| `layout/RootLayout.tsx` | [E] | Legacy SPA root layout (react-router Outlet) |
| `layout/Sidebar.tsx` | [E] | Legacy SPA sidebar (react-router) |
| `layout/ActionBar.tsx` | [E] | Action bar component |
| `layout/PageHeader.tsx` | [E] | Page header component |
| `layout/QuickLinks.tsx` | [E] | Quick links widget |
| `layout/UserProfile.tsx` | [E] | User profile widget |
| `priority/*` | [D] | Priority dashboard sub-views (JobOpeningsView, LocalCandidatesView, MatchingToolView, RecruiterHotListView) |
| `prospects/*` | [D] | Prospects sub-components (AddProspectModal, FilterBar, ProspectCard, ExtractorModal, etc.) |
| `submittals/ReadyPriorityPanel.tsx` | [D] | Submittal ready priority panel |
| `shared/*` | [D] | Shared UI: DashboardShell, DraggableBoard, EmailModalShell, EmptyState, ErrorState, LoadingSkeleton, PrecisionCard, PrecisionTable, StatCard, Tooltip |
| `ui/alert.tsx` | [D] | Alert component |
| `ui/card.tsx` | [D] | Card component |

### `src/features/command-center-chat/`

| File | Status | Purpose |
|---|---|---|
| `hooks/useCommandCenterChat.ts` | [D] | **Core chat hook** — streaming, file upload, localStorage persistence, 60fps throttling |
| `hooks/useFileUpload.ts` | [D] | File upload handling for chat |
| `hooks/usePinnedScroll.ts` | [D] | Auto-scroll pinning for chat |
| `components/ThinkingPill.tsx` | [D] | AI thinking indicator |
| `types.ts` | [D] | Chat type definitions |

### `src/hooks/`

| File | Status | Purpose |
|---|---|---|
| `useClinicianDashboard.ts` | [D] | Clinician dashboard data hook |
| `useDebouncedValue.ts` | [D] | Debounce utility |
| `useEngagementsDashboard.ts` | [D] | Engagements data hook |
| `useEvent.ts` | [D] | Event handler hook |
| `useFollowUps.ts` | [D] | Follow-ups data hook |
| `useHeaderHeight.ts` | [D] | Header height measurement |
| `useKeyboardShortcuts.ts` | [D] | Keyboard shortcut bindings |
| `useLivelistSync.ts` | [D] | Livelist synchronization |
| `useMountedRef.ts` | [D] | Mount state tracking |
| `usePriorityCommandCenterData.ts` | [D] | Priority dashboard data |
| `useSortedCandidates.ts` | [D] | Candidate sorting |
| `useURLState.ts` | [D] | URL state management |
| `useViewMode.ts` | [D] | View mode toggle |
| `ready/useWeeklyPriority.ts` | [D] | Weekly priority data |

### `src/lib/`

| File | Status | Purpose |
|---|---|---|
| `supabase.ts` | [D] | Re-exports shared supabase client |
| `supabase/browser.ts` | [E] | Browser client factory (unused) |
| `supabase/server.ts` | [E] | Server client factory (unused) |
| `supabase/assignments.ts` | [D] | TanStack Query hooks for assignments |
| `template-catalog.ts` | [D] | 31 template definitions (shared client/server) |
| `env.ts` | [D] | Environment variable validation |
| `constants.ts` | [D] | App constants |
| `candidateDna.ts` | [D] | Candidate DNA scoring |
| `crypto.ts` | [D] | Crypto utilities |
| `dates.ts` | [D] | Date formatting utilities |
| `dragDropApi.ts` | [D] | Drag-and-drop API helpers |
| `followUpUtils.ts` | [D] | Follow-up utility functions |
| `resilience.ts` | [D] | Retry/resilience utilities |
| `submittalHighlights.ts` | [D] | Submittal highlight generation |
| `utils.ts` | [D] | General utilities |

### `src/services/`

| File | Status | Purpose |
|---|---|---|
| `aiService.ts` | [D] | AI service class — calls Supabase Edge Functions (legacy path) |
| `prospectService.ts` | [D] | CRUD operations for prospects |
| `extractionService.ts` | [D] | Data extraction service |
| `extensionExtractionService.ts` | [D] | Extension request extraction |
| `outlookService.ts` | [D] | Outlook deep link generation |
| `payPackageService.ts` | [D] | Pay package calculations |
| `payPackageCompliance.ts` | [D] | Pay compliance checks |
| `schemaService.ts` | [D] | Schema inspection service |
| `tsvImportService.ts` | [D] | TSV data import |

### `src/server/ai/` — Legacy Server AI

| File | Status | Purpose |
|---|---|---|
| `chatRouter.ts` | [E] | Express-style chat router (never called in Next.js) |
| `providers/geminiProvider.ts` | [E] | Direct Gemini API wrapper (legacy) |
| `providers/openaiProvider.ts` | [E] | OpenAI API wrapper (legacy) |

### `src/shared/`

| File | Status | Purpose |
|---|---|---|
| `services/supabase.ts` | [D] | Singleton Supabase client (the one everything uses) |
| `services/dataService.ts` | [D] | Generic data fetching |
| `services/emailService.ts` | [D] | Email service helper |
| `components/*` | [D] | 15+ shared UI components |
| `hooks/*` | [D] | 8 shared hooks |
| `types/database.ts` | [D] | Database type definitions |
| `types/index.ts` | [D] | Shared type exports |

### `src/` — Other

| File | Status | Purpose |
|---|---|---|
| `main.tsx` | [E] | Legacy Vite SPA entry point |
| `App.tsx` | [E] | Legacy SPA root component |
| `index.css` | [D] | Global CSS |
| `config/routes.tsx` | [E] | Legacy React Router config |
| `config/routes-next.ts` | [D] | Next.js route metadata (used by Sidebar) |
| `config/constants.ts` | [D] | Route categories and constants |
| `config/prospects.ts` | [D] | Prospect configuration |
| `context/AuthContext.tsx` | [D] | Auth context provider |
| `context/LayoutContext.tsx` | [D] | Layout/workspace mode context |
| `contexts/ProspectsProvider.tsx` | [D] | Prospects data context |
| `store/useAppStore.ts` | [D] | Zustand global store |
| `store/batchStore.ts` | [D] | Batch operation store |
| `design-system/*` | [D] | Full design system: tokens, core components, obsidian theme |
| `outreach/templates.ts` | [D] | Outreach template strings |
| `types/*` | [D] | TypeScript type definitions |
| `utils/*` | [D] | Utility functions |
| `styles/*` | [D] | CSS modules |

### `supabase/`

| File | Status | Purpose |
|---|---|---|
| `functions/` (14 functions) | [D] | See Edge Functions table above |
| `migrations/` (25+ files) | [D] | Schema migrations |
| `migrations/archive/` | [E] | Archived old migrations |
| `scripts/` | [E] | Maintenance SQL scripts, import scripts |
| `seed_data.sql` | [E] | Seed data (not auto-run) |

### `command-center-extension/` — Chrome Extension

| File | Status | Purpose |
|---|---|---|
| `src/background.ts` | [E] | Extension background script |
| `src/sidepanel.tsx` | [E] | Side panel UI |
| `src/contents/nova-scraper.ts` | [E] | Nova page content scraper |
| `src/core/messaging/*` | [E] | Chrome messaging bus |
| `src/core/storage/*` | [E] | Extension storage hooks |
| `src/features/context-engine/*` | [E] | Nova context extraction strategies |
| `src/features/secure-capture/*` | [E] | PII masking/redaction |
| `package.json` | [E] | Plasmo framework + Tailwind |
| All other files | [E] | **Entire extension is built but NOT shipped to Chrome Web Store** |

### `command-center-widget/` — Electron Desktop Widget

| File | Status | Purpose |
|---|---|---|
| `electron/main.ts` | [E] | Electron main process |
| `electron/preload.ts` | [E] | Preload script |
| `src/App.tsx` | [E] | Widget React app |
| `src/lib/*` | [E] | API, auth, clipboard, config, modifiers |
| `package.json` | [E] | Electron + Vite + React |
| All other files | [E] | **Entire widget is built but NOT packaged/distributed** |

### `nova-capturer/` — Simple Chrome Extension

| File | Status | Purpose |
|---|---|---|
| `background.js` | [E] | Background script |
| `content.js` | [E] | Content script for Nova scraping |
| `config.js` | [E] | Configuration |
| `supabase.js` | [E] | Supabase client for extension |
| `manifest.json` | [E] | Chrome extension manifest |
| `setup-instructions.md` | [E] | Setup guide |
| All files | [E] | **Simpler Nova scraper — NOT installed** |

### `.bolt/` and `.gemini/`

| File | Status | Purpose |
|---|---|---|
| `.bolt/config.json` | [E] | Bolt.new project config |
| `.bolt/prompt` | [E] | Bolt.new system prompt |
| `.bolt/supabase_discarded_migrations/*` | [E] | Old discarded migrations |
| `.gemini/artifacts/*` | [E] | Gemini code assist artifacts |

---

## 5. Critical Gap Analysis & Shortest Path

### The Question

> "Recruiter types a candidate name and gets structured data back from the database"

### Current State: This Already Works (Mostly)

The Vercel API route (`/api/chat/command-center`) has a `lookup_candidate` tool that:

1. Receives the user message
2. Classifies intent as `DATABASE_ACTION`
3. Calls `lookup_candidate` with `{ name: "candidate name" }`
4. Queries `SELECT id, candidate_id, name, email, phone, status, nova_url, recruiter, specialty, profession, home_state, licenses, engagement_level FROM prospects WHERE name ILIKE '%name%' LIMIT 5`
5. Returns structured JSON: `{ ok: true, matches: [...] }`
6. Gemini formats this into a natural language + structured response

**This flow is wired and functional.** A recruiter can type "look up Sarah Johnson" in the Weissach chat panel and get structured candidate data back.

### What's Missing / Gaps

| Gap | Severity | Detail |
|---|---|---|
| **Tool count disparity** | MEDIUM | The Vercel route has 7 tools; the Supabase edge function has 18. Missing from Vercel: `search_all_candidates`, `get_prospect_details`, `calculate_pay`, `calculate_pay_package`, `list_email_templates`, `get_template`, `draft_email`, `create_follow_up`, `search_knowledge`, `google_search`, `save_certification`, `update_negotiation`, `get_pipeline_brief`, `set_ui_state`, `search_travel_list`, `generate_submittal_highlights` |
| **No engagement/assignment lookup tool** | HIGH | `lookup_candidate` only queries `prospects`. There is no tool to query `engagements` or `active_assignments_dashboard` by name. A recruiter asking "what's Sarah's current assignment?" would get nothing. |
| **No joined data return** | HIGH | `lookup_candidate` returns flat prospect fields. It does NOT join to `engagements`, `follow_ups`, `pay_packages`, or `actions`. The recruiter gets name/email/phone but NOT assignment details, pay rates, or follow-up history. |
| **send_email is a stub** | MEDIUM | Emails can be drafted by the AI but never actually sent. No SendGrid/Resend/SMTP integration. |
| **notify-due-followups doesn't send** | LOW | Generates HTML email digest but only `console.log`s it. |
| **Chrome extension not deployed** | LOW | `command-center-extension` is built but not in the Chrome Web Store. |
| **Electron widget not packaged** | LOW | `command-center-widget` exists but is not distributed. |
| **SSR Supabase client unused** | LOW | `src/lib/supabase/server.ts` is written but no server component uses it. |
| **Legacy SPA still in tree** | LOW | `src/main.tsx`, `src/App.tsx`, `src/config/routes.tsx` are dead code from the Vite era. |

### Shortest Path: Name → Full Structured Data

**Current gap:** `lookup_candidate` returns prospect-level data only. No engagement, assignment, pay, or follow-up data.

**Fix (3 steps):**

#### Step 1: Add a `get_candidate_full_profile` tool to `app/api/chat/command-center/lib/tools.ts`

```typescript
get_candidate_full_profile: {
  description: 'Get full candidate profile including assignments, engagements, pay packages, and follow-ups.',
  parameters: z.object({
    candidate_id: z.number().int().positive().optional(),
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  execute: async (args) => {
    // 1. Find prospect
    let query = supabase.from('prospects').select('*').limit(1);
    if (args.candidate_id) query = query.eq('candidate_id', args.candidate_id);
    else if (args.email) query = query.ilike('email', args.email);
    else if (args.name) query = query.ilike('name', `%${args.name}%`);
    else return { ok: false, error: 'Provide candidate_id, email, or name.' };

    const { data: prospect } = await query.maybeSingle();
    if (!prospect) return { ok: false, error: 'Candidate not found.' };

    // 2. Fetch engagements
    const { data: engagements } = await supabase
      .from('engagements')
      .select('*')
      .eq('prospect_id', prospect.id)
      .order('created_at', { ascending: false });

    // 3. Fetch follow-ups
    const { data: followUps } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('candidate_id', prospect.candidate_id)
      .eq('completed', false)
      .order('scheduled_date', { ascending: true })
      .limit(5);

    // 4. Fetch notes
    const { data: notes } = await supabase
      .from('candidate_notes')
      .select('*')
      .eq('prospect_id', prospect.id)
      .order('created_at', { ascending: false })
      .limit(5);

    return {
      ok: true,
      prospect,
      engagements: engagements || [],
      follow_ups: followUps || [],
      recent_notes: notes || [],
    };
  },
},
```

#### Step 2: Register the tool in the intent config

In `app/api/chat/command-center/lib/config.ts`, ensure `DATABASE_ACTION` intent has `requiresTools: true` (it already does).

#### Step 3: Update the system prompt

In `app/api/chat/command-center/handlers/chat.ts`, add `get_candidate_full_profile` to the `DATABASE_ACTION` tool list in the system prompt so Gemini knows to use it when asked for a full profile.

**That's it.** The routing, streaming, tool execution, and UI rendering are all already wired. The only missing piece is a tool that joins across tables.

---

## Summary Scorecard

| Category | Deployed & Working | Exists Not Wired | Planned Not Built |
|---|---|---|---|
| Next.js App Router pages | 10 | 0 | 0 |
| API Routes | 1 (command-center) | 1 (orphan api/chat) | 0 |
| Supabase Edge Functions | 14 | 0 | 0 |
| Database Tables | 20+ | 0 | 0 |
| Database Views | 5 | 0 | 0 |
| RPC Functions | 8 | 0 | 0 |
| React Components | 60+ | 5 (legacy layout) | 0 |
| Vercel AI Tools | 7 | 0 | 11 (exist in Edge Fn, not Vercel) |
| Chrome Extension | 0 | 1 (full build) | 0 |
| Electron Widget | 0 | 1 (full build) | 0 |
| Email Sending | 0 | 1 (stub) | 1 (need provider) |
