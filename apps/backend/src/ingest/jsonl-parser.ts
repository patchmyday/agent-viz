/**
 * JSONL parser for Claude Code session transcripts.
 *
 * Claude Code writes two kinds of JSONL files:
 *   - Main session:  ~/.claude/projects/<cwd-encoded>/<session-uuid>.jsonl
 *   - Subagent:      ~/.claude/projects/<cwd-encoded>/<session-uuid>/subagents/agent-<hex>.jsonl
 *
 * Each line is a JSON object with a `type` field: "user" | "assistant" | "progress" | "system".
 * We normalize these into `ServerEvent` objects from @agent-viz/shared-types.
 */

import { randomUUID } from "node:crypto";
import type {
  AgentInfo,
  ServerEvent,
  SessionStartEvent,
  AgentSpawnedEvent,
  AgentCompletedEvent,
  ToolCallEvent,
  AssistantMessageEvent,
  UserMessageEvent,
  SessionEndEvent,
} from "@agent-viz/shared-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LINE_BYTES = 512 * 1024; // 512 KB — skip lines larger than this

// ---------------------------------------------------------------------------
// Raw JSONL entry shapes (loosely typed — we validate at parse time)
// ---------------------------------------------------------------------------

interface RawEntry {
  type: "user" | "assistant" | "progress" | "system";
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  isSidechain?: boolean;
  agentId?: string;
  agentName?: string;
  teamName?: string;
  parentAgentId?: string;
  message?: RawMessage;
  data?: Record<string, unknown>;
}

interface RawMessage {
  role?: string;
  model?: string;
  content?: RawContent[] | string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  stop_reason?: string;
}

