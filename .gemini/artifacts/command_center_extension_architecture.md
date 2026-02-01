# 🏛️ Command Center v2.0 — Enterprise Chrome Extension Architecture

## Overview

A Distributed Client Application for healthcare recruiters. Built for HIPAA/SOC2 compliance with fault-tolerant state management, tab-isolated context, and secure screenshot capture.

---

## Architectural Strategy: Tab-Keyed State Machine

The single biggest failure point in modern extensions is state loss/pollution:

1. **Service Worker suspension** — MV3 workers sleep after 30s
2. **Tab context bleeding** — Switching tabs shows stale candidate data
3. **Panel close/reopen** — State lost when user closes panel

### The Solution: Proxy Store Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CHROME BROWSER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Tab A (Nova - Azaria)    Tab B (Nova - Marcus)     Side Panel          │
│  ────────────────────     ────────────────────     ─────────────────    │
│  │                  │     │                  │     │               │    │
│  │  Content Script  │     │  Content Script  │     │  React UI     │    │
│  │  ──────────────  │     │  ──────────────  │     │  ───────────  │    │
│  │  Scrapes context │     │  Scrapes context │     │  Subscribes   │    │
│  │  Sends to SW     │     │  Sends to SW     │     │  to storage   │    │
│  │                  │     │                  │     │               │    │
│  └────────┬─────────┘     └────────┬─────────┘     └───────┬───────┘    │
│           │                        │                       │            │
│           ▼                        ▼                       │            │
│  ┌─────────────────────────────────────────────────────────┼───────────┐│
│  │                     SERVICE WORKER                      │           ││
│  │  ══════════════════════════════════════════════════════ │           ││
│  │  • Receives context from content scripts                │           ││
│  │  • Writes to tab-keyed storage: context_${tabId}        │           ││
│  │  • Tracks activeTabId for panel                         │           ││
│  └─────────────────────────────────────────────────────────┼───────────┘│
│                                                             │            │
│  ┌─────────────────────────────────────────────────────────┼───────────┐│
│  │              chrome.storage.session (RAM)               │           ││
│  │  ══════════════════════════════════════════════════════ │           ││
│  │  activeTabId: 5502                                      │           ││
│  │  context_1203: { name: "Azaria Parker", novaId: "..." } │           ││
│  │  context_5502: { name: "Marcus Chen", novaId: "..." }   ◀───────────┘│
│  │  draft_5502: { subject: "...", body: "..." }                        ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: The Side Panel subscribes to `context_${activeTabId}`. When user switches tabs:

1. `activeTabId` updates in storage
2. Panel auto-rehydrates from new tab's data slice
3. **Zero stale data** — UI always shows current tab's candidate

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Framework** | **Plasmo** | Industry standard for enterprise MV3 extensions. Handles HMR, Shadow DOM, secure CSP |
| **State** | **@plasmohq/storage** | Auto-syncs `chrome.storage.session` with React Hooks |
| **Validation** | **Zod** | All scraped DOM data validated before entering state. Invalid payloads fail loudly |
| **Styling** | **Tailwind (Scoped)** | Compiled inside Shadow DOM — zero CSS conflicts with Outlook/Gmail |
| **Async** | **TanStack Query** | Handles caching, retry, optimistic updates for AI requests |

---

## File Structure (Feature-Sliced Design)

