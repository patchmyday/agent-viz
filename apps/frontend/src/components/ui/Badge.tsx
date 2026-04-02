import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "cyan" | "green" | "magenta" | "purple" | "muted";
  className?: string;
}

const VARIANTS: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-[rgba(139,148,158,0.15)] text-[var(--text-muted)] border-[rgba(139,148,158,0.3)]",
  cyan: "bg-[rgba(0,217,255,0.1)] text-[var(--accent-cyan)] border-[rgba(0,217,255,0.3)]",
  green: "bg-[rgba(0,255,159,0.1)] text-[var(--accent-green)] border-[rgba(0,255,159,0.3)]",
  magenta: "bg-[rgba(255,45,120,0.1)] text-[var(--accent-magenta)] border-[rgba(255,45,120,0.3)]",
  purple: "bg-[rgba(124,58,237,0.1)] text-[var(--accent-purple)] border-[rgba(124,58,237,0.3)]",
  muted: "bg-transparent text-[var(--text-muted)] border-transparent",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
