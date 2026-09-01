# 02 — Architecture

One TypeScript Next.js application. No microservices in the MVP — a small Python/FastAPI image-analysis service may be added **later** only if it earns its place. Four boundaries:

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React / MapLibre)                                  │
│  UI state, layer toggles, forms — never authorization        │
└───────────────▲──────────────────────────────┬───────────────┘
                │ typed JSON                   │ requests
┌───────────────┴──────────────────────────────▼───────────────┐
│  Next.js route handlers (src/app/api/**)                     │
│  Zod validation → auth → permission checks → domain logic    │
├──────────────────────────────────────────────────────────────┤
│  Domain modules (src/lib/**)                                 │
│  routing engine · moderation state machine · permissions     │
└───────────────▲──────────────────────────────┬───────────────┘
                │                              │
┌───────────────┴──────────────────────────────▼───────────────┐
│  Supabase: PostgreSQL + PostGIS + Auth + Storage + RLS       │
│  RLS is the backstop; handlers are the first gate            │
└──────────────────────────────────────────────────────────────┘
```

## File structure (authoritative)

```
src/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                      # landing: yellow hero + collection tiles
│   │   ├── map/page.tsx                  # public discovery map
│   │   └── map/[collection]/page.tsx     # shareable collection URLs (access-uz, care-uz)
│   ├── (dashboard)/
│   │   └── studio/
│   │       ├── page.tsx                  # org dashboard
│   │       ├── submissions/page.tsx      # moderation queue
│   │       └── layers/page.tsx           # layer builder
│   ├── api/
│   │   ├── collections/[slug]/route.ts   # GET collection + viewport features
│   │   ├── submissions/route.ts          # POST create submission
│   │   ├── submissions/[id]/review/route.ts  # POST moderator decision
│   │   ├── routes/route.ts               # POST route request → alternatives
│   │   ├── studio/submissions/route.ts   # GET org-scoped queue
│   │   └── insights/coverage/route.ts    # GET aggregate coverage/recheck gaps
│   ├── globals.css                       # Tailwind v4 theme tokens
│   └── layout.tsx
├── components/
│   ├── ui/            # Button, Card, Chip, Badge, Sheet, Field, Slider
│   ├── map/           # MapView, LayerToggle, FeatureMarker, ClusterLayer, RouteLine
│   └── routing/       # RouteControls, RouteCard, TradeoffSlider, ExplanationList
├── lib/
│   ├── supabase/      # client.ts (browser), server.ts (SSR), admin.ts (service role)
│   ├── validation/    # zod schemas (see src/lib/validation/schemas.ts)
│   ├── routing/       # astar.ts, scoring.ts, graph.ts (DB adapter), explain.ts
│   ├── i18n/          # dictionaries/{uz,ru,en}.ts, useT()
│   ├── moderation.ts  # submission state machine + audit writes
│   └── permissions.ts # role checks (isOrgReviewer, isOrgAdmin, ...)
├── types/domain.ts    # all shared domain types
supabase/migrations/   # append-only SQL
tests/
├── unit/              # scoring.test.ts, permissions.test.ts, moderation.test.ts
└── e2e/               # explore.spec.ts, moderation.spec.ts, routing.spec.ts
```

## Request flow (every write)

1. **User action** — client component fires a mutation (TanStack Query)
2. **Boundary validation** — route handler parses payload with Zod; invalid → 400 with field errors
3. **Authentication** — `@supabase/ssr` server client resolves the user from cookies
4. **Authorization** — `src/lib/permissions.ts` checks org membership/role; RLS backstops it
5. **Domain work** — pure functions (scoring, state machine); side effects isolated
6. **Persist/query** — PostGIS handles geometry, distance, bounding boxes
7. **Response** — typed JSON; client shows explicit loading/success/error states

## Reads

Public map pages are React Server Components fetching directly via the server Supabase client (RLS-scoped anon), streamed with Suspense. Viewport-driven feature refreshes go through `GET /api/collections/[slug]?bbox=` with TanStack Query, debounced on map `moveend`.

## Routing engine placement

- **Pure algorithm:** `src/lib/routing/astar.ts` + `scoring.ts` — no I/O, fully unit-tested
- **Graph adapter:** `graph.ts` loads pilot-area edges (`route_edges` + `edge_conditions`) into an in-memory adjacency list, cached per serverless instance with a TTL
- **Handler:** `api/routes/route.ts` validates request → loads graph → runs A* twice (with/without soft preferences) → returns ≤2 GeoJSON alternatives + explanations

Pilot graph size (one district) is a few thousand edges — trivially fits in memory. Nationwide scale would move this to OSRM/Valhalla; that decision is documented, not built.

## Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | RLS-scoped anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin tasks (seeding, EXIF stripping pipeline) |
| `NEXT_PUBLIC_MAP_STYLE_URL` | client | MapLibre style JSON |

## Deployment

- **Vercel** — production on `main`, preview deploys per PR
- **Supabase Cloud** — migrations applied via `supabase db push` in CI
- **GitHub Actions** (`.github/workflows/ci.yml`): typecheck → lint → Vitest → Playwright (against preview) → deploy

## Architectural Decision Records

Keep `docs/adr/` with short numbered records (context → decision → consequences). Seed with: ADR-001 single Next.js app over monorepo · ADR-002 custom A* over OSRM for pilot · ADR-003 Supabase RLS as authorization backstop · ADR-004 MapLibre/OSM over Google Maps.