```text
aya-command-center-extension/
├── package.json
├── tsconfig.json
├── tailwind.config.js
│
├── src/
│   ├── core/
│   │   ├── messaging/               # Typed Event Bus & Zod Schemas
│   │   │   ├── bus.ts               # chrome.runtime.sendMessage wrapper
│   │   │   ├── events.ts            # Event type definitions
│   │   │   └── schemas.ts           # Zod validation schemas
│   │   │
│   │   ├── storage/                 # Tab-Keyed Persistence
│   │   │   ├── hooks.ts             # useTabContext, useTabDraft
│   │   │   └── middleware.ts        # @plasmohq/storage config
│   │   │
│   │   └── branding/                # Design tokens, icons
│   │       └── tokens.ts
│   │
│   ├── features/
│   │   ├── context-engine/          # Page Context Extraction
│   │   │   ├── strategies/          # Strategy Pattern
│   │   │   │   ├── base.ts          # ContextStrategy interface
│   │   │   │   ├── nova.ts          # Nova-specific scraping
│   │   │   │   └── outlook.ts       # Outlook-specific scraping
│   │   │   ├── observers/           # MutationObserver for SPA updates
│   │   │   │   └── spa-watcher.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── secure-capture/          # HIPAA-Compliant Screenshots
│   │   │   ├── masking.ts           # Blur-First CSS injection
│   │   │   ├── offscreen.ts         # Image resize/compress
│   │   │   └── redaction.ts         # Client-side PII regex stripping
│   │   │
│   │   ├── smart-draft/             # AI Draft Generation
│   │   │   ├── prompts/             # Intent-specific prompts
│   │   │   ├── streaming.ts         # SSE handler
│   │   │   └── client.ts            # API wrapper
│   │   │
│   │   └── ui-injection/            # Ghost Buttons for Host Apps
│   │       ├── shadow-root.tsx      # Shadow DOM container
│   │       └── outlook-button.tsx   # "AI Draft" button for Outlook
│   │
│   ├── contents/                    # Plasmo Content Script Entry Points
│   │   ├── nova-scraper.ts          # Runs on nova.ayahealthcare.com
│   │   └── outlook-injector.tsx     # Injects button into Outlook
│   │
│   ├── sidepanel.tsx                # Plasmo Side Panel Entry
│   │   └── components/
│   │       ├── ContextCard.tsx      # Shows scraped candidate data
│   │       ├── CaptureButton.tsx    # Screenshot trigger
│   │       ├── ModeChips.tsx        # Pay Package / Licensing / etc.
│   │       ├── DraftCard.tsx        # Generated email display
│   │       └── ActionBar.tsx        # Outlook / Gmail / Copy buttons
│   │
│   └── background.ts                # Service Worker Entry
│       ├── tab-tracker.ts           # Maintains activeTabId
│       └── message-router.ts        # Routes events to handlers
│
└── assets/
    └── icons/
        ├── icon-16.png
        ├── icon-48.png
        └── icon-128.png
```

---

## Key Technical Patterns

### 1. Tab-Scoped Context Hook

The fix for "State Pollution" — UI automatically subscribes to current tab's data:

```typescript
// src/core/storage/hooks.ts
import { useStorage } from "@plasmohq/storage/hook"

export const useTabContext = () => {
  // 1. Get global active tab ID
  const [activeTabId] = useStorage<number>("activeTabId")
  
  // 2. Subscribe to THAT tab's context slice
  const [context] = useStorage<CandidateContext | null>(`context_${activeTabId}`)
  
  return {
    tabId: activeTabId,
    context: context ?? null,
    isLoading: activeTabId && !context
  }
}

export const useTabDraft = () => {
  const [activeTabId] = useStorage<number>("activeTabId")
  const [draft, setDraft] = useStorage<EmailDraft | null>(`draft_${activeTabId}`)
  
  return { draft, setDraft }
}
```

**Usage in Side Panel:**

```tsx
// src/sidepanel.tsx
export default function SidePanel() {
  const { context, isLoading } = useTabContext()
  const { draft, setDraft } = useTabDraft()
  
  // Context auto-updates when user switches tabs!
  return (
    <div className="p-4">
      {isLoading && <Skeleton />}
      {context && <ContextCard {...context} />}
      {draft && <DraftCard {...draft} />}
    </div>
  )
}
```

---

### 2. Context Strategy Pattern

Clean, extensible page scraping:

```typescript
// src/features/context-engine/strategies/base.ts
import { z } from "zod"

export const CandidateContextSchema = z.object({
  source: z.enum(["NOVA", "OUTLOOK", "GMAIL", "UNKNOWN"]),
  candidate: z.object({
    name: z.string().min(1),
    novaId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
})

export type CandidateContext = z.infer<typeof CandidateContextSchema>

export interface ContextStrategy {
  match(url: string): boolean
  extract(): Promise<CandidateContext | null>
}
```

```typescript
// src/features/context-engine/strategies/nova.ts
export class NovaStrategy implements ContextStrategy {
  match(url: string): boolean {
    return url.includes("nova.ayahealthcare.com")
  }
  
  async extract(): Promise<CandidateContext | null> {
    // Extract Nova ID from URL
    const novaIdMatch = location.href.match(/candidates\/(\d+)/)
    const novaId = novaIdMatch?.[1]
    
    // Scrape visible fields (with fallbacks)
    const name = 
      document.querySelector('[data-testid="candidate-name"]')?.textContent?.trim() ??
      document.querySelector('.candidate-header h1')?.textContent?.trim() ??
      null
    
    const email =
      document.querySelector('[data-testid="primary-email"]')?.textContent?.trim() ??
      document.querySelector('a[href^="mailto:"]')?.textContent?.trim() ??
      null
    
    if (!name) return null // Cannot proceed without name
    
    // Validate before returning
    const result = CandidateContextSchema.safeParse({
      source: "NOVA",
      candidate: { name, novaId, email }
    })
    
    return result.success ? result.data : null
  }
}
```

---

### 3. Blur-First Secure Capture (HIPAA)

