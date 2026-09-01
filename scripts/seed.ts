/**
 * Seeds a real Supabase project with the pilot dataset (collections, layers,
 * demo-labeled features) and the routing graph.
 *
 * Usage:
 *   1. Run supabase/migrations/0001_init.sql against your project
 *   2. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   3. npm run seed
 *
 * Demo mode (no env vars) needs no seeding — the app bundles this dataset.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  demoCollections,
  demoFeatures,
  demoLayers,
  LAYER_TITLES,
} from "../src/lib/data/demo-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Demo mode needs no seed — this script is only for a real Supabase project.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey);

const wkt = (g: { type: string; coordinates: unknown }): string => {
  if (g.type === "Point") {
    const [lng, lat] = g.coordinates as [number, number];
    return `SRID=4326;POINT(${lng} ${lat})`;
  }
  const coords = (g.coordinates as [number, number][])
    .map(([lng, lat]) => `${lng} ${lat}`)
    .join(", ");
  return `SRID=4326;LINESTRING(${coords})`;
};

async function main() {
  // Organizations
  const orgIds = new Map<string, string>();
  for (const name of ["Access Tashkent", "Care Collective UZ"]) {
    const { data, error } = await db
      .from("organizations")
      .upsert({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), verified_at: new Date().toISOString() }, { onConflict: "slug" })
      .select("id")
      .single();
    if (error) throw error;
    orgIds.set(name, data.id);
  }

  // Collections + layers
  const layerIds = new Map<string, string>();
  for (const c of demoCollections) {
    const { data: col, error } = await db
      .from("collections")
      .upsert(
        {
          slug: c.slug,
          title: c.title,
          description: c.description,
          emoji: c.emoji,
          organization_id: orgIds.get(c.organization.name),
          is_public: true,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw error;

    for (const l of demoLayers.filter((l) => l.collectionSlug === c.slug)) {
      const { data: layer, error: le } = await db
        .from("layers")
        .upsert(
          {
            collection_id: col.id,
            slug: l.slug,
            titles: LAYER_TITLES[l.titleKey],
            kind: l.kind,
            routing_behavior: l.routingBehavior,
            style: l.style,
          },
          { onConflict: "collection_id,slug" },
        )
        .select("id")
        .single();
      if (le) throw le;
      layerIds.set(l.id, layer.id);
    }
  }

  // Features (all demo-labeled)
  for (const f of demoFeatures) {
    const { error } = await db.from("map_features").upsert(
      {
        layer_id: layerIds.get(f.layerId),
        geom: wkt(f.geometry),
        name: f.name,
        attributes: f.attributes,
        trust_state: f.trustState,
        observed_at: f.observedAt,
        source: f.source,
        is_demo: true,
        status: "published",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  // Routing graph
  const graph = JSON.parse(
    readFileSync(resolve(__dirname, "../src/data/demo/graph.json"), "utf8"),
  ) as {
    nodes: { id: number; lng: number; lat: number }[];
    edges: {
      id: number; from: number; to: number; lengthM: number; baseTime: number;
      wheelchairOk: boolean; geometry: [number, number][];
    }[];
    conditions: {
      edgeId: number; layerId: string; featureId: string; behavior: string;
      severity: number; trustState: string; observedAt: string;
    }[];
  };

  for (const n of graph.nodes) {
    const { error } = await db.from("route_nodes").upsert(
      { id: n.id, geom: `SRID=4326;POINT(${n.lng} ${n.lat})` },
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  for (const e of graph.edges) {
    const { error } = await db.from("route_edges").upsert(
      {
        id: e.id,
        from_node: e.from,
        to_node: e.to,
        length_m: e.lengthM,
        base_time_s: e.baseTime,
        wheelchair_ok: e.wheelchairOk,
        geom: wkt({ type: "LineString", coordinates: e.geometry }),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  for (const c of graph.conditions) {
    const { error } = await db.from("edge_conditions").insert({
      edge_id: c.edgeId,
      layer_id: layerIds.get(c.layerId),
      behavior: c.behavior,
      severity: c.severity,
      trust_state: c.trustState,
      observed_at: c.observedAt,
    });
    if (error && !error.message.includes("duplicate")) throw error;
  }

  console.log(
    `Seeded: ${demoCollections.length} collections, ${demoLayers.length} layers, ` +
      `${demoFeatures.length} features, ${graph.nodes.length} nodes, ` +
      `${graph.edges.length} edges, ${graph.conditions.length} conditions`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
