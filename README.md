# Agent Viz

> Real-time visualization of Claude Code agent orchestration as an interactive node graph.
> Dark sci-fi aesthetic. Open-source. Zero-config deployment.

## What is this?

Agent Viz watches your Claude Code sessions in real-time and renders agent orchestration as a live, interactive graph. See how agents spawn, communicate, call tools, and complete tasks — all visualized with a polished sci-fi interface.

**Key features:**

- Live node graph of agent hierarchies with animated edges and glow effects
- Timeline panel (Gantt-style) showing agent activity over time
- Token usage charts and cost tracking per agent
- Transcript viewer with virtualized scrolling
- Session replay with scrubbing — debug past sessions frame by frame
- Persistent log storage for post-mortem analysis
- Zero config — auto-discovers Claude Code sessions

## Quick Start

```bash
# Option 1: npx (recommended)
npx agent-viz

# Option 2: Docker
docker compose up

# Option 3: Development
git clone https://github.com/patchmyday/agent-viz.git
cd agent-viz
pnpm install
turbo run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + React Flow + Zustand + Vite |
| Animations | Framer Motion + GSAP + tsParticles |
| UI | shadcn/ui + Tailwind CSS |
| Backend | Hono + chokidar + WebSocket |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| Monorepo | pnpm + Turborepo |

## Project Structure

```
agent-viz/
├── apps/
│   ├── frontend/           # React SPA — graph visualization & panels
│   └── backend/            # Hono server — file watching, API, WebSocket
├── packages/
│   └── shared-types/       # TypeScript interfaces shared across apps
├── bin/
│   └── agent-viz.js        # npx entry point
├── docs/                   # Architecture & design documentation
│   ├── architecture/       # System design, data flow, event protocol
│   ├── frontend/           # UI stack, visual design, graph mapping
│   ├── backend/            # Server stack, API surface, Claude Code integration
│   ├── database/           # Schema, queries, write strategies
│   └── deployment/         # Docker, npx, development setup
├── Dockerfile
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## Documentation

Start here, then dive into the area you're working on:

| Document | Description |
|----------|-------------|
| [Tech Stack Overview](docs/architecture/tech-stack.md) | All technology choices with rationale and compatibility matrix |
| [Data Flow Architecture](docs/architecture/data-flow.md) | How data moves from Claude Code to the UI |
| [Event Protocol](docs/architecture/event-protocol.md) | TypeScript types for server/client communication |
| [Frontend Stack](docs/frontend/stack.md) | Visualization libraries, animations, component choices |
| [Visual Design](docs/frontend/visual-design.md) | Color palette, typography, animation techniques |
| [Backend Stack](docs/backend/stack.md) | Server framework, file watching, real-time transport |
| [API Surface](docs/backend/api.md) | REST endpoints, WebSocket protocol, hook receivers |
| [Claude Code Integration](docs/backend/claude-code-integration.md) | JSONL format, hook configuration, agent hierarchy |
| [Database Schema](docs/database/schema.md) | All 7 tables with columns, indexes, and relationships |
| [Database Strategies](docs/database/strategies.md) | Write buffering, dedup, snapshots, storage management |
| [Deployment Guide](docs/deployment/guide.md) | npx, Docker Compose, and development setup |
| [Decision Log](docs/architecture/decisions.md) | Every major tech choice and alternatives considered |

## How It Works

Agent Viz uses **dual ingestion** to capture Claude Code activity:

1. **HTTP Hooks** (primary) — Claude Code POSTs structured events directly to the backend
2. **JSONL File Watching** (fallback) — chokidar watches `~/.claude/projects/` for log file changes

Both paths normalize events into a shared `ServerEvent` protocol, persist them to SQLite, and broadcast via WebSocket to connected frontends.

## Contributing

```bash
git clone https://github.com/patchmyday/agent-viz.git
cd agent-viz
pnpm install
turbo run dev    # Backend on :3001, Frontend on :5173
```

## License

MIT
