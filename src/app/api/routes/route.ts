import { NextRequest, NextResponse } from "next/server";
import { RouteRequestSchema } from "@/lib/validation/schemas";
import { findRoute, type RoutePreferences } from "@/lib/routing/astar";
import { insidePilot, loadGraph, nearestNode } from "@/lib/routing/graph";
import { buildExplanation } from "@/lib/routing/explain";
import { getLayer } from "@/lib/data/store";
import { jsonError } from "@/lib/http";
import type { RouteOption } from "@/types/domain";

/**
 * POST /api/routes — origin/destination + preferences -> up to 2 alternatives
 * ("preferred" with user preferences, "fastest" with base costs), each with a
 * structured explanation. See docs/04-API-SPEC.md.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_payload", "Body must be JSON");
  }
  const parsed = RouteRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "invalid_payload", parsed.error.issues[0]?.message);
  }
  const { origin, destination, mode, mustAvoidLayerIds, preferLayerIds, preferenceStrength } =
    parsed.data;

  for (const p of [origin, destination]) {
    if (!insidePilot(p.lng, p.lat)) {
      return jsonError(422, "outside_pilot_area", "Point is outside the pilot area");
    }
  }

  const graph = loadGraph();
  const originNode = nearestNode(graph, origin.lng, origin.lat);
  const destNode = nearestNode(graph, destination.lng, destination.lat);

  const prefs: RoutePreferences = {
    mode,
    mustAvoidLayerIds: new Set(mustAvoidLayerIds),
    preferLayerIds: new Set(preferLayerIds),
    preferenceStrength,
  };
  const basePrefs: RoutePreferences = {
    mode,
    mustAvoidLayerIds: new Set(),
    preferLayerIds: new Set(),
    preferenceStrength: 0,
  };

  const preferred = findRoute(graph, originNode, destNode, prefs);
  const fastest = findRoute(graph, originNode, destNode, basePrefs);
  if (preferred.kind === "no_path" || fastest.kind === "no_path") {
    return jsonError(404, "no_path", "No path found between these points");
  }

  const layerSlug = (id: string) => getLayer(id)?.slug ?? id;
  const toGeometry = (r: typeof preferred) => ({
    type: "LineString" as const,
    coordinates: r.edges.flatMap((e, i) =>
      i === 0 ? e.geometry : e.geometry.slice(1),
    ) as [number, number][],
  });

  const preferredOption: RouteOption = {
    id: "preferred",
    geometry: toGeometry(preferred),
    durationS: preferred.durationS,
    distanceM: preferred.distanceM,
    hardAvoidRelaxed: preferred.hardAvoidRelaxed,
    explanation: buildExplanation(
      graph,
      preferred,
      fastest,
      prefs.mustAvoidLayerIds,
      layerSlug,
    ),
  };

  const samePath =
    preferred.edges.length === fastest.edges.length &&
    preferred.edges.every((e, i) => e.id === fastest.edges[i].id);

  const routes: RouteOption[] = samePath
    ? [preferredOption]
    : [
        preferredOption,
        {
          id: "fastest",
          geometry: toGeometry(fastest),
          durationS: fastest.durationS,
          distanceM: fastest.distanceM,
          explanation: buildExplanation(graph, fastest, null, new Set(), layerSlug),
        },
      ];

  return NextResponse.json({ routes, samePath });
}
