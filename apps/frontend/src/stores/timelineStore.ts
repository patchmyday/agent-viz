import { create } from "zustand";

export interface TimelineEvent {
  timeMs: number;
  type: "tool_call" | "message" | "error";
  label: string;
}

export interface AgentSpan {
  agentId: string;
  agentName: string;
  color: string;
  startMs: number;
  endMs: number | null; // null = still running
  events: TimelineEvent[];
}

interface TimelineStore {
  sessionStartMs: number | null;
  spans: AgentSpan[];

  setSessionStart: (ms: number) => void;
  startSpan: (agentId: string, agentName: string, ms: number) => void;
  endSpan: (agentId: string, ms: number) => void;
  addEvent: (agentId: string, event: TimelineEvent) => void;
  reset: () => void;
}

const COLORS = [
  "#00d9ff",
  "#7c3aed",
  "#00ff9f",
  "#ff2d78",
  "#f59e0b",
  "#6366f1",
  "#14b8a6",
];

let colorIndex = 0;
function nextColor() {
  return COLORS[colorIndex++ % COLORS.length];
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  sessionStartMs: null,
  spans: [],

  setSessionStart: (ms) => {
    colorIndex = 0;
    set({ sessionStartMs: ms, spans: [] });
  },

  startSpan: (agentId, agentName, ms) => {
    if (get().spans.find((s) => s.agentId === agentId)) return;
    set((s) => ({
      spans: [
        ...s.spans,
        { agentId, agentName, color: nextColor(), startMs: ms, endMs: null, events: [] },
      ],
    }));
  },

  endSpan: (agentId, ms) =>
    set((s) => ({
      spans: s.spans.map((sp) =>
        sp.agentId === agentId && sp.endMs === null ? { ...sp, endMs: ms } : sp
      ),
    })),

  addEvent: (agentId, event) =>
    set((s) => ({
      spans: s.spans.map((sp) =>
        sp.agentId === agentId
          ? { ...sp, events: [...sp.events, event] }
          : sp
      ),
    })),

  reset: () => set({ sessionStartMs: null, spans: [] }),
}));
