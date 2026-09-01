# 07 — Cursor Prompts

Paste these into Cursor (Composer/Agent mode) in order. The `.cursor/rules/` files apply automatically; each prompt also names the docs to read so the agent has full context. Work in small commits; review every diff before accepting.

> **Tip:** keep `docs/` and `supabase/migrations/0001_init.sql` in the repo before your first prompt — Cursor indexes them and the rules point at them.

---

## Prompt 1 — Project foundation

```
Read docs/00-PRODUCT-BRIEF.md, docs/02-ARCHITECTURE.md, and docs/01-DESIGN-SYSTEM.md.

Scaffold the app per the file structure in docs/02-ARCHITECTURE.md:
1. Configure Tailwind v4 in src/app/globals.css using the exact @theme tokens from docs/01-DESIGN-SYSTEM.md §5, and load Manrope via next/font in layout.tsx.
2. Create src/lib/supabase/{client,server,admin}.ts using @supabase/ssr patterns. admin.ts must be server-only (import "server-only").
3. Create src/types/domain.ts if missing (it exists — do not modify) and src/lib/i18n with typed dictionaries for uz (default), ru, en, plus a useT() hook. Seed with keys for: nav, trust states, route controls, common actions.
4. Create the ui primitives in src/components/ui: Button, Card, Chip, Badge, Sheet, Field, Slider — styled per the design system (rounded-3xl cards, pill buttons, brand yellow primary, active:scale press feedback, focus-visible rings).
5. Add .env.example with the four variables from docs/02-ARCHITECTURE.md.
Do not build any pages yet beyond a placeholder landing page with a yellow hero and the headline area.
```

## Prompt 2 — Seed script

```
Read supabase/migrations/0001_init.sql and docs/00-PRODUCT-BRIEF.md.

Write scripts/seed.ts (run with pnpm tsx, using src/lib/supabase/admin.ts):
- Two organizations: "Access Tashkent" (verified) and "Care Collective UZ" (verified)
- Collections: access-uz (layers: entrances, ramps, elevators, accessible-toilets, obstacles) and care-uz (layers: public-toilets, menstrual-health, water-points). Plus a street-conditions collection with a construction layer (routing_behavior=hard_avoid) and a lighting layer (routing_behavior=soft_prefer).
- 25 map_features across the layers inside bbox 69.20,41.28,69.30,41.34 (Tashkent pilot), all with is_demo=true, source='demo data', realistic observed_at dates, and a mix of trust states.
- Two construction LineString features and six lighting LineString features positioned along real-looking streets.
- Idempotent: upsert by slug/name, safe to re-run.
Add "seed": "tsx scripts/seed.ts" to package.json.
```

## Prompt 3 — Landing + public map

```
Read docs/01-DESIGN-SYSTEM.md and docs/04-API-SPEC.md.

Build:
1. src/app/(public)/page.tsx — yellow hero panel (display headline + subline from i18n), then a CollectionTile grid (per design system §6) listing collections fetched server-side.
2. src/components/map/MapView.tsx — MapLibre map (style from NEXT_PUBLIC_MAP_STYLE_URL), client component, exposing onMoveEnd(bbox) and imperative helpers to set GeoJSON sources. MapLibre must not be imported outside src/components/map/.
3. src/app/(public)/map/[collection]/page.tsx — map + layer toggle chips + place list; on marker/list tap open a bottom Sheet with PlaceCard (name, category chip, TrustBadge with observed_at, source, isDemo label, photo, "Route here" and "Suggest correction" actions).
4. GET /api/collections/[slug]/route.ts per docs/04-API-SPEC.md, validating query with CollectionQuerySchema from src/lib/validation/schemas.ts, returning a GeoJSON FeatureCollection. Wire viewport refetch with TanStack Query, debounced 400ms on moveend.
All copy through i18n. Loading, empty, and error states for the feature fetch.
```

## Prompt 4 — Submissions + moderation

```
Read docs/03-DATABASE.md (state machine + RLS invariants) and docs/04-API-SPEC.md.

Build:
1. src/lib/moderation.ts — the submission state machine; export canTransition(from, to) and a transition() helper that updates status and inserts an audit_log row in the same operation; illegal transitions throw a typed ConflictError.
2. src/lib/permissions.ts — isOrgReviewer / isOrgAdmin resolved via organization_members for a given layer/collection.
3. POST /api/uploads/sign and POST /api/submissions per the spec, using UploadSignSchema and SubmissionCreateSchema. Validate submission attributes against the layer's attribute_schema (use a light JSON-Schema check).
4. The contribute flow UI: from PlaceCard "Suggest correction" and a map "Add place" action → form (position picker, dynamic fields from attribute_schema, note, observed date, photo).
5. /studio/submissions — moderation queue (org-scoped via GET /api/studio/submissions) with approve/reject (note required to reject) hitting POST /api/submissions/[id]/review. On approve, publish/update the map_feature with trust_state='org_reviewed'.
6. tests/unit/moderation.test.ts and tests/unit/permissions.test.ts covering: illegal transitions rejected; reviewer from org A cannot review org B's submission; reject requires a note.
```

