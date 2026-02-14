# Rich Response Blocks, Citations & Bug Fixes

## Phase 0: Bug Fixes (from screenshots)

### Bug 0a — Text bleeding through panel (Screenshot 1-2)

**Root cause:** The prose container at line 1970 uses `max-w-none` which removes
Tailwind's width constraints. Markdown-rendered headings and long lines in email
content can overflow the message bubble (capped at `max-w-[96%]`) because the
inner prose div doesn't enforce overflow wrapping. Combined with the scroll area's
`overflow-y-auto` (but no `overflow-x-hidden`), large text can escape bounds.

**Fix (CommandCenterV2.tsx):**
1. Line 1970 — Add `overflow-hidden break-words` to the prose container:
   ```
   'prose prose-invert max-w-none overflow-hidden break-words'
   ```
2. Line 2769 — Add `overflow-x-hidden` to scroll area:
   ```
   'relative flex-1 overflow-y-auto overflow-x-hidden ...'
   ```
3. Line 1964 — Add `overflow-hidden` to the bubble wrapper:
   ```
   'relative max-w-[96%] sm:max-w-[92%] md:max-w-[88%] overflow-hidden'
   ```

### Bug 0b — "Clean this up" edit intent fails with typos (Screenshot 3)

**Root cause:** `editVerb` regex at router.ts:52 is `\b(clean\s*up|...)\b`. The
`clean\s*up` pattern requires "clean" as a contiguous word. A typo like "Clea m"
breaks the word, so the regex fails. The request falls through to LLM fallback
which misclassifies it as a new draft.

Also: The `editFollowup` regex at router.ts:53 doesn't include common typo
variants or the bare word "clean".

Also: When there's no image AND no `lastEmailFound`, the short-followup tier
(line 592) can't fire even if the regex matched — but the user's OWN previous
message IS the draft they want edited (not an assistant email draft). The system
only looks for previous assistant drafts, not user drafts.

**Fix (router.ts):**
1. Line 52 — Add fuzzy edit patterns and bare "clean" to editVerb:
   ```ts
   editVerb: /\b(cle?a[nm]\s*(up|this|it)|edit|fix|rewrite|revise|polish|improve|refine|tweak|tidy)\b/i,
   ```
2. Line 53 — Add "clean" to editFollowup:
   ```ts
   editFollowup: /\b(remove|omit|leave\s+this(?:\s+o(?:ut|uyt))?|leave\s+out|delete|cut|exclude|strip|take\s+out|drop|change)\b|\b(shorter|longer|tone|polish|clean|tidy|tweak|adjust|revise|edit|rewrite|reply|response|respond|answer)\b/i,
   ```

**Fix (chat.ts):**
3. Line 157 — Match editVerb fixes:
   ```ts
   const EDIT_INSTRUCTION_RX = /\b(remove|omit|leave\s+out|shorter|tone|polish|rewrite|revise|edit|fix|tweak|adjust|cut|trim|cle?a[nm]\s*(up|this|it)|tidy|change|replace|swap)\b/i;
   ```

---

## Phase 1: Response Block Protocol (Backend)

### 1a. Define the universal ResponseBlock envelope

**File: `app/api/chat/command-center/types/index.ts`**

Add a `ResponseBlock` discriminated union:

```ts
// ════════════════════════════════════════════════════════════════════════════════
// SECTION 10: Rich Response Blocks
// ════════════════════════════════════════════════════════════════════════════════

export type ResponseBlock =
  | { kind: 'email_draft'; data: EmailDraftResponse }
  | { kind: 'candidate_card'; data: CandidateCardData }
  | { kind: 'pipeline_table'; data: PipelineTableData }
  | { kind: 'licensure_card'; data: LicensureCardData }
  | { kind: 'pay_package_card'; data: PayPackageCardData }
  | { kind: 'citation_set'; data: CitationData[] }

export interface CandidateCardData {
  candidate_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  specialty?: string | null;
  profession?: string | null;
  home_state?: string | null;
  status: string;
  nova_url?: string | null;
  recruiter?: string | null;
  licenses?: string[];
  notes_preview?: string | null;
  engagement_level?: string | null;
}

export interface PipelineTableData {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  source_table: string;
}

export interface LicensureCardData {
  candidate_name: string;
  state: string;
  profession: string;
  license_status: 'active' | 'expired' | 'pending' | 'not_found';
  board_url?: string | null;
  expiration?: string | null;
  license_number?: string | null;
  nova_url?: string | null;
}

export interface PayPackageCardData {
  candidate_name?: string | null;
  facility: string;
  location: string;
  specialty: string;
  gross_weekly: number;
  taxable_hourly?: number | null;
  stipend_weekly?: number | null;
  housing_weekly?: number | null;
  meals_weekly?: number | null;
  hours_per_week: number;
  shift?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface CitationData {
  index: number;
  label: string;
  url: string;
  source_type: 'nova' | 'state_board' | 'database' | 'external';
}
```

