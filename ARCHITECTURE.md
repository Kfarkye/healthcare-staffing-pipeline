# Healthcare Staffing Pipeline - Unified Architecture

## Philosophy: Complexity Made Simple

This system follows the Apple × Stripe × Vercel design philosophy: **hide complexity, reveal clarity**. Every component works together seamlessly while maintaining clear boundaries and single responsibilities.

---

## System Overview

### Three Core Pipelines

```
┌─────────────────────────────────────────────────────────────────┐
│                    HEALTHCARE STAFFING SYSTEM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │   PROSPECTS   │───▶│   PIPELINE   │───▶│ ACTIVE CONTRACTS │   │
│  │   Dashboard   │   │   Dashboard  │   │    Dashboard     │   │
│  └───────────────┘   └──────────────┘   └──────────────────┘   │
│         │                    │                      │            │
│      New Leads          Offers/Signed          Extensions       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Layer: Single Source of Truth

### Core Tables & Their Roles

#### 1. **`prospects`** - The Entry Point
```typescript
// Where everyone starts their journey
interface Prospect {
  id: number;
  candidate_id: number;      // Links to Nova
  name: string;
  email: string;
  phone: string;
  specialty: string;

  // Pipeline Position
  status: 'New' | 'Contacted' | 'Interested' |
          'Profile Updates' | 'Submittal Ready' | 'Submitted';
  order: number;              // Drag-and-drop position

  // Qualification State
  licenses: string[];
  references_verified: number;
  profile_complete: boolean;

  // Follow-Up System
  followup_stage?: 'FU_INITIAL' | 'FU_STALL_3D' |
                   'FU_FINAL_7_10' | 'FU_TO_EXIT';
  last_contacted_at?: string;
  engagement_level?: 'High' | 'Medium' | 'Low';
}
```

**Used By:**
- `ProspectsDashboard` - Main kanban board
- `FollowUpDashboard` - Stalled prospects recovery
- `PriorityDashboard` - Interested clicks management

---

#### 2. **`candidates`** - The Master Record
```typescript
// Central candidate information
interface Candidate {
  id: number;
  candidate_id: number;       // External Nova ID
  full_name: string;
  email: string;
  phone: string;

  // Pipeline Stage
  stage: 'offered' | 'prestart' | 'signed';
  lane: 'prospect' | 'working' | 'extension' | 'transition';

  // Contract Details
  offer_date?: string;
  signed_date?: string;
  start_date?: string;
  facility?: string;
  rate?: number;
  weekly_gross?: number;

  // Metadata
  nova_url?: string;
  recruiter_name?: string;
}
```

**Used By:**
- `PipelineDashboard` - Offers → Pre-Start → Signed tracking

---

#### 3. **`engagements`** - Active Contracts
```typescript
// The working relationship
interface Engagement {
  id: number;
  candidate_id: string;
  candidate_name: string;

  // Contract Details
  job_id: string;
  facility_name: string;
  specialty: string;
  start_date: date;
  end_date: date;

  // Status & Stage
  status: engagement_status;   // Complex enum
  extension_stage?: string;    // For drag-and-drop

  // Financial
  bill_rate: number;
  actual_margin: number;
  weekly_value: number;

  // Tracking
  previous_extensions: number;
}
```

**Used By:**
- `ActiveAssignmentsDashboard` - Extension workflow with drag-and-drop

---

#### 4. **`interested_clicks`** - Job Interest Tracking
```typescript
// Candidates who clicked "interested"
interface InterestedClick {
  id: number;
  application_id: number;
  candidate_name: string;
  candidate_email: string;
  job_id: string;
  specialty: string;

  // Geographic Matching
  candidate_homestate: string;
  job_state: string;           // For local matching

