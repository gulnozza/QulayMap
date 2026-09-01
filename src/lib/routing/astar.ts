/**
 * QulayMap pilot routing engine — pure A* with layer-aware edge costs.
 *
 * No I/O in this module. Graph loading lives in `graph.ts`; this file is
 * fully unit-testable (see tests/unit/scoring.test.ts).
 *
 * Cost model (docs/05-ROUTING-ENGINE.md):
 *   hard_avoid   → edge excluded from search
 *   soft_avoid   → base_time * penalty * severity * trustWeight * strength added
 *   soft_prefer  → base_time * reward  * severity * trustWeight * strength subtracted
 *   floor        → edge cost never drops below 0.3 * base_time
 */

import type { TrustState } from "@/types/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: number;
  lng: number;
  lat: number;
}

export interface GraphEdge {
  id: number;
  from: number;
  to: number;
  /** seconds at mode walking speed */
  baseTime: number;
  lengthM: number;
  wheelchairOk: boolean;
  /** [lng, lat] coordinates for rendering the segment */
  geometry: [number, number][];
}

export interface EdgeCondition {
  edgeId: number;
  layerId: string;
  featureId: string;
  behavior: "hard_avoid" | "soft_avoid" | "soft_prefer";
  /** 0..1 */
  severity: number;
  trustState: TrustState;
  observedAt: string; // ISO
}

export interface RoutePreferences {
  mode: "walking" | "wheelchair";
  mustAvoidLayerIds: Set<string>;
  preferLayerIds: Set<string>;
  /** 0..1 — the "Fastest ↔ Best matched" slider */
  preferenceStrength: number;
}

export interface RouteResult {
  kind: "ok";
  nodeIds: number[];
  edges: GraphEdge[];
  durationS: number;
  distanceM: number;
  /** true when hard avoids had to be relaxed to find any path */
  hardAvoidRelaxed: boolean;
  evidence: RouteEvidence;
}

export interface NoPathResult {
  kind: "no_path";
}

export interface RouteEvidence {
  avoidedFeatures: Map<string, { layerId: string; count: number; freshestObservedAt: string }>;
  /** per prefer-layer: seconds of route covered by that condition, by trust state */
  preferenceCoverage: Map<string, { coveredTime: number; byTrust: Partial<Record<TrustState, number>> }>;
  oldestObservedAt: string | null;
  needsRecheckSegments: number;
}

// ---------------------------------------------------------------------------
// Trust weighting — stale/unverified data influences scoring less
// ---------------------------------------------------------------------------

export const TRUST_WEIGHT: Record<TrustState, number> = {
  org_reviewed: 1.0,
  community_confirmed: 1.0,
  community_submitted: 0.6,
  needs_recheck: 0.25,
};

const SOFT_AVOID_PENALTY = 1.5; // multiplier scale for avoided-but-passable conditions
const SOFT_PREFER_REWARD = 0.5; // multiplier scale for preferred conditions
const MIN_COST_RATIO = 0.3;     // rewards can discount an edge, never make it free

// ---------------------------------------------------------------------------
// Scoring (pure)
// ---------------------------------------------------------------------------

export function edgeCost(
  edge: GraphEdge,
  conditions: EdgeCondition[],
  prefs: RoutePreferences,
): number | "excluded" {
  if (prefs.mode === "wheelchair" && !edge.wheelchairOk) return "excluded";

  let cost = edge.baseTime;

  for (const c of conditions) {
    const w = TRUST_WEIGHT[c.trustState] * c.severity;
    if (prefs.mustAvoidLayerIds.has(c.layerId)) {
      // Hard avoid: exclude entirely (severity/trust don't soften a closure)
      if (c.behavior === "hard_avoid") return "excluded";
      // A layer configured soft but user-marked "must avoid": heavy penalty
      cost += edge.baseTime * SOFT_AVOID_PENALTY * w;
    } else if (prefs.preferLayerIds.has(c.layerId) && c.behavior === "soft_prefer") {
      cost -= edge.baseTime * SOFT_PREFER_REWARD * w * prefs.preferenceStrength;
    } else if (c.behavior === "soft_avoid") {
      cost += edge.baseTime * SOFT_AVOID_PENALTY * w * prefs.preferenceStrength;
    }
  }

  return Math.max(cost, edge.baseTime * MIN_COST_RATIO);
}

// ---------------------------------------------------------------------------
// Haversine heuristic (admissible: straight-line at max speed)
// ---------------------------------------------------------------------------

const EARTH_R = 6_371_000;
const MAX_SPEED_MS = 1.5;

export function haversineM(a: GraphNode, b: GraphNode): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

const heuristic = (a: GraphNode, goal: GraphNode) => haversineM(a, goal) / MAX_SPEED_MS;

// ---------------------------------------------------------------------------
// Binary min-heap (no dependency)
// ---------------------------------------------------------------------------

