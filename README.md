# Pipeline Management System

A comprehensive healthcare staffing pipeline management application built with React, TypeScript, and Supabase.

## Architecture

### Design System Structure

```
src/
├── design-system/
│   ├── tokens/          # Design tokens (colors, spacing, typography)
│   ├── icons/           # SVG icon components
│   ├── core/            # Atomic components (Button, Input, etc.)
│   └── modules/         # Complex components (StatCard, UserProfile, etc.)
├── components/          # Page-level components
├── context/             # React context providers
├── shared/              # Shared utilities and services
└── types/               # TypeScript type definitions
```

### Key Features

- **Prospects Dashboard**: Kanban-style board for managing candidate pipeline
- **Active Assignments**: Track ongoing contracts and extensions
- **Offers & Signed**: Monitor offer status and signed contracts
- **Follow-up Calendar**: Automated reminders and check-ins
- **Job Openings**: Import and manage available positions
- **AI-Powered Extraction**: Extract data from screenshots and documents

### Design System

The application uses a token-based design system inspired by Apple, Stripe, and Vercel:

- **Consistent spacing** using 8px grid system
- **Semantic color palette** with proper contrast ratios
- **Typography scale** with appropriate line heights
- **Component composition** for maximum reusability

### Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI Integration**: Google Gemini API for data extraction
- **State Management**: Zustand for client state
- **Build Tool**: Vite

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Start development server: `npm run dev`

## Contributing

Please follow the established design system patterns when adding new components. All new UI components should use design tokens and follow the atomic design methodology.# Trigger rebuild
