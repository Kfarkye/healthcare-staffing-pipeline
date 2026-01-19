# Integration Guide: Connecting the Pieces

## Visual System Map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         HEALTHCARE STAFFING SYSTEM                        │
│                    "Complexity Made Simple" Architecture                  │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  prospects   │  │  candidates  │  │ engagements  │  │interested_  ││
│  │              │  │              │  │              │  │  clicks     ││
│  │ • status     │  │ • stage      │  │ • extension_ │  │ • job_id    ││
│  │ • order      │  │ • lane       │  │   stage      │  │ • status    ││
│  │ • followup_  │  │ • signed_    │  │ • status     │  │             ││
│  │   stage      │  │   date       │  │              │  │             ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
│         │                 │                  │                  │       │
└─────────┼─────────────────┼──────────────────┼──────────────────┼───────┘
          │                 │                  │                  │
┌─────────┼─────────────────┼──────────────────┼──────────────────┼───────┐
│         │    COMPONENT LAYER - DRAG & DROP ENABLED            │       │
├─────────┼─────────────────┼──────────────────┼──────────────────┼───────┤
│         ↓                 ↓                  ↓                  ↓       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  Prospects   │  │   Pipeline   │  │   Active     │  │  Priority   ││
│  │  Dashboard   │  │  Dashboard   │  │ Assignments  │  │  Dashboard  ││
│  │              │  │              │  │  Dashboard   │  │             ││
│  │ 6 Columns:   │  │ 3 Tabs:      │  │ 6 Stages:    │  │ Outreach to ││
│  │ • New        │  │ • Offered    │  │ • Outreach   │  │ interested  ││
│  │ • Contacted  │  │ • Pre-Start  │  │ • Follow-Up  │  │ candidates  ││
│  │ • Interested │  │ • Signed     │  │ • Verbal     │  │             ││
│  │ • Profile    │  │              │  │ • Submitted  │  │ + Pay Pkg   ││
│  │   Updates    │  │ Drag cards   │  │ • Approved   │  │ + Templates ││
│  │ • Submittal  │  │ between tabs │  │ • Signed     │  │             ││
│  │   Ready      │  │              │  │              │  │             ││
│  │ • Submitted  │  │              │  │ Drag between │  │             ││
│  │              │  │              │  │ columns      │  │             ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────────────┘│
│         │                 │                  │                          │
│         │ Follow-Up Loop  │                  │                          │
│         └─────────┐       │                  │                          │
│                   ↓       │                  │                          │
│            ┌──────────────┴┐                 │                          │
│            │   Follow-Up   │                 │                          │
│            │   Dashboard   │                 │                          │
│            │               │                 │                          │
│            │ 4 Stages:     │                 │                          │
│            │ • Initial     │                 │                          │
│            │ • 3-Day Stall │                 │                          │
│            │ • Final Push  │                 │                          │
│            │ • Ready Exit  │                 │                          │
│            │               │                 │                          │
│            │ + Batch Email │                 │                          │
│            └───────────────┘                 │                          │
│                                              │                          │
└──────────────────────────────────────────────┼──────────────────────────┘
                                               │
┌──────────────────────────────────────────────┼──────────────────────────┐
│                         SERVICE LAYER        ↓                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │
│  │ payPackageService│  │ emailService    │  │ outlookService      │   │
│  │                  │  │                 │  │                     │   │
│  │ • getPackage     │  │ • generateEmail │  │ • buildMailtoLink   │   │
│  │ • calculate      │  │ • sendBatch     │  │ • openOutlook       │   │
│  │ • generateFrom   │  │ • templateFill  │  │                     │   │
│  │   Click          │  │                 │  │                     │   │
│  └──────────────────┘  └─────────────────┘  └─────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Flow Diagrams

### Flow 1: Lead → Prospect → Submission