  // Engagement Tracking
  last_note: string;
  last_note_date: string;
  status: click_status;
  recruiter_name: string;
}
```

**Used By:**
- `PriorityDashboard` - High-priority outreach management

---

#### 5. **`pay_packages`** - Compensation Details
```typescript
// Job compensation breakdown
interface PayPackage {
  job_id: string;              // Primary key
  facility_name: string;
  specialty: string;

  // Pay Structure
  taxable_hourly_rate: number;
  hours_per_week: number;
  stipend: number;
  meals_weekly: number;
  housing_weekly: number;
  gross_weekly_pay: number;
  completion_bonus: number;

  // Compliance
  is_compliant: boolean;
  min_wage_applied: number;
}
```

**Used By:**
- `PriorityDashboard` - Email template generation
- All dashboards for pay display

---

## Component Architecture

### 1. Prospect Management Layer

#### **ProspectsDashboard** (`src/components/ProspectsDashboard.tsx`)
**Purpose:** Initial qualification pipeline
**State:** Zustand store (`useAppStore`)
**Key Features:**
- Kanban drag-and-drop (6 columns)
- Real-time filtering
- Bulk actions
- Profile completion tracking

**Data Flow:**
```
prospects table
    ↓
useAppStore (Zustand)
    ↓
ProspectsDashboard
    ↓
Drag/Drop → updateProspectStatus()
    ↓
Supabase update + optimistic UI
```

#### **FollowUpDashboard** (`src/components/FollowUpDashboard.tsx`)
**Purpose:** Re-engage stalled prospects
**State:** Local React state
**Key Features:**
- 4-stage follow-up workflow
- Batch email sending
- Priority based on days stalled
- Engagement level tracking

**Data Flow:**
```
prospects table (followup_stage != null)
    ↓
FollowUpDashboard
    ↓
Drag between stages → update followup_stage
    ↓
Batch email → update last_contacted_at
```

---

### 2. Pipeline Management Layer

#### **PipelineDashboard** (`src/components/PipelineDashboard.tsx`)
**Purpose:** Track offers → signatures
**State:** Local React state with hooks
**Key Features:**
- 3-tab interface (Offered, Pre-Start, Signed)
- Drag-and-drop between stages
- Urgency indicators
- Auto-timestamp on stage change

**Data Flow:**
```
candidates table
    ↓
usePipelineData() hook
    ↓
Three tabs (stage-based filtering)
    ↓
Drag card → update stage + signed_date
    ↓
Supabase update + refetch
```

#### **PriorityDashboard** (`src/components/PriorityDashboard.tsx`)
**Purpose:** Outreach to interested candidates
**State:** Local React state
**Key Features:**
- Interested clicks management
- Pay package integration
- Email template generation
- Local candidate matching

**Data Flow:**
```
interested_clicks table
    ↓
dataService.fetchClicks()
    ↓
PriorityDashboard
    ↓
Click email → fetch/generate pay package
    ↓
Open Outlook with pre-filled template
```

---

### 3. Contract Management Layer

#### **ActiveAssignmentsDashboard** (`src/components/ActiveAssignmentsDashboard.tsx`)
**Purpose:** Extension workflow management
**State:** Local React state with DndKit
**Key Features:**
- 6-stage extension pipeline
- Drag-and-drop with droppable columns
- Real-time updates
- Status tracking

**Data Flow:**
```
engagements table (extension_stage)
    ↓
ActiveAssignmentsDashboard
    ↓
Drag between columns → update extension_stage
    ↓
Supabase update + optimistic UI
```

---

## Shared Services & Utilities

### Email Service Layer
```
src/services/
├── emailService.ts         # Outlook integration
├── outlookService.ts       # mailto: link generation
└── payPackageService.ts    # Compensation calculations
```

**Email Template Flow:**
```
1. User clicks "Email" on candidate card
2. Fetch pay package from pay_packages table
3. If not found → generate using payPackageService
4. Populate email template with:
   - Candidate first name
   - Facility details
   - Pay breakdown
   - Nova URL