### 1b. Wire format

Emit structured blocks in the text stream as:
```
[RESPONSE_BLOCK:candidate_card]{"candidate_id":123456,...}[/RESPONSE_BLOCK]
```

Backward-compatible — `[EMAIL_DRAFT_JSON]` still works. The new tag is the
generalized version.

Citations in prose use markdown links with `[n]` labels:
```
Fausto has an active NC LDN [1](https://ncbon.com/verify/12345) valid through 2027.
```

### 1c. Emit helpers

**File: `app/api/chat/command-center/lib/response-blocks.ts`** (new)

```ts
export function emitBlock(kind: string, data: object): string {
  return `\n[RESPONSE_BLOCK:${kind}]${JSON.stringify(data)}[/RESPONSE_BLOCK]\n`;
}
```

---

## Phase 2: Frontend Rendering

### 2a. Block parser

**CommandCenterV2.tsx — new regex + parser in §1 Helpers:**

```ts
const REGEX_RESPONSE_BLOCK = /\[RESPONSE_BLOCK:(\w+)\]([\s\S]*?)\[\/RESPONSE_BLOCK\]/g;

function extractResponseBlocks(content: string): {
  blocks: Array<{ kind: string; data: any }>;
  prose: string;
} {
  const blocks: Array<{ kind: string; data: any }> = [];
  const prose = content.replace(REGEX_RESPONSE_BLOCK, (_, kind, json) => {
    try { blocks.push({ kind, data: JSON.parse(json) }); }
    catch { /* skip malformed */ }
    return '';
  }).trim();
  return { blocks, prose };
}
```

### 2b. New card components (same design language as EmailCard)

All use: `rounded-[20px]`, `ring-1 ring-white/[0.06]`, `bg-[#080809]`, framer-motion
entrance animations, same SYSTEM typography tokens.

1. **CandidateCard** — Name, status badge, specialty, contact, Nova link, license chips
2. **PipelineTable** — Title header, columns, rows with status colorization
3. **LicensureCard** — State, status (active/expired/pending), board URL, expiration
4. **PayPackageCard** — Facility, location, gross weekly hero number, breakdown rows

### 2c. Update MessageBubble.renderContent

Replace the regex sniff chain with a structured flow:

```ts
// 1. Try extracting response blocks
const { blocks, prose } = extractResponseBlocks(sanitized);

if (blocks.length > 0) {
  return (
    <>
      {prose && <ReactMarkdown ...>{prose}</ReactMarkdown>}
      {blocks.map((block, i) => <BlockRenderer key={i} block={block} />)}
    </>
  );
}

// 2. Legacy email parsing (backward compat)
const email = parseEmailFromContent(sanitized);
if (email) return <EmailCard .../>;

// 3. Legacy verdict/insight
// ... existing regex checks ...

// 4. Default markdown
```

### 2d. Citation rendering

- In markdown `<a>` renderer: detect `[n]` label → render as superscript citation
- CitationFooter component at bottom of message

---

## Phase 3: Backend Tools + Block Emission

### 3a. New tools in tools.ts

1. **`query_pipeline`** — Query `candidates` table by stage/facility/specialty
2. **`query_active_assignments`** — Query `engagements` table
3. **`query_interested_clicks`** — Query `interested_clicks` table
4. **`check_licensure`** — Candidate licenses + state board URL

### 3b. Wire tool results → response blocks in handleChatIntent

After tool execution, scan tool results and emit appropriate response blocks
alongside the AI's prose text.

### 3c. System prompt updates

Instruct the AI to cite sources in `[n](url)` format. The handler
emits the JSON blocks; the AI focuses on prose and citations.

---

## Implementation Order

0. **Bug fixes** — Prose overflow containment + edit intent typo tolerance (immediate)
1. **Types + emit helper** — types/index.ts + lib/response-blocks.ts
2. **Frontend block parser + renderer** — CommandCenterV2.tsx
3. **CandidateCard** — First card, tests pipeline end-to-end
4. **Wire lookup_candidate → CandidateCard** — Backend emits block
5. **PipelineTable** — Second card
6. **New tools** — query_pipeline, query_active_assignments, check_licensure
7. **LicensureCard + PayPackageCard** — Remaining cards
8. **Citations** — Superscript links + CitationFooter
9. **Migrate EmailCard to block protocol** — Replace [EMAIL_DRAFT_JSON]

---

## Design Principles

- Cards match EmailCard's design: rounded-[20px], ring-1, obsidian bg, motion entrance
- AI doesn't produce JSON — handlers emit blocks from tool results, AI writes prose
- Citations mandatory for factual claims — tool data must have source links
- Backward compatible — legacy email parsing still works, migrate gradually
- Same pattern for both products — ResponseBlock protocol is product-agnostic
