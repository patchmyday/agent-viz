# Backend Stack

## Core Technologies

| Technology | Purpose | Why |
|---|---|---|
| **Hono** | HTTP + WebSocket server | TypeScript-first, built-in `upgradeWebSocket()`, lightweight, used by agents-observe reference project |
| **chokidar v5** | File system watching | ESM-native, polling fallback for Docker/WSL/NFS, append-detection via size delta. Battle-tested. |
| **WebSocket** | Real-time transport | Bidirectional: server pushes events to clients, clients send replay/filter commands back |
| **tsx** (dev) / **Node.js** (prod) | Process manager | Direct TypeScript execution in dev; compiled JS in production |

## Why Hono over Fastify?

- Lighter weight, fewer abstractions
- TypeScript-first with excellent type inference
- Built-in WebSocket upgrade support (no separate library)
- Used by the closest reference project (agents-observe)
- Fastify has a larger plugin ecosystem, but we don't need most of it

## Why WebSocket over SSE?

- SSE is simpler and has auto-reconnect built in
- But we need **bidirectional** communication for:
  - Replay control commands (play, pause, seek, set speed)
  - Session subscription/unsubscription
  - Event filtering
- WebSocket handles both directions natively

## Why chokidar over @parcel/watcher?

- @parcel/watcher is faster (native C++ bindings)
- But chokidar has a **polling fallback** needed for:
  - Docker volumes (inotify doesn't work across mount boundaries)
  - WSL file systems
  - NFS mounts
- chokidar v5 is ESM-native and well-maintained