class MinHeap {
  private items: { id: number; f: number }[] = [];
  get size() { return this.items.length; }
  push(id: number, f: number) {
    this.items.push({ id, f });
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].f <= this.items[i].f) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0].id;
    const last = this.items.pop()!;
    if (n > 1) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < this.items.length && this.items[l].f < this.items[s].f) s = l;
        if (r < this.items.length && this.items[r].f < this.items[s].f) s = r;
        if (s === i) break;
        [this.items[s], this.items[i]] = [this.items[i], this.items[s]];
        i = s;
      }
    }
    return top;
  }
}

// ---------------------------------------------------------------------------
// A* search
// ---------------------------------------------------------------------------

export interface Graph {
  nodes: Map<number, GraphNode>;
  /** adjacency: nodeId → outgoing edges */
  adjacency: Map<number, GraphEdge[]>;
  /** edgeId → active conditions */
  conditions: Map<number, EdgeCondition[]>;
}

export function findRoute(
  graph: Graph,
  originNodeId: number,
  destNodeId: number,
  prefs: RoutePreferences,
): RouteResult | NoPathResult {
  const attempt = search(graph, originNodeId, destNodeId, prefs, /*relaxHardAvoids*/ false);
  if (attempt.kind === "ok") return attempt;
  // No path with hard avoids applied — retry relaxed, flag it honestly.
  const relaxed = search(graph, originNodeId, destNodeId, prefs, true);
  return relaxed.kind === "ok" ? { ...relaxed, hardAvoidRelaxed: true } : relaxed;
}

function search(
  graph: Graph,
  origin: number,
  dest: number,
  prefs: RoutePreferences,
  relaxHardAvoids: boolean,
): RouteResult | NoPathResult {
  const goal = graph.nodes.get(dest);
  const start = graph.nodes.get(origin);
  if (!goal || !start) return { kind: "no_path" };

  const gScore = new Map<number, number>([[origin, 0]]);
  const cameFrom = new Map<number, GraphEdge>();
  const open = new MinHeap();
  open.push(origin, heuristic(start, goal));
  const closed = new Set<number>();

  while (open.size > 0) {
    const current = open.pop()!;
    if (current === dest) return reconstruct(graph, origin, dest, cameFrom, prefs);
    if (closed.has(current)) continue;
    closed.add(current);

    for (const edge of graph.adjacency.get(current) ?? []) {
      const conditions = graph.conditions.get(edge.id) ?? [];
      let cost = edgeCost(edge, conditions, prefs);
      if (cost === "excluded") {
        if (!relaxHardAvoids) continue;
        // Relaxed mode: wheelchair barriers stay excluded; only user avoids relax.
        if (prefs.mode === "wheelchair" && !edge.wheelchairOk) continue;
        cost = edge.baseTime * (1 + SOFT_AVOID_PENALTY);
      }
      const tentative = (gScore.get(current) ?? Infinity) + cost;
      if (tentative < (gScore.get(edge.to) ?? Infinity)) {
        gScore.set(edge.to, tentative);
        cameFrom.set(edge.to, edge);
        const node = graph.nodes.get(edge.to);
        if (node) open.push(edge.to, tentative + heuristic(node, goal));
      }
    }
  }
  return { kind: "no_path" };
}

function reconstruct(
  graph: Graph,
  origin: number,
  dest: number,
  cameFrom: Map<number, GraphEdge>,
  prefs: RoutePreferences,
): RouteResult {
  const edges: GraphEdge[] = [];
  const nodeIds: number[] = [dest];
  let cursor = dest;
  while (cursor !== origin) {
    const edge = cameFrom.get(cursor)!;
    edges.unshift(edge);
    cursor = edge.from;
    nodeIds.unshift(cursor);
  }

  // Collect evidence for the explanation layer (docs/05, §4)
  const evidence: RouteEvidence = {
    avoidedFeatures: new Map(),
    preferenceCoverage: new Map(),
    oldestObservedAt: null,
    needsRecheckSegments: 0,
  };
  let durationS = 0;
  let distanceM = 0;

  for (const edge of edges) {
    durationS += edge.baseTime;
    distanceM += edge.lengthM;
    for (const c of graph.conditions.get(edge.id) ?? []) {
      if (c.trustState === "needs_recheck") evidence.needsRecheckSegments += 1;
      if (!evidence.oldestObservedAt || c.observedAt < evidence.oldestObservedAt) {
        evidence.oldestObservedAt = c.observedAt;
      }
      if (prefs.preferLayerIds.has(c.layerId) && c.behavior === "soft_prefer") {
        const entry = evidence.preferenceCoverage.get(c.layerId) ?? { coveredTime: 0, byTrust: {} };
        entry.coveredTime += edge.baseTime;
        entry.byTrust[c.trustState] = (entry.byTrust[c.trustState] ?? 0) + edge.baseTime;
        evidence.preferenceCoverage.set(c.layerId, entry);
      }
    }
  }

  return {
    kind: "ok",
    nodeIds,
    edges,
    durationS: Math.round(durationS),
    distanceM: Math.round(distanceM),
    hardAvoidRelaxed: false,
    evidence,
  };
}
