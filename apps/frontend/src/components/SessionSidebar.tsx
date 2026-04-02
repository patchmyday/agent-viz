import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/stores/sessionStore";
import { useUiStore } from "@/stores/uiStore";
import { useGraphStore } from "@/stores/graphStore";

const STATUS_DOT: Record<string, string> = {
  connected: "bg-[var(--accent-green)]",
  connecting: "bg-yellow-400 animate-pulse",
  disconnected: "bg-[var(--text-muted)]",
  error: "bg-[var(--accent-magenta)]",
};

export function SessionSidebar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const sendCommand = useSessionStore((s) => s.sendCommand);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const resetGraph = useGraphStore((s) => s.reset);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  function selectSession(sessionId: string) {
    if (sessionId === activeSessionId) return;
    resetGraph();
    setActiveSession(sessionId);
    sendCommand?.({ type: "subscribe", sessionId });
  }

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          key="sidebar"
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -280, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-64 shrink-0 flex flex-col border-r border-[rgba(124,58,237,0.2)] bg-[var(--bg-glass)] backdrop-blur-[12px] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(124,58,237,0.2)]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--accent-cyan)] font-mono font-bold text-sm tracking-widest">
                AGENT VIZ
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${STATUS_DOT[connectionStatus] ?? STATUS_DOT.disconnected}`}
                title={connectionStatus}
              />
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-1"
                aria-label="Close sidebar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto py-2">
            <p className="px-4 py-1 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">
              Sessions
            </p>
            {sessions.length === 0 ? (
              <p className="px-4 py-6 text-[var(--text-muted)] text-xs text-center">
                No sessions yet.<br />Start a Claude Code session to see it here.
              </p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.sessionId}
                  onClick={() => selectSession(s.sessionId)}
                  className={[
                    "w-full text-left px-4 py-2.5 transition-colors duration-150",
                    "hover:bg-[rgba(124,58,237,0.1)]",
                    activeSessionId === s.sessionId
                      ? "bg-[rgba(0,217,255,0.08)] border-l-2 border-[var(--accent-cyan)]"
                      : "border-l-2 border-transparent",
                  ].join(" ")}
                >
                  <p className="text-[var(--text-primary)] text-sm font-mono truncate">
                    {s.slug}
                  </p>
                  <p className="text-[var(--text-muted)] text-[10px] truncate mt-0.5">
                    {s.cwd}
                  </p>
                  <p className="text-[var(--text-muted)] text-[10px] font-mono mt-0.5">
                    {s.model}
                  </p>
                </button>
              ))
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
