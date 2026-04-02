// Server → Client event types

export interface BaseEvent {
  eventId: string;
  sessionId: string;
  timestamp: string; // ISO 8601
  sequence: number;
}

export interface AgentInfo {
  agentId: string;
  agentName?: string;
  teamName?: string;
  parentAgentId?: string;
  isSidechain: boolean;
}

export interface SessionStartEvent extends BaseEvent {
  type: "session_start";
  slug: string;
  cwd: string;
  model: string;
  source: "startup" | "resume" | "clear" | "compact";
}

export interface AgentSpawnedEvent extends BaseEvent {
  type: "agent_spawned";
  agent: AgentInfo;
  prompt?: string;
}

export interface AgentCompletedEvent extends BaseEvent {
  type: "agent_completed";
  agentId: string;
  lastMessage?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  agentId: string;
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  phase: "pre" | "post" | "error";
  toolResponse?: unknown;
  durationMs?: number;
}

export interface AssistantMessageEvent extends BaseEvent {
  type: "assistant_message";
  agentId: string;
  text: string;
  hasThinking: boolean;
  tokenUsage?: TokenUsage;
}

export interface UserMessageEvent extends BaseEvent {
  type: "user_message";
  agentId: string;
  text: string;
}

export interface SessionEndEvent extends BaseEvent {
  type: "session_end";
  source: string;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  agentId?: string;
  message: string;
}

export type ServerEvent =
  | SessionStartEvent
  | AgentSpawnedEvent
  | AgentCompletedEvent
  | ToolCallEvent
  | AssistantMessageEvent
  | UserMessageEvent
  | SessionEndEvent
  | ErrorEvent;

export type ServerEventType = ServerEvent["type"];
