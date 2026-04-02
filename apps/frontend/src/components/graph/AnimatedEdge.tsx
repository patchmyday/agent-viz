import { memo, useId } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps<Edge>) {
  const gradientId = `edge-gradient-${id}`;
  const filterId = `edge-glow-${id}`;
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(124,58,237,0.1)" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="rgba(0,217,255,0.6)" />
        </linearGradient>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Glow layer */}
      <path
        d={edgePath}
        stroke="#7c3aed"
        strokeWidth={4}
        fill="none"
        opacity={0.3}
        filter={`url(#${filterId})`}
        strokeLinecap="round"
      />

      {/* Animated main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: `url(#${gradientId})`,
          strokeWidth: 2,
          strokeDasharray: "8 4",
          animation: "edge-flow 0.6s linear infinite",
          strokeLinecap: "round",
        }}
      />
    </>
  );
});
