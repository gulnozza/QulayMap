# QulayMap Uzbekistan

**A community-owned mapping and route-planning platform for access, safety signals, and everyday public resources.**

Wheelchair users, parents with strollers, and anyone navigating Uzbek cities deal with information that big map apps never collect: which entrances have ramps, which public toilets actually exist, which sidewalks are torn up this month, which streets are lit at night. QulayMap lets communities and verified local organizations publish that knowledge as living map layers, and turns it into routes matched to each person's conditions.

## Quick start 

```bash
npm install
npm run dev
```

With no environment variables set, the app runs in **demo mode**: a bundled Tashkent pilot dataset (three collections, nine layers, a 90-node routing graph) plus an in-memory submission store. Every flow works out of the box:

- **Explore** the Access UZ, Care UZ, and Street Conditions collections with layer toggles, trust badges, and observation dates on every place
- **Route** between two points with "Must avoid construction", "Prefer lit streets", and the Fastest ↔ Best-matched slider, then compare two routes with structured explanations
- **Contribute** a place from the map panel
- **Moderate** it in `/studio` (you act as the demo moderator), approve it, and watch it appear on the public map with `org_reviewed` trust


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
- Every route ships a structured explanation: what was avoided, preference coverage by trust state, and data freshness, including segments that need a recheck
- Submissions describe places and conditions, never people
- Demo data is always labeled

## Docs

The `docs/` folder contains the full working documentation this app was built from: product brief, design system (Yandex-Go-energy yellow, ink, white cards), architecture, database schema, API contracts, routing engine spec, and a six-week build plan.

## License

MIT
