import { useRef, useMemo, useEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useSessionStore } from "@/stores/sessionStore";
import { Badge } from "@/components/ui/Badge";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export function TranscriptPanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const allEntries = useTranscriptStore((s) => s.entries);

  const entries = useMemo(
    () =>
      activeSessionId
        ? allEntries.filter((e) => e.sessionId === activeSessionId)
        : allEntries,
    [allEntries, activeSessionId]
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 8,
  });

  const isNearBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Auto-scroll only when user is already near the bottom
  useEffect(() => {
    if (entries.length > 0 && isNearBottom()) {
      virtualizer.scrollToIndex(entries.length - 1, { behavior: "smooth" });
    }
  }, [entries.length, virtualizer, isNearBottom]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        No messages yet. Select a session to see the transcript.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto px-3 py-2">
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((vItem) => {
          const entry = entries[vItem.index];
          return (
            <div
              key={entry.id}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: vItem.start,
                left: 0,
                right: 0,
              }}
              className="py-2 px-1 border-b border-[rgba(139,148,158,0.1)]"
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={entry.role === "assistant" ? "cyan" : "purple"}>
                  {entry.role === "assistant" ? "◈ assistant" : "▸ user"}
                </Badge>
                <span className="text-[var(--text-muted)] text-[10px] font-mono">
                  {entry.agentId.slice(0, 8)}
                </span>
                <span className="text-[var(--text-muted)] text-[10px] font-mono ml-auto">
                  {formatTime(entry.timestamp)}
                </span>
              </div>
              <p className="text-[var(--text-primary)] text-xs leading-relaxed whitespace-pre-wrap line-clamp-6">
                {entry.text}
              </p>
              {entry.tokenUsage && (
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <Badge variant="muted">in: {entry.tokenUsage.inputTokens}</Badge>
                  <Badge variant="muted">out: {entry.tokenUsage.outputTokens}</Badge>
                  {entry.tokenUsage.cacheReadTokens > 0 && (
                    <Badge variant="muted">cache↑: {entry.tokenUsage.cacheReadTokens}</Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
