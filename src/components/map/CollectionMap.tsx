"use client";

/**
 * CollectionMap — the heart of the public experience.
 * MapLibre map + layer toggles + place cards + contribute flow + the
 * route-preference engine UI (Must avoid / Prefer / tradeoff slider,
 * two comparable routes with structured explanations).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Map as MLMap, MapMouseEvent, Marker } from "maplibre-gl";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TrustBadge } from "@/components/TrustBadge";
import type { RouteOption, TrustState } from "@/types/domain";

// ---------------------------------------------------------------------------
// Types for the collection API payload
// ---------------------------------------------------------------------------

interface ApiLayer {
  id: string;
  slug: string;
  titles: { uz: string; ru: string; en: string };
  kind: string;
  routingBehavior: string;
  style: { colorToken: string; icon: string };
}

interface ApiFeatureProps {
  layerId: string;
  name: string | null;
  trustState: TrustState;
  observedAt: string;
  source: string;
  isDemo: boolean;
  attributes: Record<string, unknown>;
}

interface ApiFeature {
  type: "Feature";
  id: string;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
  properties: ApiFeatureProps;
}

interface CollectionPayload {
  collection: {
    slug: string;
    title: string;
    emoji: string;
    description: { uz: string; ru: string; en: string };
    organization: { name: string; verifiedAt: string | null };
  };
  layers: ApiLayer[];
  features: { type: "FeatureCollection"; features: ApiFeature[] };
}

const TOKEN_COLOR: Record<string, string> = {
  info: "#2563eb",
  positive: "#1f9d55",
  danger: "#dc2626",
  brand: "#d4bc00", // brand yellow darkened for map legibility
  warning: "#d97706",
};

const PILOT_CENTER: [number, number] = [69.252, 41.307];

const OSM_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "osm", type: "raster" as const, source: "osm" },
  ],
};

type PanelMode = "explore" | "route" | "contribute";
type Picking = "origin" | "dest" | "position" | null;

export function CollectionMap({ slug }: { slug: string }) {
  const { t, locale } = useI18n();

  // Data
  const [data, setData] = useState<CollectionPayload | null>(null);
  const [dataError, setDataError] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  // Panel + picking
  const [mode, setMode] = useState<PanelMode>("explore");
  const [picking, setPicking] = useState<Picking>(null);
  const pickingRef = useRef<Picking>(null);
  pickingRef.current = picking;

  // Route state
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [dest, setDest] = useState<[number, number] | null>(null);
  const [travelMode, setTravelMode] = useState<"walking" | "wheelchair">("walking");
  const [mustAvoid, setMustAvoid] = useState<Set<string>>(new Set(["construction"]));
  const [prefer, setPrefer] = useState<Set<string>>(new Set());
  const [strength, setStrength] = useState(0.65);
  const [routes, setRoutes] = useState<RouteOption[] | null>(null);
  const [samePath, setSamePath] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<"preferred" | "fastest">("preferred");

  // Contribute state
  const [cPos, setCPos] = useState<[number, number] | null>(null);
  const [cLayer, setCLayer] = useState<string>("");
  const [cName, setCName] = useState("");
  const [cNote, setCNote] = useState("");
  const [cDate, setCDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cState, setCState] = useState<"idle" | "sending" | "ok" | "err">("idle");

  // Map refs
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<{ origin?: Marker; dest?: Marker; pos?: Marker }>({});
  const layersAddedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Fetch collection
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setDataError(false);
    fetch(`/api/collections/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: CollectionPayload) => {
        if (cancelled) return;
        setData(payload);
        setVisibleLayers(new Set(payload.layers.map((l) => l.id)));
        setCLayer(payload.layers.find((l) => l.kind === "resource")?.id ?? payload.layers[0]?.id ?? "");
      })
      .catch(() => !cancelled && setDataError(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // -------------------------------------------------------------------------
  // Map init
  // -------------------------------------------------------------------------
  useEffect(() => {
    let disposed = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (disposed || !containerRef.current || mapRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_RASTER_STYLE,
        center: PILOT_CENTER,
        zoom: 13.4,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("click", (e: MapMouseEvent) => {
        const p = pickingRef.current;
        if (!p) return;
        const ll: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (p === "origin") {
          setOrigin(ll);
          setPicking("dest");
        } else if (p === "dest") {
          setDest(ll);
          setPicking(null);
        } else if (p === "position") {
          setCPos(ll);
          setPicking(null);
        }
      });
      mapRef.current = map;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Add data layers once map + data are ready
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data || layersAddedRef.current) return;

    const add = () => {
      if (layersAddedRef.current) return;
      layersAddedRef.current = true;

      for (const layer of data.layers) {
        const color = TOKEN_COLOR[layer.style.colorToken] ?? "#17181c";
        const feats = data.features.features.filter(
          (f) => f.properties.layerId === layer.id,
        );
        const fc = {
          type: "FeatureCollection" as const,
          features: feats.map((f) => ({
            ...f,
            properties: { ...f.properties, fid: f.id },
          })),
        };
        map.addSource(`src-${layer.id}`, { type: "geojson", data: fc });

        const lineFeats = feats.some((f) => f.geometry.type === "LineString");
        const pointFeats = feats.some((f) => f.geometry.type === "Point");

        if (lineFeats) {
          map.addLayer({
            id: `lyr-line-${layer.id}`,
            type: "line",
            source: `src-${layer.id}`,
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
              "line-color": color,
              "line-width": 5,
              "line-opacity": 0.85,
              ...(layer.routingBehavior === "hard_avoid"
                ? { "line-dasharray": [1.2, 1.2] }
                : {}),
            },
          });
        }
        if (pointFeats) {
          map.addLayer({
            id: `lyr-pt-${layer.id}`,
            type: "circle",
            source: `src-${layer.id}`,
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 8,
              "circle-color": color,
              "circle-stroke-width": 2.5,
              "circle-stroke-color": "#ffffff",
            },
          });
        }
        for (const lid of [`lyr-line-${layer.id}`, `lyr-pt-${layer.id}`]) {
          if (!map.getLayer(lid)) continue;
          map.on("click", lid, (e) => {
            if (pickingRef.current) return; // picking wins over selection
            const fid = e.features?.[0]?.properties?.fid as string | undefined;
            if (fid) setSelectedFeatureId(fid);
          });
          map.on("mouseenter", lid, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", lid, () => (map.getCanvas().style.cursor = ""));
        }
      }

      // Route sources/layers (empty until a route is requested)
      const emptyLine = {
        type: "FeatureCollection" as const,
        features: [] as GeoJSON.Feature[],
      };
      map.addSource("route-fastest", { type: "geojson", data: emptyLine });
      map.addLayer({
        id: "route-fastest",
        type: "line",
        source: "route-fastest",
        paint: { "line-color": "#7c7f87", "line-width": 4, "line-opacity": 0.85 },
      });
      map.addSource("route-preferred", { type: "geojson", data: emptyLine });
      map.addLayer({
        id: "route-preferred-casing",
        type: "line",
        source: "route-preferred",
        paint: { "line-color": "#ffffff", "line-width": 9 },
      });
      map.addLayer({
        id: "route-preferred",
        type: "line",
        source: "route-preferred",
        paint: { "line-color": "#17181c", "line-width": 5.5 },
      });
    };

    if (map.isStyleLoaded()) add();
    else map.once("load", add);
  }, [data]);

  // Layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data || !layersAddedRef.current) return;
    for (const layer of data.layers) {
      const vis = visibleLayers.has(layer.id) ? "visible" : "none";
      for (const lid of [`lyr-line-${layer.id}`, `lyr-pt-${layer.id}`]) {
        if (map.getLayer(lid)) map.setLayoutProperty(lid, "visibility", vis);
      }
    }
  }, [visibleLayers, data]);

  // Origin/dest/contribute markers
  useEffect(() => {
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      const maplibregl = await import("maplibre-gl");
      const sync = (
        key: "origin" | "dest" | "pos",
        ll: [number, number] | null,
        color: string,
      ) => {
        markersRef.current[key]?.remove();
        markersRef.current[key] = undefined;
        if (ll) {
          markersRef.current[key] = new maplibregl.Marker({ color })
            .setLngLat(ll)
            .addTo(map);
        }
      };
      sync("origin", origin, "#17181c");
      sync("dest", dest, "#fce000");
      sync("pos", cPos, "#2563eb");
    })();
  }, [origin, dest, cPos]);

  // Draw routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersAddedRef.current) return;
    const empty = { type: "FeatureCollection" as const, features: [] };
    const asFC = (r?: RouteOption) =>
      r
        ? {
            type: "FeatureCollection" as const,
            features: [{ type: "Feature" as const, properties: {}, geometry: r.geometry }],
          }
        : empty;
    const preferred = routes?.find((r) => r.id === activeRoute) ?? routes?.[0];
    const alternate = routes?.find((r) => r.id !== (preferred?.id ?? "preferred"));
    (map.getSource("route-preferred") as maplibregl.GeoJSONSource | undefined)?.setData(
      asFC(preferred) as GeoJSON.FeatureCollection,
    );
    (map.getSource("route-fastest") as maplibregl.GeoJSONSource | undefined)?.setData(
      asFC(alternate) as GeoJSON.FeatureCollection,
    );
  }, [routes, activeRoute]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const requestRoutes = useCallback(async () => {
    if (!origin || !dest) return;
    setRouteLoading(true);
    setRouteError(null);
    setRoutes(null);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { lng: origin[0], lat: origin[1] },
          destination: { lng: dest[0], lat: dest[1] },
          mode: travelMode,
          mustAvoidLayerIds: [...mustAvoid],
          preferLayerIds: [...prefer],
          preferenceStrength: strength,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setRouteError(
          body?.error?.code === "outside_pilot_area"
            ? t.route.outsidePilot
            : body?.error?.code === "no_path"
              ? t.route.noPath
              : t.map.error,
        );
        return;
      }
      setRoutes(body.routes as RouteOption[]);
      setSamePath(Boolean(body.samePath));
      setActiveRoute("preferred");
    } catch {
      setRouteError(t.map.error);
    } finally {
      setRouteLoading(false);
    }
  }, [origin, dest, travelMode, mustAvoid, prefer, strength, t]);

  const resetRoute = useCallback(() => {
    setOrigin(null);
    setDest(null);
    setRoutes(null);
    setRouteError(null);
    setPicking(null);
  }, []);

  const submitContribution = useCallback(async () => {
    if (!cPos || !cLayer) return;
    setCState("sending");
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layerId: cLayer,
          featureId: null,
          geometry: { type: "Point", coordinates: cPos },
          attributes: { name: cName },
          note: cNote || undefined,
          observedAt: new Date(`${cDate}T12:00:00Z`).toISOString(),
          photoPaths: [],
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setCState("ok");
      setCName("");
      setCNote("");
      setCPos(null);
    } catch {
      setCState("err");
    }
  }, [cPos, cLayer, cName, cNote, cDate]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const selectedFeature = useMemo(
    () => data?.features.features.find((f) => f.id === selectedFeatureId) ?? null,
    [data, selectedFeatureId],
  );

  const routeLayers = useMemo(
    () =>
      data?.layers.filter((l) =>
        ["hard_avoid", "soft_avoid", "soft_prefer"].includes(l.routingBehavior),
      ) ?? [],
    [data],
  );
  const avoidable = routeLayers.filter((l) =>
    ["hard_avoid", "soft_avoid"].includes(l.routingBehavior),
  );
  const preferable = routeLayers.filter((l) => l.routingBehavior === "soft_prefer");

  const fmtDuration = (s: number) => `${Math.max(1, Math.round(s / 60))} ${t.route.min}`;
  const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (dataError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="rounded-2xl bg-surface px-5 py-4 text-sm font-medium text-danger shadow-card">
          {t.map.error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* ------------------------------------------------ Left rail / panel */}
      <div className="order-2 flex max-h-[55vh] w-full flex-col gap-3 overflow-y-auto bg-surface-dim p-3 lg:order-1 lg:max-h-none lg:w-[400px] lg:shrink-0">
        {!data ? (
          <p className="p-2 text-sm text-ink-soft" role="status">
            {t.map.loading}
          </p>
        ) : (
          <>
            {/* Collection header */}
            <div className="rounded-3xl bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight">
                    <span aria-hidden>{data.collection.emoji}</span> {data.collection.title}
                  </h1>
                  <p className="mt-1 text-xs font-bold text-ink-soft">
                    {data.collection.organization.name}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {data.collection.description[locale]}
              </p>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-2" role="tablist" aria-label={t.route.title}>
              {(
                [
                  ["explore", t.map.layers],
                  ["route", t.route.title],
                  ["contribute", t.map.addPlace],
                ] as [PanelMode, string][]
              ).map(([m, label]) => (
                <Chip
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  active={mode === m}
                  onClick={() => {
                    setMode(m);
                    setPicking(null);
                  }}
                >
                  {label}
                </Chip>
              ))}
            </div>

            {/* ---------------------------------------------------- Explore */}
            {mode === "explore" && (
              <div className="rounded-3xl bg-surface p-4 shadow-card">
                <h2 className="mb-3 text-sm font-extrabold">{t.map.layers}</h2>
                <div className="flex flex-wrap gap-2">
                  {data.layers.map((l) => (
                    <Chip
                      key={l.id}
                      active={visibleLayers.has(l.id)}
                      tone={
                        l.routingBehavior === "hard_avoid"
                          ? "danger"
                          : l.routingBehavior === "soft_prefer"
                            ? "brand"
                            : "info"
                      }
                      onClick={() =>
                        setVisibleLayers((prev) => {
                          const next = new Set(prev);
                          if (next.has(l.id)) next.delete(l.id);
                          else next.add(l.id);
                          return next;
                        })
                      }
                    >
                      {l.titles[locale]}
                    </Chip>
                  ))}
                </div>
                {data.features.features.length === 0 && (
                  <p className="mt-3 text-sm text-ink-soft">{t.map.empty}</p>
                )}
              </div>
            )}

            {/* ------------------------------------------------------ Route */}
            {mode === "route" && (
              <div className="flex flex-col gap-3">
                <div className="rounded-3xl bg-surface p-4 shadow-card">
                  <h2 className="mb-3 text-sm font-extrabold">{t.route.planRoute}</h2>

                  <div className="mb-3 flex flex-col gap-2">
                    <Button
                      variant={origin ? "ghost" : "ink"}
                      onClick={() => setPicking("origin")}
                      aria-pressed={picking === "origin"}
                    >
                      {origin ? `A · ${origin[1].toFixed(4)}, ${origin[0].toFixed(4)}` : t.route.pickOrigin}
                    </Button>
                    <Button
                      variant={dest ? "ghost" : "ink"}
                      onClick={() => setPicking("dest")}
                      aria-pressed={picking === "dest"}
                      disabled={!origin && picking !== "dest"}
                    >
                      {dest ? `B · ${dest[1].toFixed(4)}, ${dest[0].toFixed(4)}` : t.route.pickDest}
                    </Button>
                  </div>

                  <fieldset className="mb-3">
                    <legend className="mb-1.5 text-xs font-extrabold text-ink-soft">
                      {t.route.mode}
                    </legend>
                    <div className="flex gap-2">
                      <Chip active={travelMode === "walking"} onClick={() => setTravelMode("walking")}>
                        {t.route.walking}
                      </Chip>
                      <Chip
                        active={travelMode === "wheelchair"}
                        onClick={() => setTravelMode("wheelchair")}
                      >
                        {t.route.wheelchair}
                      </Chip>
                    </div>
                  </fieldset>

                  {avoidable.length > 0 && (
                    <fieldset className="mb-3">
                      <legend className="mb-1.5 text-xs font-extrabold text-danger">
                        {t.route.mustAvoid}
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {avoidable.map((l) => (
                          <Chip
                            key={l.id}
                            tone="danger"
                            active={mustAvoid.has(l.id)}
                            onClick={() =>
                              setMustAvoid((prev) => {
                                const next = new Set(prev);
                                if (next.has(l.id)) next.delete(l.id);
                                else next.add(l.id);
                                return next;
                              })
                            }
                          >
                            {l.titles[locale]}
                          </Chip>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {preferable.length > 0 && (
                    <fieldset className="mb-3">
                      <legend className="mb-1.5 text-xs font-extrabold text-info">
                        {t.route.prefer}
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {preferable.map((l) => (
                          <Chip
                            key={l.id}
                            tone="brand"
                            active={prefer.has(l.id)}
                            onClick={() =>
                              setPrefer((prev) => {
                                const next = new Set(prev);
                                if (next.has(l.id)) next.delete(l.id);
                                else next.add(l.id);
                                return next;
                              })
                            }
                          >
                            {l.titles[locale]}
                          </Chip>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  <label className="mb-1 block text-xs font-extrabold text-ink-soft" htmlFor="strength">
                    {t.route.fastest} ↔ {t.route.bestMatch}
                  </label>
                  <input
                    id="strength"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={strength}
                    onChange={(e) => setStrength(Number(e.target.value))}
                    className="qm-slider mb-4"
                  />

                  <div className="flex gap-2">
                    <Button onClick={requestRoutes} disabled={!origin || !dest || routeLoading}>
                      {routeLoading ? t.route.computing : t.route.getRoutes}
                    </Button>
                    <Button variant="ghost" onClick={resetRoute}>
                      {t.route.reset}
                    </Button>
                  </div>
                  {routeError && (
                    <p role="alert" className="mt-3 text-sm font-medium text-danger">
                      {routeError}
                    </p>
                  )}
                </div>

                {routes?.map((r) => {
                  const isActive = r.id === activeRoute || routes.length === 1;
                  const lighting = r.explanation.preferenceCoverage.find(
                    (p) => p.layerSlug === "lighting",
                  );
                  const avoided = r.explanation.avoided.reduce((n, a) => n + a.count, 0);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setActiveRoute(r.id)}
                      className={`rounded-3xl bg-surface p-4 text-left shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
                        isActive ? "ring-2 ring-ink" : "opacity-80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-extrabold">
                          <span
                            aria-hidden
                            className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                              isActive ? "bg-ink" : "bg-route-b"
                            }`}
                          />
                          {r.id === "preferred" ? t.route.preferred : t.route.fastestCard}
                        </p>
                        <p className="text-sm font-extrabold">
                          {fmtDuration(r.durationS)} · {fmtDist(r.distanceM)}
                        </p>
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-ink-soft">
                        {r.id === "preferred" && samePath && <p>{t.route.sameRoute}</p>}
                        {r.id === "preferred" && !samePath && <p>{t.route.matchedNote}</p>}
                        {avoided > 0 && (
                          <p className="font-bold text-danger">
                            {avoided} {t.route.avoidsConstruction}
                          </p>
                        )}
                        {lighting && lighting.coveragePct > 0 && (
                          <p className="font-bold text-info">
                            {lighting.coveragePct}% {t.route.lightingCoverage}
                          </p>
                        )}
                        {r.hardAvoidRelaxed && (
                          <p role="alert" className="font-bold text-warning">
                            {t.route.relaxedWarning}
                          </p>
                        )}
                      </div>

                      <details className="mt-2 text-xs text-ink-soft">
                        <summary className="cursor-pointer font-bold">
                          {t.route.whyRoute}
                        </summary>
                        <div className="mt-1 space-y-1">
                          <p>
                            {t.route.freshness}:{" "}
                            {r.explanation.dataFreshness.oldestObservedAt
                              ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }).format(
                                  new Date(r.explanation.dataFreshness.oldestObservedAt),
                                )
                              : "—"}
                          </p>
                          {r.explanation.dataFreshness.needsRecheckSegments > 0 && (
                            <p>
                              {r.explanation.dataFreshness.needsRecheckSegments}{" "}
                              {t.route.recheckSegments}
                            </p>
                          )}
                        </div>
                      </details>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ------------------------------------------------- Contribute */}
            {mode === "contribute" && (
              <div className="rounded-3xl bg-surface p-4 shadow-card">
                <h2 className="mb-1 text-sm font-extrabold">{t.contribute.title}</h2>
                <p className="mb-3 text-xs text-ink-soft">{t.contribute.rules}</p>

                <div className="flex flex-col gap-3">
                  <Button
                    variant={cPos ? "ghost" : "ink"}
                    onClick={() => setPicking("position")}
                    aria-pressed={picking === "position"}
                  >
                    {cPos ? `📍 ${t.contribute.positionSet}` : t.contribute.position}
                  </Button>

                  <label className="text-xs font-extrabold text-ink-soft">
                    {t.contribute.layer}
                    <select
                      value={cLayer}
                      onChange={(e) => setCLayer(e.target.value)}
                      className="mt-1 block w-full rounded-2xl border border-surface-dim bg-surface px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    >
                      {data.layers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.titles[locale]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-extrabold text-ink-soft">
                    {t.contribute.name}
                    <input
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      className="mt-1 block w-full rounded-2xl border border-surface-dim bg-surface px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    />
                  </label>

                  <label className="text-xs font-extrabold text-ink-soft">
                    {t.contribute.note}
                    <textarea
                      value={cNote}
                      onChange={(e) => setCNote(e.target.value)}
                      rows={2}
                      className="mt-1 block w-full rounded-2xl border border-surface-dim bg-surface px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    />
                  </label>

                  <label className="text-xs font-extrabold text-ink-soft">
                    {t.contribute.observedAt}
                    <input
                      type="date"
                      value={cDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setCDate(e.target.value)}
                      className="mt-1 block w-full rounded-2xl border border-surface-dim bg-surface px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    />
                  </label>

                  <Button
                    onClick={submitContribution}
                    disabled={!cPos || !cLayer || cState === "sending"}
                  >
                    {cState === "sending" ? t.contribute.submitting : t.contribute.submit}
                  </Button>
                  {cState === "ok" && (
                    <p role="status" className="text-sm font-bold text-positive">
                      {t.contribute.success}
                    </p>
                  )}
                  {cState === "err" && (
                    <p role="alert" className="text-sm font-bold text-danger">
                      {t.contribute.error}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* --------------------------------------------- Selected place */}
            {selectedFeature && (
              <div className="rounded-3xl bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-extrabold leading-tight">
                    {selectedFeature.properties.name ?? "—"}
                  </h3>
                  <button
                    onClick={() => setSelectedFeatureId(null)}
                    aria-label="Close"
                    className="rounded-full px-2 text-lg font-bold text-ink-soft hover:bg-surface-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TrustBadge
                    trustState={selectedFeature.properties.trustState}
                    observedAt={selectedFeature.properties.observedAt}
                  />
                  {selectedFeature.properties.isDemo && (
                    <span className="rounded-full bg-surface-dim px-2.5 py-1 text-[11px] font-bold text-ink-soft">
                      {t.trust.demo}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  {t.trust.source}: {selectedFeature.properties.source}
                </p>
                {selectedFeature.geometry.type === "Point" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="ink"
                      onClick={() => {
                        setMode("route");
                        setDest(
                          (selectedFeature.geometry as { coordinates: [number, number] })
                            .coordinates,
                        );
                        if (!origin) setPicking("origin");
                      }}
                    >
                      {t.map.routeHere}
                    </Button>
                    <Button variant="ghost" onClick={() => setMode("contribute")}>
                      {t.map.suggest}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <p className="px-2 pb-2 text-[11px] leading-relaxed text-ink-soft">{t.footer}</p>
          </>
        )}
      </div>

      {/* --------------------------------------------------------------- Map */}
      <div className="relative order-1 h-[45vh] min-h-[280px] flex-1 lg:order-2 lg:h-auto">
        <div ref={containerRef} className="absolute inset-0" />
        {picking && (
          <p
            role="status"
            className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-brand shadow-float"
          >
            {picking === "origin"
              ? t.route.pickOrigin
              : picking === "dest"
                ? t.route.pickDest
                : t.contribute.position}
          </p>
        )}
      </div>
    </div>
  );
}

// maplibre types used above without importing the runtime module
declare namespace maplibregl {
  interface GeoJSONSource {
    setData(data: GeoJSON.FeatureCollection | GeoJSON.Feature | string): void;
  }
}
