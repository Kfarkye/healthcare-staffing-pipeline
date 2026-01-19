# Rollout Checklist: Template Persistence & Platform Enhancements

## Pre-Deployment

### Environment Check
- [ ] Supabase project is accessible
- [ ] Have admin access to SQL Editor
- [ ] Backup database (optional but recommended)
- [ ] Note current schema version

---

## Phase 1: Database Migrations (15 min)

### Apply Migration 1: Template Persistence
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy contents of `supabase/migrations/20251008000001_template_persistence.sql`
- [ ] Paste into SQL Editor
- [ ] Click "Run" (or press Cmd/Ctrl + Enter)
- [ ] Verify success message appears
- [ ] Run verification query:
  ```sql
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'prospects'
    AND column_name LIKE 'template_%';
  ```
  Expected result: 3 rows (template_file_path, template_extracted_data, template_uploaded_at)

### Apply Migration 2: Platform Enhancements
- [ ] Copy contents of `supabase/migrations/20251008000002_platform_enhancements.sql`
- [ ] Paste into SQL Editor
- [ ] Click "Run"
- [ ] Verify success message appears
- [ ] Run verification queries:
  ```sql
  -- Check email_drafts table
  SELECT table_name FROM information_schema.tables
  WHERE table_name = 'email_drafts';

  -- Check RPC functions
  SELECT proname FROM pg_proc
  WHERE proname IN ('get_enum_values', 'bulk_update_prospect_status');

  -- Check search_vector column
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'prospects' AND column_name = 'search_vector';
  ```
  Expected: All queries return results

### Test Database Functions
- [ ] Test ENUM fetcher:
  ```sql
  SELECT get_enum_values('prospects', 'status');
  ```
  Expected: Array of status values

- [ ] Test bulk update (dry run):
  ```sql
  SELECT * FROM bulk_update_prospect_status(
    ARRAY[1, 2, 3]::bigint[],
    'Contacted'
  );
  ```
  Expected: Returns updated rows (or error if IDs don't exist - that's OK for now)

- [ ] Test full-text search:
  ```sql
  SELECT id, name FROM prospects
  WHERE search_vector @@ to_tsquery('english', 'nurse');
  LIMIT 5;
  ```
  Expected: Matching prospects (or empty if no nurses in DB)

---

## Phase 2: Frontend Integration (30 min)

### Verify Type Updates
- [ ] Open `src/shared/types/database.ts`
- [ ] Confirm `Prospect` interface includes:
  - `template_file_path?: string | null;`
  - `template_extracted_data?: any | null;`
  - `template_uploaded_at?: string | null;`

### Test useSchemaEnum Hook
- [ ] Create test component (or use existing select):
  ```tsx
  import { useSchemaEnum } from '@/shared/hooks';

  function TestENUM() {
    const { data, isLoading, error } = useSchemaEnum('prospects', 'status');

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
      <select>
        {data?.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  ```
- [ ] Verify dropdown populates with status options
- [ ] Check browser DevTools → Network → should see RPC call to `get_enum_values`
- [ ] Reload page → verify cached (no new network request)

### Update ProspectsDashboard Query
- [ ] Find the query that fetches prospects (likely in `ProspectsDashboard.tsx` or a hook)
- [ ] Add template fields to select:
  ```typescript
  const { data: prospects } = await supabase
    .from('prospects')
    .select(`
      *,
      template_file_path,
      template_extracted_data,
      template_uploaded_at
    `);
  ```
- [ ] Save and verify no TypeScript errors

### Update EmailTemplateModal
- [ ] Open `src/components/prospects/EmailTemplateModal.tsx`
- [ ] Add restoration logic on mount:
  ```typescript
  useEffect(() => {
    if (prospect.template_file_path && prospect.template_extracted_data) {
      console.log('[EmailModal] Restoring template from cache');
      setExtractedData(prospect.template_extracted_data);
      setUploadStatus('done');
    }
  }, [prospect]);
  ```
- [ ] Update upload handler to save to database:
  ```typescript
  const handleFileUpload = async (file: File) => {
    setUploadStatus('uploading');

    try {
      // Extract data
      const extracted = await ExtractionService.extractDataFromAssignmentFile(file);

      // Upload file
      const filePath = `templates/${prospect.id}/${Date.now()}-${file.name}`;
      await supabase.storage.from('screenshots').upload(filePath, file);

      // Save to database
      await supabase.from('prospects').update({
        template_file_path: filePath,
        template_extracted_data: extracted,
        template_uploaded_at: new Date().toISOString(),
      }).eq('id', prospect.id);

      setExtractedData(extracted);
      setUploadStatus('done');
      showToast('Template saved successfully', 'success');
    } catch (err) {
      setUploadStatus('error');
      showToast(err.message, 'error');
    }
  };
  ```
