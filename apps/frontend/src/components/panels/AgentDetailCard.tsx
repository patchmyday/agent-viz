import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore } from "@/stores/uiStore";
import { useGraphStore } from "@/stores/graphStore";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

function statRow(label: string, value: string | number | undefined) {
  if (value === undefined || value === null) return null;
  return (
    <div key={label} className="flex justify-between items-center py-1 border-b border-[rgba(139,148,158,0.08)]">
      <span className="text-[var(--text-muted)] text-[11px]">{label}</span>
      <span className="text-[var(--text-primary)] text-[11px] font-mono">{value}</span>
    </div>
  );
}

export function AgentDetailCard() {
  const selectedAgentId = useUiStore((s) => s.selectedAgentId);
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent);
  const node = useGraphStore((s) =>
    s.nodes.find((n) => n.id === selectedAgentId)
  );
  const span = useTimelineStore((s) =>
    s.spans.find((sp) => sp.agentId === selectedAgentId)
  );
  const allEntries = useTranscriptStore((s) => s.entries);
  const entries = useMemo(
    () => allEntries.filter((e) => e.agentId === selectedAgentId),
    [allEntries, selectedAgentId]
  );

  const totalTokens = entries.reduce((sum, e) => {
    if (!e.tokenUsage) return sum;
    return sum + e.tokenUsage.inputTokens + e.tokenUsage.outputTokens;
  }, 0);

  const cacheTokens = entries.reduce((sum, e) => {
    if (!e.tokenUsage) return sum;
    return (
      sum + e.tokenUsage.cacheReadTokens + e.tokenUsage.cacheCreationTokens
    );
  }, 0);

  const STATUS_VARIANT: Record<string, "cyan" | "green" | "magenta" | "muted"> = {
    active: "cyan",
    tool_calling: "cyan",
    completed: "green",
    error: "magenta",
    idle: "muted",
  };

  return (
    <AnimatePresence>
      {selectedAgentId && node && (
        <motion.aside
          key="agent-detail"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-72 shrink-0 flex flex-col border-l border-[rgba(124,58,237,0.2)] bg-[var(--bg-glass)] backdrop-blur-[12px] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(124,58,237,0.2)]">
            <span className="text-[var(--text-primary)] font-semibold text-sm truncate">
              {node.data.agentName ?? node.data.agentId}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelectedAgent(null)}
              aria-label="Close"
            >
              ✕
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Status */}
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[node.data.status] ?? "muted"}>
                {node.data.status}
              </Badge>
              {node.data.activeToolName && (
                <Badge variant="cyan">{node.data.activeToolName}</Badge>
              )}
            </div>

            {/* Stats */}
            <div>
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                Stats
              </p>
              {statRow("Agent ID", node.data.agentId.slice(0, 16))}
              {node.data.model && statRow("Model", String(node.data.model))}
              {statRow("Tool calls", node.data.toolCallCount)}
              {statRow("Messages", entries.length)}
              {totalTokens > 0 && statRow("Total tokens", totalTokens.toLocaleString())}
              {cacheTokens > 0 && statRow("Cache tokens", cacheTokens.toLocaleString())}
              {span && statRow("Duration", span.endMs
                ? `${((span.endMs - span.startMs) / 1000).toFixed(1)}s`
                : "running…"
              )}
            </div>

            {/* Recent tool calls */}
            {span && span.events.filter((e) => e.type === "tool_call").length > 0 && (
              <div>
                <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  Tools Used
                </p>
                <div className="flex flex-wrap gap-1">
                  {[
                    ...new Set(
                      span.events
                        .filter((e) => e.type === "tool_call")
                        .map((e) => e.label)
                    ),
                  ].map((tool) => (
                    <Badge key={tool} variant="purple">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
