"use client";

import { useI18n } from "@/lib/i18n";
import type { TrustState } from "@/types/domain";

const TRUST_STYLE: Record<TrustState, { className: string; symbol: string }> = {
  community_submitted: { className: "border border-warning text-warning", symbol: "◔" },
  org_reviewed: { className: "bg-info/10 text-info", symbol: "✓" },
  community_confirmed: { className: "bg-positive/10 text-positive", symbol: "✓✓" },
  needs_recheck: { className: "bg-warning/10 text-warning", symbol: "↻" },
};

export function TrustBadge({
  trustState,
  observedAt,
}: {
  trustState: TrustState;
  observedAt?: string;
}) {
  const { t, locale } = useI18n();
  const s = TRUST_STYLE[trustState];
  const date = observedAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(observedAt))
    : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${s.className}`}
    >
      <span aria-hidden>{s.symbol}</span>
      {t.trust[trustState]}
      {date && <span className="font-medium opacity-75">· {date}</span>}
    </span>
  );
}
