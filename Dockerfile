# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Enable corepack and pin pnpm version to match packageManager field
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy manifests first so dependency install is cached independently of source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile

# Copy source and build everything:
#   shared-types → backend (tsc) + frontend (vite) in dependency order
COPY apps/ apps/
COPY packages/ packages/
COPY bin/ bin/

RUN pnpm build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Create non-root user (matches UID 1001 convention for container security)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeuser

WORKDIR /app

# Copy only what the runtime needs:
#   - root node_modules (all hoisted deps + workspace symlinks)
#   - backend compiled output
#   - frontend built SPA (served as static files by the backend)
#   - bin entry script + root package.json (for ESM "type": "module" resolution)
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nodeuser:nodejs /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=builder --chown=nodeuser:nodejs /app/bin ./bin
COPY --from=builder --chown=nodeuser:nodejs /app/package.json ./package.json

# Apps may have their own node_modules for non-hoisted deps (e.g. native addons)
COPY --from=builder --chown=nodeuser:nodejs /app/apps/backend/node_modules ./apps/backend/node_modules

USER nodeuser

# Defaults — all overridable via environment or docker-compose
ENV NODE_ENV=production
ENV PORT=3001
ENV CLAUDE_PROJECTS_DIR=/data/claude-projects
ENV DATA_DIR=/data/db
ENV CHOKIDAR_USEPOLLING=false

EXPOSE 3001

# Run the compiled backend directly; it serves the frontend SPA as static files
CMD ["node", "apps/backend/dist/index.js"]
