# Quick Start: Schema & Design Patterns

## Data Model & Schema

### ✅ SQL Ingestion & Types
- Place SQL in `supabase/migrations/`
- TypeScript types auto-generated from schema
- Run codegen after schema changes: `npx supabase gen types typescript`

### ✅ ENUMs to TypeScript
```typescript
// Config-driven approach (see src/config/prospects.ts)
export const PROSPECT_STATUSES = {
  NEW: { value: 'New', label: 'New', color: 'blue' },
  CONTACTED: { value: 'Contacted', label: 'Contacted', color: 'yellow' },
  // ... etc
};

// Or use dynamic hook:
const { data: statusOptions } = useSchemaEnum('prospects', 'status');
```

### ✅ FK Integrity
- **Complex joins**: Use Postgres views (`active_board_view`, `exits_view`)
- **Simple lookups**: Client hydration
- **Aggregations**: RPC functions

### ✅ Nullable Relations
```typescript
// Forms
const schema = z.object({
  engagement_id: z.number().nullable().optional(),
});

// UI
{engagement?.facility_name || 'N/A'}
```

---

## API & Services

### ✅ CRUD Organization
Colocate per feature. Each dashboard owns its service layer.

```
src/services/
  extractionService.ts    # Shared utility
  schemaService.ts        # Shared schema helpers
src/components/
  ProspectsDashboard/
    services/
      prospectService.ts  # Prospect-specific CRUD
```

### ✅ Optimistic Updates
- **Server round-trip** for CRUD
- **Optimistic** for UI state (filters, sorts)
- Use TanStack Query for automatic cache invalidation

### ✅ Retry & Dedupe
```typescript
// Supabase client handles retries automatically
// Debounce search inputs
const debouncedSearch = useDebounce(searchTerm, 300);

// Prevent flood-clicks
<button disabled={isSubmitting}>Submit</button>
```

---

## Auth & RLS

### ✅ RLS Context
```sql
-- Automatic JWT context via auth.uid()
CREATE POLICY "Users see own prospects"
  ON prospects FOR SELECT
  TO authenticated
  USING (recruiter_id = auth.uid());
```

### ✅ Audit Trails
```sql
-- Preferred: DB triggers
CREATE TRIGGER set_updated_by
  BEFORE UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_by_trigger();
```

---

## Storage & Drafts

### ✅ Email Draft Persistence
```typescript
// Save draft
await supabase.from('email_drafts').upsert({
  prospect_id: id,
  user_id: userId,
  subject,
  body,
});

// Restore draft
const { data } = await supabase
  .from('email_drafts')
  .select('*')
  .eq('prospect_id', id)
  .eq('user_id', userId)
  .maybeSingle();
```

### ✅ File Upload
```typescript
// Upload to storage
const filePath = `templates/${prospectId}/${timestamp}-${fileName}`;
await supabase.storage.from('screenshots').upload(filePath, file);

// Save reference in DB
await supabase.from('prospects').update({
  template_file_path: filePath,
  template_uploaded_at: new Date().toISOString(),
}).eq('id', prospectId);
```

---

## Performance

### ✅ Pagination
```typescript
// Server-side with range()
const { data, count } = await supabase
  .from('prospects')
  .select('*', { count: 'exact' })
  .range(offset, offset + limit - 1);

// For 10k+ rows, use cursor-based:
.gt('id', lastId)
.limit(50);
```

### ✅ Virtualized Lists
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 72, // row height
});
```

---

## UI/UX

### ✅ Design System
```typescript
import { Button, Badge, Input } from '@/design-system/core';
import { SearchIcon } from '@/design-system/icons';
import { Card, StatCard } from '@/design-system/modules';
```

### ✅ ENUM Selects
```typescript
const { data: statusOptions } = useSchemaEnum('prospects', 'status');

<Select
  options={statusOptions}
  value={selectedStatus}
  onChange={setSelectedStatus}
