# API Surface

## REST Endpoints

### List Sessions

```
GET /api/sessions
```

Response:
```json
{
  "sessions": [
    {
      "sessionId": "...",
      "slug": "nifty-coalescing-lake",
      "cwd": "/path/to/project",
      "startedAt": 1712000000000,
      "endedAt": 1712003600000,
      "agentCount": 5,
      "messageCount": 142,
      "isLive": false
    }
  ]
}
```

### Get Session Details

```
GET /api/sessions/:id
```

Response:
```json
{
  "session": { "...SessionMeta" },
  "agents": [ "...AgentInfo[]" ],
  "stats": {
    "totalEvents": 1024,
    "totalToolCalls": 87,
    "totalTokens": 150000
  }
}
```

### Get Session History (Paginated)

```
GET /api/sessions/:id/history?limit=100&before=<sequence>
```

Cursor-based pagination using sequence number (not OFFSET).

Response:
```json
{
  "events": [ "...ServerEvent[]" ],
  "hasMore": true
}
```

### Delete Session

```
DELETE /api/sessions/:id
```

Returns `204`. Removes from DB only — does not delete JSONL files on disk.

---

## WebSocket

### Connection

```
WS /api/ws
```

### Client → Server Messages

**Subscribe to a session:**
```json
{ "type": "subscribe", "sessionId": "..." }
```

Server begins streaming `ServerEvent` objects. Live sessions get real-time events; completed sessions get replay.

**Replay control:**
```json
{ "type": "replay_control", "action": "play" }
{ "type": "replay_control", "action": "pause" }
{ "type": "replay_control", "action": "seek", "position": 500 }
{ "type": "replay_control", "action": "set_speed", "speed": 2.0 }
```

**Event filtering:**
```json
{ "type": "filter", "showAgents": ["agent-1", "agent-2"], "eventTypes": ["tool_call", "agent_spawned"] }
```

### Server → Client Messages

All messages are `ServerEvent` objects as defined in the [Event Protocol](../architecture/event-protocol.md).

---

## Hook Receivers

Claude Code POSTs structured JSON to these endpoints. All return `200` immediately (non-blocking).

```
POST /api/hooks/session-start      ← SessionStart hook
POST /api/hooks/pre-tool-use       ← PreToolUse hook
POST /api/hooks/post-tool-use      ← PostToolUse hook
POST /api/hooks/subagent-start     ← SubagentStart hook
POST /api/hooks/subagent-stop      ← SubagentStop hook
POST /api/hooks/stop               ← Stop hook
```

Hook stdin JSON always includes: `session_id`, `transcript_path`, `cwd`, `hook_event_name`.