```
┌─────────────────────────────────────────────────────────────────┐
│ JOURNEY: From Interested Click to Submitted Candidate           │
└─────────────────────────────────────────────────────────────────┘

1. Lead Generation
   ┌──────────────────────────────────────────┐
   │ interested_clicks table                  │
   │ • Candidate clicks "interested" on job   │
   └──────────────┬───────────────────────────┘
                  ↓
   ┌──────────────────────────────────────────┐
   │ PriorityDashboard                        │
   │ • Recruiter sees click                   │
   │ • Generates pay package                  │
   │ • Sends outreach email                   │
   └──────────────┬───────────────────────────┘
                  ↓

2. Prospect Creation
   ┌──────────────────────────────────────────┐
   │ Action: Create Prospect Button          │
   │                                          │
   │ INSERT INTO prospects (                 │
   │   candidate_id,                         │
   │   name,                                 │
   │   email,                                │
   │   specialty,                            │
   │   status = 'New'  ← Enters kanban       │
   │ )                                       │
   └──────────────┬───────────────────────────┘
                  ↓

3. Qualification Process
   ┌──────────────────────────────────────────┐
   │ ProspectsDashboard (Kanban)             │
   │                                          │
   │ Drag through columns:                   │
   │   New → Contacted → Interested →        │
   │   Profile Updates → Submittal Ready     │
   │                                          │
   │ Track progress:                         │
   │ • References collected (0/2)            │
   │ • Profile complete (boolean)            │
   │ • Licenses verified (array)             │
   └──────────────┬───────────────────────────┘
                  ↓

4. Stall Detection (if needed)
   ┌──────────────────────────────────────────┐
   │ If no activity for 3+ days:             │
   │                                          │
   │ UPDATE prospects SET                    │
   │   followup_stage = 'FU_INITIAL',        │
   │   last_contacted_at = NOW()             │
   │                                          │
   │ → Appears in FollowUpDashboard          │
   │ → Batch email workflow                  │
   │ → Return to main pipeline when active   │
   └──────────────┬───────────────────────────┘
                  ↓

5. Submission
   ┌──────────────────────────────────────────┐
   │ Drag to "Submitted" column              │
   │                                          │
   │ UPDATE prospects SET                    │
   │   status = 'Submitted'                  │
   │                                          │
   │ → Ready for facility review             │
   └─────────────────────────────────────────┘
```

### Flow 2: Offer → Signature → Contract

```
┌─────────────────────────────────────────────────────────────────┐
│ JOURNEY: From Offer to Active Contract                          │
└─────────────────────────────────────────────────────────────────┘

1. Offer Extended
   ┌──────────────────────────────────────────┐
   │ Facility extends offer to candidate      │
   │                                          │
   │ INSERT INTO candidates (                │
   │   candidate_id,                         │
   │   full_name,                            │
   │   stage = 'offered',  ← Pipeline start  │
   │   offer_date = NOW(),                   │
   │   facility,                             │
   │   rate,                                 │
   │   weekly_gross                          │
   │ )                                       │
   └──────────────┬───────────────────────────┘
                  ↓

2. Pipeline Tracking
   ┌──────────────────────────────────────────┐
   │ PipelineDashboard - "Offered" Tab       │
   │                                          │
   │ Cards show:                             │
   │ • Days in offer stage                   │
   │ • Urgency indicator (>5 days = amber)   │
   │ • Call/Email action buttons             │
   │                                          │
   │ Recruiter follows up daily              │
   └──────────────┬───────────────────────────┘
                  ↓

3. Candidate Accepts
   ┌──────────────────────────────────────────┐
   │ Action: Drag card to "Signed" tab       │
   │                                          │
   │ UPDATE candidates SET                   │
   │   stage = 'signed',                     │
   │   signed_date = NOW()  ← Auto-timestamp │
   │                                          │
   │ → Moves to "Signed" tab                 │
   │ → Celebrated! 🎉                        │
   └──────────────┬───────────────────────────┘
                  ↓

4. Pre-Start Prep
   ┌──────────────────────────────────────────┐
   │ PipelineDashboard - "Pre-Start" Tab     │
   │                                          │
   │ Cards show:                             │
   │ • Days until start date                 │
   │ • Urgency (≤3 days = red, ≤7 = amber)   │
   │ • Onboarding checklist                  │
   │                                          │
   │ Automatic sorting by start_date         │
   └──────────────┬───────────────────────────┘
                  ↓

5. Contract Activation
   ┌──────────────────────────────────────────┐
   │ On start_date:                          │
   │                                          │
   │ INSERT INTO engagements (               │
   │   candidate_id,                         │
   │   candidate_name,                       │
   │   facility_name,                        │
   │   start_date,                           │
   │   end_date,                             │
   │   status = 'Active',                    │
   │   extension_stage = 'outreach' ← Track! │
   │ )                                       │
   │                                          │
   │ → Appears in ActiveAssignmentsDashboard │
   └─────────────────────────────────────────┘
```

