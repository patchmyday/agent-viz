# Security

Agent Viz is a **localhost-only developer tool**. It is not designed for public network exposure. This document covers the threat model, known attack surfaces, mitigations in place, and security testing recommendations.

---

## Implementation Review — 2026-04-02

Second-pass code review of completed implementation. **All critical requirements met.** No open findings.

| Area | Status | Notes |
|---|---|---|
| CORS (localhost-only) | ✅ Fixed | `hono/cors` with origin allowlist in `index.ts` |
| Security headers + CSP | ✅ Implemented | `hono/secure-headers` with full CSP including `frameAncestors: 'none'` |
| Hook receiver validation | ✅ Implemented | Zod `.safeParse()` on all 6 endpoints; unknown fields stripped by default |
| Path traversal prevention | ✅ Implemented | `validateTranscriptPath()` with `path.resolve + startsWith` check |
| WebSocket validation | ✅ Implemented | 64KB cap + Zod discriminated union; invalid messages close with 1008 |
| REST param validation | ✅ Implemented | ULID regex, coerced numeric params with min/max bounds |
| JSONL line cap | ✅ Implemented | 512KB per-line cap; malformed lines skipped with try/catch |
| SQL injection (Drizzle) | ✅ Verified | All queries parameterized; one raw CTE uses named `@sessionId` binding |
| XSS (frontend) | ✅ Verified | No `dangerouslySetInnerHTML` found; all event data rendered via JSX auto-escaping |
| Docker non-root user | ✅ Implemented | `USER nodeuser` (UID 1001) in production stage |
| Docker localhost binding | ✅ Fixed | `127.0.0.1:3001:3001` in docker-compose.yml |
| Docker capabilities | ✅ Implemented | `cap_drop: [ALL]` + `no-new-privileges:true` |
| JSONL volume read-only | ✅ Implemented | `:ro` mount in docker-compose.yml |
| No secrets in code | ✅ Verified | No API keys, tokens, or credentials found anywhere in source |

---

## Threat Model

### Trust Boundary

Agent Viz runs entirely on the developer's machine. The server binds to `localhost:3001` (configurable via `PORT`). Claude Code POSTs hook data to this port from the same machine.

**In-scope threats** are attacks that could occur even in this localhost-only context:

| # | Attack Surface | Threat | Mitigation |
|---|---|---|---|
| 1 | HTTP / REST API | Cross-Site Request Forgery — malicious web page calls `DELETE /api/sessions/:id` | CORS restricted to `localhost` origins only |
| 2 | HTTP / REST API | Data exfiltration — malicious page reads all session data via XHR | Same CORS restriction blocks cross-origin reads |
| 3 | WebSocket | Message injection — malicious WS client sends crafted `subscribe` / `replay_control` / `filter` commands | Input validated against `ClientCommand` union type before processing |
| 4 | WebSocket | DoS — client floods server with rapid subscriptions or replay seeks | Rate limiting + max payload size enforcement recommended |
| 5 | Hook receivers (`POST /api/hooks/*`) | Malicious hook payload — crafted JSON with prototype pollution or oversized body | Payload validation with Zod; body size cap |
| 6 | Hook receivers | Path traversal via `transcript_path` field | Validate path is under `CLAUDE_PROJECTS_DIR`; never use path for file I/O without canonicalization |
| 7 | JSONL file watcher (chokidar) | Path traversal — watched path escapes `CLAUDE_PROJECTS_DIR` | chokidar scoped to a single root directory; paths validated before processing |
| 8 | JSONL parsing | Malformed JSONL causes crash or memory exhaustion | Per-line try/catch; line length cap before JSON.parse |
| 9 | SQLite (Drizzle ORM) | SQL injection | Drizzle parameterizes all queries — no raw string interpolation |
| 10 | SQLite JSON columns | Second-order injection via stored payloads re-used in raw SQL | All retrieval also uses Drizzle — no raw SQL |
| 11 | Frontend (React) | XSS via agent messages / tool output rendered in transcript | React escapes by default; never use `dangerouslySetInnerHTML` with event data |
| 12 | Docker (team/persistent mode) | Container running as root | Run as non-root user (`USER node`) |
| 13 | Docker | Unnecessary Linux capabilities | Drop all capabilities in compose; no `--privileged` |
| 14 | Docker | Port exposed on all interfaces | Docker Desktop binds to `127.0.0.1:3001` by default; document for users |

**Out-of-scope threats** (not addressed by this tool):
- Network-level attacks (firewall, TLS) — caller's responsibility if exposing port
- Supply-chain attacks on npm packages — covered by `pnpm audit` in CI
- Physical access to the developer's machine

