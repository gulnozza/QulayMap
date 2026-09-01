/**
 * Demo dataset for zero-setup mode. Every feature is is_demo=true and labeled
 * as such in the UI — demo and verified data are never mixed silently.
 *
 * Construction/lighting feature ids (f-con-*, f-light-*) are referenced by
 * src/data/demo/graph.json edge conditions; keep them in sync with
 * scripts/generate-demo-graph.ts.
 */

import type { RoutingBehavior, TrustState } from "@/types/domain";

export const PILOT_BBOX = {
  west: 69.238,
  south: 41.296,
  east: 69.266,
  north: 41.318,
} as const;

export interface DemoLayer {
  id: string; // slug doubles as id in demo mode
  collectionSlug: string;
  slug: string;
  titleKey: string; // resolved from LAYER_TITLES per locale
  kind: "resource" | "condition" | "route_preference";
  routingBehavior: RoutingBehavior;
  style: { colorToken: "info" | "positive" | "danger" | "brand" | "warning"; icon: string };
}

export interface DemoCollection {
  id: string;
  slug: string;
  title: string;
  emoji: string;
  description: { uz: string; ru: string; en: string };
  organization: { name: string; verifiedAt: string | null };
}

export interface DemoFeature {
  id: string;
  layerId: string;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
  name: string | null;
  trustState: TrustState;
  observedAt: string;
  source: string;
  isDemo: boolean;
  attributes: Record<string, unknown>;
}

export const LAYER_TITLES: Record<string, { uz: string; ru: string; en: string }> = {
  entrances: { uz: "Kirish joylari", ru: "Входы", en: "Entrances" },
  ramps: { uz: "Pandus va liftlar", ru: "Пандусы и лифты", en: "Ramps & elevators" },
  "accessible-toilets": {
    uz: "Moslashtirilgan hojatxonalar",
    ru: "Доступные туалеты",
    en: "Accessible toilets",
  },
  obstacles: { uz: "To'siqlar", ru: "Препятствия", en: "Obstacles" },
  "public-toilets": { uz: "Jamoat hojatxonalari", ru: "Общественные туалеты", en: "Public toilets" },
  "menstrual-health": {
    uz: "Hayz gigienasi resurslari",
    ru: "Ресурсы менструального здоровья",
    en: "Menstrual-health resources",
  },
  "water-points": { uz: "Suv olish nuqtalari", ru: "Точки воды", en: "Water points" },
  construction: { uz: "Qurilish / yopiq yo'laklar", ru: "Стройка / закрытые тротуары", en: "Construction / closures" },
  lighting: { uz: "Yoritilgan ko'chalar", ru: "Освещённые улицы", en: "Lit streets" },
};

export const demoCollections: DemoCollection[] = [
  {
    id: "access-uz",
    slug: "access-uz",
    title: "Access UZ",
    emoji: "♿",
    description: {
      uz: "G'ildirakli aravachalar uchun kirishlar, panduslar, liftlar va to'siqlar.",
      ru: "Входы, пандусы, лифты и препятствия для колясок.",
      en: "Wheelchair entrances, ramps, elevators, and obstacles.",
    },
    organization: { name: "Access Tashkent", verifiedAt: "2026-06-01T00:00:00Z" },
  },
  {
    id: "care-uz",
    slug: "care-uz",
    title: "Care UZ",
    emoji: "🚻",
    description: {
      uz: "Jamoat hojatxonalari, hayz gigienasi va suv nuqtalari.",
      ru: "Общественные туалеты, менструальное здоровье и точки воды.",
      en: "Public toilets, menstrual-health resources, and water points.",
    },
    organization: { name: "Care Collective UZ", verifiedAt: "2026-07-10T00:00:00Z" },
  },
  {
    id: "street-conditions",
    slug: "street-conditions",
    title: "Street Conditions",
    emoji: "🚧",
    description: {
      uz: "Qurilish, yopiq yo'laklar va ko'cha yoritilishi — marshrutga ta'sir qiladi.",
      ru: "Стройки, закрытые тротуары и освещение — влияют на маршрут.",
      en: "Construction, closures, and street lighting — these shape routes.",
    },
    organization: { name: "Access Tashkent", verifiedAt: "2026-06-01T00:00:00Z" },
  },
];