interface RawContent {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

// ---------------------------------------------------------------------------
// ParseContext — carries state across lines of a single file
// ---------------------------------------------------------------------------

export interface ParseContext {
  sessionId: string;
  agentId: string; // "root" for main file; hex ID for subagent files
  isSubagent: boolean;
  parentAgentId?: string;
  sequenceBase: number; // offset so subagent sequences don't collide with main
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an array of raw text lines into ServerEvents.
 * Lines are processed in order; each line is a complete JSON object.
 * @param lines    Array of raw text lines (already split on newlines)
 * @param ctx      Session/agent context for this file
 * @returns        Array of normalized ServerEvents (may be empty if all lines are skipped)
 */
export function parseLines(lines: string[], ctx: ParseContext): ServerEvent[] {
  const events: ServerEvent[] = [];
  let seq = ctx.sequenceBase;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (Buffer.byteLength(trimmed) > MAX_LINE_BYTES) {
      console.warn(`[jsonl-parser] Line exceeds ${MAX_LINE_BYTES} byte cap — skipping`);
      continue;
    }

    let entry: RawEntry;
    try {
      entry = JSON.parse(trimmed) as RawEntry;
    } catch {
      // Malformed line — skip silently
      continue;
    }

    const timestamp = entry.timestamp ?? new Date().toISOString();

    try {
      // nextSeq increments for every event produced from this line
      const normalized = normalizeEntry(entry, ctx, timestamp, () => seq++);
      events.push(...normalized);
    } catch (err) {
      console.warn("[jsonl-parser] Failed to normalize entry:", err);
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Internal normalization
// ---------------------------------------------------------------------------

function normalizeEntry(
  entry: RawEntry,
  ctx: ParseContext,
  timestamp: string,
  nextSeq: () => number,
): ServerEvent[] {
  const mkBase = (id?: string) => ({
    eventId: id ?? randomUUID(),
    sessionId: ctx.sessionId,
    timestamp,
    sequence: nextSeq(),
  });

  switch (entry.type) {
    case "user": {
      const ev = normalizeUser(entry, mkBase(entry.uuid), ctx);
      return ev ? [ev] : [];
    }
    case "assistant":
      return normalizeAssistant(entry, ctx, timestamp, mkBase, nextSeq);
    case "progress": {
      const ev = normalizeProgress(entry, mkBase(entry.uuid), ctx);
      return ev ? [ev] : [];
    }
    case "system": {
      const ev = normalizeSystem(entry, mkBase(entry.uuid), ctx);
      return ev ? [ev] : [];
    }
    default:
      return [];
  }
}

function normalizeUser(
  entry: RawEntry,
  base: BaseArg,
  ctx: ParseContext,
): ServerEvent | null {
  const content = entry.message?.content;

  // tool_result entries come back as user messages — skip them for transcript
  // (they're paired with the assistant tool_call we already captured)
  if (Array.isArray(content)) {
    const hasToolResult = content.some((c) => c.type === "tool_result");
    if (hasToolResult) return null;

    // Extract text from the first text block
    const textBlock = content.find((c) => c.type === "text");
    const text = textBlock?.text ?? "";
    if (!text) return null;

    const ev: UserMessageEvent = {
      ...base,
      type: "user_message",
      agentId: ctx.agentId,
      text,
    };
    return ev;
  }

  if (typeof content === "string" && content) {
    const ev: UserMessageEvent = {
      ...base,
      type: "user_message",
      agentId: ctx.agentId,
      text: content,
    };
    return ev;
  }

  return null;
}

function normalizeAssistant(
  entry: RawEntry,
  ctx: ParseContext,
  timestamp: string,
  mkBase: (id?: string) => BaseArg,
  nextSeq: () => number,
): ServerEvent[] {
  const msg = entry.message;
  if (!msg) return [];

  const content = Array.isArray(msg.content) ? msg.content : [];
  const textBlocks = content.filter((c) => c.type === "text").map((c) => c.text ?? "");
  const hasThinking = content.some((c) => c.type === "thinking");
  const text = textBlocks.join("\n").trim();
  const toolUseBlocks = content.filter((c) => c.type === "tool_use");

  const usage = msg.usage
    ? {
        inputTokens: msg.usage.input_tokens ?? 0,
        outputTokens: msg.usage.output_tokens ?? 0,
        cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
      }
    : undefined;

  const results: ServerEvent[] = [];

  // Emit text message (fix 9: don't early-return — continue to check for tool_use blocks)
  if (text) {
    const ev: AssistantMessageEvent = {
      ...mkBase(entry.uuid),
      type: "assistant_message",
      agentId: ctx.agentId,
      text,
      hasThinking,
      tokenUsage: usage,
    };
    results.push(ev);
  }

  // Emit one tool_call per tool_use block (fix 8: loop, not just first)
  for (const block of toolUseBlocks) {
    const ev: ToolCallEvent = {
      // Use tool_use_id as eventId for stable dedup on re-read
      ...mkBase(block.id ?? undefined),
      type: "tool_call",
      agentId: ctx.agentId,
      toolUseId: block.id ?? randomUUID(),
      toolName: block.name ?? "unknown",
      toolInput: block.input ?? {},
      phase: "pre",
    };
    results.push(ev);
  }

  return results;
}

function normalizeProgress(
  entry: RawEntry,
  base: BaseArg,
  ctx: ParseContext,
): ServerEvent | null {
  const data = entry.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const progressType = data.type as string | undefined;

  // agent_progress entries signal subagent spawning
  if (progressType === "agent_progress") {
    const agentId = (data.agentId as string) ?? randomUUID();
    const agentInfo: AgentInfo = {
      agentId,
      agentName: data.agentName as string | undefined,
      teamName: data.teamName as string | undefined,
      parentAgentId: ctx.agentId,
      isSidechain: true,
    };
    const ev: AgentSpawnedEvent = {
      ...base,
      type: "agent_spawned",
      agent: agentInfo,
      prompt: data.prompt as string | undefined,
    };
    return ev;
  }

  return null;
}

function normalizeSystem(
  entry: RawEntry,
  base: BaseArg,
  ctx: ParseContext,
): ServerEvent | null {
  const data = entry.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const systemType = data.type as string | undefined;

  if (systemType === "stop_hook_summary") {
    const ev: SessionEndEvent = {
      ...base,
      type: "session_end",
      source: "stop_hook",
    };
    return ev;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BaseArg = { eventId: string; sessionId: string; timestamp: string; sequence: number };

/**
 * Build a ParseContext for a main session file.
 */
export function makeRootContext(sessionId: string, sequenceBase = 0): ParseContext {
  return { sessionId, agentId: "root", isSubagent: false, sequenceBase };
}

/**
 * Build a ParseContext for a subagent file.
 * The agentId is extracted from the filename: agent-<hex>.jsonl
 */
export function makeSubagentContext(
  sessionId: string,
  filename: string,
  parentAgentId: string,
  sequenceBase = 0,
): ParseContext {
  const match = /agent-([0-9a-f]+)\.jsonl$/i.exec(filename);
  const agentId = match ? match[1]! : randomUUID().replace(/-/g, "");
  return {
    sessionId,
    agentId,
    isSubagent: true,
    parentAgentId,
    sequenceBase,
  };
}

/**
 * Synthesize a session_start ServerEvent for a newly discovered JSONL file.
 * Used by the file watcher when a session has no hooks configured.
 */
export function makeSessionStartEvent(
  sessionId: string,
  cwd: string,
  slug: string,
): SessionStartEvent {
  return {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: 0,
    type: "session_start",
    slug,
    cwd,
    model: "unknown",
    source: "startup",
  };
}

/**
 * Synthesize an agent_spawned event for the root agent of a session.
 */
export function makeRootAgentSpawnedEvent(sessionId: string, seq: number): AgentSpawnedEvent {
  return {
    eventId: randomUUID(),
    sessionId,
    timestamp: new Date().toISOString(),
    sequence: seq,
    type: "agent_spawned",
    agent: {
      agentId: "root",
      isSidechain: false,
    },
  };
}