---

## Input Validation Requirements

All external inputs must be validated before touching business logic or the database. Required Zod schemas for each boundary:

### Hook Receiver Bodies (`POST /api/hooks/*`)

All hooks share a base shape. Unknown fields must be stripped (`.strip()` not `.passthrough()`).

```typescript
// Base schema — all hooks include these
const HookBaseSchema = z.object({
  session_id: z.string().uuid(),
  transcript_path: z.string().max(1024),
  cwd: z.string().max(2048),
  hook_event_name: z.string().max(64),
});

// PreToolUse / PostToolUse additions
const ToolUseHookSchema = HookBaseSchema.extend({
  tool_use_id: z.string().max(128),
  tool_name: z.string().max(128),
  tool_input: z.record(z.unknown()).optional(),
  tool_response: z.unknown().optional(),
});

// SubagentStart / SubagentStop
const SubagentHookSchema = HookBaseSchema.extend({
  agent_id: z.string().max(64),
  parent_agent_id: z.string().max(64).optional(),
  subagent_type: z.string().max(128).optional(),
});
```

Reject with `400` on validation failure. Never propagate raw hook JSON to the database without parsing through the appropriate schema.

**Path validation for `transcript_path`:**

```typescript
import path from "node:path";

function validateTranscriptPath(rawPath: string, projectsDir: string): string {
  const resolved = path.resolve(rawPath);
  const base = path.resolve(projectsDir);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("transcript_path escapes CLAUDE_PROJECTS_DIR");
  }
  return resolved;
}
```

### WebSocket Client Commands

```typescript
const ClientCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), sessionId: z.string().uuid() }),
  z.object({
    type: z.literal("replay_control"),
    action: z.enum(["play", "pause", "seek", "set_speed"]),
    position: z.number().int().nonnegative().optional(),
    speed: z.number().min(0.1).max(10).optional(),
  }),
  z.object({
    type: z.literal("filter"),
    showAgents: z.array(z.string().max(64)).max(100).optional(),
    eventTypes: z.array(z.string().max(64)).max(20).optional(),
  }),
]);
```

Drop the connection with a `1008 Policy Violation` close code on invalid messages.

### REST Route Parameters

Session IDs are ULIDs (26-char Crockford base32). Agent IDs are hex strings or the literal `"root"`.

```typescript
const SessionIdParam = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const AgentIdParam = z.string().regex(/^([0-9a-f]{1,64}|root)$/);
const SequenceParam = z.coerce.number().int().nonnegative();
const LimitParam = z.coerce.number().int().min(1).max(500).default(100);
```

Validate in middleware before route handlers run. Return `400` for invalid params.

### JSONL Line Processing

Cap line length before parsing:

```typescript
const MAX_LINE_BYTES = 512 * 1024; // 512 KB

for (const line of lines) {
  if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
    console.warn("JSONL line exceeds size cap, skipping");
    continue;
  }
  try {
    const entry = JSON.parse(line);
    // validate entry shape...
  } catch {
    // malformed line — skip silently
  }
}
```

---

## SQL Injection Review

Agent Viz uses **Drizzle ORM** for all database access. Drizzle compiles every query to a parameterized SQLite statement via `better-sqlite3`. There is no string interpolation in query construction.

**Rules for all database code:**
1. Never use `db.run(sql\`...\`)` with user-supplied values interpolated directly — always use Drizzle's query builder or the tagged `sql` template with explicit bind parameters.
2. The `payload` / `metadata` / `input` / `output` columns store raw JSON strings. Reading them back through `JSON.parse()` and re-inserting via Drizzle is safe. Never concatenate these values into a query string.
3. `INSERT OR IGNORE` / `onConflictDoUpdate` patterns are used for idempotent ingestion — these are parameterized and safe.

**Verify:** After backend is built, grep for any raw SQL strings:
```bash
grep -rn "db\.run\|raw sql\|sqlite\.exec" apps/backend/src/
```
Expected result: zero matches involving user input.

---

## Dependency Audit

Run after `pnpm install`:

```bash
pnpm audit --audit-level=high
```

### Key Dependencies — Security Notes

| Package | Version | Notes |
|---|---|---|
| `hono` | ^4.7.0 | No known CVEs in 4.x; actively maintained |
| `@hono/node-server` | ^1.14.0 | Thin Node.js adapter; inherits Node.js HTTP security |
| `better-sqlite3` | ^11.8.0 | Native addon; no network surface; no known critical CVEs |
| `chokidar` | ^4.0.0 | ESM rewrite; removed glob dependency reducing attack surface |
| `drizzle-orm` | ^0.39.0 | No known CVEs; query builder parameterizes all inputs |
| `ulid` | ^2.3.0 | Tiny utility, no network surface |

