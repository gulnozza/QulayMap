/**
 * Scoring/search tests — these guard the product promises:
 *  - "Must avoid" really excludes (and relaxation is explicit, never silent)
 *  - the Fastest ↔ Best-matched slider actually changes outcomes
 *  - trust weighting: stale/unverified data influences cost less
 *  - rewards can discount an edge but never make it free (floor)
 *  - wheelchair barriers are never relaxed
 */

import { describe, expect, it } from "vitest";
import {
  edgeCost,
  findRoute,
  TRUST_WEIGHT,
  type EdgeCondition,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type RoutePreferences,
} from "@/lib/routing/astar";
import { canTransition } from "@/lib/data/store";

// ---------------------------------------------------------------------------
// Fixture: two ways from A(1) to D(4)
//   top:    A -e1-> B -e2-> D   (120s + 120s)
//   bottom: A -e3-> C -e4-> D   (100s + 100s)
// Coordinates are tiny so the haversine heuristic stays admissible.
// ---------------------------------------------------------------------------

const nodes: GraphNode[] = [
  { id: 1, lng: 0, lat: 0 },
  { id: 2, lng: 0.001, lat: 0.0005 },
  { id: 3, lng: 0.001, lat: -0.0005 },
  { id: 4, lng: 0.002, lat: 0 },
  { id: 5, lng: 0.01, lat: 0.01 }, // isolated
];

function edge(
  id: number,
  from: number,
  to: number,
  baseTime: number,
  wheelchairOk = true,
): GraphEdge {
  const a = nodes.find((n) => n.id === from)!;
  const b = nodes.find((n) => n.id === to)!;
  return {
    id,
    from,
    to,
    baseTime,
    lengthM: baseTime, // ~1 m/s, irrelevant to scoring
    wheelchairOk,
    geometry: [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ],
  };
}

function makeGraph(edges: GraphEdge[], conditions: EdgeCondition[]): Graph {
  const adjacency = new Map<number, GraphEdge[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from);
    if (list) list.push(e);
    else adjacency.set(e.from, [e]);
  }
  const condMap = new Map<number, EdgeCondition[]>();
  for (const c of conditions) {
    const list = condMap.get(c.edgeId);
    if (list) list.push(c);
    else condMap.set(c.edgeId, [c]);
  }
  return { nodes: new Map(nodes.map((n) => [n.id, n])), adjacency, conditions: condMap };
}

const cond = (
  edgeId: number,
  layerId: string,
  behavior: EdgeCondition["behavior"],
  trustState: EdgeCondition["trustState"] = "org_reviewed",
  severity = 1,
): EdgeCondition => ({
  edgeId,
  layerId,
  featureId: `f-${layerId}-${edgeId}`,
  behavior,
  severity,
  trustState,
  observedAt: "2026-08-01T00:00:00Z",
});

const prefs = (over: Partial<RoutePreferences> = {}): RoutePreferences => ({
  mode: "walking",
  mustAvoidLayerIds: new Set(),
  preferLayerIds: new Set(),
  preferenceStrength: 0,
  ...over,
});

const baseEdges = () => [
  edge(1, 1, 2, 120),
  edge(2, 2, 4, 120),
  edge(3, 1, 3, 100),
  edge(4, 3, 4, 100),
];

describe("preference slider (Fastest ↔ Best matched)", () => {
  const lighting = [cond(1, "lighting", "soft_prefer"), cond(2, "lighting", "soft_prefer")];

  it("strength 0 takes the fastest path even with prefers selected", () => {
    const g = makeGraph(baseEdges(), lighting);
    const r = findRoute(g, 1, 4, prefs({ preferLayerIds: new Set(["lighting"]), preferenceStrength: 0 }));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.nodeIds).toEqual([1, 3, 4]); // bottom, 200s
      expect(r.durationS).toBe(200);
    }
  });

  it("strength 1 flips to the preferred (lit) path", () => {
    const g = makeGraph(baseEdges(), lighting);
    const r = findRoute(g, 1, 4, prefs({ preferLayerIds: new Set(["lighting"]), preferenceStrength: 1 }));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.nodeIds).toEqual([1, 2, 4]); // top
      expect(r.durationS).toBe(240); // durationS reports real time, not discounted cost
      expect(r.evidence.preferenceCoverage.get("lighting")?.coveredTime).toBe(240);
    }
  });
});