5. Open Outlook with pre-filled content
```

### Data Service Layer
```
src/shared/services/
├── dataService.ts          # Supabase queries
├── supabase.ts             # Client instance
└── extractionService.ts    # Data parsing
```

### Pay Package Service
```typescript
// src/services/payPackageService.ts

class PayPackageService {
  // Fetch existing package
  async getPackage(jobId: string): Promise<PayPackage | null>

  // Generate from job data
  async generateFromClick(clickData): Promise<PayPackage>

  // Calculate compliant package
  async calculatePackage(
    jobId, state, city, profession, specialty,
    grossWeekly, hoursPerWeek
  ): Promise<PayPackage>

  // Generate email template
  generateEmailTemplate(
    candidateName, jobData, payPackage
  ): { subject: string; body: string }
}
```

---

## State Management Strategy

### Global State (Zustand)
**Used For:** `ProspectsDashboard` only
**Why:** Complex kanban with shared filters and bulk actions

```typescript
// src/store/useAppStore.ts
interface ProspectState {
  prospects: Prospect[];
  filters: Filters;
  fetchProspects(): Promise<void>;
  updateProspectStatus(id, status, toIndex): void;
  reorderWithinColumn(status, from, to): void;
}
```

### Local State (React Hooks)
**Used For:** All other dashboards
**Why:** Self-contained, simpler data flow

```typescript
// Pattern used in PipelineDashboard, ActiveAssignmentsDashboard
const useDashboardData = () => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const { data } = await supabase.from('table').select('*');
    setData(data);
  };

  return { data, setData, loading, refetch: fetchData };
};
```

---

## Drag-and-Drop Implementation

### Two Approaches Used

#### 1. **Native HTML5 Drag-and-Drop**
**Used In:** `FollowUpDashboard`
**Why:** Simple 4-column layout, no complex sorting

```typescript
// Draggable item
<div
  draggable
  onDragStart={e => onDragStart(e, prospect)}
>

// Drop target
<div
  onDragOver={e => e.preventDefault()}
  onDrop={e => handleDrop(e, stage)}
>
```

#### 2. **@dnd-kit Library**
**Used In:** `ProspectsDashboard`, `PipelineDashboard`, `ActiveAssignmentsDashboard`
**Why:** Complex sorting, better UX, keyboard accessible

```typescript
<DndContext
  sensors={sensors}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={items}>
    {items.map(item => (
      <SortableItem key={item.id} item={item} />
    ))}
  </SortableContext>
  <DragOverlay>
    {activeItem && <ItemPreview item={activeItem} />}
  </DragOverlay>
</DndContext>
```

---

## Modal System

### Modals by Function

```
Prospect Actions:
├── AddProspectModal         # Create new prospect
├── EditProspectModal        # Edit existing prospect
├── ProfileUpdateModal       # Update profile completeness
├── EmailTemplateModal       # Send emails
└── NovaParserModal          # Bulk import from Nova

Contract Actions:
├── ContractViewModal        # View contract details
├── ContractEditModal        # Edit contract
├── AssignmentEmailModal     # Send assignment emails
└── PayPackageModal          # View/edit pay packages
```

### Modal Pattern
```typescript
// Standard modal interface
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  data?: T;
  onSave?: (updates: Partial<T>) => Promise<void>;
}

// Usage
const [modal, setModal] = useState<{
  isOpen: boolean;
  data?: T;
}>({ isOpen: false });

<Modal
  isOpen={modal.isOpen}
  onClose={() => setModal({ isOpen: false })}
  data={modal.data}
