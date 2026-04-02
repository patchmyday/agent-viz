# Agent Viz — Tech Stack Research & Architecture

> Real-time visualization of Claude Code agent orchestration as an interactive node graph.
> Dark sci-fi aesthetic, open-source, zero-config deployment.

---

## Table of Contents

- [Recommended Tech Stack](#recommended-tech-stack)
- [Compatibility Matrix](#compatibility-matrix)
- [Data Flow Architecture](#data-flow-architecture)
- [Event Protocol & Shared Types](#event-protocol--shared-types)
- [Database Schema](#database-schema)
- [API Surface](#api-surface)
- [Claude Code Integration](#claude-code-integration)
- [Monorepo Structure](#monorepo-structure)
- [Deployment Strategy](#deployment-strategy)
- [Visual Design](#visual-design)
- [Key References](#key-references)

---

## Recommended Tech Stack

### Frontend

| Category | Choice | License | Size (gzip) | Rationale |
|---|---|---|---|---|
| **Framework** | Vite + React + TypeScript | MIT | — | Static SPA output, fastest DX, no SSR needed for a dev tool |
| **Graph visualization** | `@xyflow/react` v12 (React Flow) | MIT | ~80KB | DOM-based custom nodes (full CSS/React), viewport culling, dark mode, minimap/controls built-in |
| **Graph layout** | elkjs (lazy-loaded) | MIT | ~200KB (lazy) | Hierarchical/layered DAG layout for agent trees; pairs with React Flow |
| **State management** | Zustand | MIT | ~3KB | React Flow's officially recommended store; decouples WS events from render cycles |
| **UI animations** | Framer Motion | MIT | ~85KB | Panel transitions, mount/unmount, `AnimatePresence` for node lifecycle |
| **Complex animations** | GSAP (core) | Standard (free) | ~23KB | Edge pulses, spawn bursts, timeline scrubbing; handles thousands of simultaneous tweens |
| **Background particles** | tsParticles (slim) | MIT | ~10KB | Canvas-based "space dust" effect behind the graph; zero perf impact |
| **Charts** | Recharts | MIT | ~60KB | Token usage area charts, event histograms; composable React API |
| **Virtual lists** | TanStack Virtual | MIT | ~5KB | Virtualized transcript viewer for long agent conversations |
| **Components** | shadcn/ui (on Radix primitives) | MIT | — | Copy-paste components you own; dark mode via CSS variables; Tailwind-native |
| **Styling** | Tailwind CSS | MIT | ~10-15KB | Utility-first; purged in production; glassmorphism panels via `backdrop-blur` |
| **Total bundle** | | | **~321KB** | Acceptable for a developer tool |

### Backend

| Category | Choice | License | Rationale |
|---|---|---|---|
| **Server framework** | Hono (on Node.js) | MIT | TypeScript-first, built-in `upgradeWebSocket()`, used by agents-observe reference project |
| **Real-time transport** | WebSocket | — | Bidirectional: server pushes events, client sends replay/filter commands |
| **File watching** | chokidar v5 | MIT | ESM-native, polling fallback for Docker/WSL/NFS, append-detection via size delta |
| **Hook integration** | Claude Code HTTP hooks | — | Native `"type": "http"` — Claude Code POSTs structured JSON directly to backend |
| **Process manager** | tsx (dev) / Node.js (prod) | MIT | Direct TypeScript execution in dev; compiled JS in production |

### Database

| Category | Choice | License | Rationale |
|---|---|---|---|
| **Database** | SQLite via better-sqlite3 | MIT | Embedded, zero-config, WAL mode, 62K sync ops/sec, full SQL including recursive CTEs |
| **ORM** | Drizzle ORM | Apache-2.0 | 5KB overhead (vs Prisma's 1.6MB), no codegen, programmatic migrations, TypeScript schema |
| **Migrations** | Drizzle Kit (generate) + `migrate()` at startup | Apache-2.0 | Zero CLI steps for contributors; auto-migrates on every launch |

### Monorepo Tooling

| Category | Choice | License | Rationale |
|---|---|---|---|
| **Package manager** | pnpm | MIT | Workspace support, strict node_modules, faster installs |
| **Build orchestrator** | Turborepo | MIT | `dependsOn: ["^build"]` ensures shared-types compiles before apps; parallel dev servers |

---

## Compatibility Matrix

All technologies verified compatible across all three layers:

| Concern | Frontend | Backend | Database | Status |
|---|---|---|---|---|
| **Language** | TypeScript | TypeScript | TypeScript (Drizzle schema) | All TS |
| **Shared types** | Imports `@agent-viz/shared-types` | Imports `@agent-viz/shared-types` | Schema types exported | Monorepo workspace |
| **Transport** | `new WebSocket()` | Hono `upgradeWebSocket()` | N/A | Native WS |
| **Data format** | JSON events | JSON events | JSON `payload` column | All JSON |
| **Node.js version** | Vite (build only) | Node 20+ | better-sqlite3 prebuilds | Node 20 LTS |
| **Docker** | nginx serves `dist/` | Node.js container | SQLite file on volume | docker-compose |
| **Licenses** | All MIT | All MIT | MIT + Apache-2.0 | All permissive |

---

## Data Flow Architecture

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

### Dual Ingestion Strategy

The backend uses **two complementary data sources**:

1. **HTTP Hooks (primary, real-time)**: Claude Code POSTs structured JSON on each event (tool calls, subagent lifecycle, session start/stop). Low latency, structured data, no parsing needed.

2. **JSONL File Watching (secondary, comprehensive)**: chokidar watches the log directory for appended lines. Captures everything hooks miss (assistant text, thinking blocks, token usage). Handles the case where hooks aren't configured.

Both paths normalize to the same `ServerEvent` type before broadcasting.

---

## Event Protocol & Shared Types

All types live in `packages/shared-types/` and are imported by both frontend and backend.

### Server → Client Events

```typescript
// packages/shared-types/src/events.ts

interface BaseEvent {
  eventId: string;          // UUID v4
  sessionId: string;
  timestamp: string;        // ISO 8601
  sequence: number;         // monotonic counter — used for replay ordering & cursor pagination
}

interface AgentInfo {
  agentId: string;          // hex ID or "root"
  agentName?: string;       // team agent display name
  teamName?: string;
  parentAgentId?: string;   // null for root agent
  isSidechain: boolean;
}

interface SessionStartEvent extends BaseEvent {
  type: "session_start";
  slug: string;             // e.g. "nifty-coalescing-lake"
  cwd: string;
  model: string;
  source: "startup" | "resume" | "clear" | "compact";
}

interface AgentSpawnedEvent extends BaseEvent {
  type: "agent_spawned";
  agent: AgentInfo;
  prompt?: string;          // initial task description
}

interface AgentCompletedEvent extends BaseEvent {
  type: "agent_completed";
  agentId: string;
  lastMessage?: string;
}

interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  agentId: string;
  toolUseId: string;        // links pre → post phases
  toolName: string;
  toolInput: Record<string, unknown>;
  phase: "pre" | "post" | "error";
  toolResponse?: unknown;   // post phase only
  durationMs?: number;      // post phase only
}

interface AssistantMessageEvent extends BaseEvent {
  type: "assistant_message";
  agentId: string;
  text: string;
  hasThinking: boolean;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

interface UserMessageEvent extends BaseEvent {
  type: "user_message";
  agentId: string;
  text: string;
}

interface SessionEndEvent extends BaseEvent {
  type: "session_end";
  source: string;
}

interface ErrorEvent extends BaseEvent {
  type: "error";
  agentId?: string;
  message: string;
}

type ServerEvent =
  | SessionStartEvent
  | AgentSpawnedEvent
  | AgentCompletedEvent
  | ToolCallEvent
  | AssistantMessageEvent
  | UserMessageEvent
  | SessionEndEvent
  | ErrorEvent;
```

### Client → Server Commands

```typescript
// packages/shared-types/src/commands.ts

type ClientCommand =
  | { type: "subscribe"; sessionId: string }
  | { type: "replay_control"; action: "play" | "pause" | "seek" | "set_speed"; position?: number; speed?: number }
  | { type: "filter"; showAgents?: string[]; eventTypes?: string[] };
```

### Event → Graph Mapping

| ServerEvent | React Flow Action |
|---|---|
| `agent_spawned` | Add node (agent card) + add edge (parent → child) |
| `agent_completed` | Update node status → "completed" (green glow) |
| `tool_call` (pre) | Add badge/spinner to agent node |
| `tool_call` (post) | Update badge → result; animate edge pulse |
| `assistant_message` | Update transcript panel; animate edge from agent to parent |
| `user_message` | Update transcript panel |
| `session_start` | Create root node |
| `session_end` | Update all nodes to final state |
| `error` | Update node status → "error" (red glow) |

---

## Database Schema

SQLite database at `$XDG_DATA_HOME/agent-viz/data.db` (falls back to `~/.local/share/agent-viz/data.db`).

### Startup Configuration

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -65536');       // 64MB page cache
sqlite.pragma('mmap_size = 536870912');     // 512MB mmap
sqlite.pragma('busy_timeout = 5000');

const db = drizzle({ client: sqlite, schema });
migrate(db, { migrationsFolder: './drizzle' });
```

### Tables

#### sessions
| Column | Type | Description |
|---|---|---|
| id | TEXT PK | ULID |
| title | TEXT | Derived from first user message |
| slug | TEXT | e.g. "nifty-coalescing-lake" |
| cwd | TEXT | Working directory path |
| transcript_path | TEXT | Path to JSONL file on disk |
| model | TEXT | Primary model used |
| ingestion_source | TEXT | `'hooks'` or `'jsonl'` — one path wins per session, no cross-path dedup needed |
| status | TEXT | 'active' / 'completed' / 'error' |
| created_at | INTEGER | Unix ms |
| ended_at | INTEGER | Unix ms, nullable |
| root_agent_id | TEXT | References agents.id |
| metadata | TEXT | JSON blob |

Indexes: `created_at`, `status`

#### agents
| Column | Type | Description |
|---|---|---|
| id | TEXT PK | Hex ID or "root" |
| session_id | TEXT FK | → sessions.id |
| parent_agent_id | TEXT | Self-referencing FK for tree |
| name | TEXT | e.g. "backend-researcher" |
| model | TEXT | e.g. "claude-sonnet-4-6" |
| team_name | TEXT | Team name if part of a team |
| is_sidechain | INTEGER | 0/1 boolean |
| depth | INTEGER | 0 = root |
| status | TEXT | 'active' / 'completed' / 'error' |
| created_at | INTEGER | Unix ms |
| ended_at | INTEGER | Unix ms, nullable |
| metadata | TEXT | JSON: subagent_type, isolation, etc. |

Indexes: `session_id`, `parent_agent_id`

#### events
| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment (doubles as cursor) |
| event_id | TEXT | Stable dedup key (JSONL uuid or hook-derived ID) |
| session_id | TEXT FK | → sessions.id |
| agent_id | TEXT FK | → agents.id |
| sequence_num | INTEGER | Monotonic within session |
| event_type | TEXT | ServerEvent.type |
| timestamp | INTEGER | Unix ms |
| payload | TEXT | Event JSON (truncated to 8KB if large; see event_blobs) |
| is_truncated | INTEGER | 0/1 — if 1, full payload in event_blobs |

Indexes: `(session_id, sequence_num)`, `(session_id, timestamp)`, `(agent_id, timestamp)`, `event_type`
Unique constraint: `UNIQUE(session_id, event_id)` with `INSERT OR IGNORE` for idempotent ingestion.

#### event_blobs (large payloads)
| Column | Type | Description |
|---|---|---|
| event_id | INTEGER PK FK | → events.id |
| payload | TEXT | Full JSON payload (for events > 8KB) |

Tool responses can be 100KB+. Storing inline bloats the events table and hurts scan performance. Events table stores truncated payload (first 8KB) with `is_truncated: 1`. Full content fetched on demand from event_blobs. Keeps the hot events table rows small for fast replay scans.

#### tool_calls
| Column | Type | Description |
|---|---|---|
| id | TEXT PK | tool_use_id (UNIQUE — stable across hooks and JSONL) |
| session_id | TEXT FK | → sessions.id |
| agent_id | TEXT FK | → agents.id |
| tool_name | TEXT | e.g. "Bash", "Edit", "Read" |
| phase | TEXT | 'pre' / 'post' / 'error' — last known phase |
| input | TEXT | JSON |
| output | TEXT | JSON, nullable — populated on PostToolUse |
| started_at | INTEGER | Unix ms |
| ended_at | INTEGER | Unix ms, nullable |
| duration_ms | INTEGER | Computed |
| status | TEXT | 'pending' / 'success' / 'error' |

Indexes: `(session_id, started_at)`, `tool_name`, `agent_id`

**Write pattern**: Events table is append-only (two rows per tool call: pre + post). ToolCalls table is a queryable projection — one row per tool call, updated in place when PostToolUse arrives:
```typescript
// PreToolUse: insert
db.insert(toolCalls).values({ id: toolUseId, toolName, input, startedAt, status: 'pending' });
// PostToolUse: upsert (handles re-import idempotency)
db.insert(toolCalls).onConflictDoUpdate({
  target: toolCalls.id,
  set: { output, endedAt, durationMs, status: 'success', phase: 'post' }
});
```

#### token_usage
| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| session_id | TEXT FK | → sessions.id |
| agent_id | TEXT FK | → agents.id |
| timestamp | INTEGER | Unix ms |
| model | TEXT | Model ID |
| input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| cache_read_tokens | INTEGER | |
| cache_write_tokens | INTEGER | |

Indexes: `session_id`, `agent_id`, `timestamp`

#### snapshots (for efficient timeline scrubbing)
| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| session_id | TEXT FK | → sessions.id |
| sequence_num | INTEGER | Covers events 0..N |
| timestamp | INTEGER | Unix ms |
| state | TEXT | JSON: `{ nodes: AgentInfo[], edges: { source, target }[] }` — serializable directly to React Flow |

Indexes: `(session_id, sequence_num)`

**Scrub-to-time algorithm**: Find nearest snapshot before target time, then replay only delta events (at most 100) forward. Snapshots written every 100 events in the same batch transaction.

### Dual Ingestion & Deduplication

Each session uses **one ingestion path** (`ingestion_source` column): hooks or JSONL file watching. No cross-path ID unification needed.

- **Hooks path** (primary for live sessions): Claude Code POSTs structured JSON; backend acks immediately and queues DB write. Dedup via `UNIQUE(session_id, event_id)` + `INSERT OR IGNORE`.
- **JSONL path** (secondary): File watcher handles historical sessions (pre-hook import) and catch-up after backend restart. Skips sessions where `ingestion_source = 'hooks'`.

Within each path, dedup is straightforward:
- JSONL: `event_id = JSONL uuid` → `INSERT OR IGNORE`
- Hooks: `event_id` derived from hook event fields (e.g. `tool_use_id + phase` for tool events)

### Write Strategy

Typical volume: 5-100 events/min, peak burst ~10 writes/sec. Well within SQLite's synchronous write budget. A defensive 100ms flush buffer is recommended for hook latency protection (< 500ms ack requirement) but won't be stressed under normal load.

### Storage Estimates

- ~100-500 bytes per event in SQLite (with 8KB truncation for large payloads)
- Typical 1000-event session: 100KB-500KB
- 100 sessions: 10MB-50MB
- Auto-cleanup: delete sessions older than 30 days on startup

---

## API Surface

### REST Endpoints

```
GET  /api/sessions
     → { sessions: [{ sessionId, slug, cwd, startedAt, endedAt?, agentCount, messageCount, isLive }] }

GET  /api/sessions/:id
     → { session: SessionMeta, agents: AgentInfo[], stats: { totalEvents, totalToolCalls, totalTokens } }

GET  /api/sessions/:id/history?limit=100&before=<sequence>
     → { events: ServerEvent[], hasMore: boolean }
     Cursor-based pagination using sequence number (not OFFSET)

DELETE /api/sessions/:id
     → 204 (removes from DB only, does not delete JSONL files)
```

### WebSocket

```
WS   /api/ws

Client sends: { type: "subscribe", sessionId: "..." }
Server sends: ServerEvent stream (live for active sessions, replay for completed)

Replay control: { type: "replay_control", action: "play" | "pause" | "seek" | "set_speed", position?, speed? }
Filtering:      { type: "filter", showAgents?: [...], eventTypes?: [...] }
```

### Hook Receivers (Claude Code → Backend)

```
POST /api/hooks/session-start      ← SessionStart hook
POST /api/hooks/pre-tool-use       ← PreToolUse hook
POST /api/hooks/post-tool-use      ← PostToolUse hook
POST /api/hooks/subagent-start     ← SubagentStart hook
POST /api/hooks/subagent-stop      ← SubagentStop hook
POST /api/hooks/stop               ← Stop hook

All return 200 immediately (non-blocking for Claude Code).
```

---

## Claude Code Integration

### JSONL File Layout

```
~/.claude/projects/<cwd-encoded>/<session-uuid>.jsonl           # main session
~/.claude/projects/<cwd-encoded>/<session-uuid>/subagents/agent-<hex>.jsonl  # subagents
```

### Key JSONL Entry Types

| `type` | Description |
|---|---|
| `user` | User prompt or tool_result fed back to model |
| `assistant` | Claude response: text, tool_use, thinking blocks |
| `progress` | Live updates: `agent_progress`, `bash_progress`, `hook_progress` |
| `system` | Internal events: `stop_hook_summary`, `turn_duration`, `compact_boundary` |

### Agent Hierarchy in Logs

- **Subagents**: separate JSONL files under `subagents/`, entries have `isSidechain: true` + `agentId`
- **Team agents**: entries tagged with `teamName` + `agentName` fields
- **Linking**: parent transcript has `progress` entries with `data.type: "agent_progress"` + `agentId` pointing to child

### HTTP Hook Configuration

Add to `.claude/settings.json` (or project-level `.claude/settings.local.json`):

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/pre-tool-use" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/post-tool-use" }] }],
    "SubagentStart": [{ "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/subagent-start" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/subagent-stop" }] }],
    "SessionStart": [{ "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/session-start" }] }],
    "Stop": [{ "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/stop" }] }]
  }
}
```

Hook stdin JSON always includes: `session_id`, `transcript_path`, `cwd`, `hook_event_name`.

---

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
├── Dockerfile                     # Multi-stage: build → production
├── docker-compose.yml             # Backend + frontend + volume mounts
├── package.json                   # private: true, workspaces, bin field
├── pnpm-workspace.yaml            # packages: ["apps/*", "packages/*"]
├── turbo.json                     # Pipeline: build shared-types first
└── tsconfig.base.json             # Shared TS config (strict, ES2022)
```

### Turborepo Pipeline

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

`turbo run dev` → compiles shared-types → starts backend (tsx watch) + frontend (vite) in parallel.

---

## Deployment Strategy

### Option 1: `npx agent-viz` (Primary)

```
npm package (published to npm)
├── bin/agent-viz.js        ← Shebang entry: spawns server, opens browser
├── dist/                   ← Pre-built Vite SPA (bundled into published package)
└── server/                 ← Compiled backend (serves API + static dist/)
```

The `bin/agent-viz.js` script:
1. Starts Hono server on port 3001
2. Serves the pre-built frontend SPA from `dist/`
3. Opens `http://localhost:3001` in the default browser
4. Watches `~/.claude/projects/` for JSONL activity

Users run: `npx agent-viz` — done. No config, no Docker, no git clone.

### Option 2: Docker Compose (For persistent/team use)

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ~/.claude/projects:/data/claude-projects:ro   # Read-only JSONL access
      - agent-viz-data:/data/db                       # Persistent SQLite
    environment:
      - CLAUDE_PROJECTS_DIR=/data/claude-projects
      - CHOKIDAR_USEPOLLING=true                      # Required for Docker volumes

volumes:
  agent-viz-data:
```

### Option 3: Clone & Dev

```bash
git clone https://github.com/<org>/agent-viz.git
cd agent-viz
pnpm install
turbo run dev    # Backend on :3001, Frontend on :5173
```

---

## Visual Design

### Color Palette

```css
/* Base */
--bg-primary: #080b14;          /* deep space black-blue */
--bg-surface: #0d1117;          /* panel backgrounds */
--bg-glass: rgba(13,17,23,0.7); /* glassmorphism panels */

/* Neon accents */
--accent-cyan: #00d9ff;         /* active agent nodes */
--accent-magenta: #ff2d78;      /* error/warning states */
--accent-purple: #7c3aed;       /* edges / connections */
--accent-green: #00ff9f;        /* success / completed */

/* Text */
--text-primary: #e6edf3;        /* main UI text */
--text-muted: #8b949e;          /* secondary info */
--text-code: #79c0ff;           /* monospace data */

/* Glows */
--glow-cyan: 0 0 20px rgba(0,217,255,0.4), 0 0 40px rgba(0,217,255,0.2);
--glow-magenta: 0 0 20px rgba(255,45,120,0.4);
```

### Typography

- **UI labels/headings**: Inter or Geist (system-level, no font load)
- **Code/data/IDs**: JetBrains Mono or Fira Code (monospace, ligatures)
- **Node titles**: Geist Mono (matches Claude Code's own aesthetic)

### Visual Techniques

| Technique | Implementation |
|---|---|
| Node glow | CSS `box-shadow` with accent colors + `filter: blur()` |
| Gradient borders | CSS `conic-gradient` with rotation animation (Turbo Flow pattern) |
| Edge animation | SVG `linearGradient` + CSS animation along path |
| Background particles | tsParticles canvas layer behind React Flow viewport |
| Panel glass | `backdrop-filter: blur(12px)` + semi-transparent background |
| Active node pulse | CSS `@keyframes` pulsing `box-shadow` |
| Message flow | GSAP animation of dot traveling along edge SVG path |

---

## Key References

| Project | Stack | Relevance |
|---|---|---|
| [agents-observe](https://github.com/simple10/agents-observe) | Hono + Node.js + WS + SQLite + React | Most similar architecture; production-validated |
| [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Python hooks + Bun/TS server + SQLite + Vue | Good hook integration example |
| [React Flow Turbo Flow example](https://reactflow.dev/examples/styling/turbo-flow) | React Flow + CSS | Proves the sci-fi glow aesthetic with pure CSS |
| [Claude Code Hooks docs](https://docs.anthropic.com/en/docs/claude-code/hooks) | — | 25+ hook events, `"type": "http"` for native HTTP delivery |

---

## Decision Log

| Decision | Alternatives Considered | Why This Choice |
|---|---|---|
| React Flow over Sigma.js | Sigma.js (WebGL, 100K nodes) | DOM-based nodes = full CSS/React customization; 50-200 node scale doesn't need WebGL |
| Hono over Fastify | Fastify (larger ecosystem) | Lighter, TypeScript-first, used by closest reference project |
| SQLite over DuckDB | DuckDB (OLAP), PGlite (Postgres) | Best embedded ergonomics, WAL for concurrent R/W, zero config |
| Drizzle over Prisma | Prisma (more popular) | 5KB vs 1.6MB, no codegen step, programmatic migrations |
| WebSocket over SSE | SSE (simpler, auto-reconnect) | Need bidirectional for replay control commands |
| chokidar over @parcel/watcher | @parcel/watcher (faster) | Polling fallback needed for Docker; chokidar is battle-tested |
| pnpm + Turborepo | npm workspaces, Nx | Turborepo is lighter than Nx; pnpm is strictest with deps |
| Framer Motion + GSAP | react-spring, CSS-only | Framer for React lifecycle, GSAP for complex timeline sequences |

---

*Research completed 2026-04-02. Ready for implementation planning.*
