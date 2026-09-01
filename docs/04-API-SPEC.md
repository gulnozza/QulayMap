# 04 — API Specification

All endpoints are Next.js route handlers under `src/app/api/`. Every handler follows: **Zod parse → authenticate → authorize → domain → typed JSON**. Zod schemas live in `src/lib/validation/schemas.ts` and are the single source of truth for these shapes.

Error shape (all endpoints):

```json
{ "error": { "code": "invalid_payload", "message": "…", "fields": { "origin.lng": "Required" } } }
```

Codes: `invalid_payload` 400 · `unauthenticated` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 (illegal state transition) · `rate_limited` 429 · `internal` 500.

---

## GET `/api/collections/[slug]`

Public collection metadata + layers + viewport-filtered features.

Query params: `bbox=west,south,east,north` (required for features), `layers=slug1,slug2` (optional filter).

**200**
```json
{
  "collection": { "id": "…", "slug": "access-uz", "title": "Access UZ", "organization": { "name": "…", "verifiedAt": "…" } },
  "layers": [ { "id": "…", "slug": "entrances", "title": "…", "kind": "resource", "routingBehavior": "informational", "style": { "colorToken": "info", "icon": "door-open" } } ],
  "features": {
    "type": "FeatureCollection",
    "features": [ {
      "type": "Feature",
      "id": "…",
      "geometry": { "type": "Point", "coordinates": [69.2401, 41.2995] },
      "properties": {
        "layerSlug": "entrances", "name": "…",
        "trustState": "org_reviewed", "observedAt": "2026-08-01T00:00:00Z",
        "source": "field visit", "isDemo": false,
        "attributes": { "stepFree": true, "doorWidthCm": 92 }
      }
    } ]
  }
}
```

---

## POST `/api/submissions`  _(auth required, rate-limited)_

Create a submission for a new place, a correction, or a condition report.

**Request** (`SubmissionCreateSchema`)
```json
{
  "layerId": "uuid",
  "featureId": "uuid | null",
  "geometry": { "type": "Point", "coordinates": [69.24, 41.29] },
  "attributes": { "stepFree": true },
  "note": "Ramp installed at the side entrance",
  "observedAt": "2026-08-20T10:00:00Z",
  "photoPaths": ["submissions/abc.webp"]
}
```

Checks: Zod shape → auth → layer exists and its collection is public/joinable → `attributes` validate against `layers.attribute_schema` → insert with `status='submitted'`, `submitted_by=user.id`.

**201** `{ "submission": { "id": "…", "status": "submitted" } }`

---

## POST `/api/submissions/[id]/review`  _(reviewer/admin of owning org)_

**Request** (`ReviewSchema`)
```json
{ "decision": "approve" | "reject" | "request_changes", "note": "string (required for reject)" }
```

Checks: auth → `isOrgReviewer(user, submission)` → legal state transition (`src/lib/moderation.ts`) → in one transaction: update status, write `audit_log`, on approve create/update `map_features` (with `published_at`, `trust_state='org_reviewed'`) and refresh `edge_conditions` if the layer affects routing.

**200** `{ "submission": { "id": "…", "status": "approved" } }` · **409** on illegal transition.

---

## POST `/api/routes`  _(rate-limited; auth optional)_

**Request** (`RouteRequestSchema`)
```json
{
  "origin": { "lng": 69.2401, "lat": 41.2995 },
  "destination": { "lng": 69.2552, "lat": 41.3111 },
  "mode": "walking" | "wheelchair",
  "mustAvoidLayerIds": ["uuid-construction"],
  "preferLayerIds": ["uuid-lighting"],
  "preferenceStrength": 0.65
}
```

Bounds check: both points must fall inside the pilot-area bbox, else `422` with `code: "outside_pilot_area"` and a human message.

**200**
```json
{
  "routes": [ {
    "id": "preferred",
    "geometry": { "type": "LineString", "coordinates": [[69.24,41.29], …] },
    "durationS": 1140, "distanceM": 1520,
    "explanation": {
      "summary": "Avoids 2 active construction reports; 78% of segments have recently reviewed lighting data.",
      "avoided": [ { "layerSlug": "construction", "count": 2, "freshestObservedAt": "…" } ],
      "preferenceCoverage": [ { "layerSlug": "lighting", "coveragePct": 78, "trustBreakdown": { "org_reviewed": 61, "community_confirmed": 17 } } ],
      "dataFreshness": { "oldestObservedAt": "…", "needsRecheckSegments": 1 }
    }
  }, { "id": "fastest", "…": "…" } ]
}
```

Never more than 2 routes. Never the word "safe" in any generated string.

---

## GET `/api/studio/submissions`  _(reviewer/admin)_

Org-scoped moderation queue. Query: `status`, `layerId`, `cursor`, `limit≤50`.

**200** `{ "submissions": [ { "id", "status", "layer": {…}, "submittedBy": { "displayName" }, "observedAt", "createdAt", "payload" } ], "nextCursor": "…" }`

---

## GET `/api/insights/coverage`  _(reviewer/admin)_

Privacy-preserving aggregates from the `coverage_summary` view — published counts, needs-recheck counts, freshest observation per layer. No individual contributor data.

---

## Non-endpoint contracts

- **Image upload** goes directly to Supabase Storage via signed upload URL from `POST /api/uploads/sign` (auth required, content-type + size ≤ 5 MB enforced). A storage webhook/Edge Function strips EXIF and moves the file to the `submissions/` bucket before it is referenceable.
- **Rate limits:** submissions 10/hour/user; routes 60/hour/IP. Token bucket in `src/lib/ratelimit.ts` (Upstash Redis or in-memory for pilot).
