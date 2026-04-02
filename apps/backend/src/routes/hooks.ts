/**
 * Hook receiver routes — Claude Code POSTs to these endpoints on each event.
 *
 * All endpoints return 200 immediately (non-blocking).
 * Payloads are validated with Zod before touching business logic.
 * Invalid payloads get a 400 response; transcript_path is checked for path traversal.
 *
 * Security requirements from SECURITY.md:
 *   - Zod validation with .strip() (no passthrough)
 *   - transcript_path must be under CLAUDE_PROJECTS_DIR
 *   - Return 200 immediately, process async
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { monotonicFactory } from "ulid";
import type {
  ServerEvent,
  SessionStartEvent,
  AgentSpawnedEvent,
  AgentCompletedEvent,
  ToolCallEvent,
  SessionEndEvent,
} from "@agent-viz/shared-types";
import { getBuffer } from "../ingest/event-buffer.js";
import { markHookSession } from "../ingest/file-watcher.js";
import { createSession, upsertAgent } from "../db/queries.js";
import type { NewSession, NewAgent } from "../db/schema.js";

const ulid = monotonicFactory();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECTS_DIR =
  process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");

// ---------------------------------------------------------------------------
// Zod schemas (from SECURITY.md)
// ---------------------------------------------------------------------------

const HookBase = z.object({
  session_id: z.string().uuid(),
  transcript_path: z.string().max(1024),
  cwd: z.string().max(2048),
  hook_event_name: z.string().max(64),
});

const SessionStartHookSchema = HookBase.extend({
  model: z.string().max(128).optional(),
  session_type: z.enum(["startup", "resume", "clear", "compact"]).optional(),
});

const StopHookSchema = HookBase.extend({
  stop_reason: z.string().max(128).optional(),
});

const ToolUseHookSchema = HookBase.extend({
  tool_use_id: z.string().max(128),
  tool_name: z.string().max(128),
  tool_input: z.record(z.unknown()).optional(),
  tool_response: z.unknown().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
});

const SubagentHookSchema = HookBase.extend({
  agent_id: z.string().max(64),
  parent_agent_id: z.string().max(64).optional(),
  subagent_type: z.string().max(128).optional(),
  prompt: z.string().max(4096).optional(),
  last_message: z.string().max(4096).optional(),
});

// ---------------------------------------------------------------------------
// Path validation helper
// ---------------------------------------------------------------------------

function validateTranscriptPath(rawPath: string): string {
  const resolved = path.resolve(rawPath);
  const base = path.resolve(PROJECTS_DIR);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("transcript_path escapes CLAUDE_PROJECTS_DIR");
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ok(c: Context<any>) {
  return c.json({ ok: true }, 200);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function badRequest(c: Context<any>, msg: string) {
  return c.json({ error: msg }, 400);
}

// ---------------------------------------------------------------------------
// Session registry (sessionUuid → internal ULID id)
// ---------------------------------------------------------------------------

const sessionIdMap = new Map<string, string>(); // uuid → ulid

function getOrCreateSessionId(sessionUuid: string): string {
  const existing = sessionIdMap.get(sessionUuid);
  if (existing) return existing;
  const id = ulid();
  sessionIdMap.set(sessionUuid, id);
  return id;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const hooksRouter = new Hono();

// POST /api/hooks/session-start
hooksRouter.post("/session-start", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest(c, "Invalid JSON"); }

  const result = SessionStartHookSchema.safeParse(body);
  if (!result.success) return badRequest(c, result.error.message);

  const data = result.data;
  let transcriptPath: string;
  try { transcriptPath = validateTranscriptPath(data.transcript_path); }
  catch { return badRequest(c, "transcript_path escapes CLAUDE_PROJECTS_DIR"); }

  // Mark this session as hook-owned so the JSONL watcher skips it
  markHookSession(data.session_id);

  const sessionId = getOrCreateSessionId(data.session_id);
  const slug = `session-${sessionId.slice(0, 8).toLowerCase()}`;

  // Create session in DB (idempotent — hooks may fire multiple times on resume)
  const newSession: NewSession = {
    id: sessionId,
    slug,
    cwd: data.cwd,
    transcriptPath,
    model: data.model ?? "unknown",
    ingestionSource: "hooks",
    status: "active",
    createdAt: Date.now(),
  };
  try { createSession(newSession); } catch { /* already exists */ }

  // Create root agent — use bare "root" ID to match JSONL ingestion path
  const rootAgent: NewAgent = {
    id: "root",
    sessionId,
    isSidechain: 0,
    depth: 0,
    status: "active",
    createdAt: Date.now(),
  };
  try { upsertAgent(rootAgent); } catch { /* already exists */ }

  const ev: SessionStartEvent = {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: getBuffer().nextSeq(sessionId),
    type: "session_start",
    slug,
    cwd: data.cwd,
    model: data.model ?? "unknown",
    source: data.session_type ?? "startup",
  };

  getBuffer().push(ev);
  return ok(c);
});