## Prompt 5 — Graph import + edge conditions

```
Read docs/05-ROUTING-ENGINE.md §1 and supabase/migrations/0001_init.sql (route_nodes, route_edges, edge_conditions).

Build scripts/import-graph.ts: parse a pilot-area .osm.pbf or .osm.xml (accept a path argument), extract walkable ways (highway=footway|path|pedestrian|living_street|residential; steps → wheelchair_ok=false), split ways at shared nodes into edges, compute length_m (haversine along geometry) and base_cost at 1.33 m/s, and upsert route_nodes/route_edges via the admin client in batches.

Then write a new migration supabase/migrations/0002_edge_conditions_refresh.sql: a SQL function refresh_edge_conditions(p_feature_id uuid) that matches a published feature's geometry to edges within 15 meters (geography ST_DWithin) for layers whose routing_behavior is hard_avoid/soft_avoid/soft_prefer, writing severity from properties->>'severity' (default 1) plus the feature's trust_state and observed_at. Call it from the review-approve path in the API.
```

## Prompt 6 — Routing API + UI

```
Read docs/05-ROUTING-ENGINE.md and src/lib/routing/astar.ts (already implemented — do not rewrite the algorithm).

Build:
1. src/lib/routing/graph.ts — load nodes/edges/conditions from Supabase into the Graph shape astar.ts expects; module-level cache with 5-minute TTL; nearestNode(lng, lat) via the KNN query in docs/03-DATABASE.md.
2. src/lib/routing/explain.ts — RouteResult.evidence → RouteExplanation (src/types/domain.ts) with localized summary strings. Banned words: safe, safest, guaranteed.
3. POST /api/routes per docs/04-API-SPEC.md: RouteRequestSchema, pilot bbox check (422 outside_pilot_area), run findRoute twice (preferred = user prefs; fastest = empty prefs), dedupe identical paths, return ≤2 RouteOption objects with GeoJSON geometry.
4. Routing UI: origin/destination by map click (pins), RouteControls with Must avoid / Prefer / Show on map chip groups and the Fastest↔Best-matched slider, RouteCards with duration, distance, explanation summary, and a "Why this route?" disclosure listing evidence. Draw both routes on the map (ink primary, gray alternate) with a tap-to-select swap.
5. tests/unit/scoring.test.ts implementing the five assertions in docs/05-ROUTING-ENGINE.md §5 against a small fixture graph.
```

## Prompt 7 — Studio layer builder + i18n completion

```
Read docs/06-BUILD-PLAN.md Week 5.

Build /studio collection + layer management for org admins: create/edit collection (title, slug, description, visibility), create layers (title, kind, routing_behavior, simple attribute-schema builder: field name, type [text|number|boolean|select], required flag), invite reviewers by email with a role. Guard everything with isOrgAdmin; verify RLS blocks non-admins.
Complete the uz and ru dictionaries for every key in the app, add a language switcher in the header persisted to the profile, and localize dates/distances.
```

## Prompt 8 — E2E + polish

```
Read docs/06-BUILD-PLAN.md Week 6.

1. Playwright specs: (a) visitor opens access-uz, toggles construction, requests a route between two seeded points, sees an explanation containing "construction"; (b) a reviewer approves a seeded submission and the point appears on the public map.
2. PWA: manifest, icons, theme color #FCE000, installability.
3. Audit every page for loading/empty/error states and keyboard navigation; fix gaps.
4. Add rate limiting to /api/submissions and /api/routes per docs/04-API-SPEC.md.
5. Update README.md: live URL, screenshots, and the "Data sources, verification, and privacy" and "Routing model and limitations" sections written honestly.
```

---

## Working style with Cursor

- One prompt = one reviewable PR. Tag milestones per `docs/06-BUILD-PLAN.md`.
- If Cursor proposes a new table/endpoint not in the docs, stop it — update the doc first, then implement. Docs lead, code follows.
- After each prompt, run `pnpm typecheck && pnpm test` before committing.
- Never let generated copy include "safe"/"safest" — grep for it in CI:
  `grep -rniE '\b(safe|safest)\b' src/lib/i18n && exit 1 || exit 0`
