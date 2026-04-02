import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { db } from './index.js';
import {
  agents,
  eventBlobs,
  events,
  sessions,
  snapshots,
  tokenUsage,
  toolCalls,
  type Agent,
  type NewAgent,
  type NewEvent,
  type NewSession,
  type NewSnapshot,
  type NewTokenUsage,
  type NewToolCall,
  type Session,
  type Snapshot,
} from './schema.js';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function createSession(data: NewSession): Session {
  return db.insert(sessions).values(data).returning().get()!;
}

export function updateSession(
  id: string,
  data: Partial<Pick<Session, 'status' | 'endedAt' | 'title' | 'rootAgentId'>>,
): Session | undefined {
  return db.update(sessions).set(data).where(eq(sessions.id, id)).returning().get();
}

export function listSessions(): Session[] {
  return db.select().from(sessions).orderBy(desc(sessions.createdAt)).all();
}

export function getSession(id: string): {
  session: Session;
  agents: Agent[];
  stats: {
    eventCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    totalToolCalls: number;
  };
} | undefined {
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) return undefined;

  const agentRows = db.select().from(agents).where(eq(agents.sessionId, id)).all();

  // Query event count and token sums separately to avoid N×M cross-join inflation
  const eventCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.sessionId, id))
    .get()!;

  const tokenRow = db
    .select({
      totalInputTokens: sql<number>`coalesce(sum(${tokenUsage.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${tokenUsage.outputTokens}), 0)`,
      totalCacheReadTokens: sql<number>`coalesce(sum(${tokenUsage.cacheReadTokens}), 0)`,
      totalCacheWriteTokens: sql<number>`coalesce(sum(${tokenUsage.cacheWriteTokens}), 0)`,
    })
    .from(tokenUsage)
    .where(eq(tokenUsage.sessionId, id))
    .get()!;

  const toolCallCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(toolCalls)
    .where(eq(toolCalls.sessionId, id))
    .get()!;

  return {
    session,
    agents: agentRows,
    stats: {
      eventCount: eventCountRow.count,
      totalInputTokens: tokenRow.totalInputTokens,
      totalOutputTokens: tokenRow.totalOutputTokens,
      totalCacheReadTokens: tokenRow.totalCacheReadTokens,
      totalCacheWriteTokens: tokenRow.totalCacheWriteTokens,
      totalToolCalls: toolCallCountRow.count,
    },
  };
}

export function deleteSession(id: string): void {
  db.transaction(() => {
    // Delete event_blobs for this session's events first
    const sessionEventIds = db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.sessionId, id))
      .all()
      .map((r) => r.id);

    if (sessionEventIds.length > 0) {
      for (const eventId of sessionEventIds) {
        db.delete(eventBlobs).where(eq(eventBlobs.eventId, eventId)).run();
      }
    }

    db.delete(snapshots).where(eq(snapshots.sessionId, id)).run();
    db.delete(tokenUsage).where(eq(tokenUsage.sessionId, id)).run();
    db.delete(toolCalls).where(eq(toolCalls.sessionId, id)).run();
    db.delete(events).where(eq(events.sessionId, id)).run();
    db.delete(agents).where(eq(agents.sessionId, id)).run();
    db.delete(sessions).where(eq(sessions.id, id)).run();
  });
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function upsertAgent(data: NewAgent): Agent {
  return db
    .insert(agents)
    .values(data)
    .onConflictDoUpdate({
      target: agents.id,
      set: {
        status: sql`excluded.status`,
        endedAt: sql`excluded.ended_at`,
        name: sql`excluded.name`,
        model: sql`excluded.model`,
        teamName: sql`excluded.team_name`,
        metadata: sql`excluded.metadata`,
      },
    })
    .returning()
    .get()!;
}

