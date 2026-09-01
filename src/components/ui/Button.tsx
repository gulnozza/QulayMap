"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ink" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "bg-brand text-ink hover:brightness-95 focus-visible:ring-ink",
  ink: "bg-ink text-surface hover:bg-ink/90 focus-visible:ring-ink",
  ghost:
    "bg-surface text-ink border border-surface-dim hover:bg-surface-dim focus-visible:ring-ink",
  danger:
    "bg-danger text-surface hover:bg-danger/90 focus-visible:ring-danger",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5
        text-sm font-bold transition-transform duration-150 active:scale-[0.98]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