/>
```

---

## Integration Points

### How Components Connect

```
┌─────────────────────────────────────────────────────────────┐
│                    USER JOURNEY                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. LEAD CAPTURE                                            │
│     ┌─────────────────┐                                     │
│     │ PriorityDashboard│  ← interested_clicks               │
│     │ (Interested)     │  ← pay_packages                    │
│     └────────┬─────────┘                                     │
│              │ Create Prospect                              │
│              ↓                                               │
│  2. QUALIFICATION                                           │
│     ┌─────────────────┐                                     │
│     │ProspectsDashboard│  ← prospects (status pipeline)     │
│     │ (6-stage Kanban) │                                    │
│     └────────┬─────────┘                                     │
│              │ Move to "Submitted"                          │
│              ↓                                               │
│  3. OFFER → SIGNED                                          │
│     ┌─────────────────┐                                     │
│     │PipelineDashboard │  ← candidates (stage: offered)     │
│     │ (Offered tab)    │                                    │
│     └────────┬─────────┘                                     │
│              │ Drag to "Signed"                             │
│              ↓                                               │
│  4. CONTRACT START                                          │
│     ┌─────────────────┐                                     │
│     │PipelineDashboard │  ← candidates (stage: prestart)    │
│     │ (Pre-Start tab)  │                                    │
│     └────────┬─────────┘                                     │
│              │ Contract starts                              │
│              ↓                                               │
│  5. ACTIVE CONTRACT                                         │
│     ┌──────────────────┐                                    │
│     │ActiveAssignments │  ← engagements (extension_stage)   │
│     │Dashboard         │                                    │
│     └──────────────────┘                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Cross-Dashboard Actions

#### Action: "Convert Interested Click → Prospect"
```typescript
// In PriorityDashboard
const handleCreateProspect = async (click: Click) => {
  await supabase.from('prospects').insert({
    candidate_id: click.candidate_id,
    name: click.candidate_name,
    email: click.candidate_email,
    specialty: click.specialty,
    status: 'New',
    recruiter: click.recruiter_name,
  });

  // Update click status
  await supabase.from('interested_clicks')
    .update({ status: 'Contacted' })
    .eq('id', click.id);
};
```

#### Action: "Move Prospect → Pipeline"
```typescript
// When prospect reaches "Submitted" status
const handleProspectSubmitted = async (prospect: Prospect) => {
  // Create or update candidate record
  await supabase.from('candidates').upsert({
    candidate_id: prospect.candidate_id,
    full_name: prospect.name,
    email: prospect.email,
    stage: 'offered',  // Start in Pipeline Dashboard
    profession: prospect.profession,
    primary_specialty: prospect.specialty,
  });
};
```

#### Action: "Signed → Active Contract"
```typescript
// When candidate signs in Pipeline Dashboard
const handleCandidateSigned = async (candidate: Candidate) => {
  // Create engagement record
  await supabase.from('engagements').insert({
    candidate_id: candidate.candidate_id,
    candidate_name: candidate.full_name,
    specialty: candidate.primary_specialty,
    start_date: candidate.start_date,
    status: 'Active',
    extension_stage: 'outreach',  // Start extension tracking
  });
};
```

---

## Design System

### Consistent Patterns

#### Colors
```css
/* Status Colors */
--status-new: #3b82f6;       /* Blue */
--status-active: #10b981;    /* Green */
--status-warning: #f59e0b;   /* Amber */
--status-critical: #ef4444;  /* Red */

/* Drag States */
--drag-over: rgba(59, 130, 246, 0.1);
--drag-active: rgba(59, 130, 246, 0.2);
```

#### Card Component
```typescript
// Standard card across all dashboards
interface CardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
  isDragging?: boolean;
}

<div className={`
  bg-white rounded-xl border-2 p-4
  transition-all duration-200
  hover:shadow-lg hover:scale-[1.02]
  cursor-grab active:cursor-grabbing
  ${isDragging ? 'opacity-50 scale-105' : ''}
`}>
```

#### Button Hierarchy
```typescript
// Primary action (one per view)
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">

// Secondary action
<button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">

// Icon button
<button className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
```

---

## Performance Optimizations

