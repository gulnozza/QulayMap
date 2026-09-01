# 01 — Design System

Visual direction inspired by **Yandex Go's super-app aesthetic**: a confident brand yellow, heavy black typography, white rounded cards floating over color, playful iconography, and a tile-grid home. QulayMap adapts this energy to a civic product — warm and approachable, but with trust indicators everywhere.

## 1. Design principles

1. **Yellow is the stage, white is the content.** Yellow hero surfaces and CTAs; actual data always lives on white cards for maximum legibility.
2. **One glance, one action.** Tile grids and pill inputs make the next step obvious ("Where to?").
3. **Trust is visible.** Every feature card carries a trust badge + observed date. Never color-only.
4. **Accessibility is the brand.** 4.5:1 contrast minimum, 44px touch targets, visible focus, works with keyboard and screen readers.

## 2. Color tokens

| Token | Value | Usage |
|---|---|---|
| `--color-brand` | `#FCE000` | Hero panels, primary CTA, active states |
| `--color-brand-soft` | `#FFF7C2` | Tinted backgrounds, hover fills |
| `--color-ink` | `#17181C` | Primary text, icons (on yellow and white) |
| `--color-ink-soft` | `#5C5F66` | Secondary text |
| `--color-surface` | `#FFFFFF` | Cards, sheets, inputs |
| `--color-surface-dim` | `#F4F4F6` | Page background, dividers |
| `--color-positive` | `#1F9D55` | Verified/confirmed badges |
| `--color-warning` | `#D97706` | Needs-recheck, unverified |
| `--color-danger` | `#DC2626` | Hard-avoid layers, closures, errors |
| `--color-info` | `#2563EB` | Informational layers, links |
| `--color-route-a` | `#17181C` | Primary route line |
| `--color-route-b` | `#7C7F87` | Alternate route line |

Trust badge mapping: `community_submitted` → warning outline · `org_reviewed` → info · `community_confirmed` → positive · `needs_recheck` → warning filled.

## 3. Typography

- **Font:** `Manrope` (variable, supports Cyrillic for Russian/Uzbek-Cyrillic) with system fallback. Load via `next/font`.
- Display / hero: 800 weight, `tracking-tight`, e.g. "Har bir yo'l — sizga qulay" style headlines.
- H1 32–40px · H2 24px · H3 18px · Body 15–16px · Caption 12–13px.
- Sentence case everywhere. No all-caps except tiny badge labels.

## 4. Shape & elevation

- Cards and sheets: `rounded-3xl` (24px). Tiles: `rounded-2xl` (16px). Inputs/search/CTAs: `rounded-full`.
- Shadows: soft and low — `shadow-[0_8px_24px_rgba(23,24,28,0.08)]`. Yellow surfaces get no shadow.
- Press feedback: `active:scale-[0.98] transition-transform duration-150`.

## 5. Tailwind v4 theme (drop into `src/app/globals.css`)

```css
@import "tailwindcss";

@theme {
  --color-brand: #FCE000;
  --color-brand-soft: #FFF7C2;
  --color-ink: #17181C;
  --color-ink-soft: #5C5F66;
  --color-surface: #FFFFFF;
  --color-surface-dim: #F4F4F6;
  --color-positive: #1F9D55;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-info: #2563EB;

  --font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;

  --radius-card: 1.5rem;   /* 24px */
  --radius-tile: 1rem;     /* 16px */

  --shadow-card: 0 8px 24px rgba(23, 24, 28, 0.08);
}
```

## 6. Key components (specs)

### CollectionTile (super-app home grid)
White rounded square, icon top-left, bold label bottom, optional count chip. Grid: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`.

```tsx
export function CollectionTile({ icon, label, count, href }: CollectionTileProps) {
  return (
    <Link
      href={href}
      className="group flex aspect-square flex-col justify-between rounded-2xl
                 bg-surface p-4 shadow-card transition-transform
                 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ink"
    >
      <span className="text-3xl" aria-hidden>{icon}</span>
      <div>
        <p className="font-bold leading-tight text-ink">{label}</p>
        {count != null && (
          <p className="text-xs text-ink-soft">{count} joy</p>
        )}
      </div>
    </Link>
  );
}
```

### SearchPill ("Where to?" pattern)
Full-width pill anchored above the bottom of the map. Leading search icon, placeholder "Qayerga?", trailing round yellow action button.

### PlaceCard
White card: name, category chip, **TrustBadge** (icon + label + observed date), distance, photo thumb, actions ("Route here", "Suggest correction").

### TrustBadge
```tsx
const TRUST: Record<TrustState, { label: MsgKey; className: string; icon: IconName }> = {
  community_submitted: { label: "trust.unverified", className: "border border-warning text-warning", icon: "clock" },
  org_reviewed:        { label: "trust.reviewed",   className: "bg-info/10 text-info",               icon: "shield-check" },
  community_confirmed: { label: "trust.confirmed",  className: "bg-positive/10 text-positive",       icon: "users-check" },
  needs_recheck:       { label: "trust.recheck",    className: "bg-warning/10 text-warning",         icon: "refresh-alert" },
};
```
Always renders icon + translated label + `observed_at` (relative, localized). Never color alone.

### RouteControls
Three grouped sections — **Must avoid** (danger chips), **Prefer** (info chips), **Show on map** (neutral chips) — plus the tradeoff slider:

```
Fastest  ●───────○  Best matched to my needs
```
Slider drives `preferenceStrength` (0–1) in the route request.

### RouteCard (comparison, max 2)
Time, distance, route color dot, and an explanation line: *"Avoids 2 active construction reports · 80% recently reviewed lighting."* A "Why this route?" disclosure lists matched/avoided segments with dates.

### Hero panels (marketing / empty states)
Yellow `bg-brand` panel, black display headline, floating phone-style screenshot card — the Yandex Go store-listing composition. Use for the landing page and collection headers.

## 7. Map styling (MapLibre)

- Base: light OSM style (e.g. a self-hosted or free light style), desaturated so layers pop.
- Layer colors follow tokens: construction segments `--color-danger` dashed lines; lighting `--color-brand` glow dots; Access UZ pins `--color-info`; Care UZ pins `--color-positive`.
- Selected route: 6px `--color-ink` line with white casing; alternate route: 4px `--color-route-b`.
- Cluster markers: white circle, black count, yellow ring.

## 8. Iconography & illustration

- UI icons: [Lucide](https://lucide.dev) (consistent stroke, tree-shakeable).
- Playful 3D-style spot illustrations (à la Yandex) only on marketing surfaces/empty states — never inside data cards. Source from open sets or generate; keep a consistent light-source direction.

## 9. Responsive behavior

- Mobile-first PWA. Map fills viewport; content rises as bottom sheets (`Sheet` component, drag handle, snap points 25/60/90%).
- ≥1024px: left rail (360px) with list + controls, map fills the rest. Studio is desktop-first tables.
