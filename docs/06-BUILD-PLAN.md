# 06 — Build Plan (6 weeks)

Build the **vertical slice**, in this order. Each week ends with something demoable and committed to `main` at https://github.com/gulnozza/qulaymap.

## Week 1 — Foundation and data model
- `pnpm create next-app@latest qulaymap --ts --tailwind --eslint --app --src-dir --import-alias "@/*"`
- `pnpm add maplibre-gl @supabase/ssr @supabase/supabase-js zod @tanstack/react-query`
- `pnpm add -D vitest @vitejs/plugin-react jsdom @playwright/test`
- Tailwind v4 theme tokens from `docs/01-DESIGN-SYSTEM.md`; `Manrope` via `next/font`
- Supabase project + apply `supabase/migrations/0001_init.sql`; auth (email magic link)
- Seed script: pilot orgs, Access UZ + Care UZ collections/layers, 20+ demo-labeled features
- CI (typecheck, lint, test) + Vercel deploy + README badges
- **Demo:** live URL, sign-in works, seeded data visible in Supabase Studio

## Week 2 — Public map
- `MapView` (MapLibre) with collection tiles landing page (yellow hero, tile grid)
- `/map/[collection]` — layer toggles, clustered markers, `PlaceCard` bottom sheet with TrustBadge + observed date + source, shareable URLs (state in query params)
- Viewport-driven `GET /api/collections/[slug]?bbox=` with debounced refetch
- **Demo:** browse Access UZ, filter layers, open place cards, share a URL

## Week 3 — Contributions and moderation
- Submission form (point placement on map, attributes from layer schema, photo upload via signed URL, observed date)
- EXIF stripping on upload; review queue at `/studio/submissions`
- `POST /api/submissions/[id]/review` with state machine + audit log
- RLS verified by `tests/unit/permissions.test.ts` (cross-org access must fail)
- **Demo:** submit a point → moderator approves → appears on public map

## Week 4 — Pilot routing engine
- `scripts/import-graph.ts` (OSM extract → route_nodes/route_edges)
- `edge_conditions` refresh on feature publish (ST_DWithin matching)
- A* + scoring (already specced in `src/lib/routing/astar.ts`), `POST /api/routes`
- Route UI: origin/destination via map click, Must avoid / Prefer / Show groups, tradeoff slider, ≤2 `RouteCard`s with explanations
- **Demo:** construction hard-avoid visibly reroutes; explanation strings show why

## Week 5 — Organization Studio and polish
- Create/edit collection + layers (attribute schema builder kept simple: field name, type, required)
- Reviewer invites, role management
- i18n pass: `uz` + `ru` dictionaries complete, language switcher
- Responsive/PWA pass (manifest, icons, offline shell), keyboard + screen-reader audit
- **Demo:** an org admin creates a new layer and invites a reviewer, all in Uzbek

## Week 6 — Testing and story
- Playwright: explore → contribute → moderate → route (two specs minimum)
- Empty/error/loading states audit; rate limiting live
- `docs/adr/` records; demo video/GIF in README; user-test findings written up
- **Definition of done:** a reviewer can run locally from the README, visit the live deployment, see what you wrote, and follow one coherent story from discovery to verified contribution to a personalized route

## Milestone commit tags
`v0.1-foundation` · `v0.2-public-map` · `v0.3-moderation` · `v0.4-routing` · `v0.5-studio` · `v1.0-pilot`
