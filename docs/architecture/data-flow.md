# Data Flow Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                              │
│                                                                 │
│  Writes JSONL logs:                                             │
│    ~/.claude/projects/<cwd>/<session>.jsonl                     │
│    ~/.claude/projects/<cwd>/<session>/subagents/agent-<hex>.jsonl│
│                                                                 │
│  Fires HTTP hooks (configured in .claude/settings.json):        │
│    POST http://localhost:3001/api/hooks/{event}                 │
└──────────┬──────────────────────────┬───────────────────────────┘
           │ JSONL append             │ HTTP POST
           ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Hono + Node.js)                    │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ File Watcher  │    │ Hook Receiver│    │ JSONL Parser     │  │
│  │ (chokidar)   │───▶│ (HTTP POST)  │───▶│ (streaming)      │  │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘  │
│                                                    │            │
│                                          Normalized ServerEvent │
│                                                    │            │
│                         ┌──────────────────────────┤            │
│                         ▼                          ▼            │
│               ┌──────────────────┐     ┌────────────────────┐  │
│               │ Event Buffer     │     │ WebSocket Broker   │  │
│               │ (100ms / 500 ev) │     │ (fan-out to        │  │
│               └────────┬─────────┘     │  subscribed clients)│  │
│                        │               └────────────────────┘  │
│                        ▼                                        │
│               ┌──────────────────┐                              │
│               │ SQLite (WAL)     │                              │
│               │ via Drizzle ORM  │                              │
│               └──────────────────┘                              │
│                                                                 │
│  REST: GET /api/sessions, GET /api/sessions/:id/history         │
│  WS:   /api/ws → subscribe, replay_control, filter              │
└──────────────────────────────────────┬──────────────────────────┘
                                       │ WebSocket
                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React + React Flow)                 │
│                                                                 │
│  WS events → Zustand store → React Flow graph                  │
│                    │                                            │
│                    ├─→ Node components (agent cards with glow)  │
│                    ├─→ Edge components (animated message flow)  │
│                    ├─→ Recharts panels (token usage, timeline)  │
│                    ├─→ TanStack Virtual (transcript viewer)     │
│                    └─→ Framer Motion / GSAP (animations)        │
└─────────────────────────────────────────────────────────────────┘
```

## Dual Ingestion Strategy

The backend uses **two complementary data sources**:

### 1. HTTP Hooks (primary, real-time)

Claude Code POSTs structured JSON on each event (tool calls, subagent lifecycle, session start/stop). Low latency, structured data, no parsing needed.

### 2. JSONL File Watching (secondary, comprehensive)

chokidar watches the log directory for appended lines. Captures everything hooks miss (assistant text, thinking blocks, token usage). Handles the case where hooks aren't configured.

Both paths normalize to the same `ServerEvent` type before broadcasting.

## Monorepo Structure

```
agent-viz/
├── apps/
│   ├── frontend/                  # Vite + React SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── graph/         # React Flow nodes, edges, layout
│   │   │   │   ├── panels/        # Transcript, token charts, timeline
│   │   │   │   └── ui/            # shadcn/ui components
│   │   │   ├── stores/            # Zustand stores (session, graph, ui)
│   │   │   ├── hooks/             # useSessionSocket, useReplayControl
│   │   │   ├── lib/               # Event-to-graph mapping, theme
│   │   │   └── App.tsx
│   │   ├── tailwind.config.ts
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── backend/                   # Hono + Node.js server
│       ├── src/
│       │   ├── routes/            # REST + hook endpoints
│       │   ├── ws/                # WebSocket handler + replay engine
│       │   ├── ingest/            # JSONL parser + hook normalizer
│       │   ├── db/                # Drizzle schema, migrations, queries
│       │   └── index.ts           # Hono app entrypoint
│       ├── drizzle/               # Generated migration SQL files
│       └── package.json
│
├── packages/
│   └── shared-types/              # Pure TypeScript interfaces (no runtime)
│       ├── src/
│       │   ├── events.ts          # ServerEvent types
│       │   ├── commands.ts        # ClientCommand types
│       │   └── index.ts           # Re-exports
│       ├── tsconfig.json
│       └── package.json
│
├── bin/
│   └── agent-viz.js               # npx entry: start backend + open browser
│
├── Dockerfile
├── docker-compose.yml
├── package.json                   # private: true, workspaces, bin field
├── pnpm-workspace.yaml            # packages: ["apps/*", "packages/*"]
├── turbo.json                     # Pipeline: build shared-types first
└── tsconfig.base.json             # Shared TS config (strict, ES2022)
```

## Turborepo Pipeline

```jsonc
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],     // shared-types builds before apps
      "outputs": ["dist/**"]
    },
    "dev": {
      "dependsOn": ["^build"],
      "persistent": true,
      "cache": false
    }
  }
}
```

`turbo run dev` compiles shared-types first, then starts backend (tsx watch) + frontend (vite) in parallel.
