/**
 * Shared domain types — mirror the enums/tables in supabase/migrations/0001_init.sql.
 * Extend here; never inline domain types in components or handlers.
 */

export type OrgRole = "reviewer" | "admin";
export type CollectionVisibility = "public" | "unlisted" | "private";
export type LayerKind = "resource" | "condition" | "route_preference";
export type RoutingBehavior =
  | "hard_avoid"
  | "soft_prefer"
  | "soft_avoid"
  | "informational"
  | "destination_filter";
export type TrustState =
  | "community_submitted"
  | "org_reviewed"
  | "community_confirmed"
  | "needs_recheck";
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "published";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  verifiedAt: string | null;
}

export interface Collection {
  id: string;
  organizationId: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: CollectionVisibility;
}

export interface Layer {
  id: string;
  collectionId: string;
  slug: string;
  title: string;
  kind: LayerKind;
  routingBehavior: RoutingBehavior;
  attributeSchema: Record<string, unknown>;
  style: { colorToken?: string; icon?: string };
}

export interface MapFeatureProperties {
  layerSlug: string;
  name: string | null;
  trustState: TrustState;
  observedAt: string;
  source: string;
  isDemo: boolean;
  attributes: Record<string, unknown>;
}

export interface Submission {
  id: string;
  layerId: string;
  featureId: string | null;
  status: SubmissionStatus;
  submittedBy: string;
  observedAt: string;
  createdAt: string;
}

export interface RouteExplanation {
  summary: string;
  avoided: { layerSlug: string; count: number; freshestObservedAt: string }[];
  preferenceCoverage: {
    layerSlug: string;
    coveragePct: number;
    trustBreakdown: Partial<Record<TrustState, number>>;
  }[];
  dataFreshness: { oldestObservedAt: string | null; needsRecheckSegments: number };
}

export interface RouteOption {
  id: "preferred" | "fastest";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  durationS: number;
  distanceM: number;
  hardAvoidRelaxed?: boolean;
  explanation: RouteExplanation;
}
