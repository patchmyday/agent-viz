# Database Strategies

## Dual Ingestion & Deduplication

Each session uses **one ingestion path** (`ingestion_source` column): hooks or JSONL file watching. No cross-path ID unification needed.

### Hooks Path (primary for live sessions)

Claude Code POSTs structured JSON; backend acks immediately and queues DB write. Dedup via `UNIQUE(session_id, event_id)` + `INSERT OR IGNORE`.

### JSONL Path (secondary)

File watcher handles historical sessions (pre-hook import) and catch-up after backend restart. Skips sessions where `ingestion_source = 'hooks'`.

### Dedup Within Each Path

- **JSONL:** `event_id = JSONL uuid` → `INSERT OR IGNORE`
- **Hooks:** `event_id` derived from hook event fields (e.g. `tool_use_id + phase` for tool events)

## Write Strategy

Typical volume: 5-100 events/min, peak burst ~10 writes/sec. Well within SQLite's synchronous write budget.

A defensive **100ms flush buffer** is recommended for hook latency protection (<500ms ack requirement) but won't be stressed under normal load.

Events accumulate in a JS array and flush every **100ms or 500 events** (whichever comes first), wrapped in a single transaction.

## Snapshot Strategy

Snapshots enable efficient timeline scrubbing without replaying all events from the start.

- Written every **100 events** in the same batch transaction as the events themselves
- State shape: `{ nodes: AgentInfo[], edges: { source, target }[] }` — directly serializable to React Flow
- Scrub algorithm: find nearest snapshot before target, replay at most 100 delta events forward

## Storage Estimates

| Metric | Size |
|--------|------|
| Per event (avg) | 100-500 bytes |
| 1000-event session | 100KB-500KB |
| 100 sessions | 10MB-50MB |

## Storage Management

- **Auto-cleanup:** delete sessions older than 30 days on startup
- **Manual cleanup:** `DELETE /api/sessions/:id` removes from DB (preserves JSONL files)
- **Export:** future feature — export session as standalone JSONL for sharing
