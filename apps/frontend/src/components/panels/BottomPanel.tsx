import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUiStore, type PanelTab } from "@/stores/uiStore";
import { Button } from "@/components/ui/Button";
import { TimelinePanel } from "./TimelinePanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { TokenUsagePanel } from "./TokenUsagePanel";
import { ReplayControls } from "./ReplayControls";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "transcript", label: "Transcript" },
  { id: "timeline", label: "Timeline" },
  { id: "tokens", label: "Tokens" },
];

const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 260;
const MAX_HEIGHT = 520;

export function BottomPanel() {
  const bottomPanelOpen = useUiStore((s) => s.bottomPanelOpen);
  const setBottomPanelOpen = useUiStore((s) => s.setBottomPanelOpen);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragStart = useRef<{ y: number; h: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragStart.current = { y: e.clientY, h: height };
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return;
      const delta = dragStart.current.y - ev.clientY;
      setHeight(
        Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStart.current.h + delta))
      );
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);

  return (
    <AnimatePresence>
      {bottomPanelOpen && (
        <motion.div
          key="bottom-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 35 }}
          className="shrink-0 flex flex-col border-t border-[rgba(124,58,237,0.2)] bg-[var(--bg-glass)] backdrop-blur-[12px] overflow-hidden"
          style={{ height }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={onMouseDown}
            className="h-1.5 cursor-ns-resize flex-shrink-0 hover:bg-[rgba(124,58,237,0.3)] transition-colors"
          />

          {/* Tab bar */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[rgba(124,58,237,0.15)] flex-shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "px-3 py-1 text-xs font-mono rounded transition-colors duration-150",
                  activeTab === tab.id
                    ? "text-[var(--accent-cyan)] bg-[rgba(0,217,255,0.1)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setBottomPanelOpen(false)}
              className="ml-auto"
              aria-label="Close panel"
            >
              ✕
            </Button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "transcript" && <TranscriptPanel />}
            {activeTab === "timeline" && <TimelinePanel />}
            {activeTab === "tokens" && <TokenUsagePanel />}
          </div>

          {/* Replay controls */}
          <ReplayControls />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
