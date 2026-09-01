/**
 * Zod schemas — the single source of truth for API contracts (docs/04-API-SPEC.md).
 * Every route handler parses its payload here before touching auth or the DB.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Geometry (GeoJSON, [lng, lat], SRID 4326)
// ---------------------------------------------------------------------------

export const LngLatSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

const Position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const PointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: Position,
});

export const LineStringGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(Position).min(2),
});

export const PolygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(Position).min(4)).min(1),
});

export const FeatureGeometrySchema = z.discriminatedUnion("type", [
  PointGeometrySchema,
  LineStringGeometrySchema,
  PolygonGeometrySchema,
]);

// ---------------------------------------------------------------------------
// Collections (query)
// ---------------------------------------------------------------------------

export const CollectionQuerySchema = z.object({
  bbox: z
    .string()
    .transform((s) => s.split(",").map(Number))
    .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()])) // west, south, east, north
    .refine(([w, s, e, n]) => w < e && s < n, "bbox must be west,south,east,north"),
  layers: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .optional(),
});

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export const SubmissionCreateSchema = z.object({
  layerId: z.string().min(1),
  featureId: z.string().min(1).nullable().default(null),
  geometry: FeatureGeometrySchema,
  attributes: z.record(z.string(), z.unknown()).default({}),
  note: z.string().trim().max(1000).optional(),
  observedAt: z.string().datetime().refine(
    (d) => new Date(d) <= new Date(),
    "observedAt cannot be in the future",
  ),
  photoPaths: z.array(z.string().startsWith("submissions/")).max(5).default([]),
});
export type SubmissionCreate = z.infer<typeof SubmissionCreateSchema>;

export const ReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject", "request_changes"]),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.decision !== "reject" || (v.note && v.note.length > 0), {
    message: "A note is required when rejecting a submission",
    path: ["note"],
  });
export type Review = z.infer<typeof ReviewSchema>;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export const RouteRequestSchema = z.object({
  origin: LngLatSchema,
  destination: LngLatSchema,
  mode: z.enum(["walking", "wheelchair"]).default("walking"),
  mustAvoidLayerIds: z.array(z.string().min(1)).max(10).default([]),
  preferLayerIds: z.array(z.string().min(1)).max(10).default([]),
  preferenceStrength: z.number().min(0).max(1).default(0.5),
});
export type RouteRequest = z.infer<typeof RouteRequestSchema>;

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export const StudioQueueQuerySchema = z.object({
  status: z.enum(["submitted", "under_review", "approved", "rejected", "published"]).optional(),
  layerId: z.string().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const UploadSignSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});
