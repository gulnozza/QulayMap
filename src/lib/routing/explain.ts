/**
 * Explanation builder: RouteResult evidence -> structured RouteExplanation.
 * The client localizes the strings; the server returns structured facts only.
 *
 * Vocabulary rule (docs/05 §4): never "safe"/"safest"/"guaranteed" anywhere in
 * this pipeline. Routes are "better matched to your selected conditions".
 */

import type { Graph, RouteResult } from "./astar";
import type { RouteExplanation, TrustState } from "@/types/domain";

/**
 * Avoided features = hard-avoid features (on user-avoided layers) present on
 * the fastest route's edges but absent from the preferred route's edges — the
 * concrete things this route actually routes around.
 */
export function buildExplanation(
  graph: Graph,
  route: RouteResult,
  fastest: RouteResult | null,
  mustAvoidLayerIds: Set<string>,
  layerSlugById: (id: string) => string,
): RouteExplanation {
  const routeEdgeIds = new Set(route.edges.map((e) => e.id));

  const avoidedByLayer = new Map<
    string,
    { featureIds: Set<string>; freshestObservedAt: string }
  >();
  if (fastest) {
    for (const edge of fastest.edges) {
      if (routeEdgeIds.has(edge.id)) continue;
      for (const c of graph.conditions.get(edge.id) ?? []) {
        if (c.behavior !== "hard_avoid" || !mustAvoidLayerIds.has(c.layerId)) continue;
        const entry =
          avoidedByLayer.get(c.layerId) ??
          { featureIds: new Set<string>(), freshestObservedAt: c.observedAt };
        entry.featureIds.add(c.featureId);
        if (c.observedAt > entry.freshestObservedAt) entry.freshestObservedAt = c.observedAt;
        avoidedByLayer.set(c.layerId, entry);
      }
    }
  }

  const preferenceCoverage = [...route.evidence.preferenceCoverage.entries()].map(
    ([layerId, cov]) => {
      const trustBreakdown: Partial<Record<TrustState, number>> = {};
      for (const [trust, time] of Object.entries(cov.byTrust)) {
        trustBreakdown[trust as TrustState] = Math.round(
          (100 * (time ?? 0)) / Math.max(route.durationS, 1),
        );
      }
      return {
        layerSlug: layerSlugById(layerId),
        coveragePct: Math.min(
          100,
          Math.round((100 * cov.coveredTime) / Math.max(route.durationS, 1)),
        ),
        trustBreakdown,
      };
    },
  );

  return {
    summary: "", // composed client-side in the user's language
    avoided: [...avoidedByLayer.entries()].map(([layerId, entry]) => ({
      layerSlug: layerSlugById(layerId),
      count: entry.featureIds.size,
      freshestObservedAt: entry.freshestObservedAt,
    })),
    preferenceCoverage,
    dataFreshness: {
      oldestObservedAt: route.evidence.oldestObservedAt,
      needsRecheckSegments: route.evidence.needsRecheckSegments,
    },
  };
}
