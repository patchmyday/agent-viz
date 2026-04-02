# Claude Code Integration

## JSONL File Layout

Claude Code writes session transcripts as JSONL files:

```
~/.claude/projects/<cwd-encoded>/<session-uuid>.jsonl           # main session
~/.claude/projects/<cwd-encoded>/<session-uuid>/subagents/agent-<hex>.jsonl  # subagents
```

## Key JSONL Entry Types

| `type` | Description |
|---|---|
| `user` | User prompt or tool_result fed back to model |
| `assistant` | Claude response: text, tool_use, thinking blocks |
| `progress` | Live updates: `agent_progress`, `bash_progress`, `hook_progress` |
| `system` | Internal events: `stop_hook_summary`, `turn_duration`, `compact_boundary` |

## Agent Hierarchy in Logs

- **Subagents**: separate JSONL files under `subagents/`, entries have `isSidechain: true` + `agentId`
- **Team agents**: entries tagged with `teamName` + `agentName` fields
- **Linking**: parent transcript has `progress` entries with `data.type: "agent_progress"` + `agentId` pointing to child

## HTTP Hook Configuration

Add to `~/.claude/settings.json` (or project-level `.claude/settings.local.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/pre-tool-use" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/post-tool-use" }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/subagent-start" }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/subagent-stop" }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/session-start" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "http", "url": "http://localhost:3001/api/hooks/stop" }] }
    ]
  }
}
```

Hook stdin JSON always includes: `session_id`, `transcript_path`, `cwd`, `hook_event_name`.

## How Dual Ingestion Works

Agent Viz uses both hooks and JSONL watching, but only **one path per session**:

1. If hooks fire first for a session, that session is marked `ingestion_source: 'hooks'` and the JSONL watcher skips it
2. If no hooks are configured, the JSONL watcher handles everything
3. This avoids complex cross-path deduplication
