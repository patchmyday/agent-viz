# Tech Stack Overview

## Frontend

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

## Backend

| Category | Choice | License | Rationale |
|---|---|---|---|
| **Server framework** | Hono (on Node.js) | MIT | TypeScript-first, built-in `upgradeWebSocket()`, used by agents-observe reference project |
| **Real-time transport** | WebSocket | — | Bidirectional: server pushes events, client sends replay/filter commands |
| **File watching** | chokidar v5 | MIT | ESM-native, polling fallback for Docker/WSL/NFS, append-detection via size delta |
| **Hook integration** | Claude Code HTTP hooks | — | Native `"type": "http"` — Claude Code POSTs structured JSON directly to backend |
| **Process manager** | tsx (dev) / Node.js (prod) | MIT | Direct TypeScript execution in dev; compiled JS in production |

## Database

| Category | Choice | License | Rationale |
|---|---|---|---|
| **Database** | SQLite via better-sqlite3 | MIT | Embedded, zero-config, WAL mode, 62K sync ops/sec, full SQL including recursive CTEs |
| **ORM** | Drizzle ORM | Apache-2.0 | 5KB overhead (vs Prisma's 1.6MB), no codegen, programmatic migrations, TypeScript schema |
| **Migrations** | Drizzle Kit (generate) + `migrate()` at startup | Apache-2.0 | Zero CLI steps for contributors; auto-migrates on every launch |

## Monorepo Tooling

| Category | Choice | License | Rationale |
|---|---|---|---|
| **Package manager** | pnpm | MIT | Workspace support, strict node_modules, faster installs |
| **Build orchestrator** | Turborepo | MIT | `dependsOn: ["^build"]` ensures shared-types compiles before apps; parallel dev servers |

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
