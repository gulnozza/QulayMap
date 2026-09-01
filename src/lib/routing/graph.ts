/**
 * Graph adapter: loads the bundled demo pilot graph into the shape the pure
 * A* engine expects, with a module-level cache. The Supabase-backed loader
 * (docs/05 §5) implements this same interface against route_nodes/route_edges.
 */

import graphJson from "@/data/demo/graph.json";
import { PILOT_BBOX } from "@/lib/data/demo-data";
import type {
  EdgeCondition,
  Graph,
  GraphEdge,
  GraphNode,
} from "@/lib/routing/astar";

let cached: Graph | null = null;

interface RawGraph {
  nodes: GraphNode[];
  edges: (Omit<GraphEdge, "geometry"> & { geometry: number[][] })[];
  conditions: (Omit<EdgeCondition, "behavior" | "trustState"> & {
    behavior: string;
    trustState: string;
  })[];
}

export function loadGraph(): Graph {
  if (cached) return cached;
  const raw = graphJson as unknown as RawGraph;

  const nodes = new Map<number, GraphNode>(raw.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<number, GraphEdge[]>();
  for (const e of raw.edges) {
    const edge: GraphEdge = { ...e, geometry: e.geometry as [number, number][] };
    const list = adjacency.get(edge.from);
    if (list) list.push(edge);
    else adjacency.set(edge.from, [edge]);
  }
  const conditions = new Map<number, EdgeCondition[]>();
  for (const c of raw.conditions) {
    const cond = c as unknown as EdgeCondition;
    const list = conditions.get(cond.edgeId);
    if (list) list.push(cond);
    else conditions.set(cond.edgeId, [cond]);
  }

  cached = { nodes, adjacency, conditions };
  return cached;
}

export function insidePilot(lng: number, lat: number): boolean {
  return (
    lng >= PILOT_BBOX.west &&
    lng <= PILOT_BBOX.east &&
    lat >= PILOT_BBOX.south &&
    lat <= PILOT_BBOX.north
  );
}

export function nearestNode(graph: Graph, lng: number, lat: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const n of graph.nodes.values()) {
    // Equirectangular approximation is fine at city scale for snapping
    const dx = (n.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const dy = n.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}
