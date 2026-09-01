"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface CollectionSummary {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  description: { uz: string; ru: string; en: string };
  organization: { name: string; verifiedAt: string | null };
  layerCount: number;
  featureCount: number;
}

export default function HomePage() {
  const { t, locale } = useI18n();
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Demo mode ships three collections; fetch each summary via its API route
    Promise.all(
      ["access-uz", "care-uz", "street-conditions"].map(async (slug) => {
        const res = await fetch(`/api/collections/${slug}`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
          ...data.collection,
          layerCount: data.layers.length,
          featureCount: data.features.features.length,
        } as CollectionSummary;
      }),
    ).then((results) => {
      if (!cancelled) setCollections(results.filter(Boolean) as CollectionSummary[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex-1">
      {/* Yellow hero — the Yandex-Go stage */}
      <section className="bg-brand">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            {t.tagline}
          </h1>
          <p className="mt-4 max-w-xl text-base font-medium text-ink/80 sm:text-lg">
            {t.heroSub}
          </p>
          <Link
            href="/map/access-uz"
            className="mt-8 inline-flex min-h-12 items-center rounded-full bg-ink px-7 text-sm font-bold text-brand transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
          >
            {t.home.openMap} →
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <p className="mb-6 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-ink/80">
          {t.demoBanner}
        </p>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight">
          {t.home.collectionsTitle}
        </h2>

        {!collections ? (
          <p className="text-ink-soft">{t.map.loading}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <Link
                key={c.slug}
                href={`/map/${c.slug}`}
                className="group flex flex-col justify-between rounded-3xl bg-surface p-5 shadow-card transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <div>
                  <span className="text-4xl" aria-hidden>
                    {c.emoji}
                  </span>
                  <h3 className="mt-3 text-lg font-extrabold tracking-tight">{c.title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{c.description[locale]}</p>
                </div>
                <p className="mt-4 text-xs font-bold text-ink-soft">
                  {c.organization.name} · {c.featureCount} {t.home.placesCount}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-10">
        <p className="text-xs text-ink-soft">{t.footer}</p>
      </footer>
    </div>
  );
}