/>
```

### ✅ Motion
```typescript
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
  {content}
</motion.div>
```

---

## Forms & Validation

### ✅ Zod + React Hook Form
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email().nullable(),
  status: z.enum(['New', 'Contacted', 'Interested']),
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```

### ✅ Blank → Null Coercion
```typescript
// Service layer normalization
function normalizeProspect(data: FormData) {
  return {
    ...data,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
  };
}
```

---

## State Management

### ✅ TanStack Query + Zustand
```typescript
// Server state: TanStack Query
const { data: prospects } = useQuery({
  queryKey: ['prospects'],
  queryFn: fetchProspects,
});

// UI state: Zustand
const { filters, setFilters } = useAppStore();
```

### ✅ Toasts
```typescript
import { useToast } from '@/shared/hooks';

const showToast = useToast();
showToast('Prospect saved successfully', 'success');
```

---

## Testing & CI/CD

### ✅ Environment Variables
```bash
# .env (local)
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-anon-key

# Vercel (prod)
# Set via dashboard
```

### ✅ Testing
```bash
# Unit tests (future)
npm install -D vitest

# E2E tests (future)
npm install -D @playwright/test
```

---

## Codegen & Views

### ✅ Manual Snapshots
```bash
# After schema changes
npx supabase gen types typescript --local > src/types/supabase.ts
git add src/types/supabase.ts
git commit -m "chore: update database types"
```

### ✅ Read-Optimized Views
```sql
-- Create view for complex dashboards
CREATE OR REPLACE VIEW active_assignments_view AS
SELECT
  e.*,
  f.name as facility_name,
  j.specialty,
  p.name as prospect_name
FROM engagements e
LEFT JOIN facilities f ON e.facility_id = f.id
LEFT JOIN jobs j ON e.job_id = j.id
LEFT JOIN prospects p ON e.prospect_id = p.id
WHERE e.status = 'Active';
```

---

## Accessibility

### ✅ Non-Negotiables
```tsx
// Focus states (automatic with Tailwind)
<button className="focus:ring-2 focus:ring-blue-500">

// ARIA labels for icons
<button aria-label="Delete prospect">
  <Trash2 />
</button>

// Keyboard nav for modals
useEffect(() => {
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, []);

// Toast announcements
<div role="alert" aria-live="polite">
  {toastMessage}
</div>
```

---

## Common Patterns

### Full-Text Search
```typescript
const { data } = await supabase
  .from('prospects')
  .select('*')
  .textSearch('search_vector', searchTerm, {
    type: 'websearch',
    config: 'english',
  });
```

### Bulk Updates
```typescript
const { data } = await supabase.rpc('bulk_update_prospect_status', {
  prospect_ids: [1, 2, 3, 4, 5],
  new_status: 'Contacted',
});
```

### Dynamic ENUMs
```typescript
const { data: professions } = useSchemaEnum('prospects', 'profession');
const { data: specialties } = useSchemaEnum('prospects', 'specialty');
```

### Template Persistence
```typescript
// Save
await supabase.from('prospects').update({
  template_file_path: filePath,
  template_extracted_data: extracted,
  template_uploaded_at: new Date().toISOString(),
}).eq('id', prospectId);

// Restore
if (prospect.template_file_path) {
  setExtractedData(prospect.template_extracted_data);
}
```

---

## Quick Wins

1. **Use views for complex joins** → reduces client-side logic
2. **Cache ENUMs for 1 hour** → eliminates redundant queries
3. **Debounce search inputs** → reduces server load
4. **Use `maybeSingle()` not `single()`** → avoids null errors
5. **Enable full-text search** → instant 10x faster searches
6. **Batch bulk operations** → single RPC vs N queries

---

**Need Help?**
- See `/docs/TEMPLATE_PERSISTENCE_IMPLEMENTATION.md` for detailed guide
- Check `/docs/database-schema.md` for complete schema reference
- Review existing components in `/src/components/` for patterns
