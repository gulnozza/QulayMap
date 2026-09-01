"use client";

/**
 * Organization Studio — moderation queue.
 * Demo mode: you act as the "Access Tashkent" demo moderator; approvals
 * publish features to the public map with org_reviewed trust, and every
 * decision is audit-logged server-side. Supabase mode adds real auth + roles.
 */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import type { SubmissionStatus } from "@/types/domain";

interface QueueItem {
  id: string;
  status: SubmissionStatus;
  layer: { id: string; titles: { uz: string; ru: string; en: string } } | null;
  geometry: { type: string; coordinates: unknown };
  attributes: Record<string, unknown>;
  note?: string;
  observedAt: string;
  submittedBy: string;
  reviewerNote?: string;
  createdAt: string;
}

export default function StudioPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/studio/submissions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setItems(d.submissions))
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  const review = useCallback(
    async (id: string, decision: "approve" | "reject", note?: string) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/submissions/${id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note }),
        });
        if (res.ok) {
          setRejectingId(null);
          setRejectNote("");
          load();
        }
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight">{t.studio.title}</h1>
      <p className="mt-2 rounded-2xl bg-brand-soft px-4 py-2.5 text-xs font-bold text-ink/80">
        {t.studio.demoModerator}
      </p>

      {error && (
        <p role="alert" className="mt-6 text-sm font-medium text-danger">
          {t.map.error}
        </p>
      )}
      {!items && !error && (
        <p role="status" className="mt-6 text-sm text-ink-soft">
          {t.map.loading}
        </p>
      )}
      {items && items.length === 0 && (
        <p className="mt-6 rounded-3xl bg-surface p-6 text-sm text-ink-soft shadow-card">
          {t.studio.empty}
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {items?.map((s) => (
          <li key={s.id} className="rounded-3xl bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold">
                {(typeof s.attributes.name === "string" && s.attributes.name) || s.id}
                <span className="ml-2 font-medium text-ink-soft">
                  · {s.layer?.titles[locale] ?? s.layer?.id}
                </span>
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  s.status === "published"
                    ? "bg-positive/10 text-positive"
                    : s.status === "rejected"
                      ? "bg-danger/10 text-danger"
                      : "bg-warning/10 text-warning"
                }`}
              >
                {t.studio.status[s.status]}
              </span>
            </div>
            {s.note && <p className="mt-2 text-sm text-ink-soft">“{s.note}”</p>}
            <p className="mt-2 text-xs text-ink-soft">
              {t.studio.submittedBy}: {s.submittedBy} · {t.trust.observed}:{" "}
              {fmtDate(s.observedAt)} · {fmtDate(s.createdAt)}
            </p>
            {s.reviewerNote && (
              <p className="mt-1 text-xs font-medium text-danger">↳ {s.reviewerNote}</p>
            )}

            {(s.status === "submitted" || s.status === "under_review") && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="ink"
                  disabled={busyId === s.id}
                  onClick={() => review(s.id, "approve")}
                >
                  {t.studio.approve}
                </Button>
                {rejectingId === s.id ? (
                  <>
                    <input
                      autoFocus
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder={t.studio.rejectNote}
                      className="min-h-11 flex-1 rounded-full border border-surface-dim px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    />
                    <Button
                      variant="danger"
                      disabled={rejectNote.trim().length === 0 || busyId === s.id}
                      onClick={() => review(s.id, "reject", rejectNote.trim())}
                    >
                      {t.studio.reject}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setRejectingId(s.id)}>
                    {t.studio.reject}
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
