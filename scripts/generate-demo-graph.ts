/**
 * Generates the bundled demo pedestrian graph for the Tashkent pilot area.
 * Deterministic (seeded), so the committed JSON is reproducible:
 *   npm run generate:graph
 *
 * In production this is replaced by scripts/import-graph.ts over a real OSM
 * extract (docs/05-ROUTING-ENGINE.md §1). The demo graph exists so the app is
 * fully workable with zero external setup.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Pilot bbox (lng/lat) — matches src/lib/data/demo-data.ts PILOT_BBOX
const LNG0 = 69.24;
const LAT0 = 41.298;
const COLS = 9; // lng steps
const ROWS = 10; // lat steps
const DLNG = 0.003; // ~250 m
const DLAT = 0.002; // ~222 m
const WALK_SPEED = 1.33; // m/s

// Tiny deterministic PRNG (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(41_2995);

const toRad = (d: number) => (d * Math.PI) / 180;
function haversineM(aLng: number, aLat: number, bLng: number, bLat: number) {
  const R = 6_371_000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface JsonNode { id: number; lng: number; lat: number }
interface JsonEdge {
  id: number; from: number; to: number; lengthM: number; baseTime: number;
  wheelchairOk: boolean; geometry: [number, number][];
}
interface JsonCondition {
  edgeId: number; layerId: string; featureId: string;
  behavior: "hard_avoid" | "soft_avoid" | "soft_prefer";
  severity: number;
  trustState: "community_submitted" | "org_reviewed" | "community_confirmed" | "needs_recheck";
  observedAt: string;
}

const nodes: JsonNode[] = [];
const nodeId = (c: number, r: number) => r * COLS + c;

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    // Small jitter so the grid reads as streets, not graph paper
    const jLng = (rand() - 0.5) * 0.0004;
    const jLat = (rand() - 0.5) * 0.0003;
    nodes.push({
      id: nodeId(c, r),
      lng: +(LNG0 + c * DLNG + jLng).toFixed(6),
      lat: +(LAT0 + r * DLAT + jLat).toFixed(6),
    });
  }
}
const byId = new Map(nodes.map((n) => [n.id, n]));

const edges: JsonEdge[] = [];
let eid = 1;
/** undirected pair key → the two directed edge ids, for condition mirroring */
const pairEdges = new Map<string, number[]>();

function addPair(a: number, b: number, wheelchairOk: boolean) {
  const na = byId.get(a)!;
  const nb = byId.get(b)!;
  const lengthM = Math.round(haversineM(na.lng, na.lat, nb.lng, nb.lat));
  const baseTime = +(lengthM / WALK_SPEED).toFixed(1);
  const fwd: JsonEdge = {
    id: eid++, from: a, to: b, lengthM, baseTime, wheelchairOk,
    geometry: [[na.lng, na.lat], [nb.lng, nb.lat]],
  };
  const rev: JsonEdge = {
    id: eid++, from: b, to: a, lengthM, baseTime, wheelchairOk,
    geometry: [[nb.lng, nb.lat], [na.lng, na.lat]],
  };
  edges.push(fwd, rev);
  pairEdges.set(`${Math.min(a, b)}-${Math.max(a, b)}`, [fwd.id, rev.id]);
}

// Grid streets; a few segments get steps (wheelchair_ok=false)
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (c + 1 < COLS) addPair(nodeId(c, r), nodeId(c + 1, r), rand() > 0.04);
    if (r + 1 < ROWS) addPair(nodeId(c, r), nodeId(c, r + 1), rand() > 0.04);
  }
}

const pair = (a: number, b: number) =>
  pairEdges.get(`${Math.min(a, b)}-${Math.max(a, b)}`) ?? [];

// ---------------------------------------------------------------------------
// Conditions — must stay in sync with feature ids in src/lib/data/demo-data.ts
// ---------------------------------------------------------------------------

const conditions: JsonCondition[] = [];
function condition(
  edgeIds: number[],
  layerId: JsonCondition["layerId"],
  featureId: string,
  behavior: JsonCondition["behavior"],
  trustState: JsonCondition["trustState"],
  observedAt: string,
  severity = 1,
) {
  for (const edgeId of edgeIds) {
    conditions.push({ edgeId, layerId, featureId, behavior, severity, trustState, observedAt });
  }
}

// Construction feature 1: two segments across the middle east–west corridor (row 5)
condition(
  [...pair(nodeId(3, 5), nodeId(4, 5)), ...pair(nodeId(4, 5), nodeId(5, 5))],
  "construction", "f-con-1", "hard_avoid", "org_reviewed", "2026-08-18T09:00:00Z",
);
// Construction feature 2: one north–south segment near the center
condition(
  pair(nodeId(4, 5), nodeId(4, 6)),
  "construction", "f-con-2", "hard_avoid", "community_confirmed", "2026-08-24T17:30:00Z",
);

// Lighting corridor A: row 7 (a well-lit boulevard), mostly reviewed
for (let c = 0; c < COLS - 1; c++) {
  condition(
    pair(nodeId(c, 7), nodeId(c + 1, 7)),
    "lighting", "f-light-a", "soft_prefer",
    c < 6 ? "org_reviewed" : "needs_recheck",
    c < 6 ? "2026-08-10T20:00:00Z" : "2026-05-02T20:00:00Z",
  );
}
// Lighting corridor B: column 6, community confirmed
for (let r = 2; r < 8; r++) {
  condition(
    pair(nodeId(6, r), nodeId(6, r + 1)),
    "lighting", "f-light-b", "soft_prefer", "community_confirmed", "2026-08-22T21:00:00Z",
  );
}

const out = { generatedAt: new Date("2026-08-25T00:00:00Z").toISOString(), nodes, edges, conditions };
const path = resolve(__dirname, "../src/data/demo/graph.json");
writeFileSync(path, JSON.stringify(out));
console.log(
  `wrote ${path}: ${nodes.length} nodes, ${edges.length} directed edges, ${conditions.length} conditions`,
);
