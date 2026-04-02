# Decision Log

Every major technology choice, what alternatives were considered, and why we chose what we did.

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

## Key References

| Project | Stack | Relevance |
|---|---|---|
| [agents-observe](https://github.com/simple10/agents-observe) | Hono + Node.js + WS + SQLite + React | Most similar architecture; production-validated |
| [claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Python hooks + Bun/TS server + SQLite + Vue | Good hook integration example |
| [React Flow Turbo Flow example](https://reactflow.dev/examples/styling/turbo-flow) | React Flow + CSS | Proves the sci-fi glow aesthetic with pure CSS |
| [Claude Code Hooks docs](https://docs.anthropic.com/en/docs/claude-code/hooks) | — | 25+ hook events, `"type": "http"` for native HTTP delivery |
