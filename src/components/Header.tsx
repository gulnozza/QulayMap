"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { locales, type Locale } from "@/lib/i18n/dictionaries";

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();

  const nav = [
    { href: "/map/access-uz", label: t.nav.map, active: pathname.startsWith("/map") },
    { href: "/studio", label: t.nav.studio, active: pathname.startsWith("/studio") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-brand">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="text-lg font-extrabold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {t.appName}
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink
                ${item.active ? "bg-ink text-brand" : "text-ink hover:bg-ink/10"}`}
            >
              {item.label}
            </Link>
          ))}
          <div className="ml-2 flex overflow-hidden rounded-full border border-ink/30" role="group" aria-label="Language">
            {locales.map((l: Locale) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-pressed={locale === l}
                className={`px-2.5 py-1 text-xs font-bold uppercase transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink
                  ${locale === l ? "bg-ink text-brand" : "text-ink hover:bg-ink/10"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
