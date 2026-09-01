# QulayMap Uzbekistan

**A community-owned mapping and route-planning platform for access, safety signals, and everyday public resources.**

Wheelchair users, parents with strollers, and anyone navigating Uzbek cities deal with information that big map apps never collect: which entrances have ramps, which public toilets actually exist, which sidewalks are torn up this month, which streets are lit at night. QulayMap lets communities and verified local organizations publish that knowledge as living map layers, and turns it into routes matched to each person's conditions.

Built with Next.js 15, TypeScript, Tailwind v4, MapLibre GL, and a custom A* routing engine. Maintained by [gulnozza](https://github.com/gulnozza).

## Quick start (zero setup)

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it.

With no environment variables set, the app runs in **demo mode**: a bundled Tashkent pilot dataset (three collections, nine layers, a 90-node routing graph) plus an in-memory submission store. Every flow works out of the box:

- **Explore** the Access UZ, Care UZ, and Street Conditions collections with layer toggles, trust badges, and observation dates on every place
- **Route** between two points with "Must avoid construction", "Prefer lit streets", and the Fastest ↔ Best-matched slider, then compare two routes with structured explanations
- **Contribute** a place from the map panel
- **Moderate** it in `/studio` (you act as the demo moderator), approve it, and watch it appear on the public map with `org_reviewed` trust

Demo data is labeled as demo everywhere. Submissions reset on server restart in this mode.

## Switching to real persistence (Supabase)

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`
2. Copy `.env.example` to `.env.local` and fill in the values
3. `npm run seed` to load the pilot dataset and routing graph
4. Wire the Supabase data source (the demo store in `src/lib/data/store.ts` documents the interface; docs/02 and docs/04 spec the full path with auth and RLS)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (demo mode with no env) |
| `npm run build` | Production build with type checking |
| `npm test` | Vitest unit tests for the routing engine and moderation state machine |
| `npm run typecheck` | Strict TypeScript across app, scripts, and tests |
| `npm run generate:graph` | Regenerate the deterministic demo routing graph |
| `npm run seed` | Seed a real Supabase project |

## What the tests guard

`tests/unit/scoring.test.ts` pins the product promises to code:

- "Must avoid" genuinely excludes edges; when no clean path exists, relaxation is explicit and flagged, never silent
- The preference slider actually changes outcomes (strength 0 takes the fastest path, strength 1 flips to the preferred one)
- Trust weighting: `needs_recheck` data influences cost far less than `org_reviewed`
- Rewards can discount an edge but never below 30% of its base cost
- Wheelchair barriers are never relaxed
- The moderation state machine blocks every illegal transition

## Project structure

```
src/
  app/                  Pages + API route handlers (collections, routes, submissions, review)
  components/           Map, routing UI, studio, design-system primitives
  lib/routing/          Pure A* engine (astar.ts), graph loader, explanation builder
  lib/data/             Demo data source + in-memory store with the moderation state machine
  lib/i18n/             uz / ru / en dictionaries (uz is the source of truth)
  data/demo/            Bundled pilot routing graph (deterministic, regenerable)
supabase/migrations/    Full PostGIS schema with RLS
docs/                   Product brief, design system, architecture, API spec, routing engine, build plan
.cursor/rules/          Project rules for AI-assisted development
```

## Product rules that are enforced in code

- Trust states (`community_submitted`, `org_reviewed`, `community_confirmed`, `needs_recheck`) travel with every feature and appear on every card, never as color alone
- Routes are "better matched to your selected conditions". The words "safe", "safest", and "guaranteed" do not appear in the product, in any language
- Every route ships a structured explanation: what was avoided, preference coverage by trust state, and data freshness including segments that need a recheck
- Submissions describe places and conditions, never people
- Demo data is always labeled

## Docs

The `docs/` folder contains the full working documentation this app was built from: product brief, design system (Yandex-Go-energy yellow, ink, white cards), architecture, database schema, API contracts, routing engine spec, and a six-week build plan.

## License

MIT
