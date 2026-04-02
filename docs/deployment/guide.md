# Deployment Guide

Three ways to run Agent Viz, from simplest to most flexible.

## Option 1: `npx agent-viz` (Recommended)

Zero install, zero config. Just run it.

```bash
npx agent-viz
```

This:
1. Starts the Hono server on port 3001
2. Serves the pre-built frontend SPA
3. Opens `http://localhost:3001` in your default browser
4. Watches `~/.claude/projects/` for JSONL activity

### What Gets Published to npm

```
npm package
├── bin/agent-viz.js        ← Shebang entry: spawns server, opens browser
├── dist/                   ← Pre-built Vite SPA
└── server/                 ← Compiled backend (serves API + static dist/)
```

## Option 2: Docker Compose (For persistent/team use)

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

Run:
```bash
docker compose up
```

### Notes

- Claude Code JSONL files are mounted read-only
- SQLite data persists in a Docker volume
- `CHOKIDAR_USEPOLLING=true` is required because inotify doesn't work across Docker mount boundaries

## Option 3: Clone & Dev

For contributors and development:

```bash
git clone https://github.com/patchmyday/agent-viz.git
cd agent-viz
pnpm install
turbo run dev
```

This starts:
- **Backend** on `http://localhost:3001` (tsx watch mode)
- **Frontend** on `http://localhost:5173` (Vite dev server with HMR)

### Prerequisites

- Node.js 20+
- pnpm 9+

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where to find Claude Code JSONL files |
| `CHOKIDAR_USEPOLLING` | `false` | Set `true` for Docker volumes |
| `DATA_DIR` | `~/.local/share/agent-viz` | SQLite database location |

## Configuring Claude Code Hooks

For real-time events (optional but recommended), add hooks to your Claude Code config.

See [Claude Code Integration](../backend/claude-code-integration.md) for the full configuration.
