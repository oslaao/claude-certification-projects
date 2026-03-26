# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview. It's a Next.js 15 (App Router) application using Claude AI to generate React components, with a virtual file system and real-time iframe preview.

## Commands

```bash
# Initial setup (installs deps, generates Prisma client, runs migrations)
npm run setup

# Development server (with Turbopack)
npm run dev

# Build for production
npm run build

# Run all tests
npm run test

# Run a single test file
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx

# Lint
npm run lint

# Reset database
npm run db:reset
```

Tests use Vitest with jsdom environment. The dev server requires `NODE_OPTIONS='--require ./node-compat.cjs'` (already baked into the npm scripts). `node-compat.cjs` is a compatibility shim for Turbopack — do not remove it.

## Environment

- `ANTHROPIC_API_KEY` — Optional. When absent, a `MockLanguageModel` is used that returns hardcoded component examples (Counter, ContactForm, Card). When set, uses `claude-haiku-4-5` via `@ai-sdk/anthropic`.
- `JWT_SECRET` — Optional. Defaults to `"development-secret-key"` when absent; set in production.

## Architecture

### Request Flow

```
User chat input
  → POST /api/chat (src/app/api/chat/route.ts)
  → getLanguageModel() → Claude API or MockLanguageModel
  → AI tool calls: str_replace_tool / file_manager_tool
  → VirtualFileSystem mutations (in-memory)
  → FileSystemContext broadcasts change to UI
  → JSX transformer compiles files → sandboxed iframe preview
  → Project saved to SQLite via Prisma
```

### Key Modules

| Path | Role |
|------|------|
| `src/app/api/chat/route.ts` | Streaming AI endpoint; orchestrates tool calls |
| `src/lib/provider.ts` | Returns real Claude model or MockLanguageModel |
| `src/lib/file-system.ts` | `VirtualFileSystem` — in-memory file tree (create/read/update/delete) |
| `src/lib/contexts/file-system-context.tsx` | React context exposing file system state to components |
| `src/lib/contexts/chat-context.tsx` | Chat message state and AI streaming |
| `src/lib/tools/` | AI tool definitions (`str_replace`, `file_manager`) |
| `src/lib/transform/` | Babel standalone JSX compiler for iframe preview |
| `src/lib/prompts/` | System prompts instructing Claude to use `@/` imports and produce `/App.jsx` |
| `src/actions/index.ts` | Server actions for auth and project CRUD |
| `src/middleware.ts` | JWT-based auth guard |
| `prisma/schema.prisma` | Data models: `User`, `Project` |

### Data Persistence

- Projects store chat history in a `messages` JSON column and the serialized file system in a `data` JSON column.
- Unauthenticated work is stored in `localStorage` and migrated to the database on sign-in.

### UI Layout

- Left panel (35%): Chat interface
- Right panel (65%): Tabbed Preview (live iframe) / Code (file tree + Monaco editor)

### AI-Generated Components

Claude is instructed via system prompt to:
- Create React components with Tailwind CSS
- Always produce `/App.jsx` as the entry point
- Use `@/` path aliases (matching `src/` via tsconfig)
- Never write to disk — all file operations go through the virtual file system tools

The chat endpoint allows up to **40 tool-call steps** with a real API key, but only **4 steps** with the mock provider. Third-party npm imports in generated code resolve via `esm.sh` CDN at preview time.

### Path Aliases

`@/*` maps to `src/*` (configured in `tsconfig.json` and `components.json`).