export function getAgentTree(sessionId: string): Agent[] {
  // Use column aliases to get camelCase keys matching Drizzle's Agent type
  const rawDb = db.$client;
  const stmt = rawDb.prepare(`
    WITH RECURSIVE agent_tree AS (
      SELECT
        id, session_id AS sessionId, parent_agent_id AS parentAgentId,
        name, model, team_name AS teamName, is_sidechain AS isSidechain,
        depth, status, created_at AS createdAt, ended_at AS endedAt, metadata
      FROM agents
      WHERE session_id = @sessionId AND parent_agent_id IS NULL
      UNION ALL
      SELECT
        a.id, a.session_id AS sessionId, a.parent_agent_id AS parentAgentId,
        a.name, a.model, a.team_name AS teamName, a.is_sidechain AS isSidechain,
        a.depth, a.status, a.created_at AS createdAt, a.ended_at AS endedAt, a.metadata
      FROM agents a
      INNER JOIN agent_tree t ON a.parent_agent_id = t.id
    )
    SELECT * FROM agent_tree
  `);
  return stmt.all({ sessionId }) as Agent[];
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const PAYLOAD_TRUNCATION_THRESHOLD = 8 * 1024; // 8KB

export function insertEvents(rows: NewEvent[]): void {
  if (rows.length === 0) return;
  db.transaction(() => {
    for (const row of rows) {
      const payload = row.payload as string;
      const needsTruncation = payload.length > PAYLOAD_TRUNCATION_THRESHOLD;

      const insertedEvent = db
        .insert(events)
        .values({
          ...row,
          payload: needsTruncation ? payload.slice(0, PAYLOAD_TRUNCATION_THRESHOLD) : payload,
          isTruncated: needsTruncation ? 1 : 0,
        })
        .onConflictDoNothing()
        .returning({ id: events.id })
        .get();

      // Store full payload in event_blobs if truncated and insert wasn't a no-op
      if (needsTruncation && insertedEvent) {
        db.insert(eventBlobs).values({ eventId: insertedEvent.id, payload }).run();
      }
    }
  });
}

export function getSessionHistory(
  sessionId: string,
  limit: number,
  beforeSeq?: number,
): typeof events.$inferSelect[] {
  const conditions = beforeSeq !== undefined
    ? and(eq(events.sessionId, sessionId), lt(events.sequenceNum, beforeSeq))
    : eq(events.sessionId, sessionId);

  return db
    .select()
    .from(events)
    .where(conditions)
    .orderBy(desc(events.sequenceNum))
    .limit(limit)
    .all();
}

/**
 * Get events from a given sequence number forward (for seek/replay).
 * Returns events in ASC order.
 */
export function getSessionHistoryFrom(
  sessionId: string,
  limit: number,
  fromSeq: number,
): typeof events.$inferSelect[] {
  return db
    .select()
    .from(events)
    .where(and(eq(events.sessionId, sessionId), gte(events.sequenceNum, fromSeq)))
    .orderBy(asc(events.sequenceNum))
    .limit(limit)
    .all();
}

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

export function upsertToolCall(data: NewToolCall): void {
  db.insert(toolCalls)
    .values(data)
    .onConflictDoUpdate({
      target: toolCalls.id,
      set: {
        output: sql`excluded.output`,
        endedAt: sql`excluded.ended_at`,
        durationMs: sql`excluded.duration_ms`,
        status: sql`excluded.status`,
        phase: sql`excluded.phase`,
      },
    })
    .run();
}

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export function insertTokenUsage(data: NewTokenUsage): void {
  db.insert(tokenUsage).values(data).run();
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export function createSnapshot(data: NewSnapshot): Snapshot {
  return db.insert(snapshots).values(data).returning().get()!;
}

export function getNearestSnapshot(sessionId: string, sequenceNum: number): Snapshot | undefined {
  return db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.sessionId, sessionId), lte(snapshots.sequenceNum, sequenceNum)))
    .orderBy(desc(snapshots.sequenceNum))
    .limit(1)
    .get();
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export function cleanupOldSessions(daysOld: number): number {
  const cutoffMs = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const oldSessions = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(lt(sessions.createdAt, cutoffMs))
    .all();

  for (const { id } of oldSessions) {
    deleteSession(id);
  }

  return oldSessions.length;
}