export const demoLayers: DemoLayer[] = [
  { id: "entrances", collectionSlug: "access-uz", slug: "entrances", titleKey: "entrances", kind: "resource", routingBehavior: "informational", style: { colorToken: "info", icon: "door" } },
  { id: "ramps", collectionSlug: "access-uz", slug: "ramps", titleKey: "ramps", kind: "resource", routingBehavior: "informational", style: { colorToken: "info", icon: "ramp" } },
  { id: "accessible-toilets", collectionSlug: "access-uz", slug: "accessible-toilets", titleKey: "accessible-toilets", kind: "resource", routingBehavior: "destination_filter", style: { colorToken: "info", icon: "toilet" } },
  { id: "obstacles", collectionSlug: "access-uz", slug: "obstacles", titleKey: "obstacles", kind: "condition", routingBehavior: "soft_avoid", style: { colorToken: "warning", icon: "alert" } },
  { id: "public-toilets", collectionSlug: "care-uz", slug: "public-toilets", titleKey: "public-toilets", kind: "resource", routingBehavior: "informational", style: { colorToken: "positive", icon: "toilet" } },
  { id: "menstrual-health", collectionSlug: "care-uz", slug: "menstrual-health", titleKey: "menstrual-health", kind: "resource", routingBehavior: "informational", style: { colorToken: "positive", icon: "heart" } },
  { id: "water-points", collectionSlug: "care-uz", slug: "water-points", titleKey: "water-points", kind: "resource", routingBehavior: "informational", style: { colorToken: "positive", icon: "droplet" } },
  { id: "construction", collectionSlug: "street-conditions", slug: "construction", titleKey: "construction", kind: "condition", routingBehavior: "hard_avoid", style: { colorToken: "danger", icon: "cone" } },
  { id: "lighting", collectionSlug: "street-conditions", slug: "lighting", titleKey: "lighting", kind: "route_preference", routingBehavior: "soft_prefer", style: { colorToken: "brand", icon: "lamp" } },
];

const demoPoint = (
  id: string,
  layerId: string,
  lng: number,
  lat: number,
  name: string,
  trustState: TrustState,
  observedAt: string,
  attributes: Record<string, unknown> = {},
): DemoFeature => ({
  id,
  layerId,
  geometry: { type: "Point", coordinates: [lng, lat] },
  name,
  trustState,
  observedAt,
  source: "demo data",
  isDemo: true,
  attributes,
});