### Database Queries
```sql
-- Indexed columns for fast lookups
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_order ON prospects(order);
CREATE INDEX idx_candidates_stage ON candidates(stage);
CREATE INDEX idx_engagements_extension_stage ON engagements(extension_stage);
CREATE INDEX idx_interested_clicks_status ON interested_clicks(status);
```

### React Optimizations
```typescript
// Memoized selectors
const filteredData = useMemo(() =>
  data.filter(applyFilters),
  [data, filters]
);

// Debounced search
const debouncedSearch = useDebounce(searchTerm, 300);

// Optimistic updates
const handleUpdate = async (id, updates) => {
  // Update UI immediately
  setData(data.map(item =>
    item.id === id ? { ...item, ...updates } : item
  ));

  // Sync to database
  await supabase.from('table').update(updates).eq('id', id);
};
```

---

## Testing Strategy

### Unit Tests
- Service functions (pay package calculations)
- Utility functions (date formatting, validation)
- State management (Zustand store actions)

### Integration Tests
- Drag-and-drop workflows
- Email template generation
- Cross-dashboard data flow

### E2E Tests
- Complete user journeys
- Prospect → Contract workflow
- Extension approval process

---

## Deployment & Scaling

### Current Architecture
```
Vite (Frontend) → Supabase (Backend + DB)
                ↓
         Edge Functions (Email, AI)
```

### Future Enhancements
1. **Real-time Subscriptions**: Live updates across users
2. **Caching Layer**: Redis for frequently accessed data
3. **Job Queue**: Bull/BeeQueue for async operations
4. **Analytics**: PostHog or Mixpanel integration
5. **Mobile App**: React Native using same Supabase backend

---

## Code Organization

```
src/
├── components/
│   ├── ActiveAssignmentsDashboard.tsx
│   ├── PipelineDashboard.tsx
│   ├── PriorityDashboard.tsx
│   ├── ProspectsDashboard.tsx
│   ├── FollowUpDashboard.tsx
│   └── prospects/
│       ├── AddProspectModal.tsx
│       ├── EditProspectModal.tsx
│       ├── EmailTemplateModal.tsx
│       └── ProfileUpdateModal.tsx
├── services/
│   ├── payPackageService.ts
│   ├── outlookService.ts
│   └── extractionService.ts
├── shared/
│   ├── components/         # Reusable UI components
│   ├── hooks/             # Custom hooks
│   ├── services/          # Data layer
│   └── types/             # TypeScript interfaces
├── store/
│   ├── useAppStore.ts     # Zustand store
│   └── batchStore.ts      # Batch operations
└── lib/
    └── supabase.ts        # Supabase client
```

---

## Key Principles

### 1. **Single Source of Truth**
Each table owns its domain. No duplicate data.

### 2. **Optimistic UI**
Update UI immediately, sync to database async.

### 3. **Progressive Enhancement**
Core functionality works without JS, enhanced with interactions.

### 4. **Graceful Degradation**
Fallbacks for failed API calls, offline support.

### 5. **Zero Surprises**
Predictable behavior, clear feedback, no hidden states.

---

## Next Steps for Enhancement

### Immediate Wins
1. Add real-time subscriptions for multi-user collaboration
2. Implement undo/redo for drag-and-drop
3. Add keyboard shortcuts (cmd+k command palette)
4. Create mobile-responsive layouts

### Medium-term
1. Build analytics dashboard
2. Add automated follow-up scheduling
3. Implement smart candidate matching
4. Create bulk import/export tools

### Long-term
1. AI-powered email personalization
2. Predictive analytics for success rates
3. Mobile app for on-the-go management
4. Third-party integrations (Calendar, Slack, etc.)

---

## Conclusion

This architecture prioritizes:
- **Clarity** - Each component has one job
- **Consistency** - Same patterns everywhere
- **Confidence** - Predictable behavior
- **Craft** - Attention to detail

The result: A system that feels simple to use while managing incredible complexity behind the scenes.

*"Simplicity is the ultimate sophistication."* – Leonardo da Vinci
