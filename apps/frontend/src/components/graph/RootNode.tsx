import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentFlowNode } from "@/stores/graphStore";

export const RootNode = memo(function RootNode({
  data,
  selected,
}: NodeProps<AgentFlowNode>) {
  return (
    <div
      className={[
        "relative w-full h-full rounded-xl border-2",
        "border-[var(--accent-purple)]",
        "[box-shadow:0_0_20px_rgba(124,58,237,0.4),0_0_40px_rgba(124,58,237,0.2)]",
        "bg-[var(--bg-glass)] backdrop-blur-[12px]",
        "flex flex-col items-center justify-center gap-1 p-3",
        selected ? "ring-2 ring-[var(--accent-cyan)]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Session icon */}
      <div className="text-[var(--accent-purple)] text-lg leading-none">⬡</div>
      <span className="text-[var(--text-primary)] font-semibold text-sm text-center truncate w-full text-center">
        {data.agentName ?? "Session"}
      </span>
      {data.model && (
        <span className="text-[var(--text-muted)] font-mono text-[10px]">
          {data.model}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-[var(--accent-purple)] !border-[var(--accent-purple)] !w-2 !h-2"
      />
    </div>
  );
});