- [ ] Add clear template button:
  ```tsx
  {uploadStatus === 'done' && (
    <button
      onClick={async () => {
        if (prospect.template_file_path) {
          await supabase.storage
            .from('screenshots')
            .remove([prospect.template_file_path]);
        }

        await supabase.from('prospects').update({
          template_file_path: null,
          template_extracted_data: null,
          template_uploaded_at: null,
        }).eq('id', prospect.id);

        setExtractedData(null);
        setUploadStatus('idle');
        showToast('Template cleared', 'info');
      }}
      className="btn-secondary"
    >
      <Trash2 className="w-4 h-4" />
      Clear Template
    </button>
  )}
  ```

### Build Check
- [ ] Run `npm run build`
- [ ] Verify build succeeds with no TypeScript errors
- [ ] Check for any new warnings (bundle size is expected)

---

## Phase 3: Manual Testing (20 min)

### Template Persistence Flow
1. [ ] Open ProspectsDashboard
2. [ ] Select a prospect without a template
3. [ ] Open EmailTemplateModal
4. [ ] Upload a screenshot (PNG/JPG)
5. [ ] Wait for extraction to complete
6. [ ] Verify extracted data displays in modal
7. [ ] Close the modal
8. [ ] Reopen modal for the same prospect
9. [ ] **VERIFY:** Extracted data is instantly restored
10. [ ] Click "Clear Template"
11. [ ] **VERIFY:** Modal resets to upload state
12. [ ] Check database:
    ```sql
    SELECT id, name, template_file_path, template_uploaded_at
    FROM prospects WHERE id = [prospect_id];
    ```
    Expected: `template_file_path` is NULL after clearing

### Cross-Device Sync
1. [ ] On Device A: Upload template for Prospect X
2. [ ] On Device B: Open ProspectsDashboard
3. [ ] On Device B: Open EmailTemplateModal for Prospect X
4. [ ] **VERIFY:** Template data appears without re-uploading

### Email Drafts
1. [ ] Open EmailTemplateModal
2. [ ] Compose email subject + body
3. [ ] Implement draft saving (if not already done):
   ```typescript
   const saveDraft = async () => {
     await supabase.from('email_drafts').upsert({
       prospect_id: prospect.id,
       user_id: (await supabase.auth.getUser()).data.user?.id,
       subject: emailSubject,
       body: emailBody,
     });
   };

   // Call on blur or every 5 seconds
   useEffect(() => {
     const timer = setInterval(saveDraft, 5000);
     return () => clearInterval(timer);
   }, [emailSubject, emailBody]);
   ```
4. [ ] Close modal
5. [ ] Reopen modal
6. [ ] **VERIFY:** Email subject/body restored

### Dynamic ENUMs
1. [ ] Find a status/profession/specialty dropdown
2. [ ] Replace hardcoded options with `useSchemaEnum`:
   ```tsx
   const { data: statusOptions } = useSchemaEnum('prospects', 'status');
   ```
3. [ ] **VERIFY:** Dropdown populates correctly
4. [ ] Open DevTools → Network tab
5. [ ] Reload page
6. [ ] **VERIFY:** Only 1 RPC call to `get_enum_values` (cached after first load)

### Bulk Operations
1. [ ] Select 5+ prospects in dashboard (add checkboxes if not present)
2. [ ] Implement bulk status change:
   ```typescript
   const handleBulkUpdate = async () => {
     await supabase.rpc('bulk_update_prospect_status', {
       prospect_ids: selectedIds,
       new_status: 'Contacted',
     });

     // Invalidate query to refresh UI
     queryClient.invalidateQueries(['prospects']);
   };
   ```
3. [ ] Click "Mark as Contacted"
4. [ ] **VERIFY:** All selected prospects update status
5. [ ] Check database:
    ```sql
    SELECT id, status, updated_at FROM prospects WHERE id IN (1,2,3,4,5);
    ```
    Expected: All have new status and recent `updated_at`

### Full-Text Search
1. [ ] Add search input to ProspectsDashboard (if not present)
2. [ ] Implement search query:
   ```typescript
   const { data } = await supabase
     .from('prospects')
     .select('*')
     .textSearch('search_vector', debouncedSearchTerm, {
       type: 'websearch',
       config: 'english',
     });
   ```
3. [ ] Type "nurse california"
4. [ ] **VERIFY:** Results include prospects with "nurse" specialty or California location
5. [ ] Check performance: Should return in <50ms for 1000+ rows

