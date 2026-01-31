# Command Center Widget (Electron)

Screenshot → Draft → Auto-copy. Zero-friction recruiting AI.

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in your Supabase credentials
npm run dev
```

## Build

```bash
# Mac
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

## Features

- **Global hotkey**: `Cmd+Shift+D` toggles the window
- **Paste screenshot**: `Cmd+V` or drag an image
- **Pre-draft modes**: Working Traveler, Extension Request, Pay Package, Screen Resume
- **Post-draft modifiers**: +Certs, +Time-off?, +Update Aya, +Match energy
- **Auto-copy**: Draft is copied to clipboard on completion
- **Audio cue**: Plays a tone when draft is ready
- **Outlook/Gmail**: One-click open in mail client

## Deep Linking (OAuth)

Add `commandcenter://auth` to your Supabase redirect URL allowlist for Google OAuth to work.

## Hotkeys

| Key | Action |
|-----|--------|
| `Cmd+Shift+D` | Toggle window |
| `Escape` | Hide window |
| `Enter` | Generate draft |
| `Cmd+V` | Paste screenshot |