### License Audit

All direct dependencies are MIT or Apache-2.0 licensed — compatible with Agent Viz's MIT license.

```bash
# Verify licenses
pnpm dlx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0"
```

---

## Infrastructure Security

### CORS (Fixed)

`hono/cors` is configured to allow **only localhost origins**:

```typescript
cors({
  origin: (origin) => {
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return origin ?? "";
    }
    return "";
  },
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 600,
})
```

This prevents malicious websites from making authenticated cross-origin requests to steal session data.

### Security Headers

`hono/secure-headers` is enabled on all responses. This sets:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (modern approach — rely on CSP)
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: ...`

A Content Security Policy should be added once the static file serving is set up:

```typescript
secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind needs inline styles
    connectSrc: ["'self'", "ws://localhost:*"], // WebSocket
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
})
```

### XSS Prevention in Frontend

- **Never use `dangerouslySetInnerHTML`** with any data originating from agent messages, tool inputs/outputs, or JSONL content.
- Transcript viewer must render text as plain text nodes. Use a pre-formatted `<code>` or `<pre>` element for tool output display.
- Agent name, team name, and CWD fields from session data must be treated as untrusted strings — React's default escaping handles this as long as JSX is used (not string concatenation into HTML).

### Docker Security

The Dockerfile must:
1. Use a non-root user:
   ```dockerfile
   RUN addgroup --system --gid 1001 nodejs && \
       adduser --system --uid 1001 --ingroup nodejs nodeuser
   USER nodeuser
   ```
2. Never copy `.env` files or secrets into the image.
3. Mount `~/.claude/projects` as **read-only** (already in the compose spec: `:ro`).
4. **Bind to localhost, not all interfaces.** The current compose spec uses `"3001:3001"` which binds to `0.0.0.0:3001` — exposing the server to the local network. Change to:
   ```yaml
   ports:
     - "127.0.0.1:3001:3001"
   ```
   This prevents other machines on the LAN from accessing session data.
5. Drop unnecessary capabilities in `docker-compose.yml`:
   ```yaml
   cap_drop:
     - ALL
   security_opt:
     - no-new-privileges:true
   ```
6. Do not use `--privileged` mode.

### No Secrets in Code

- No API keys, tokens, or credentials should appear in source code or the Docker image.
- The `.gitignore` must exclude `.env` files, `*.db` files, and `~/.local/share/agent-viz/`.
- The npm package (`.npmignore` / `files` in `package.json`) must exclude dev configs and local data.

---

## Security Test Recommendations

### Automated (add to CI)

```bash
# Dependency audit — fail on high/critical
pnpm audit --audit-level=high

# License compliance
pnpm dlx license-checker --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;CC0-1.0"

# Secret scanning
pnpm dlx secretlint "**/*"
```

### Manual Test Checklist

**CORS:**
- [ ] From a non-localhost origin, `fetch('http://localhost:3001/api/sessions')` is blocked by the browser
- [ ] From `http://localhost:5173`, the same request succeeds

**Input validation:**
- [ ] POST to any `/api/hooks/*` with missing `session_id` returns 400
- [ ] POST with `transcript_path: "../../etc/passwd"` returns 400
- [ ] WS message with unknown `type` is silently dropped (connection stays open)
- [ ] WS `replay_control` with `speed: 9999` returns validation error
- [ ] REST `GET /api/sessions/not-a-ulid` returns 400

**Path traversal:**
- [ ] Hook `transcript_path` pointing outside `CLAUDE_PROJECTS_DIR` is rejected
- [ ] Symlink inside `CLAUDE_PROJECTS_DIR` pointing outside is not followed

**XSS:**
- [ ] Agent message containing `<script>alert(1)</script>` is displayed as escaped text in transcript
- [ ] Tool input JSON containing `"><img src=x onerror=alert(1)>` is rendered safely

**Docker:**
- [ ] `docker exec <container> id` shows non-root user
- [ ] `docker inspect <container>` shows `Privileged: false`
- [ ] `docker inspect <container> --format '{{json .HostConfig.PortBindings}}'` shows `127.0.0.1:3001` not `0.0.0.0:3001`

---

## Reporting Security Issues

This is a local developer tool. If you discover a security issue that could affect users, please open a GitHub issue with the `security` label or email the maintainer directly.
