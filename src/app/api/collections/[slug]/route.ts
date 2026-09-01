import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/data/store";
import { jsonError } from "@/lib/http";

/**
 * GET /api/collections/[slug]
 * Public collection metadata + layers + features as GeoJSON.
 * Demo mode returns the full pilot dataset; bbox filtering applies when given.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const data = getCollection(slug);
  if (!data) return jsonError(404, "not_found", `Unknown collection: ${slug}`);

  const bboxParam = req.nextUrl.searchParams.get("bbox");
  let bbox: [number, number, number, number] | null = null;
  if (bboxParam) {
    const parts = bboxParam.split(",").map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      return jsonError(400, "invalid_payload", "bbox must be west,south,east,north");
    }
    bbox = parts as [number, number, number, number];
  }

  const within = (lng: number, lat: number) =>
    !bbox || (lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3]);

  const features = data.features
    .filter((f) =>
      f.geometry.type === "Point"
        ? within(f.geometry.coordinates[0], f.geometry.coordinates[1])
        : f.geometry.coordinates.some(([lng, lat]) => within(lng, lat)),
    )
    .map((f) => ({
      type: "Feature" as const,
      id: f.id,
      geometry: f.geometry,
      properties: {
        layerId: f.layerId,
        name: f.name,
        trustState: f.trustState,
        observedAt: f.observedAt,
        source: f.source,
        isDemo: f.isDemo,
        attributes: f.attributes,
      },
    }));

  return NextResponse.json({
    collection: {
      id: data.collection.id,
      slug: data.collection.slug,
      title: data.collection.title,
      emoji: data.collection.emoji,
      description: data.collection.description,
      organization: data.collection.organization,
    },
    layers: data.layers.map((l) => ({
      id: l.id,
      slug: l.slug,
      titles: l.titles,
      kind: l.kind,
      routingBehavior: l.routingBehavior,
      style: l.style,
    })),
    features: { type: "FeatureCollection" as const, features },
  });
}