---

## Phase 4: Edge Cases (10 min)

### Error Handling
- [ ] Upload invalid file type (.txt, .zip)
  - Expected: Clear error message
- [ ] Upload file >10MB
  - Expected: Size limit error
- [ ] Network failure during upload
  - Expected: Graceful error, retry option
- [ ] Call `useSchemaEnum` with invalid table/column
  - Expected: Error displayed in UI, no crash

### RLS Security
- [ ] Create test user account (User B)
- [ ] User A creates email draft for Prospect X
- [ ] Login as User B
- [ ] Query email_drafts:
  ```sql
  SELECT * FROM email_drafts WHERE prospect_id = [prospect_x_id];
  ```
  Expected: User B sees only their own drafts, not User A's

### Storage Cleanup
- [ ] Upload template for Prospect X
- [ ] Note the `template_file_path`
- [ ] Upload new template for same Prospect X
- [ ] Check Supabase Storage
  - Expected: Old file should be removed (implement cleanup if missing)

---

## Phase 5: Performance Validation (5 min)

### Query Performance
- [ ] Run EXPLAIN ANALYZE on search query:
  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM prospects
  WHERE search_vector @@ to_tsquery('english', 'nurse');
  ```
  Expected: Uses GIN index, execution time <50ms

- [ ] Check index exists:
  ```sql
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'prospects' AND indexname = 'idx_prospects_search';
  ```
  Expected: 1 row returned

### Cache Behavior
- [ ] Open DevTools → Network tab
- [ ] Load ProspectsDashboard
- [ ] Note RPC calls to `get_enum_values`
- [ ] Reload page (within 1 hour)
- [ ] **VERIFY:** No new RPC calls (cached by TanStack Query)

---

## Phase 6: Documentation & Handoff (5 min)

### Update Team Docs
- [ ] Share link to `/docs/IMPLEMENTATION_SUMMARY.md`
- [ ] Share link to `/docs/QUICK_START_SCHEMA_PATTERNS.md`
- [ ] Note any custom changes made during rollout

### Monitor for Issues
- [ ] Check Supabase logs for errors (Dashboard → Logs)
- [ ] Check browser console for JavaScript errors
- [ ] Monitor for user feedback over next 24 hours

---

## Rollback Plan (If Needed)

### Revert Database Changes
```sql
-- Remove new columns (data will be lost!)
ALTER TABLE prospects
  DROP COLUMN IF EXISTS template_file_path,
  DROP COLUMN IF EXISTS template_extracted_data,
  DROP COLUMN IF EXISTS template_uploaded_at,
  DROP COLUMN IF EXISTS search_vector;

-- Drop email_drafts table
DROP TABLE IF EXISTS email_drafts;

-- Drop RPC functions
DROP FUNCTION IF EXISTS get_enum_values(text, text);
DROP FUNCTION IF EXISTS bulk_update_prospect_status(bigint[], text);

-- Drop search index
DROP INDEX IF EXISTS idx_prospects_search;
```

### Revert Frontend Changes
```bash
git revert [commit-hash]
npm run build
# Deploy previous version
```

---

## Success Criteria

✅ All migrations applied successfully
✅ Build passes with no TypeScript errors
✅ Template upload → close → reopen workflow works
✅ Cross-device sync verified
✅ `useSchemaEnum` hook returns correct options
✅ Full-text search returns results in <50ms
✅ RLS prevents cross-user data access
✅ No console errors or warnings

---

## Timeline

- **Phase 1 (Database):** 15 minutes
- **Phase 2 (Frontend):** 30 minutes
- **Phase 3 (Testing):** 20 minutes
- **Phase 4 (Edge Cases):** 10 minutes
- **Phase 5 (Performance):** 5 minutes
- **Phase 6 (Documentation):** 5 minutes

**Total Estimated Time:** ~90 minutes

---

## Support

**Issues During Rollout?**
1. Check `/docs/TEMPLATE_PERSISTENCE_IMPLEMENTATION.md` → Troubleshooting section
2. Verify migrations applied: `SELECT * FROM supabase_migrations.schema_migrations;`
3. Check Supabase logs for SQL errors
4. Verify environment variables are set correctly
5. Clear browser cache and retry

**Questions?**
- See detailed implementation guide in `/docs/`
- Check existing code patterns in `/src/components/`
- Review Supabase docs: https://supabase.com/docs

---

**Rollout Date:** _____________
**Completed By:** _____________
**Issues Encountered:** _____________
**Status:** ☐ Success | ☐ Partial | ☐ Rolled Back
