import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { useGraphStore, type AgentFlowNode } from "@/stores/graphStore";
import { useUiStore } from "@/stores/uiStore";
import { AgentNode } from "./AgentNode";
import { RootNode } from "./RootNode";
import { AnimatedEdge } from "./AnimatedEdge";

const nodeTypes: NodeTypes = {
  agent: AgentNode as NodeTypes["agent"],
  root: RootNode as NodeTypes["root"],
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge as EdgeTypes["animated"],
};

function GraphInner() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const setSelectedAgent = useUiStore((s) => s.setSelectedAgent);

  // Derive node type from node id: root node gets 'root' type
  const typedNodes = useMemo<AgentFlowNode[]>(
    () =>
      nodes.map((n) => ({
        ...n,
        type: n.id === "root" ? "root" : "agent",
      })),
    [nodes]
  );

  const onPaneClick = useCallback(() => {
    setSelectedAgent(null);
  }, [setSelectedAgent]);

  return (
    <ReactFlow
      nodes={typedNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onPaneClick={onPaneClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: "transparent" }}
    >
      <Controls
        style={{
          background: "var(--bg-glass)",
          border: "1px solid rgba(124,58,237,0.3)",
          borderRadius: 8,
        }}
      />
      <MiniMap
        nodeColor={(n) => {
          const status = (n.data as { status?: string }).status;
          if (status === "completed") return "#00ff9f";
          if (status === "error") return "#ff2d78";
          if (status === "active" || status === "tool_calling") return "#00d9ff";
          return "#8b949e";
        }}
        maskColor="rgba(8,11,20,0.8)"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid rgba(124,58,237,0.3)",
          borderRadius: 8,
        }}
      />
    </ReactFlow>
  );
}

export function AgentGraph() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
