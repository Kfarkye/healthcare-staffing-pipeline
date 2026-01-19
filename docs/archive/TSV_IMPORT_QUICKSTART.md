# TSV Import - Quick Start Guide

## ✅ What's New

The Active Assignments Dashboard now has **TSV import functionality** that writes directly to Supabase.

---

## 🚀 How to Use

### 1. Click "Import Data" Button
Located in the dashboard header (top-right, next to search bar).

### 2. Paste TSV Data
Copy assignment data from your export and paste into the textarea.

**Expected Format:**
```
CandidateID | Name | StartDate | EndDate | Facility | JobID | ...
```

### 3. Review Row Count
The modal shows: "X rows detected" at the bottom.

### 4. Click "Import to Supabase"
Button turns blue and shows loading spinner during import.

### 5. Wait for Success
- ✅ Success toast: "Successfully imported X assignments"
- ✅ Dashboard auto-refreshes with new data
- ❌ Error toast: Shows specific error message

---

## 📋 TSV Format

### Required Columns (in order)

1. **CandidateID** - Numeric ID
2. **Name** - Candidate full name
3. **StartDate** - Format: `MM/DD/YY`
4. **EndDate** - Format: `MM/DD/YY`
5. **Facility** - Facility name
6. **JobID** - Numeric job ID

### Optional Columns

- **AM/AC Info** - Account Manager and Coordinator (can span multiple lines)
- **Recruiter** - Recruiter name

### Example

```tsv
4254046	Jahanna Perry-McElroy	7/20/25	10/11/25	Northwestern Medicine Palos Hospital	7345129	7/14/25		AM: Mitchell Moon
AC: Northwestern Support	Neveen Mikhail
2724343	Marcie Lanning	7/13/25	10/11/25	PeaceHealth Saint Joseph Medical Center	7250689	7/7/25		AM: Adam Raize
```

---

## 🎯 What Gets Imported

### Supabase Tables Updated

1. **prospects** - Candidate information
2. **facilities** - Facility list
3. **jobs** - Job postings
4. **engagements** - Active assignments

### Filtering

**Automatically skips:**
- ❌ WFD facilities
- ❌ Expired assignments (end date < today)
- ❌ Duplicate candidate/job combinations
- ❌ Invalid data (missing required fields)

---

## ⚡ Features

✅ **Multi-line support** - Handles AM/AC info spanning multiple lines
✅ **Format detection** - Auto-detects format with/without "Travel" column
✅ **Duplicate prevention** - Won't re-import existing assignments
✅ **Transaction safety** - All-or-nothing imports (no partial data)
✅ **Auto-refresh** - Dashboard updates immediately after import
✅ **Progress feedback** - Shows loading state and row count

---

## 🧪 Quick Test

**Test Data** (paste this into the import modal):

```tsv
4254046	Test Candidate 1	7/20/25	10/11/25	Test Hospital	7345129	7/14/25		AM: John Smith
4254047	Test Candidate 2	7/21/25	10/12/25	Test Medical Center	7345130	7/15/25		AM: Jane Doe
```

**Expected Result:**
- ✅ "Successfully imported 2 assignments"
- ✅ Dashboard shows 2 new cards
- ✅ End dates calculated correctly

---

## 🔧 Troubleshooting

### "No valid assignments found"
**Fix**: Check TSV format - columns must be tab-separated, not space-separated.

### "Import failed: ..."
**Fix**: Check browser console for detailed error. Verify data format matches expected columns.

### Duplicates imported
**Fix**: Run migration `20251008000005_add_engagement_unique_constraint.sql` to add unique constraint.

### Import button disabled
**Fix**: Paste data into the textarea first.

---

## 📁 Technical Details

### New Files Created

- `/src/services/tsvImportService.ts` - Parser & import logic
- `/supabase/migrations/20251008000005_add_engagement_unique_constraint.sql` - Database constraint

### Hook Added

```typescript
import { useImportAssignments } from '../lib/supabase/assignments';

const importMutation = useImportAssignments();

importMutation.mutate(tsvData, {
  onSuccess: (result) => console.log(`Imported ${result.imported}`),
  onError: (error) => console.error(error)
});
```

---

## 📚 Full Documentation

See `/docs/TSV_IMPORT_FEATURE.md` for:
- Complete parsing rules
- Database schema details
- Performance metrics
- Advanced troubleshooting

---

**The TSV import feature is production-ready!** 🎉