// POST /api/hooks/pre-tool-use
hooksRouter.post("/pre-tool-use", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest(c, "Invalid JSON"); }

  const result = ToolUseHookSchema.safeParse(body);
  if (!result.success) return badRequest(c, result.error.message);

  const data = result.data;
  try { validateTranscriptPath(data.transcript_path); }
  catch { return badRequest(c, "transcript_path escapes CLAUDE_PROJECTS_DIR"); }

  const sessionId = getOrCreateSessionId(data.session_id);

  const ev: ToolCallEvent = {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: getBuffer().nextSeq(sessionId),
    type: "tool_call",
    agentId: "root",
    toolUseId: data.tool_use_id,
    toolName: data.tool_name,
    toolInput: data.tool_input ?? {},
    phase: "pre",
  };

  getBuffer().push(ev);
  return ok(c);
});

// POST /api/hooks/post-tool-use
hooksRouter.post("/post-tool-use", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest(c, "Invalid JSON"); }

  const result = ToolUseHookSchema.safeParse(body);
  if (!result.success) return badRequest(c, result.error.message);

  const data = result.data;
  try { validateTranscriptPath(data.transcript_path); }
  catch { return badRequest(c, "transcript_path escapes CLAUDE_PROJECTS_DIR"); }

  const sessionId = getOrCreateSessionId(data.session_id);

  const ev: ToolCallEvent = {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: getBuffer().nextSeq(sessionId),
    type: "tool_call",
    agentId: "root",
    toolUseId: data.tool_use_id,
    toolName: data.tool_name,
    toolInput: data.tool_input ?? {},
    phase: "post",
    toolResponse: data.tool_response,
    durationMs: data.duration_ms,
  };

  getBuffer().push(ev);
  return ok(c);
});

// POST /api/hooks/subagent-start
hooksRouter.post("/subagent-start", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest(c, "Invalid JSON"); }

  const result = SubagentHookSchema.safeParse(body);
  if (!result.success) return badRequest(c, result.error.message);

  const data = result.data;
  try { validateTranscriptPath(data.transcript_path); }
  catch { return badRequest(c, "transcript_path escapes CLAUDE_PROJECTS_DIR"); }

  const sessionId = getOrCreateSessionId(data.session_id);
  const parentId = data.parent_agent_id ?? "root";

  // Register agent in DB — use bare agent IDs to match JSONL ingestion path
  const agentRow: NewAgent = {
    id: data.agent_id,
    sessionId,
    parentAgentId: parentId,
    isSidechain: 1,
    depth: 1,
    status: "active",
    createdAt: Date.now(),
    metadata: JSON.stringify({ subagentType: data.subagent_type }),
  };
  upsertAgent(agentRow);

  const ev: AgentSpawnedEvent = {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: getBuffer().nextSeq(sessionId),
    type: "agent_spawned",
    agent: {
      agentId: data.agent_id,
      parentAgentId: parentId,
      isSidechain: true,
    },
    prompt: data.prompt,
  };

  getBuffer().push(ev);
  return ok(c);
});

// POST /api/hooks/subagent-stop
hooksRouter.post("/subagent-stop", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest(c, "Invalid JSON"); }

  const result = SubagentHookSchema.safeParse(body);
  if (!result.success) return badRequest(c, result.error.message);

  const data = result.data;
  try { validateTranscriptPath(data.transcript_path); }
  catch { return badRequest(c, "transcript_path escapes CLAUDE_PROJECTS_DIR"); }

  const sessionId = getOrCreateSessionId(data.session_id);

  const ev: AgentCompletedEvent = {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: getBuffer().nextSeq(sessionId),
    type: "agent_completed",
    agentId: data.agent_id,
    lastMessage: data.last_message,
  };

  getBuffer().push(ev);
  return ok(c);
});

// POST /api/hooks/stop
hooksRouter.post("/stop", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return badRequest(c, "Invalid JSON"); }

  const result = StopHookSchema.safeParse(body);
  if (!result.success) return badRequest(c, result.error.message);

  const data = result.data;
  try { validateTranscriptPath(data.transcript_path); }
  catch { return badRequest(c, "transcript_path escapes CLAUDE_PROJECTS_DIR"); }

  const sessionId = getOrCreateSessionId(data.session_id);

  const ev: SessionEndEvent = {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: getBuffer().nextSeq(sessionId),
    type: "session_end",
    source: data.stop_reason ?? "stop",
  };

  getBuffer().push(ev);
  // fix 11: clean up so sessionIdMap doesn't grow unboundedly
  sessionIdMap.delete(data.session_id);
  return ok(c);
});