describe("hard avoid", () => {
  it("never routes through a must-avoid edge when an alternative exists", () => {
    const g = makeGraph(baseEdges(), [cond(3, "construction", "hard_avoid")]);
    const r = findRoute(g, 1, 4, prefs({ mustAvoidLayerIds: new Set(["construction"]) }));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.nodeIds).toEqual([1, 2, 4]);
      expect(r.edges.map((e) => e.id)).not.toContain(3);
      expect(r.hardAvoidRelaxed).toBe(false);
    }
  });

  it("relaxes explicitly (flagged) when no clean path exists", () => {
    const g = makeGraph(baseEdges(), [
      cond(1, "construction", "hard_avoid"),
      cond(3, "construction", "hard_avoid"),
    ]);
    const r = findRoute(g, 1, 4, prefs({ mustAvoidLayerIds: new Set(["construction"]) }));
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.hardAvoidRelaxed).toBe(true);
  });

  it("ignores hard_avoid conditions on layers the user did not select", () => {
    const g = makeGraph(baseEdges(), [cond(3, "construction", "hard_avoid")]);
    const r = findRoute(g, 1, 4, prefs());
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.nodeIds).toEqual([1, 3, 4]); // still fastest
  });
});

describe("trust weighting", () => {
  it("needs_recheck data discounts far less than org_reviewed", () => {
    const e = edge(9, 1, 2, 100);
    const p = prefs({ preferLayerIds: new Set(["lighting"]), preferenceStrength: 1 });
    const reviewed = edgeCost(e, [cond(9, "lighting", "soft_prefer", "org_reviewed")], p);
    const stale = edgeCost(e, [cond(9, "lighting", "soft_prefer", "needs_recheck")], p);
    expect(reviewed).toBe(100 - 100 * 0.5 * TRUST_WEIGHT.org_reviewed); // 50
    expect(stale).toBe(100 - 100 * 0.5 * TRUST_WEIGHT.needs_recheck); // 87.5
    expect(Number(stale)).toBeGreaterThan(Number(reviewed));
  });

  it("community_submitted counts at reduced weight", () => {
    expect(TRUST_WEIGHT.community_submitted).toBeLessThan(TRUST_WEIGHT.org_reviewed);
    expect(TRUST_WEIGHT.needs_recheck).toBeLessThan(TRUST_WEIGHT.community_submitted);
  });
});

describe("cost floor", () => {
  it("stacked rewards can never push an edge below 0.3 * base_time", () => {
    const e = edge(9, 1, 2, 120);
    const p = prefs({ preferLayerIds: new Set(["lighting", "activity"]), preferenceStrength: 1 });
    const c = edgeCost(
      e,
      [cond(9, "lighting", "soft_prefer"), cond(9, "activity", "soft_prefer")],
      p,
    );
    expect(c).toBe(120 * 0.3); // raw would be 0
  });
});

describe("wheelchair mode", () => {
  it("excludes edges with steps and never relaxes them", () => {
    // Only the bottom path exists, and it has steps
    const g = makeGraph([edge(3, 1, 3, 100, false), edge(4, 3, 4, 100, false)], []);
    const walking = findRoute(g, 1, 4, prefs());
    const wheelchair = findRoute(g, 1, 4, prefs({ mode: "wheelchair" }));
    expect(walking.kind).toBe("ok");
    expect(wheelchair.kind).toBe("no_path"); // not silently relaxed
  });
});

describe("no path", () => {
  it("returns no_path for a disconnected destination", () => {
    const g = makeGraph(baseEdges(), []);
    expect(findRoute(g, 1, 5, prefs()).kind).toBe("no_path");
  });
});

describe("moderation state machine", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("draft", "submitted")).toBe(true);
    expect(canTransition("submitted", "under_review")).toBe(true);
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(canTransition("under_review", "rejected")).toBe(true);
    expect(canTransition("approved", "published")).toBe(true);
  });

  it("blocks illegal transitions", () => {
    expect(canTransition("published", "approved")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("submitted", "published")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
  });
});
