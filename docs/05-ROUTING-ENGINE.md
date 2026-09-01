# 05 — Routing Engine

A custom, fully explainable A* over a cached pedestrian graph of the pilot area. Not OSRM, not Google — this is deliberate: the point is a route engine whose preferences you can defend line by line in an interview, and whose costs incorporate community layers directly.

Reference implementation: [`src/lib/routing/astar.ts`](../src/lib/routing/astar.ts).

## 1. Building the pilot graph (one-time script)

```bash
# 1. Download a pilot-area extract (Geofabrik Uzbekistan, then clip)
#    or use the Overpass API for a small bbox.
# 2. Extract the walkable network:
osmium extract -b 69.20,41.28,69.30,41.34 uzbekistan-latest.osm.pbf -o pilot.osm.pbf
# 3. scripts/import-graph.ts parses ways tagged highway=footway|path|pedestrian|
#    residential|living_street|steps (steps excluded for wheelchair mode via
#    wheelchair_ok=false), splits at intersections, writes route_nodes/route_edges.
pnpm tsx scripts/import-graph.ts pilot.osm.pbf
```

Edge `base_cost` = `length_m / walking_speed` with walking_speed 1.33 m/s (walking) or 1.0 m/s (wheelchair mode, plus `wheelchair_ok=false` edges excluded entirely).

Pilot district ≈ a few thousand edges → the whole graph loads into memory per serverless instance and is cached with a 5-minute TTL.

## 2. Cost model

```
edge_cost = base_time
          + Σ hard_avoid:    excluded from search entirely (cost = ∞)
          + Σ soft_avoid:    base_time × penalty × severity × trust_weight × strength
          − Σ soft_prefer:   base_time × reward  × severity × trust_weight × strength
```

- `strength` = user's `preferenceStrength` slider (0–1)
- `trust_weight`: `org_reviewed`/`community_confirmed` = 1.0 · `community_submitted` = 0.6 · `needs_recheck` = 0.25 — stale or unverified conditions influence scoring less
- Rewards are capped so `edge_cost ≥ 0.3 × base_time` (a preference can discount an edge, never make it free)
- Hard avoids remove the edge from the adjacency list before search. If no path exists without the avoided edges, return the fastest path **with a warning** (`hardAvoidRelaxed: true`) rather than failing silently.

## 3. A*

- Heuristic: haversine straight-line distance / max walking speed — admissible, keeps search efficient.
- Run twice per request: once with preferences applied ("preferred"), once with base costs only ("fastest"). If they resolve to the same edge sequence, return one route.
- Binary min-heap priority queue (implemented in `astar.ts`, no dependency).

## 4. Explanations (first-class output)

While reconstructing the winning path, collect:
- every hard-avoid feature whose edges were excluded near the corridor (count + freshest `observed_at`)
- per soft-preference layer: % of route length covered by condition edges, with trust-state breakdown
- freshness summary: oldest `observed_at` on the route, count of `needs_recheck` segments

`explain.ts` turns this into localized strings. Banned vocabulary: "safe", "safest", "guaranteed". Approved framing: "better matched to your selected conditions."

## 5. Module layout

| File | Responsibility | I/O? |
|---|---|---|
| `graph.ts` | Load nodes/edges/conditions from Supabase → adjacency list; nearest-node snapping | yes (cached) |
| `scoring.ts` | Pure cost function: `(edge, conditions, prefs) → cost` | no |
| `astar.ts` | Pure A* with pluggable cost fn + heap | no |
| `explain.ts` | Path + collected evidence → explanation object | no |

`scoring.ts` and `astar.ts` are pure so `tests/unit/scoring.test.ts` can assert:
1. A hard-avoid edge never appears in any returned route (when an alternative exists).
2. Increasing `preferenceStrength` flips the selected route on a fixture graph with a lit detour.
3. `needs_recheck` conditions move costs less than `org_reviewed` ones with identical severity.
4. Reward cap holds: no edge cost below `0.3 × base_time`.
5. Disconnected origin/destination returns a typed `no_path` result, not a throw.

## 6. Honest limitations (document in README)

- Pilot area only; requests outside the bbox get a clear 422.
- Graph freshness = last OSM import; conditions freshness = `edge_conditions` refresh on publish.
- Wheelchair mode relies on OSM tags + partner-verified features; absence of a barrier report is not evidence of accessibility, and the UI must say so when coverage is low.
