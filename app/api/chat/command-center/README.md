# Command Center v3.0.0

Production-grade email generation with TypeScript, deterministic outputs, and comprehensive testing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              route.ts                                        │
│                         (Orchestration Only)                                 │
│                                                                             │
│   1. Validate Request                                                       │
│   2. Classify Intent ──────────────────────────────────────────┐            │
│   3. Route to Handler                                          │            │
│   4. Return Response                                           │            │
└────────────────────────────────────────────────────────────────┼────────────┘
                                                                 │
                    ┌────────────────────────────────────────────┼────────────┐
                    │                                            ▼            │
                    │                                    ┌──────────────┐     │
                    │                                    │   router.ts  │     │
                    │                                    │ (Classifier) │     │
                    │                                    └──────┬───────┘     │
                    │                                           │             │
                    │              ┌────────────────────────────┼─────────────┤
                    │              │                            │             │
                    │              ▼                            ▼             │
                    │      ┌──────────────┐           ┌──────────────┐        │
                    │      │ handlers/    │           │ handlers/    │        │
                    │      │ email.ts     │           │ chat.ts      │        │
                    │      └──────┬───────┘           └──────────────┘        │
                    │             │                                           │
                    │             ▼                                           │
                    │      ┌──────────────┐     ┌──────────────┐              │
                    │      │ extractor.ts │────▶│email-builder │              │
                    │      │ (LLM: JSON)  │     │ (Pure Code)  │              │
                    │      └──────────────┘     └──────────────┘              │
                    │                                                         │
                    │                        lib/                             │
                    └─────────────────────────────────────────────────────────┘
```

## Key Principles

### 1. LLM as Function, Not Author

```typescript
// LLM extracts data (JSON)
const data = await extractPayPackageData(messages, google);
// { candidateName: "Sarah", facility: "Broward Health", ... }

// Code builds email (deterministic)
const email = buildPayPackageEmail(data);
// Guaranteed format, zero markdown
```

### 2. Single Responsibility

| Module | Responsibility |
|--------|---------------|
| `route.ts` | Orchestration only |
| `router.ts` | Intent classification |
| `extractor.ts` | LLM data extraction |
| `email-builder.ts` | Email assembly |
| `handlers/email.ts` | Email flow coordination |
| `handlers/chat.ts` | Chat/tools flow |
| `config.ts` | All configuration |
| `types/index.ts` | All type definitions |

### 3. Deterministic Email Output

Every email builder is a pure function:
- Same input → Same output
- No LLM in the formatting path
- No markdown possible
- Testable without mocking

## File Structure

```
command-center/
├── types/
│   └── index.ts          # All TypeScript types
├── lib/
│   ├── config.ts         # Configuration & constants
│   ├── router.ts         # Intent classification
│   ├── extractor.ts      # LLM data extraction
│   └── email-builder.ts  # Email assembly (pure functions)
├── handlers/
│   ├── email.ts          # Email intent handler
│   └── chat.ts           # Chat/tools intent handler
├── tests/
│   ├── email-builder.test.ts
│   └── router.test.ts
├── route.ts              # Main API handler
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Installation

```bash
# Copy to your project
cp -r command-center app/api/chat/

# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck
```

## Usage

### API Endpoint

```typescript
// POST /api/chat/command-center
{
  "messages": [...],
  "context": { "candidateEmail": "sarah@email.com" },
  "systemContext": "Working Traveler",
  "mode": "cold_outreach",
  "modeLocked": true
}
```

### Direct Usage

```typescript
import { buildPayPackageEmail } from './lib/email-builder';

const email = buildPayPackageEmail({
  candidateName: 'Sarah Martinez',
  candidateEmail: 'sarah@email.com',
  facility: 'Broward Health',
  location: 'Fort Lauderdale, FL',
  specialty: 'RRT',
  startDate: '02/23/2026',
  endDate: '05/23/2026',
  shifts: 'Nights',
  hoursPerWeek: '36',
  hourlyRate: '22.50',
  stipend: '1299',
  weeklyTotal: '2109',
});

console.log(email.subject);
// "RRT - Broward Health | $2,109/week"

console.log(email.isComplete);
// true

console.log(email.missing);
// []
```

## Templates

| Type | Trigger | Use Case |
|------|---------|----------|
| `pay_package` | Default, image upload | Cold outreach with pay details |
| `working_traveler` | "Working Traveler" chip | Currently on assignment |
| `reengaged_traveler` | "Re-Engaged Traveler" chip | Previously inactive |
| `doc_request` | "document", "BLS", "resume" | Request missing documents |
| `reference_request` | "reference" | Confirm reference availability |
| `licensing` | "licensing" | Internal licensing request |
| `reassignment` | "reassign" | Internal reassignment request |
| `offer_details` | "offer detail" | Formal offer letter |

## Configuration

All configuration is in `lib/config.ts`:

```typescript
export const CONFIG: AppConfig = {
  signature: {
    name: 'Kofi Farkye',
    title: 'Senior Recruiter, Fulfillment Specialist',
    phone: '858-529-7267',
    extension: '17017',
    assistant: {
      name: 'Tiffany Chavez',
      email: 'Tiffany.Chavez@ayahealthcare.com',
    },
  },
  // ...
};
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Test coverage includes:
- All email templates
- All utility functions
- Router classification
- No-markdown regression tests

## Intent Classification

The router uses a tiered classification system:

1. **Tier 1: Empty/Trivial** - Fast return
2. **Tier 2: Fast Path** - Slash commands, Nova IDs
3. **Tier 3: Mode-Locked** - Respect user's selected mode
4. **Tier 4: Image Detection** - Image = pay package
5. **Tier 5: Pre-Gates** - Block code, info questions
6. **Tier 6: Content Detection** - Keywords → intent
7. **Tier 7: LLM Fallback** - Only when necessary
8. **Tier 8: Default** - GENERAL_CHAT

## Type Safety

All data shapes are defined in `types/index.ts`:

```typescript
interface PayPackageData {
  candidateName: string | null;
  candidateEmail: string | null;
  facility: string | null;
  // ...
}

interface EmailOutput {
  to: string;
  cc: string[];
  subject: string;
  body: string;
  missing: string[];
  isComplete: boolean;
  templateType: TemplateTypeValue;
}
```

## Migration from v2

1. Replace `route.js` with `route.ts`
2. Replace `lib/router.js` with `lib/router.ts`
3. Replace `lib/prompts.js` with `lib/extractor.ts`
4. Add new files: `lib/email-builder.ts`, `lib/config.ts`, `types/index.ts`
5. Add handlers: `handlers/email.ts`, `handlers/chat.ts`
6. Update frontend to remove ReactMarkdown from email cards

## No Markdown Guarantee

The `email-builder.ts` module guarantees no markdown in output:

- Uses dashes (`-`) for bullets, never asterisks
- No bold markers (`**` or `__`)
- No headers (`#`)
- No code fences
- Pure string concatenation, no template literals that could inject markdown

Test coverage enforces this across all templates.
