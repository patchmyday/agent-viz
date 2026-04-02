import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "ghost" | "outline" | "solid";
  size?: "sm" | "md" | "icon";
  active?: boolean;
}

const VARIANTS = {
  ghost: "bg-transparent hover:bg-[rgba(124,58,237,0.15)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
  outline: "bg-transparent border border-[rgba(124,58,237,0.3)] hover:border-[var(--accent-purple)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
  solid: "bg-[var(--accent-purple)] hover:bg-[#6d28d9] text-white border-transparent",
};

const SIZES = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
  icon: "w-7 h-7 p-0 flex items-center justify-center text-sm",
};

export function Button({
  children,
  variant = "ghost",
  size = "md",
  active = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        "rounded-md font-mono transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        active ? "!text-[var(--accent-cyan)] !bg-[rgba(0,217,255,0.1)]" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
