# Frontend Stack

## Core Libraries

| Library | Purpose | Why |
|---|---|---|
| **React Flow** (`@xyflow/react` v12) | Graph visualization | DOM-based custom nodes with full CSS/React control. Built-in viewport culling, minimap, controls, dark mode. ~80KB gzip. |
| **elkjs** | Graph layout | Hierarchical/layered DAG layout for agent trees. Lazy-loaded (~200KB) so it doesn't affect initial bundle. |
| **Zustand** | State management | React Flow's officially recommended store. Decouples WebSocket events from render cycles. Only ~3KB. |
| **Vite** | Build tool | Fast HMR for development, optimized static SPA build for production. No SSR complexity needed for a dev tool. |

## Animation Stack

| Library | Purpose | Why |
|---|---|---|
| **Framer Motion** | React-aware animations | Panel transitions, mount/unmount with `AnimatePresence`, node lifecycle animations. ~85KB. |
| **GSAP** (core) | Complex animation sequences | Edge pulses, spawn bursts, timeline scrubbing. Handles thousands of simultaneous tweens. ~23KB. |
| **tsParticles** (slim) | Background particles | Canvas-based "space dust" behind the graph. Zero perf impact on main thread. ~10KB. |

## UI Components

| Library | Purpose | Why |
|---|---|---|
| **shadcn/ui** | UI primitives | Copy-paste components (not a dependency). Built on Radix primitives. Dark mode via CSS variables. Tailwind-native. |
| **Tailwind CSS** | Styling | Utility-first, purged in production. Enables glassmorphism panels via `backdrop-blur`. ~10-15KB. |
| **Recharts** | Charts | Token usage area charts, event histograms. Composable React API. ~60KB. |
| **TanStack Virtual** | Virtual scrolling | Virtualized transcript viewer for long agent conversations. Only ~5KB. |

## Total Frontend Bundle

**~321KB gzip** — acceptable for a developer tool that runs locally.
