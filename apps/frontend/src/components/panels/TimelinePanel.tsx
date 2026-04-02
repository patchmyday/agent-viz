import { useMemo, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { useTimelineStore } from "@/stores/timelineStore";

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

interface GanttRow {
  name: string;
  agentId: string;
  color: string;
  start: number;
  duration: number;
  gap: number; // empty space before the bar
}

export function TimelinePanel() {
  const spans = useTimelineStore((s) => s.spans);
  const sessionStartMs = useTimelineStore((s) => s.sessionStartMs);

  // Tick every second so running-agent durations stay live
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo<GanttRow[]>(() => {
    const nowMs = Date.now(); // inside memo — stable until spans/sessionStartMs/tick changes
    return spans.map((sp) => {
      const relNow = sessionStartMs ? nowMs - sessionStartMs : 0;
      const end = sp.endMs ?? relNow;
      return {
        name: sp.agentName,
        agentId: sp.agentId,
        color: sp.color,
        start: sp.startMs,
        duration: Math.max(end - sp.startMs, 50),
        gap: sp.startMs,
      };
    });
  }, [spans, sessionStartMs, tick]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        No agent activity yet.
      </div>
    );
  }

  const maxEnd = Math.max(...rows.map((r) => r.gap + r.duration));

  const chartData = rows.map((r) => ({
    name: r.name,
    gap: r.gap,
    duration: r.duration,
    color: r.color,
    durationLabel: formatMs(r.duration),
  }));

  return (
    <div className="h-full flex flex-col px-2 py-2 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 40, bottom: 4, left: 0 }}
          barSize={18}
        >
          <XAxis
            type="number"
            domain={[0, maxEnd]}
            tickFormatter={formatMs}
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "monospace" }}
            axisLine={{ stroke: "rgba(139,148,158,0.2)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fill: "var(--text-primary)", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(124,58,237,0.1)" }}
            contentStyle={{
              background: "var(--bg-surface)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: 11,
              fontFamily: "monospace",
            }}
            formatter={(value: number, name: string) =>
              name === "duration" ? [formatMs(value), "Duration"] : [formatMs(value), "Start"]
            }
          />
          {/* Transparent gap bar to offset the real bar */}
          <Bar dataKey="gap" stackId="a" fill="transparent" isAnimationActive={false} />
          {/* Colored duration bar */}
          <Bar dataKey="duration" stackId="a" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
