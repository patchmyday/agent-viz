import type { ServerEvent } from "@agent-viz/shared-types";
import { useGraphStore, type AgentNodeData } from "@/stores/graphStore";
import { useSessionStore, type Session } from "@/stores/sessionStore";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useTimelineStore } from "@/stores/timelineStore";

/**
 * Dispatches a ServerEvent to all stores.
 * Called by useSessionSocket on each incoming WS message.
 */
export function dispatchEvent(event: ServerEvent): void {
  const graph = useGraphStore.getState();
  const session = useSessionStore.getState();
  const transcript = useTranscriptStore.getState();
  const timeline = useTimelineStore.getState();

  session.updateMaxSequence(event.sequence);

  const nowMs = new Date(event.timestamp).getTime();
  const sessionStartMs = timeline.sessionStartMs ?? nowMs;
  const relMs = nowMs - sessionStartMs;

  switch (event.type) {
    case "session_start": {
      const s: Session = {
        sessionId: event.sessionId,
        slug: event.slug,
        cwd: event.cwd,
        model: event.model,
        startedAt: event.timestamp,
      };
      session.addSession(s);
      timeline.setSessionStart(nowMs);

      // Root node for the session
      const rootData: AgentNodeData = {
        agentId: "root",
        agentName: event.slug,
        model: event.model,
        status: "active",
        toolCallCount: 0,
        sessionId: event.sessionId,
      };
      graph.addAgentNode(rootData, undefined);
      timeline.startSpan("root", event.slug, 0);
      break;
    }

    case "agent_spawned": {
      const { agent } = event;
      const displayName = agent.agentName ?? agent.agentId.slice(0, 8);
      const nodeData: AgentNodeData = {
        agentId: agent.agentId,
        agentName: displayName,
        status: "idle",
        toolCallCount: 0,
        sessionId: event.sessionId,
      };
      graph.addAgentNode(nodeData, agent.parentAgentId ?? "root");
      timeline.startSpan(agent.agentId, displayName, relMs);
      break;
    }

    case "agent_completed": {
      graph.updateAgent(event.agentId, {
        status: "completed",
        activeToolName: undefined,
      });
      timeline.endSpan(event.agentId, relMs);
      break;
    }

    case "tool_call": {
      if (event.phase === "pre") {
        const existing = useGraphStore
          .getState()
          .nodes.find((n) => n.id === event.agentId);
        const count = existing ? (existing.data.toolCallCount as number) + 1 : 1;
        graph.updateAgent(event.agentId, {
          status: "tool_calling",
          activeToolName: event.toolName,
          toolCallCount: count,
        });
        timeline.addEvent(event.agentId, {
          timeMs: relMs,
          type: "tool_call",
          label: event.toolName,
        });
      } else if (event.phase === "post" || event.phase === "error") {
        graph.updateAgent(event.agentId, {
          status: event.phase === "error" ? "error" : "active",
          activeToolName: undefined,
        });
        if (event.phase === "error") {
          timeline.addEvent(event.agentId, {
            timeMs: relMs,
            type: "error",
            label: event.toolName,
          });
        }
      }
      break;
    }

    case "assistant_message": {
      const node = useGraphStore
        .getState()
        .nodes.find((n) => n.id === event.agentId);
      if (node && node.data.status !== "completed") {
        graph.updateAgent(event.agentId, { status: "active" });
      }
      transcript.addEntry({
        id: event.eventId,
        sessionId: event.sessionId,
        agentId: event.agentId,
        role: "assistant",
        text: event.text,
        timestamp: event.timestamp,
        tokenUsage: event.tokenUsage,
      });
      timeline.addEvent(event.agentId, {
        timeMs: relMs,
        type: "message",
        label: "message",
      });
      break;
    }

    case "user_message": {
      transcript.addEntry({
        id: event.eventId,
        sessionId: event.sessionId,
        agentId: event.agentId,
        role: "user",
        text: event.text,
        timestamp: event.timestamp,
      });
      break;
    }

    case "session_end": {
      const { nodes } = useGraphStore.getState();
      nodes
        .filter((n) => n.data.sessionId === event.sessionId)
        .forEach((n) => {
          if (n.data.status !== "error") {
            graph.updateAgent(n.id, { status: "completed" });
          }
          timeline.endSpan(n.id, relMs);
        });
      break;
    }

    case "error": {
      if (event.agentId) {
        graph.updateAgent(event.agentId, { status: "error" });
        timeline.addEvent(event.agentId, {
          timeMs: relMs,
          type: "error",
          label: event.message.slice(0, 40),
        });
      }
      break;
    }
  }
}
