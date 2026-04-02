import { create } from "zustand";
import type { TokenUsage } from "@agent-viz/shared-types";

export interface TranscriptEntry {
  id: string;
  sessionId: string;
  agentId: string;
  role: "assistant" | "user";
  text: string;
  timestamp: string;
  tokenUsage?: TokenUsage;
}

interface TranscriptStore {
  entries: TranscriptEntry[];
  addEntry: (entry: TranscriptEntry) => void;
  clearSession: (sessionId: string) => void;
}

export const useTranscriptStore = create<TranscriptStore>((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((s) => ({ entries: [...s.entries, entry] })),
  clearSession: (sessionId) =>
    set((s) => ({
      entries: s.entries.filter((e) => e.sessionId !== sessionId),
    })),
}));
