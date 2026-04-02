# Event Protocol & Shared Types

All types live in `packages/shared-types/` and are imported by both frontend and backend.

## Server → Client Events

```typescript
// packages/shared-types/src/events.ts

interface BaseEvent {
  eventId: string;          // UUID v4
  sessionId: string;
  timestamp: string;        // ISO 8601
  sequence: number;         // monotonic counter — used for replay ordering & cursor pagination
}

interface AgentInfo {
  agentId: string;          // hex ID or "root"
  agentName?: string;       // team agent display name
  teamName?: string;
  parentAgentId?: string;   // null for root agent
  isSidechain: boolean;
}

interface SessionStartEvent extends BaseEvent {
  type: "session_start";
  slug: string;             // e.g. "nifty-coalescing-lake"
  cwd: string;
  model: string;
  source: "startup" | "resume" | "clear" | "compact";
}

interface AgentSpawnedEvent extends BaseEvent {
  type: "agent_spawned";
  agent: AgentInfo;
  prompt?: string;          // initial task description
}

interface AgentCompletedEvent extends BaseEvent {
  type: "agent_completed";
  agentId: string;
  lastMessage?: string;
}

interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  agentId: string;
  toolUseId: string;        // links pre → post phases
  toolName: string;
  toolInput: Record<string, unknown>;
  phase: "pre" | "post" | "error";
  toolResponse?: unknown;   // post phase only
  durationMs?: number;      // post phase only
}

interface AssistantMessageEvent extends BaseEvent {
  type: "assistant_message";
  agentId: string;
  text: string;
  hasThinking: boolean;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

interface UserMessageEvent extends BaseEvent {
  type: "user_message";
  agentId: string;
  text: string;
}

interface SessionEndEvent extends BaseEvent {
  type: "session_end";
  source: string;
}

interface ErrorEvent extends BaseEvent {
  type: "error";
  agentId?: string;
  message: string;
}

type ServerEvent =
  | SessionStartEvent
  | AgentSpawnedEvent
  | AgentCompletedEvent
  | ToolCallEvent
  | AssistantMessageEvent
  | UserMessageEvent
  | SessionEndEvent
  | ErrorEvent;
```

## Client → Server Commands

```typescript
// packages/shared-types/src/commands.ts

type ClientCommand =
  | { type: "subscribe"; sessionId: string }
  | { type: "replay_control"; action: "play" | "pause" | "seek" | "set_speed"; position?: number; speed?: number }
  | { type: "filter"; showAgents?: string[]; eventTypes?: string[] };
```

## Event → Graph Mapping

How each server event translates to a React Flow graph action:

| ServerEvent | React Flow Action |
|---|---|
| `agent_spawned` | Add node (agent card) + add edge (parent → child) |
| `agent_completed` | Update node status → "completed" (green glow) |
| `tool_call` (pre) | Add badge/spinner to agent node |
| `tool_call` (post) | Update badge → result; animate edge pulse |
| `assistant_message` | Update transcript panel; animate edge from agent to parent |
| `user_message` | Update transcript panel |
| `session_start` | Create root node |
| `session_end` | Update all nodes to final state |
| `error` | Update node status → "error" (red glow) |