export const demoFeatures: DemoFeature[] = [
  // --- Access UZ -----------------------------------------------------------
  demoPoint("f-ent-1", "entrances", 69.2462, 41.3061, "Milliy kutubxona — asosiy kirish", "org_reviewed", "2026-08-12T10:00:00Z", { stepFree: true, doorWidthCm: 95, automaticDoor: true }),
  demoPoint("f-ent-2", "entrances", 69.2521, 41.3102, "Poliklinika №4 — yon kirish", "community_confirmed", "2026-08-20T09:00:00Z", { stepFree: true, doorWidthCm: 88 }),
  demoPoint("f-ent-3", "entrances", 69.2431, 41.3122, "Savdo markazi — g'arbiy kirish", "community_submitted", "2026-08-26T14:00:00Z", { stepFree: false, steps: 2 }),
  demoPoint("f-ramp-1", "ramps", 69.2492, 41.3041, "Metro yer osti o'tish — pandus", "org_reviewed", "2026-07-30T11:00:00Z", { slopePct: 7, handrails: true }),
  demoPoint("f-ramp-2", "ramps", 69.2581, 41.3082, "Universitet A binosi — lift", "org_reviewed", "2026-08-05T15:00:00Z", { elevator: true, doorWidthCm: 90 }),
  demoPoint("f-ramp-3", "ramps", 69.2402, 41.3021, "Bozor kirishidagi pandus", "needs_recheck", "2026-04-14T10:00:00Z", { slopePct: 11 }),
  demoPoint("f-at-1", "accessible-toilets", 69.2472, 41.3092, "Park ma'muriyati — moslashtirilgan hojatxona", "org_reviewed", "2026-08-09T12:00:00Z", { grabBars: true, doorWidthCm: 92 }),
  demoPoint("f-at-2", "accessible-toilets", 69.2552, 41.3051, "Vokzal kutish zali", "community_confirmed", "2026-08-17T16:00:00Z", { grabBars: true }),
  demoPoint("f-obs-1", "obstacles", 69.2501, 41.3131, "Ko'tarilgan bordyur — yordam kerak", "community_submitted", "2026-08-25T08:00:00Z", { kind: "curb", heightCm: 14 }),
  demoPoint("f-obs-2", "obstacles", 69.2442, 41.3001, "Yo'lakda doimiy avtomobil to'silishi", "needs_recheck", "2026-05-19T18:00:00Z", { kind: "blocked_sidewalk" }),

  // --- Care UZ -------------------------------------------------------------
  demoPoint("f-pt-1", "public-toilets", 69.2482, 41.3071, "Markaziy park hojatxonasi", "org_reviewed", "2026-08-14T10:00:00Z", { open: "07:00–22:00", feeSum: 1000 }),
  demoPoint("f-pt-2", "public-toilets", 69.2541, 41.3121, "Avtobus bekati yonida", "community_confirmed", "2026-08-21T13:00:00Z", { open: "24/7", feeSum: 0 }),
  demoPoint("f-pt-3", "public-toilets", 69.2411, 41.3091, "Masjid hovlisi (juma kunlari band)", "community_submitted", "2026-08-27T12:00:00Z", { open: "05:00–23:00" }),
  demoPoint("f-mh-1", "menstrual-health", 69.2512, 41.3061, "Dorixona 'Shifo' — bepul mahsulot burchagi", "org_reviewed", "2026-08-11T10:00:00Z", { freeProducts: true, open: "08:00–21:00" }),
  demoPoint("f-mh-2", "menstrual-health", 69.2461, 41.3141, "Talabalar markazi resurs xonasi", "community_confirmed", "2026-08-19T15:00:00Z", { freeProducts: true }),
  demoPoint("f-wp-1", "water-points", 69.2451, 41.3041, "Ichimlik favvorasi — park", "org_reviewed", "2026-08-08T09:00:00Z", { potable: true }),
  demoPoint("f-wp-2", "water-points", 69.2571, 41.3111, "Suv to'ldirish nuqtasi — kutubxona", "community_submitted", "2026-08-23T11:00:00Z", { potable: true }),

  // --- Street conditions (linked to routing graph conditions) --------------
  {
    id: "f-con-1",
    layerId: "construction",
    geometry: {
      type: "LineString",
      coordinates: [
        [69.249, 41.3081],
        [69.252, 41.3081],
        [69.255, 41.3081],
      ],
    },
    name: "Kanalizatsiya ta'miri — yo'lak yopiq",
    trustState: "org_reviewed",
    observedAt: "2026-08-18T09:00:00Z",
    source: "demo data",
    isDemo: true,
    attributes: { severity: 1, until: "2026-09-30" },
  },
  {
    id: "f-con-2",
    layerId: "construction",
    geometry: {
      type: "LineString",
      coordinates: [
        [69.252, 41.3081],
        [69.252, 41.3101],
      ],
    },
    name: "Bino qurilishi — panjara yo'lakni to'sgan",
    trustState: "community_confirmed",
    observedAt: "2026-08-24T17:30:00Z",
    source: "demo data",
    isDemo: true,
    attributes: { severity: 1 },
  },
  {
    id: "f-light-a",
    layerId: "lighting",
    geometry: {
      type: "LineString",
      coordinates: [
        [69.24, 41.3121],
        [69.264, 41.3121],
      ],
    },
    name: "Yoritilgan xiyobon (7-qator)",
    trustState: "org_reviewed",
    observedAt: "2026-08-10T20:00:00Z",
    source: "demo data",
    isDemo: true,
    attributes: {},
  },
  {
    id: "f-light-b",
    layerId: "lighting",
    geometry: {
      type: "LineString",
      coordinates: [
        [69.258, 41.302],
        [69.258, 41.3141],
      ],
    },
    name: "Yoritilgan ko'cha (6-ustun)",
    trustState: "community_confirmed",
    observedAt: "2026-08-22T21:00:00Z",
    source: "demo data",
    isDemo: true,
    attributes: {},
  },
];