Mask sensitive data BEFORE screenshot:

```typescript
// src/features/secure-capture/masking.ts
const SENSITIVE_SELECTORS = [
  '[data-testid="ssn"]',
  '[data-testid="dob"]',
  '.salary-info',
  '.medical-history',
  '.phone-number',
  'input[type="password"]'
]

export async function secureCapture(tabId: number): Promise<string> {
  const maskCSS = `
    ${SENSITIVE_SELECTORS.join(',')} {
      filter: blur(12px) !important;
      pointer-events: none !important;
      user-select: none !important;
    }
  `
  
  // 1. Inject blur mask
  await chrome.scripting.insertCSS({
    target: { tabId },
    css: maskCSS
  })
  
  // 2. Wait for paint (critical for race condition)
  await new Promise(resolve => setTimeout(resolve, 50))
  
  // 3. Capture
  const screenshot = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
  
  // 4. Remove mask immediately
  await chrome.scripting.removeCSS({
    target: { tabId },
    css: maskCSS
  })
  
  return screenshot
}
```

---

### 4. Client-Side PII Redaction

Strip SSNs from context before sending to LLM:

```typescript
// src/features/secure-capture/redaction.ts
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,           // SSN: 123-45-6789
  /\b\d{9}\b/g,                        // SSN no dashes: 123456789
  /\b\d{2}\/\d{2}\/\d{4}\b/g,          // DOB: 01/15/1990
]

export function redactPII(text: string): string {
  let clean = text
  for (const pattern of PII_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]')
  }
  return clean
}
```

---

### 5. Shadow DOM Injection for Outlook

Inject "AI Draft" button without CSS conflicts:

```tsx
// src/contents/outlook-injector.tsx
import cssText from "data-text:~style.css"
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://outlook.office.com/*"]
}

// Plasmo injects this as Shadow DOM automatically
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export default function OutlookDraftButton() {
  const handleClick = async () => {
    await chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" })
  }
  
  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-[99999] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-3 rounded-full shadow-xl transition-all hover:scale-105"
    >
      ⚡ AI Draft
    </button>
  )
}
```

---

## manifest.json (Hardened)

```json
{
  "manifest_version": 3,
  "name": "Aya Command Center",
  "version": "1.0.0",
  "description": "AI-powered draft generation for healthcare recruiters",
  
  "permissions": [
    "sidePanel",
    "storage",
    "activeTab",
    "scripting"
  ],
  
  "host_permissions": [
    "https://nova.ayahealthcare.com/*",
    "https://outlook.office.com/*",
    "https://mail.google.com/*"
  ],
  
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  
  "content_scripts": [
    {
      "matches": ["https://nova.ayahealthcare.com/*"],
      "js": ["contents/nova-scraper.js"]
    }
  ],
  
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  
  "action": {
    "default_icon": "assets/icons/icon-48.png",
    "default_title": "Open Command Center"
  }
}
```

---

## 5 Non-Negotiable Safeguards

| # | Safeguard | Implementation |
|---|-----------|---------------|
| 1 | **Memory-Only Storage** | Use `chrome.storage.session` only. No disk persistence. Clears on browser close. |
| 2 | **Explicit Generate** | Drafts never auto-generate. User must click "Generate". |
| 3 | **Client-Side Redaction** | PII regex stripping before prompt hits LLM. |
| 4 | **Logging Firewall** | Never log `prompt_text` or `context_body`. Log only `token_count`, `latency`. |
| 5 | **Host Allowlist** | Strict domain limiting in manifest. No `<all_urls>`. |

---

## Implementation Roadmap

### Phase 1: Foundation

- [ ] `npm create plasmo@latest` with TypeScript + Tailwind
- [ ] Implement `activeTabId` tracker in background
- [ ] Create `useTabContext` hook
- [ ] Verify panel clears on tab switch

### Phase 2: Context Engine

- [ ] Build `NovaStrategy` with Zod validation
- [ ] Add fallback selectors for DOM changes
- [ ] Implement MutationObserver for SPA navigation

### Phase 3: Secure Capture

- [ ] Implement Blur-First masking
- [ ] Add client-side PII redaction
- [ ] Connect to existing `/api/chat/command-center`

### Phase 4: Injection & Polish

- [ ] Shadow DOM button for Outlook
- [ ] SSE streaming for AI response
- [ ] `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- [ ] Keyboard shortcut: Cmd+Shift+D

---

## Summary

This architecture solves the three critical enterprise requirements:

1. **Fault Tolerant** — Proxy Store survives Service Worker suspension
2. **State-Isolated** — Tab-keyed storage prevents context bleeding
3. **Style-Isolated** — Shadow DOM prevents CSS conflicts

Ready for implementation when you are.
