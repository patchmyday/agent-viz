/**
 * REST routes for session management.
 *
 * GET  /api/sessions                            — list all sessions
 * GET  /api/sessions/:id                        — session detail + agent tree + stats
 * GET  /api/sessions/:id/history?limit=&before= — cursor-paginated event history
 * DELETE /api/sessions/:id                      — remove session from DB
 *
 * All route params are validated with Zod before hitting the DB.
 */

import { Hono } from "hono";
import { z } from "zod";
import { listSessions, getSession, deleteSession, getSessionHistory } from "../db/queries.js";

// ---------------------------------------------------------------------------
// Validation schemas (from SECURITY.md)
// ---------------------------------------------------------------------------

const SessionIdParam = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid session ID (must be a 26-char ULID)");
const SequenceParam = z.coerce.number().int().nonnegative();
const LimitParam = z.coerce.number().int().min(1).max(500).default(100);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const sessionsRouter = new Hono();

// GET /api/sessions
sessionsRouter.get("/", (c) => {
  const rows = listSessions();

  const sessions = rows.map((s) => ({
    sessionId: s.id,
    slug: s.slug ?? s.id,
    cwd: s.cwd ?? "",
    startedAt: s.createdAt,
    endedAt: s.endedAt ?? null,
    isLive: s.status === "active",
    model: s.model ?? "unknown",
    ingestionSource: s.ingestionSource ?? "jsonl",
  }));

  return c.json({ sessions });
});

// GET /api/sessions/:id
sessionsRouter.get("/:id", (c) => {
  const rawId = c.req.param("id");
  const idResult = SessionIdParam.safeParse(rawId);
  if (!idResult.success) {
    return c.json({ error: "Invalid session ID" }, 400);
  }

  const result = getSession(idResult.data);
  if (!result) {
    return c.json({ error: "Session not found" }, 404);
  }

  const { session, agents, stats } = result;

  return c.json({
    session: {
      sessionId: session.id,
      slug: session.slug ?? session.id,
      cwd: session.cwd ?? "",
      startedAt: session.createdAt,
      endedAt: session.endedAt ?? null,
      isLive: session.status === "active",
      model: session.model ?? "unknown",
    },
    agents: agents.map((a) => ({
      agentId: a.id,
      sessionId: a.sessionId,
      parentAgentId: a.parentAgentId ?? null,
      name: a.name ?? null,
      model: a.model ?? null,
      teamName: a.teamName ?? null,
      isSidechain: a.isSidechain === 1,
      depth: a.depth,
      status: a.status,
      createdAt: a.createdAt,
      endedAt: a.endedAt ?? null,
    })),
    stats: {
      totalEvents: stats.eventCount,
      totalToolCalls: stats.totalToolCalls,
      totalInputTokens: stats.totalInputTokens,
      totalOutputTokens: stats.totalOutputTokens,
      totalCacheReadTokens: stats.totalCacheReadTokens,
      totalCacheWriteTokens: stats.totalCacheWriteTokens,
    },
  });
});

// GET /api/sessions/:id/history
sessionsRouter.get("/:id/history", (c) => {
  const rawId = c.req.param("id");
  const idResult = SessionIdParam.safeParse(rawId);
  if (!idResult.success) {
    return c.json({ error: "Invalid session ID" }, 400);
  }

  const limitResult = LimitParam.safeParse(c.req.query("limit"));
  if (!limitResult.success) {
    return c.json({ error: "Invalid limit parameter" }, 400);
  }

  const beforeRaw = c.req.query("before");
  let beforeSeq: number | undefined;
  if (beforeRaw !== undefined) {
    const beforeResult = SequenceParam.safeParse(beforeRaw);
    if (!beforeResult.success) {
      return c.json({ error: "Invalid before parameter" }, 400);
    }
    beforeSeq = beforeResult.data;
  }

  const rows = getSessionHistory(idResult.data, limitResult.data, beforeSeq);

  const events = rows
    .map((r) => {
      try { return JSON.parse(r.payload); } catch { return null; }
    })
    .filter(Boolean);

  // rows returned DESC; reverse so client receives ASC
  events.reverse();

  return c.json({
    events,
    hasMore: rows.length === limitResult.data,
  });
});

// DELETE /api/sessions/:id
sessionsRouter.delete("/:id", (c) => {
  const rawId = c.req.param("id");
  const idResult = SessionIdParam.safeParse(rawId);
  if (!idResult.success) {
    return c.json({ error: "Invalid session ID" }, 400);
  }

  const existing = getSession(idResult.data);
  if (!existing) {
    return c.json({ error: "Session not found" }, 404);
  }

  deleteSession(idResult.data);
  return new Response(null, { status: 204 });
});
