import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title'),
  slug: text('slug'),
  cwd: text('cwd'),
  transcriptPath: text('transcript_path'),
  model: text('model'),
  ingestionSource: text('ingestion_source'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  endedAt: integer('ended_at'),
  rootAgentId: text('root_agent_id'),
  metadata: text('metadata'),
}, (t) => [
  index('sessions_created_at_idx').on(t.createdAt),
  index('sessions_status_idx').on(t.status),
]);

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  parentAgentId: text('parent_agent_id'),
  name: text('name'),
  model: text('model'),
  teamName: text('team_name'),
  isSidechain: integer('is_sidechain').notNull().default(0),
  depth: integer('depth').notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  endedAt: integer('ended_at'),
  metadata: text('metadata'),
}, (t) => [
  index('agents_session_id_idx').on(t.sessionId),
  index('agents_parent_agent_id_idx').on(t.parentAgentId),
]);

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  agentId: text('agent_id').references(() => agents.id),
  sequenceNum: integer('sequence_num').notNull(),
  eventType: text('event_type').notNull(),
  timestamp: integer('timestamp').notNull(),
  payload: text('payload').notNull(),
  isTruncated: integer('is_truncated').notNull().default(0),
}, (t) => [
  uniqueIndex('events_session_event_id_uq').on(t.sessionId, t.eventId),
  index('events_session_seq_idx').on(t.sessionId, t.sequenceNum),
  index('events_session_ts_idx').on(t.sessionId, t.timestamp),
  index('events_agent_ts_idx').on(t.agentId, t.timestamp),
  index('events_event_type_idx').on(t.eventType),
]);

export const eventBlobs = sqliteTable('event_blobs', {
  eventId: integer('event_id').primaryKey().references(() => events.id),
  payload: text('payload').notNull(),
});

export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  agentId: text('agent_id').references(() => agents.id),
  toolName: text('tool_name').notNull(),
  phase: text('phase').notNull().default('pre'),
  input: text('input').notNull(),
  output: text('output'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  durationMs: integer('duration_ms'),
  status: text('status').notNull().default('pending'),
}, (t) => [
  index('tool_calls_session_started_idx').on(t.sessionId, t.startedAt),
  index('tool_calls_tool_name_idx').on(t.toolName),
  index('tool_calls_agent_id_idx').on(t.agentId),
]);

export const tokenUsage = sqliteTable('token_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  agentId: text('agent_id').references(() => agents.id),
  timestamp: integer('timestamp').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
}, (t) => [
  index('token_usage_session_id_idx').on(t.sessionId),
  index('token_usage_agent_id_idx').on(t.agentId),
  index('token_usage_timestamp_idx').on(t.timestamp),
]);

export const snapshots = sqliteTable('snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  sequenceNum: integer('sequence_num').notNull(),
  timestamp: integer('timestamp').notNull(),
  state: text('state').notNull(),
}, (t) => [
  index('snapshots_session_seq_idx').on(t.sessionId, t.sequenceNum),
]);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventBlob = typeof eventBlobs.$inferSelect;
export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
export type TokenUsageRow = typeof tokenUsage.$inferSelect;
export type NewTokenUsage = typeof tokenUsage.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
