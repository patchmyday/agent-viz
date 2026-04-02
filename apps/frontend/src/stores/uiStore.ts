import { create } from "zustand";

export type ReplayState = "live" | "playing" | "paused";
export type PanelTab = "timeline" | "transcript" | "tokens";

interface UiStore {
  selectedAgentId: string | null;
  sidebarOpen: boolean;
  bottomPanelOpen: boolean;
  activeTab: PanelTab;

  // Replay
  replayState: ReplayState;
  replayPosition: number; // 0–100
  replaySpeed: number;    // 0.5 | 1 | 2 | 4

  setSelectedAgent: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setBottomPanelOpen: (open: boolean) => void;
  setActiveTab: (tab: PanelTab) => void;
  setReplayState: (state: ReplayState) => void;
  setReplayPosition: (pos: number) => void;
  setReplaySpeed: (speed: number) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedAgentId: null,
  sidebarOpen: true,
  bottomPanelOpen: true,
  activeTab: "transcript",
  replayState: "live",
  replayPosition: 0,
  replaySpeed: 1,

  setSelectedAgent: (id) => set({ selectedAgentId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setBottomPanelOpen: (open) => set({ bottomPanelOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setReplayState: (replayState) => set({ replayState }),
  setReplayPosition: (replayPosition) => set({ replayPosition }),
  setReplaySpeed: (replaySpeed) => set({ replaySpeed }),
}));