### Flow 3: Extension Management

```
┌─────────────────────────────────────────────────────────────────┐
│ JOURNEY: Managing Contract Extensions                           │
└─────────────────────────────────────────────────────────────────┘

1. Extension Workflow Start
   ┌──────────────────────────────────────────┐
   │ 8 weeks before end_date:                │
   │                                          │
   │ engagements WHERE                       │
   │   end_date BETWEEN NOW()                │
   │   AND NOW() + INTERVAL '8 weeks'        │
   │                                          │
   │ → Appears in ActiveAssignmentsDashboard │
   │ → extension_stage = 'outreach'          │
   └──────────────┬───────────────────────────┘
                  ↓

2. Recruiter Outreach
   ┌──────────────────────────────────────────┐
   │ ActiveAssignmentsDashboard               │
   │ "Outreach" Column                       │
   │                                          │
   │ Actions:                                │
   │ • Click candidate name → Nova profile   │
   │ • Click email → AssignmentEmailModal    │
   │ • Call button → Phone                   │
   │                                          │
   │ After contact:                          │
   │ → Drag to "Follow-Up" column            │
   └──────────────┬───────────────────────────┘
                  ↓

3. Candidate Response
   ┌──────────────────────────────────────────┐
   │ If interested:                          │
   │ → Drag to "Verbal Commitment"           │
   │                                          │
   │ UPDATE engagements SET                  │
   │   extension_stage = 'verbal'            │
   │                                          │
   │ → Prepare extension contract            │
   └──────────────┬───────────────────────────┘
                  ↓

4. Facility & Margin Approval
   ┌──────────────────────────────────────────┐
   │ → Drag to "Submitted for Approval"      │
   │                                          │
   │ Facility reviews extension              │
   │ Finance checks margin requirements      │
   │                                          │
   │ If approved:                            │
   │ → Drag to "Approved"                    │
   │                                          │
   │ UPDATE engagements SET                  │
   │   extension_stage = 'approved'          │
   └──────────────┬───────────────────────────┘
                  ↓

5. Extension Signed
   ┌──────────────────────────────────────────┐
   │ → Drag to "Signed" column               │
   │                                          │
   │ UPDATE engagements SET                  │
   │   extension_stage = 'signed',           │
   │   previous_extensions = previous + 1,   │
   │   end_date = new_end_date               │
   │                                          │
   │ → Continues active work                 │
   │ → Cycle repeats 8 weeks before new end │
   └─────────────────────────────────────────┘
```

---

## Database Integration Points

### Key Field Mappings

```typescript
// How different tables connect

// Prospect → Candidate transition
prospects.candidate_id === candidates.candidate_id

// Candidate → Engagement transition
candidates.candidate_id === engagements.candidate_id

// Priority → Prospect flow
interested_clicks.candidate_name → prospects.name
interested_clicks.job_id → pay_packages.job_id

// Pay package lookup
interested_clicks.job_id === pay_packages.job_id
candidates.job_id === pay_packages.job_id
```

### Status/Stage Mappings

```typescript
// Prospect statuses (ProspectsDashboard)
type ProspectStatus =
  | 'New'
  | 'Contacted'
  | 'Interested'
  | 'Profile Updates'
  | 'Submittal Ready'
  | 'Submitted';

// Candidate stages (PipelineDashboard)
type CandidateStage =
  | 'offered'
  | 'prestart'
  | 'signed';

// Extension stages (ActiveAssignmentsDashboard)
type ExtensionStage =
  | 'outreach'
  | 'follow-up'
  | 'verbal'
  | 'submitted'
  | 'approved'
  | 'signed';

// Follow-up stages (FollowUpDashboard)
type FollowUpStage =
  | 'FU_INITIAL'
  | 'FU_STALL_3D'
  | 'FU_FINAL_7_10'
  | 'FU_TO_EXIT';

// Click statuses (PriorityDashboard)
type ClickStatus =
  | 'New'
  | 'Contacted'
  | 'Submitted'
  | 'Closed';
```

