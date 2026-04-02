import { create } from "zustand";
import type { ClientCommand } from "@agent-viz/shared-types";

export interface Session {
  sessionId: string;
  slug: string;
  cwd: string;
  model: string;
  startedAt?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  connectionStatus: ConnectionStatus;
  sendCommand: ((cmd: ClientCommand) => void) | null;
  maxSequence: number;

  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  setActiveSession: (sessionId: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSendCommand: (fn: (cmd: ClientCommand) => void) => void;
  updateMaxSequence: (seq: number) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  connectionStatus: "disconnected",
  sendCommand: null,
  maxSequence: 0,

  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({
      sessions: state.sessions.find((s) => s.sessionId === session.sessionId)
        ? state.sessions
        : [session, ...state.sessions],
    })),
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setSendCommand: (fn) => set({ sendCommand: fn }),
  updateMaxSequence: (seq) =>
    set((s) => ({ maxSequence: Math.max(s.maxSequence, seq) })),
}));
