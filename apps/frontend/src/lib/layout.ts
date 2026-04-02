import type { AgentFlowNode } from "@/stores/graphStore";
import type { Edge } from "@xyflow/react";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 90;

// Lazy-load elkjs (~200KB) so it doesn't affect initial bundle
let elkInstance: Awaited<ReturnType<typeof createElk>> | null = null;

async function createElk() {
  const ELK = (await import("elkjs/lib/elk.bundled.js")).default;
  return new ELK();
}

async function getElk() {
  if (!elkInstance) elkInstance = await createElk();
  return elkInstance;
}

export async function elkLayout(
  nodes: AgentFlowNode[],
  edges: Edge[]
): Promise<AgentFlowNode[]> {
  const elk = await getElk();

  // Only include edges where both endpoints exist in current nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: validEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layouted = await elk.layout(graph);

  return nodes.map((node) => {
    const elkNode = layouted.children?.find((c) => c.id === node.id);
    return elkNode
      ? { ...node, position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 } }
      : node;
  });
}