---

## Shared Component Patterns

### Email Generation Pattern

**Used By:** PriorityDashboard, FollowUpDashboard, ActiveAssignmentsDashboard

```typescript
// 1. Fetch pay package
const payPackage = await payPackageService.getPackage(jobId);

// 2. Generate template
const template = payPackageService.generateEmailTemplate(
  candidateName,
  jobData,
  payPackage
);

// 3. Open email client
const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(template.subject)}&body=${encodeURIComponent(template.body)}`;
window.open(mailtoUrl, '_blank');

// 4. Update last contact
await supabase
  .from('prospects')
  .update({ last_contacted_at: new Date().toISOString() })
  .eq('id', prospectId);
```

### Drag-and-Drop Pattern

**Used By:** ProspectsDashboard, PipelineDashboard, ActiveAssignmentsDashboard, FollowUpDashboard

```typescript
// Setup
const [activeId, setActiveId] = useState<string | null>(null);
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }
  })
);

// Handlers
const handleDragStart = (event: DragEndEvent) => {
  setActiveId(event.active.id as string);
};

const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;

  if (!over) return;

  const itemId = active.id;
  const newColumn = over.id;

  // Optimistic update
  updateUIImmediately(itemId, newColumn);

  // Database sync
  await supabase
    .from('table')
    .update({ column_field: newColumn })
    .eq('id', itemId);

  // Refresh
  refetch();
};

// Render
<DndContext
  sensors={sensors}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={items}>
    {items.map(item => (
      <DraggableCard key={item.id} item={item} />
    ))}
  </SortableContext>

  <DragOverlay>
    {activeId && <CardPreview />}
  </DragOverlay>
</DndContext>
```

### Modal Pattern

**Used By:** All dashboards

```typescript
// State
const [modal, setModal] = useState<{
  isOpen: boolean;
  type: 'add' | 'edit' | 'email';
  data?: any;
}>({ isOpen: false, type: 'add' });

// Open modal
const openModal = (type: string, data?: any) => {
  setModal({ isOpen: true, type, data });
};

// Close modal
const closeModal = () => {
  setModal({ isOpen: false, type: 'add' });
};

// Save handler
const handleSave = async (updates: any) => {
  await supabase.from('table').update(updates).eq('id', modal.data.id);
  closeModal();
  refetch();
};

// Render
{modal.isOpen && modal.type === 'edit' && (
  <EditModal
    isOpen={modal.isOpen}
    onClose={closeModal}
    data={modal.data}
    onSave={handleSave}
  />
)}
```

---

## State Management Patterns

### Global State (Zustand) - ProspectsDashboard

```typescript
// store/useAppStore.ts
export const useAppStore = create<ProspectState>((set, get) => ({
  prospects: [],
  filters: { searchTerm: '', selectedProfessions: [] },

  fetchProspects: async () => {
    const { data } = await supabase.from('prospects').select('*');
    set({ prospects: data });
  },

  updateProspectStatus: (id, status) => {
    // Optimistic update
    set(state => ({
      prospects: state.prospects.map(p =>
        p.id === id ? { ...p, status } : p
      )
    }));

    // Async sync
    supabase.from('prospects').update({ status }).eq('id', id);
  }
}));

