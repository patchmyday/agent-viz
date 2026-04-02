import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import { elkLayout, NODE_WIDTH, NODE_HEIGHT } from "@/lib/layout";

export type AgentStatus =
  | "idle"
  | "active"
  | "tool_calling"
  | "completed"
  | "error";

export interface AgentNodeData extends Record<string, unknown> {
  agentId: string;
  agentName?: string;
  model?: string;
  status: AgentStatus;
  activeToolName?: string;
  toolCallCount: number;
  sessionId: string;
}

export type AgentFlowNode = Node<AgentNodeData>;

interface GraphStore {
  nodes: AgentFlowNode[];
  edges: Edge[];
  layoutPending: boolean;

  onNodesChange: (changes: NodeChange<AgentFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addAgentNode: (data: AgentNodeData, parentId?: string) => void;
  updateAgent: (agentId: string, updates: Partial<AgentNodeData>) => void;
  triggerLayout: () => Promise<void>;
  reset: () => void;
}

let layoutTimer: ReturnType<typeof setTimeout> | null = null;

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  layoutPending: false,

  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  addAgentNode: (data, parentId) => {
    const nodeId = data.agentId;
    set((state) => {
      if (state.nodes.find((n) => n.id === nodeId)) return state;

      const newNode: AgentFlowNode = {
        id: nodeId,
        type: "agent",
        position: { x: 0, y: 0 },
        data,
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      };

      const newEdges =
        parentId && state.nodes.find((n) => n.id === parentId)
          ? [
              ...state.edges,
              {
                id: `${parentId}->${nodeId}`,
                source: parentId,
                target: nodeId,
                type: "animated",
              },
            ]
          : state.edges;

      return { nodes: [...state.nodes, newNode], edges: newEdges };
    });

    // debounce layout triggers so rapid spawns batch together
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => get().triggerLayout(), 200);
  },

  updateAgent: (agentId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === agentId ? { ...n, data: { ...n.data, ...updates } } : n
      ),
    })),

  triggerLayout: async () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;
    set({ layoutPending: true });
    try {
      const laid = await elkLayout(nodes, edges);
      set({ nodes: laid, layoutPending: false });
    } catch {
      set({ layoutPending: false });
    }
  },

  reset: () => set({ nodes: [], edges: [], layoutPending: false }),
}));
