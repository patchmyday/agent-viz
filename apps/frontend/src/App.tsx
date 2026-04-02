import { useSessionSocket } from "@/hooks/useSessionSocket";
import { useUiStore } from "@/stores/uiStore";
import { useGraphStore } from "@/stores/graphStore";
import { ParticlesBackground } from "@/components/ParticlesBackground";
import { SessionSidebar } from "@/components/SessionSidebar";
import { AgentGraph } from "@/components/graph/AgentGraph";
import { AgentDetailCard } from "@/components/panels/AgentDetailCard";
import { BottomPanel } from "@/components/panels/BottomPanel";
import { Button } from "@/components/ui/Button";

function Toolbar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const bottomPanelOpen = useUiStore((s) => s.bottomPanelOpen);
  const setBottomPanelOpen = useUiStore((s) => s.setBottomPanelOpen);
  const layoutPending = useGraphStore((s) => s.layoutPending);
  const connectionStatus = useUiStore((s) => {
    // Derive from sessionStore via import — avoids extra import in this file
    return null; // handled by sidebar dot
  });

  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
      {!sidebarOpen && (
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
          ☰ Sessions
        </Button>
      )}
      {!bottomPanelOpen && (
        <Button variant="outline" size="sm" onClick={() => setBottomPanelOpen(true)}>
          ↑ Panels
        </Button>
      )}
      {layoutPending && (
        <span className="text-[var(--text-muted)] text-[10px] font-mono animate-pulse">
          Laying out…
        </span>
      )}
    </div>
  );
}

export default function App() {
  useSessionSocket();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
      <ParticlesBackground />

      {/* Session sidebar (left) */}
      <SessionSidebar />

      {/* Main content: graph + bottom panel */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Graph + agent detail side-by-side */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          <main className="relative flex-1 overflow-hidden">
            <Toolbar />
            <AgentGraph />
          </main>

          {/* Agent detail card (right slide-in) */}
          <AgentDetailCard />
        </div>

        {/* Bottom panel (timeline / transcript / tokens) */}
        <BottomPanel />
      </div>
    </div>
  );
}
