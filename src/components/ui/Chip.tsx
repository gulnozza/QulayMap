"use client";

import type { ButtonHTMLAttributes } from "react";

type Tone = "neutral" | "danger" | "info" | "brand";

const activeTone: Record<Tone, string> = {
  neutral: "bg-ink text-surface border-ink",
  danger: "bg-danger text-surface border-danger",
  info: "bg-info text-surface border-info",
  brand: "bg-brand text-ink border-brand",
};

export function Chip({
  active,
  tone = "neutral",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: Tone }) {
  return (
    <button
      {...props}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5
        text-xs font-bold transition-all duration-150 active:scale-[0.97]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1
        ${active ? activeTone[tone] : "border-surface-dim bg-surface text-ink hover:bg-surface-dim"}
        ${className}`}
    />
  );
}
