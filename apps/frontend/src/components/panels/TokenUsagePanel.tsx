import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useTimelineStore } from "@/stores/timelineStore";

interface DataPoint {
  time: number; // relative ms
  [agentId: string]: number;
}

const AGENT_COLORS = [
  "#00d9ff",
  "#7c3aed",
  "#00ff9f",
  "#ff2d78",
  "#f59e0b",
  "#6366f1",
];

function formatMs(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function TokenUsagePanel() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const entries = useTranscriptStore((s) => s.entries);
  const sessionStartMs = useTimelineStore((s) => s.sessionStartMs);

  const { chartData, agentIds } = useMemo(() => {
    const filtered = activeSessionId
      ? entries.filter((e) => e.sessionId === activeSessionId && e.tokenUsage)
      : entries.filter((e) => e.tokenUsage);

    if (filtered.length === 0) return { chartData: [], agentIds: [] };

    const startMs = sessionStartMs ?? new Date(filtered[0].timestamp).getTime();

    // Accumulate tokens per agent over time
    const cumulative: Record<string, number> = {};
    const points: DataPoint[] = [];
    const ids = new Set<string>();

    for (const entry of filtered) {
      if (!entry.tokenUsage) continue;
      ids.add(entry.agentId);
      cumulative[entry.agentId] =
        (cumulative[entry.agentId] ?? 0) +
        entry.tokenUsage.inputTokens +
        entry.tokenUsage.outputTokens;

      const relMs = new Date(entry.timestamp).getTime() - startMs;
      points.push({ time: relMs, ...{ ...cumulative } });
    }

    return { chartData: points, agentIds: [...ids] };
  }, [entries, activeSessionId, sessionStartMs]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        No token data yet.
      </div>
    );
  }

  return (
    <div className="h-full px-2 py-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
        >
          <defs>
            {agentIds.map((id, i) => {
              const color = AGENT_COLORS[i % AGENT_COLORS.length];
              return (
                <linearGradient key={id} id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <XAxis
            dataKey="time"
            tickFormatter={formatMs}
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }}
            axisLine={{ stroke: "rgba(139,148,158,0.2)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-surface)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: 11,
              fontFamily: "monospace",
            }}
            labelFormatter={(v: number) => `t=${formatMs(v)}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}
          />
          {agentIds.map((id, i) => {
            const color = AGENT_COLORS[i % AGENT_COLORS.length];
            return (
              <Area
                key={id}
                type="monotone"
                dataKey={id}
                name={id.slice(0, 8)}
                stroke={color}
                fill={`url(#grad-${id})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
