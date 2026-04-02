# Database Schema

SQLite database at `$XDG_DATA_HOME/agent-viz/data.db` (falls back to `~/.local/share/agent-viz/data.db`).

**7 tables**: sessions, agents, events, event_blobs, tool_calls, token_usage, snapshots.

## Startup Configuration

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -65536');       // 64MB page cache
sqlite.pragma('mmap_size = 536870912');     // 512MB mmap
sqlite.pragma('busy_timeout = 5000');

const db = drizzle({ client: sqlite, schema });
migrate(db, { migrationsFolder: './drizzle' });
```

---

## Tables

### sessions

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | ULID |
| title | TEXT | Derived from first user message |
| slug | TEXT | e.g. "nifty-coalescing-lake" |
| cwd | TEXT | Working directory path |
| transcript_path | TEXT | Path to JSONL file on disk |
| model | TEXT | Primary model used |
| ingestion_source | TEXT | `'hooks'` or `'jsonl'` — one path wins per session |
| status | TEXT | 'active' / 'completed' / 'error' |
| created_at | INTEGER | Unix ms |
| ended_at | INTEGER | Unix ms, nullable |
| root_agent_id | TEXT | References agents.id |
| metadata | TEXT | JSON blob |

**Indexes:** `created_at`, `status`

### agents

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | Hex ID or "root" |
| session_id | TEXT FK | → sessions.id |
| parent_agent_id | TEXT | Self-referencing FK for tree |
| name | TEXT | e.g. "backend-researcher" |
| model | TEXT | e.g. "claude-sonnet-4-6" |
| team_name | TEXT | Team name if part of a team |
| is_sidechain | INTEGER | 0/1 boolean |
| depth | INTEGER | 0 = root |
| status | TEXT | 'active' / 'completed' / 'error' |
| created_at | INTEGER | Unix ms |
| ended_at | INTEGER | Unix ms, nullable |
| metadata | TEXT | JSON: subagent_type, isolation, etc. |

**Indexes:** `session_id`, `parent_agent_id`

### events

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment (doubles as cursor) |
| event_id | TEXT | Stable dedup key (JSONL uuid or hook-derived ID) |
| session_id | TEXT FK | → sessions.id |
| agent_id | TEXT FK | → agents.id |
| sequence_num | INTEGER | Monotonic within session |
| event_type | TEXT | ServerEvent.type |
| timestamp | INTEGER | Unix ms |
| payload | TEXT | Event JSON (truncated to 8KB if large) |
| is_truncated | INTEGER | 0/1 — if 1, full payload in event_blobs |

**Indexes:** `(session_id, sequence_num)`, `(session_id, timestamp)`, `(agent_id, timestamp)`, `event_type`

**Unique constraint:** `UNIQUE(session_id, event_id)` with `INSERT OR IGNORE` for idempotent ingestion.

### event_blobs

Large payloads (>8KB) stored separately to keep the events table lean for fast scans.

| Column | Type | Description |
|---|---|---|
| event_id | INTEGER PK FK | → events.id |
| payload | TEXT | Full JSON payload |

### tool_calls

| Column | Type | Description |
|---|---|---|
| id | TEXT PK | tool_use_id (stable across hooks and JSONL) |
| session_id | TEXT FK | → sessions.id |
| agent_id | TEXT FK | → agents.id |
| tool_name | TEXT | e.g. "Bash", "Edit", "Read" |
| phase | TEXT | 'pre' / 'post' / 'error' — last known phase |
| input | TEXT | JSON |
| output | TEXT | JSON, nullable — populated on PostToolUse |
| started_at | INTEGER | Unix ms |
| ended_at | INTEGER | Unix ms, nullable |
| duration_ms | INTEGER | Computed |
| status | TEXT | 'pending' / 'success' / 'error' |

**Indexes:** `(session_id, started_at)`, `tool_name`, `agent_id`

**Write pattern:** Events table is append-only (two rows per tool call: pre + post). tool_calls is a queryable projection — one row per tool call, upserted on PostToolUse:

```typescript
// PreToolUse: insert
db.insert(toolCalls).values({ id: toolUseId, toolName, input, startedAt, status: 'pending' });

// PostToolUse: upsert
db.insert(toolCalls).onConflictDoUpdate({
  target: toolCalls.id,
  set: { output, endedAt, durationMs, status: 'success', phase: 'post' }
});
```

### token_usage

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| session_id | TEXT FK | → sessions.id |
| agent_id | TEXT FK | → agents.id |
| timestamp | INTEGER | Unix ms |
| model | TEXT | Model ID |
| input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| cache_read_tokens | INTEGER | |
| cache_write_tokens | INTEGER | |

**Indexes:** `session_id`, `agent_id`, `timestamp`

### snapshots

For efficient timeline scrubbing — periodic graph state snapshots.

| Column | Type | Description |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| session_id | TEXT FK | → sessions.id |
| sequence_num | INTEGER | Covers events 0..N |
| timestamp | INTEGER | Unix ms |
| state | TEXT | JSON: `{ nodes: AgentInfo[], edges: { source, target }[] }` |

**Indexes:** `(session_id, sequence_num)`

**Scrub-to-time algorithm:** Find nearest snapshot before target time, then replay only delta events (at most 100) forward. Snapshots written every 100 events in the same batch transaction.

---

## Entity Relationships

```
sessions 1──N agents
sessions 1──N events
sessions 1──N tool_calls
sessions 1──N token_usage
sessions 1──N snapshots
agents   1──N events
agents   1──N tool_calls
agents   1──N token_usage
agents   1──N agents (parent → children, self-referencing)
events   1──1 event_blobs (optional, for large payloads)
```
