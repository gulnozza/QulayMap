# 03 — Database

Schema of record: [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql). This doc explains the design; the SQL is authoritative.

## Entity relationships

```
organizations ──< organization_members >── profiles
      │
      └──< collections ──< layers ──< map_features ──< verifications
                              │            │
                              └──< submissions ──< audit_log
                              │
route_nodes ──< route_edges ──< edge_conditions >── map_features
```

## Design decisions

**Relational core + JSONB attributes.** A public toilet and a wheelchair ramp have different details, but both are features with geometry, source, trust state, and observed date. Those shared columns are relational; category-specific attributes live in `map_features.properties` validated against `layers.attribute_schema` (a JSON Schema) at submission time.

**Geometry.** SRID 4326 everywhere. `Point` for a restroom or entrance; `LineString` for construction along a sidewalk; `Polygon` for a park or restricted zone. Every geometry column has a GiST index — this is what makes "features near this route" and viewport queries fast.

**Trust is a column, not a vibe.** `trust_state` enum lives on features and on `edge_conditions`, so both the UI and the routing engine read the same truth. `needs_recheck` remains visible but is down-weighted in scoring.

**Honest demo data.** `map_features.is_demo` forces demo data to be labeled in the UI. Never mix demo and verified data silently.

**Audit is append-only.** `audit_log` has insert-only RLS (no update/delete policies). Every moderation decision records actor, from/to status, reason, timestamp.

**Routing graph is precomputed.** `route_nodes`/`route_edges` are imported once from an OSM extract of the pilot area (see `docs/05-ROUTING-ENGINE.md`). `edge_conditions` is a join table refreshed whenever a `hard_avoid`/`soft_*` feature is published near an edge (`ST_DWithin(edge.geometry, feature.geometry, 15)` meters, using geography casts).

## Submission state machine

```
draft → submitted → under_review → approved → published
                          ↓
                       rejected
published → needs_recheck → under_review
```

Transitions are enforced in `src/lib/moderation.ts` (illegal jumps rejected with a typed error) and every transition writes an `audit_log` row in the same transaction.

## Useful queries

Viewport features for a collection:

```sql
select f.id, f.name, f.trust_state, f.observed_at, f.is_demo,
       st_asgeojson(f.geometry)::jsonb as geometry, f.properties,
       l.slug as layer_slug, l.style
from map_features f
join layers l on l.id = f.layer_id
join collections c on c.id = l.collection_id
where c.slug = $1
  and f.published_at is not null
  and f.geometry && st_makeenvelope($2, $3, $4, $5, 4326);  -- west, south, east, north
```

Edges affected by active hard-avoid conditions:

```sql
select ec.edge_id, ec.severity, ec.trust_state, ec.observed_at
from edge_conditions ec
join layers l on l.id = ec.layer_id
where l.routing_behavior = 'hard_avoid';
```

Nearest graph node to a clicked point (route origin snapping):

```sql
select id from route_nodes
order by geometry <-> st_setsrid(st_makepoint($1, $2), 4326)
limit 1;
```

## RLS invariants (mirrored as tests in `tests/unit/permissions.test.ts`)

1. Anonymous users read public collections and published+public features only.
2. Authenticated users insert submissions with `submitted_by = auth.uid()` only.
3. A reviewer from Organization A cannot read or update Organization B's submissions.
4. Only org admins create/modify layers and manage members.
5. `visibility = 'private'` features never appear in public queries.
6. `audit_log` rows can never be updated or deleted by any client role.

## Migration policy

Append-only. Never edit an applied migration — write `0002_*.sql` and so on. Apply locally with `npx supabase db push`; CI applies to staging on merge.
