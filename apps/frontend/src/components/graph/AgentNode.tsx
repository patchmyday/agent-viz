import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentFlowNode, AgentStatus } from "@/stores/graphStore";
import { useUiStore } from "@/stores/uiStore";

const STATUS_STYLES: Record<
  AgentStatus,
  { border: string; glow: string; label: string; labelColor: string; animation?: string }
> = {
  idle: {
    border: "border-[rgba(139,148,158,0.4)]",
    glow: "",
    label: "Idle",
    labelColor: "text-[var(--text-muted)]",
  },
  active: {
    border: "border-[var(--accent-cyan)]",
    glow: "[box-shadow:var(--glow-cyan)]",
    label: "Active",
    labelColor: "text-[var(--accent-cyan)]",
    animation: "animate-[pulse-cyan_2s_ease-in-out_infinite]",
  },
  tool_calling: {
    border: "border-[var(--accent-cyan)]",
    glow: "[box-shadow:var(--glow-cyan)]",
    label: "Tool",
    labelColor: "text-[var(--accent-cyan)]",
    animation: "animate-[pulse-cyan_1.5s_ease-in-out_infinite]",
  },
  completed: {
    border: "border-[var(--accent-green)]",
    glow: "[box-shadow:var(--glow-green)]",
    label: "Done",
    labelColor: "text-[var(--accent-green)]",
  },
  error: {
    border: "border-[var(--accent-magenta)]",
    glow: "[box-shadow:var(--glow-magenta)]",
    label: "Error",
    labelColor: "text-[var(--accent-magenta)]",
    animation: "animate-[shake-error_0.4s_ease-in-out]",
  },
};

export const AgentNode = memo(function AgentNode({
  data,
  selected,
}: NodeProps<AgentFlowNode>) {
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent);
  const style = STATUS_STYLES[data.status];

  return (
    <div
      className={[
        "relative w-full h-full rounded-xl border",
        "bg-[var(--bg-glass)] backdrop-blur-[12px]",
        "cursor-pointer transition-all duration-300",
        "flex flex-col justify-between p-3",
        style.border,
        style.glow,
        style.animation ?? "",
        selected ? "ring-2 ring-[var(--accent-purple)]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => setSelectedAgent(data.agentId)}
    >
      {/* Top row: agent name + status badge */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span
          className="text-[var(--text-primary)] font-semibold text-sm truncate"
          title={data.agentName ?? data.agentId}
        >
          {data.agentName ?? data.agentId.slice(0, 10)}
        </span>
        <span
          className={`text-[10px] font-mono font-bold shrink-0 ${style.labelColor}`}
        >
          {style.label}
        </span>
      </div>

      {/* Bottom row: model + tool badge */}
      <div className="flex items-center justify-between gap-2">
        {data.model && (
          <span className="text-[var(--text-muted)] font-mono text-[10px] truncate">
            {data.model}
          </span>
        )}
        {data.status === "tool_calling" && data.activeToolName && (
          <span className="flex items-center gap-1 text-[var(--accent-cyan)] text-[10px] font-mono shrink-0">
            <span
              className="inline-block w-2.5 h-2.5 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-[spin_0.7s_linear_infinite]"
              aria-hidden
            />
            {data.activeToolName}
          </span>
        )}
        {data.toolCallCount > 0 && data.status !== "tool_calling" && (
          <span className="text-[var(--text-muted)] text-[10px] font-mono shrink-0">
            {data.toolCallCount} calls
          </span>
        )}
      </div>

      {/* React Flow handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[var(--accent-purple)] !border-[var(--accent-purple)] !w-2 !h-2"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[var(--accent-purple)] !border-[var(--accent-purple)] !w-2 !h-2"
      />
    </div>
  );
});