// Component usage
const ProspectsDashboard = () => {
  const { prospects, fetchProspects, updateProspectStatus } = useAppStore();

  useEffect(() => {
    fetchProspects();
  }, []);

  return <KanbanBoard prospects={prospects} onMove={updateProspectStatus} />;
};
```

### Local State with Hooks - Other Dashboards

```typescript
// Custom hook pattern
const usePipelineData = () => {
  const [data, setData] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('candidates')
      .select('*')
      .eq('stage', 'offered');
    setData(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return { data, setData, loading, refetch: fetchData };
};

// Component usage
const PipelineDashboard = () => {
  const { data, setData, loading, refetch } = usePipelineData();

  const handleDragEnd = async (event) => {
    // Update immediately
    setData(optimisticUpdate(data, event));

    // Sync to DB
    await supabase.from('candidates').update(...);

    // Refresh
    refetch();
  };

  return <DraggablePipeline data={data} onDragEnd={handleDragEnd} />;
};
```

---

## Error Handling Strategy

### Pattern 1: Optimistic with Rollback

```typescript
const handleUpdate = async (id: string, updates: any) => {
  // Save current state
  const previousData = [...data];

  // Optimistic update
  setData(data.map(item =>
    item.id === id ? { ...item, ...updates } : item
  ));

  try {
    const { error } = await supabase
      .from('table')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    // Rollback on error
    setData(previousData);
    showToast('Update failed', 'error');
  }
};
```

### Pattern 2: Loading States

```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const fetchData = async () => {
  setLoading(true);
  setError(null);

  try {
    const { data, error } = await supabase.from('table').select('*');
    if (error) throw error;
    setData(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

// Render
if (loading) return <LoadingSpinner />;
if (error) return <ErrorState message={error} retry={fetchData} />;
return <DataView data={data} />;
```

---

## Testing Integration

### Unit Test Example

```typescript
// services/payPackageService.test.ts
describe('PayPackageService', () => {
  it('calculates compliant pay package', async () => {
    const result = await payPackageService.calculatePackage(
      'job123',
      'CA',
      'Los Angeles',
      'RN',
      'ICU',
      3000,
      36
    );

    expect(result.is_compliant).toBe(true);
    expect(result.gross_weekly_pay).toBeGreaterThanOrEqual(3000);
    expect(result.taxable_hourly_rate).toBeGreaterThanOrEqual(20); // CA minimum
  });
});
```

### Integration Test Example

```typescript
// components/PipelineDashboard.test.tsx
describe('PipelineDashboard', () => {
  it('moves candidate between stages on drag', async () => {
    render(<PipelineDashboard />);

    const candidate = screen.getByText('John Doe');
    const signedTab = screen.getByText('Signed');

    // Drag candidate to signed tab
    await dragAndDrop(candidate, signedTab);

    // Verify database update
    const { data } = await supabase
      .from('candidates')
      .select('stage, signed_date')
      .eq('full_name', 'John Doe')
      .single();

    expect(data.stage).toBe('signed');
    expect(data.signed_date).toBeTruthy();
  });
});
```

---

## Next Actions for Developer

### 1. **Verify Database Schema**
Run the migration to add `extension_stage`:
```sql
-- Already created in previous step
-- Just run it in Supabase dashboard SQL editor
```

### 2. **Test Drag-and-Drop Flows**
- ProspectsDashboard: Drag between 6 columns
- PipelineDashboard: Drag between 3 tabs
- ActiveAssignmentsDashboard: Drag between 6 stages
- FollowUpDashboard: Drag between 4 stages

### 3. **Verify Email Integration**
- Test pay package generation
- Test email template population
- Test Outlook integration

### 4. **Check Data Flow**
- Create prospect → moves through pipeline
- Interested click → prospect conversion
- Prospect → candidate → engagement

### 5. **Monitor Performance**
- Check load times for large datasets
- Verify optimistic updates work smoothly
- Test real-time refresh (30-second intervals)

---

## Support & Maintenance

### Common Issues & Solutions

**Issue:** Drag-and-drop not working
**Solution:** Ensure `extension_stage` column exists in database

**Issue:** Email templates empty
**Solution:** Verify pay_packages table has data for job_id

**Issue:** Cards snap back after drag
**Solution:** Check Supabase RLS policies allow authenticated updates

**Issue:** Data not refreshing
**Solution:** Verify 30-second refresh interval is running

---

## Conclusion

This system is designed as a **unified whole** where each piece serves a clear purpose:

1. **PriorityDashboard** - Capture interested leads
2. **ProspectsDashboard** - Qualify candidates
3. **FollowUpDashboard** - Recover stalled prospects
4. **PipelineDashboard** - Track offers to signatures
5. **ActiveAssignmentsDashboard** - Manage extensions

All connected through shared services, consistent patterns, and a single source of truth in Supabase.

**Result:** Complexity is hidden, clarity is revealed. ✨
